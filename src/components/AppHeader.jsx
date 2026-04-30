import React, { memo } from 'react';
import { Keyboard, Music2, Play, Sparkles, Square } from 'lucide-react';
import { usePlayback } from '../contexts/PlaybackContext';

const BRAND_NAME = 'guilty corn';
const BRAND_SUBTITLE = '(豐川罪孽玉米企業)';

const AppHeader = memo(({ playHotkey, setPlayHotkey, featuredScores = [], onPlayFeaturedScore }) => {
  const { isPlaying, onTogglePlay } = usePlayback();

  return (
    <header className="relative z-30 mt-6 flex w-full max-w-6xl flex-col gap-5 overflow-hidden rounded-[28px] border border-white/70 bg-white/88 px-4 py-5 text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:mt-8 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),radial-gradient(circle_at_85%_25%,rgba(20,184,166,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.72))]" />
      <div className="relative flex items-center gap-4 sm:gap-5">
        <div className="rounded-[1.35rem] border border-teal-200 bg-teal-50 p-3 shadow-[0_0_28px_rgba(16,185,129,0.14)] sm:p-3.5">
          <Music2 className="text-teal-700" size={28} />
        </div>
        <div>
          <h1 className="text-[1.75rem] font-black tracking-tight text-slate-950 sm:text-3xl">
            {BRAND_NAME}
            <span className="block text-base text-teal-700 italic sm:ml-2 sm:inline sm:text-3xl">{BRAND_SUBTITLE}</span>
          </h1>
          <p className="mt-1 font-sans text-[9px] uppercase tracking-[0.38em] text-slate-500">
            琴譜練習與播放工作區
          </p>
        </div>
      </div>

      <div className="relative flex w-full flex-col items-stretch gap-3 lg:w-auto">
        {featuredScores.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            {featuredScores.map((score) => (
              <button
                key={score.id}
                type="button"
                onClick={() => onPlayFeaturedScore?.(score)}
                className="flex min-h-[3.25rem] items-center justify-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-amber-900 shadow-[0_16px_40px_rgba(245,158,11,0.12)] transition-all hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-[0_18px_46px_rgba(245,158,11,0.16)]"
                title={`播放 ${score.displayTitle ?? score.title}`}
              >
                <Sparkles size={15} className="shrink-0 text-amber-700" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black tracking-[0.16em]">
                    {score.displayTitle ?? score.title}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold tracking-[0.22em] text-amber-700/65">
                    {score.subtitle ?? '精選琴譜'}
                  </span>
                </span>
                <Play size={14} fill="currentColor" className="shrink-0 text-amber-700" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex w-full items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/95 px-4 py-3 shadow-[inset_0_1px_0_rgba(15,23,42,0.06)] sm:w-auto">
            <Keyboard size={14} className="shrink-0 text-teal-700" />
            <select
              value={playHotkey}
              onChange={(event) => setPlayHotkey(event.target.value)}
              className="w-full cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-slate-700 outline-none"
            >
              <option value="Space" className="bg-white text-slate-900">播放鍵：空白鍵</option>
              <option value="Enter" className="bg-white text-slate-900">播放鍵：Enter</option>
              <option value="None" className="bg-white text-slate-900">停用快捷鍵</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onTogglePlay}
            className={`flex w-full min-w-[12rem] items-center justify-center gap-4 rounded-full border px-6 py-3.5 text-sm font-black tracking-[0.22em] shadow-xl transition-all active:scale-[0.98] sm:w-auto sm:px-10 ${isPlaying ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-[0_16px_40px_rgba(244,63,94,0.12)]' : 'border-indigo-200 bg-white/92 text-indigo-800 shadow-[0_18px_45px_rgba(30,41,59,0.12)] hover:bg-indigo-50'}`}
          >
            {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            {isPlaying ? '停止' : '播放琴譜'}
          </button>
        </div>
      </div>
    </header>
  );
});

export default AppHeader;
