import { PlayerState, Vector2D } from './types';
import { TerritoryGrid, WORLD_RADIUS, distToSegment, HEAD_RADIUS, TRAIL_WIDTH } from './grid';

export interface BotMemory {
  state: 'expanding' | 'returning' | 'hunting' | 'fleeing';
  loopTargetLength: number;
  loopTurnSign: number; // +1 or -1 for clockwise or counterclockwise loop
  targetPoint: Vector2D | null;
  huntingTargetId: string | null;
  changeStateTimer: number;
  personality: 'aggressive' | 'balanced' | 'cautious';
}

export const BOT_NAMES = [
  'PaperLord', 'NeonSlice', 'Vortex', 'Slick7', 'ApexTear',
  'CyberGhost', 'PixelQueen', 'Echo', 'Turbo', 'Kraken',
  'ShadowFox', 'Blaze', 'Cosmo', 'Hyperion', 'ZeroGravity',
  'Raptor', 'Zenith', 'Phantom', 'Frostbyte', 'Onyx'
];

export class BotController {
  private memories: Map<string, BotMemory> = new Map();

  public getOrCreateMemory(bot: PlayerState, difficulty: 'easy' | 'medium' | 'hard'): BotMemory {
    if (!this.memories.has(bot.id)) {
      const personalities: ('aggressive' | 'balanced' | 'cautious')[] = ['aggressive', 'balanced', 'cautious'];
      const personality = difficulty === 'hard'
        ? (Math.random() > 0.3 ? 'aggressive' : 'balanced')
        : difficulty === 'easy'
        ? 'cautious'
        : personalities[Math.floor(Math.random() * personalities.length)];

      const baseLength = difficulty === 'easy' ? 140 : difficulty === 'medium' ? 220 : 320;

      this.memories.set(bot.id, {
        state: 'expanding',
        loopTargetLength: baseLength + (Math.random() - 0.5) * 80,
        loopTurnSign: Math.random() > 0.5 ? 1 : -1,
        targetPoint: null,
        huntingTargetId: null,
        changeStateTimer: 0,
        personality,
      });
    }
    return this.memories.get(bot.id)!;
  }

  public removeBot(botId: string) {
    this.memories.delete(botId);
  }

  public updateBot(
    bot: PlayerState,
    allPlayers: PlayerState[],
    grid: TerritoryGrid,
    difficulty: 'easy' | 'medium' | 'hard',
    dt: number
  ): number {
    if (!bot.isAlive) return bot.angle;

    const memory = this.getOrCreateMemory(bot, difficulty);
    memory.changeStateTimer += dt;

    const botPos: Vector2D = { x: bot.x, y: bot.y };
    const distFromCenter = Math.hypot(bot.x, bot.y);
    const arenaLimit = WORLD_RADIUS - 70;

    // 1. Boundary Emergency Steer: If close to the wall, turn back toward the center
    if (distFromCenter > arenaLimit) {
      const angleToCenter = Math.atan2(-bot.y, -bot.x);
      return this.steerTowards(bot.angle, angleToCenter, 5.0 * dt);
    }

    // 2. Self Trail Avoidance: Never run into own trail!
    const ownTrail = bot.trail;
    if (ownTrail.length > 5) {
      // Check collision with older points of own trail
      const lookahead = 24;
      const testPos: Vector2D = {
        x: bot.x + Math.cos(bot.angle) * lookahead,
        y: bot.y + Math.sin(bot.angle) * lookahead,
      };

      for (let i = 0; i < ownTrail.length - 8; i++) {
        const segDist = distToSegment(testPos, ownTrail[i], ownTrail[i + 1]);
        if (segDist < HEAD_RADIUS + TRAIL_WIDTH) {
          // Sharp turn away from trail
          const avoidAngle = bot.angle + memory.loopTurnSign * 1.5;
          return this.steerTowards(bot.angle, avoidAngle, 7.0 * dt);
        }
      }
    }

    // 3. Threat detection: Is another player nearby threatening our trail?
    let isThreatened = false;
    if (bot.trail.length > 3) {
      for (const other of allPlayers) {
        if (other.id === bot.id || !other.isAlive) continue;
        const distToOther = Math.hypot(other.x - bot.x, other.y - bot.y);
        if (distToOther < 200) {
          // Check if other is heading towards our trail
          for (let i = 0; i < bot.trail.length; i += 3) {
            const d = Math.hypot(other.x - bot.trail[i].x, other.y - bot.trail[i].y);
            if (d < 130) {
              isThreatened = true;
              break;
            }
          }
        }
        if (isThreatened) break;
      }
    }

    if (isThreatened) {
      memory.state = 'returning';
    }

    // 4. Trail Hunter: Can we slice a nearby enemy's trail?
    let targetTrailSegment: Vector2D | null = null;
    const huntRadius = difficulty === 'hard' ? 280 : difficulty === 'medium' ? 190 : 120;

    if (!isThreatened && memory.personality !== 'cautious') {
      let closestTrailDist = huntRadius;

      for (const other of allPlayers) {
        if (other.id === bot.id || !other.isAlive || other.trail.length < 2) continue;

        // Check each segment of the opponent's trail
        for (let i = 0; i < other.trail.length - 1; i += 2) {
          const pt = other.trail[i];
          const d = Math.hypot(pt.x - bot.x, pt.y - bot.y);
          if (d < closestTrailDist) {
            closestTrailDist = d;
            targetTrailSegment = pt;
          }
        }
      }
    }

    if (targetTrailSegment) {
      // Steer directly towards vulnerable enemy trail to slice it!
      const huntAngle = Math.atan2(targetTrailSegment.y - bot.y, targetTrailSegment.x - bot.x);
      return this.steerTowards(bot.angle, huntAngle, (difficulty === 'hard' ? 5.5 : 4.0) * dt);
    }

    // 5. Normal Expansion / Returning Loop
    const trailLen = bot.trail.length * 6; // approximate distance
    if (bot.isInsideOwnTerritory) {
      memory.state = 'expanding';
      // Pick random direction slightly curved
      if (memory.changeStateTimer > 1.5) {
        memory.loopTurnSign = Math.random() > 0.5 ? 1 : -1;
        memory.changeStateTimer = 0;
      }
    } else if (trailLen > memory.loopTargetLength) {
      memory.state = 'returning';
    }

    let desiredAngle = bot.angle;

    if (memory.state === 'returning') {
      const homeCell = grid.findClosestTerritoryCell(bot.id, bot.x, bot.y);
      if (homeCell) {
        desiredAngle = Math.atan2(homeCell.y - bot.y, homeCell.x - bot.x);
      } else {
        // Fallback: steer in a circle to close loop
        desiredAngle = bot.angle + memory.loopTurnSign * 1.8;
      }
    } else {
      // Expanding: gentle smooth arc to form a teardrop/oval loop
      const turnRate = 0.85 * memory.loopTurnSign;
      desiredAngle = bot.angle + turnRate * dt;
    }

    const steerRate = (difficulty === 'hard' ? 4.8 : difficulty === 'medium' ? 3.8 : 2.8) * dt;
    return this.steerTowards(bot.angle, desiredAngle, steerRate);
  }

  private steerTowards(currentAngle: number, targetAngle: number, maxStep: number): number {
    // Normalize difference to [-PI, PI]
    let diff = (targetAngle - currentAngle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    if (Math.abs(diff) <= maxStep) {
      return targetAngle;
    }
    return currentAngle + Math.sign(diff) * maxStep;
  }
}
