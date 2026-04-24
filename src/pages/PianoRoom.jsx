import React, { memo } from 'react';
import AppHeader from '../components/AppHeader';
import ControlPanel from '../components/ControlPanel';
import PianoKeys from '../components/PianoKeys';

const PianoRoom = memo(({
  playHotkey,
  setPlayHotkey,
  isPlaying,
  onTogglePlay,
  activeKeys,
  accidentals,
  globalKeyOffset,
  keyPulseTokens,
  onKeyActivate,
  onKeyDeactivate,
  onToggleSharp,
  progressBarRef,
  bpm,
  setBpm,
  timeSigNum,
  setTimeSigNum,
  timeSigDen,
  setTimeSigDen,
  charResolution,
  setCharResolution,
  vol,
  setVol,
  tone,
  setTone,
  reverb,
  onToggleReverb,
  setGlobalKeyOffset,
}) => (
  <>
    <AppHeader
      playHotkey={playHotkey}
      setPlayHotkey={setPlayHotkey}
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
    />
    <PianoKeys
      activeKeys={activeKeys}
      accidentals={accidentals}
      globalKeyOffset={globalKeyOffset}
      keyPulseTokens={keyPulseTokens}
      onKeyActivate={onKeyActivate}
      onKeyDeactivate={onKeyDeactivate}
      onToggleSharp={onToggleSharp}
      progressBarRef={progressBarRef}
    />
    <ControlPanel
      bpm={bpm}
      setBpm={setBpm}
      timeSigNum={timeSigNum}
      setTimeSigNum={setTimeSigNum}
      timeSigDen={timeSigDen}
      setTimeSigDen={setTimeSigDen}
      charResolution={charResolution}
      setCharResolution={setCharResolution}
      vol={vol}
      setVol={setVol}
      tone={tone}
      setTone={setTone}
      reverb={reverb}
      onToggleReverb={onToggleReverb}
      globalKeyOffset={globalKeyOffset}
      setGlobalKeyOffset={setGlobalKeyOffset}
    />
  </>
));

export default PianoRoom;
