import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { GameRoom } from './game/GameRoom.js';
import { ClientMessage } from '../shared/types/network.types.js';
import { GameMode } from '../shared/types/game.types.js';
import { LeaderboardStore } from './data/LeaderboardStore.js';
import { SaveStore } from './data/SaveStore.js';
import { log } from './utils/logger.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.PORT || '8080', 10);
const leaderboardStore = new LeaderboardStore();
const saveStore = new SaveStore();

// --- Simple HTTP server to serve client files ---
const DIST_CLIENT = path.resolve('dist/client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // --- Leaderboard API routes ---
  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const mode = (url.searchParams.get('mode') || 'SINGLE') as GameMode;
    const data = leaderboardStore.getLeaderboard(mode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (url.pathname === '/api/leaderboard/history' && req.method === 'GET') {
    const mode = (url.searchParams.get('mode') || 'SINGLE') as GameMode;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const data = leaderboardStore.getHistory(mode, limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // --- Save API routes ---
  if (url.pathname === '/api/saves' && req.method === 'GET') {
    const playerName = url.searchParams.get('player');
    if (!playerName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing player parameter' }));
      return;
    }
    const saves = saveStore.listSaves(playerName);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ saves }));
    return;
  }

  if (url.pathname === '/api/saves' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk; });
    req.on('end', () => {
      try {
        const save = JSON.parse(body);
        if (!save.metadata?.id || !save.metadata?.playerName || !save.gameState) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid save format' }));
          return;
        }
        const success = saveStore.createSave(save);
        if (success) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Max saves reached (10). Delete a save first.' }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (url.pathname === '/api/saves' && req.method === 'DELETE') {
    const saveId = url.searchParams.get('id');
    const playerName = url.searchParams.get('player');
    if (!saveId || !playerName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing id or player parameter' }));
      return;
    }
    const success = saveStore.deleteSave(saveId, playerName);
    res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: success }));
    return;
  }

  if (url.pathname.startsWith('/api/saves/') && req.method === 'GET') {
    const saveId = url.pathname.split('/').pop()!;
    const save = saveStore.getSave(saveId);
    if (save) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(save));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Save not found' }));
    }
    return;
  }

  // --- Static file serving ---
  let filePath = path.join(DIST_CLIENT, url.pathname === '/' ? 'index.html' : url.pathname);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// --- WebSocket server ---
const wss = new WebSocketServer({ server: httpServer });

// Room management
let currentMultiRoom: GameRoom | null = null;

function getOrCreateRoom(gameMode: GameMode): GameRoom {
  if (gameMode === GameMode.SINGLE) {
    return new GameRoom(GameMode.SINGLE);
  }
  if (!currentMultiRoom || currentMultiRoom.isFull()) {
    currentMultiRoom = new GameRoom(GameMode.MULTI);
  }
  return currentMultiRoom;
}

wss.on('connection', (ws: WebSocket) => {
  let playerId = uuid();
  let room: GameRoom | null = null;

  log(`Connection opened: ${playerId}`);

  ws.on('message', (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'LOAD_SAVE') {
      const save = saveStore.getSave(msg.saveId);
      if (!save) {
        ws.send(JSON.stringify({ type: 'ACTION_FAILED', reason: 'Save not found' }));
        return;
      }
      try {
        room = GameRoom.fromSave(save.gameState, playerId, ws, save.metadata.playerName);
        room.onGameOver = (results) => {
          for (const r of results) leaderboardStore.addResult(r);
        };
        ws.send(JSON.stringify({
          type: 'GAME_JOINED',
          playerId,
          playerSide: Object.values(save.gameState.players)[0]?.side || 'LEFT',
          roomId: room.roomId,
        }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ACTION_FAILED', reason: 'Failed to load save' }));
      }
      return;
    }

    if (msg.type === 'JOIN_GAME') {
      const gameMode = msg.gameMode || GameMode.MULTI;
      room = getOrCreateRoom(gameMode);
      if (msg.settings) {
        room.applySettings(msg.settings);
      }
      room.onGameOver = (results) => {
        for (const r of results) leaderboardStore.addResult(r);
      };
      const result = room.addPlayer(playerId, ws, msg.playerName || 'Player');

      if (result) {
        // Use the actual playerId (may differ from generated one on reconnect)
        playerId = result.playerId;
        ws.send(JSON.stringify({
          type: 'GAME_JOINED',
          playerId: result.playerId,
          playerSide: result.side,
          roomId: room.roomId,
        }));
      } else {
        ws.send(JSON.stringify({ type: 'ACTION_FAILED', reason: 'Room is full' }));
      }
      return;
    }

    if (room) {
      room.handleMessage(playerId, msg);
    }
  });

  ws.on('close', () => {
    log(`Connection closed: ${playerId}`);
    if (room) {
      room.removePlayer(playerId);
      if (room.isEmpty() && room === currentMultiRoom) {
        currentMultiRoom = null;
      }
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  log(`Server listening on http://0.0.0.0:${PORT}`);
});
