import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PlayerConn {
  id: string;
  slotIndex: number;
  name: string;
  skinId: string;
  flashlightId: string;
  ws: WebSocket;
  x: number;
  y: number;
  angle: number;
  flashlightOn: boolean;
  hp: number;
  hidden: boolean;
  alive: boolean;
  finishedRank: number | null;
  elapsedTime: number | null;
}

interface FinisherEntry {
  playerId: string;
  slotIndex: number;
  name: string;
  skinId: string;
  rank: number;
  elapsedTime: number;
}

interface GameRoom {
  code: string;
  hostId: string;
  maxPlayers: number;
  mapId: string;
  withEnemy: boolean;
  enemyTypeId: string;
  started: boolean;
  ended: boolean;
  seed: number;
  players: PlayerConn[];
  finishers: FinisherEntry[];
  matchTimer: ReturnType<typeof setTimeout> | null;
}

function getLanUrls(port: number): string[] {
  const urls: string[] = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const entries = nets[name];
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

function makeRoomCode(existing: Map<string, GameRoom>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 40; i++) {
    let code = '';
    for (let j = 0; j < 4; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existing.has(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 8999));
}

function serializePlayers(room: GameRoom) {
  return room.players.map((p) => ({
    id: p.id,
    slotIndex: p.slotIndex,
    name: p.name,
    skinId: p.skinId,
    flashlightId: p.flashlightId,
    isHost: p.id === room.hostId,
    alive: p.alive,
    finishedRank: p.finishedRank,
    elapsedTime: p.elapsedTime,
  }));
}

function serializeRoom(room: GameRoom) {
  return {
    code: room.code,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    mapId: room.mapId,
    withEnemy: room.withEnemy,
    enemyTypeId: room.enemyTypeId,
    started: room.started,
    ended: room.ended,
    players: serializePlayers(room),
  };
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: GameRoom, payload: unknown, exceptId?: string) {
  const raw = JSON.stringify(payload);
  for (const p of room.players) {
    if (exceptId && p.id === exceptId) continue;
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(raw);
    }
  }
}

function getTargetFinishers(maxPlayers: number): number {
  if (maxPlayers === 4) return 3;
  return maxPlayers;
}

function finalizeMatch(room: GameRoom, reason: string) {
  if (room.ended) return;
  room.ended = true;
  if (room.matchTimer) {
    clearTimeout(room.matchTimer);
    room.matchTimer = null;
  }

  const rankings = [...room.finishers].sort((a, b) => a.rank - b.rank);
  for (const p of room.players) {
    if (p.finishedRank === null) {
      rankings.push({
        playerId: p.id,
        slotIndex: p.slotIndex,
        name: p.name,
        skinId: p.skinId,
        rank: 0, // 0 => DNF / Eliminated
        elapsedTime: p.elapsedTime || 0,
      });
    }
  }

  broadcastRoom(room, {
    type: 'match:ended',
    reason,
    maxPlayers: room.maxPlayers,
    rankings,
  });
}

function checkAutoMatchEnd(room: GameRoom) {
  if (!room.started || room.ended) return;
  const target = getTargetFinishers(room.maxPlayers);
  if (room.finishers.length >= target) {
    finalizeMatch(room, 'top_finishers_reached');
    return;
  }

  const stillRacing = room.players.filter((p) => p.alive && p.finishedRank === null);
  if (stillRacing.length === 0) {
    finalizeMatch(room, 'all_resolved');
  }
}

