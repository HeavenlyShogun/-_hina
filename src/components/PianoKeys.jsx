import React, { memo, useCallback } from 'react';
import { NOTES_MAP, getSolfege } from '../constants/music';
import { useAudioConfig } from '../contexts/AudioConfigContext';

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
    event.preventDefault();
    if (event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
    onActivate(keyInfo.k);
  }, [onActivate, keyInfo.k]);

  const handleUp = useCallback((event) => {
    event.preventDefault();
    if (event.currentTarget.releasePointerCapture && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }
    onDeactivate(keyInfo.k);
  }, [onDeactivate, keyInfo.k]);

  return (
    <div className="key-wrapper group relative w-full max-w-[6.5rem] sm:max-w-[5.9rem] md:max-w-[5.5rem]">
      <div className="lyre-key-aura" data-active={isActive} />
      {pulseToken > 0 ? <div key={pulseToken} className="lyre-key-ripple" aria-hidden="true" /> : null}
      <button
        type="button"
        onClick={handleToggle}
        className={`absolute -right-1 -top-1 z-30 flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-black transition-all backdrop-blur-lg md:-right-2 md:-top-2 md:h-7 md:w-7 ${isSharp ? 'scale-110 border-amber-200 bg-amber-400 text-amber-950 shadow-[0_0_14px_rgba(251,191,36,0.42)]' : 'border-white/10 bg-black/55 text-white/30 hover:bg-white/10 group-hover:text-white/50'}`}
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
        className={`lyre-key-button relative flex aspect-square min-h-[5.4rem] w-full touch-none select-none flex-col items-center justify-center rounded-full border ${isActive ? 'playing-active' : ''}`}
      >
        <span className="lyre-key-string" aria-hidden="true" />
        <span className="lyre-key-note-wrap">
          <span className="lyre-key-sparkle lyre-key-sparkle-a" aria-hidden="true" />
          <span className="lyre-key-sparkle lyre-key-sparkle-b" aria-hidden="true" />
          <span className="lyre-key-sparkle lyre-key-sparkle-c" aria-hidden="true" />
          <span className="lyre-key-note flex items-start text-[1.35rem] font-black tracking-tighter sm:text-xl md:text-2xl">
            {getSolfege(keyInfo.n)}
            {displayOffset && <sup className="lyre-key-offset ml-0.5 text-[9px] sm:text-[10px]">{displayOffset}</sup>}
          </span>
        </span>
        <span className="lyre-key-label mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] md:text-[11px]">{keyInfo.k}</span>
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

  return (
    <main className="relative z-20 mt-8 w-full max-w-6xl px-4 sm:mt-10">
      <div className="group relative overflow-hidden rounded-[36px] border border-white/10 bg-black/60 p-5 shadow-[0_35px_120px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-6 md:rounded-[60px] md:p-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_30%),radial-gradient(circle_at_80%_22%,rgba(45,212,191,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]" />
        <div className="absolute left-0 top-0 h-1 w-full overflow-hidden bg-white/5">
          <div ref={progressBarRef} className="h-full bg-gradient-to-r from-emerald-600 via-emerald-300 to-teal-400 will-change-transform" style={{ width: '0%', transition: 'width 16ms linear' }} />
        </div>
        {NOTES_MAP.map((row, rowIndex) => (
          <div key={rowIndex} className="relative mb-7 grid grid-cols-1 items-center gap-4 last:mb-0 sm:mb-8 md:mb-10 md:gap-8 lg:grid-cols-[104px_1fr]">
            <div className="flex w-full flex-col items-center justify-center text-center lg:items-end lg:text-right">
              <span className="mb-1 text-[10px] font-black text-emerald-400/80">{row.label}</span>
              <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.32em] text-white/35 backdrop-blur-lg">{row.sub}</span>
            </div>
            <div className="grid grid-cols-3 items-center justify-items-center gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-7 md:gap-5">
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
