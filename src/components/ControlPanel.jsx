import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Gauge, Globe, Music2, Save, Timer, Volume2, Zap } from 'lucide-react';
import { KEY_OPTIONS, SCALE_MODE_OPTIONS } from '../constants/music';
import { useAudioConfig } from '../contexts/AudioConfigContext';
import { usePlayback } from '../contexts/PlaybackContext';

const BPM_MIN = 20;
const BPM_MAX = 300;
const METRONOME_MIN = 30;
const METRONOME_MAX = 240;

const RESOLUTION_OPTIONS = [
  { value: 4, label: '1/4 beat grid' },
  { value: 8, label: '1/8 beat grid' },
  { value: 12, label: '1/12 beat grid (triplet)' },
  { value: 16, label: '1/16 beat grid' },
  { value: 24, label: '1/24 beat grid (triplet)' },
  { value: 32, label: '1/32 beat grid' },
];

function normalizeNumber(value, min, max, fallback) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : fallback;
  const clamped = Math.min(max, Math.max(min, safeValue));
  return Number(clamped.toFixed(1));
}

function normalizeBpm(value, fallback = 90) {
  return normalizeNumber(value, BPM_MIN, BPM_MAX, fallback);
}

function normalizeMetronomeBpm(value, fallback = 90) {
  return normalizeNumber(value, METRONOME_MIN, METRONOME_MAX, fallback);
}

function formatDecimal(value, min = BPM_MIN, max = BPM_MAX, fallback = 90) {
  return normalizeNumber(value, min, max, fallback).toFixed(1);
}

function getAudioContextConstructor() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.AudioContext ?? window.webkitAudioContext ?? null;
}

function playClick(context, accent = false) {
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(accent ? 1380 : 940, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.2 : 0.12, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.09);
}

