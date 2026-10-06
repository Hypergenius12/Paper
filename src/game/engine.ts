import {
  PlayerState,
  Vector2D,
  GameSettings,
  KillEvent,
} from './types';
import {
  TerritoryGrid,
  WORLD_RADIUS,
  HEAD_RADIUS,
  TRAIL_WIDTH,
  distToSegment,
} from './grid';
import { SKINS, getSkinById, drawPlayerAvatar } from './skins';
import { BotController, BOT_NAMES } from './botAI';
import { ParticleSystem } from './particles';
import { sounds } from './audio';

export interface GameEngineCallbacks {
  onScoreUpdate: (percent: number, kills: number, rank: number, totalPlayers: number) => void;
  onLeaderboardUpdate: (leaderboard: { id: string; name: string; percent: number; kills: number; color: string; isPlayer: boolean; hasCrown: boolean }[]) => void;
  onKillEvent: (event: KillEvent) => void;
  onGameOver: (stats: { percent: number; kills: number; rank: number; timeAlive: number; killerName?: string; won: boolean }) => void;
}

export class GameEngine {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public settings: GameSettings;
  public callbacks: GameEngineCallbacks;

  public grid: TerritoryGrid;
  public botController: BotController;
  public particles: ParticleSystem;

  public players: Map<string, PlayerState> = new Map();
  public localPlayerId: string = 'player-local';

  // Camera
  public camera: Vector2D = { x: 0, y: 0 };
  public zoom: number = 1.0;
  public targetZoom: number = 1.0;

  // Screen shake
  public shakeDuration: number = 0;
  public shakeIntensity: number = 0;

  // Loop control
  public isRunning: boolean = false;
  public isPaused: boolean = false;
  public lastFrameTime: number = 0;
  public animFrameId: number | null = null;

  // Input
  public inputAngle: number = 0;
  public pointerScreenPos: Vector2D = { x: 0, y: 0 };
  public isInputActive: boolean = false;

  // Offscreen Territory Surface
  private territoryCanvas: HTMLCanvasElement;
  private territoryCtx: CanvasRenderingContext2D;
  private territoryScale: number = 0.8; // 2700 * 0.8 = 2160px crisp buffer

  // Stats
  public gameStartTime: number = 0;
  public bestPercent: number = 0;

  constructor(
    canvas: HTMLCanvasElement,
    settings: GameSettings,
    callbacks: GameEngineCallbacks
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.settings = settings;
    this.callbacks = callbacks;

    this.grid = new TerritoryGrid();
    this.botController = new BotController();
    this.particles = new ParticleSystem();

    // Territory offscreen buffer
    this.territoryCanvas = document.createElement('canvas');
    const bufSize = Math.round((WORLD_RADIUS * 2) * this.territoryScale);
    this.territoryCanvas.width = bufSize;
    this.territoryCanvas.height = bufSize;
    this.territoryCtx = this.territoryCanvas.getContext('2d')!;

    sounds.setEnabled(settings.soundEnabled);
    sounds.setVolume(settings.soundVolume);
  }

  public initGame(playerName: string, skinId: string) {
    this.players.clear();
    this.grid.reset();
    this.particles.clear();
    this.territoryCtx.clearRect(0, 0, this.territoryCanvas.width, this.territoryCanvas.height);

    const skin = getSkinById(skinId);
    this.gameStartTime = performance.now();

    // Spawn Local Player at random position within safe inner circle
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = 200 + Math.random() * 350;
    const pX = Math.cos(spawnAngle) * spawnDist;
    const pY = Math.sin(spawnAngle) * spawnDist;

    const localPlayer: PlayerState = {
      id: this.localPlayerId,
      name: playerName.trim() || 'You',
      color: skin.primaryColor,
      secondaryColor: skin.secondaryColor,
      trailColor: skin.trailColor,
      accentColor: skin.accentColor,
      skinId: skin.id,
      x: pX,
      y: pY,
      prevX: pX,
      prevY: pY,
      angle: spawnAngle + Math.PI,
      targetAngle: spawnAngle + Math.PI,
      speed: 155,
      trail: [],
      isAlive: true,
      isBot: false,
      kills: 0,
      percent: 0,
      rank: 1,
      score: 0,
      isInsideOwnTerritory: true,
      timeAlive: 0,
    };

    this.players.set(this.localPlayerId, localPlayer);
    const initialCells = this.grid.spawnInitialBase(this.localPlayerId, pX, pY, 75);
    this.renderBaseToTerritoryBuffer(localPlayer, initialCells);

    // Spawn Bots
    const availableSkins = SKINS.filter(s => s.id !== skinId);
    const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);

