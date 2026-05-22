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
  onKeyActivate,
  onKeyDeactivate,
  onToggleSharp,
  progressBarRef,
  scoreTitle,
  onJumpToSection,
  workspaceSections,
  isBusy,
  busyMessage,
  uiMode = 'normal',
  onPanelPointerDown,
}) => (
  <div id="main-screen" className="flex w-full scroll-mt-6 flex-col items-center">
    <div data-ui-panel="true" onPointerDown={onPanelPointerDown} className="flex w-full justify-center">
      <AppHeader
        playHotkey={playHotkey}
        setPlayHotkey={setPlayHotkey}
        featuredScores={featuredScores}
        scoreGroups={scoreGroups}
        onPlayFeaturedScore={onPlayFeaturedScore}
        scoreTitle={scoreTitle}
        onJumpToSection={onJumpToSection}
        workspaceSections={workspaceSections}
        isBusy={isBusy}
        busyMessage={busyMessage}
      />
    </div>
    <PianoKeys
      activeKeys={activeKeys}
      accidentals={accidentals}
      onKeyActivate={onKeyActivate}
      onKeyDeactivate={onKeyDeactivate}
      onToggleSharp={onToggleSharp}
      progressBarRef={progressBarRef}
      uiMode={uiMode}
      onPanelPointerDown={onPanelPointerDown}
    />
    <div id="rhythm-controls" className="relative z-20 mt-4 flex w-full max-w-6xl scroll-mt-6 flex-col gap-4 px-3 sm:mt-5 sm:px-4">
      <InstrumentSelector disabled={isBusy} />
      <ControlPanel embedded compact uiMode={uiMode} onPanelPointerDown={onPanelPointerDown} />
    </div>
  </div>
));

export default PianoRoom;
