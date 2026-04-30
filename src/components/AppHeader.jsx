import React, { memo } from 'react';
import { Keyboard, Music2, Play, Sparkles, Square } from 'lucide-react';
import { usePlayback } from '../contexts/PlaybackContext';

const AppHeader = memo(({ playHotkey, setPlayHotkey, featuredScores = [], onPlayFeaturedScore }) => {
  const { isPlaying, onTogglePlay } = usePlayback();

  return (
    <header className="relative z-30 mt-6 sm:mt-8 flex w-full max-w-6xl flex-col gap-5 overflow-hidden rounded-[28px] border border-white/10 bg-black/60 px-4 py-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_85%_25%,rgba(20,184,166,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]" />
      <div className="relative flex items-center gap-4 sm:gap-5">
        <div className="rounded-[1.35rem] border border-emerald-400/25 bg-emerald-500/18 p-3 shadow-[0_0_28px_rgba(16,185,129,0.22)] backdrop-blur-xl sm:p-3.5">
          <Music2 className="text-emerald-400" size={28} />
        </div>
        <div>
          <h1 className="text-[1.75rem] font-black tracking-tight text-emerald-50 sm:text-3xl">
            Wind Poetry
            <span className="ml-1 text-emerald-500 italic">琴房</span>
          </h1>
          <p className="mt-1 font-sans text-[9px] uppercase tracking-[0.38em] text-emerald-100/35">
            琴譜練習與播放工具
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
                className="flex min-h-[3.25rem] items-center justify-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/12 px-4 py-3 text-left text-amber-50 shadow-[0_16px_40px_rgba(245,158,11,0.12)] transition-all hover:-translate-y-0.5 hover:bg-amber-400/18 hover:shadow-[0_18px_46px_rgba(245,158,11,0.2)]"
                title={`播放 ${score.displayTitle ?? score.title}`}
              >
                <Sparkles size={15} className="shrink-0 text-amber-200" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black tracking-[0.16em]">
                    {score.displayTitle ?? score.title}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold tracking-[0.22em] text-amber-100/45">
                    {score.subtitle ?? '獨立播放'}
                  </span>
                </span>
                <Play size={14} fill="currentColor" className="shrink-0 text-amber-200" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex w-full items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:w-auto">
          <Keyboard size={14} className="shrink-0 text-emerald-300/60" />
          <select
            value={playHotkey}
            onChange={(event) => setPlayHotkey(event.target.value)}
            className="w-full cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-emerald-100/75 outline-none"
          >
            <option value="Space" className="bg-[#0f172a]">播放鍵：空白鍵</option>
            <option value="Enter" className="bg-[#0f172a]">播放鍵：Enter</option>
            <option value="None" className="bg-[#0f172a]">停用快捷鍵</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onTogglePlay}
          className={`flex w-full min-w-[12rem] items-center justify-center gap-4 rounded-full border px-6 py-3.5 text-sm font-black tracking-[0.22em] shadow-2xl transition-all active:scale-[0.98] sm:w-auto sm:px-10 ${isPlaying ? 'border-rose-400/35 bg-rose-500/18 text-rose-100 shadow-[0_16px_40px_rgba(244,63,94,0.18)]' : 'border-emerald-300/20 bg-[linear-gradient(135deg,rgba(5,150,105,0.95),rgba(13,148,136,0.9))] text-white shadow-[0_18px_45px_rgba(4,120,87,0.35)]'}`}
        >
          {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          {isPlaying ? '停止' : '播放目前琴譜'}
        </button>
        </div>
      </div>
    </header>
  );
});

export default AppHeader;
