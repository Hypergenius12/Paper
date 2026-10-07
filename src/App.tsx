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

interface ChatMessage {
  id: string;
  sender: string;
  color: string;
  text: string;
  timestamp: number;
}

interface PublicPartyInfo {
  code: string;
  memberCount: number;
  settings: any;
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
  const [partyTab, setPartyTab] = useState<'create' | 'join' | 'public'>('create');
  const [partyCode, setPartyCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [isPrivateLobby, setIsPrivateLobby] = useState(false);
  const [partyPassword, setPartyPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [isPartyJoined, setIsPartyJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [connectionType, setConnectionType] = useState<'p2p' | 'cloud' | 'none'>('none');
  const [connectionStatus, setConnectionStatus] = useState<string>('Offline');
  const [partyError, setPartyError] = useState<string>('');
  const [publicParties, setPublicParties] = useState<PublicPartyInfo[]>([]);

  // Chat state
  const [chatOpen, setChatOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Network refs
  const wsRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const p2pConnectionsRef = useRef<DataConnection[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

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

  // Check URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('party');
    const passFromUrl = params.get('pass');
    if (codeFromUrl) {
      const clean = codeFromUrl.toUpperCase().trim();
      setJoinInput(clean);
      if (passFromUrl) setJoinPassword(passFromUrl);
      setPartyTab('join');
      setIsPartyOpen(true);
      connectToParty(clean, passFromUrl || '');
    }
  }, []);

  // Fetch public parties periodically
  useEffect(() => {
    if (!isPartyOpen && !isPartyJoined) return;
    const fetchPublic = async () => {
      try {
        const res = await fetch('/api/party/public');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.publicParties)) {
            setPublicParties(data.publicParties);
          }
        }
      } catch (e) {}
    };
    fetchPublic();
    const interval = setInterval(fetchPublic, 5000);
    return () => clearInterval(interval);
  }, [isPartyOpen, isPartyJoined]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatOpen && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

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

  // Leave party
  const handleLeaveParty = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'leave_party' }));
    }
    cleanupConnections();
    setIsPartyJoined(false);
    setIsHost(false);
    setPartyCode('');
    setPartyMembers([]);
    setChatMessages([]);
    setConnectionStatus('Offline');
    setConnectionType('none');
    setPartyError('');
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
    if (isGitHub) return CLOUD_BACKEND_WS;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  // Connect to Party
  const connectToParty = (code: string, passwordAttempt?: string) => {
    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode) return;

    cleanupConnections();
    setPartyError('');
    setConnectionStatus('Connecting...');

    const nick = (document.getElementById('nick') as HTMLInputElement)?.value || 'Player';
    const myPlayer: PartyMember = {
      id: `p-${Math.random().toString(36).substring(2, 7)}`,
      name: nick,
      color: settings.customColor,
      isHost: partyTab === 'create',
    };

    let wsSuccess = false;
    try {
      const targetUrl = getWebSocketUrl();
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        wsSuccess = true;
        setConnectionType('cloud');
        setConnectionStatus('Online (Cloud Relay)');

        ws.send(
          JSON.stringify({
            type: 'join_party',
            partyCode: cleanCode,
            password: passwordAttempt !== undefined ? passwordAttempt : (partyTab === 'create' ? partyPassword : joinPassword),
            name: nick,
            color: settings.customColor,
            partySettings: {
              isPrivate: isPrivateLobby,
              password: partyPassword,
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
          if (msg.type === 'party_error') {
            setPartyError(msg.message || 'Error joining party');
            setConnectionStatus('Failed');
            return;
          }
          if (msg.type === 'party_joined') {
            setPartyCode(msg.partyCode);
            setIsPartyJoined(true);
            setIsHost(!!msg.isHost);
            if (msg.chatHistory) setChatMessages(msg.chatHistory);
          } else if (msg.type === 'party_members_updated') {
            setPartyMembers(msg.members || []);
            if (msg.settings) {
              if (msg.settings.arenaSize) updateSetting('arenaSize', msg.settings.arenaSize);
              if (msg.settings.speedMultiplier) updateSetting('speed', msg.settings.speedMultiplier);
              if (msg.settings.botCount !== undefined) updateSetting('botCount', msg.settings.botCount);
              if (msg.settings.infiniteArena !== undefined) updateSetting('infiniteArena', msg.settings.infiniteArena);
              if (msg.settings.zenMode !== undefined) updateSetting('zenMode', msg.settings.zenMode);
            }
          } else if (msg.type === 'party_chat_message') {
            if (msg.message) {
              setChatMessages((prev) => [...prev, msg.message]);
              if (!chatOpen) setUnreadCount((c) => c + 1);
            }
          } else if (msg.type === 'party_match_started') {
            handleSaveAndPlay();
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        if (!wsSuccess) {
          initPeerJSP2P(cleanCode, myPlayer, passwordAttempt);
        }
      };
    } catch (e) {
      initPeerJSP2P(cleanCode, myPlayer, passwordAttempt);
    }
  };

  // WebRTC PeerJS P2P (Serverless mesh for GitHub Pages)
  const initPeerJSP2P = (code: string, me: PartyMember, passwordAttempt?: string) => {
    setConnectionStatus('Connecting P2P (WebRTC)...');
    const peerId = partyTab === 'create' ? `paper2-room-${code}` : undefined;

    try {
      const peer = peerId ? new Peer(peerId, { debug: 1 }) : new Peer({ debug: 1 });
      peerRef.current = peer;

      peer.on('open', () => {
        setConnectionType('p2p');
        setConnectionStatus('Online (WebRTC P2P Direct)');
        setIsPartyJoined(true);
        setPartyCode(code);

        if (partyTab === 'create') {
          setIsHost(true);
          setPartyMembers([{ ...me, isHost: true }]);

          // Host handles incoming connections
          peer.on('connection', (conn) => {
            p2pConnectionsRef.current.push(conn);
            conn.on('data', (data: any) => {
              if (data && data.type === 'guest_join') {
                if (isPrivateLobby && partyPassword && data.password !== partyPassword) {
                  conn.send({ type: 'party_error', message: 'Incorrect party password!' });
                  return;
                }
                const newMember: PartyMember = {
                  id: conn.peer,
                  name: data.name || 'Friend',
                  color: data.color || '#ff9100',
                  isHost: false,
                };
                setPartyMembers((prev) => {
                  const updated = [...prev.filter((m) => m.id !== newMember.id), newMember];
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
              } else if (data && data.type === 'chat') {
                const msg = data.message;
                setChatMessages((prev) => [...prev, msg]);
                p2pConnectionsRef.current.forEach((c) => {
                  if (c.open) c.send({ type: 'chat', message: msg });
                });
              }
            });
          });
        } else {
          // Guest connecting to host
          const hostPeerId = `paper2-room-${code}`;
          const conn = peer.connect(hostPeerId);
          p2pConnectionsRef.current.push(conn);

          conn.on('open', () => {
            conn.send({
              type: 'guest_join',
              name: me.name,
              color: me.color,
              password: passwordAttempt || joinPassword,
            });
          });

          conn.on('data', (data: any) => {
            if (data && data.type === 'party_error') {
              setPartyError(data.message);
              setConnectionStatus('Failed');
            } else if (data && data.type === 'members_update') {
              setPartyMembers(data.members || []);
            } else if (data && data.type === 'chat') {
              setChatMessages((prev) => [...prev, data.message]);
              if (!chatOpen) setUnreadCount((c) => c + 1);
            } else if (data && data.type === 'start_match') {
              handleSaveAndPlay();
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
    connectToParty(joinInput.trim(), joinPassword);
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const nick = (document.getElementById('nick') as HTMLInputElement)?.value || 'Player';
    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: nick,
      color: settings.customColor,
      text: chatInput.trim(),
      timestamp: Date.now(),
    };

    setChatInput('');

    if (connectionType === 'cloud' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'party_chat', text: newMsg.text }));
    } else if (connectionType === 'p2p') {
      setChatMessages((prev) => [...prev, newMsg]);
      p2pConnectionsRef.current.forEach((conn) => {
        if (conn.open) conn.send({ type: 'chat', message: newMsg });
      });
    }
  };

  const handleCopyPartyLink = () => {
    let url = `${window.location.origin}${window.location.pathname}?party=${partyCode}`;
    if (isPrivateLobby && partyPassword) {
      url += `&pass=${encodeURIComponent(partyPassword)}`;
    }
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Host starts the match for all
  const handleHostStartGame = () => {
    if (!isHost) return;

    if (connectionType === 'cloud' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start_party_match' }));
    } else if (connectionType === 'p2p') {
      p2pConnectionsRef.current.forEach((conn) => {
        if (conn.open) conn.send({ type: 'start_match', settings });
      });
    }

    setIsPartyOpen(false);
    handleSaveAndPlay();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      {/* Home Screen Active Party Dock & Chat (Only when on menu and in a party) */}
      {!isPlaying && isPartyJoined && (
        <div className="absolute top-4 left-4 pointer-events-auto flex flex-col gap-2 z-50">
          {/* Party Lobby Bar */}
          <div className="bg-[#24292e]/95 backdrop-blur-md border-2 border-[#33cdcf]/40 p-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-white text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🎉</span>
              <div>
                <div className="font-bold text-[#33cdcf] font-mono tracking-wider flex items-center gap-1">
                  ROOM: {partyCode}
                  {isPrivateLobby && <span className="text-[10px] text-amber-400">🔒</span>}
                </div>
                <div className="text-[10px] text-white/60">
                  {partyMembers.length} {partyMembers.length === 1 ? 'Player' : 'Players'}
                </div>
              </div>
            </div>

            {/* Players Pills */}
            <div className="hidden sm:flex items-center gap-1 max-w-[200px] overflow-x-auto">
              {partyMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-1 px-2 py-0.5 bg-black/40 rounded-full border border-white/10 text-[11px]"
                  title={m.name}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color || '#33cdcf' }} />
                  <span className="truncate max-w-[60px] font-bold">{m.name}</span>
                  {m.isHost && <span className="text-[9px] text-amber-400">👑</span>}
                </div>
              ))}
            </div>

            {/* Host Start Button vs Guest Waiting Banner */}
            {isHost ? (
              <button
                type="button"
                onClick={handleHostStartGame}
                style={{
                  backgroundColor: '#7fed4c',
                  borderColor: '#56a130',
                  color: '#1e4612',
                  borderBottomWidth: '3px',
                  borderBottomStyle: 'solid',
                }}
                className="px-3.5 py-1.5 rounded-xl font-bold text-xs tracking-wider shadow-md active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all whitespace-nowrap"
              >
                ▶ START MATCH
              </button>
            ) : (
              <div className="px-3 py-1 bg-amber-500/20 text-amber-300 font-bold text-[11px] rounded-xl border border-amber-500/30 flex items-center gap-1.5 whitespace-nowrap animate-pulse">
                <span>⏳</span>
                <span>WAITING FOR HOST...</span>
              </div>
            )}

            {/* Leave Party */}
            <button
              type="button"
              onClick={handleLeaveParty}
              className="px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-xl border border-red-500/30 font-bold text-[11px] cursor-pointer"
              title="Leave this Party"
            >
              🚪 LEAVE
            </button>
          </div>
        </div>
      )}

      {/* Home Screen Chat Window (Bottom-Left) */}
      {!isPlaying && isPartyJoined && (
        <div className="absolute bottom-4 left-4 pointer-events-auto z-50 flex flex-col items-start gap-1">
          {/* Chat Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setChatOpen(!chatOpen);
              if (!chatOpen) setUnreadCount(0);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#24292e]/90 hover:bg-[#24292e] text-white rounded-xl border border-white/20 text-xs font-bold shadow-lg cursor-pointer transition-all"
          >
            <span>💬</span>
            <span>PARTY CHAT</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white text-[10px] rounded-full font-bold">
                {unreadCount}
              </span>
            )}
            <span className="text-[10px] text-white/50">{chatOpen ? '▼' : '▲'}</span>
          </button>

          {/* Chat Box */}
          {chatOpen && (
            <div className="w-72 sm:w-80 h-52 bg-[#1f2327]/95 backdrop-blur-md rounded-2xl border-2 border-white/15 shadow-2xl flex flex-col overflow-hidden text-xs text-white">
              <div className="p-2 border-b border-white/10 flex items-center justify-between bg-black/30">
                <span className="font-bold text-[#33cdcf]">Party Messages ({partyCode})</span>
                <span className="text-[10px] text-white/50">{connectionStatus}</span>
              </div>

              {/* Messages History */}
              <div className="flex-1 p-2.5 overflow-y-auto flex flex-col gap-1.5 text-[11px]">
                {chatMessages.length === 0 ? (
                  <div className="text-white/40 italic text-center my-auto">
                    No messages yet. Say hi to your party!
                  </div>
                ) : (
                  chatMessages.map((m) => (
                    <div key={m.id} className="leading-snug bg-black/20 p-1.5 rounded-lg border border-white/5">
                      <span className="font-bold" style={{ color: m.color || '#33cdcf' }}>
                        {m.sender}:{' '}
                      </span>
                      <span className="text-white/90">{m.text}</span>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendChat} className="p-1.5 border-t border-white/10 flex gap-1.5 bg-black/40">
                <input
                  type="text"
                  maxLength={100}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-2.5 py-1.5 bg-black/50 text-white rounded-lg border border-white/15 focus:outline-none focus:border-[#33cdcf] text-xs"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#33cdcf] hover:bg-[#2bbac1] text-[#063a3b] font-bold rounded-lg cursor-pointer"
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      )}

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

            {/* Error Message */}
            {partyError && (
              <div className="p-2.5 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center justify-between">
                <span>⚠️ {partyError}</span>
                <button
                  type="button"
                  onClick={() => setPartyError('')}
                  className="text-red-300 hover:text-white font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Tabs */}
            <div className="grid grid-cols-3 gap-1.5 bg-black/40 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setPartyTab('create')}
                className={`py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                  partyTab === 'create'
                    ? 'bg-[#33cdcf] text-[#063a3b] shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                CREATE
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
                JOIN CODE
              </button>
              <button
                type="button"
                onClick={() => setPartyTab('public')}
                className={`py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                  partyTab === 'public'
                    ? 'bg-[#33cdcf] text-[#063a3b] shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                PUBLIC ({publicParties.length})
              </button>
            </div>

            {/* Tab 1: Create Party */}
            {partyTab === 'create' && (
              <div className="flex flex-col gap-3">
                {/* Party Code Card */}
                <div className="bg-black/30 p-3 rounded-xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-white/60 block">PARTY CODE:</span>
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

                {/* Public vs Private Lobby Toggle */}
                <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white text-xs">Lobby Privacy:</span>
                      <p className="text-[10px] text-white/60">
                        {isPrivateLobby ? 'Private: Requires password to join.' : 'Public: Anyone can browse and join.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-1 bg-black/50 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setIsPrivateLobby(false)}
                        className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                          !isPrivateLobby ? 'bg-[#33cdcf] text-[#063a3b]' : 'text-white/60'
                        }`}
                      >
                        🌐 Public
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPrivateLobby(true)}
                        className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                          isPrivateLobby ? 'bg-amber-400 text-black' : 'text-white/60'
                        }`}
                      >
                        🔒 Private
                      </button>
                    </div>
                  </div>

                  {/* Password Input (Only when Private) */}
                  {isPrivateLobby && (
                    <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                      <span className="text-[11px] text-white/70 whitespace-nowrap">Passcode / PIN:</span>
                      <input
                        type="text"
                        maxLength={12}
                        value={partyPassword}
                        onChange={(e) => setPartyPassword(e.target.value)}
                        placeholder="e.g. 1234"
                        className="flex-1 py-1 px-2.5 bg-black/50 text-white font-mono text-xs font-bold rounded-lg border border-white/20 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}
                </div>

                {/* Connected Players Roster */}
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

                {/* Host Start Button vs Leave */}
                <div className="flex gap-2">
                  {isPartyJoined && (
                    <button
                      type="button"
                      onClick={handleLeaveParty}
                      className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-xl border border-red-500/30 font-bold text-xs cursor-pointer"
                    >
                      LEAVE
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleHostStartGame}
                    style={{
                      backgroundColor: '#7fed4c',
                      borderColor: '#56a130',
                      color: '#1e4612',
                      borderBottomWidth: '4px',
                      borderBottomStyle: 'solid',
                    }}
                    className="flex-1 py-2.5 rounded-xl font-bold text-base tracking-wider shadow-xl active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all text-center"
                  >
                    START MATCH FOR ALL
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Join Code */}
            {partyTab === 'join' && (
              <div className="flex flex-col gap-3 py-2">
                <p className="text-white/70 text-xs">
                  Enter the Party Code (and passcode if private):
                </p>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                    placeholder="ENTER PARTY CODE (e.g. 7K9Q)"
                    className="w-full py-2.5 px-3 bg-black/40 text-white font-mono text-base font-bold rounded-xl border border-white/20 uppercase tracking-widest focus:outline-none focus:border-[#33cdcf]"
                  />
                  <input
                    type="text"
                    maxLength={12}
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder="PASSCODE (Optional, for private lobbies)"
                    className="w-full py-2 px-3 bg-black/40 text-white font-mono text-xs font-bold rounded-xl border border-white/20 focus:outline-none focus:border-[#33cdcf]"
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
                    className="w-full py-2.5 rounded-xl font-bold text-sm tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all text-center"
                  >
                    JOIN ROOM
                  </button>
                </div>

                {isPartyJoined && partyCode && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div>Connected to Party <strong>{partyCode}</strong>!</div>
                        <div className="text-[10px] text-white/60 mt-0.5">{connectionStatus}</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleLeaveParty}
                        className="px-2.5 py-1 bg-red-500/20 text-red-300 font-bold rounded-lg border border-red-500/30 cursor-pointer text-xs"
                      >
                        LEAVE
                      </button>
                    </div>

                    {/* Guest waiting banner */}
                    {!isHost && (
                      <div className="p-2 bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30 font-bold text-center text-xs animate-pulse">
                        ⏳ Waiting for the Host to start the match...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Public Lobbies List */}
            {partyTab === 'public' && (
              <div className="flex flex-col gap-2.5 py-1 max-h-72 overflow-y-auto">
                <span className="font-bold text-white text-xs">🌐 Open Public Lobbies:</span>
                {publicParties.length === 0 ? (
                  <div className="text-white/50 text-center py-6 italic text-xs">
                    No open public parties right now. Create one in the "CREATE" tab!
                  </div>
                ) : (
                  publicParties.map((p) => (
                    <div
                      key={p.code}
                      className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold font-mono text-[#33cdcf]">ROOM: {p.code}</div>
                        <div className="text-[10px] text-white/60">
                          {p.memberCount} Players • {p.settings?.arenaSize || 'normal'} arena • {p.settings?.speedMultiplier || 1}x speed
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setJoinInput(p.code);
                          connectToParty(p.code);
                        }}
                        className="px-3 py-1.5 bg-[#33cdcf] hover:bg-[#2bbac1] text-[#063a3b] font-bold rounded-lg cursor-pointer"
                      >
                        JOIN
                      </button>
                    </div>
                  ))
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
