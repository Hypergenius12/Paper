import { Vector2D } from './types';

export const WORLD_RADIUS = 1350; // Arena radius in world coordinates
export const GRID_SIZE = 150;     // 150x150 cells
export const CELL_SIZE = (WORLD_RADIUS * 2) / GRID_SIZE; // ~18px per cell
export const HEAD_RADIUS = 13;    // Radius of the player head
export const TRAIL_WIDTH = 11;    // Width of player trail ribbon

export interface GridCell {
  ownerId: string | null;
}

export class TerritoryGrid {
  public width: number = GRID_SIZE;
  public height: number = GRID_SIZE;
  public cells: Int16Array; // Storing player index (0 = neutral, -1 = outside world wall, >0 = player index)
  public playerIndexMap: Map<string, number> = new Map();
  public indexPlayerMap: Map<number, string> = new Map();
  private nextPlayerIndex: number = 1;

  public offscreenCanvas: HTMLCanvasElement;
  public offscreenCtx: CanvasRenderingContext2D;
  public totalValidCells: number = 0;

  constructor() {
    this.cells = new Int16Array(this.width * this.height);
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.width * 8; // high-res buffer
    this.offscreenCanvas.height = this.height * 8;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: false })!;

    this.initArena();
  }

  public registerPlayer(playerId: string): number {
    if (this.playerIndexMap.has(playerId)) {
      return this.playerIndexMap.get(playerId)!;
    }
    const idx = this.nextPlayerIndex++;
    this.playerIndexMap.set(playerId, idx);
    this.indexPlayerMap.set(idx, playerId);
    return idx;
  }

  public getPlayerIndex(playerId: string): number {
    return this.playerIndexMap.get(playerId) || 0;
  }

  public getPlayerId(index: number): string | null {
    return this.indexPlayerMap.get(index) || null;
  }

  private initArena() {
    this.totalValidCells = 0;
    const center = GRID_SIZE / 2;
    const radiusCells = (WORLD_RADIUS / CELL_SIZE) - 1;

    for (let gy = 0; gy < this.height; gy++) {
      for (let gx = 0; gx < this.width; gx++) {
        const dx = gx + 0.5 - center;
        const dy = gy + 0.5 - center;
        const i = gy * this.width + gx;

        if (dx * dx + dy * dy <= radiusCells * radiusCells) {
          this.cells[i] = 0; // Valid arena cell
          this.totalValidCells++;
        } else {
          this.cells[i] = -1; // Out of arena bounds
        }
      }
    }
  }

  public reset() {
    this.nextPlayerIndex = 1;
    this.playerIndexMap.clear();
    this.indexPlayerMap.clear();
    this.initArena();
    this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
  }

  public worldToGrid(x: number, y: number): { gx: number; gy: number } {
    const gx = Math.floor((x + WORLD_RADIUS) / CELL_SIZE);
    const gy = Math.floor((y + WORLD_RADIUS) / CELL_SIZE);
    return { gx, gy };
  }

  public gridToWorld(gx: number, gy: number): Vector2D {
    return {
      x: (gx + 0.5) * CELL_SIZE - WORLD_RADIUS,
      y: (gy + 0.5) * CELL_SIZE - WORLD_RADIUS,
    };
  }

  public getCell(gx: number, gy: number): number {
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return -1;
    return this.cells[gy * this.width + gx];
  }

  public setCell(gx: number, gy: number, val: number) {
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return;
    const i = gy * this.width + gx;
    if (this.cells[i] !== -1) {
      this.cells[i] = val;
    }
  }

  public getOwnerAtWorld(x: number, y: number): string | null {
    const { gx, gy } = this.worldToGrid(x, y);
    const val = this.getCell(gx, gy);
    if (val <= 0) return null;
    return this.getPlayerId(val);
  }

  /**
   * Initializes initial base territory circle for a new/spawned player
   */
  public spawnInitialBase(playerId: string, centerX: number, centerY: number, radiusWorld: number = 72): Vector2D[] {
    const playerIdx = this.registerPlayer(playerId);
    const { gx: cgx, gy: cgy } = this.worldToGrid(centerX, centerY);
    const cellRadius = Math.ceil(radiusWorld / CELL_SIZE);
    const captured: Vector2D[] = [];

    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        if (dx * dx + dy * dy <= cellRadius * cellRadius) {
          const gx = cgx + dx;
          const gy = cgy + dy;
          if (this.getCell(gx, gy) === 0 || this.getCell(gx, gy) > 0) {
            this.setCell(gx, gy, playerIdx);
            captured.push(this.gridToWorld(gx, gy));
          }
        }
      }
    }
    return captured;
  }

  /**
   * Captures the polygon enclosed by the trail points and current base
   * Uses Ray-Casting Point-in-Polygon inside the trail's bounding box
   */
  public capturePolygon(
    playerId: string,
    polygon: Vector2D[],
    baseColor: string
  ): { capturedCount: number; points: Vector2D[] } {
    if (polygon.length < 3) return { capturedCount: 0, points: [] };
    const playerIdx = this.registerPlayer(playerId);

    // Compute bounding box
    let minX = polygon[0].x;
    let maxX = polygon[0].x;
    let minY = polygon[0].y;
    let maxY = polygon[0].y;

    for (let i = 1; i < polygon.length; i++) {
      const p = polygon[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Expand bounding box slightly by 1 cell
    const minGrid = this.worldToGrid(minX - CELL_SIZE, minY - CELL_SIZE);
    const maxGrid = this.worldToGrid(maxX + CELL_SIZE, maxY + CELL_SIZE);

    const startGx = Math.max(0, minGrid.gx);
    const endGx = Math.min(this.width - 1, maxGrid.gx);
    const startGy = Math.max(0, minGrid.gy);
    const endGy = Math.min(this.height - 1, maxGrid.gy);

    const capturedPoints: Vector2D[] = [];
    let capturedCount = 0;

    for (let gy = startGy; gy <= endGy; gy++) {
      for (let gx = startGx; gx <= endGx; gx++) {
        const currentOwner = this.getCell(gx, gy);
        if (currentOwner === -1 || currentOwner === playerIdx) continue;

        const worldPt = this.gridToWorld(gx, gy);
        if (isPointInPolygon(worldPt.x, worldPt.y, polygon)) {
          this.setCell(gx, gy, playerIdx);
          capturedCount++;
          capturedPoints.push(worldPt);
        }
      }
    }

    // Also connect trail path cells directly
    for (let i = 0; i < polygon.length - 1; i++) {
      const p1 = polygon[i];
      const p2 = polygon[i + 1];
      const steps = Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / (CELL_SIZE * 0.5));
      for (let s = 0; s <= steps; s++) {
        const t = steps > 0 ? s / steps : 0;
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;
        const { gx, gy } = this.worldToGrid(x, y);
        if (this.getCell(gx, gy) >= 0) {
          this.setCell(gx, gy, playerIdx);
        }
      }
    }

    return { capturedCount, points: capturedPoints };
  }

  /**
   * Clears a player's territory when they are eliminated
   */
  public clearPlayerTerritory(playerId: string) {
    const playerIdx = this.getPlayerIndex(playerId);
    if (!playerIdx) return;

    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === playerIdx) {
        this.cells[i] = 0; // return to unclaimed arena
      }
    }
  }

  /**
   * Calculates territory coverage percentages for all registered players
   */
  public calculatePercentages(): Map<string, number> {
    const counts = new Map<number, number>();
    for (let i = 0; i < this.cells.length; i++) {
      const val = this.cells[i];
      if (val > 0) {
        counts.set(val, (counts.get(val) || 0) + 1);
      }
    }

    const resultMap = new Map<string, number>();
    const total = Math.max(1, this.totalValidCells);

    for (const [idx, count] of counts.entries()) {
      const pId = this.getPlayerId(idx);
      if (pId) {
        const pct = (count / total) * 100;
        resultMap.set(pId, Math.round(pct * 10) / 10);
      }
    }
    return resultMap;
  }

  /**
   * Finds the closest own-territory cell for a player (used by bots to return home safely)
   */
  public findClosestTerritoryCell(playerId: string, fromX: number, fromY: number): Vector2D | null {
    const playerIdx = this.getPlayerIndex(playerId);
    if (!playerIdx) return null;

    const { gx: startGx, gy: startGy } = this.worldToGrid(fromX, fromY);
    let bestDistSq = Infinity;
    let bestPoint: Vector2D | null = null;

    // Search outwards in spirals / rings up to 35 cells
    const maxRadius = 35;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const gx = startGx + dx;
          const gy = startGy + dy;
          if (this.getCell(gx, gy) === playerIdx) {
            const worldPt = this.gridToWorld(gx, gy);
            const distSq = (worldPt.x - fromX) ** 2 + (worldPt.y - fromY) ** 2;
            if (distSq < bestDistSq) {
              bestDistSq = distSq;
              bestPoint = worldPt;
            }
          }
        }
      }
      if (bestPoint) break;
    }

    return bestPoint;
  }
}

/**
 * Robust standard ray casting algorithm for polygon inclusion
 */
export function isPointInPolygon(px: number, py: number, polygon: Vector2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculates distance from point P to line segment AB
 */
export function distToSegment(p: Vector2D, a: Vector2D, b: Vector2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}
