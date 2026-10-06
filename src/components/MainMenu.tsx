import React, { useRef, useEffect } from 'react';
import { Play, Users, Sparkles, Settings, Crown, Zap } from 'lucide-react';
import { getSkinById, drawPlayerAvatar } from '../game/skins';
import { sounds } from '../game/audio';

interface MainMenuProps {
  playerName: string;
  skinId: string;
  bestScore: number;
  onPlayerNameChange: (name: string) => void;
  onPlaySinglePlayer: () => void;
  onOpenMultiplayer: () => void;
  onOpenSkins: () => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  playerName,
  skinId,
  bestScore,
  onPlayerNameChange,
  onPlaySinglePlayer,
  onOpenMultiplayer,
  onOpenSkins,
  onOpenSettings,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const skin = getSkinById(skinId);

  useEffect(() => {
    let animId: number;
    let angle = 0;

    const render = () => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      angle += 0.025;

      drawPlayerAvatar(ctx, cx, cy, 32, angle, skin, true);
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [skin]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playClick();
    onPlaySinglePlayer();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md select-none overflow-y-auto">
      <div className="relative w-full max-w-md flex flex-col items-center text-center my-auto py-6">
        {/* Game Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-8 h-8 text-amber-400 fill-amber-400 animate-bounce" />
          </div>
          <h1 className="font-['Fredoka'] text-5xl sm:text-6xl font-extrabold tracking-tight text-white drop-shadow-md">
            paper<span className="text-sky-400">.io</span> <span className="text-amber-400">2</span>
          </h1>
          <p className="text-xs uppercase tracking-widest font-extrabold text-slate-400 mt-1">
            Arena Conquest · Ad-Free Edition
          </p>
        </div>

        {/* Character Avatar Preview & Skin Change Trigger */}
        <div className="relative mb-6 group">
          <div
            onClick={() => {
              sounds.playClick();
              onOpenSkins();
            }}
            className="w-28 h-28 rounded-3xl bg-slate-900/90 border-2 border-slate-700 hover:border-sky-400 shadow-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-105"
          >
            <canvas ref={previewCanvasRef} width={112} height={112} />
          </div>
          <button
            onClick={() => {
              sounds.playClick();
              onOpenSkins();
            }}
            className="absolute -bottom-2 -right-2 p-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl shadow-lg border border-white/20 transition-transform active:scale-90 cursor-pointer"
            title="Change Skin"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
          </button>
        </div>

        {/* Player Name Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              maxLength={15}
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="Enter your nickname..."
              className="w-full px-5 py-4 rounded-2xl bg-slate-900/90 border border-slate-700 text-center font-['Fredoka'] font-bold text-lg text-white placeholder-slate-500 shadow-inner focus:outline-none focus:border-sky-400 transition-colors"
            />
          </div>

          {/* Big Play Button */}
          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-['Fredoka'] font-extrabold text-2xl tracking-wide shadow-xl shadow-sky-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-3"
          >
            <Play className="w-6 h-6 fill-slate-950" />
            <span>PLAY</span>
          </button>

          {/* Secondary Action Row: Friends & Settings */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onOpenMultiplayer();
              }}
              className="py-3 px-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-white font-['Fredoka'] font-bold text-sm shadow-md transition-all hover:border-slate-600 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span>With Friends</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onOpenSettings();
              }}
              className="py-3 px-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-white font-['Fredoka'] font-bold text-sm shadow-md transition-all hover:border-slate-600 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-slate-300" />
              <span>Settings</span>
            </button>
          </div>
        </form>

        {/* Best Score & Clean Metadata */}
        <div className="mt-8 flex flex-col items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-semibold">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Personal Record: <strong className="text-white">{bestScore.toFixed(1)}%</strong></span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Offline Bots</span>
            <span aria-hidden="true">·</span>
            <span>Zero Ads</span>
            <span aria-hidden="true">·</span>
            <span>Multiplayer Rooms</span>
          </div>
        </div>
      </div>
    </div>
  );
};
