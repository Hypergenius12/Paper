import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());

const ARENA_CAPACITY = 10;
const WORLD_RADIUS = 1350;
const GRID_SIZE = 140;
const CELL_SIZE = (WORLD_RADIUS * 2) / GRID_SIZE;

const PALETTE = [
  { primary: '#ff5949', secondary: '#000000' }, // Ladybug
  { primary: '#7f782d', secondary: '#5b4c20' }, // Tank
  { primary: '#33cdcf', secondary: '#218C8F' }, // Duck
  { primary: '#ffd8d9', secondary: '#feef94' }, // Cake
  { primary: '#45e07a', secondary: '#1B4B2E' }, // Cash
  { primary: '#34514d', secondary: '#263a38' }, // Sushi
  { primary: '#43423F', secondary: '#302C2D' }, // Bat
  { primary: '#f49495', secondary: '#d15352' }, // Heart
  { primary: '#D7B8F8', secondary: '#7516AD' }, // Rainbow
  { primary: '#ffa3ff', secondary: '#ff3095' }, // Nyan Cat
  { primary: '#ee4445', secondary: '#1f831f' }, // Watermelon
  { primary: '#141B1B', secondary: '#fe1230' }, // Ghost
  { primary: '#fdcc49', secondary: '#ec7700' }, // Pizza
  { primary: '#f6ee44', secondary: '#3e3b29' }, // Minion
  { primary: '#b68631', secondary: '#232323' }, // Freddy
  { primary: '#ff3f21', secondary: '#000000' }, // Spiderman
  { primary: '#8dc63f', secondary: '#336f1c' }, // Teletubby
  { primary: '#fe81f7', secondary: '#db33d2' }, // Unicorn
];

const BOT_NAMES = [
  'PaperLord', 'NeonSlice', 'Vortex', 'Slick7', 'ApexTear',
  'CyberGhost', 'PixelQueen', 'Echo', 'Turbo', 'Kraken',
  'ShadowFox', 'Blaze', 'Cosmo', 'Hyperion', 'ZeroGravity',
  'Raptor', 'Zenith', 'Phantom', 'Frostbyte', 'Onyx'
];

interface Player {
  id: string;
  name: string;
  skinId: string;
  color: string;
  secondaryColor: string;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  speed: number;
  trail: { x: number; y: number }[];
  isAlive: boolean;
  isBot: boolean;
  kills: number;
  percent: number;
  isHost?: boolean;
}

interface PartySettings {
  arenaSize: 'small' | 'normal' | 'massive';
  speedMultiplier: number;
  botCount: number;
  infiniteArena: boolean;
  zenMode: boolean;
}

interface ServerArena {
  players: Map<string, Player>;
  clients: Map<string, WebSocket>;
  gridCells: Int16Array;
  totalValidCells: number;
  playerIdxMap: Map<string, number>;
  idxPlayerMap: Map<number, string>;
  nextPlayerIdx: number;
  lastTick: number;
  settings: PartySettings;
}

interface PartyRoom {
  code: string;
  hostId: string;
  createdAt: number;
  arena: ServerArena;
}

const partyRooms = new Map<string, PartyRoom>();

function createDefaultSettings(): PartySettings {
  return {
    arenaSize: 'normal',
    speedMultiplier: 1.0,
    botCount: 10,
    infiniteArena: false,
    zenMode: false,
  };
}

function createArena(settings: PartySettings = createDefaultSettings()): ServerArena {
  const newArena: ServerArena = {
    players: new Map(),
    clients: new Map(),
    gridCells: new Int16Array(GRID_SIZE * GRID_SIZE),
    totalValidCells: 0,
    playerIdxMap: new Map(),
    idxPlayerMap: new Map(),
    nextPlayerIdx: 1,
    lastTick: Date.now(),
    settings,
  };
  initGrid(newArena);
  ensureBotBalance(newArena);
  return newArena;
}

