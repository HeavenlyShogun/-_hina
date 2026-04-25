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
    onActivate(keyInfo.k);
  }, [onActivate, keyInfo.k]);

  const handleUp = useCallback((event) => {
    event.preventDefault();
    onDeactivate(keyInfo.k);
  }, [onDeactivate, keyInfo.k]);

  return (
    <div className="relative group key-wrapper w-full max-w-[5.5rem]">
      <div className="lyre-key-aura" data-active={isActive} />
      {pulseToken > 0 ? <div key={pulseToken} className="lyre-key-ripple" aria-hidden="true" /> : null}
      <button onClick={handleToggle} className={`absolute -top-1 -right-1 md:-top-2 md:-right-2 w-5 h-5 md:w-6 md:h-6 rounded-full text-[8px] md:text-[9px] font-black z-30 transition-all border flex items-center justify-center ${isSharp ? 'bg-amber-400 text-amber-950 border-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.4)] scale-110' : 'bg-white/5 text-white/20 border-white/5 hover:bg-white/10 group-hover:text-white/40'}`}>#</button>
      <button
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
        onPointerCancel={handleUp}
        data-active={isActive}
        className={`lyre-key-button aspect-square w-full rounded-full flex flex-col items-center justify-center relative touch-none border ${isActive ? 'playing-active' : ''}`}
      >
        <span className="lyre-key-string" aria-hidden="true" />
        <span className="lyre-key-note text-lg sm:text-xl md:text-2xl font-black tracking-tighter flex items-start">
          {getSolfege(keyInfo.n)}
          {displayOffset && <sup className="text-[9px] sm:text-[10px] ml-0.5 text-amber-400">{displayOffset}</sup>}
        </span>
        <span className="lyre-key-label text-[10px] md:text-[11px] font-mono font-bold mt-1 uppercase tracking-widest">{keyInfo.k}</span>
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
    <main className="z-20 w-full max-w-6xl mt-10 relative px-4">
      <div className="bg-gradient-to-br from-emerald-950/30 to-black/80 backdrop-blur-3xl border border-white/5 rounded-[40px] md:rounded-[60px] p-6 md:p-14 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
          <div ref={progressBarRef} className="h-full bg-gradient-to-r from-emerald-600 via-emerald-300 to-teal-400 will-change-transform" style={{ width: '0%', transition: 'width 16ms linear' }} />
        </div>
        {NOTES_MAP.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-1 lg:grid-cols-[96px_1fr] items-center gap-4 md:gap-8 mb-8 md:mb-10 last:mb-0">
            <div className="w-full text-center lg:text-right flex flex-col items-center lg:items-end justify-center">
              <span className="text-[10px] text-emerald-400/80 font-black mb-1">{row.label}</span>
              <span className="text-[8px] uppercase tracking-widest opacity-30 font-bold border border-white/10 px-2 py-0.5 rounded-full">{row.sub}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 md:gap-5 items-center justify-items-center">
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
