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
  botState?: 'expanding' | 'returning';
  botTimer?: number;
  botTurnDir?: number;
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
}

const arena: ServerArena = {
  players: new Map(),
  clients: new Map(),
  gridCells: new Int16Array(GRID_SIZE * GRID_SIZE),
  totalValidCells: 0,
  playerIdxMap: new Map(),
  idxPlayerMap: new Map(),
  nextPlayerIdx: 1,
  lastTick: Date.now(),
};

function initGrid() {
  arena.totalValidCells = 0;
  const center = GRID_SIZE / 2;
  const radiusCells = (WORLD_RADIUS / CELL_SIZE) - 1;

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const dx = gx + 0.5 - center;
      const dy = gy + 0.5 - center;
      const i = gy * GRID_SIZE + gx;
      if (dx * dx + dy * dy <= radiusCells * radiusCells) {
        arena.gridCells[i] = 0;
        arena.totalValidCells++;
      } else {
        arena.gridCells[i] = -1;
      }
    }
  }
}

function worldToGrid(x: number, y: number): { gx: number; gy: number } {
  const gx = Math.floor((x + WORLD_RADIUS) / CELL_SIZE);
  const gy = Math.floor((y + WORLD_RADIUS) / CELL_SIZE);
  return { gx, gy };
}

function gridToWorld(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx + 0.5) * CELL_SIZE - WORLD_RADIUS,
    y: (gy + 0.5) * CELL_SIZE - WORLD_RADIUS,
  };
}

function spawnBase(playerId: string, cx: number, cy: number, radiusWorld: number = 75) {
  let pIdx = arena.playerIdxMap.get(playerId);
  if (!pIdx) {
    pIdx = arena.nextPlayerIdx++;
    arena.playerIdxMap.set(playerId, pIdx);
    arena.idxPlayerMap.set(pIdx, playerId);
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
          if (arena.gridCells[idx] >= 0) {
            arena.gridCells[idx] = pIdx;
          }
        }
      }
    }
  }
}

