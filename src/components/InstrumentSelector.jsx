import React, { memo } from 'react';
import { AudioLines, Drum, Music2, Piano, Wind } from 'lucide-react';
import { useAudioConfig } from '../contexts/AudioConfigContext';

const INSTRUMENTS = [
  { id: 'piano', label: '鋼琴', Icon: Piano, sub: 'FluidR3 鋼琴取樣' },
  { id: 'violin', label: '小提琴', Icon: Music2, sub: 'FluidR3 小提琴取樣' },
  { id: 'lyre-long', label: '豎琴長音', Icon: Music2, sub: 'FluidR3 豎琴取樣，延音較長' },
  { id: 'lyre-short', label: '豎琴短音', Icon: AudioLines, sub: 'FluidR3 豎琴取樣，收音較短' },
  { id: 'flute', label: '長笛', Icon: Wind, sub: 'FluidR3 長笛取樣' },
  { id: 'tongue-drum', label: '空靈鼓', Icon: Drum, sub: 'FluidR3 steel drums 取樣' },
  { id: 'tongue-drum-electronic', label: '電子空靈鼓', Icon: AudioLines, sub: '合成器空靈鼓音色' },
];

function normalizeToneList(tone) {
  const entries = Array.isArray(tone) ? tone : [tone || 'piano'];
  return [...new Set(entries.filter(Boolean))];
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
          border: 1px solid rgba(255,255,255,0.12);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02)),
            rgba(3, 7, 18, 0.72);
          color: rgba(236,253,245,0.62);
          cursor: pointer;
          transition: transform 160ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, background 180ms ease;
          font-family: inherit;
          min-width: 78px;
          min-height: 58px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 14px 34px rgba(0,0,0,0.22);
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
            linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.035)),
            rgba(6, 16, 27, 0.86);
          color: rgba(255,255,255,0.92);
          border-color: rgba(167,243,208,0.28);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.12),
            0 18px 38px rgba(0,0,0,0.3),
            0 0 22px rgba(45,212,191,0.12);
        }
        .instrument-btn:hover::before {
          opacity: 1;
          transform: translateX(32%);
        }
        .instrument-btn.active {
          background:
            radial-gradient(circle at 50% 0%, rgba(251,191,36,0.24), transparent 52%),
            linear-gradient(180deg, rgba(16,185,129,0.22), rgba(20,184,166,0.1)),
            rgba(3, 7, 18, 0.84);
          border-color: rgba(252,211,77,0.58);
          color: #fde68a;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.14),
            0 18px 42px rgba(0,0,0,0.28),
            0 0 26px rgba(251,191,36,0.18);
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
