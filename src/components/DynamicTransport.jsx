import React, { memo, useMemo, useState } from 'react';
import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import useLivePlaybackFrame from '../hooks/useLivePlaybackFrame';
import { usePlayback } from '../contexts/PlaybackContext';

const secondsLabel = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const DynamicTransport = memo(({ title = '', queue: libraryScores = [], bpm = 90, currentIndex = -1, onSelectQueueItem }) => {
  const {
    isPlaying, isPaused, bpm: contextBpm, onTogglePlay, onPause, onResume, onRestart,
    onSeekToTime, onScrubToTime, playlist,
  } = usePlayback();
  const frame = useLivePlaybackFrame();
  const [scrub, setScrub] = useState(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const actualBpm = Number(contextBpm ?? bpm) || 90;
  const duration = Math.max(Number(frame.maxTime) || 0, 0);
  const current = scrub ?? Math.min(Number(frame.currentTime) || 0, duration);
  const customQueue = playlist?.queue ?? [];
  const usingCustomQueue = customQueue.length > 0;
  const visibleQueue = usingCustomQueue ? customQueue : libraryScores;
  const activeIndex = usingCustomQueue ? playlist.currentIndex : currentIndex;
  const playMode = playlist?.playMode ?? 'sequence';
  const isActive = isPlaying || isPaused;
  const modeText = playMode === 'loop-all' ? '\u6e05\u55ae\u5faa\u74b0' : playMode === 'loop-one' ? '\u55ae\u66f2\u5faa\u74b0' : playMode === 'shuffle' ? '\u96a8\u6a5f\u64ad\u653e' : '\u4f9d\u5e8f\u64ad\u653e';
  const nextRepeatMode = useMemo(() => ({ sequence: 'loop-all', 'loop-all': 'loop-one', 'loop-one': 'sequence' }), []);
  const canPrevious = activeIndex > 0 || current > 3;
  const canNext = activeIndex >= 0 && (activeIndex < visibleQueue.length - 1 || playMode !== 'sequence');

  const chooseTrack = (index) => {
    if (usingCustomQueue) {
      playlist.playQueueIndex(index).catch((error) => console.error('Failed to load playlist track.', error));
    } else {
      onSelectQueueItem?.(index);
    }
    setQueueOpen(false);
  };

  const previous = () => {
    if (current > 3) {
      onRestart?.();
    } else if (usingCustomQueue) {
      playlist.playPrevScore().catch((error) => console.error('Failed to play previous track.', error));
    } else if (activeIndex > 0) {
      chooseTrack(activeIndex - 1);
    } else {
      onRestart?.();
    }
  };

  const next = () => {
    if (playMode === 'loop-one') {
      if (usingCustomQueue) {
        playlist.playQueueIndex(activeIndex).catch((error) => console.error('Failed to repeat playlist track.', error));
      } else {
        onRestart?.();
      }
      return;
    }
    if (usingCustomQueue) {
      playlist.playNextScore().catch((error) => console.error('Failed to play next track.', error));
      return;
    }
    if (playMode === 'shuffle' && visibleQueue.length > 1) {
      const candidates = visibleQueue.map((_, index) => index).filter((index) => index !== activeIndex);
      chooseTrack(candidates[Math.floor(Math.random() * candidates.length)]);
    } else if (activeIndex < visibleQueue.length - 1) {
      chooseTrack(activeIndex + 1);
    } else if (playMode === 'loop-all' && visibleQueue.length) {
      chooseTrack(0);
    }
  };

  const setMode = (mode) => playlist?.changePlayMode?.(mode);
  const previewTime = (value) => {
    const nextTime = Math.max(0, Math.min(Number(value) || 0, duration));
    setScrub(nextTime);
    onScrubToTime?.(nextTime);
  };
  const commitTime = (value) => {
    const nextTime = Math.max(0, Math.min(Number(value) || 0, duration));
    setScrub(null);
    onSeekToTime?.(nextTime);
  };

  return (
    <section className="relative z-20 w-full rounded-[26px] border border-sky-200/20 bg-slate-950/75 p-4 text-slate-50 shadow-[0_24px_70px_rgba(2,6,23,.38)] backdrop-blur-xl sm:p-5" aria-label="Playback controls">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(260px,auto)_minmax(0,1fr)] sm:gap-4">
        <div className="min-w-0">
          <div className={`truncate text-sm font-bold ${isPlaying ? 'transport-title-active' : ''}`} title={title}>{title || '\u5c1a\u672a\u9078\u64c7\u6a02\u66f2'}</div>
          <div className="mt-1 text-[10px] font-bold tracking-[.18em] text-cyan-200/65">\u266a {actualBpm} BPM</div>
        </div>
        <div className="col-span-2 flex items-center justify-center gap-2 sm:col-span-1 sm:gap-4">
          <button type="button" aria-label="Toggle shuffle" aria-pressed={playMode === 'shuffle'} onClick={() => setMode(playMode === 'shuffle' ? 'sequence' : 'shuffle')} className={`relative rounded-full p-2 transition active:scale-95 ${playMode === 'shuffle' ? 'text-cyan-300' : 'text-slate-400 hover:text-white'}`}><Shuffle size={18} />{playMode === 'shuffle' && <i className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(103,232,249,.65)]" />}</button>
          <button type="button" aria-label="Previous" disabled={!canPrevious} onClick={previous} className="rounded-full p-2 text-slate-300 transition hover:text-white active:scale-95 disabled:opacity-30"><SkipBack size={20} fill="currentColor" /></button>
          <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => isPlaying ? onPause?.() : isPaused ? onResume?.() : onTogglePlay?.()} className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-200 via-cyan-100 to-sky-400 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,.3),0_0_46px_rgba(245,158,11,.16)] transition active:scale-95 sm:h-16 sm:w-16">
            {isActive && <span className="transport-pulse" style={{ animationDuration: `${60 / actualBpm}s` }} />}
            <span className="relative transition-transform duration-200 hover:rotate-3">{isPlaying ? <Pause size={23} fill="currentColor" /> : <Play size={23} className="translate-x-0.5" fill="currentColor" />}</span>
          </button>
          <button type="button" aria-label="Next" disabled={!canNext} onClick={next} className="rounded-full p-2 text-slate-300 transition hover:text-white active:scale-95 disabled:opacity-30"><SkipForward size={20} fill="currentColor" /></button>
          <button type="button" aria-label={`Repeat mode: ${modeText}`} aria-pressed={playMode === 'loop-all' || playMode === 'loop-one'} onClick={() => setMode(nextRepeatMode[playMode] ?? 'loop-all')} className={`relative rounded-full p-2 transition active:scale-95 ${playMode === 'loop-all' || playMode === 'loop-one' ? 'text-cyan-300' : 'text-slate-400 hover:text-white'}`}>{playMode === 'loop-one' ? <Repeat1 size={18} /> : <Repeat size={18} />}{(playMode === 'loop-all' || playMode === 'loop-one') && <i className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-300" />}</button>
        </div>
        <div className="col-span-2 flex min-w-0 justify-center sm:col-span-1 sm:justify-end">
          <button type="button" onClick={() => setQueueOpen((open) => !open)} aria-expanded={queueOpen} className="flex items-center gap-2 rounded-full px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white"><ListMusic size={17} /><span className="font-mono">{secondsLabel(current)} / {secondsLabel(duration)}</span><span className="hidden md:inline">\u4f75\u5217 {visibleQueue.length}</span></button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 sm:mt-4">
        <span className="w-10 shrink-0 text-right font-mono text-[10px] text-slate-400 sm:hidden">{secondsLabel(current)}</span>
        <input aria-label="Playback position" type="range" min="0" max={duration || 1} step="0.1" value={current} onChange={(event) => previewTime(event.target.value)} onPointerUp={(event) => commitTime(event.currentTarget.value)} onKeyUp={(event) => commitTime(event.currentTarget.value)} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-300" />
        <span className="w-10 shrink-0 font-mono text-[10px] text-slate-400 sm:hidden">{secondsLabel(duration)}</span>
      </div>
      {scrub !== null && <div className="mt-1 text-center font-mono text-[10px] text-cyan-200">\u9810\u89bd {secondsLabel(scrub)}</div>}
      {queueOpen && <div className="mt-4 max-h-56 overflow-auto rounded-xl border border-white/10 bg-slate-900/80 p-2 shadow-xl">
        {visibleQueue.length ? visibleQueue.map((item, index) => <button key={item.id ?? item.slug ?? item.filename ?? index} type="button" onClick={() => chooseTrack(index)} className={`flex w-full items-center gap-3 truncate rounded-lg px-3 py-2 text-left text-xs ${index === activeIndex ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}><span className="w-6 shrink-0 font-mono text-cyan-200/70">{String(index + 1).padStart(2, '0')}</span><span className="truncate">{item.displayTitle ?? item.title ?? item.filename}</span>{index === activeIndex && <span className="equalizer ml-auto flex h-4 shrink-0 items-end gap-0.5" aria-label={'\u6b63\u5728\u64ad\u653e'}><i /><i /><i /></span>}</button>) : <p className="px-3 py-2 text-xs text-slate-400">\u4f75\u5217\u76ee\u524d\u70ba\u7a7a</p>}
      </div>}
    </section>
  );
});

export default DynamicTransport;
