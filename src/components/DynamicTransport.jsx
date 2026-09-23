import React, { memo, useMemo, useState } from 'react';
import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import useLivePlaybackFrame from '../hooks/useLivePlaybackFrame';
import { usePlayback } from '../contexts/PlaybackContext';

const timeLabel = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const DynamicTransport = memo(({ title = '', queue = [], bpm = 90, currentIndex = -1, onSelectQueueItem, onQueueToggle }) => {
  const { isPlaying, isPaused, bpm: contextBpm, onTogglePlay, onPause, onResume, onRestart, onSeekToTime, onScrubToTime, playMode: contextPlayMode, setPlayMode: setContextPlayMode } = usePlayback();
  const frame = useLivePlaybackFrame();
  const [localPlayMode, setLocalPlayMode] = useState('sequence');
  const [scrub, setScrub] = useState(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const actualBpm = Number(contextBpm ?? bpm) || 90;
  const duration = Math.max(Number(frame.maxTime) || 0, 0);
  const current = scrub ?? Math.min(Number(frame.currentTime) || 0, duration);
  const activeMode = contextPlayMode ?? localPlayMode;
  const setPlayMode = setContextPlayMode ?? setLocalPlayMode;
  const canPrev = currentIndex > 0 || current > 3;
  const canNext = currentIndex >= 0 && (currentIndex < queue.length - 1 || activeMode === 'all' || activeMode === 'one' || activeMode === 'shuffle');
  const nextMode = useMemo(() => ({ sequence: 'all', all: 'one', one: 'sequence' }), []);
  const modeLabel = activeMode === 'all' ? 'Loop all' : activeMode === 'one' ? 'Loop one' : 'Play in order';

  const seek = (value, commit) => {
    const seconds = Number(value);
    setScrub(seconds);
    if (commit) {
      (onSeekToTime ?? (() => {}))(seconds);
      setScrub(null);
    } else (onScrubToTime ?? (() => {}))(seconds);
  };
  const previous = () => current > 3 ? onRestart?.() : (currentIndex > 0 ? onSelectQueueItem?.(currentIndex - 1) : onRestart?.());
  const next = () => {
    if (activeMode === 'one') return onRestart?.();
    if (activeMode === 'shuffle' && queue.length > 1) {
      const choices = queue.map((_, i) => i).filter((i) => i !== currentIndex);
      return onSelectQueueItem?.(choices[Math.floor(Math.random() * choices.length)]);
    }
    if (currentIndex < queue.length - 1) return onSelectQueueItem?.(currentIndex + 1);
    if (activeMode === 'all' && queue.length) return onSelectQueueItem?.(0);
    return undefined;
  };
  const active = isPlaying || isPaused;

  return <section className="relative z-20 w-full rounded-[26px] border border-sky-200/20 bg-slate-950/75 p-4 text-slate-50 shadow-[0_24px_70px_rgba(2,6,23,.38)] backdrop-blur-xl sm:p-5" aria-label="Playback controls">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(260px,auto)_minmax(0,1fr)]">
      <div className="min-w-0"><div className="transport-marquee truncate text-sm font-bold" title={title}>{title || 'No score selected'}</div><div className="mt-1 text-[10px] font-bold tracking-[.18em] text-cyan-200/65">♩ {actualBpm} BPM</div></div>
      <div className="col-span-2 flex items-center justify-center gap-3 sm:col-span-1 sm:gap-5">
        <button type="button" aria-label="Toggle shuffle" aria-pressed={activeMode === 'shuffle'} onClick={() => setPlayMode?.(activeMode === 'shuffle' ? 'sequence' : 'shuffle')} className={`relative rounded-full p-2 transition active:scale-95 ${activeMode === 'shuffle' ? 'text-cyan-300' : 'text-slate-400 hover:text-white'}`}><Shuffle size={18}/>{activeMode === 'shuffle' && <i className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(103,232,249,.65)]"/>}</button>
        <button type="button" aria-label="Previous" disabled={!canPrev} onClick={previous} className="rounded-full p-2 text-slate-300 transition hover:text-white active:scale-95 disabled:opacity-30"><SkipBack size={20} fill="currentColor"/></button>
        <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => isPlaying ? onPause?.() : isPaused ? onResume?.() : onTogglePlay?.()} className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-200 via-cyan-100 to-sky-400 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,.3),0_0_46px_rgba(245,158,11,.16)] transition active:scale-95 sm:h-16 sm:w-16">
          {active && <span className="transport-pulse" style={{ animationDuration: `${60 / actualBpm}s` }}/>}<span className="relative transition-transform duration-200 hover:rotate-3">{isPlaying ? <Pause size={23} fill="currentColor"/> : <Play size={23} className="translate-x-0.5" fill="currentColor"/>}</span>
        </button>
        <button type="button" aria-label="Next" disabled={!canNext} onClick={next} className="rounded-full p-2 text-slate-300 transition hover:text-white active:scale-95 disabled:opacity-30"><SkipForward size={20} fill="currentColor"/></button>
        <button type="button" aria-label={`Playback mode: ${modeLabel}`} aria-pressed={activeMode === 'all' || activeMode === 'one'} onClick={() => setPlayMode?.(nextMode[activeMode] ?? 'all')} className={`relative rounded-full p-2 transition active:scale-95 ${activeMode === 'all' || activeMode === 'one' ? 'text-cyan-300' : 'text-slate-400 hover:text-white'}`}>{activeMode === 'one' ? <Repeat1 size={18}/> : <Repeat size={18}/>}{activeMode !== 'sequence' && <i className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-300"/>}</button>
      </div>
      <div className="hidden min-w-0 justify-end sm:flex"><button type="button" onClick={() => { setQueueOpen((v) => !v); onQueueToggle?.(); }} aria-expanded={queueOpen} className="flex items-center gap-2 rounded-full px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white"><ListMusic size={17}/><span>{timeLabel(current)} / {timeLabel(duration)}</span></button></div>
    </div>
    <div className="mt-4 flex items-center gap-3"><span className="w-10 shrink-0 text-right font-mono text-[10px] text-slate-400 sm:hidden">{timeLabel(current)}</span><input aria-label="Playback position" type="range" min="0" max={duration || 1} step="0.1" value={current} onChange={(event) => seek(event.target.value, false)} onPointerUp={(event) => seek(event.currentTarget.value, true)} onKeyUp={(event) => seek(event.currentTarget.value, true)} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-300"/><span className="w-20 shrink-0 text-right font-mono text-[10px] text-slate-400 sm:hidden">{timeLabel(duration)}</span><button type="button" className="hidden text-xs text-slate-300 sm:inline" onClick={() => { setQueueOpen((v) => !v); onQueueToggle?.(); }} aria-label="Toggle queue" aria-expanded={queueOpen}><ListMusic size={17}/></button></div>
    {scrub !== null && <div className="mt-1 text-center font-mono text-[10px] text-cyan-200">Preview {timeLabel(scrub)}</div>}
    {queueOpen && <div className="mt-4 max-h-48 overflow-auto rounded-xl border border-white/10 bg-slate-900/70 p-2">{queue.length ? queue.map((item, index) => <button key={item.id ?? item.filename ?? index} type="button" onClick={() => onSelectQueueItem?.(index)} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-xs ${index === currentIndex ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-300 hover:bg-white/5'}`}>{index === currentIndex ? '♫  ' : ''}{item.displayTitle ?? item.title}</button>) : <p className="px-3 py-2 text-xs text-slate-400">Queue is empty</p>}</div>}
  </section>;
});

export default DynamicTransport;
