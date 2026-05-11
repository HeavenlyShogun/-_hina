import React, { memo } from 'react';
import AppHeader from '../components/AppHeader';
import ControlPanel from '../components/ControlPanel';
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
  scoreTitle,
  onJumpToSection,
  workspaceSections,
}) => (
  <>
    <AppHeader
      playHotkey={playHotkey}
      setPlayHotkey={setPlayHotkey}
      featuredScores={featuredScores}
      scoreGroups={scoreGroups}
      onPlayFeaturedScore={onPlayFeaturedScore}
      scoreTitle={scoreTitle}
      onJumpToSection={onJumpToSection}
      workspaceSections={workspaceSections}
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
    <div className="relative z-20 mt-4 flex w-full max-w-6xl flex-col gap-4 px-3 sm:mt-5 sm:px-4">
      <InstrumentSelector />
      <ControlPanel embedded compact />
    </div>
  </>
));

export default PianoRoom;
