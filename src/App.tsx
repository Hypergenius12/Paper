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
  playerName: string;
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
  playerName: 'Player',
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
  const [chatOpen, setChatOpen] = useState(false);
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
          playerName: parsed.playerName || 'Player',
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
      } catch {}
    };
    fetchPublic();
    const iv = setInterval(fetchPublic, 5000);
    return () => clearInterval(iv);
  }, [isPartyOpen, isPartyJoined]);

  // Keep window.paperSettings & DOM in sync
  useEffect(() => {
    try {
      localStorage.setItem('paperio_settings', JSON.stringify(settings));
    } catch {}
    (window as any).paperSettings = { ...settings };

    // Update nick input if exists
    const nickEl = document.getElementById('nick') as HTMLInputElement;
    if (nickEl && settings.playerName && nickEl.value !== settings.playerName) {
      nickEl.value = settings.playerName;
    }
  }, [settings]);

  // Monitor DOM for player nickname changes
  useEffect(() => {
    const syncNickFromDOM = () => {
      const nickEl = document.getElementById('nick') as HTMLInputElement;
      if (nickEl && nickEl.value && nickEl.value.trim() && nickEl.value !== settings.playerName) {
        setSettings((prev) => ({ ...prev, playerName: nickEl.value.trim() }));
      }
    };
    const interval = setInterval(syncNickFromDOM, 1000);
    return () => clearInterval(interval);
  }, [settings.playerName]);

  // Disable #play button when guest is in party (must wait for host)
  useEffect(() => {
    const playBtn = document.getElementById('play') as HTMLButtonElement;
    if (!playBtn) return;

    if (isPartyJoined && !isHost) {
      playBtn.disabled = true;
      playBtn.style.opacity = '0.5';
      playBtn.style.cursor = 'not-allowed';
      playBtn.title = 'Waiting for party host to start match!';
    } else {
      playBtn.disabled = false;
      playBtn.style.opacity = '1';
      playBtn.style.cursor = 'pointer';
      playBtn.title = '';
    }
  }, [isPartyJoined, isHost]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatOpen && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  // Listen for game start / end events
  useEffect(() => {
    const handleGameStart = () => {
      setIsPlaying(true);
      setIsOpen(false);
      setIsPartyOpen(false);
    };

    window.addEventListener('paperio_game_start', handleGameStart);

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
    setIsPartyOpen(false);
    setIsPlaying(true);
    if (typeof (window as any).StartGame === 'function') {
      (window as any).StartGame();
    }
  };

  const handleRestartGame = () => {
    setIsOpen(false);
    setIsPartyOpen(false);
    setIsPlaying(true);
    if (typeof (window as any).RestartGame === 'function') {
      (window as any).RestartGame();
    } else if (typeof (window as any).StartGame === 'function') {
      (window as any).StartGame();
    }
  };

  // Leave party
  const handleLeaveParty = () => {
    cleanupConnections();
    setIsPartyJoined(false);
    setIsHost(false);
    setPartyCode('');
    setPartyMembers([]);
    setChatMessages([]);
    setConnectionStatus('Offline');
    setConnectionType('none');
    setChatOpen(false);
    setUnreadCount(0);
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

    const nick = (document.getElementById('nick') as HTMLInputElement)?.value || settings.playerName || 'Player';
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
        setConnectionStatus('Online (Server Relay)');

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
        setConnectionStatus('Online (WebRTC Direct)');
        setIsPartyJoined(true);
        setPartyCode(code);

        if (partyTab === 'create') {
          setIsHost(true);
          setPartyMembers([{ ...me, isHost: true }]);

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
                        type: 'party_members_updated',
                        members: updated,
                        settings,
                      });
                    }
                  });
                  return updated;
                });
              } else if (data && data.type === 'chat') {
                broadcastP2PChat(data.message);
              }
            });
          });
        } else {
          // Guest connecting to Host
          const hostPeerId = `paper2-room-${code}`;
          const conn = peer.connect(hostPeerId, { reliable: true });
          p2pConnectionsRef.current = [conn];

          conn.on('open', () => {
            setIsHost(false);
            conn.send({
              type: 'guest_join',
              name: me.name,
              color: me.color,
              password: passwordAttempt !== undefined ? passwordAttempt : joinPassword,
            });
          });

          conn.on('data', (data: any) => {
            if (data.type === 'party_error') {
              setPartyError(data.message);
              setConnectionStatus('Failed');
            } else if (data.type === 'party_members_updated') {
              setPartyMembers(data.members || []);
            } else if (data.type === 'party_chat_message') {
              setChatMessages((prev) => [...prev, data.message]);
              if (!chatOpen) setUnreadCount((c) => c + 1);
            } else if (data.type === 'party_match_started') {
              handleSaveAndPlay();
            }
          });
        }
      });

      peer.on('error', (err: any) => {
        setPartyError(err.type === 'unavailable-id' ? 'Party code already in use!' : 'P2P Connection failed');
        setConnectionStatus('Failed');
      });
    } catch (err: any) {
      setPartyError('Could not initialize P2P');
      setConnectionStatus('Failed');
    }
  };

  const broadcastP2PChat = (chatMsg: ChatMessage) => {
    setChatMessages((prev) => [...prev, chatMsg]);
    p2pConnectionsRef.current.forEach((c) => {
      if (c.open) {
        c.send({ type: 'party_chat_message', message: chatMsg });
      }
    });
  };

  const handleCreateParty = () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    setPartyCode(code);
    connectToParty(code);
  };

  const handleJoinParty = () => {
    if (!joinInput.trim()) {
      setPartyError('Please enter a party code');
      return;
    }
    connectToParty(joinInput, joinPassword);
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('party', partyCode);
    if (isPrivateLobby && partyPassword) {
      url.searchParams.set('pass', partyPassword);
    }
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const nick = (document.getElementById('nick') as HTMLInputElement)?.value || settings.playerName || 'Player';
    const newMsg: ChatMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      sender: nick,
      color: settings.customColor,
      text: chatInput.trim(),
      timestamp: Date.now(),
    };

    if (connectionType === 'cloud' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'party_chat',
          text: newMsg.text,
        })
      );
    } else if (connectionType === 'p2p') {
      if (isHost) {
        broadcastP2PChat(newMsg);
      } else if (p2pConnectionsRef.current[0]?.open) {
        p2pConnectionsRef.current[0].send({ type: 'chat', message: newMsg });
        setChatMessages((prev) => [...prev, newMsg]);
      }
    } else {
      setChatMessages((prev) => [...prev, newMsg]);
    }

    setChatInput('');
  };

  const handleHostStartGame = () => {
    if (connectionType === 'cloud' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start_party_match' }));
    } else if (connectionType === 'p2p') {
      p2pConnectionsRef.current.forEach((c) => {
        if (c.open) c.send({ type: 'party_match_started' });
      });
    }
    handleSaveAndPlay();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      {/* Top Header Dock (Clean, Uncluttered, Resilient) */}
      {!isPlaying && (
        <header className="absolute top-3 inset-x-3 pointer-events-auto flex items-center justify-between gap-2 max-w-5xl mx-auto z-40">
          {/* Left: Party Status / Room Badge */}
          {isPartyJoined ? (
            <div className="flex items-center gap-2 bg-[#1e2329]/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-[#33cdcf]/40 shadow-xl text-white text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-base leading-none">🎉</span>
                <div>
                  <div className="font-bold text-[#33cdcf] font-mono tracking-wider flex items-center gap-1">
                    ROOM: {partyCode}
                    {isPrivateLobby && <span className="text-[10px] text-amber-400" title="Private Room">🔒</span>}
                  </div>
                  <div className="text-[10px] text-white/60">
                    {partyMembers.length} {partyMembers.length === 1 ? 'Player' : 'Players'}
                  </div>
                </div>
              </div>

              {/* Player dots */}
              <div className="hidden sm:flex items-center gap-1 max-w-[200px] overflow-x-auto pl-2 border-l border-white/10">
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

              {/* Host Start Match vs Waiting Banner */}
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
                  className="px-3 py-1 rounded-xl font-bold text-xs tracking-wider shadow-md active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all whitespace-nowrap"
                >
                  ▶ START MATCH
                </button>
              ) : (
                <div className="px-2.5 py-1 bg-amber-500/20 text-amber-300 font-bold text-[11px] rounded-xl border border-amber-500/30 flex items-center gap-1 whitespace-nowrap animate-pulse">
                  <span>⏳</span>
                  <span>WAITING FOR HOST...</span>
                </div>
              )}

              {/* Leave Button */}
              <button
                type="button"
                onClick={handleLeaveParty}
                className="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-xl border border-red-500/30 font-bold text-[11px] cursor-pointer"
                title="Leave Party"
              >
                🚪 LEAVE
              </button>
            </div>
          ) : (
            <div />
          )}

          {/* Right: Main Top Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
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
                fontFamily: "'PT Sans Caption', system-ui, sans-serif",
                backgroundColor: '#33cdcf',
                borderColor: '#218c8f',
                color: '#063a3b',
                borderBottomWidth: '4px',
                borderBottomStyle: 'solid',
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold tracking-wide shadow-lg hover:brightness-105 active:translate-y-0.5 active:border-b-0 cursor-pointer transition-all"
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
                fontFamily: "'PT Sans Caption', system-ui, sans-serif",
                backgroundColor: '#eaec4b',
                borderColor: '#a1a130',
                color: '#888a34',
                borderBottomWidth: '4px',
                borderBottomStyle: 'solid',
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold tracking-wide shadow-lg hover:brightness-105 active:translate-y-0.5 active:border-b-0 cursor-pointer transition-all"
              title="Open Game Settings"
            >
              <span className="text-base leading-none">⚙</span>
              <span>SETTINGS</span>
            </button>
          </div>
        </header>
      )}

      {/* Home Screen Party Chat (Bottom-Left Dock) */}
      {!isPlaying && isPartyJoined && (
        <div className="absolute bottom-3 left-3 pointer-events-auto z-40 flex flex-col items-start gap-1">
          {/* Chat Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setChatOpen(!chatOpen);
              if (!chatOpen) setUnreadCount(0);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2329]/95 hover:bg-[#1e2329] text-white rounded-xl border border-white/20 text-xs font-bold shadow-xl cursor-pointer transition-all"
          >
            <span>💬</span>
            <span>PARTY CHAT</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white text-[10px] rounded-full font-bold animate-pulse">
                {unreadCount}
              </span>
            )}
            <span className="text-[10px] text-white/50">{chatOpen ? '▼' : '▲'}</span>
          </button>

          {/* Chat Box */}
          {chatOpen && (
            <div className="w-72 sm:w-80 h-56 bg-[#161a1e]/95 backdrop-blur-md rounded-2xl border-2 border-white/15 shadow-2xl flex flex-col overflow-hidden text-xs text-white">
              <div className="p-2 border-b border-white/10 flex items-center justify-between bg-black/40">
                <span className="font-bold text-[#33cdcf]">Party Messages ({partyCode})</span>
                <span className="text-[10px] text-white/50">{connectionStatus}</span>
              </div>

              {/* Messages History */}
              <div className="flex-1 p-2.5 overflow-y-auto flex flex-col gap-1.5 text-[11px]">
                {chatMessages.length === 0 ? (
                  <div className="text-white/40 italic text-center my-auto">
                    No messages yet. Say hi to your lobby!
                  </div>
                ) : (
                  chatMessages.map((m) => (
                    <div key={m.id} className="leading-snug bg-black/30 p-1.5 rounded-lg border border-white/5">
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

      {/* Party Modal */}
      {isPartyOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            style={{
              fontFamily: "'PT Sans Caption', system-ui, sans-serif",
              backgroundColor: '#1e2329',
              borderColor: '#12161a',
            }}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto text-white rounded-2xl border-4 shadow-2xl p-4 sm:p-5 flex flex-col gap-3 text-xs sm:text-sm"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/15">
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

            {/* Tab: CREATE */}
            {partyTab === 'create' && (
              <div className="flex flex-col gap-3">
                {/* Active Room Code & Share Link */}
                {partyCode ? (
                  <div className="bg-black/40 p-3 rounded-xl border border-white/10 flex flex-col gap-2">
                    <span className="text-[11px] text-white/60">Your Party Code:</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-2xl font-extrabold tracking-widest text-[#33cdcf]">
                        {partyCode}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(partyCode);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs cursor-pointer"
                        >
                          {copied ? '✓ COPIED' : 'COPY CODE'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="px-2.5 py-1 bg-[#33cdcf]/20 hover:bg-[#33cdcf]/30 text-[#33cdcf] rounded-lg font-bold text-xs cursor-pointer border border-[#33cdcf]/40"
                        >
                          🔗 COPY LINK
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateParty}
                    style={{
                      backgroundColor: '#33cdcf',
                      borderColor: '#218c8f',
                      color: '#063a3b',
                      borderBottomWidth: '4px',
                      borderBottomStyle: 'solid',
                    }}
                    className="w-full py-2.5 rounded-xl font-bold text-sm tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all text-center"
                  >
                    GENERATE PARTY ROOM
                  </button>
                )}

                {/* Privacy Toggle: Public vs Private (needs pass) */}
                <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white text-xs sm:text-sm">
                        {isPrivateLobby ? '🔒 Private Lobby' : '🌐 Public Lobby'}
                      </span>
                      <p className="text-[11px] text-white/60">
                        {isPrivateLobby
                          ? 'Only players with password can join'
                          : 'Visible in the Public Parties list for everyone'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPrivateLobby(!isPrivateLobby)}
                      style={{
                        backgroundColor: isPrivateLobby ? '#ffd600' : 'rgba(0,0,0,0.4)',
                        borderColor: isPrivateLobby ? '#a18800' : '#222',
                        color: isPrivateLobby ? '#4a3d00' : '#aaa',
                        borderBottomWidth: '2px',
                        borderBottomStyle: 'solid',
                      }}
                      className="px-3 py-1 rounded-lg font-bold text-xs cursor-pointer"
                    >
                      {isPrivateLobby ? 'PRIVATE' : 'PUBLIC'}
                    </button>
                  </div>

                  {isPrivateLobby && (
                    <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                      <span className="text-[11px] text-white/70">Password:</span>
                      <input
                        type="text"
                        maxLength={20}
                        value={partyPassword}
                        onChange={(e) => setPartyPassword(e.target.value)}
                        placeholder="Enter lobby password"
                        className="flex-1 px-2.5 py-1 bg-black/50 text-white rounded-lg border border-white/20 text-xs focus:outline-none focus:border-[#33cdcf]"
                      />
                    </div>
                  )}
                </div>

                {/* Party Members in Lobby */}
                {isPartyJoined && (
                  <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
                    <span className="text-[11px] text-white/60">
                      Active Players in Lobby ({partyMembers.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {partyMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-black/50 rounded-xl border border-white/10 text-xs"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: m.color || '#33cdcf' }}
                          />
                          <span className="font-bold">{m.name}</span>
                          {m.isHost && (
                            <span className="text-[10px] text-amber-400 bg-amber-400/20 px-1 py-0.2 rounded font-bold">
                              HOST 👑
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: JOIN */}
            {partyTab === 'join' && (
              <div className="flex flex-col gap-3">
                <div className="bg-black/30 p-3 rounded-xl border border-white/10 flex flex-col gap-2.5">
                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Enter 4-Letter Code:</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={joinInput}
                      onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                      placeholder="e.g. ABCD"
                      className="w-full py-2 px-3 bg-black/50 text-white font-mono text-xl font-bold tracking-widest text-center rounded-xl border border-white/20 focus:outline-none focus:border-[#33cdcf] uppercase"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Password (if private):</label>
                    <input
                      type="password"
                      maxLength={20}
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      placeholder="Leave blank if public"
                      className="w-full py-1.5 px-3 bg-black/50 text-white text-xs rounded-xl border border-white/20 focus:outline-none focus:border-[#33cdcf]"
                    />
                  </div>

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
                    className="w-full py-2 rounded-xl font-bold text-sm tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all mt-1"
                  >
                    JOIN LOBBY
                  </button>
                </div>
              </div>
            )}

            {/* Tab: PUBLIC */}
            {partyTab === 'public' && (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                {publicParties.length === 0 ? (
                  <div className="p-6 text-center text-white/50 italic bg-black/20 rounded-xl border border-white/5">
                    No active public parties right now.
                    <br />
                    Click <b className="text-[#33cdcf]">CREATE</b> to host your own!
                  </div>
                ) : (
                  publicParties.map((p) => (
                    <div
                      key={p.code}
                      className="p-2.5 bg-black/40 rounded-xl border border-white/10 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-[#33cdcf]">{p.code}</span>
                        <span className="text-[11px] text-white/60">
                          👤 {p.memberCount} {p.memberCount === 1 ? 'player' : 'players'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setJoinInput(p.code);
                          connectToParty(p.code);
                        }}
                        className="px-3 py-1 bg-[#33cdcf] hover:bg-[#2bbac1] text-[#063a3b] font-bold text-xs rounded-lg cursor-pointer"
                      >
                        JOIN
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/15">
              {isPartyJoined ? (
                <button
                  type="button"
                  onClick={handleLeaveParty}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 font-bold text-xs rounded-xl cursor-pointer border border-red-500/30"
                >
                  🚪 LEAVE PARTY
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsPartyOpen(false)}
                  className="px-3.5 py-1.5 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  CLOSE
                </button>
                {isHost && isPartyJoined && (
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
                    className="px-4 py-1.5 rounded-xl font-bold text-xs tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all"
                  >
                    START MATCH ▶
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            style={{
              fontFamily: "'PT Sans Caption', system-ui, sans-serif",
              backgroundColor: '#1e2329',
              borderColor: '#12161a',
            }}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto text-white rounded-2xl border-4 shadow-2xl p-4 sm:p-5 flex flex-col gap-3 text-xs sm:text-sm"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/15">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙</span>
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

            {/* 1. Modes: Zen & Invincible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Zen Mode */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs sm:text-sm">🧘 Zen Mode</span>
                  <p className="text-[11px] text-white/60">No enemy bots spawn</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('zenMode', !settings.zenMode)}
                  style={{
                    backgroundColor: settings.zenMode ? '#7fed4c' : 'rgba(0,0,0,0.4)',
                    borderColor: settings.zenMode ? '#56a130' : '#111',
                    color: settings.zenMode ? '#1e4612' : '#aaa',
                    borderBottomWidth: '2px',
                    borderBottomStyle: 'solid',
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer"
                >
                  {settings.zenMode ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Invincible Mode */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs sm:text-sm">🛡 Invincible</span>
                  <p className="text-[11px] text-white/60">Trail cannot be cut</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('invincible', !settings.invincible)}
                  style={{
                    backgroundColor: settings.invincible ? '#7fed4c' : 'rgba(0,0,0,0.4)',
                    borderColor: settings.invincible ? '#56a130' : '#111',
                    color: settings.invincible ? '#1e4612' : '#aaa',
                    borderBottomWidth: '2px',
                    borderBottomStyle: 'solid',
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer"
                >
                  {settings.invincible ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* 2. Arena Size & Infinite Arena */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs sm:text-sm">🌐 Arena Size</span>
                <span className="text-xs text-[#eaec4b] font-bold capitalize">
                  {settings.arenaSize} Arena
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
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
                      borderBottomWidth: '3px',
                      borderBottomStyle: 'solid',
                    }}
                    className="py-1 text-xs font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Infinite Arena Looping Toggle */}
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <div>
                  <span className="font-bold text-white text-xs">♾️ Infinite Looping Arena</span>
                  <p className="text-[11px] text-white/60">Arena boundaries wrap around seamlessly</p>
                </div>
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
                  className="px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer"
                >
                  {settings.infiniteArena ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* 3. Movement Speed: 1.0, 1.5, 2.0, 5.0 */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs sm:text-sm">⚡ Movement Speed</span>
                <span className="text-xs text-[#eaec4b] font-bold">{settings.speed.toFixed(1)}x</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1.0, 1.5, 2.0, 5.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateSetting('speed', s)}
                    style={{
                      backgroundColor: settings.speed === s ? '#eaec4b' : 'rgba(0,0,0,0.4)',
                      borderColor: settings.speed === s ? '#a1a130' : '#111',
                      color: settings.speed === s ? '#686a24' : '#aaa',
                      borderBottomWidth: '3px',
                      borderBottomStyle: 'solid',
                    }}
                    className="py-1 text-xs font-bold rounded-lg cursor-pointer active:border-b-0 active:translate-y-0.5 text-center"
                  >
                    {s.toFixed(1)}x
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Trail Width & Theme */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

              {/* Theme */}
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

            {/* 5. Bot Settings */}
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

            {/* 6. "No Skin" Custom Color */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs sm:text-sm">🎨 "No Skin" Player & Area Color</span>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    Colors both your player cube and captured territory.
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
