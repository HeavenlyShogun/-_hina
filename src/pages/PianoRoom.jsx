import React, { memo } from 'react';
import AppHeader from '../components/AppHeader';
import ControlPanel from '../components/ControlPanel';
import InstrumentSelector from '../components/InstrumentSelector';
import PianoKeys from '../components/PianoKeys';
import DynamicTransport from '../components/DynamicTransport';

const PianoRoom = memo(({
  playHotkey,
  setPlayHotkey,
  featuredScores,
  scoreGroups,
  isScoreLibraryLoading,
  scoreLibraryError,
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
  isPlaybackActive = false,
  onDownloadTrack01,
  isRenderingTrack = false,
  uiMode = 'normal',
  onPanelPointerDown,
  onSelectQueueItem,
  queue = [],
  currentQueueIndex = -1,
}) => (
  <div id="main-screen" className="flex w-full scroll-mt-6 flex-col items-center">
    <div data-ui-panel="true" onPointerDown={onPanelPointerDown} className="flex w-full justify-center">
      <AppHeader
        playHotkey={playHotkey}
        setPlayHotkey={setPlayHotkey}
        featuredScores={featuredScores}
        scoreGroups={scoreGroups}
        isScoreLibraryLoading={isScoreLibraryLoading}
        scoreLibraryError={scoreLibraryError}
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
      <DynamicTransport title={scoreTitle} queue={queue} currentIndex={currentQueueIndex} onSelectQueueItem={onSelectQueueItem} bpm={90} />
      <InstrumentSelector disabled={isBusy || isPlaybackActive} />
      <ControlPanel embedded compact uiMode={uiMode} onPanelPointerDown={onPanelPointerDown} />
      <button type="button" onClick={onDownloadTrack01} disabled={isRenderingTrack} className="self-center rounded-2xl border border-cyan-200/35 bg-cyan-500/15 px-5 py-3 text-xs font-black tracking-[0.16em] text-cyan-50 transition hover:bg-cyan-400/25 disabled:cursor-wait disabled:opacity-60">
        {isRenderingTrack ? 'Rendering TRACK01…' : 'Download TRACK01.WAV'}
      </button>
    </div>
  </div>
));

export default PianoRoom;