    for (let i = 0; i < this.settings.botCount; i++) {
      const botId = `bot-${i + 1}`;
      const botSkin = availableSkins[i % availableSkins.length];
      const botName = shuffledNames[i % shuffledNames.length];

      // Spawn distributed in circle
      const angle = (i / this.settings.botCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 400 + Math.random() * 600;
      const bx = Math.cos(angle) * dist;
      const by = Math.sin(angle) * dist;

      const bot: PlayerState = {
        id: botId,
        name: botName,
        color: botSkin.primaryColor,
        secondaryColor: botSkin.secondaryColor,
        trailColor: botSkin.trailColor,
        accentColor: botSkin.accentColor,
        skinId: botSkin.id,
        x: bx,
        y: by,
        prevX: bx,
        prevY: by,
        angle: Math.random() * Math.PI * 2,
        targetAngle: Math.random() * Math.PI * 2,
        speed: 150 + Math.random() * 10,
        trail: [],
        isAlive: true,
        isBot: true,
        kills: 0,
        percent: 0,
        rank: i + 2,
        score: 0,
        isInsideOwnTerritory: true,
        timeAlive: 0,
      };

      this.players.set(botId, bot);
      const botCells = this.grid.spawnInitialBase(botId, bx, by, 75);
      this.renderBaseToTerritoryBuffer(bot, botCells);
    }

    // Camera initial position
    this.camera.x = pX;
    this.camera.y = pY;
    this.zoom = 1.0;
    this.targetZoom = 1.0;

    this.updateLeaderboard();
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.animFrameId = requestAnimationFrame(this.gameLoop);
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    if (!this.isRunning) {
      this.start();
    } else {
      this.isPaused = false;
      this.lastFrameTime = performance.now();
    }
  }

  public setInputAngle(angle: number) {
    this.inputAngle = angle;
    this.isInputActive = true;
    const player = this.players.get(this.localPlayerId);
    if (player && player.isAlive) {
      player.targetAngle = angle;
    }
  }

  public updatePointerPos(screenX: number, screenY: number) {
    this.pointerScreenPos = { x: screenX, y: screenY };
    const centerScreenX = this.canvas.width / 2;
    const centerScreenY = this.canvas.height / 2;
    const dx = screenX - centerScreenX;
    const dy = screenY - centerScreenY;

    if (Math.hypot(dx, dy) > 15) {
      const angle = Math.atan2(dy, dx);
      this.setInputAngle(angle);
    }
  }

  private gameLoop = (timestamp: number) => {
    if (!this.isRunning) return;

    const dt = Math.min((timestamp - this.lastFrameTime) / 1000, 0.1); // clamp to 100ms max
    this.lastFrameTime = timestamp;

    if (!this.isPaused) {
      this.update(dt);
    }

    this.render();

    this.animFrameId = requestAnimationFrame(this.gameLoop);
  };

