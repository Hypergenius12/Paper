import React, { useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { SKINS, SkinDefinition, drawPlayerAvatar } from '../game/skins';
import { sounds } from '../game/audio';

interface SkinSelectorModalProps {
  currentSkinId: string;
  onSelectSkin: (skinId: string) => void;
  onClose: () => void;
}

export const SkinSelectorModal: React.FC<SkinSelectorModalProps> = ({
  currentSkinId,
  onSelectSkin,
  onClose,
}) => {
  const [selectedId, setSelectedId] = React.useState(currentSkinId);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedSkin = SKINS.find(s => s.id === selectedId) || SKINS[0];

  // Animated live preview rotation of selected skin
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
      angle += 0.02;

      drawPlayerAvatar(
        ctx,
        cx,
        cy,
        28,
        angle,
        selectedSkin,
        selectedSkin.accessory === 'crown'
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [selectedSkin]);

  const handleEquip = (skin: SkinDefinition) => {
    sounds.playClick();
    setSelectedId(skin.id);
    onSelectSkin(skin.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col max-h-[90vh] overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="font-['Fredoka'] text-2xl font-bold tracking-tight text-white">
              Character Skins
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select your customized paper cube style &amp; trail color
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

        {/* Featured Skin Preview Header */}
        <div className="flex flex-col sm:flex-row items-center gap-6 my-6 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
          <div className="w-24 h-24 flex items-center justify-center bg-slate-900 rounded-2xl border border-slate-700 shadow-inner">
            <canvas ref={previewCanvasRef} width={96} height={96} />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h3 className="font-['Fredoka'] text-xl font-bold text-white">
                {selectedSkin.name}
              </h3>
              {selectedId === currentSkinId && (
                <span className="text-xs font-bold text-sky-400 bg-sky-500/20 px-2 py-0.5 rounded-md border border-sky-400/30">
                  EQUIPPED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-1">{selectedSkin.description}</p>
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-3 text-xs text-slate-400">
              <span>Trail Color</span>
              <span
                className="w-4 h-4 rounded-full border border-white/20"
                style={{ backgroundColor: selectedSkin.primaryColor }}
              />
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Eye Style: {selectedSkin.eyeType}</span>
            </div>
          </div>
        </div>

        {/* Skins Grid */}
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {SKINS.map((skin) => {
            const isEquipped = currentSkinId === skin.id;
            const isSelected = selectedId === skin.id;

            return (
              <button
                key={skin.id}
                onClick={() => handleEquip(skin)}
                className={`flex flex-col items-center p-3.5 rounded-2xl border transition-all text-left cursor-pointer group ${
                  isSelected
                    ? 'border-sky-400 bg-sky-500/15 shadow-md shadow-sky-500/10'
                    : 'border-slate-800 bg-slate-800/30 hover:border-slate-700 hover:bg-slate-800/60'
                }`}
              >
                <div
                  className="w-14 h-14 rounded-2xl mb-2.5 shadow-md flex items-center justify-center relative transition-transform group-hover:scale-105 p-1 bg-slate-900 border border-slate-700/80"
                >
                  {skin.icon ? (
                    <img
                      src={skin.icon}
                      alt={skin.name}
                      className="w-full h-full object-contain drop-shadow"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-xl"
                      style={{ backgroundColor: skin.primaryColor }}
                    />
                  )}
                  {isEquipped && (
                    <div className="absolute -top-1.5 -right-1.5 bg-emerald-500 rounded-full p-0.5 text-white shadow">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                <span className="font-['Fredoka'] text-sm font-semibold text-white truncate w-full text-center">
                  {skin.name}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 capitalize">
                  {skin.accessory ? skin.accessory.replace('_', ' ') : 'Classic'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-5 border-t border-slate-800 flex justify-end">
          <button
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-['Fredoka'] font-bold text-sm shadow-lg shadow-sky-500/25 transition-transform active:scale-95 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
