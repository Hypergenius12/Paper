export interface Vector2D {
  x: number;
  y: number;
}

export type ControlType = 'mouse' | 'keyboard' | 'joystick';

export type GameMode = 'classic' | 'speed' | 'hardcore';

export type ThemeType = 'paper-light' | 'blueprint-dark' | 'arcade-neon';

export interface SkinDefinition {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  trailColor: string;
  accentColor: string;
  icon?: string;
  eyeType: 'classic' | 'cute' | 'angry' | 'cool' | 'ninja' | 'cyclops' | 'stars';
  accessory?: 'crown' | 'cat_ears' | 'ninja_band' | 'sushi' | 'donut' | 'alien_antenna' | 'horns' | 'party_hat' | 'visor';
  unlockRequirement?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  secondaryColor: string;
  trailColor: string;
  accentColor: string;
  skinId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  angle: number;
  targetAngle: number;
  speed: number;
  trail: Vector2D[];
  isAlive: boolean;
  isBot: boolean;
  kills: number;
  percent: number;
  rank: number;
  score: number;
  isInsideOwnTerritory: boolean;
  timeAlive: number;
  deathReason?: string;
  killedBy?: string;
  hasCrown?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  rotation: number;
  vRot: number;
  shape: 'rect' | 'circle' | 'shard';
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  color: string;
  fontSize: number;
  life: number;
}

export interface KillEvent {
  id: string;
  killerName: string;
  killerColor: string;
  victimName: string;
  victimColor: string;
  timestamp: number;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  soundVolume: number;
  controls: ControlType;
  botDifficulty: 'easy' | 'medium' | 'hard';
  botCount: number;
  theme: ThemeType;
  showTrailGuides: boolean;
  screenShake: boolean;
}

export interface MultiplayerRoomInfo {
  code: string;
  hostId: string;
  players: {
    id: string;
    name: string;
    skinId: string;
    isReady: boolean;
    ping: number;
  }[];
  state: 'waiting' | 'starting' | 'playing' | 'ended';
  maxPlayers: number;
  botCount: number;
  gameMode: GameMode;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}
