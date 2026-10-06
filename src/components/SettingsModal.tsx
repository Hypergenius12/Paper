import React from 'react';
import { X, Volume2, VolumeX, Shield, Smartphone, Palette } from 'lucide-react';
import { GameSettings, ControlType, ThemeType } from '../game/types';
import { sounds } from '../game/audio';

interface SettingsModalProps {
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col max-h-[90vh] text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="font-['Fredoka'] text-2xl font-bold tracking-tight text-white">
              Game Settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize audio, bots, controls, and themes
            </p>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-5 pr-1">
          {/* Audio & SFX */}
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
              Audio &amp; SFX
            </span>
            <div className="p-3.5 bg-slate-800/40 rounded-2xl border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-sky-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-500" />
                  )}
                  <span>Sound Effects</span>
                </div>
                <button
                  onClick={() => {
                    sounds.playClick();
                    onUpdateSettings({ soundEnabled: !settings.soundEnabled });
                  }}
                  className={`w-12 h-6.5 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
                    settings.soundEnabled ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                      settings.soundEnabled ? 'translate-x-5.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.soundEnabled && (
                <div className="flex items-center gap-3 pt-2 border-t border-slate-800/60">
                  <span className="text-xs text-slate-400">Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.soundVolume}
                    onChange={(e) => onUpdateSettings({ soundVolume: parseFloat(e.target.value) })}
                    className="flex-1 accent-sky-400 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-300 w-8 text-right">
                    {Math.round(settings.soundVolume * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Offline Bot Configuration */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-slate-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Offline Bots</span>
            </div>

            {/* Difficulty Tabs */}
            <div className="p-3.5 bg-slate-800/40 rounded-2xl border border-slate-800 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-300 font-semibold">AI Difficulty</span>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900/60 rounded-xl border border-slate-800">
                  {(['easy', 'medium', 'hard'] as const).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => {
                        sounds.playClick();
                        onUpdateSettings({ botDifficulty: diff });
                      }}
                      className={`py-1.5 text-xs font-bold rounded-lg transition-colors capitalize cursor-pointer ${
                        settings.botDifficulty === diff
                          ? 'bg-sky-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Count */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/60">
                <span className="text-xs text-slate-300 font-semibold">Arena Bot Population</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[4, 8, 12, 16].map((count) => (
                    <button
                      key={count}
                      onClick={() => {
                        sounds.playClick();
                        onUpdateSettings({ botCount: count });
                      }}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                        settings.botCount === count
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-white'
                      }`}
                    >
                      {count} Bots
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Controls Mode */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-slate-400">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Control Mode</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-800/40 rounded-2xl border border-slate-800">
              {(
                [
                  { id: 'mouse', label: 'Mouse' },
                  { id: 'keyboard', label: 'WASD / Keys' },
                  { id: 'joystick', label: 'Touch Drag' },
                ] as { id: ControlType; label: string }[]
              ).map((ctrl) => (
                <button
                  key={ctrl.id}
                  onClick={() => {
                    sounds.playClick();
                    onUpdateSettings({ controls: ctrl.id });
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                    settings.controls === ctrl.id
                      ? 'bg-sky-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {ctrl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Arena Visual Theme */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-slate-400">
              <Palette className="w-3.5 h-3.5" />
              <span>Arena Theme</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'paper-light', label: 'Classic Paper (Light)' },
                  { id: 'blueprint-dark', label: 'Blueprint (Dark)' },
                ] as { id: ThemeType; label: string }[]
              ).map((thm) => (
                <button
                  key={thm.id}
                  onClick={() => {
                    sounds.playClick();
                    onUpdateSettings({ theme: thm.id });
                  }}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition-colors cursor-pointer ${
                    settings.theme === thm.id
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {thm.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-['Fredoka'] font-bold text-sm shadow-lg shadow-sky-500/25 transition-transform active:scale-95 cursor-pointer"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
