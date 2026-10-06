import React, { useEffect } from 'react';
import { Trophy, Skull, Clock, RotateCcw, Sparkles, Users, Crown } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../game/audio';

interface GameOverModalProps {
  stats: {
    percent: number;
    kills: number;
    rank: number;
    timeAlive: number;
    killerName?: string;
    won: boolean;
  };
  onPlayAgain: () => void;
  onOpenSkins: () => void;
  onOpenMultiplayer: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  stats,
  onPlayAgain,
  onOpenSkins,
  onOpenMultiplayer,
}) => {
  useEffect(() => {
    if (stats.won || stats.rank === 1) {
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
    }
  }, [stats.won, stats.rank]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col text-white text-center">
        {/* Top Trophy or Crown Icon */}
        <div className="mx-auto mb-3 flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700">
          {stats.won || stats.rank === 1 ? (
            <Crown className="w-9 h-9 text-amber-400 fill-amber-400 animate-bounce" />
          ) : (
            <Skull className="w-9 h-9 text-rose-400" />
          )}
        </div>

        {/* Title */}
        <h2 className="font-['Fredoka'] text-3xl font-bold tracking-tight">
          {stats.won
            ? '100% CONQUEST!'
            : stats.rank === 1
            ? 'CHAMPION!'
            : 'GAME OVER'}
        </h2>

        <p className="text-sm text-slate-400 mt-1">
          {stats.won
            ? 'You captured the entire paper arena!'
            : stats.killerName
            ? `Your tail was sliced by ${stats.killerName}`
            : 'Good effort in the arena!'}
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 my-6">
          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center">
            <span className="text-xs uppercase font-bold text-slate-400">Territory</span>
            <span className="font-['Fredoka'] text-2xl font-bold text-sky-400 mt-1">
              {stats.percent.toFixed(1)}%
            </span>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center">
            <span className="text-xs uppercase font-bold text-slate-400">Rank</span>
            <div className="flex items-center gap-1.5 mt-1">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="font-['Fredoka'] text-2xl font-bold text-amber-400">
                #{stats.rank}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center">
            <span className="text-xs uppercase font-bold text-slate-400">Kills</span>
            <div className="flex items-center gap-1.5 mt-1">
              <Skull className="w-4 h-4 text-rose-400" />
              <span className="font-['Fredoka'] text-2xl font-bold text-rose-400">
                {stats.kills}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center">
            <span className="text-xs uppercase font-bold text-slate-400">Time Alive</span>
            <div className="flex items-center gap-1.5 mt-1">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="font-['Fredoka'] text-2xl font-bold text-emerald-400">
                {formatTime(stats.timeAlive)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => {
              sounds.playClick();
              onPlayAgain();
            }}
            className="w-full py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-['Fredoka'] font-bold text-base shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5 stroke-[2.5]" />
            <span>PLAY AGAIN</span>
          </button>

          <button
            onClick={() => {
              sounds.playClick();
              onOpenSkins();
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Select Skin</span>
          </button>
        </div>
      </div>
    </div>
  );
};
