import React, { useState } from 'react';
import { X, Users, Copy, Check, Play, Send, Plus, LogIn } from 'lucide-react';
import { MultiplayerClient, MultiplayerPlayer } from '../game/multiplayerClient';
import { ChatMessage } from '../game/types';
import { sounds } from '../game/audio';

interface LobbyModalProps {
  client: MultiplayerClient;
  playerName: string;
  currentSkinId: string;
  roomCode: string | null;
  players: MultiplayerPlayer[];
  chatMessages: ChatMessage[];
  isHost: boolean;
  onClose: () => void;
  onStartMultiplayerGame: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  client,
  playerName,
  currentSkinId,
  roomCode,
  players,
  chatMessages,
  isHost,
  onClose,
  onStartMultiplayerGame,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(roomCode ? 'create' : 'join');
  const [inputCode, setInputCode] = useState('');
  const [botCount, setBotCount] = useState(4);
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleCreateRoom = async () => {
    sounds.playClick();
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      await client.createRoom(playerName, currentSkinId, botCount);
    } catch {
      setErrorMsg('Could not connect to multiplayer server.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!inputCode.trim()) return;
    sounds.playClick();
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      await client.joinRoom(inputCode.trim(), playerName, currentSkinId);
    } catch {
      setErrorMsg('Could not join room. Verify code.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopyLink = () => {
    if (!roomCode) return;
    sounds.playClick();
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    client.sendChat(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col max-h-[90vh] text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Fredoka'] text-2xl font-bold tracking-tight">
                Play With Friends
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time private room conquest
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* If NOT inside a room yet: Tabs to Create or Join */}
        {!roomCode ? (
          <div className="flex flex-col gap-5 my-6">
            <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-xl border border-slate-700">
              <button
                onClick={() => {
                  sounds.playClick();
                  setActiveTab('create');
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'create'
                    ? 'bg-sky-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Create Room</span>
              </button>
              <button
                onClick={() => {
                  sounds.playClick();
                  setActiveTab('join');
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'join'
                    ? 'bg-sky-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Join Room</span>
              </button>
            </div>

            {activeTab === 'create' ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Bot Fillers (offline bots inside room)
                  </label>
                  <div className="flex items-center gap-2">
                    {[0, 2, 4, 6, 8].map((num) => (
                      <button
                        key={num}
                        onClick={() => {
                          sounds.playClick();
                          setBotCount(num);
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          botCount === num
                            ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {num === 0 ? 'No Bots' : `${num} Bots`}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleCreateRoom}
                  disabled={isConnecting}
                  className="mt-2 w-full py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-['Fredoka'] font-bold text-base shadow-lg shadow-sky-500/25 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span>{isConnecting ? 'Creating...' : 'CREATE ROOM'}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Room Code (5 letters)
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="e.g. LION4"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-center font-mono text-xl tracking-widest text-white uppercase focus:outline-none focus:border-sky-400"
                  />
                </div>

                <button
                  onClick={handleJoinRoom}
                  disabled={isConnecting || inputCode.trim().length === 0}
                  className="mt-2 w-full py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-['Fredoka'] font-bold text-base shadow-lg shadow-sky-500/25 transition-transform active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn className="w-5 h-5 stroke-[2.5]" />
                  <span>{isConnecting ? 'Joining...' : 'JOIN ROOM'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Inside Room Lobby */
          <div className="flex flex-col gap-4 my-5 flex-1 overflow-hidden">
            {/* Room Code Card */}
            <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                  Room Code
                </span>
                <div className="font-mono text-2xl font-bold tracking-widest text-sky-400">
                  {roomCode}
                </div>
              </div>
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-200 border border-slate-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Players List */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-400">
                Connected Players ({players.length}/12)
              </span>
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="font-semibold text-white">{p.name}</span>
                    </div>
                    {p.id === client.playerId && (
                      <span className="text-[11px] text-sky-400 font-bold">(You)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Room Chat */}
            <div className="flex-1 flex flex-col bg-slate-950/40 rounded-2xl border border-slate-800 p-3 min-h-[120px] max-h-40 overflow-hidden">
              <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1 text-xs">
                {chatMessages.length === 0 ? (
                  <span className="text-slate-500 italic text-center my-auto">
                    Say hello or pick quick taunts!
                  </span>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="text-[12px]">
                      <span className="font-bold text-sky-400">{msg.senderName}: </span>
                      <span className="text-slate-200">{msg.text}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Chat Input & Quick Reaction chips */}
              <div className="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {['Ready! 🚀', 'Watch your tail! 🐍', 'GG! 👑', 'Good luck! ✨'].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => client.sendChat(chip)}
                      className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 shrink-0 cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleSendChat} className="flex gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type message..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-white border border-slate-700 focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="submit"
                    className="p-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>

            {/* Start Game Button (Host only) or Waiting notice */}
            {isHost ? (
              <button
                onClick={() => {
                  sounds.playClick();
                  onStartMultiplayerGame();
                }}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-['Fredoka'] font-bold text-base shadow-lg shadow-emerald-500/25 transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                <span>START MATCH</span>
              </button>
            ) : (
              <div className="text-center py-2 text-xs text-slate-400 italic">
                Waiting for host to start the game...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