export async function createGameServer(options?: { port?: number; attachVite?: boolean }) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const rooms = new Map<string, GameRoom>();
  let nextPlayerSeq = 1;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/server-info', (_req, res) => {
    const addr = server.address();
    const activePort = typeof addr === 'object' && addr ? addr.port : options?.port || 3000;
    res.json({
      port: activePort,
      lanUrls: getLanUrls(activePort),
    });
  });

  app.get('/api/rooms', (_req, res) => {
    const openRooms = [];
    for (const room of rooms.values()) {
      if (room.started || room.ended) continue;
      if (room.players.length >= room.maxPlayers) continue;
      const host = room.players.find((p) => p.id === room.hostId) || room.players[0];
      openRooms.push({
        code: room.code,
        hostName: host ? host.name : 'Host',
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        mapId: room.mapId,
        withEnemy: room.withEnemy,
      });
    }
    res.json({ rooms: openRooms });
  });

  const attachVite = options?.attachVite ?? process.env.NODE_ENV !== 'production';
  if (attachVite) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  wss.on('connection', (ws) => {
    let joinedRoom: GameRoom | null = null;
    let selfId: string | null = null;

    const cleanupConnection = () => {
      if (!joinedRoom || !selfId) return;
      const room = joinedRoom;
      const idx = room.players.findIndex((p) => p.id === selfId);
      if (idx !== -1) {
        room.players.splice(idx, 1);
      }
      if (room.players.length === 0) {
        if (room.matchTimer) clearTimeout(room.matchTimer);
        rooms.delete(room.code);
      } else {
        if (room.hostId === selfId) {
          room.hostId = room.players[0].id;
        }
        broadcastRoom(room, {
          type: 'room:state',
          room: serializeRoom(room),
        });
        checkAutoMatchEnd(room);
      }
      joinedRoom = null;
      selfId = null;
    };

    ws.on('message', (rawBuf) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(rawBuf));
      } catch {
        return;
      }

      const type = msg.type;
      if (typeof type !== 'string') return;

      if (type === 'host:create') {
        cleanupConnection();
        const maxPlayers = [2, 3, 4].includes(Number(msg.maxPlayers)) ? Number(msg.maxPlayers) : 2;
        const playerName =
          typeof msg.playerName === 'string' && msg.playerName.trim()
            ? msg.playerName.trim().slice(0, 16)
            : 'Host';
        const code = makeRoomCode(rooms);
        const playerId = 'p' + nextPlayerSeq++;

        const hostPlayer: PlayerConn = {
          id: playerId,
          slotIndex: 0,
          name: playerName,
          skinId: typeof msg.skinId === 'string' ? msg.skinId : 'explorer',
          flashlightId: typeof msg.flashlightId === 'string' ? msg.flashlightId : 'standard',
          ws,
          x: 1.5,
          y: 1.5,
          angle: 0,
          flashlightOn: true,
          hp: 100,
          hidden: false,
          alive: true,
          finishedRank: null,
          elapsedTime: null,
        };

        const room: GameRoom = {
          code,
          hostId: playerId,
          maxPlayers,
          mapId: typeof msg.mapId === 'string' ? msg.mapId : 'crypt',
          withEnemy: msg.withEnemy !== false,
          enemyTypeId: typeof msg.enemyTypeId === 'string' ? msg.enemyTypeId : 'stalker',
          started: false,
          ended: false,
          seed: 0,
          players: [hostPlayer],
          finishers: [],
          matchTimer: null,
        };

        rooms.set(code, room);
        joinedRoom = room;
        selfId = playerId;

        sendJson(ws, {
          type: 'room:created',
          roomCode: code,
          playerId,
          slotIndex: 0,
          room: serializeRoom(room),
        });
        return;
      }

      if (type === 'room:join') {
        cleanupConnection();
        const rawCode = typeof msg.roomCode === 'string' ? msg.roomCode.trim().toUpperCase() : '';
        const room = rooms.get(rawCode);
        if (!room) {
          sendJson(ws, { type: 'error', code: 'ROOM_NOT_FOUND' });
          return;
        }
        if (room.started) {
          sendJson(ws, { type: 'error', code: 'MATCH_ALREADY_STARTED' });
          return;
        }
        if (room.players.length >= room.maxPlayers) {
          sendJson(ws, { type: 'error', code: 'ROOM_FULL' });
          return;
        }

        const usedSlots = new Set(room.players.map((p) => p.slotIndex));
        let freeSlot = 0;
        while (usedSlots.has(freeSlot) && freeSlot < room.maxPlayers) freeSlot++;

        const playerId = 'p' + nextPlayerSeq++;
        const playerName =
          typeof msg.playerName === 'string' && msg.playerName.trim()
            ? msg.playerName.trim().slice(0, 16)
            : `Player ${freeSlot + 1}`;

        const conn: PlayerConn = {
          id: playerId,
          slotIndex: freeSlot,
          name: playerName,
          skinId: typeof msg.skinId === 'string' ? msg.skinId : 'explorer',
          flashlightId: typeof msg.flashlightId === 'string' ? msg.flashlightId : 'standard',
          ws,
          x: 1.5,
          y: 1.5,
          angle: 0,
          flashlightOn: true,
          hp: 100,
          hidden: false,
          alive: true,
          finishedRank: null,
          elapsedTime: null,
        };

        room.players.push(conn);
        joinedRoom = room;
        selfId = playerId;

        sendJson(ws, {
          type: 'room:joined',
          roomCode: room.code,
          playerId,
          slotIndex: freeSlot,
          room: serializeRoom(room),
        });
        broadcastRoom(room, {
          type: 'room:state',
          room: serializeRoom(room),
        });
        return;
      }

      if (!joinedRoom || !selfId) return;
      const room = joinedRoom;
      const player = room.players.find((p) => p.id === selfId);
      if (!player) return;

      if (type === 'room:update_config' && room.hostId === selfId && !room.started) {
        const reqMax = Number(msg.maxPlayers);
        if ([2, 3, 4].includes(reqMax) && reqMax >= room.players.length) {
          room.maxPlayers = reqMax;
        }
        if (typeof msg.mapId === 'string') room.mapId = msg.mapId;
        if (typeof msg.withEnemy === 'boolean') room.withEnemy = msg.withEnemy;
        if (typeof msg.enemyTypeId === 'string') room.enemyTypeId = msg.enemyTypeId;
        broadcastRoom(room, {
          type: 'room:state',
          room: serializeRoom(room),
        });
        return;
      }

      if (type === 'match:start' && room.hostId === selfId && !room.started) {
        if (room.players.length < 2) {
          sendJson(ws, { type: 'error', code: 'NEED_MORE_PLAYERS' });
          return;
        }
        room.started = true;
        room.ended = false;
        room.seed = Math.floor(Math.random() * 1e9);
        room.finishers = [];

        room.players.sort((a, b) => a.slotIndex - b.slotIndex);
        for (const p of room.players) {
          p.alive = true;
          p.finishedRank = null;
          p.elapsedTime = null;
        }

        if (room.matchTimer) clearTimeout(room.matchTimer);
        room.matchTimer = setTimeout(() => {
          finalizeMatch(room, 'timeout');
        }, 276000);

        broadcastRoom(room, {
          type: 'match:started',
          seed: room.seed,
          maxPlayers: room.maxPlayers,
          mapId: room.mapId,
          withEnemy: room.withEnemy,
          enemyTypeId: room.enemyTypeId,
          players: serializePlayers(room),
        });
        return;
      }

      if (type === 'player:update' && room.started && !room.ended) {
        if (typeof msg.x === 'number') player.x = msg.x;
        if (typeof msg.y === 'number') player.y = msg.y;
        if (typeof msg.angle === 'number') player.angle = msg.angle;
        if (typeof msg.flashlightOn === 'boolean') player.flashlightOn = msg.flashlightOn;
        if (typeof msg.hp === 'number') player.hp = msg.hp;
        if (typeof msg.hidden === 'boolean') player.hidden = msg.hidden;
        if (typeof msg.alive === 'boolean') player.alive = msg.alive;

        broadcastRoom(
          room,
          {
            type: 'player:sync',
            playerId: player.id,
            slotIndex: player.slotIndex,
            name: player.name,
            skinId: player.skinId,
            flashlightId: player.flashlightId,
            x: player.x,
            y: player.y,
            angle: player.angle,
            flashlightOn: player.flashlightOn,
            hp: player.hp,
            hidden: player.hidden,
            alive: player.alive,
          },
          player.id
        );

        if (!player.alive) {
          checkAutoMatchEnd(room);
        }
        return;
      }

      if (type === 'player:finish' && room.started && !room.ended) {
        if (player.finishedRank !== null) return;
        const rank = room.finishers.length + 1;
        const elapsed = typeof msg.elapsedTime === 'number' ? Math.round(msg.elapsedTime) : 0;
        player.finishedRank = rank;
        player.elapsedTime = elapsed;

        const entry: FinisherEntry = {
          playerId: player.id,
          slotIndex: player.slotIndex,
          name: player.name,
          skinId: player.skinId,
          rank,
          elapsedTime: elapsed,
        };
        room.finishers.push(entry);

        const targetFinishers = getTargetFinishers(room.maxPlayers);
        broadcastRoom(room, {
          type: 'player:finished',
          playerId: player.id,
          name: player.name,
          rank,
          elapsedTime: elapsed,
          finishedCount: room.finishers.length,
          targetFinishers,
        });

        checkAutoMatchEnd(room);
        return;
      }

      if (type === 'enemy:sync' && room.started && !room.ended && room.hostId === selfId) {
        broadcastRoom(
          room,
          {
            type: 'enemy:sync',
            x: typeof msg.x === 'number' ? msg.x : 1.5,
            y: typeof msg.y === 'number' ? msg.y : 1.5,
            angle: typeof msg.angle === 'number' ? msg.angle : 0,
            state: typeof msg.state === 'string' ? msg.state : 'patrol',
            animPhase: typeof msg.animPhase === 'number' ? msg.animPhase : 0,
            droppedWeb: msg.droppedWeb && typeof msg.droppedWeb === 'object' ? msg.droppedWeb : null,
          },
          player.id
        );
        return;
      }

      if (type === 'match:timeout' && room.started && !room.ended && room.hostId === selfId) {
        finalizeMatch(room, 'timeout');
        return;
      }

      if (type === 'room:return_lobby' && (room.hostId === selfId || room.ended)) {
        room.started = false;
        room.ended = false;
        room.finishers = [];
        if (room.matchTimer) {
          clearTimeout(room.matchTimer);
          room.matchTimer = null;
        }
        for (const p of room.players) {
          p.alive = true;
          p.finishedRank = null;
          p.elapsedTime = null;
        }
        broadcastRoom(room, {
          type: 'room:state',
          room: serializeRoom(room),
        });
      }
    });

    ws.on('close', cleanupConnection);
    ws.on('error', cleanupConnection);
  });

  const requestedPort = options?.port ?? Number(process.env.PORT || 3000);
  await new Promise<void>((resolve) => {
    server.listen(requestedPort, '0.0.0.0', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : requestedPort;

  return {
    app,
    server,
    wss,
    port,
    close: async () => {
      for (const room of rooms.values()) {
        if (room.matchTimer) clearTimeout(room.matchTimer);
      }
      await new Promise<void>((resolve) => {
        wss.close(() => server.close(() => resolve()));
      });
    },
  };
}

// Start directly when executed as main entry point (`tsx server.ts` or `node server.ts`)
const isDirectEntry =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectEntry) {
  createGameServer({ port: Number(process.env.PORT || 3000) }).then(({ port }) => {
    const lanUrls = getLanUrls(port);
    console.log(`The Hollow Labyrinth server listening on http://localhost:${port}`);
    if (lanUrls.length > 0) {
      console.log(`LAN / Hotspot URLs: ${lanUrls.join(', ')}`);
    }
  });
}