function initGrid(ar: ServerArena) {
  ar.totalValidCells = 0;
  const center = GRID_SIZE / 2;
  const radiusCells = (WORLD_RADIUS / CELL_SIZE) - 1;

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const dx = gx + 0.5 - center;
      const dy = gy + 0.5 - center;
      const i = gy * GRID_SIZE + gx;
      if (ar.settings.infiniteArena || dx * dx + dy * dy <= radiusCells * radiusCells) {
        ar.gridCells[i] = 0;
        ar.totalValidCells++;
      } else {
        ar.gridCells[i] = -1;
      }
    }
  }
}

function worldToGrid(x: number, y: number): { gx: number; gy: number } {
  const gx = Math.floor((x + WORLD_RADIUS) / CELL_SIZE);
  const gy = Math.floor((y + WORLD_RADIUS) / CELL_SIZE);
  return { gx, gy };
}

function spawnBase(ar: ServerArena, playerId: string, cx: number, cy: number, radiusWorld: number = 75) {
  let pIdx = ar.playerIdxMap.get(playerId);
  if (!pIdx) {
    pIdx = ar.nextPlayerIdx++;
    ar.playerIdxMap.set(playerId, pIdx);
    ar.idxPlayerMap.set(pIdx, playerId);
  }

  const { gx: cgx, gy: cgy } = worldToGrid(cx, cy);
  const cellRadius = Math.ceil(radiusWorld / CELL_SIZE);

  for (let dy = -cellRadius; dy <= cellRadius; dy++) {
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      if (dx * dx + dy * dy <= cellRadius * cellRadius) {
        const gx = cgx + dx;
        const gy = cgy + dy;
        if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
          const idx = gy * GRID_SIZE + gx;
          if (ar.gridCells[idx] >= 0) {
            ar.gridCells[idx] = pIdx;
          }
        }
      }
    }
  }
}

