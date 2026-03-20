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

const PORT = parseInt(process.env.PORT || '9090', 10);
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

  // --- AI Test endpoint (headless, no browser needed) ---
  if (url.pathname === '/api/ai-test' && req.method === 'GET') {
    const speed = parseInt(url.searchParams.get('speed') || '4', 10);
    const credits = parseInt(url.searchParams.get('credits') || '0', 10);
    const testRoom = new GameRoom(GameMode.OBSERVER);
    const dummyWs = { readyState: 0, send: () => {} } as unknown as import('ws').WebSocket;
    const dummyId = 'test-' + uuid();
    testRoom.addPlayer(dummyId, dummyWs, 'TestBot');
    // Override starting credits if specified
    if (credits > 0) {
      (testRoom as any).state.settings.startingCredits = credits;
      for (const p of Object.values((testRoom as any).state.players) as any[]) {
        p.credits = credits;
      }
    }
    // Override speed
    const dummyPlayer = Object.values((testRoom as any).state.players).find((p: any) => !p.isAI) as any;
    if (dummyPlayer) dummyPlayer.requestedSpeed = speed;
    (testRoom as any).updateGameSpeed();

    testRoom.onGameOver = (results) => {
      const aiResult = results.find(r => r.playerName !== 'TestBot');
      const humanResult = results.find(r => r.playerName === 'TestBot');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        waveReached: aiResult?.waveReached ?? 0,
        aiName: aiResult?.playerName ?? 'unknown',
        aiHealth: aiResult?.playerHealth ?? 0,
        humanHealth: humanResult?.playerHealth ?? 0,
      }));
    };
    // Timeout (configurable via ?timeout=ms, default 10 minutes)
    const timeoutMs = Math.min(parseInt(url.searchParams.get('timeout') || '600000', 10), 1800000);
    setTimeout(() => {
      if (!res.writableEnded) {
        const aiPlayer = Object.values((testRoom as any).state.players).find((p: any) => p.isAI) as any;
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'timeout', waveReached: (testRoom as any).state.waveNumber, aiHealth: aiPlayer?.health ?? 0 }));
        (testRoom as any).stopLoop();
      }
    }, timeoutMs);
    return;
  }

  // --- Grid Dump endpoint (ASCII visualization of current game state) ---
  if (url.pathname === '/api/grid-dump' && req.method === 'GET') {
    // Find any active room with an AI player
    const activeRoom = activeRooms.values().next().value as GameRoom | undefined;
    if (!activeRoom) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No active game room');
      return;
    }
    const state = (activeRoom as any).state;
    const grid = state.grid;
    const towers = state.towers || {};
    const lines: string[] = [];
    // Header
    lines.push('   0123456789012345678901234567890123456789012345678901234567890');
    lines.push('   0         1         2         3         4         5');
    for (let y = 0; y < 30; y++) {
      let row = (y < 10 ? ' ' : '') + y + ' ';
      for (let x = 0; x < 60; x++) {
        const tower = Object.values(towers).find((t: any) => t.position.x === x && t.position.y === y) as any;
        if (tower) {
          const symbols: Record<string, string> = { BASIC: '#', WALL: 'W', SNIPER: 'S', SPLASH: 'X', SLOW: '~', AA: 'A' };
          row += symbols[tower.type] || '?';
        } else if (x === 29 || x === 30) {
          row += y === 14 ? '@' : '|';
        } else {
          row += '.';
        }
      }
      lines.push(row);
    }
    lines.push('');
    lines.push(`Legend: # BASIC  W WALL  A AA  S SNIPER  X SPLASH  ~ SLOW  @ spawn  | center`);
    const towerCounts: Record<string, number> = {};
    for (const t of Object.values(towers) as any[]) {
      towerCounts[t.type] = (towerCounts[t.type] || 0) + 1;
    }
    lines.push(`Wave: ${state.waveNumber} | Phase: ${state.phase} | Towers: ${JSON.stringify(towerCounts)}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(lines.join('\n'));
    return;
  }

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

  // Prevent path traversal — resolved path must be within DIST_CLIENT
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(DIST_CLIENT))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

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

// Room management — track active rooms for grid dump API
const activeRooms = new Set<GameRoom>();
let currentMultiRoom: GameRoom | null = null;

function getOrCreateRoom(gameMode: GameMode): GameRoom {
  if (gameMode === GameMode.SINGLE) {
    return new GameRoom(GameMode.SINGLE);
  }
  if (gameMode === GameMode.OBSERVER) {
    return new GameRoom(GameMode.OBSERVER);
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
      activeRooms.add(room);
      if (msg.settings) {
        room.applySettings(msg.settings);
      }
      room.onGameOver = (results) => {
        for (const r of results) leaderboardStore.addResult(r);
        activeRooms.delete(room!);
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
