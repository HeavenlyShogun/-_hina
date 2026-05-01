import React, { memo } from 'react';
import AppHeader from '../components/AppHeader';
import ControlPanel from '../components/ControlPanel';
import InstrumentSelector from '../components/InstrumentSelector';
import PianoKeys from '../components/PianoKeys';
import PerformanceWorkspace from '../components/PerformanceWorkspace';

const PianoRoom = memo(({
  playHotkey,
  setPlayHotkey,
  featuredScores,
  onPlayFeaturedScore,
  activeKeys,
  accidentals,
  keyPulseTokens,
  onKeyActivate,
  onKeyDeactivate,
  onToggleSharp,
  progressBarRef,
  score,
  scoreTitle,
}) => (
  <>
    <AppHeader
      playHotkey={playHotkey}
      setPlayHotkey={setPlayHotkey}
      featuredScores={featuredScores}
      onPlayFeaturedScore={onPlayFeaturedScore}
      scoreTitle={scoreTitle}
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
    <PerformanceWorkspace
      score={score}
      scoreTitle={scoreTitle}
    />
    <InstrumentSelector />
    <ControlPanel />
  </>
));

export default PianoRoom;
