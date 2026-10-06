import { ChatMessage } from './types';

export interface MultiplayerPlayer {
  id: string;
  name: string;
  color?: string;
  secondaryColor?: string;
  x: number;
  y: number;
  angle: number;
  trail: { x: number; y: number }[];
  isAlive: boolean;
  kills: number;
  percent: number;
}

export interface MultiplayerClientCallbacks {
  onRoomCreated: (code: string, playerId: string, players: MultiplayerPlayer[]) => void;
  onRoomJoined: (code: string, playerId: string, players: MultiplayerPlayer[], isHost: boolean) => void;
  onPlayerJoined: (player: MultiplayerPlayer, allPlayers: MultiplayerPlayer[]) => void;
  onPlayerLeft: (playerId: string, allPlayers: MultiplayerPlayer[]) => void;
  onGameStarted: (players: MultiplayerPlayer[]) => void;
  onStateSnapshot: (players: MultiplayerPlayer[]) => void;
  onPolygonCaptured: (playerId: string, polygon: { x: number; y: number }[]) => void;
  onPlayerEliminated: (victimId: string, victimName: string, killerName?: string, reason?: string) => void;
  onChatReceived: (message: ChatMessage) => void;
  onError: (errorMsg: string) => void;
  onPingUpdate: (pingMs: number) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerClientCallbacks;
  public playerId: string | null = null;
  public currentRoomCode: string | null = null;
  public isHost: boolean = false;
  private pingInterval: number | null = null;
  private lastPingSentTime: number = 0;

  constructor(callbacks: MultiplayerClientCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        resolve();
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.startPingLoop();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (err) => {
          console.error('WebSocket connection error:', err);
          reject(err);
        };

        this.ws.onclose = () => {
          this.stopPingLoop();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSentTime = Date.now();
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: this.lastPingSentTime }));
      }
    }, 2000);
  }

  private stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(dataRaw: string) {
    try {
      const msg = JSON.parse(dataRaw);

      switch (msg.type) {
        case 'pong': {
          const latency = Date.now() - msg.timestamp;
          this.callbacks.onPingUpdate(latency);
          break;
        }
        case 'room_created': {
          this.currentRoomCode = msg.code;
          this.playerId = msg.playerId;
          this.isHost = true;
          this.callbacks.onRoomCreated(msg.code, msg.playerId, msg.players);
          break;
        }
        case 'room_joined': {
          this.currentRoomCode = msg.code;
          this.playerId = msg.playerId;
          this.isHost = msg.isHost;
          this.callbacks.onRoomJoined(msg.code, msg.playerId, msg.players, msg.isHost);
          break;
        }
        case 'player_joined_lobby': {
          this.callbacks.onPlayerJoined(msg.player, msg.players);
          break;
        }
        case 'player_left': {
          this.callbacks.onPlayerLeft(msg.playerId, msg.players);
          break;
        }
        case 'game_started': {
          this.callbacks.onGameStarted(msg.players);
          break;
        }
        case 'state_snapshot': {
          this.callbacks.onStateSnapshot(msg.players);
          break;
        }
        case 'polygon_captured': {
          this.callbacks.onPolygonCaptured(msg.playerId, msg.polygon);
          break;
        }
        case 'player_eliminated': {
          this.callbacks.onPlayerEliminated(msg.victimId, msg.victimName, msg.killerName, msg.reason);
          break;
        }
        case 'chat_received': {
          this.callbacks.onChatReceived(msg.message);
          break;
        }
        case 'error': {
          this.callbacks.onError(msg.message);
          break;
        }
      }
    } catch (e) {
      console.error('Error handling WS packet:', e);
    }
  }

  public async createRoom(name: string, skinId: string, botCount: number = 4) {
    await this.connect();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'create_room',
        name,
        skinId,
        botCount,
      }));
    }
  }

  public async joinRoom(code: string, name: string, skinId: string) {
    await this.connect();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'join_room',
        code: code.trim().toUpperCase(),
        name,
        skinId,
      }));
    }
  }

  public startGame() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'start_game' }));
    }
  }

  public sendInputAngle(angle: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'player_input',
        angle,
      }));
    }
  }

  public sendChat(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chat_message',
        text,
      }));
    }
  }

  public disconnect() {
    this.stopPingLoop();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentRoomCode = null;
    this.playerId = null;
  }
}
