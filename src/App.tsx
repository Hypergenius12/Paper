import React, { useState, useEffect, useRef } from 'react';
import { Peer, type DataConnection } from 'peerjs';

interface GameSettingsState {
  zenMode: boolean;
  invincible: boolean;
  speed: number;
  botCount: number;
  botDifficulty: 'easy' | 'normal' | 'hard';
  trailWidth: number;
  theme: 'classic' | 'dark' | 'cyber';
  zoom: 'close' | 'normal' | 'far';
  baseSize: 'standard' | 'large';
  arenaSize: 'small' | 'normal' | 'massive';
  infiniteArena: boolean;
  customColor: string;
  useRandomColor: boolean;
}

interface PartyMember {
  id: string;
  name: string;
  color: string;
  isHost?: boolean;
}

const PRESET_COLORS = [
  '#00e5ff', // Cyan
  '#ff1744', // Red
  '#00e676', // Emerald
  '#ff9100', // Orange
  '#d500f9', // Purple
  '#ff4081', // Pink
  '#ffd600', // Yellow
  '#2979ff', // Blue
  '#18ffff', // Aqua
  '#212121', // Dark Onyx
];

const DEFAULT_SETTINGS: GameSettingsState = {
  zenMode: false,
  invincible: false,
  speed: 1.0,
  botCount: 15,
  botDifficulty: 'normal',
  trailWidth: 8,
  theme: 'classic',
  zoom: 'normal',
  baseSize: 'standard',
  arenaSize: 'normal',
  infiniteArena: false,
  customColor: '#00e5ff',
  useRandomColor: false,
};

