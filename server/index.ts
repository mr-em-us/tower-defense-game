import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { GameRoom } from './game/GameRoom.js';
import { ClientMessage } from '../shared/types/network.types.js';
import { GameMode } from '../shared/types/game.types.js';
import { log } from './utils/logger.js';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.PORT || '8080', 10);

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
  let filePath = path.join(DIST_CLIENT, req.url === '/' ? 'index.html' : req.url!);

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

    if (msg.type === 'JOIN_GAME') {
      const gameMode = msg.gameMode || GameMode.MULTI;
      room = getOrCreateRoom(gameMode);
      if (msg.settings) {
        room.applySettings(msg.settings);
      }
      const result = room.addPlayer(playerId, ws);

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