function broadcast(data: object) {
  const json = JSON.stringify(data);
  for (const ws of arena.clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

function sendTo(playerId: string, data: object) {
  const ws = arena.clients.get(playerId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Spawns or respawns a bot to maintain capacity
function spawnBotSlot(): Player {
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
    skinId: 'ladybug',
    color: colorPair.primary,
    secondaryColor: colorPair.secondary,
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    targetAngle: Math.random() * Math.PI * 2,
    speed: 155,
    trail: [],
    isAlive: true,
    isBot: true,
    kills: 0,
    percent: 0,
    botState: 'expanding',
    botTimer: 0,
    botTurnDir: Math.random() > 0.5 ? 1 : -1,
  };

  arena.players.set(botId, bot);
  spawnBase(botId, x, y);
  return bot;
}

// Ensures arena capacity is filled with bots when real players are fewer than ARENA_CAPACITY
function ensureBotBalance() {
  const currentTotal = arena.players.size;
  if (currentTotal < ARENA_CAPACITY) {
    for (let i = currentTotal; i < ARENA_CAPACITY; i++) {
      spawnBotSlot();
    }
  }
}

function eliminatePlayer(victim: Player, killer?: Player, reason?: string) {
  victim.isAlive = false;
  victim.trail = [];

  const pIdx = arena.playerIdxMap.get(victim.id);
  if (pIdx) {
    for (let i = 0; i < arena.gridCells.length; i++) {
      if (arena.gridCells[i] === pIdx) {
        arena.gridCells[i] = 0;
      }
    }
  }

  broadcast({
    type: 'player_eliminated',
    victimId: victim.id,
    victimName: victim.name,
    killerId: killer?.id,
    killerName: killer?.name,
    reason,
  });

  // If a bot died, respawn after 3.5 seconds unless real players take the slot
  if (victim.isBot) {
    setTimeout(() => {
      arena.players.delete(victim.id);
      ensureBotBalance();
    }, 3500);
  }
}

function completeCapture(player: Player) {
  const pIdx = arena.playerIdxMap.get(player.id) || 1;
  const polygon = [...player.trail, { x: player.x, y: player.y }];

  let minX = polygon[0].x, maxX = polygon[0].x, minY = polygon[0].y, maxY = polygon[0].y;
  for (const pt of polygon) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const minGrid = worldToGrid(minX - CELL_SIZE, minY - CELL_SIZE);
  const maxGrid = worldToGrid(maxX + CELL_SIZE, maxY + CELL_SIZE);

  for (let gy = Math.max(0, minGrid.gy); gy <= Math.min(GRID_SIZE - 1, maxGrid.gy); gy++) {
    for (let gx = Math.max(0, minGrid.gx); gx <= Math.min(GRID_SIZE - 1, maxGrid.gx); gx++) {
      const idx = gy * GRID_SIZE + gx;
      if (arena.gridCells[idx] >= 0) {
        const wpt = gridToWorld(gx, gy);
        if (isInsidePoly(wpt.x, wpt.y, polygon)) {
          arena.gridCells[idx] = pIdx;
        }
      }
    }
  }

  player.trail = [];
  broadcast({
    type: 'polygon_captured',
    playerId: player.id,
    polygon,
  });
}

function isInsidePoly(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function findClosestBase(playerId: string, fx: number, fy: number): { x: number; y: number } | null {
  const pIdx = arena.playerIdxMap.get(playerId);
  if (!pIdx) return null;
  const { gx: sgx, gy: sgy } = worldToGrid(fx, fy);
  for (let r = 1; r <= 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const gx = sgx + dx;
        const gy = sgy + dy;
        if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
          if (arena.gridCells[gy * GRID_SIZE + gx] === pIdx) {
            return gridToWorld(gx, gy);
          }
        }
      }
    }
  }
  return null;
}

// 30 TPS Arena Tick Loop
function arenaTick() {
  const now = Date.now();
  const dt = Math.min((now - arena.lastTick) / 1000, 0.1);
  arena.lastTick = now;

  const playerList = Array.from(arena.players.values());

  for (const player of playerList) {
    if (!player.isAlive) continue;

    // Bot AI update
    if (player.isBot) {
      player.botTimer = (player.botTimer || 0) + dt;
      const distCenter = Math.hypot(player.x, player.y);

      if (distCenter > WORLD_RADIUS - 80) {
        player.targetAngle = Math.atan2(-player.y, -player.x);
      } else {
        const trailLen = player.trail.length * 6;
        if (player.trail.length === 0) {
          player.botState = 'expanding';
          if ((player.botTimer || 0) > 2) {
            player.botTurnDir = Math.random() > 0.5 ? 1 : -1;
            player.botTimer = 0;
          }
        } else if (trailLen > 240) {
          player.botState = 'returning';
        }

        if (player.botState === 'returning') {
          const home = findClosestBase(player.id, player.x, player.y);
          if (home) {
            player.targetAngle = Math.atan2(home.y - player.y, home.x - player.x);
          } else {
            player.targetAngle = player.angle + (player.botTurnDir || 1) * 2 * dt;
          }
        } else {
          // Arc loop
          player.targetAngle = player.angle + (player.botTurnDir || 1) * 0.9 * dt;
        }
      }
    }

    // Smooth turn towards targetAngle
    let diff = (player.targetAngle - player.angle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = 6.0 * dt;
    if (Math.abs(diff) <= maxTurn) {
      player.angle = player.targetAngle;
    } else {
      player.angle += Math.sign(diff) * maxTurn;
    }

    // Move forward
    const vx = Math.cos(player.angle) * player.speed;
    const vy = Math.sin(player.angle) * player.speed;
    let nextX = player.x + vx * dt;
    let nextY = player.y + vy * dt;

    // Arena boundary clamp
    const distCenter = Math.hypot(nextX, nextY);
    const maxDist = WORLD_RADIUS - 16;
    if (distCenter > maxDist) {
      const bAngle = Math.atan2(nextY, nextX);
      nextX = Math.cos(bAngle) * maxDist;
      nextY = Math.sin(bAngle) * maxDist;
    }

    player.x = nextX;
    player.y = nextY;

    // Territory check
    const { gx, gy } = worldToGrid(player.x, player.y);
    const cellIdx = gy * GRID_SIZE + gx;
    const currentOwnerIdx = (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) ? arena.gridCells[cellIdx] : -1;
    const playerIdx = arena.playerIdxMap.get(player.id) || -1;

    const isInsideOwn = currentOwnerIdx === playerIdx;

    if (isInsideOwn) {
      if (player.trail.length > 2) {
        completeCapture(player);
      }
    } else {
      const lastPt = player.trail[player.trail.length - 1];
      if (!lastPt || Math.hypot(player.x - lastPt.x, player.y - lastPt.y) >= 8) {
        player.trail.push({ x: player.x, y: player.y });
      }
    }
  }

  // Trail slice collisions
  for (const killer of playerList) {
    if (!killer.isAlive) continue;

    for (const victim of playerList) {
      if (!victim.isAlive || victim.trail.length < 2) continue;

      if (victim.id === killer.id) {
        if (killer.trail.length > 10) {
          for (let i = 0; i < killer.trail.length - 8; i++) {
            const p1 = killer.trail[i];
            const p2 = killer.trail[i + 1];
            if (distToSeg({ x: killer.x, y: killer.y }, p1, p2) < 18) {
              eliminatePlayer(killer, undefined, 'Bit own trail');
              break;
            }
          }
        }
      } else {
        for (let i = 0; i < victim.trail.length - 1; i++) {
          const p1 = victim.trail[i];
          const p2 = victim.trail[i + 1];
          if (distToSeg({ x: killer.x, y: killer.y }, p1, p2) < 18) {
            killer.kills++;
            eliminatePlayer(victim, killer, `Eliminated by ${killer.name}`);
            break;
          }
        }
      }
    }
  }

  // Calculate percentages
  const counts = new Map<number, number>();
  for (let i = 0; i < arena.gridCells.length; i++) {
    const val = arena.gridCells[i];
    if (val > 0) {
      counts.set(val, (counts.get(val) || 0) + 1);
    }
  }

  for (const player of playerList) {
    const pIdx = arena.playerIdxMap.get(player.id);
    if (pIdx) {
      const c = counts.get(pIdx) || 0;
      player.percent = Math.round(((c / Math.max(1, arena.totalValidCells)) * 100) * 10) / 10;
    }
  }

  // Broadcast state snapshot to all connected clients
  broadcast({
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

// Initialize Arena
initGrid();
ensureBotBalance();
setInterval(arenaTick, 1000 / 30);

// WebSocket Handler
wss.on('connection', (ws) => {
  let boundPlayerId: string | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }));
        return;
      }

      // Real person joins the game: REPLACES A BOT!
      if (msg.type === 'join_game') {
        const playerId = `player-${Math.random().toString(36).substring(2, 8)}`;
        boundPlayerId = playerId;
        arena.clients.set(playerId, ws);

        // Find a bot to replace
        let replacedBotId: string | null = null;
        for (const [id, p] of arena.players.entries()) {
          if (p.isBot) {
            replacedBotId = id;
            break;
          }
        }

        if (replacedBotId) {
          // Remove the bot from the arena to make room for the human
          const bot = arena.players.get(replacedBotId)!;
          const pIdx = arena.playerIdxMap.get(bot.id);
          if (pIdx) {
            for (let i = 0; i < arena.gridCells.length; i++) {
              if (arena.gridCells[i] === pIdx) arena.gridCells[i] = 0;
            }
          }
          arena.players.delete(replacedBotId);
        }

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
          speed: 155,
          trail: [],
          isAlive: true,
          isBot: false,
          kills: 0,
          percent: 0,
        };

        arena.players.set(playerId, humanPlayer);
        spawnBase(playerId, x, y);

        ws.send(JSON.stringify({
          type: 'joined_game',
          playerId,
          player: humanPlayer,
        }));
        return;
      }

      if (msg.type === 'player_input') {
        if (boundPlayerId) {
          const player = arena.players.get(boundPlayerId);
          if (player && typeof msg.angle === 'number') {
            player.targetAngle = msg.angle;
          }
        }
        return;
      }

      if (msg.type === 'respawn') {
        if (boundPlayerId) {
          const player = arena.players.get(boundPlayerId);
          if (player) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 300 + Math.random() * 400;
            player.x = Math.cos(angle) * dist;
            player.y = Math.sin(angle) * dist;
            player.angle = angle + Math.PI;
            player.targetAngle = angle + Math.PI;
            player.trail = [];
            player.isAlive = true;
            player.kills = 0;
            player.percent = 0;
            spawnBase(player.id, player.x, player.y);
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
      const player = arena.players.get(boundPlayerId);
      if (player) {
        // Clear human's territory
        const pIdx = arena.playerIdxMap.get(player.id);
        if (pIdx) {
          for (let i = 0; i < arena.gridCells.length; i++) {
            if (arena.gridCells[i] === pIdx) arena.gridCells[i] = 0;
          }
        }
        arena.players.delete(boundPlayerId);
      }
      arena.clients.delete(boundPlayerId);

      // A bot immediately fills the vacant slot!
      ensureBotBalance();
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