  private update(dt: number) {
    const playerList = Array.from(this.players.values());
    const localPlayer = this.players.get(this.localPlayerId);

    // 1. Update Player Movement & Steering
    for (const player of playerList) {
      if (!player.isAlive) continue;

      player.timeAlive += dt;
      player.prevX = player.x;
      player.prevY = player.y;

      // Handle AI steering for bots
      if (player.isBot) {
        player.angle = this.botController.updateBot(
          player,
          playerList,
          this.grid,
          this.settings.botDifficulty,
          dt
        );
      } else {
        // Player smooth steering
        let diff = (player.targetAngle - player.angle) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;

        const maxTurn = 6.2 * dt; // turn speed
        if (Math.abs(diff) <= maxTurn) {
          player.angle = player.targetAngle;
        } else {
          player.angle += Math.sign(diff) * maxTurn;
        }
      }

      // Step forward
      const vx = Math.cos(player.angle) * player.speed;
      const vy = Math.sin(player.angle) * player.speed;
      let nextX = player.x + vx * dt;
      let nextY = player.y + vy * dt;

      // Arena boundary collision: slide along boundary
      const distFromCenter = Math.hypot(nextX, nextY);
      const maxAllowedDist = WORLD_RADIUS - HEAD_RADIUS - 6;

      if (distFromCenter > maxAllowedDist) {
        // Project position back to border
        const borderAngle = Math.atan2(nextY, nextX);
        nextX = Math.cos(borderAngle) * maxAllowedDist;
        nextY = Math.sin(borderAngle) * maxAllowedDist;
      }

      player.x = nextX;
      player.y = nextY;

      // Territory check
      const currentOwner = this.grid.getOwnerAtWorld(player.x, player.y);
      const isInsideOwn = currentOwner === player.id;

      if (isInsideOwn) {
        if (!player.isInsideOwnTerritory && player.trail.length > 2) {
          // Player returned home! Complete territory conquest!
          this.completeCapture(player);
        }
        player.isInsideOwnTerritory = true;
      } else {
        player.isInsideOwnTerritory = false;
        // Append trail point every ~6 pixels
        const lastPt = player.trail[player.trail.length - 1];
        if (!lastPt || Math.hypot(player.x - lastPt.x, player.y - lastPt.y) >= 6) {
          player.trail.push({ x: player.x, y: player.y });
        }
      }
    }

    // 2. Collision Checks (Trail Slicing & Self-Bite)
    this.checkCollisions(playerList);

    // 3. Update Camera to follow local player
    if (localPlayer && localPlayer.isAlive) {
      this.camera.x += (localPlayer.x - this.camera.x) * (6.0 * dt);
      this.camera.y += (localPlayer.y - this.camera.y) * (6.0 * dt);

      // Dynamic zoom based on territory % (larger territory slightly zooms out)
      this.targetZoom = Math.max(0.72, 1.0 - (localPlayer.percent / 100) * 0.35);
      this.zoom += (this.targetZoom - this.zoom) * (2.5 * dt);
    }

    // 4. Update Screen Shake
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      if (this.shakeDuration <= 0) {
        this.shakeIntensity = 0;
      }
    }

    // 5. Update Particles
    this.particles.update(dt);

