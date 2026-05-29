import React, { memo } from 'react';
import { AudioLines, Drum, Guitar, Music2, Piano, Waves } from 'lucide-react';
import { useAudioConfig } from '../contexts/AudioConfigContext';
import { SUPPORTED_TONES, listAvailableInstruments } from '../constants/instruments';

const LEGACY_INSTRUMENTS = [
  { id: 'piano', label: '真鋼琴', Icon: Piano, sub: 'Salamander grand piano samples' },
  { id: 'tongue-drum', label: '空靈鼓', Icon: Drum, sub: 'FluidR3 steel drums samples' },
  { id: 'tongue-drum-electronic', label: '星鈴鼓', Icon: AudioLines, sub: 'Synthesized tongue drum layer' },
];

const ICONS = {
  'audio-lines': AudioLines,
  drum: Drum,
  guitar: Guitar,
  music: Music2,
  piano: Piano,
  waves: Waves,
};

const INSTRUMENTS = listAvailableInstruments().map((instrument) => ({
  ...instrument,
  Icon: ICONS[instrument.icon] ?? AudioLines,
  sub: `${instrument.type} / ${instrument.description}`,
}));

function normalizeToneList(tone) {
  const entries = Array.isArray(tone) ? tone : [tone || 'piano'];
  const allowed = new Set(SUPPORTED_TONES);
  const normalized = [...new Set(entries.filter((entry) => allowed.has(entry)))];
  return normalized.length > 0 ? normalized : ['piano'];
}

const InstrumentSelector = memo(({ disabled = false }) => {
  const { tone, setTone } = useAudioConfig();
  const selectedTones = normalizeToneList(tone);

  const toggleTone = (id) => {
    setTone((currentTone) => {
      const current = normalizeToneList(currentTone);
      if (current.includes(id)) {
        const next = current.filter((entry) => entry !== id);
        return next.length > 0 ? next : current;
      }

      return [...current, id];
    });
  };

  return (
    <div className="instrument-selector">
      {INSTRUMENTS.map(({ id, label, Icon, sub }) => {
        const active = selectedTones.includes(id);

        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            className={`instrument-btn ${active ? 'active' : ''}`}
            onClick={() => toggleTone(id)}
            aria-pressed={active}
            title={sub}
          >
            <span className="instrument-icon">
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <span className="instrument-label">{label}</span>
          </button>
        );
      })}
      <style>{`
        .instrument-selector {
          display: flex;
          gap: 10px;
          justify-content: center;
          padding: 4px 16px 0;
          flex-wrap: wrap;
          position: relative;
          z-index: 30;
        }
        .instrument-btn {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 8px 14px;
          border-radius: 18px;
          border: 1px solid rgba(219,234,254,0.18);
          background:
            radial-gradient(circle at 50% 0%, rgba(125,211,252,0.1), transparent 48%),
            linear-gradient(180deg, rgba(226,232,255,0.08), rgba(196,181,253,0.025)),
            rgba(5, 8, 28, 0.76);
          color: rgba(219,234,254,0.7);
          cursor: pointer;
          transition: transform 160ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, background 180ms ease;
          font-family: inherit;
          min-width: 78px;
          min-height: 58px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 14px 34px rgba(0,0,0,0.26),
            0 0 18px rgba(99,102,241,0.08);
          backdrop-filter: blur(14px);
        }
        .instrument-btn:disabled {
          cursor: wait;
          opacity: 0.55;
          transform: none;
        }
        .instrument-btn::before {
          content: '';
          position: absolute;
          inset: -45% -20%;
          background: linear-gradient(120deg, transparent 35%, rgba(255,255,255,0.2), transparent 65%);
          opacity: 0;
          transform: translateX(-32%);
          transition: opacity 180ms ease, transform 420ms ease;
          pointer-events: none;
        }
        .instrument-btn:hover {
          transform: translateY(-2px);
          background:
            radial-gradient(circle at 50% 0%, rgba(250,204,21,0.12), transparent 48%),
            linear-gradient(180deg, rgba(255,255,255,0.11), rgba(196,181,253,0.04)),
            rgba(8, 12, 34, 0.88);
          color: rgba(255,255,255,0.92);
          border-color: rgba(253,224,171,0.34);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.12),
            0 18px 38px rgba(0,0,0,0.3),
            0 0 24px rgba(250,204,21,0.12);
        }
        .instrument-btn:hover::before {
          opacity: 1;
          transform: translateX(32%);
        }
        .instrument-btn.active {
          background:
            radial-gradient(circle at 50% 0%, rgba(253,224,171,0.26), transparent 52%),
            linear-gradient(180deg, rgba(125,211,252,0.18), rgba(196,181,253,0.12)),
            rgba(6, 10, 30, 0.88);
          border-color: rgba(253,224,171,0.58);
          color: #fef3c7;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.14),
            0 18px 42px rgba(0,0,0,0.28),
            0 0 28px rgba(191,219,254,0.16),
            0 0 18px rgba(250,204,21,0.14);
        }
        .instrument-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          transition: transform 180ms ease, filter 180ms ease;
        }
        .instrument-btn:hover .instrument-icon,
        .instrument-btn.active .instrument-icon {
          transform: scale(1.12);
          filter: drop-shadow(0 0 10px currentColor);
        }
        .instrument-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
});

InstrumentSelector.displayName = 'InstrumentSelector';

export default InstrumentSelector;