const CLOUD_BACKEND_WS = 'wss://ais-pre-zvr2b6kpmf3ddywcq6cpos-712604269730.us-west2.run.app/ws';

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPartyOpen, setIsPartyOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Party state
  const [partyTab, setPartyTab] = useState<'create' | 'join'>('create');
  const [partyCode, setPartyCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [isPartyJoined, setIsPartyJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [connectionType, setConnectionType] = useState<'p2p' | 'cloud' | 'none'>('none');
  const [connectionStatus, setConnectionStatus] = useState<string>('Offline');

  // Network refs
  const wsRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const p2pConnectionsRef = useRef<DataConnection[]>([]);

  const [settings, setSettings] = useState<GameSettingsState>(() => {
    try {
      const saved = localStorage.getItem('paperio_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          speed: [1.0, 1.5, 2.0, 5.0].includes(parsed.speed) ? parsed.speed : 1.0,
          arenaSize: parsed.arenaSize || 'normal',
          infiniteArena: !!parsed.infiniteArena,
          customColor:
            typeof parsed.customColor === 'string' && parsed.customColor
              ? parsed.customColor
              : '#00e5ff',
        };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  // Check URL for party invite (?party=CODE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('party');
    if (codeFromUrl) {
      const clean = codeFromUrl.toUpperCase().trim();
      setJoinInput(clean);
      setPartyTab('join');
      setIsPartyOpen(true);
      connectToParty(clean);
    }
  }, []);

  // Sync settings with window.paperSettings and game engine API
  useEffect(() => {
    (window as any).paperSettings = settings;
    try {
      localStorage.setItem('paperio_settings', JSON.stringify(settings));
    } catch {}

    const api = (window as any).paperio2api;
    if (api && api.config) {
      api.config.unitSpeed = 0x5a * settings.speed;
      api.config.botsCount = settings.botCount;
      api.config.trackWidth = settings.trailWidth;

      if (settings.zoom === 'far') {
        api.config.maxScale = 3.0;
        api.config.minScale = 2.0;
      } else if (settings.zoom === 'close') {
        api.config.maxScale = 5.2;
        api.config.minScale = 3.6;
      } else {
        api.config.maxScale = 4.5;
        api.config.minScale = 3.0;
      }

      if (settings.baseSize === 'large') {
        api.config.baseRadius = 48;
      } else {
        api.config.baseRadius = 30;
      }

      if (settings.theme === 'dark') {
        api.config.arenaColor = '#1b211e';
        api.config.backgroundTopColor = '#121614';
        api.config.backgroundBottomColor = '#1e2924';
        api.config.borderColor = '#33403a';
      } else if (settings.theme === 'cyber') {
        api.config.arenaColor = '#160e28';
        api.config.backgroundTopColor = '#0d0718';
        api.config.backgroundBottomColor = '#2d0b38';
        api.config.borderColor = '#692482';
      } else {
        api.config.arenaColor = '#e6ffe6';
        api.config.backgroundTopColor = '#e7fff4';
        api.config.backgroundBottomColor = '#81faff';
        api.config.borderColor = '#88a799';
      }

      if (settings.botDifficulty === 'easy') {
        api.config.botAggroMin = 0.05;
        api.config.botAggroMax = 0.2;
      } else if (settings.botDifficulty === 'hard') {
        api.config.botAggroMin = 0.7;
        api.config.botAggroMax = 1.6;
      } else {
        api.config.botAggroMin = 0.2;
        api.config.botAggroMax = 1.0;
      }
    }
  }, [settings]);

  // Listen for game start event to close settings immediately
  useEffect(() => {
    const handleGameStart = () => {
      setIsOpen(false);
      setIsPartyOpen(false);
      setIsPlaying(true);
    };

    window.addEventListener('paperio_game_start', handleGameStart);

    // Watch #ui element state (when hidden, player is in-game)
    const checkUiState = () => {
      const ui = document.getElementById('ui');
      if (!ui) return;
      const isHidden = ui.classList.contains('hide') || ui.style.display === 'none';
      setIsPlaying(isHidden);
      if (isHidden) {
        setIsOpen(false);
      }
    };

    const interval = setInterval(checkUiState, 300);

    return () => {
      window.removeEventListener('paperio_game_start', handleGameStart);
      clearInterval(interval);
    };
  }, []);

  const updateSetting = <K extends keyof GameSettingsState>(key: K, value: GameSettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleRandomizeColor = () => {
    const randomCol = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
    updateSetting('customColor', randomCol);
    updateSetting('useRandomColor', false);
  };

  const handleSaveAndPlay = () => {
    setIsOpen(false);
    setIsPlaying(true);
    if (typeof (window as any).StartGame === 'function') {
      (window as any).StartGame();
    }
  };

  const handleRestartGame = () => {
    setIsOpen(false);
    setIsPlaying(true);
    if (typeof (window as any).RestartGame === 'function') {
      (window as any).RestartGame();
    } else if (typeof (window as any).StartGame === 'function') {
      (window as any).StartGame();
    }
  };

  // Cleanup network connections
  const cleanupConnections = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    p2pConnectionsRef.current = [];
  };

  // Determine WebSocket endpoint
  const getWebSocketUrl = () => {
    if (typeof window === 'undefined') return CLOUD_BACKEND_WS;
    const isGitHub = window.location.hostname.endsWith('github.io');
    if (isGitHub) {
      // Connect to Cloud Run backend when deployed on GitHub Pages static host!
      return CLOUD_BACKEND_WS;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  // Connect to Party via WebRTC P2P + WebSocket Cloud Relay Fallback
  const connectToParty = (code: string) => {
    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode) return;

    cleanupConnections();
    setConnectionStatus('Connecting...');

    const nick = (document.getElementById('nick') as HTMLInputElement)?.value || 'Player';
    const myPlayer: PartyMember = {
      id: `p-${Math.random().toString(36).substring(2, 7)}`,
      name: nick,
      color: settings.customColor,
      isHost: partyTab === 'create',
    };

    // 1. Try WebSocket Cloud Relay
    let wsSuccess = false;
    try {
      const targetUrl = getWebSocketUrl();
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        wsSuccess = true;
        setConnectionType('cloud');
        setConnectionStatus('Online (Cloud Relay)');
        setIsPartyJoined(true);
        setPartyCode(cleanCode);

        ws.send(
          JSON.stringify({
            type: 'join_party',
            partyCode: cleanCode,
            name: nick,
            color: settings.customColor,
            partySettings: {
              arenaSize: settings.arenaSize,
              speedMultiplier: settings.speed,
              botCount: settings.botCount,
              infiniteArena: settings.infiniteArena,
              zenMode: settings.zenMode,
            },
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'party_joined') {
            setPartyCode(msg.partyCode);
            setIsPartyJoined(true);
            setIsHost(!!msg.isHost);
          } else if (msg.type === 'party_members_updated') {
            setPartyMembers(msg.members || []);
            if (msg.settings) {
              if (msg.settings.arenaSize) updateSetting('arenaSize', msg.settings.arenaSize);
              if (msg.settings.speedMultiplier) updateSetting('speed', msg.settings.speedMultiplier);
              if (msg.settings.botCount !== undefined) updateSetting('botCount', msg.settings.botCount);
              if (msg.settings.infiniteArena !== undefined) updateSetting('infiniteArena', msg.settings.infiniteArena);
              if (msg.settings.zenMode !== undefined) updateSetting('zenMode', msg.settings.zenMode);
            }
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        if (!wsSuccess) {
          initPeerJSP2P(cleanCode, myPlayer);
        }
      };
    } catch (e) {
      initPeerJSP2P(cleanCode, myPlayer);
    }
  };

  // 2. WebRTC PeerJS P2P (Serverless mesh for GitHub Pages)
  const initPeerJSP2P = (code: string, me: PartyMember) => {
    setConnectionStatus('Connecting P2P (WebRTC)...');
    const peerId = partyTab === 'create' ? `paper2-room-${code}` : undefined;

    try {
      const peer = peerId ? new Peer(peerId, { debug: 1 }) : new Peer({ debug: 1 });
      peerRef.current = peer;

      peer.on('open', (id) => {
        setConnectionType('p2p');
        setConnectionStatus('Online (WebRTC P2P Direct)');
        setIsPartyJoined(true);
        setPartyCode(code);

        if (partyTab === 'create') {
          setIsHost(true);
          setPartyMembers([{ ...me, isHost: true }]);

          // Listen for incoming guest connections
          peer.on('connection', (conn) => {
            p2pConnectionsRef.current.push(conn);
            conn.on('data', (data: any) => {
              if (data && data.type === 'guest_join') {
                const newMember: PartyMember = {
                  id: conn.peer,
                  name: data.name || 'Friend',
                  color: data.color || '#ff9100',
                  isHost: false,
                };
                setPartyMembers((prev) => {
                  const updated = [...prev.filter((m) => m.id !== newMember.id), newMember];
                  // Broadcast updated list to all guests
                  p2pConnectionsRef.current.forEach((c) => {
                    if (c.open) {
                      c.send({
                        type: 'members_update',
                        members: updated,
                        settings,
                      });
                    }
                  });
                  return updated;
                });
              }
            });
          });
        } else {
          // Guest connecting to host's peer
          const hostPeerId = `paper2-room-${code}`;
          const conn = peer.connect(hostPeerId);
          p2pConnectionsRef.current.push(conn);

          conn.on('open', () => {
            conn.send({
              type: 'guest_join',
              name: me.name,
              color: me.color,
            });
          });

          conn.on('data', (data: any) => {
            if (data && data.type === 'members_update') {
              setPartyMembers(data.members || []);
              if (data.settings) {
                if (data.settings.arenaSize) updateSetting('arenaSize', data.settings.arenaSize);
                if (data.settings.speedMultiplier) updateSetting('speed', data.settings.speedMultiplier);
                if (data.settings.botCount !== undefined) updateSetting('botCount', data.settings.botCount);
                if (data.settings.infiniteArena !== undefined) updateSetting('infiniteArena', data.settings.infiniteArena);
                if (data.settings.zenMode !== undefined) updateSetting('zenMode', data.settings.zenMode);
              }
            } else if (data && data.type === 'start_match') {
              handleStartPartyGame();
            }
          });
        }
      });

      peer.on('error', (err) => {
        console.log('PeerJS notice:', err);
        setConnectionStatus('Local Arena Ready');
      });
    } catch (e) {
      setConnectionStatus('Local Arena Ready');
    }
  };

  const handleCreateParty = () => {
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    setPartyCode(randomCode);
    connectToParty(randomCode);
  };

  const handleJoinParty = () => {
    if (!joinInput.trim()) return;
    connectToParty(joinInput.trim());
  };

  const handleCopyPartyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?party=${partyCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleStartPartyGame = () => {
    // If host on P2P, notify all guests to start
    if (isHost && connectionType === 'p2p') {
      p2pConnectionsRef.current.forEach((conn) => {
        if (conn.open) {
          conn.send({ type: 'start_match', settings });
        }
      });
    }
    setIsPartyOpen(false);
    handleSaveAndPlay();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      {/* Top Menu Buttons: Only shown on main menu when not playing */}
      {!isPlaying && (
        <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2.5">
          {/* Party Button */}
          <button
            type="button"
            onClick={() => {
              setIsPartyOpen(true);
              if (!partyCode && !isPartyJoined) {
                handleCreateParty();
              }
            }}
            style={{
              fontFamily: "'PT Sans Caption', sans-serif",
              backgroundColor: '#33cdcf',
              borderColor: '#218c8f',
              color: '#063a3b',
              borderBottomWidth: '4px',
              borderBottomStyle: 'solid',
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold tracking-wide shadow-lg hover:brightness-105 active:translate-y-0.5 active:border-b-0 cursor-pointer transition-all"
            title="Create or Join Party"
          >
            <span className="text-base leading-none">🎉</span>
            <span>PARTY</span>
            {isPartyJoined && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            style={{
              fontFamily: "'PT Sans Caption', sans-serif",
              backgroundColor: '#eaec4b',
              borderColor: '#a1a130',
              color: '#888a34',
              borderBottomWidth: '4px',
              borderBottomStyle: 'solid',
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold tracking-wide shadow-lg hover:brightness-105 active:translate-y-0.5 active:border-b-0 cursor-pointer transition-all"
            title="Open Game Settings"
          >
            <span className="text-base leading-none">⚙</span>
            <span>SETTINGS</span>
          </button>
        </div>
      )}

      {/* Party Modal */}
      {isPartyOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            style={{
              fontFamily: "'PT Sans Caption', system-ui, sans-serif",
              backgroundColor: '#24292e',
              borderColor: '#181c20',
            }}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto text-white rounded-2xl border-4 shadow-2xl p-4 sm:p-5 flex flex-col gap-3.5 text-xs sm:text-sm"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/15">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎉</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-wide text-[#33cdcf]">
                    ONLINE PARTY MULTIPLAYER
                  </h2>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        connectionType !== 'none' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span>{connectionStatus}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPartyOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/40 hover:bg-black/60 text-white/80 hover:text-white font-bold cursor-pointer text-base"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setPartyTab('create')}
                className={`py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                  partyTab === 'create'
                    ? 'bg-[#33cdcf] text-[#063a3b] shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                CREATE PARTY
              </button>
              <button
                type="button"
                onClick={() => setPartyTab('join')}
                className={`py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                  partyTab === 'join'
                    ? 'bg-[#33cdcf] text-[#063a3b] shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                JOIN WITH CODE
              </button>
            </div>

            {/* Tab 1: Create Party */}
            {partyTab === 'create' && (
              <div className="flex flex-col gap-3">
                {/* Party Code Card */}
                <div className="bg-black/30 p-3 rounded-xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-white/60 block">SHARE THIS PARTY CODE:</span>
                    <span className="text-2xl font-mono font-black text-[#eaec4b] tracking-widest">
                      {partyCode || 'CREATING...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleCopyPartyLink}
                      style={{
                        backgroundColor: '#eaec4b',
                        borderColor: '#a1a130',
                        color: '#686a24',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="flex-1 sm:flex-none px-3 py-1.5 font-bold text-xs rounded-lg active:border-b-0 active:translate-y-0.5 cursor-pointer"
                    >
                      {copied ? '✅ LINK COPIED!' : '📋 COPY LINK'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateParty}
                      className="px-2.5 py-1.5 bg-black/40 hover:bg-black/60 rounded-lg text-xs font-bold border border-white/20 cursor-pointer"
                      title="Generate New Code"
                    >
                      🎲 NEW
                    </button>
                  </div>
                </div>

                {/* Party Members Roster */}
                <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-white text-xs">👥 Connected Players:</span>
                    <span className="text-[11px] text-emerald-400 font-bold">
                      {partyMembers.length || 1} in Room
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {partyMembers.length > 0 ? (
                      partyMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 rounded-lg border border-white/15 text-xs"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: m.color || '#33cdcf' }}
                          />
                          <span className="font-bold">{m.name}</span>
                          {m.isHost && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded border border-amber-500/30">
                              HOST
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 rounded-lg border border-white/15 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#00e5ff]" />
                        <span className="font-bold">You (Host)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Party Arena Rules */}
                <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-2">
                  <span className="font-bold text-white text-xs">⚙️ Party Arena Rules</span>

                  {/* Arena Size */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/70">Arena Size:</span>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { id: 'small' as const, label: 'Small' },
                        { id: 'normal' as const, label: 'Normal' },
                        { id: 'massive' as const, label: 'Massive' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => updateSetting('arenaSize', s.id)}
                          style={{
                            backgroundColor: settings.arenaSize === s.id ? '#33cdcf' : 'rgba(0,0,0,0.4)',
                            borderColor: settings.arenaSize === s.id ? '#218c8f' : '#111',
                            color: settings.arenaSize === s.id ? '#063a3b' : '#aaa',
                            borderBottomWidth: '2px',
                            borderBottomStyle: 'solid',
                          }}
                          className="px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Speed */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/70">Party Speed:</span>
                    <div className="grid grid-cols-4 gap-1">
                      {[1.0, 1.5, 2.0, 5.0].map((sp) => (
                        <button
                          key={sp}
                          type="button"
                          onClick={() => updateSetting('speed', sp)}
                          style={{
                            backgroundColor: settings.speed === sp ? '#ff972f' : 'rgba(0,0,0,0.4)',
                            borderColor: settings.speed === sp ? '#ae4e0d' : '#111',
                            color: settings.speed === sp ? '#422100' : '#aaa',
                            borderBottomWidth: '2px',
                            borderBottomStyle: 'solid',
                          }}
                          className="px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer"
                        >
                          {sp}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Infinite Arena Looping */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/10">
                    <span className="text-[11px] text-white/70">🌀 Infinite Arena (Looping Map):</span>
                    <button
                      type="button"
                      onClick={() => updateSetting('infiniteArena', !settings.infiniteArena)}
                      style={{
                        backgroundColor: settings.infiniteArena ? '#7fed4c' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.infiniteArena ? '#56a130' : '#111',
                        color: settings.infiniteArena ? '#1e4612' : '#aaa',
                        borderBottomWidth: '2px',
                        borderBottomStyle: 'solid',
                      }}
                      className="px-2.5 py-0.5 text-[11px] font-bold rounded cursor-pointer"
                    >
                      {settings.infiniteArena ? 'ON (NO BORDERS)' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Start Party Button */}
                <button
                  type="button"
                  onClick={handleStartPartyGame}
                  style={{
                    backgroundColor: '#7fed4c',
                    borderColor: '#56a130',
                    color: '#1e4612',
                    borderBottomWidth: '4px',
                    borderBottomStyle: 'solid',
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-base tracking-wider shadow-xl active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all text-center"
                >
                  START PARTY MATCH
                </button>
              </div>
            )}

            {/* Tab 2: Join Party */}
            {partyTab === 'join' && (
              <div className="flex flex-col gap-3 py-2">
                <p className="text-white/70 text-xs">
                  Enter the Party Code provided by your friend:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE (e.g. 7K9Q)"
                    className="flex-1 py-2.5 px-3 bg-black/40 text-white font-mono text-base font-bold rounded-xl border border-white/20 uppercase tracking-widest focus:outline-none focus:border-[#33cdcf]"
                  />
                  <button
                    type="button"
                    onClick={handleJoinParty}
                    style={{
                      backgroundColor: '#33cdcf',
                      borderColor: '#218c8f',
                      color: '#063a3b',
                      borderBottomWidth: '4px',
                      borderBottomStyle: 'solid',
                    }}
                    className="px-5 py-2.5 rounded-xl font-bold text-sm tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all"
                  >
                    JOIN
                  </button>
                </div>
                {isPartyJoined && partyCode && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
                    <div>
                      <div>Connected to Party <strong>{partyCode}</strong>!</div>
                      <div className="text-[10px] text-white/60 mt-0.5">{connectionStatus}</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartPartyGame}
                      className="px-3.5 py-1.5 bg-emerald-500 text-black font-bold rounded-lg cursor-pointer"
                    >
                      ENTER GAME
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Settings Modal */}
      {isOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            style={{
              fontFamily: "'PT Sans Caption', system-ui, sans-serif",
              backgroundColor: '#2e2c2b',
              borderColor: '#1d1b1a',
            }}
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto text-white rounded-2xl border-4 shadow-2xl p-4 sm:p-5 flex flex-col gap-3.5 text-xs sm:text-sm"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/15">
              <div className="flex items-center gap-2">
                <span className="text-xl text-[#eaec4b]">⚙</span>
                <h2 className="text-lg sm:text-xl font-bold tracking-wide text-[#eaec4b]">
                  GAME SETTINGS
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/40 hover:bg-black/60 text-white/80 hover:text-white font-bold cursor-pointer text-base"
              >
                ✕
              </button>
            </div>

            {/* 1. Zen Mode & Invincible Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Zen Mode */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between font-bold text-white text-xs sm:text-sm">
                    <span>🧘 Zen Mode</span>
                    {settings.zenMode && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded border border-emerald-500/30">
                        ON
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-[11px] mt-0.5">
                    Peaceful painting. Bots won't attack and trails can't be cut.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('zenMode', !settings.zenMode)}
                  style={{
                    backgroundColor: settings.zenMode ? '#7fed4c' : 'rgba(0,0,0,0.5)',
                    borderColor: settings.zenMode ? '#56a130' : '#111',
                    color: settings.zenMode ? '#1e4612' : '#aaa',
                    borderBottomWidth: '3px',
                    borderBottomStyle: 'solid',
                  }}
                  className="w-full py-1 font-bold text-xs rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5"
                >
                  {settings.zenMode ? 'ENABLED' : 'OFF'}
                </button>
              </div>

              {/* Invincible Mode */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between font-bold text-white text-xs sm:text-sm">
                    <span>🛡️ Invincible Mode</span>
                    {settings.invincible && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 py-0.2 rounded border border-amber-500/30">
                        ON
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-[11px] mt-0.5">
                    God mode. Immune to enemies slicing your trail or biting own tail.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('invincible', !settings.invincible)}
                  style={{
                    backgroundColor: settings.invincible ? '#eaec4b' : 'rgba(0,0,0,0.5)',
                    borderColor: settings.invincible ? '#a1a130' : '#111',
                    color: settings.invincible ? '#686a24' : '#aaa',
                    borderBottomWidth: '3px',
                    borderBottomStyle: 'solid',
                  }}
                  className="w-full py-1 font-bold text-xs rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5"
                >
                  {settings.invincible ? 'ENABLED' : 'OFF'}
                </button>
              </div>
            </div>

            {/* 2. Movement Speed (1.0, 1.5, 2.0, 5.0) */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs sm:text-sm">⚡ Movement Speed</span>
                <span className="text-xs font-mono text-[#eaec4b] font-bold">
                  {settings.speed}x
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '1.0x Normal', val: 1.0 },
                  { label: '1.5x Fast', val: 1.5 },
                  { label: '2.0x Turbo', val: 2.0 },
                  { label: '5.0x Sonic', val: 5.0 },
                ].map((s) => (
                  <button
                    key={s.val}
                    type="button"
                    onClick={() => updateSetting('speed', s.val)}
                    style={{
                      backgroundColor: settings.speed === s.val ? '#ff972f' : 'rgba(0,0,0,0.4)',
                      borderColor: settings.speed === s.val ? '#ae4e0d' : '#111',
                      color: settings.speed === s.val ? '#422100' : '#aaa',
                      borderBottomWidth: '3px',
                      borderBottomStyle: 'solid',
                    }}
                    className="py-1.5 text-xs font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Arena Size & Infinite Looping Arena */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Arena Size */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
                <span className="font-bold text-white text-xs sm:text-sm">🗺️ Arena Size</span>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'small' as const, label: 'Small' },
                    { id: 'normal' as const, label: 'Normal' },
                    { id: 'massive' as const, label: 'Massive' },
                  ].map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => updateSetting('arenaSize', sz.id)}
                      style={{
                        backgroundColor: settings.arenaSize === sz.id ? '#33cdcf' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.arenaSize === sz.id ? '#218c8f' : '#111',
                        color: settings.arenaSize === sz.id ? '#063a3b' : '#aaa',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="py-1 text-[11px] font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Infinite Arena Looping */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between gap-1.5">
                <div>
                  <div className="flex items-center justify-between font-bold text-white text-xs">
                    <span>🌀 Infinite Arena</span>
                    {settings.infiniteArena && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded border border-emerald-500/30">
                        LOOP ON
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-[11px] mt-0.5">
                    Map scrolls infinitely, coordinates loop around, no death borders!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('infiniteArena', !settings.infiniteArena)}
                  style={{
                    backgroundColor: settings.infiniteArena ? '#7fed4c' : 'rgba(0,0,0,0.5)',
                    borderColor: settings.infiniteArena ? '#56a130' : '#111',
                    color: settings.infiniteArena ? '#1e4612' : '#aaa',
                    borderBottomWidth: '3px',
                    borderBottomStyle: 'solid',
                  }}
                  className="w-full py-1 font-bold text-xs rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5"
                >
                  {settings.infiniteArena ? 'ENABLED (LOOP)' : 'OFF'}
                </button>
              </div>
            </div>

            {/* 4. Camera Zoom & Starting Base Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Camera Zoom */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
                <span className="font-bold text-white text-xs sm:text-sm">🔍 Camera Zoom / FOV</span>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'close' as const, label: 'Close' },
                    { id: 'normal' as const, label: 'Normal' },
                    { id: 'far' as const, label: 'Wide View' },
                  ].map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => updateSetting('zoom', z.id)}
                      style={{
                        backgroundColor: settings.zoom === z.id ? '#eaec4b' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.zoom === z.id ? '#a1a130' : '#111',
                        color: settings.zoom === z.id ? '#686a24' : '#aaa',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="py-1 text-[11px] font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Starting Base Size */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
                <span className="font-bold text-white text-xs sm:text-sm">🏰 Starting Base Size</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'standard' as const, label: 'Standard (30px)' },
                    { id: 'large' as const, label: 'Mega Base (48px)' },
                  ].map((bs) => (
                    <button
                      key={bs.id}
                      type="button"
                      onClick={() => updateSetting('baseSize', bs.id)}
                      style={{
                        backgroundColor: settings.baseSize === bs.id ? '#7fed4c' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.baseSize === bs.id ? '#56a130' : '#111',
                        color: settings.baseSize === bs.id ? '#1e4612' : '#aaa',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="py-1 text-[11px] font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                    >
                      {bs.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. Trail Width & Arena Theme */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Trail Width */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs sm:text-sm">〰️ Trail Width</span>
                  <span className="text-xs text-[#eaec4b] font-bold">{settings.trailWidth}px</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: '5px', val: 5 },
                    { label: '8px', val: 8 },
                    { label: '12px', val: 12 },
                    { label: '16px', val: 16 },
                  ].map((t) => (
                    <button
                      key={t.val}
                      type="button"
                      onClick={() => updateSetting('trailWidth', t.val)}
                      style={{
                        backgroundColor: settings.trailWidth === t.val ? '#33cdcf' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.trailWidth === t.val ? '#218c8f' : '#111',
                        color: settings.trailWidth === t.val ? '#063a3b' : '#aaa',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="py-1 text-[11px] font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arena Theme */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
                <span className="font-bold text-white text-xs sm:text-sm">🎨 Arena Theme</span>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'classic' as const, label: 'Mint' },
                    { id: 'dark' as const, label: 'Slate' },
                    { id: 'cyber' as const, label: 'Cyber' },
                  ].map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => updateSetting('theme', th.id)}
                      style={{
                        backgroundColor: settings.theme === th.id ? '#eaec4b' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.theme === th.id ? '#a1a130' : '#111',
                        color: settings.theme === th.id ? '#686a24' : '#aaa',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="py-1 text-[11px] font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                    >
                      {th.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 6. Bot Settings */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs sm:text-sm">🤖 Bot Settings</span>
                <span className="text-xs text-[#eaec4b] font-bold">
                  {settings.botCount === 0 ? 'Empty Map (Solo)' : `${settings.botCount} Bots`}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-white/60 block mb-1">Bot Count:</span>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { label: '0 Solo', val: 0 },
                    { label: '5', val: 5 },
                    { label: '10', val: 10 },
                    { label: '15 Def', val: 15 },
                    { label: '25 Chaos', val: 25 },
                  ].map((b) => (
                    <button
                      key={b.val}
                      type="button"
                      onClick={() => updateSetting('botCount', b.val)}
                      style={{
                        backgroundColor: settings.botCount === b.val ? '#7fed4c' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.botCount === b.val ? '#56a130' : '#111',
                        color: settings.botCount === b.val ? '#1e4612' : '#aaa',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="py-1 text-[11px] font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-white/60 block mb-1">AI Difficulty:</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'easy' as const, label: 'Easy' },
                    { id: 'normal' as const, label: 'Normal' },
                    { id: 'hard' as const, label: 'Hard' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => updateSetting('botDifficulty', d.id)}
                      style={{
                        backgroundColor: settings.botDifficulty === d.id ? '#eaec4b' : 'rgba(0,0,0,0.4)',
                        borderColor: settings.botDifficulty === d.id ? '#a1a130' : '#111',
                        color: settings.botDifficulty === d.id ? '#686a24' : '#aaa',
                        borderBottomWidth: '3px',
                        borderBottomStyle: 'solid',
                      }}
                      className="py-1 text-xs font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 7. "No Skin" Custom Color */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs sm:text-sm">🎨 "No Skin" Custom Color</span>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    Colors your player when "No skin" is selected.
                  </p>
                </div>
                <div
                  className="w-7 h-7 rounded-lg shadow-inner border-2 border-white/40 flex items-center justify-center shrink-0"
                  style={{ backgroundColor: settings.customColor || '#00e5ff' }}
                >
                  <div className="w-2.5 h-2.5 rounded-xs bg-black/60" />
                </div>
              </div>

              {/* Hex and picker row */}
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={settings.customColor || '#00e5ff'}
                  onChange={(e) => {
                    updateSetting('customColor', e.target.value);
                    updateSetting('useRandomColor', false);
                  }}
                  className="w-7 h-7 p-0.5 bg-black/40 rounded-lg border border-white/20 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  maxLength={7}
                  value={settings.customColor || '#00e5ff'}
                  onChange={(e) => {
                    updateSetting('customColor', e.target.value);
                    updateSetting('useRandomColor', false);
                  }}
                  placeholder="#00e5ff"
                  className="flex-1 py-1 px-2 bg-black/40 text-white font-mono text-xs font-bold rounded-lg border border-white/20 uppercase focus:outline-none focus:border-[#eaec4b]"
                />
                <button
                  type="button"
                  onClick={handleRandomizeColor}
                  style={{
                    backgroundColor: '#eaec4b',
                    borderColor: '#a1a130',
                    color: '#686a24',
                    borderBottomWidth: '3px',
                    borderBottomStyle: 'solid',
                  }}
                  className="px-2.5 py-1 font-bold text-xs rounded-lg active:border-b-0 active:translate-y-0.5 cursor-pointer whitespace-nowrap"
                >
                  🎲 Random
                </button>
              </div>

              {/* Preset swatches */}
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      updateSetting('customColor', c);
                      updateSetting('useRandomColor', false);
                    }}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                      (settings.customColor || '#00e5ff').toLowerCase() === (c || '').toLowerCase() &&
                      !settings.useRandomColor
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-black/50 opacity-90 hover:opacity-100'
                    }`}
                    title={c}
                  />
                ))}
              </div>

              {/* Random per round toggle */}
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-[11px] text-white/70">Randomize Each Round:</span>
                <button
                  type="button"
                  onClick={() => updateSetting('useRandomColor', !settings.useRandomColor)}
                  style={{
                    backgroundColor: settings.useRandomColor ? '#7fed4c' : 'rgba(0,0,0,0.4)',
                    borderColor: settings.useRandomColor ? '#56a130' : '#111',
                    color: settings.useRandomColor ? '#1e4612' : '#aaa',
                    borderBottomWidth: '2px',
                    borderBottomStyle: 'solid',
                  }}
                  className="px-2.5 py-0.5 text-xs font-bold rounded cursor-pointer"
                >
                  {settings.useRandomColor ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Footer Buttons: Restart Game & Save/Play */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/15">
              {/* Restart Game Button */}
              <button
                type="button"
                onClick={handleRestartGame}
                style={{
                  backgroundColor: '#ff972f',
                  borderColor: '#ae4e0d',
                  color: '#422100',
                  borderBottomWidth: '4px',
                  borderBottomStyle: 'solid',
                }}
                className="px-4 py-2 rounded-xl font-bold text-xs tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all flex items-center gap-1.5"
                title="Restart Game from Scratch"
              >
                <span>🔄</span>
                <span>RESTART GAME</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3.5 py-2 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  CLOSE
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndPlay}
                  style={{
                    backgroundColor: '#7fed4c',
                    borderColor: '#56a130',
                    color: '#1e4612',
                    borderBottomWidth: '4px',
                    borderBottomStyle: 'solid',
                  }}
                  className="px-5 py-2 rounded-xl font-bold text-sm tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all"
                >
                  SAVE & PLAY
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
