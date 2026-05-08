import React, { memo } from 'react';
import AppHeader from '../components/AppHeader';
import InstrumentSelector from '../components/InstrumentSelector';
import PianoKeys from '../components/PianoKeys';

const PianoRoom = memo(({
  playHotkey,
  setPlayHotkey,
  featuredScores,
  scoreGroups,
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
      scoreGroups={scoreGroups}
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
    <InstrumentSelector />
  </>
));

export default PianoRoom;
