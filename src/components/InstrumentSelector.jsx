import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AudioLines, Drum, Guitar, Music2, Piano, Waves } from 'lucide-react';
import { useAudioConfig } from '../contexts/AudioConfigContext';
import { SUPPORTED_TONES, listAvailableInstruments } from '../constants/instruments';

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
  const normalized = entries.filter((entry, index) => allowed.has(entry) && entries.indexOf(entry) === index);
  return normalized.length ? normalized : ['piano'];
}

const PERFORMANCE_MODES = [
  { id: 'solo', label: '獨奏 Solo' },
  { id: 'band', label: '樂團 Band' },
  { id: 'orchestra', label: '管弦樂團 Orchestra' },
];

const BAND_PARTS = [
  { id: 'melody', label: 'Melody' },
  { id: 'chords', label: 'Chords' },
  { id: 'bass', label: 'Bass' },
  { id: 'drums', label: 'Drums' },
];

function getScoreTracks(score) {
  const tracks = Array.isArray(score?.tracks) ? score.tracks : [];
  const isSlim = score?.version === '3.2-ultra-slim';
  const entries = tracks.map((track, index) => Array.isArray(track)
    ? { id: String(index), name: track[0] ?? `Track ${index + 1}`, channel: track[1] }
    : {
      id: String(isSlim ? index : (track?.id || `track-${index + 1}`)),
      name: track?.name ?? track?.id ?? `Track ${index + 1}`,
      channel: track?.channel,
    });
  if (score?.version === '3.0' && Array.isArray(score.events)) {
    score.events.forEach((event) => {
      const id = String(event?.trackId ?? '0');
      if (!entries.some((track) => track.id === id)) entries.push({ id, name: `Track ${id}`, channel: event?.channel });
    });
  }
  return entries;
}

