import React, { memo } from 'react';
import { useAudioConfig } from '../contexts/AudioConfigContext';

const INSTRUMENTS = [
  { id: 'piano', label: 'Piano', icon: '', sub: 'Piano' },
  { id: 'lyre-long', label: 'Lyre L', icon: '', sub: 'Lyre Long' },
  { id: 'lyre-short', label: 'Lyre S', icon: '', sub: 'Lyre Short' },
  { id: 'flute', label: 'Flute', icon: '', sub: 'Flute' },
  { id: 'tongue-drum', label: 'Drum', icon: '', sub: 'Tongue Drum' },
];

const InstrumentSelector = memo(() => {
  const { tone, setTone } = useAudioConfig();

  return (
    <div className="instrument-selector">
      {INSTRUMENTS.map(({ id, label, icon, sub }) => {
        const active = tone === id;

        return (
          <button
            key={id}
            type="button"
            className={`instrument-btn ${active ? 'active' : ''}`}
            onClick={() => setTone(id)}
            title={sub}
          >
            <span className="instrument-icon">{icon}</span>
            <span className="instrument-label">{label}</span>
          </button>
        );
      })}
      <style>{`
        .instrument-selector {
          display: flex;
          gap: 6px;
          justify-content: center;
          padding: 8px 12px;
          flex-wrap: wrap;
        }
        .instrument-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 6px 14px;
          border-radius: 8px;
          border: 1.5px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.55);
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
          min-width: 60px;
        }
        .instrument-btn:hover {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.85);
          border-color: rgba(255,255,255,0.25);
        }
        .instrument-btn.active {
          background: rgba(255,220,120,0.15);
          border-color: rgba(255,220,120,0.55);
          color: #ffd87a;
        }
        .instrument-icon {
          font-size: 18px;
          line-height: 1;
        }
        .instrument-label {
          font-size: 11px;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
});

InstrumentSelector.displayName = 'InstrumentSelector';

export default InstrumentSelector;