function broadcastToArena(ar: ServerArena, data: object) {
  const json = JSON.stringify(data);
  for (const ws of ar.clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

function spawnBotSlot(ar: ServerArena): Player {
  const botId = `bot-${Math.random().toString(36).substring(2, 7)}`;
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const angle = Math.random() * Math.PI * 2;
  const dist = 300 + Math.random() * 650;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;

  const colorPair = PALETTE[Math.floor(Math.random() * PALETTE.length)];

  const bot: Player = {
    id: botId,
    name: botName,
    skinId: 'duck',
    color: colorPair.primary,
    secondaryColor: colorPair.secondary,
    x,
    y,
    angle,
    targetAngle: angle,
    speed: 155 * ar.settings.speedMultiplier,
    trail: [],
    isAlive: true,
    isBot: true,
    kills: 0,
    percent: 0,
  };

  ar.players.set(botId, bot);
  spawnBase(ar, botId, x, y);
  return bot;
}

function ensureBotBalance(ar: ServerArena) {
  const targetBots = ar.settings.botCount;
  let botCount = 0;
  for (const p of ar.players.values()) {
    if (p.isBot) botCount++;
  }

  while (botCount < targetBots) {
    spawnBotSlot(ar);
    botCount++;
  }

  if (botCount > targetBots) {
    for (const [id, p] of ar.players.entries()) {
      if (p.isBot && botCount > targetBots) {
        const pIdx = ar.playerIdxMap.get(id);
        if (pIdx) {
          for (let i = 0; i < ar.gridCells.length; i++) {
            if (ar.gridCells[i] === pIdx) ar.gridCells[i] = 0;
          }
        }
        ar.players.delete(id);
        botCount--;
      }
    }
  }
}

function getOrCreatePartyRoom(code: string, settings?: Partial<PartySettings>): PartyRoom {
  const normalized = (code || 'PUBLIC').toUpperCase().trim();
  let room = partyRooms.get(normalized);
  if (!room) {
    const fullSettings = { ...createDefaultSettings(), ...settings };
    room = {
      code: normalized,
      hostId: '',
      createdAt: Date.now(),
      arena: createArena(fullSettings),
    };
    partyRooms.set(normalized, room);
  }
  return room;
}

// Global PUBLIC Arena for standard play
const publicRoom = getOrCreatePartyRoom('PUBLIC');

function tickArena(ar: ServerArena) {
  const now = Date.now();
  const dt = Math.min(0.1, (now - ar.lastTick) / 1000);
  ar.lastTick = now;

  for (const player of ar.players.values()) {
    if (!player.isAlive) continue;

    // Turn steering
    let diff = player.targetAngle - player.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = 6.0 * dt;
    player.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

    // Move forward
    const speed = 155 * ar.settings.speedMultiplier;
    player.x += Math.cos(player.angle) * speed * dt;
    player.y += Math.sin(player.angle) * speed * dt;

    // Infinite Arena Looping
    if (ar.settings.infiniteArena) {
      if (player.x < -WORLD_RADIUS) player.x += WORLD_RADIUS * 2;
      else if (player.x > WORLD_RADIUS) player.x -= WORLD_RADIUS * 2;
      if (player.y < -WORLD_RADIUS) player.y += WORLD_RADIUS * 2;
      else if (player.y > WORLD_RADIUS) player.y -= WORLD_RADIUS * 2;
    } else {
      // Clamp or kill on boundary
      const dist = Math.hypot(player.x, player.y);
      if (dist > WORLD_RADIUS - 15) {
        player.isAlive = false;
      }
    }
  }

  // Broadcast state
  const playerList = Array.from(ar.players.values());
  broadcastToArena(ar, {
    type: 'state_snapshot',
    players: playerList.map(p => ({
      id: p.id,
      name: p.name,
      skinId: p.skinId,
      color: p.color,
      secondaryColor: p.secondaryColor,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      angle: Math.round(p.angle * 100) / 100,
      trail: p.trail,
      isAlive: p.isAlive,
      isBot: p.isBot,
      kills: p.kills,
      percent: p.percent,
    })),
  });
}

// Tick loop across all rooms
setInterval(() => {
  for (const room of partyRooms.values()) {
    tickArena(room.arena);
  }
}, 1000 / 30);

// Clean empty custom rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of partyRooms.entries()) {
    if (code !== 'PUBLIC' && room.arena.clients.size === 0 && now - room.createdAt > 300000) {
      partyRooms.delete(code);
    }
  }
}, 60000);

// REST API for Party
app.get('/api/party/:code', (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  const room = partyRooms.get(code);
  if (!room) {
    return res.json({ exists: false });
  }
  const humanCount = Array.from(room.arena.players.values()).filter(p => !p.isBot).length;
  res.json({
    exists: true,
    partyCode: room.code,
    memberCount: humanCount,
    settings: room.arena.settings,
  });
});

app.post('/api/party/create', (req, res) => {
  const custom = req.body.partyCode ? req.body.partyCode.toUpperCase().trim() : '';
  const code = custom || Math.random().toString(36).substring(2, 6).toUpperCase();
  const room = getOrCreatePartyRoom(code, req.body.settings);
  res.json({
    success: true,
    partyCode: room.code,
    settings: room.arena.settings,
  });
});

