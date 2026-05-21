import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Globe, Save, Volume2, Zap } from 'lucide-react';
import { KEY_OPTIONS, SCALE_MODE_OPTIONS } from '../constants/music';
import { useAudioConfig } from '../contexts/AudioConfigContext';
import { usePlayback } from '../contexts/PlaybackContext';

const BPM_MIN = 20;
const BPM_MAX = 300;

const RESOLUTION_OPTIONS = [
  { value: 4, label: '1/4 beat grid' },
  { value: 8, label: '1/8 beat grid' },
  { value: 12, label: '1/12 beat grid (triplet)' },
  { value: 16, label: '1/16 beat grid' },
  { value: 24, label: '1/24 beat grid (triplet)' },
  { value: 32, label: '1/32 beat grid' },
];

const ControlPanel = memo(({ embedded = false, compact = false }) => {
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
  const [bpmDraft, setBpmDraft] = useState(() => String(bpm));
  const lastValidBpmRef = useRef(Number(bpm) || 90);

  useEffect(() => {
    const numericBpm = Number(bpm);
    if (Number.isFinite(numericBpm) && numericBpm >= BPM_MIN && numericBpm <= BPM_MAX) {
      lastValidBpmRef.current = numericBpm;
    }

    setBpmDraft(String(bpm));
  }, [bpm]);

  const applyBpm = useCallback((nextBpm) => {
    const numericBpm = Math.min(
      BPM_MAX,
      Math.max(BPM_MIN, Number(nextBpm) || lastValidBpmRef.current),
    );
    lastValidBpmRef.current = numericBpm;
    setBpmDraft(String(numericBpm));
    setBpm(numericBpm);
  }, [setBpm]);

  const commitBpmDraft = useCallback(() => {
    const numericDraft = Number(bpmDraft);

    if (Number.isFinite(numericDraft) && numericDraft >= BPM_MIN) {
      applyBpm(numericDraft);
      return;
    }

    const fallbackBpm = lastValidBpmRef.current;
    setBpmDraft(String(fallbackBpm));
    setBpm(fallbackBpm);
  }, [applyBpm, bpmDraft, setBpm]);

  return (
    <section className={embedded ? 'w-full' : 'z-30 my-8 w-full max-w-6xl px-4 sm:my-10 sm:px-6'}>
      <div className={`grid gap-4 ${compact ? 'xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)]' : 'xl:grid-cols-[minmax(0,1.28fr)_minmax(280px,0.9fr)]'}`}>
        <div className={`relative min-w-0 overflow-hidden border border-white/45 bg-white/40 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl ${compact ? 'rounded-[24px] p-3 sm:p-4' : 'rounded-[28px] p-4 sm:p-5'}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(248,250,252,0.14))]" />
          <div className="relative flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 shadow-[0_0_22px_rgba(245,158,11,0.12)]">
                <Zap size={16} className="shrink-0 text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-black uppercase tracking-[0.35em] text-amber-700/70">節奏</div>
                <div className="truncate text-sm font-semibold text-slate-700">速度、拍號與節拍解析度</div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-inner backdrop-blur-md">
                <input
                  type="range"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  step="1"
                  value={Number(bpm) || BPM_MIN}
                  onChange={(event) => applyBpm(Number(event.target.value))}
                  className="min-w-0 flex-1 accent-amber-400"
                />
                <span className="shrink-0 text-[9px] font-mono tracking-[0.28em] text-amber-700/60">BPM</span>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,0.9fr)_minmax(10rem,0.85fr)_minmax(12rem,1fr)]">
                <div className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-3 py-3 shadow-sm backdrop-blur-md">
                  <div className="mb-2 truncate text-[10px] font-black tracking-[0.24em] text-slate-500">BPM</div>
                  <div className="flex min-w-0 items-center overflow-hidden rounded-xl border border-slate-200/45 bg-white/25 p-1 transition-colors focus-within:border-amber-400/70">
                    <button type="button" onClick={() => applyBpm(lastValidBpmRef.current - 1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-amber-700 transition-colors hover:bg-amber-100">-</button>
                    <input
                      type="number"
                      min={BPM_MIN}
                      max={BPM_MAX}
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
                    <span className="truncate text-[10px] font-black tracking-[0.24em] text-slate-500">拍號</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1 overflow-hidden rounded-xl border border-slate-200/45 bg-white/25 px-2 py-1">
                    <select value={timeSigNum} onChange={(event) => setTimeSigNum(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-1 py-1 text-center text-sm font-black text-slate-800 outline-none">
                      {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((value) => (
                        <option key={value} value={value} className="bg-white text-slate-900">{value}</option>
                      ))}
                    </select>
                    <span className="shrink-0 font-bold text-slate-400">/</span>
                    <select value={timeSigDen} onChange={(event) => setTimeSigDen(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-1 py-1 text-center text-sm font-black text-slate-800 outline-none">
                      {[2, 4, 8, 16].map((value) => (
                        <option key={value} value={value} className="bg-white text-slate-900">{value}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-3 py-3 shadow-sm backdrop-blur-md sm:col-span-2 lg:col-span-1">
                  <div className="mb-2 truncate text-[10px] font-black tracking-[0.24em] text-slate-500">節拍格線</div>
                  <select value={charResolution} onChange={(event) => setCharResolution(Number(event.target.value))} className="block h-10 w-full min-w-0 truncate rounded-xl border border-slate-200/45 bg-white/25 px-3 text-xs font-black text-slate-800 outline-none">
                    {RESOLUTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-white text-slate-900">{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`relative min-w-0 overflow-hidden border border-white/45 bg-white/40 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl ${compact ? 'rounded-[24px] p-3 sm:p-4' : 'rounded-[28px] p-4 sm:p-5'}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.07),transparent_32%),radial-gradient(circle_at_20%_100%,rgba(99,102,241,0.07),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.22),rgba(248,250,252,0.12))]" />
          <div className="relative flex h-full min-w-0 flex-col gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 shadow-[0_0_22px_rgba(16,185,129,0.12)]">
                <Volume2 size={16} className="text-teal-700" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-black uppercase tracking-[0.35em] text-teal-700/70">音色</div>
                <div className="truncate text-sm font-semibold text-slate-700">音量、殘響與調性設定</div>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-inner backdrop-blur-md">
              <Volume2 size={15} className="shrink-0 text-teal-700" />
              <input type="range" min="0" max="1" step="0.01" value={vol} onChange={(event) => setVol(Number(event.target.value))} className="min-w-0 flex-1 accent-teal-500" />
              <span className="shrink-0 text-[9px] font-mono tracking-[0.24em] text-slate-500">音量</span>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
              <button type="button" onClick={onToggleReverb} className={`min-h-[3.5rem] min-w-0 rounded-[22px] border px-5 py-3 text-[10px] font-black tracking-[0.32em] transition-all backdrop-blur-md ${reverb ? 'border-indigo-200/55 bg-indigo-50/40 text-indigo-800 shadow-[0_0_24px_rgba(79,70,229,0.10)]' : 'border-slate-200/45 bg-white/25 text-slate-500'}`}>
                殘響 <span className="ml-1 opacity-55">{reverb ? '開' : '關'}</span>
              </button>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-sm backdrop-blur-md">
                  <Globe size={15} className="shrink-0 text-indigo-600" />
                  <select value={globalKeyOffset} onChange={(event) => setGlobalKeyOffset(Number(event.target.value))} className="w-full min-w-0 bg-transparent text-[11px] font-black uppercase text-slate-800 outline-none">
                    {KEY_OPTIONS.map((option) => (
                      <option key={option.offset} value={option.offset} className="bg-white text-slate-900">
                        {option.displayName ?? option.name} 調
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-w-0 items-center gap-3 rounded-[22px] border border-slate-200/45 bg-slate-50/30 px-4 py-3 shadow-sm backdrop-blur-md">
                  <Globe size={15} className="shrink-0 text-teal-700" />
                  <select value={scaleMode} onChange={(event) => setScaleMode(event.target.value)} className="w-full min-w-0 bg-transparent text-[11px] font-black uppercase text-slate-800 outline-none">
                    {SCALE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-white text-slate-900">{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <button type="button" onClick={onApplySettingsToScore} disabled={!onApplySettingsToScore} className="mt-auto flex min-h-[3rem] w-full min-w-0 items-center justify-center gap-2 rounded-[22px] border border-emerald-200/55 bg-emerald-50/40 px-4 py-3 text-[10px] font-black tracking-[0.26em] text-emerald-800 shadow-[0_0_24px_rgba(16,185,129,0.10)] backdrop-blur-md transition-colors hover:bg-emerald-100/45 disabled:cursor-not-allowed disabled:border-slate-200/45 disabled:bg-slate-100/30 disabled:text-slate-400">
              <Save size={14} className="shrink-0" />
              <span className="truncate">寫入目前節奏與調性</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});

export default ControlPanel;
