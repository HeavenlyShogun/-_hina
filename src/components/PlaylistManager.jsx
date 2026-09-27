import React, { memo, useState } from 'react';
import useLivePlaybackFrame from '../hooks/useLivePlaybackFrame';
import {
  ListMusic,
  MoveDown,
  MoveUp,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';

const titleOf = (item) => item?.displayTitle ?? item?.title ?? item?.filename ?? item?.slug ?? '未命名曲目';
const durationOf = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const PLAY_MODES = ['sequence', 'loop-all', 'loop-one', 'shuffle'];
const PLAY_MODE_LABELS = {
  sequence: '依序播放',
  'loop-all': '清單循環',
  'loop-one': '單曲循環',
  shuffle: '隨機播放',
};

const PlaylistManager = memo(({
  queue = [],
  currentIndex = -1,
  playMode = 'sequence',
  isLoading = false,
  isPlaying = false,
  isPaused = false,
  currentTitle = '',
  bpm = 90,
  removeFromQueue,
  reorderQueue,
  clearQueue,
  playTrack,
  playNext,
  playPrevious,
  changePlayMode,
  onTogglePlayback,
  onSeekToTime,
  addTrack,
  featuredScores = [],
  onAddDefaults,
}) => {
  const [scrubTime, setScrubTime] = useState(null);
  const playbackFrame = useLivePlaybackFrame();
  const current = queue[currentIndex];
  const title = current ? titleOf(current) : currentTitle || '尚未選擇樂曲';
  const currentTime = Math.max(0, Number(playbackFrame.currentTime) || 0);
  const duration = Math.max(0, Number(playbackFrame.maxTime) || 0);
  const displayedTime = scrubTime ?? currentTime;
  const isActive = isPlaying || isPaused;
  const activeModeIndex = PLAY_MODES.indexOf(playMode);

  return (
    <section id="playlist-manager" data-ui-panel="true" className="scroll-mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/75 text-slate-50 shadow-[0_20px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-cyan-200/15 bg-cyan-300/10 p-2 text-cyan-100"><ListMusic size={18} /></span>
          <div>
            <h2 className="text-sm font-black text-white">我的歌單</h2>
            <p className="mt-1 text-[10px] text-white/50">{queue.length} 首歌曲 · {PLAY_MODE_LABELS[playMode]}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onAddDefaults} disabled={!featuredScores.length} className="rounded-lg border border-cyan-200/15 bg-cyan-300/10 px-3 py-2 text-[11px] font-bold text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-40">匯入預設曲庫</button>
          <button type="button" onClick={clearQueue} disabled={!queue.length} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold text-white/60 transition hover:bg-white/10 disabled:opacity-35">清空佇列</button>
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)] sm:p-6">
        <section aria-label="目前播放" className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-cyan-100/65">
            <span className={`h-1.5 w-1.5 rounded-full ${isPlaying ? 'animate-pulse bg-emerald-300' : 'bg-white/25'}`} />
            {isPlaying ? 'Now Playing' : isPaused ? 'Paused' : 'Ready to play'}
          </div>
          <div className="mt-4 flex min-w-0 items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-cyan-100/10 bg-gradient-to-br from-cyan-200/20 via-sky-400/10 to-amber-200/10 text-cyan-100 sm:h-20 sm:w-20">
              <ListMusic size={27} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black text-white sm:text-xl" title={title}>{title}</h3>
              <p className="mt-1 truncate text-xs font-medium text-slate-300/65">{current?.artist ?? 'Universe Rhythm Recorder'}{bpm ? ` · ${bpm} BPM` : ''}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/45">{durationOf(displayedTime)}</span>
            <input
              type="range"
              aria-label="歌單播放進度"
              min="0"
              max={duration || 1}
              step="0.1"
              value={duration ? Math.min(displayedTime, duration) : 0}
              onChange={(event) => setScrubTime(Number(event.target.value))}
              onPointerUp={(event) => {
                setScrubTime(null);
                onSeekToTime?.(Number(event.currentTarget.value));
              }}
              onKeyUp={(event) => {
                setScrubTime(null);
                onSeekToTime?.(Number(event.currentTarget.value));
              }}
              disabled={!duration}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-300 disabled:cursor-not-allowed disabled:opacity-30"
            />
            <span className="w-10 shrink-0 font-mono text-[10px] tabular-nums text-white/45">{durationOf(duration)}</span>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button type="button" aria-label="隨機播放" aria-pressed={playMode === 'shuffle'} title="隨機播放" onClick={() => changePlayMode?.(playMode === 'shuffle' ? 'sequence' : 'shuffle')} className={`rounded-full p-2 transition hover:bg-white/10 ${playMode === 'shuffle' ? 'text-cyan-200' : 'text-white/45 hover:text-white'}`}>
              <Shuffle size={17} />
            </button>
            <button type="button" aria-label="上一首" title="上一首" disabled={!queue.length && currentTime <= 3} onClick={playPrevious} className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-30">
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button type="button" aria-label={isPlaying ? '暫停' : '播放'} title={isPlaying ? '暫停' : '播放'} disabled={isLoading} onClick={onTogglePlayback} className="grid h-12 w-12 place-items-center rounded-full bg-cyan-100 text-slate-950 transition hover:scale-105 hover:bg-white active:scale-95 disabled:cursor-wait disabled:opacity-50">
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="translate-x-0.5" fill="currentColor" />}
            </button>
            <button type="button" aria-label="下一首" title="下一首" disabled={!queue.length || isLoading} onClick={playNext} className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-30">
              <SkipForward size={20} fill="currentColor" />
            </button>
            <button
              type="button"
              aria-label={`播放模式：${PLAY_MODE_LABELS[playMode]}`}
              title={`播放模式：${PLAY_MODE_LABELS[playMode]}`}
              aria-pressed={playMode === 'loop-all' || playMode === 'loop-one'}
              onClick={() => changePlayMode?.(PLAY_MODES[(activeModeIndex + 1 + PLAY_MODES.length) % PLAY_MODES.length])}
              className={`relative rounded-full p-2 transition hover:bg-white/10 ${playMode === 'loop-all' || playMode === 'loop-one' ? 'text-cyan-200' : 'text-white/45 hover:text-white'}`}
            >
              {playMode === 'loop-one' ? <Repeat1 size={17} /> : <Repeat size={17} />}
            </button>
          </div>
        </section>

        <section aria-label="播放佇列" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-black text-white">接下來播放</h3>
              <p className="mt-1 text-[10px] text-white/40">{queue.length ? `佇列中 ${queue.length} 首` : '從曲庫加入要播放的歌曲'}</p>
            </div>
            <span className="font-mono text-[10px] text-white/35">{queue.length ? `${String(Math.max(currentIndex + 1, 0)).padStart(2, '0')} / ${String(queue.length).padStart(2, '0')}` : '-- / --'}</span>
          </div>
          <div className="custom-scrollbar mt-3 max-h-52 space-y-1 overflow-y-auto pr-1">
            {queue.length ? queue.map((item, index) => (
              <div key={`${item.id ?? item.slug ?? item.filename ?? 'track'}-${index}`} className={`group flex items-center gap-2 rounded-lg px-2 py-2 ${index === currentIndex ? 'bg-cyan-300/10 text-cyan-50' : 'text-white/70 hover:bg-white/[0.05]'}`}>
                  <button type="button" aria-label={`播放 ${titleOf(item)}`} disabled={isLoading} onClick={() => Promise.resolve(playTrack?.(index)).catch((error) => console.error('Failed to play playlist item.', error))} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-wait disabled:opacity-50">
                  <span className="w-5 shrink-0 text-center font-mono text-[10px] text-white/35">{index === currentIndex && isActive ? <span className="text-cyan-200">♫</span> : String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{titleOf(item)}</span>
                  <span className="text-[10px] tabular-nums text-white/35">{durationOf(item.duration)}</span>
                </button>
                <button type="button" aria-label={`${titleOf(item)} 上移`} title="上移" disabled={index === 0} onClick={() => reorderQueue?.(index, index - 1)} className="rounded-md p-1.5 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none">
                  <MoveUp size={13} />
                </button>
                <button type="button" aria-label={`${titleOf(item)} 下移`} title="下移" disabled={index === queue.length - 1} onClick={() => reorderQueue?.(index, index + 1)} className="rounded-md p-1.5 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none">
                  <MoveDown size={13} />
                </button>
                <button type="button" aria-label={`從歌單移除 ${titleOf(item)}`} title="移除" onClick={() => removeFromQueue?.(index)} className="rounded-md p-1.5 text-white/35 transition hover:bg-rose-400/10 hover:text-rose-200">
                  <Trash2 size={13} />
                </button>
              </div>
            )) : <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/40">歌單目前是空的</p>}
          </div>

          <details className="mt-3 rounded-lg border border-white/10 bg-white/[0.025]">
            <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-bold text-cyan-100/80">從曲庫新增歌曲（{featuredScores.length}）</summary>
            <div className="custom-scrollbar max-h-44 space-y-1 overflow-y-auto px-2 pb-2">
              {featuredScores.map((item, index) => (
                <div key={item.id ?? item.slug ?? item.filename ?? index} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                  <span className="min-w-0 flex-1 truncate text-xs text-white/75">{titleOf(item)}</span>
                  <button type="button" aria-label={`加入歌單 ${titleOf(item)}`} title="加入佇列" onClick={() => addTrack?.(item)} className="rounded-md p-1.5 text-cyan-200 hover:bg-cyan-300/10"><Plus size={14} /></button>
                </div>
              ))}
              {!featuredScores.length && <p className="px-2 py-3 text-xs text-white/40">目前沒有可加入的曲目。</p>}
            </div>
          </details>
        </section>
      </div>
    </section>
  );
});

export default PlaylistManager;
