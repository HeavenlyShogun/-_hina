import React, { memo } from 'react';
import AppHeader from '../components/AppHeader';
import ControlPanel from '../components/ControlPanel';
import InstrumentSelector from '../components/InstrumentSelector';
import PianoKeys from '../components/PianoKeys';

const PianoRoom = memo(({
  playHotkey,
  setPlayHotkey,
  activeKeys,
  accidentals,
  keyPulseTokens,
  onKeyActivate,
  onKeyDeactivate,
  onToggleSharp,
  progressBarRef,
}) => (
  <>
    <AppHeader
      playHotkey={playHotkey}
      setPlayHotkey={setPlayHotkey}
    />
    <PianoKeys
      activeKeys={activeKeys}
      accidentals={accidentals}
      keyPulseTokens={keyPulseTokens}
      onKeyActivate={onKeyActivate}
      onKeyDeactivate={onKeyDeactivate}
      onToggleSharp={onToggleSharp}
      progressBarRef={progressBarRef}
    />
    <InstrumentSelector />
    <ControlPanel />
  </>
));

export default PianoRoom;