const InstrumentSelector = memo(({ disabled = false, performanceMode = 'solo', onPerformanceModeChange, score, instrumentConfig = { band: {}, orchestra: {} }, onInstrumentConfigChange }) => {
  const { tone, setTone } = useAudioConfig();
  const selectedTones = useMemo(() => normalizeToneList(tone), [tone]);
  const [isBlendMode, setIsBlendMode] = useState(Array.isArray(tone) && tone.length > 1);
  const savedToneRef = useRef(null);
  const orchestraTracks = useMemo(() => getScoreTracks(score), [score]);

  const updateChannelConfig = useCallback((group, channelId, field, value) => {
    onInstrumentConfigChange?.((previous) => ({
      ...previous,
      [group]: {
        ...(previous?.[group] ?? {}),
        [channelId]: {
          ...(previous?.[group]?.[channelId] ?? {}),
          [field]: value,
        },
      },
    }));
  }, [onInstrumentConfigChange]);

  const renderChannelConfig = (group, channelId, label) => {
    const config = instrumentConfig?.[group]?.[channelId] ?? {};
    return (
      <div className="channel-config-row" key={channelId}>
        <label className="channel-config-name" title={label}>
          <input type="checkbox" checked={config.active !== false} disabled={disabled} onChange={(event) => updateChannelConfig(group, channelId, 'active', event.target.checked)} />
          <span>{label}</span>
        </label>
        <select aria-label={`${label} instrument`} disabled={disabled || config.active === false} value={config.tone ?? ''} onChange={(event) => updateChannelConfig(group, channelId, 'tone', event.target.value)}>
          <option value="">Default / source GM</option>
          {INSTRUMENTS.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.label}</option>)}
        </select>
        <label className="channel-volume">
          <span>VOL</span>
          <input aria-label={`${label} volume`} type="range" min="0" max="1" step="0.05" disabled={disabled || config.active === false} value={config.volume ?? 1} onChange={(event) => updateChannelConfig(group, channelId, 'volume', Number(event.target.value))} />
        </label>
      </div>
    );
  };

  const handlePerformanceModeChange = useCallback((nextMode) => {
    if (nextMode === performanceMode) return;

    if (nextMode === 'orchestra') {
      savedToneRef.current = tone;
      setTone('midi-original');
      setIsBlendMode(false);
    } else if (performanceMode === 'orchestra') {
      const restoredTones = normalizeToneList(savedToneRef.current ?? 'piano');
      setTone(nextMode === 'band' ? restoredTones : restoredTones[0]);
      setIsBlendMode(nextMode === 'band');
    } else if (nextMode === 'band') {
      setTone(normalizeToneList(tone));
      setIsBlendMode(true);
    } else {
      setTone(normalizeToneList(tone)[0]);
      setIsBlendMode(false);
    }

    onPerformanceModeChange?.(nextMode);
  }, [onPerformanceModeChange, performanceMode, setTone, tone]);

  const handleSelectTone = useCallback((id) => {
    if (!isBlendMode) {
      setTone(id);
      return;
    }

    setTone((currentTone) => {
      const current = normalizeToneList(currentTone);
      const exists = current.includes(id);
      const next = exists
        ? current.filter((entry) => entry !== id)
        : [...current, id];

      return next.length ? next : id;
    });
  }, [isBlendMode, setTone]);

  const handleToggleBlendMode = useCallback((event) => {
    const enabled = event.target.checked;
    setIsBlendMode(enabled);
    if (!enabled) {
      setTone((currentTone) => normalizeToneList(currentTone)[0] ?? 'piano');
    } else {
      setTone((currentTone) => normalizeToneList(currentTone));
    }
  }, [setTone]);

  return (
    <div className="instrument-selector-wrap">
      <div className="instrument-toolbar">
        <div className="performance-modes" role="group" aria-label="演奏模式">
          {PERFORMANCE_MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={performanceMode === id}
              disabled={disabled}
              onClick={() => handlePerformanceModeChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {performanceMode === 'band' ? <div className="channel-config-list" aria-label="Band instrument channels">
        <div className="channel-count">Active instruments: {BAND_PARTS.filter((part) => instrumentConfig?.band?.[part.id]?.active !== false).length} / {BAND_PARTS.length}</div>
        {BAND_PARTS.map((part) => renderChannelConfig('band', part.id, part.label))}
      </div> : null}
      {performanceMode === 'orchestra' ? <div className="channel-config-list" aria-label="Orchestra track instruments">
        <div className="channel-count">Active instruments: {orchestraTracks.filter((track) => instrumentConfig?.orchestra?.[track.id]?.active !== false).length} / {orchestraTracks.length}</div>
        {orchestraTracks.length
          ? orchestraTracks.map((track) => renderChannelConfig('orchestra', track.id, `${track.name}${track.channel == null ? '' : ` · CH ${Number(track.channel) + 1}`}`))
          : <p className="orchestra-mode-note">Load a multi-track MIDI score to configure instruments per track.</p>}
      </div> : null}
      {performanceMode === 'orchestra' ? <p className="orchestra-mode-note">依 MIDI 軌道原始樂器演奏</p> : null}
      {performanceMode === 'solo' ? <div className="instrument-selector">
        {INSTRUMENTS.map(({ id, label, Icon, sub }) => {
          const active = selectedTones.includes(id);

          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              className={`instrument-btn ${active ? 'active' : ''}`}
              onClick={() => handleSelectTone(id)}
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
      </div> : null}
      <style>{`
        .instrument-selector-wrap {
          position: relative;
          z-index: 30;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .instrument-toolbar {
          display: flex;
          width: min(100%, 980px);
          justify-content: flex-end;
          padding: 0 16px;
        }
        .performance-modes {
          display: inline-flex;
          gap: 3px;
          margin-right: auto;
          padding: 3px;
          border: 1px solid rgba(219,234,254,0.18);
          border-radius: 12px;
          background: rgba(5, 8, 28, 0.7);
        }
        .performance-modes button {
          min-height: 30px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          padding: 0 12px;
          color: rgba(219,234,254,0.65);
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }
        .performance-modes button[aria-pressed="true"] {
          background: rgba(45, 212, 191, 0.22);
          color: #ccfbf1;
        }
        .performance-modes button:disabled {
          cursor: wait;
          opacity: 0.55;
        }
        .orchestra-mode-note {
          margin: 0;
          padding: 8px 12px 0;
          color: rgba(219,234,254,0.72);
          font-size: 11px;
        }
        .channel-config-list {
          display: grid;
          width: min(100%, 980px);
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
          gap: 8px;
          padding: 4px 16px;
        }
        .channel-config-row {
          display: grid;
          grid-template-columns: minmax(72px, 1fr) minmax(130px, 1.2fr) minmax(90px, 0.9fr);
          align-items: center;
          gap: 10px;
          min-width: 0;
          padding: 8px 10px;
          border: 1px solid rgba(219,234,254,0.14);
          border-radius: 12px;
          background: rgba(5, 8, 28, 0.58);
          color: rgba(219,234,254,0.78);
        }
        .channel-config-name {
          display: flex;
          align-items: center;
          gap: 7px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .channel-config-name input { accent-color: #2dd4bf; }
        .channel-count {
          grid-column: 1 / -1;
          padding: 1px 3px;
          color: rgba(153,246,228,0.8);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .channel-config-row select {
          min-width: 0;
          min-height: 32px;
          border: 1px solid rgba(219,234,254,0.2);
          border-radius: 8px;
          background: #10152e;
          padding: 0 8px;
          color: #e0f2fe;
          font-size: 10px;
        }
        .channel-volume {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }
        .channel-volume input { width: 100%; min-width: 32px; accent-color: #2dd4bf; }
        .blend-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          border: 1px solid rgba(219,234,254,0.18);
          border-radius: 999px;
          background: rgba(5, 8, 28, 0.7);
          padding: 5px 10px;
          color: rgba(219,234,254,0.82);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .blend-toggle input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .blend-toggle:has(input:disabled) {
          cursor: wait;
          opacity: 0.55;
        }
        .blend-toggle-track {
          position: relative;
          width: 34px;
          height: 18px;
          border-radius: 999px;
          background: rgba(15,23,42,0.86);
          box-shadow: inset 0 0 0 1px rgba(219,234,254,0.2);
        }
        .blend-toggle-track::after {
          content: '';
          position: absolute;
          left: 3px;
          top: 3px;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: rgba(226,232,240,0.92);
          transition: transform 160ms ease, background 160ms ease;
        }
        .blend-toggle input:checked + .blend-toggle-track {
          background: rgba(45, 212, 191, 0.32);
        }
        .blend-toggle input:checked + .blend-toggle-track::after {
          transform: translateX(16px);
          background: #fef3c7;
        }
        .instrument-selector {
          display: flex;
          gap: 10px;
          justify-content: center;
          padding: 4px 16px 0;
          flex-wrap: wrap;
          position: relative;
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
