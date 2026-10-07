import React, { useState, useEffect } from 'react';

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
  customColor: string;
  useRandomColor: boolean;
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
  customColor: '#00e5ff',
  useRandomColor: false,
};

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [settings, setSettings] = useState<GameSettingsState>(() => {
    try {
      const saved = localStorage.getItem('paperio_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          speed: [1.0, 1.5, 2.0, 5.0].includes(parsed.speed) ? parsed.speed : 1.0,
          trailWidth: typeof parsed.trailWidth === 'number' ? parsed.trailWidth : 8,
          theme: parsed.theme || 'classic',
          zoom: parsed.zoom || 'normal',
          baseSize: parsed.baseSize || 'standard',
          customColor:
            typeof parsed.customColor === 'string' && parsed.customColor
              ? parsed.customColor
              : '#00e5ff',
        };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

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

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      {/* Settings Button: Only shown on main menu when not playing */}
      {!isPlaying && (
        <div className="absolute top-4 right-4 pointer-events-auto">
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold tracking-wide shadow-lg hover:brightness-105 active:translate-y-0.5 active:border-b-0 cursor-pointer transition-all"
            title="Open Game Settings"
          >
            <span className="text-base leading-none">⚙</span>
            <span>SETTINGS</span>
          </button>
        </div>
      )}

      {/* Settings Modal */}
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

            {/* 3. Camera Zoom & Starting Base Size */}
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
                <span className="font-bold text-white text-xs sm:text-sm">🏰 Starting Territory Size</span>
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

            {/* 4. Trail Width & Arena Theme */}
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

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white font-bold text-xs rounded-xl cursor-pointer"
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
                className="px-6 py-2 rounded-xl font-bold text-sm tracking-wider shadow-lg active:translate-y-0.5 active:border-b-0 cursor-pointer hover:brightness-105 transition-all"
              >
                SAVE & PLAY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