// WebSocket Handler
wss.on('connection', (ws) => {
  let boundPlayerId: string | null = null;
  let boundPartyCode: string = 'PUBLIC';

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }));
        return;
      }

      // Join party (or default public match)
      if (msg.type === 'join_game' || msg.type === 'join_party') {
        const partyCode = (msg.partyCode || 'PUBLIC').toUpperCase().trim();
        boundPartyCode = partyCode;
        const room = getOrCreatePartyRoom(partyCode, msg.partySettings);
        const ar = room.arena;

        const playerId = `player-${Math.random().toString(36).substring(2, 8)}`;
        boundPlayerId = playerId;
        ar.clients.set(playerId, ws);

        if (!room.hostId) {
          room.hostId = playerId;
        }

        const isHost = room.hostId === playerId;

        // Spawn human player
        const angle = Math.random() * Math.PI * 2;
        const dist = 300 + Math.random() * 400;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;

        const paletteItem = PALETTE.find(p => p.primary.toLowerCase() === msg.color?.toLowerCase()) || PALETTE[0];

        const humanPlayer: Player = {
          id: playerId,
          name: (msg.name || 'Player').substring(0, 15),
          skinId: msg.skinId || 'ladybug',
          color: paletteItem.primary,
          secondaryColor: paletteItem.secondary,
          x,
          y,
          angle: angle + Math.PI,
          targetAngle: angle + Math.PI,
          speed: 155 * ar.settings.speedMultiplier,
          trail: [],
          isAlive: true,
          isBot: false,
          kills: 0,
          percent: 0,
          isHost,
        };

        ar.players.set(playerId, humanPlayer);
        spawnBase(ar, playerId, x, y);

        ws.send(JSON.stringify({
          type: 'party_joined',
          partyCode: room.code,
          playerId,
          isHost,
          settings: ar.settings,
          player: humanPlayer,
        }));

        // Broadcast updated party members list
        const humanMembers = Array.from(ar.players.values())
          .filter(p => !p.isBot)
          .map(p => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost }));

        broadcastToArena(ar, {
          type: 'party_members_updated',
          partyCode: room.code,
          members: humanMembers,
          settings: ar.settings,
        });
        return;
      }

      if (msg.type === 'update_party_settings') {
        const room = partyRooms.get(boundPartyCode);
        if (room && msg.settings) {
          room.arena.settings = { ...room.arena.settings, ...msg.settings };
          ensureBotBalance(room.arena);
          broadcastToArena(room.arena, {
            type: 'party_settings_updated',
            settings: room.arena.settings,
          });
        }
        return;
      }

      if (msg.type === 'party_chat') {
        const room = partyRooms.get(boundPartyCode);
        if (room && boundPlayerId) {
          const sender = room.arena.players.get(boundPlayerId);
          broadcastToArena(room.arena, {
            type: 'party_chat_message',
            sender: sender ? sender.name : 'Player',
            text: String(msg.text || '').substring(0, 100),
            timestamp: Date.now(),
          });
        }
        return;
      }

      if (msg.type === 'player_input') {
        const room = partyRooms.get(boundPartyCode);
        if (room && boundPlayerId) {
          const player = room.arena.players.get(boundPlayerId);
          if (player && typeof msg.angle === 'number') {
            player.targetAngle = msg.angle;
          }
        }
        return;
      }
    } catch (err) {
      console.error('WS Error:', err);
    }
  });

  ws.on('close', () => {
    if (boundPlayerId) {
      const room = partyRooms.get(boundPartyCode);
      if (room) {
        room.arena.players.delete(boundPlayerId);
        room.arena.clients.delete(boundPlayerId);

        if (room.hostId === boundPlayerId) {
          const remainingHumans = Array.from(room.arena.players.values()).filter(p => !p.isBot);
          if (remainingHumans.length > 0) {
            room.hostId = remainingHumans[0].id;
            remainingHumans[0].isHost = true;
          }
        }

        const humanMembers = Array.from(room.arena.players.values())
          .filter(p => !p.isBot)
          .map(p => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost }));

        broadcastToArena(room.arena, {
          type: 'party_members_updated',
          partyCode: room.code,
          members: humanMembers,
          settings: room.arena.settings,
        });
      }
    }
  });
});

// Setup static files and Vite middleware
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3000;

  // Serve static public assets
  app.use(express.static(path.resolve(__dirname, 'public')));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Paper.io 2 Live Server running at http://0.0.0.0:${port}`);
  });
}

startServer();
