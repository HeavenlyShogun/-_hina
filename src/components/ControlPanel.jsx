import React, { memo } from 'react';
import { Clock, Globe, Volume2, Zap } from 'lucide-react';
import { KEY_OPTIONS, SCALE_MODE_OPTIONS } from '../constants/music';
import { useAudioConfig } from '../contexts/AudioConfigContext';
import { usePlayback } from '../contexts/PlaybackContext';

const ControlPanel = memo(() => {
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
  } = usePlayback();

  return (
    <section className="z-30 my-8 w-full max-w-6xl px-4 sm:my-10 sm:px-6">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div
          className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/60 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-5"
          title="Tempo"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]" />
          <div className="relative flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/12 shadow-[0_0_22px_rgba(245,158,11,0.12)]">
                <Zap size={16} className="shrink-0 text-amber-300" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-100/45">Tempo</div>
                <div className="text-sm font-semibold text-emerald-50/90">Control pulse and score spacing</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/60 px-4 py-3">
                <input
                  type="range"
                  min="20"
                  max="300"
                  step="1"
                  value={Number(bpm) || 20}
                  onChange={(event) => setBpm(Number(event.target.value))}
                  className="flex-1 accent-amber-400"
                />
                <span className="text-[9px] font-mono tracking-[0.35em] text-amber-100/40">BPM</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                <div className="flex items-center justify-center rounded-[22px] border border-white/10 bg-black/60 px-3 py-3 sm:px-4">
                  <div className="flex items-center rounded-xl border border-white/10 bg-black/50 p-1 transition-colors focus-within:border-amber-400/40">
                    <button
                      type="button"
                      onClick={() => setBpm((value) => Math.max(20, (Number(value) || 77) - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-amber-300/80 transition-colors hover:bg-white/10 hover:text-amber-200"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={bpm}
                      onChange={(event) => setBpm(event.target.value === '' ? '' : Number(event.target.value))}
                      onBlur={() => {
                        const value = Number(bpm);
                        if (!value || value < 20) setBpm(20);
                        else if (value > 300) setBpm(300);
                      }}
                      className="no-spinners w-14 bg-transparent text-center text-sm font-mono text-emerald-100 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setBpm((value) => Math.min(300, (Number(value) || 77) + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-amber-300/80 transition-colors hover:bg-white/10 hover:text-amber-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  <div className="flex items-center justify-between gap-3 rounded-[22px] border border-emerald-400/15 bg-emerald-950/25 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="shrink-0 text-emerald-300" />
                      <span className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-100/50">Meter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={timeSigNum}
                        onChange={(event) => setTimeSigNum(Number(event.target.value))}
                        className="rounded-full bg-transparent px-2 py-1 text-sm font-black text-emerald-300 outline-none"
                      >
                        {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((value) => (
                          <option key={value} value={value} className="bg-slate-900">
                            {value}
                          </option>
                        ))}
                      </select>
                      <span className="font-bold text-emerald-500/50">/</span>
                      <select
                        value={timeSigDen}
                        onChange={(event) => setTimeSigDen(Number(event.target.value))}
                        className="rounded-full bg-transparent px-2 py-1 text-sm font-black text-emerald-300 outline-none"
                      >
                        {[2, 4, 8, 16].map((value) => (
                          <option key={value} value={value} className="bg-slate-900">
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="hidden w-px justify-self-center bg-white/10 sm:block" />

                  <div className="flex items-center justify-between gap-3 rounded-[22px] border border-teal-400/15 bg-emerald-950/20 px-4 py-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-100/50">Grid</span>
                    <select
                      value={charResolution}
                      onChange={(event) => setCharResolution(Number(event.target.value))}
                      className="rounded-full bg-transparent px-2 py-1 text-[11px] font-black text-emerald-300 outline-none"
                    >
                      <option value={4} className="bg-slate-900">4 chars</option>
                      <option value={8} className="bg-slate-900">8 chars</option>
                      <option value={16} className="bg-slate-900">16 chars</option>
                      <option value={32} className="bg-slate-900">32 chars</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/60 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_32%),radial-gradient(circle_at_20%_100%,rgba(99,102,241,0.14),transparent_26%)]" />
          <div className="relative flex h-full flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/12 shadow-[0_0_22px_rgba(16,185,129,0.12)]">
                <Volume2 size={16} className="text-emerald-300" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-100/45">Space</div>
                <div className="text-sm font-semibold text-emerald-50/90">Reverb, gain and tonal offset</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/60 px-4 py-3">
              <Volume2 size={15} className="shrink-0 text-emerald-300" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={vol}
                onChange={(event) => setVol(Number(event.target.value))}
                className="flex-1 accent-emerald-400"
              />
              <span className="text-[9px] font-mono tracking-[0.35em] text-emerald-100/40">VOL</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <button
                type="button"
                onClick={onToggleReverb}
                className={`min-h-[3.5rem] rounded-[22px] border px-5 py-3 text-[10px] font-black tracking-[0.32em] transition-all ${reverb ? 'border-emerald-300/25 bg-emerald-500/16 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.18)]' : 'border-white/10 bg-white/5 text-white/35'}`}
              >
                REVERB <span className="ml-1 opacity-55">{reverb ? 'ON' : 'OFF'}</span>
              </button>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/60 px-4 py-3">
                  <Globe size={15} className="shrink-0 text-indigo-300" />
                  <select
                    value={globalKeyOffset}
                    onChange={(event) => setGlobalKeyOffset(Number(event.target.value))}
                    className="w-full bg-transparent text-[11px] font-black uppercase text-emerald-100 outline-none"
                  >
                    {KEY_OPTIONS.map((option) => (
                      <option key={option.offset} value={option.offset} className="bg-[#0f172a]">
                        {option.name} Key
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/60 px-4 py-3">
                  <Globe size={15} className="shrink-0 text-teal-300" />
                  <select
                    value={scaleMode}
                    onChange={(event) => setScaleMode(event.target.value)}
                    className="w-full bg-transparent text-[11px] font-black uppercase text-emerald-100 outline-none"
                  >
                    {SCALE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0f172a]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

export default ControlPanel;
