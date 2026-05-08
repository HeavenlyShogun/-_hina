import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NOTES_MAP, getSolfege } from '../constants/music';
import { useAudioConfig } from '../contexts/AudioConfigContext';
import { usePlayback } from '../contexts/PlaybackContext';
import useLivePlaybackFrame from '../hooks/useLivePlaybackFrame';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTimeLabel(seconds) {
  const safeSeconds = Math.max(Number(seconds) || 0, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds % 1) * 10);

  if (minutes > 0) {
    return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${tenths}`;
  }

  return `${wholeSeconds}.${tenths}s`;
}

const PianoKey = memo(({
  keyInfo,
  isSharp,
  globalOffset,
  isActive,
  pulseToken,
  onActivate,
  onDeactivate,
  onToggleSharp,
}) => {
  const totalOffset = globalOffset + (isSharp ? 1 : 0);
  const displayOffset =
    totalOffset !== 0
      ? (Math.abs(totalOffset) <= 2
          ? (totalOffset > 0 ? '#' : 'b').repeat(Math.abs(totalOffset))
          : `${totalOffset > 0 ? '#' : 'b'}${Math.abs(totalOffset)}`)
      : null;

  const handleToggle = useCallback((event) => {
    event.stopPropagation();
    onToggleSharp(keyInfo.k);
  }, [onToggleSharp, keyInfo.k]);

  const handleDown = useCallback((event) => {
    if (event.pointerType !== 'touch') {
      event.preventDefault();
    }
    if (event.pointerType !== 'touch' && event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
    onActivate(keyInfo.k);
  }, [onActivate, keyInfo.k]);

  const handleUp = useCallback((event) => {
    if (event.pointerType !== 'touch') {
      event.preventDefault();
    }
    if (event.currentTarget.releasePointerCapture && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }
    onDeactivate(keyInfo.k);
  }, [onDeactivate, keyInfo.k]);

  return (
    <div className="key-wrapper group relative w-full max-w-[3rem] sm:max-w-[5.9rem] md:max-w-[5.5rem]">
      <div className="lyre-key-aura" data-active={isActive} />
      {pulseToken > 0 ? <div key={pulseToken} className="lyre-key-ripple" aria-hidden="true" /> : null}
      <button
        type="button"
        onClick={handleToggle}
        className={`absolute -right-1 -top-1 z-30 flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-black transition-all backdrop-blur-lg md:-right-2 md:-top-2 md:h-7 md:w-7 md:text-[9px] ${isSharp ? 'scale-110 border-amber-200 bg-amber-400 text-amber-950 shadow-[0_0_14px_rgba(251,191,36,0.42)]' : 'border-white/10 bg-black/55 text-white/30 hover:bg-white/10 group-hover:text-white/50'}`}
      >
        #
      </button>
      <button
        type="button"
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
        onPointerCancel={handleUp}
        onLostPointerCapture={handleUp}
        data-active={isActive}
        className={`lyre-key-button relative flex aspect-square min-h-[2.8rem] w-full select-none flex-col items-center justify-center rounded-[0.95rem] border [touch-action:manipulation] sm:min-h-[5rem] sm:rounded-[1.35rem] md:min-h-[5.4rem] ${isActive ? 'playing-active' : ''}`}
      >
        <span className="lyre-key-string" aria-hidden="true" />
        <span className="lyre-key-note-wrap">
          <span className="lyre-key-sparkle lyre-key-sparkle-a" aria-hidden="true" />
          <span className="lyre-key-sparkle lyre-key-sparkle-b" aria-hidden="true" />
          <span className="lyre-key-sparkle lyre-key-sparkle-c" aria-hidden="true" />
          <span className="lyre-key-note flex items-start font-sans text-[0.95rem] font-black tracking-normal sm:text-[1.55rem] md:text-[1.75rem]">
            {getSolfege(keyInfo.n)}
            {displayOffset && <sup className="lyre-key-offset ml-0.5 text-[9px] sm:text-[10px]">{displayOffset}</sup>}
          </span>
        </span>
        <span className="lyre-key-label mt-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] sm:mt-1 sm:text-[10px] sm:tracking-[0.24em] md:text-[11px]">{keyInfo.k}</span>
      </button>
    </div>
  );
});

const PianoKeys = memo(({
  accidentals,
  activeKeys,
  keyPulseTokens,
  onKeyActivate,
  onKeyDeactivate,
  onToggleSharp,
  progressBarRef,
}) => {
  const { globalKeyOffset } = useAudioConfig();
  const { onSeekToTime, onScrubToTime } = usePlayback();
  const playbackState = useLivePlaybackFrame();
  const timelineTrackRef = useRef(null);
  const dragPointerIdRef = useRef(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [previewRatio, setPreviewRatio] = useState(null);

  const maxTime = Math.max(Number(playbackState.maxTime) || 0, 0);
  const currentTime = Math.max(Number(playbackState.currentTime) || 0, 0);
  const committedRatio = maxTime > 0 ? clamp(currentTime / maxTime, 0, 1) : 0;
  const displayRatio = previewRatio ?? committedRatio;
  const displayTime = maxTime > 0 ? displayRatio * maxTime : 0;

  useEffect(() => {
    if (!isScrubbing) {
      setPreviewRatio(null);
    }
  }, [isScrubbing, playbackState.generation, playbackState.status]);

  const resolvePointerRatio = useCallback((clientX) => {
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return 0;
    }

    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }, []);

  const commitSeek = useCallback((ratio, scrubOnly = false) => {
    const safeRatio = clamp(ratio, 0, 1);
    const targetSeconds = maxTime > 0 ? safeRatio * maxTime : 0;

    setPreviewRatio(safeRatio);
    if (scrubOnly) {
      onScrubToTime?.(targetSeconds);
      return;
    }

    void onSeekToTime?.(targetSeconds);
  }, [maxTime, onScrubToTime, onSeekToTime]);

  const finishScrub = useCallback((clientX = null) => {
    const ratio = clientX == null ? (previewRatio ?? committedRatio) : resolvePointerRatio(clientX);
    commitSeek(ratio, false);
    dragPointerIdRef.current = null;
    setIsScrubbing(false);
  }, [commitSeek, committedRatio, previewRatio, resolvePointerRatio]);

  const handleTimelinePointerDown = useCallback((event) => {
    if (maxTime <= 0) {
      return;
    }

    event.preventDefault();
    dragPointerIdRef.current = event.pointerId;
    setIsScrubbing(true);
    const ratio = resolvePointerRatio(event.clientX);
    setPreviewRatio(ratio);
    commitSeek(ratio, true);

    if (event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
  }, [commitSeek, maxTime, resolvePointerRatio]);

  const handleTimelinePointerMove = useCallback((event) => {
    if (!isScrubbing || dragPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const ratio = resolvePointerRatio(event.clientX);
    setPreviewRatio(ratio);
    commitSeek(ratio, true);
  }, [commitSeek, isScrubbing, resolvePointerRatio]);

  const handleTimelinePointerUp = useCallback((event) => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    finishScrub(event.clientX);

    if (event.currentTarget.releasePointerCapture && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }
  }, [finishScrub]);

  const handleTimelinePointerCancel = useCallback((event) => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    finishScrub();
  }, [finishScrub]);

  return (
    <main className="relative z-20 mt-6 w-full max-w-6xl px-2 sm:mt-10 sm:px-4">
      <div className="group relative overflow-hidden rounded-[24px] border border-white/70 bg-white/88 p-3 text-slate-900 shadow-[0_35px_120px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:rounded-[36px] sm:p-6 md:rounded-[60px] md:p-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_30%),radial-gradient(circle_at_80%_22%,rgba(45,212,191,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.72))]" />
        <div className="absolute inset-x-0 top-0 px-4 pt-4 sm:px-6 md:px-8">
          <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            <span>{isScrubbing ? '拖曳定位' : '播放進度'}</span>
            <span>{formatTimeLabel(displayTime)} / {formatTimeLabel(maxTime)}</span>
          </div>
          <div
            ref={timelineTrackRef}
            role="slider"
            tabIndex={maxTime > 0 ? 0 : -1}
            aria-label="Seek playback timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(maxTime * 1000)}
            aria-valuenow={Math.round(displayTime * 1000)}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            onPointerCancel={handleTimelinePointerCancel}
            onLostPointerCapture={handleTimelinePointerCancel}
            className={`relative h-4 overflow-hidden rounded-full border border-slate-200 bg-slate-100/90 ${maxTime > 0 ? 'cursor-ew-resize' : 'cursor-default'}`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]" />
            <div
              ref={progressBarRef}
              className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-emerald-300 to-teal-300 will-change-[width]"
              style={{ width: `${displayRatio * 100}%`, transition: isScrubbing ? 'none' : 'width 16ms linear' }}
            />
            <div
              className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 -translate-x-1/2 rounded-full border border-emerald-200/70 bg-emerald-100/90 shadow-[0_0_18px_rgba(52,211,153,0.45)]"
              style={{ left: `${displayRatio * 100}%` }}
            />
          </div>
        </div>
        {NOTES_MAP.map((row, rowIndex) => (
          <div key={rowIndex} className="relative mb-3 grid grid-cols-[2rem_1fr] items-center gap-2 first:pt-14 last:mb-0 sm:mb-8 sm:grid-cols-1 sm:gap-4 sm:first:pt-10 md:mb-10 md:gap-8 md:first:pt-12 lg:grid-cols-[104px_1fr]">
            <div className="flex w-full flex-col items-center justify-center text-center lg:items-end lg:text-right">
              <span className="mb-1 text-[9px] font-black text-indigo-700/80 sm:text-[10px]">{row.label}</span>
              <span className="hidden rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.32em] text-slate-500 backdrop-blur-lg sm:inline-flex">{row.sub}</span>
            </div>
            <div className="grid grid-cols-7 items-center justify-items-center gap-1.5 sm:gap-4 md:gap-5">
              {row.keys.map((key) => (
                <PianoKey
                  key={key.k}
                  keyInfo={key}
                  isSharp={!!accidentals[key.k]}
                  globalOffset={globalKeyOffset}
                  isActive={activeKeys.has(key.k)}
                  pulseToken={keyPulseTokens[key.k] ?? 0}
                  onActivate={onKeyActivate}
                  onDeactivate={onKeyDeactivate}
                  onToggleSharp={onToggleSharp}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
});

export default PianoKeys;