const ControlPanel = memo(({
  embedded = false,
  compact = false,
  uiMode = 'normal',
  onPanelPointerDown,
}) => {
  const {
    vol,
    setVol,
    reverb,
    onToggleReverb,
    globalKeyOffset,
    setGlobalKeyOffset,
    scaleMode,
    setScaleMode,
  } = useAudioConfig();
  const {
    bpm,
    setBpm,
    timeSigNum,
    setTimeSigNum,
    timeSigDen,
    setTimeSigDen,
    charResolution,
    setCharResolution,
    onApplySettingsToScore,
  } = usePlayback();
  const [bpmDraft, setBpmDraft] = useState(() => formatDecimal(bpm));
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(() => normalizeMetronomeBpm(bpm));
  const [metronomeDraft, setMetronomeDraft] = useState(() => formatDecimal(bpm, METRONOME_MIN, METRONOME_MAX));
  const [panelModes, setPanelModes] = useState({});
  const lastValidBpmRef = useRef(Number(bpm) || 90);
  const lastValidMetronomeRef = useRef(normalizeMetronomeBpm(bpm));
  const metronomeContextRef = useRef(null);
  const metronomeTimerRef = useRef(null);
  const beatIndexRef = useRef(0);
  const resolvedScaleMode = SCALE_MODE_OPTIONS.some((option) => option.value === scaleMode) ? scaleMode : 'major';

  const stopMetronomeTimer = useCallback(() => {
    if (metronomeTimerRef.current) {
      window.clearTimeout(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }
  }, []);

  const togglePanelMode = useCallback((panelId) => {
    setPanelModes((prev) => ({
      ...prev,
      [panelId]: (prev[panelId] ?? uiMode) === 'clear' ? 'normal' : 'clear',
    }));
  }, [uiMode]);

  useEffect(() => {
    const numericBpm = Number(bpm);
    if (Number.isFinite(numericBpm) && numericBpm >= BPM_MIN && numericBpm <= BPM_MAX) {
      lastValidBpmRef.current = normalizeBpm(numericBpm);
    }

    setBpmDraft(formatDecimal(bpm));
  }, [bpm]);

  useEffect(() => {
    lastValidMetronomeRef.current = normalizeMetronomeBpm(metronomeBpm);
    setMetronomeDraft(formatDecimal(metronomeBpm, METRONOME_MIN, METRONOME_MAX));
  }, [metronomeBpm]);

  useEffect(() => {
    if (!metronomeEnabled) {
      stopMetronomeTimer();
      return undefined;
    }

    const scheduleNext = () => {
      const context = metronomeContextRef.current;
      const beatLengthMs = (60 / normalizeMetronomeBpm(metronomeBpm)) * 1000;
      const accent = beatIndexRef.current % Math.max(Number(timeSigNum) || 4, 1) === 0;

      playClick(context, accent);
      beatIndexRef.current += 1;
      metronomeTimerRef.current = window.setTimeout(scheduleNext, beatLengthMs);
    };

    stopMetronomeTimer();
    scheduleNext();

    return stopMetronomeTimer;
  }, [metronomeBpm, metronomeEnabled, stopMetronomeTimer, timeSigNum]);

  useEffect(() => () => {
    stopMetronomeTimer();
    metronomeContextRef.current?.close?.().catch(() => {});
  }, [stopMetronomeTimer]);

  const applyBpm = useCallback((nextBpm) => {
    const numericBpm = normalizeBpm(nextBpm, lastValidBpmRef.current);
    lastValidBpmRef.current = numericBpm;
    setBpmDraft(formatDecimal(numericBpm));
    setBpm(numericBpm);
  }, [setBpm]);

  const commitBpmDraft = useCallback(() => {
    const numericDraft = Number(bpmDraft);

    if (Number.isFinite(numericDraft) && numericDraft >= BPM_MIN) {
      applyBpm(numericDraft);
      return;
    }

    const fallbackBpm = normalizeBpm(lastValidBpmRef.current);
    setBpmDraft(formatDecimal(fallbackBpm));
    setBpm(fallbackBpm);
  }, [applyBpm, bpmDraft, setBpm]);

  const applyMetronomeBpm = useCallback((nextBpm) => {
    const numericBpm = normalizeMetronomeBpm(nextBpm, lastValidMetronomeRef.current);
    lastValidMetronomeRef.current = numericBpm;
    setMetronomeDraft(formatDecimal(numericBpm, METRONOME_MIN, METRONOME_MAX));
    setMetronomeBpm(numericBpm);
  }, []);

  const commitMetronomeDraft = useCallback(() => {
    const numericDraft = Number(metronomeDraft);

    if (Number.isFinite(numericDraft) && numericDraft >= METRONOME_MIN) {
      applyMetronomeBpm(numericDraft);
      return;
    }

    const fallbackBpm = normalizeMetronomeBpm(lastValidMetronomeRef.current);
    setMetronomeDraft(formatDecimal(fallbackBpm, METRONOME_MIN, METRONOME_MAX));
    setMetronomeBpm(fallbackBpm);
  }, [applyMetronomeBpm, metronomeDraft]);

  const toggleMetronome = useCallback(async () => {
    if (metronomeEnabled) {
      setMetronomeEnabled(false);
      return;
    }

    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      return;
    }

    if (!metronomeContextRef.current) {
      metronomeContextRef.current = new AudioContextConstructor();
    }

    if (metronomeContextRef.current.state === 'suspended') {
      await metronomeContextRef.current.resume();
    }

    beatIndexRef.current = 0;
    setMetronomeEnabled(true);
  }, [metronomeEnabled]);

  return (
    <section className={embedded ? 'w-full' : 'z-30 my-8 w-full max-w-6xl px-4 sm:my-10 sm:px-6'}>
      <div className={`grid gap-4 ${compact ? 'xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)]' : 'xl:grid-cols-[minmax(0,1.28fr)_minmax(280px,0.9fr)]'}`}>
        <div data-ui-panel="true" data-panel-mode={panelModes.rhythm ?? uiMode} onPointerDown={onPanelPointerDown} className={`ui-panel ui-panel-light relative min-w-0 overflow-hidden border border-white/45 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.10)] ${compact ? 'rounded-[24px] p-3 sm:p-4' : 'rounded-[28px] p-4 sm:p-5'}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(248,250,252,0.14))]" />
          <div className="relative flex min-w-0 flex-col gap-4">
            <div role="button" tabIndex={0} onClick={() => togglePanelMode('rhythm')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') togglePanelMode('rhythm'); }} className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 shadow-[0_0_22px_rgba(245,158,11,0.12)]">
                <Zap size={16} className="shrink-0 text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-black uppercase tracking-[0.35em] text-amber-700/70">Rhythm</div>
                <div className="truncate text-sm font-semibold text-slate-800">BPM, beat grid, and metronome</div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-inner backdrop-blur-md">
                <input
                  type="range"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  step="0.1"
                  value={normalizeBpm(bpm, BPM_MIN)}
                  onChange={(event) => applyBpm(Number(event.target.value))}
                  className="min-w-0 flex-1 accent-amber-400"
                />
                <span className="shrink-0 text-[9px] font-mono tracking-[0.28em] text-amber-700/60">BPM</span>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,0.9fr)_minmax(10rem,0.85fr)_minmax(12rem,1fr)]">
                <div className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-3 py-3 shadow-sm backdrop-blur-md">
                  <div className="mb-2 truncate text-[10px] font-black tracking-[0.24em] text-slate-700">BPM</div>
                  <div className="flex min-w-0 items-center overflow-hidden rounded-xl border border-slate-200/45 bg-white/25 p-1 transition-colors focus-within:border-amber-400/70">
                    <button type="button" onClick={() => applyBpm(lastValidBpmRef.current - 1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-amber-700 transition-colors hover:bg-amber-100">-</button>
                    <input
                      type="number"
                      min={BPM_MIN}
                      max={BPM_MAX}
                      step="0.1"
                      value={bpmDraft}
                      onChange={(event) => setBpmDraft(event.target.value)}
                      onBlur={commitBpmDraft}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur();
                        }
                      }}
                      className="no-spinners min-w-0 flex-1 bg-transparent px-1 text-center text-sm font-mono text-slate-900 outline-none"
                    />
                    <button type="button" onClick={() => applyBpm(lastValidBpmRef.current + 1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-amber-700 transition-colors hover:bg-amber-100">+</button>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-3 py-3 shadow-sm backdrop-blur-md">
                  <div className="mb-2 flex min-w-0 items-center gap-2">
                    <Clock size={15} className="shrink-0 text-teal-600" />
                    <span className="truncate text-[10px] font-black tracking-[0.24em] text-slate-700">Time Sig</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1 overflow-hidden rounded-xl border border-slate-200/45 bg-slate-950/75 px-2 py-1">
                    <select value={timeSigNum} onChange={(event) => setTimeSigNum(Number(event.target.value))} className="min-w-0 flex-1 rounded-lg bg-slate-950 px-1 py-1 text-center text-sm font-black text-slate-50 outline-none">
                      {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((value) => (
                        <option key={value} value={value} className="bg-slate-950 text-slate-50">{value}</option>
                      ))}
                    </select>
                    <span className="shrink-0 font-bold text-slate-100">/</span>
                    <select value={timeSigDen} onChange={(event) => setTimeSigDen(Number(event.target.value))} className="min-w-0 flex-1 rounded-lg bg-slate-950 px-1 py-1 text-center text-sm font-black text-slate-50 outline-none">
                      {[2, 4, 8, 16].map((value) => (
                        <option key={value} value={value} className="bg-slate-950 text-slate-50">{value}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-3 py-3 shadow-sm backdrop-blur-md sm:col-span-2 lg:col-span-1">
                  <div className="mb-2 truncate text-[10px] font-black tracking-[0.24em] text-slate-700">Beat Grid</div>
                  <select value={charResolution} onChange={(event) => setCharResolution(Number(event.target.value))} className="block h-10 w-full min-w-0 truncate rounded-xl border border-slate-200/45 bg-slate-950 px-3 text-xs font-black text-slate-50 outline-none">
                    {RESOLUTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-950 text-slate-50">{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(9rem,0.42fr)]">
                <button type="button" onClick={toggleMetronome} className={`flex min-h-[3.4rem] min-w-0 items-center justify-center gap-2 rounded-[22px] border px-4 py-3 text-[10px] font-black tracking-[0.24em] transition-all ${metronomeEnabled ? 'border-amber-300/65 bg-amber-100/55 text-amber-900 shadow-[0_0_24px_rgba(245,158,11,0.14)]' : 'border-slate-200/45 bg-white/25 text-slate-700'}`}>
                  <Timer size={15} className="shrink-0" />
                  <span className="truncate">{metronomeEnabled ? 'Metronome On' : 'Metronome Off'}</span>
                </button>
                <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-inner backdrop-blur-md">
                  <Gauge size={15} className="shrink-0 text-amber-700" />
                  <input
                    type="range"
                    min={METRONOME_MIN}
                    max={METRONOME_MAX}
                    step="0.1"
                    value={normalizeMetronomeBpm(metronomeBpm)}
                    onChange={(event) => applyMetronomeBpm(Number(event.target.value))}
                    className="min-w-0 flex-1 accent-amber-500"
                    aria-label="Metronome rate"
                  />
                </div>
                <div className="flex min-w-0 items-center overflow-hidden rounded-[22px] border border-slate-200/45 bg-white/25 p-1 transition-colors focus-within:border-amber-400/70">
                  <input
                    type="number"
                    min={METRONOME_MIN}
                    max={METRONOME_MAX}
                    step="0.1"
                    value={metronomeDraft}
                    onChange={(event) => setMetronomeDraft(event.target.value)}
                    onBlur={commitMetronomeDraft}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                    className="no-spinners min-w-0 flex-1 bg-transparent px-2 text-center text-sm font-mono text-slate-900 outline-none"
                    aria-label="Metronome BPM"
                  />
                  <span className="shrink-0 pr-3 text-[9px] font-black tracking-[0.18em] text-amber-700/65">BPM</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div data-ui-panel="true" data-panel-mode={panelModes.sound ?? uiMode} onPointerDown={onPanelPointerDown} className={`ui-panel ui-panel-light relative min-w-0 overflow-hidden border border-white/45 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.10)] ${compact ? 'rounded-[24px] p-3 sm:p-4' : 'rounded-[28px] p-4 sm:p-5'}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.07),transparent_32%),radial-gradient(circle_at_20%_100%,rgba(99,102,241,0.07),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.22),rgba(248,250,252,0.12))]" />
          <div className="relative flex h-full min-w-0 flex-col gap-4">
            <div role="button" tabIndex={0} onClick={() => togglePanelMode('sound')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') togglePanelMode('sound'); }} className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 shadow-[0_0_22px_rgba(16,185,129,0.12)]">
                <Volume2 size={16} className="text-teal-700" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-black uppercase tracking-[0.35em] text-teal-700/70">Sound</div>
                <div className="truncate text-sm font-semibold text-slate-800">Volume, reverb, key, and scale</div>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-inner backdrop-blur-md">
              <Volume2 size={15} className="shrink-0 text-teal-700" />
              <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(event) => setVol(Number(event.target.value))} className="min-w-0 flex-1 accent-teal-500" />
              <span className="shrink-0 text-[9px] font-mono tracking-[0.24em] text-slate-700">VOL</span>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
              <button type="button" onClick={onToggleReverb} className={`min-h-[3.5rem] min-w-0 rounded-[22px] border px-5 py-3 text-[10px] font-black tracking-[0.32em] transition-all ${reverb ? 'border-indigo-200/55 bg-indigo-50/40 text-indigo-800 shadow-[0_0_24px_rgba(79,70,229,0.10)]' : 'border-slate-200/45 bg-white/25 text-slate-700'}`}>
                Reverb <span className="ml-1 opacity-55">{reverb ? 'ON' : 'OFF'}</span>
              </button>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-sm backdrop-blur-md">
                  <div className="flex min-w-0 items-center gap-3">
                    <Globe size={15} className="shrink-0 text-indigo-600" />
                    <select value={globalKeyOffset} onChange={(event) => setGlobalKeyOffset(Number(event.target.value))} className="w-full min-w-0 rounded-xl bg-slate-950 px-2 py-2 text-[11px] font-black uppercase text-slate-50 outline-none">
                      {KEY_OPTIONS.map((option) => (
                        <option key={option.offset} value={option.offset} className="bg-slate-950 text-slate-50">
                          {option.displayName ?? option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 truncate text-[10px] font-semibold text-slate-600">Global key offset</div>
                </div>

                <div className="min-w-0 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-sm backdrop-blur-md">
                  <div className="flex min-w-0 items-center gap-3">
                    <Music2 size={15} className="shrink-0 text-teal-700" />
                    <select value={resolvedScaleMode} onChange={(event) => setScaleMode(event.target.value)} className="w-full min-w-0 rounded-xl bg-slate-950 px-2 py-2 text-[11px] font-black uppercase text-slate-50 outline-none">
                      {SCALE_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value} className="bg-slate-950 text-slate-50">{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 truncate text-[10px] font-semibold text-slate-600">Major / minor scale mapping</div>
                </div>
              </div>
            </div>

            <button type="button" onClick={onApplySettingsToScore} disabled={!onApplySettingsToScore} className="mt-auto flex min-h-[3rem] w-full min-w-0 items-center justify-center gap-2 rounded-[22px] border border-emerald-200/55 bg-emerald-50/40 px-4 py-3 text-[10px] font-black tracking-[0.26em] text-emerald-800 shadow-[0_0_24px_rgba(16,185,129,0.10)] backdrop-blur-md transition-colors hover:bg-emerald-100/45 disabled:cursor-not-allowed disabled:border-slate-200/45 disabled:bg-slate-100/30 disabled:text-slate-400">
              <Save size={14} className="shrink-0" />
              <span className="truncate">Apply settings to score</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});

export default ControlPanel;
