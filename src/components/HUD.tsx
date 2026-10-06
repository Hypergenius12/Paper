import React from 'react';
import { Trophy, Skull, Crown, Pause, Settings, Sparkles, Users } from 'lucide-react';
import { KillEvent } from '../game/types';
import { sounds } from '../game/audio';

interface LeaderboardItem {
  id: string;
  name: string;
  percent: number;
  kills: number;
  color: string;
  isPlayer: boolean;
  hasCrown: boolean;
}

interface HUDProps {
  percent: number;
  bestPercent: number;
  kills: number;
  rank: number;
  totalPlayers: number;
  leaderboard: LeaderboardItem[];
  killFeed: KillEvent[];
  isMultiplayer: boolean;
  pingMs?: number;
  roomCode?: string;
  onPause: () => void;
  onOpenSettings: () => void;
  onOpenSkins: () => void;
  onOpenMultiplayer: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  percent,
  bestPercent,
  kills,
  rank,
  totalPlayers,
  leaderboard,
  killFeed,
  isMultiplayer,
  pingMs,
  roomCode,
  onPause,
  onOpenSettings,
  onOpenSkins,
  onOpenMultiplayer,
}) => {
  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden p-3 sm:p-5 flex flex-col justify-between">
      {/* Top Bar Area */}
      <div className="flex items-start justify-between gap-4">
        {/* Top Left: Territory Conquest & Kills Gauge */}
        <div className="flex flex-col gap-2">
          {/* Main Percentage Card */}
          <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl border border-white/10 flex items-center gap-4">
            <div className="relative flex items-center justify-center">
              {/* Radial Progress ring */}
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeWidth="5"
                  fill="transparent"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="#00b4d8"
                  strokeWidth="5"
                  strokeDasharray={163.36}
                  strokeDashoffset={163.36 * (1 - Math.min(100, percent) / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-300 ease-out"
                />
              </svg>
              <div className="absolute text-center">
                <span className="font-['Fredoka'] text-sm font-bold tracking-tight text-white">
                  {percent.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Territory</span>
              <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                <span>Best: {bestPercent.toFixed(1)}%</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span>Rank #{rank}/{totalPlayers}</span>
              </div>
            </div>
          </div>

          {/* Kills Counter & Status */}
          <div className="flex items-center gap-2">
            <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 text-white">
              <Skull className="w-4 h-4 text-rose-400" />
              <span className="font-['Fredoka'] font-bold text-sm">{kills} Kills</span>
            </div>

            {isMultiplayer && (
              <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Room: {roomCode}</span>
                {typeof pingMs === 'number' && (
                  <span className="text-slate-400 font-mono text-[11px]">{pingMs}ms</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Top Center: Kill Feed Toast notifications */}
        <div className="flex flex-col items-center gap-1.5 max-w-sm pointer-events-none mt-1">
          {killFeed.slice(-3).map((evt) => (
            <div
              key={evt.id}
              className="bg-slate-900/90 backdrop-blur-md border border-white/10 text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-1.5"
            >
              <span style={{ color: evt.killerColor }} className="font-bold">
                {evt.killerName}
              </span>
              <span className="text-slate-400">sliced</span>
              <span style={{ color: evt.victimColor }} className="font-bold">
                {evt.victimName}
              </span>
            </div>
          ))}
        </div>

        {/* Top Right: Leaderboard & Controls Toolbar */}
        <div className="flex flex-col items-end gap-2">
          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => {
                sounds.playClick();
                onOpenSkins();
              }}
              title="Change Skin"
              className="p-2.5 bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md text-white rounded-xl border border-white/10 shadow-lg transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Skins</span>
            </button>

            <button
              onClick={() => {
                sounds.playClick();
                onPause();
              }}
              title="Pause Game"
              className="p-2.5 bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md text-white rounded-xl border border-white/10 shadow-lg transition-transform active:scale-95 cursor-pointer"
            >
              <Pause className="w-4 h-4 text-slate-300" />
            </button>
          </div>

          {/* Live Leaderboard */}
          <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl border border-white/10 w-44 sm:w-56">
            <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Trophy className="w-3.5 h-3.5" />
                <span>Leaderboard</span>
              </div>
              <span className="text-[11px] text-slate-400">Top 10</span>
            </div>

            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-0.5">
              {leaderboard.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg transition-colors ${
                    item.isPlayer
                      ? 'bg-sky-500/25 border border-sky-400/40 font-bold text-white'
                      : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate max-w-[120px] sm:max-w-[140px]">
                    <span className="font-mono text-[11px] text-slate-400 w-3.5 text-right">
                      {idx + 1}.
                    </span>

                    {item.hasCrown ? (
                      <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0 fill-amber-400" />
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                    )}

                    <span className="truncate">{item.name}</span>
                  </div>

                  <span className="font-['Fredoka'] font-semibold text-slate-200">
                    {item.percent.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Area: Controls hint */}
      <div className="flex items-end justify-between">
        <div className="pointer-events-none text-slate-400/80 text-xs font-medium backdrop-blur-sm bg-slate-900/40 px-3 py-1.5 rounded-lg border border-white/5">
          <span>Move mouse / drag to steer · Loop back to base to claim land · Bite enemy tails to eliminate!</span>
        </div>
      </div>
    </div>
  );
};
