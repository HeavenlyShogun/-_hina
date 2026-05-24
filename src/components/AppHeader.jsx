import React, { memo, useMemo } from 'react';
import { Keyboard, Music2, Play, Square } from 'lucide-react';
import { APP_NAME, APP_SUBTITLE, APP_TAGLINE, DEFAULT_SCORE_NAME } from '../config/branding';
import { usePlayback } from '../contexts/PlaybackContext';

const AppHeader = memo(({
  playHotkey,
  setPlayHotkey,
  featuredScores = [],
  scoreGroups = [],
  onPlayFeaturedScore,
  scoreTitle,
  onJumpToSection,
  workspaceSections = [],
  isBusy = false,
  busyMessage = '',
}) => {
  const { isPlaying, onTogglePlay } = usePlayback();

  const scoreOptions = useMemo(() => {
    if (scoreGroups.length > 0) {
      return scoreGroups;
    }

    return [{
      id: 'featured',
      label: '內建曲目',
      files: featuredScores,
    }];
  }, [featuredScores, scoreGroups]);

  const flattenedScores = useMemo(
    () => scoreOptions.flatMap((group) => group.files ?? []),
    [scoreOptions],
  );
  const activeScore = flattenedScores.find((score) =>
    score.title === scoreTitle || score.displayTitle === scoreTitle,
  );

  return (
    <header className="relative z-30 mt-6 flex w-full max-w-6xl scroll-mt-6 flex-col gap-5 overflow-hidden rounded-[32px] border border-sky-200/30 bg-slate-950/75 px-4 py-5 text-slate-50 shadow-[0_30px_90px_rgba(2,6,23,0.5)] backdrop-blur-xl sm:mt-8 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.1),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(250,204,21,0.08),transparent_20%),radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.12),transparent_42%),linear-gradient(180deg,rgba(2,6,23,0.28),rgba(15,23,42,0.36))]" />
      <div className="pointer-events-none absolute inset-0 starfield-grid opacity-70" />

      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-[28px] border border-sky-200/15 bg-slate-950/35 p-5">
          <div className="flex items-center gap-4">
            <div className="rounded-[1.35rem] border border-sky-300/30 bg-sky-400/10 p-3 shadow-[0_0_28px_rgba(56,189,248,0.18)] sm:p-3.5">
              <Music2 className="text-sky-200" size={28} />
            </div>
            <div>
              <h1 className="text-[1.75rem] font-black tracking-tight text-white sm:text-3xl">
                {APP_NAME}
              </h1>
              <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.38em] text-sky-100/60">
                {APP_TAGLINE}
              </p>
              <p className="mt-2 text-xs text-sky-100/55">
                {APP_SUBTITLE}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <Keyboard size={14} className="shrink-0 text-sky-300" />
              <span className="sr-only">播放快捷鍵</span>
              <select
                value={playHotkey}
                onChange={(event) => setPlayHotkey(event.target.value)}
                className="w-full cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-slate-100 outline-none"
              >
                <option value="Space" className="bg-slate-900 text-white">Space 播放</option>
                <option value="Enter" className="bg-slate-900 text-white">Enter 播放</option>
                <option value="None" className="bg-slate-900 text-white">停用快捷鍵</option>
              </select>
            </label>

            <button
              type="button"
              onClick={onTogglePlay}
              disabled={isBusy}
              className={`flex h-12 items-center justify-center gap-3 rounded-full border px-5 text-xs font-black tracking-[0.18em] shadow-xl transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-65 ${isPlaying ? 'border-rose-300/60 bg-rose-400/15 text-rose-100 shadow-[0_16px_40px_rgba(244,63,94,0.18)]' : 'border-emerald-300/50 bg-emerald-400/20 text-emerald-50 shadow-[0_18px_45px_rgba(16,185,129,0.24)] hover:bg-emerald-400/28'}`}
            >
              {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              {isBusy ? '載入中...' : (isPlaying ? '停止' : '播放')}
            </button>
          </div>

          {isBusy ? (
            <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-xs font-semibold text-amber-50/95">
              {busyMessage || '載入音色與譜面中...'}
            </div>
          ) : null}

          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Workspace quick navigation">
            {workspaceSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onJumpToSection?.(section.id)}
                title={section.caption}
                className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-[10px] font-black tracking-[0.16em] text-sky-100 transition-colors hover:bg-sky-400/18"
              >
                {section.shortLabel ?? section.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="rounded-[28px] border border-amber-200/15 bg-slate-950/35 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-100/55">
                Score Library
              </div>
              <div className="mt-1 text-sm font-semibold text-white/90">
                從所有可匯入譜面中選擇一首載入播放。
              </div>
            </div>
            <div className="max-w-[12rem] truncate rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
              {scoreTitle || DEFAULT_SCORE_NAME}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4">
            <label className="block text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/60">
              選擇譜面
            </label>
            <select
              value={activeScore?.id ?? ''}
              disabled={isBusy}
              onChange={(event) => {
                const nextScore = flattenedScores.find((score) => score.id === event.target.value);
                if (nextScore) {
                  onPlayFeaturedScore?.(nextScore);
                }
              }}
              className="mt-3 h-12 w-full rounded-2xl border border-amber-200/20 bg-slate-900 px-4 text-sm font-bold text-amber-50 outline-none transition focus:border-amber-200/55 disabled:cursor-wait disabled:opacity-60"
            >
              <option value="" className="bg-slate-950 text-slate-100">
                {scoreTitle || DEFAULT_SCORE_NAME}
              </option>
              {scoreOptions.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {(group.files ?? []).map((score) => (
                    <option key={score.id} value={score.id} className="bg-slate-950 text-slate-100">
                      {score.displayTitle ?? score.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                目前曲目：<span className="font-bold text-amber-100">{scoreTitle || DEFAULT_SCORE_NAME}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                可匯入譜面：<span className="font-bold text-amber-100">{flattenedScores.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});

export default AppHeader;