    // 6. Periodically update leaderboards and percent
    this.updateLeaderboard();
  }

  private completeCapture(player: PlayerState) {
    if (player.trail.length < 3) {
      player.trail = [];
      return;
    }

    const closedPolygon = [...player.trail, { x: player.x, y: player.y }];
    const { capturedCount, points } = this.grid.capturePolygon(player.id, closedPolygon, player.color);

    // Render capture polygon directly onto offscreen canvas
    this.renderPolygonToTerritoryBuffer(player, closedPolygon);

    // Sparkles & audio
    if (player.id === this.localPlayerId) {
      const pctApprox = (capturedCount / this.grid.totalValidCells) * 100;
      sounds.playCapture(pctApprox);

      if (pctApprox > 1.2) {
        this.particles.addFloatingText(`+${pctApprox.toFixed(1)}%`, player.x, player.y - 25, '#ffffff', 20);
      }
    }

    this.particles.spawnCaptureSparkles(points, player.color, Math.min(24, Math.max(6, Math.floor(capturedCount / 4))));
    player.trail = [];

    // Respawn bots if any bot lost 100% of its land
    this.checkEliminatedEmptyPlayers();
  }

  private checkCollisions(players: PlayerState[]) {
    for (const killer of players) {
      if (!killer.isAlive) continue;

      const headPos: Vector2D = { x: killer.x, y: killer.y };

      // A) Self-bite collision
      if (killer.trail.length > 10) {
        // Exclude the most recent 8 points right behind the head
        for (let i = 0; i < killer.trail.length - 8; i++) {
          const segDist = distToSegment(headPos, killer.trail[i], killer.trail[i + 1]);
          if (segDist < HEAD_RADIUS + TRAIL_WIDTH * 0.4) {
            this.eliminatePlayer(killer, undefined, 'Bit your own trail!');
            break;
          }
        }
      }

      if (!killer.isAlive) continue;

      // B) Cut other players' trails
      for (const victim of players) {
        if (victim.id === killer.id || !victim.isAlive || victim.trail.length < 2) continue;

        for (let i = 0; i < victim.trail.length - 1; i++) {
          const segDist = distToSegment(headPos, victim.trail[i], victim.trail[i + 1]);
          if (segDist < HEAD_RADIUS + TRAIL_WIDTH * 0.45) {
            // SLICE HIT!
            killer.kills++;
            sounds.playSlice();

            if (killer.id === this.localPlayerId) {
              sounds.playKill();
              this.triggerScreenShake(0.25, 8);
              this.particles.addFloatingText('+1 KILL', killer.x, killer.y - 30, '#ffd100', 22);
            }

            this.eliminatePlayer(victim, killer, `Sliced by ${killer.name}`);
            break;
          }
        }
      }
    }
  }

  private eliminatePlayer(victim: PlayerState, killer?: PlayerState, reason?: string) {
    victim.isAlive = false;
    victim.deathReason = reason;
    victim.killedBy = killer?.name;

    // Visual burst
    this.particles.spawnKillBurst(victim.x, victim.y, victim.color, 45);

    // Audio
    if (victim.id === this.localPlayerId) {
      sounds.playDeath();
      this.triggerScreenShake(0.4, 14);
    }

    // Erase victim's territory from grid & offscreen buffer
    this.grid.clearPlayerTerritory(victim.id);
    this.redrawTerritoryBuffer();

    // Kill Event broadcast
    const event: KillEvent = {
      id: Math.random().toString(36).substring(2, 9),
      killerName: killer ? killer.name : victim.name,
      killerColor: killer ? killer.color : victim.color,
      victimName: victim.name,
      victimColor: victim.color,
      timestamp: Date.now(),
    };
    this.callbacks.onKillEvent(event);

    // If local player died: trigger game over modal
    if (victim.id === this.localPlayerId) {
      setTimeout(() => {
        this.callbacks.onGameOver({
          percent: victim.percent,
          kills: victim.kills,
          rank: victim.rank,
          timeAlive: Math.floor(victim.timeAlive),
          killerName: killer?.name,
          won: false,
        });
      }, 700);
    }

    // Respawn bots automatically after 4 seconds to keep the game bustling
    if (victim.isBot) {
      setTimeout(() => {
        if (this.isRunning) {
          this.respawnBot(victim);
        }
      }, 3500);
    }
  }

  private checkEliminatedEmptyPlayers() {
    const percentages = this.grid.calculatePercentages();
    for (const player of this.players.values()) {
      if (player.isAlive && (!percentages.has(player.id) || percentages.get(player.id)! <= 0.1)) {
        // Player has zero territory left
        if (player.trail.length === 0) {
          this.eliminatePlayer(player, undefined, 'Territory wiped out!');
        }
      }
    }
  }

  private respawnBot(bot: PlayerState) {
    // Find open location away from other players
    const angle = Math.random() * Math.PI * 2;
    const dist = 300 + Math.random() * 700;
    const bx = Math.cos(angle) * dist;
    const by = Math.sin(angle) * dist;

    bot.x = bx;
    bot.y = by;
    bot.prevX = bx;
    bot.prevY = by;
    bot.angle = Math.random() * Math.PI * 2;
    bot.trail = [];
    bot.isAlive = true;
    bot.isInsideOwnTerritory = true;

    const botCells = this.grid.spawnInitialBase(bot.id, bx, by, 75);
    this.renderBaseToTerritoryBuffer(bot, botCells);
  }

  private updateLeaderboard() {
    const percentages = this.grid.calculatePercentages();
    const sorted = Array.from(this.players.values()).sort((a, b) => {
      const pctA = percentages.get(a.id) || 0;
      const pctB = percentages.get(b.id) || 0;
      return pctB - pctA;
    });

    let currentRank = 1;
    const leaderboardData = [];
    let hadCrownBefore = false;

    for (const p of sorted) {
      const pct = percentages.get(p.id) || 0;
      p.percent = pct;
      p.rank = currentRank;
      p.hasCrown = currentRank === 1 && p.isAlive && pct > 0;

      if (p.id === this.localPlayerId) {
        if (p.hasCrown && !hadCrownBefore) {
          sounds.playCrown();
          hadCrownBefore = true;
        }
        if (pct > this.bestPercent) {
          this.bestPercent = pct;
        }
        this.callbacks.onScoreUpdate(pct, p.kills, p.rank, this.players.size);

        // Win condition: 100% conquest
        if (pct >= 99.5 && p.isAlive) {
          this.callbacks.onGameOver({
            percent: 100,
            kills: p.kills,
            rank: 1,
            timeAlive: Math.floor(p.timeAlive),
            won: true,
          });
          this.stop();
        }
      }

      leaderboardData.push({
        id: p.id,
        name: p.name,
        percent: pct,
        kills: p.kills,
        color: p.color,
        isPlayer: p.id === this.localPlayerId,
        hasCrown: Boolean(p.hasCrown),
      });

      currentRank++;
    }

    this.callbacks.onLeaderboardUpdate(leaderboardData.slice(0, 10));
  }

  public triggerScreenShake(duration: number = 0.2, intensity: number = 6) {
    if (!this.settings.screenShake) return;
    this.shakeDuration = duration;
    this.shakeIntensity = intensity;
  }

  // --- Offscreen Territory Buffer Rendering ---

  private worldToBuffer(x: number, y: number): { bx: number; by: number } {
    const bx = (x + WORLD_RADIUS) * this.territoryScale;
    const by = (y + WORLD_RADIUS) * this.territoryScale;
    return { bx, by };
  }

  private renderBaseToTerritoryBuffer(player: PlayerState, cells: Vector2D[]) {
    this.territoryCtx.save();
    this.territoryCtx.fillStyle = player.color;
    for (const cell of cells) {
      const { bx, by } = this.worldToBuffer(cell.x, cell.y);
      const cellSizeBuf = (WORLD_RADIUS * 2 / this.grid.width) * this.territoryScale + 1;
      this.territoryCtx.fillRect(bx - cellSizeBuf / 2, by - cellSizeBuf / 2, cellSizeBuf, cellSizeBuf);
    }
    this.territoryCtx.restore();
  }

  private renderPolygonToTerritoryBuffer(player: PlayerState, polygon: Vector2D[]) {
    if (polygon.length < 3) return;
    this.territoryCtx.save();
    this.territoryCtx.fillStyle = player.color;
    this.territoryCtx.lineJoin = 'round';
    this.territoryCtx.lineCap = 'round';
    this.territoryCtx.beginPath();

    const first = this.worldToBuffer(polygon[0].x, polygon[0].y);
    this.territoryCtx.moveTo(first.bx, first.by);

    for (let i = 1; i < polygon.length; i++) {
      const pt = this.worldToBuffer(polygon[i].x, polygon[i].y);
      this.territoryCtx.lineTo(pt.bx, pt.by);
    }
    this.territoryCtx.closePath();
    this.territoryCtx.fill();
    this.territoryCtx.restore();
  }

  private redrawTerritoryBuffer() {
    this.territoryCtx.clearRect(0, 0, this.territoryCanvas.width, this.territoryCanvas.height);
    const cellSizeBuf = (WORLD_RADIUS * 2 / this.grid.width) * this.territoryScale + 1;

    for (let gy = 0; gy < this.grid.height; gy++) {
      for (let gx = 0; gx < this.grid.width; gx++) {
        const val = this.grid.getCell(gx, gy);
        if (val > 0) {
          const playerId = this.grid.getPlayerId(val);
          const player = playerId ? this.players.get(playerId) : null;
          if (player && player.isAlive) {
            const worldPt = this.grid.gridToWorld(gx, gy);
            const { bx, by } = this.worldToBuffer(worldPt.x, worldPt.y);
            this.territoryCtx.fillStyle = player.color;
            this.territoryCtx.fillRect(bx - cellSizeBuf / 2, by - cellSizeBuf / 2, cellSizeBuf, cellSizeBuf);
          }
        }
      }
    }
  }

  // --- Main Canvas Rendering Pipeline ---

  public render() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    // Shake offset
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeDuration > 0) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
    }

    // Clear background
    const isDark = this.settings.theme === 'blueprint-dark';
    ctx.fillStyle = isDark ? '#0f172a' : '#f1f5f9';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Center camera on screen
    ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Paper Arena Background & Grid
    this.drawArenaBackground(ctx, isDark);

    // 2. Draw Territory Canvas
    this.drawTerritories(ctx);

    // 3. Draw Player Trails
    this.drawTrails(ctx);

    // 4. Draw Player Heads & Skins
    this.drawPlayers(ctx);

    // 5. Draw Particles and Confetti
    this.particles.draw(ctx);

    ctx.restore();

    // 6. Draw Mini-Map Radar in Corner
    this.drawMiniMap(ctx, width, height, isDark);
  }

  private drawArenaBackground(ctx: CanvasRenderingContext2D, isDark: boolean) {
    // Outer drop shadow for the paper sheet
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 35;
    ctx.shadowOffsetY = 12;
    ctx.fill();
    ctx.restore();

    // Subtle Grid pattern on arena
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)';
    ctx.lineWidth = 1;
    const step = 40;

    const startX = -WORLD_RADIUS;
    const endX = WORLD_RADIUS;
    for (let x = startX; x <= endX; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, -WORLD_RADIUS);
      ctx.lineTo(x, WORLD_RADIUS);
      ctx.stroke();
    }
    for (let y = startX; y <= endX; y += step) {
      ctx.beginPath();
      ctx.moveTo(-WORLD_RADIUS, y);
      ctx.lineTo(WORLD_RADIUS, y);
      ctx.stroke();
    }

    // Outer Circular Boundary Ring
    ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private drawTerritories(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // Clip strictly within arena
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS - 1, 0, Math.PI * 2);
    ctx.clip();

    // Draw offscreen buffer
    const bufW = (WORLD_RADIUS * 2);
    const bufH = (WORLD_RADIUS * 2);
    ctx.drawImage(
      this.territoryCanvas,
      -WORLD_RADIUS,
      -WORLD_RADIUS,
      bufW,
      bufH
    );
    ctx.restore();
  }

  private drawTrails(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const player of this.players.values()) {
      if (!player.isAlive || player.trail.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(player.trail[0].x, player.trail[0].y);
      for (let i = 1; i < player.trail.length; i++) {
        ctx.lineTo(player.trail[i].x, player.trail[i].y);
      }
      ctx.lineTo(player.x, player.y);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Darker border outline on trail for crisp Paper.io 2 ribbon feel
      ctx.strokeStyle = player.secondaryColor;
      ctx.lineWidth = TRAIL_WIDTH + 3;
      ctx.stroke();

      // Main vibrant trail fill
      ctx.strokeStyle = player.color;
      ctx.lineWidth = TRAIL_WIDTH;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlayers(ctx: CanvasRenderingContext2D) {
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;

      const skin = getSkinById(player.skinId);
      drawPlayerAvatar(
        ctx,
        player.x,
        player.y,
        HEAD_RADIUS,
        player.angle,
        skin,
        player.hasCrown
      );

      // Player overhead name tag & percent
      ctx.save();
      ctx.font = 'bold 12px "Fredoka", "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      const tagText = `${player.name} (${player.percent.toFixed(1)}%)`;
      const tagY = player.y - HEAD_RADIUS - 10;

      // Dark outline for legibility
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.strokeText(tagText, player.x, tagY);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(tagText, player.x, tagY);
      ctx.restore();
    }
  }

  private drawMiniMap(
    ctx: CanvasRenderingContext2D,
    screenWidth: number,
    screenHeight: number,
    isDark: boolean
  ) {
    const size = 110;
    const margin = 16;
    const cx = screenWidth - margin - size / 2;
    const cy = screenHeight - margin - size / 2;
    const r = size / 2;

    ctx.save();
    // Mini-map background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.88)';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)';
    ctx.stroke();

    ctx.clip();

    // Draw miniature scaled offscreen territory canvas
    const scale = (r * 2) / (WORLD_RADIUS * 2);
    ctx.drawImage(this.territoryCanvas, cx - r, cy - r, r * 2, r * 2);

    // Draw dots for players
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;
      const px = cx + (player.x / WORLD_RADIUS) * r;
      const py = cy + (player.y / WORLD_RADIUS) * r;

      ctx.beginPath();
      ctx.arc(px, py, player.id === this.localPlayerId ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = player.id === this.localPlayerId ? '#ffffff' : player.color;
      ctx.fill();

      if (player.id === this.localPlayerId) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  public setSettings(newSettings: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    if (newSettings.soundEnabled !== undefined) {
      sounds.setEnabled(newSettings.soundEnabled);
    }
    if (newSettings.soundVolume !== undefined) {
      sounds.setVolume(newSettings.soundVolume);
    }
  }
}
