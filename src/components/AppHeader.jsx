import React, { memo, useMemo } from 'react';
import { Keyboard, Music2, Play, Square } from 'lucide-react';
import { APP_NAME, APP_SUBTITLE, APP_TAGLINE, DEFAULT_SCORE_NAME } from '../config/branding';
import { usePlayback } from '../contexts/PlaybackContext';

const BRAND_NAME = APP_NAME;
const BRAND_SUBTITLE = APP_TAGLINE;
const STAR_POSITIONS = [
  { left: '8%', top: '18%', size: 'h-14 w-14' },
  { left: '28%', top: '42%', size: 'h-12 w-12' },
  { left: '47%', top: '16%', size: 'h-16 w-16' },
  { left: '64%', top: '48%', size: 'h-12 w-12' },
  { left: '82%', top: '22%', size: 'h-14 w-14' },
  { left: '17%', top: '74%', size: 'h-12 w-12' },
  { left: '52%', top: '78%', size: 'h-14 w-14' },
  { left: '78%', top: '70%', size: 'h-12 w-12' },
];

const AppHeader = memo(({
  playHotkey,
  setPlayHotkey,
  scoreGroups = [],
  onPlayFeaturedScore,
  scoreTitle,
  onJumpToSection,
  workspaceSections = [],
}) => {
  const { isPlaying, onTogglePlay } = usePlayback();

  const stellarScoreGroups = useMemo(() =>
    scoreGroups.map(group => ({
      ...group,
      files: (group.files || []).slice(0, STAR_POSITIONS.length).map((score, index) => ({
        ...score,
        position: STAR_POSITIONS[index],
      })),
    })),
  [scoreGroups]);

  return (
    <header className="relative z-30 mt-6 flex w-full max-w-6xl flex-col gap-5 overflow-hidden rounded-[32px] border border-sky-200/30 bg-slate-950/75 px-4 py-5 text-slate-50 shadow-[0_30px_90px_rgba(2,6,23,0.5)] backdrop-blur-xl sm:mt-8 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(250,204,21,0.16),transparent_20%),radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.24),transparent_42%),linear-gradient(180deg,rgba(2,6,23,0.82),rgba(15,23,42,0.92))]" />
      <div className="pointer-events-none absolute inset-0 starfield-grid opacity-70" />

      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-[28px] border border-sky-200/15 bg-slate-950/35 p-5">
          <div className="flex items-center gap-4">
            <div className="rounded-[1.35rem] border border-sky-300/30 bg-sky-400/10 p-3 shadow-[0_0_28px_rgba(56,189,248,0.18)] sm:p-3.5">
              <Music2 className="text-sky-200" size={28} />
            </div>
            <div>
              <h1 className="text-[1.75rem] font-black tracking-tight text-white sm:text-3xl">
                {BRAND_NAME}
              </h1>
              <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.38em] text-sky-100/60">
                {BRAND_SUBTITLE}
              </p>
              <p className="mt-2 text-xs text-sky-100/55">
                {APP_SUBTITLE}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <Keyboard size={14} className="shrink-0 text-sky-300" />
              <select
                value={playHotkey}
                onChange={(event) => setPlayHotkey(event.target.value)}
                className="w-full cursor-pointer bg-transparent text-xs uppercase tracking-[0.2em] text-slate-100 outline-none"
              >
                <option value="Space" className="bg-slate-900 text-white">Space 播放</option>
                <option value="Enter" className="bg-slate-900 text-white">Enter 播放</option>
                <option value="None" className="bg-slate-900 text-white">停用快捷鍵</option>
              </select>
            </div>

            <button
              type="button"
              onClick={onTogglePlay}
              className={`flex h-12 items-center justify-center gap-3 rounded-full border px-5 text-xs font-black tracking-[0.18em] shadow-xl transition-all active:scale-[0.98] ${isPlaying ? 'border-rose-300/60 bg-rose-400/15 text-rose-100 shadow-[0_16px_40px_rgba(244,63,94,0.18)]' : 'border-emerald-300/50 bg-emerald-400/20 text-emerald-50 shadow-[0_18px_45px_rgba(16,185,129,0.24)] hover:bg-emerald-400/28'}`}
            >
              {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              {isPlaying ? '停止' : '播放'}
            </button>
          </div>

          {workspaceSections.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {workspaceSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onJumpToSection?.(section.id)}
                  className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-sky-100 transition-colors hover:bg-sky-400/18"
                >
                  {section.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-amber-200/15 bg-slate-950/35 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-100/55">
                星座選曲
              </div>
              <div className="mt-1 text-sm font-semibold text-white/90">
                以星圖方式快速切換常用曲目
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-slate-300">
              {scoreTitle || DEFAULT_SCORE_NAME}
            </div>
          </div>

          <div className="relative min-h-[220px] overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(15,23,42,0.2),rgba(2,6,23,0.85)),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))]">
            <div className="pointer-events-none absolute inset-0 starfield-grid opacity-60" />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M8 18 L28 42 L47 16 L64 48 L82 22" stroke="rgba(125,211,252,0.28)" strokeWidth="0.45" fill="none" />
              <path d="M28 42 L17 74 L52 78 L78 70 L82 22" stroke="rgba(250,204,21,0.18)" strokeWidth="0.4" fill="none" />
            </svg>

            {stellarScoreGroups.map(group => group.files.map((score) => {
              const isActive = score.title === scoreTitle || score.displayTitle === scoreTitle;

              return (
                <button
                  key={score.id}
                  type="button"
                  onClick={() => onPlayFeaturedScore?.(score)}
                  className={`absolute flex flex-col items-center justify-center rounded-full border text-center transition-all ${score.position.size} ${isActive ? 'border-amber-200 bg-amber-300/20 text-amber-50 shadow-[0_0_32px_rgba(251,191,36,0.35)]' : 'border-sky-200/30 bg-sky-300/10 text-sky-50 hover:bg-sky-300/18 hover:shadow-[0_0_26px_rgba(56,189,248,0.22)]'}`}
                  style={{ left: score.position.left, top: score.position.top, transform: 'translate(-50%, -50%)' }}
                >
                  <span className="text-[15px] leading-none">✦</span>
                  <span className="mt-1 max-w-[5rem] truncate px-2 text-[9px] font-black tracking-[0.14em]">
                    {score.displayTitle ?? score.title}
                  </span>
                </button>
              );
            }))}
          </div>

          <div className="mt-4 space-y-2">
            {scoreGroups.map((group) => (
              <div key={group.id} className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-300">
                  {group.label}
                </span>
                {(group.files ?? []).slice(0, 6).map((score) => (
                  <button
                    key={score.id}
                    type="button"
                    onClick={() => onPlayFeaturedScore?.(score)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-100 transition-colors hover:bg-white/10"
                  >
                    {score.displayTitle ?? score.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
});

export default AppHeader;
