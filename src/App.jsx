import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import ScoreConverter from './components/ScoreConverter';
import ScoreEditor from './components/ScoreEditor';
import ScoreLibrary from './components/ScoreLibrary';
import WindParticles from './components/WindParticles';
import PianoRoom from './pages/PianoRoom';
import { AudioConfigProvider, useAudioConfig } from './contexts/AudioConfigContext';
import { PlaybackProvider } from './contexts/PlaybackContext';
import { FEATURED_SCORES } from './data/featuredScores';
import demoScore from './data/scores/demo.json';
import { useCloudScores } from './hooks/useCloudScores';
import useKeyboardMatcher from './hooks/useKeyboardMatcher';
import { useScorePlayback } from './hooks/useScorePlayback';
import { useScoreState } from './hooks/useScoreState';
import {
  createScoreDocument,
  parseScoreContent,
  SCORE_SOURCE_TYPES,
} from './utils/scoreDocument';
import { applyScoreRecommendation } from './utils/scoreRecommendations';

function getFileTitle(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

async function readImportedScore(file) {
  const raw = await file.text();
  const isJsonFile = file.name.toLowerCase().endsWith('.json');

  if (isJsonFile) {
    return {
      title: getFileTitle(file.name),
      content: JSON.parse(raw),
      sourceType: SCORE_SOURCE_TYPES.JSON,
    };
  }

  return {
    title: getFileTitle(file.name),
    rawText: raw,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
  };
}

function createImportDefaults(scoreDocument, audioConfig) {
  return {
    bpm: scoreDocument?.bpm,
    timeSigNum: scoreDocument?.timeSigNum,
    timeSigDen: scoreDocument?.timeSigDen,
    charResolution: scoreDocument?.charResolution,
    globalKeyOffset: audioConfig?.globalKeyOffset ?? scoreDocument?.globalKeyOffset,
    scaleMode: audioConfig?.scaleMode ?? scoreDocument?.scaleMode,
    reverb: audioConfig?.reverb ?? scoreDocument?.reverb,
    tone: audioConfig?.tone ?? scoreDocument?.tone,
    accidentals: scoreDocument?.accidentals,
  };
}

function AppContent({
  score,
  setScore,
  scoreTitle,
  setScoreTitle,
  scoreDocument,
  bpm,
  setBpm,
  timeSigNum,
  setTimeSigNum,
  timeSigDen,
  setTimeSigDen,
  charResolution,
  setCharResolution,
  accidentals,
  setAccidentals,
  references,
  setReferences,
  referenceNotes,
  setReferenceNotes,
  user,
  savedScores,
  cloudStatus,
  cloudError,
  isSaving,
  ensureCloudConnection,
  saveCloudScore,
  deleteCloudScore,
  clearAllCloudScores,
  uploadCloudScores,
  loadScoreSource,
  applySavedScore,
  resetScoreState,
}) {
  const audioConfig = useAudioConfig();
  const [playHotkey, setPlayHotkey] = useState('Space');
  const [toast, setToast] = useState(null);
  const [activeKeys, setActiveKeys] = useState(() => new Set());
  const [keyPulseTokens, setKeyPulseTokens] = useState({});

  const pageRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  const onKeyVisualAttack = useCallback((key) => {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setKeyPulseTokens((prev) => ({
      ...prev,
      [key]: (prev[key] ?? 0) + 1,
    }));
  }, []);

  const onKeyVisualRelease = useCallback((key) => {
    setActiveKeys((prev) => {
      if (!prev.has(key)) {
        return prev;
      }

      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const onVisualReset = useCallback(() => {
    setActiveKeys(new Set());
  }, []);

  const handlePagePointerMove = useCallback((event) => {
    const page = pageRef.current;
    if (!page || event.pointerType === 'touch') {
      return;
    }

    page.style.setProperty('--cursor-x', `${event.clientX}px`);
    page.style.setProperty('--cursor-y', `${event.clientY}px`);
  }, []);

  const importDefaults = useMemo(
    () => createImportDefaults(scoreDocument, audioConfig),
    [audioConfig, scoreDocument],
  );

  const playbackScore = useMemo(() => {
    try {
      return parseScoreContent(scoreDocument.rawText, scoreDocument.sourceType);
    } catch {
      return scoreDocument.rawText;
    }
  }, [scoreDocument.rawText, scoreDocument.sourceType]);

  const {
    isPlaying,
    isPaused,
    playbackState,
    progressBarRef,
    playScoreAction,
    pauseScoreAction,
    resumeScoreAction,
    seekToTime,
    scrubToTime,
    seekToTick,
    scrubToTick,
    setPlaybackRate,
    stopAll,
    handleKeyActivate,
    handleKeyDeactivate,
  } = useScorePlayback({
    score: playbackScore,
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    legacyTimingMode: scoreDocument.legacyTimingMode,
    textNotation: scoreDocument.textNotation,
    audioConfig,
    accidentals,
    showToast,
    onKeyVisualAttack,
    onKeyVisualRelease,
    onVisualReset,
  });

  // Practice mode: bind keyboard input, live note preview, hit grading, and miss detection.
  useKeyboardMatcher({
    scoreDocument,
    playbackState,
    playHotkey,
    onTogglePlay: playScoreAction,
    onKeyActivate: handleKeyActivate,
    onKeyDeactivate: handleKeyDeactivate,
  });

  const handleToggleSharp = useCallback((key) => {
    setAccidentals((prev) => ({
      ...prev,
      [key]: prev[key] ? 0 : 1,
    }));
  }, [setAccidentals]);

  const handleConnectCloud = useCallback(async () => {
    const result = await ensureCloudConnection();
    if (!result) {
      showToast(cloudError || 'Firebase 連線失敗，請檢查設定。', 'error');
      return;
    }
    if (result) {
      showToast('雲端已連線', 'success');
      return;
    }

    showToast('雲端目前無法使用', 'error');
  }, [cloudError, ensureCloudConnection, showToast]);

  const handleLoadScore = useCallback((savedScore) => {
    applySavedScore(savedScore);
    stopAll();
    showToast(`已載入 ${savedScore.title}`, 'success');
  }, [applySavedScore, showToast, stopAll]);

  const handleSaveScore = useCallback(async () => {
    const title = scoreTitle.trim();
    if (!title) {
      showToast('請先輸入琴譜標題', 'error');
      return;
    }

    const saved = await saveCloudScore(title, scoreDocument);
    if (!saved) {
      showToast(cloudError || 'Firebase 儲存失敗，請檢查設定與 Firestore 規則。', 'error');
      return;
    }
    showToast(saved ? '已儲存到雲端' : '請先連線雲端', saved ? 'success' : 'error');
  }, [cloudError, saveCloudScore, scoreDocument, scoreTitle, showToast]);

  const handleDeleteScore = useCallback(async (id) => {
    const deleted = await deleteCloudScore(id);
    showToast(deleted ? '已刪除琴譜' : '刪除失敗', deleted ? 'success' : 'error');
  }, [deleteCloudScore, showToast]);

  const handleClearAllScores = useCallback(async () => {
    if (!window.confirm('確定要刪除所有雲端琴譜嗎？')) {
      return;
    }

    const cleared = await clearAllCloudScores();
    showToast(cleared ? '琴譜庫已清空' : '清空失敗', cleared ? 'success' : 'error');
  }, [clearAllCloudScores, showToast]);

  const handleImportLocal = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      if (files.length === 1) {
        const source = await readImportedScore(files[0]);
        loadScoreSource(applyScoreRecommendation({
          ...importDefaults,
          ...source,
        }, { force: true }));
        stopAll();
        showToast(`已載入 ${source.title}`, 'success');
      } else {
        const payloads = await Promise.all(
          files.map(async (file) => {
            const source = await readImportedScore(file);
            return {
              title: source.title,
              payload: createScoreDocument(applyScoreRecommendation({
                ...importDefaults,
                ...source,
              }, { force: true })),
            };
          }),
        );

        const uploaded = await uploadCloudScores(payloads);
        showToast(
          uploaded ? `已上傳 ${payloads.length} 份琴譜` : '請先連線雲端',
          uploaded ? 'success' : 'error',
        );
      }
    } catch (error) {
      console.error(error);
      showToast('匯入失敗', 'error');
    } finally {
      event.target.value = '';
    }
  }, [importDefaults, loadScoreSource, showToast, stopAll, uploadCloudScores]);

  const handleExportLocal = useCallback(() => {
    const extension = scoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON ? 'json' : 'txt';
    const filename = `${scoreTitle.trim() || 'score'}.${extension}`;
    const blob = new Blob([scoreDocument.rawText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`已匯出 ${filename}`, 'success');
  }, [scoreDocument.rawText, scoreDocument.sourceType, scoreTitle, showToast]);

  const handleResetScore = useCallback(() => {
    resetScoreState();
    stopAll();
    showToast('琴譜已重設', 'success');
  }, [resetScoreState, showToast, stopAll]);

  const handleLoadJsonDemo = useCallback(() => {
    loadScoreSource({
      title: demoScore.meta?.title ?? 'JSON 範例',
      content: demoScore,
      sourceType: SCORE_SOURCE_TYPES.JSON,
      ...demoScore.transport,
      ...demoScore.playback,
    });
    stopAll();
    showToast('已載入 JSON 範例', 'success');
  }, [loadScoreSource, showToast, stopAll]);

  const handlePlayFeaturedScore = useCallback((featuredScore) => {
    const source = {
      title: featuredScore.title,
      rawText: featuredScore.rawText,
      sourceType: featuredScore.sourceType,
      bpm: featuredScore.bpm,
      timeSigNum: featuredScore.timeSigNum,
      timeSigDen: featuredScore.timeSigDen,
      charResolution: featuredScore.charResolution,
      legacyTimingMode: featuredScore.legacyTimingMode,
      globalKeyOffset: featuredScore.globalKeyOffset,
      scaleMode: featuredScore.scaleMode,
      reverb: featuredScore.reverb,
      tone: featuredScore.tone,
      accidentals: featuredScore.accidentals,
    };

    loadScoreSource(applyScoreRecommendation(source, { force: true }));
    stopAll();
    showToast(`已選擇：${featuredScore.displayTitle ?? featuredScore.title}`, 'success');
  }, [loadScoreSource, showToast, stopAll]);

  const handleLoadLocalConvertedScore = useCallback((payload) => {
    loadScoreSource({
      title: payload?.meta?.title ?? '本機 JSON 琴譜',
      content: payload,
      sourceType: SCORE_SOURCE_TYPES.JSON,
      ...payload?.transport,
      ...payload?.playback,
    });
    stopAll();
  }, [loadScoreSource, stopAll]);

  const editorScore = useMemo(() => {
    if (scoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON) {
      try {
        return parseScoreContent(scoreDocument.rawText, SCORE_SOURCE_TYPES.JSON);
      } catch {
        return score;
      }
    }

    return score;
  }, [score, scoreDocument.rawText, scoreDocument.sourceType]);

  const playbackValue = useMemo(() => ({
    bpm,
    setBpm,
    timeSigNum,
    setTimeSigNum,
    timeSigDen,
    setTimeSigDen,
    charResolution,
    setCharResolution,
    textNotation: scoreDocument.textNotation,
    legacyTimingMode: scoreDocument.legacyTimingMode,
    isPlaying,
    isPaused,
    playbackState,
    onTogglePlay: playScoreAction,
    onPause: pauseScoreAction,
    onResume: resumeScoreAction,
    onSeekToTime: seekToTime,
    onScrubToTime: scrubToTime,
    onSeekToTick: seekToTick,
    onScrubToTick: scrubToTick,
    onSetPlaybackRate: setPlaybackRate,
  }), [
    bpm,
    charResolution,
    isPlaying,
    isPaused,
    scoreDocument.legacyTimingMode,
    scoreDocument.textNotation,
    playbackState,
    pauseScoreAction,
    playScoreAction,
    resumeScoreAction,
    scrubToTick,
    scrubToTime,
    seekToTick,
    seekToTime,
    setBpm,
    setPlaybackRate,
    setCharResolution,
    setTimeSigDen,
    setTimeSigNum,
    timeSigDen,
    timeSigNum,
  ]);

  return (
    <PlaybackProvider value={playbackValue}>
      <div
        ref={pageRef}
        className="app-shell min-h-screen text-slate-900 flex flex-col items-center font-serif relative select-none pb-20 touch-pan-y"
        onPointerMove={handlePagePointerMove}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="app-background pointer-events-none fixed inset-0" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(96,165,250,0.16),transparent_62%)]" />
        <WindParticles />

        {toast ? (
          <div className={`fixed top-6 right-6 z-50 px-6 py-3.5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md border flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100'}`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span className="text-sm font-bold tracking-wider">{toast.message}</span>
          </div>
        ) : null}

        <PianoRoom
          playHotkey={playHotkey}
          setPlayHotkey={setPlayHotkey}
          featuredScores={FEATURED_SCORES}
          onPlayFeaturedScore={handlePlayFeaturedScore}
          activeKeys={activeKeys}
          accidentals={accidentals}
          keyPulseTokens={keyPulseTokens}
          onKeyActivate={handleKeyActivate}
          onKeyDeactivate={handleKeyDeactivate}
          onToggleSharp={handleToggleSharp}
          progressBarRef={progressBarRef}
          score={editorScore}
          scoreTitle={scoreTitle}
        />

        <section className="z-20 w-full max-w-6xl grid lg:grid-cols-[300px_1fr] gap-8 px-4 items-start">
          <ScoreLibrary
            user={user}
            savedScores={savedScores}
            onLoadScore={handleLoadScore}
            onClearAll={handleClearAllScores}
            onDeleteScore={handleDeleteScore}
            onConnectCloud={handleConnectCloud}
            cloudStatus={cloudStatus}
            cloudError={cloudError}
          />
          <div className="flex flex-col">
            <ScoreEditor
              score={editorScore}
              setScore={setScore}
              scoreTitle={scoreTitle}
              setScoreTitle={setScoreTitle}
              references={references}
              setReferences={setReferences}
              referenceNotes={referenceNotes}
              setReferenceNotes={setReferenceNotes}
              onImport={handleImportLocal}
              onLoadJsonDemo={handleLoadJsonDemo}
              onExport={handleExportLocal}
              onSave={handleSaveScore}
              onReset={handleResetScore}
              isSaving={isSaving}
              onConnectCloud={handleConnectCloud}
              cloudStatus={cloudStatus}
            />
            <ScoreConverter
              scoreTitle={scoreTitle}
              scoreDocument={scoreDocument}
              bpm={bpm}
              timeSigNum={timeSigNum}
              timeSigDen={timeSigDen}
              charResolution={charResolution}
              audioConfig={audioConfig}
              accidentals={accidentals}
              references={references}
              referenceNotes={referenceNotes}
              showToast={showToast}
              onLoadLocalScore={handleLoadLocalConvertedScore}
            />
          </div>
        </section>

        <footer className="z-20 mt-16 text-[10px] uppercase tracking-[0.6em] text-slate-400">
          guilty corn(豐川罪孽玉米企業)
        </footer>

        <style>{`
          input[type=range] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 2px; border-radius: 1px; }
          input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: currentColor; cursor: pointer; transition: all 0.2s; border: 2px solid rgba(0,0,0,0.5); }
          .custom-scrollbar::-webkit-scrollbar { width: 5px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.1); border-radius: 10px; }
          .touch-pan-y { touch-action: pan-y; }
          input[type="number"].no-spinners::-webkit-inner-spin-button, input[type="number"].no-spinners::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
          input[type="number"].no-spinners { -moz-appearance: textfield; }
          @keyframes float { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 0.15; } 100% { transform: translateY(-100vh); opacity: 0; } }
        `}</style>
      </div>
    </PlaybackProvider>
  );
}

export default function App() {
  const {
    score,
    setScore,
    scoreTitle,
    setScoreTitle,
    scoreDocument,
    accidentals,
    setAccidentals,
    references,
    setReferences,
    referenceNotes,
    setReferenceNotes,
    bpm,
    setBpm,
    timeSigNum,
    setTimeSigNum,
    timeSigDen,
    setTimeSigDen,
    charResolution,
    setCharResolution,
    updateScoreDocument,
    loadScoreSource,
    applySavedScore,
    resetScoreState,
  } = useScoreState();
  const {
    savedScores,
    user,
    cloudStatus,
    cloudError,
    isSaving,
    ensureCloudConnection,
    saveCloudScore,
    deleteCloudScore,
    clearAllCloudScores,
    uploadCloudScores,
  } = useCloudScores();

  const handleAudioConfigChange = useCallback((patch) => {
    const nextPatch = {};

    if (patch.tone !== undefined) {
      nextPatch.tone = patch.tone;
    }
    if (patch.reverb !== undefined) {
      nextPatch.reverb = patch.reverb;
    }
    if (patch.globalKeyOffset !== undefined) {
      nextPatch.globalKeyOffset = patch.globalKeyOffset;
    }
    if (patch.scaleMode !== undefined) {
      nextPatch.scaleMode = patch.scaleMode;
    }

    if (Object.keys(nextPatch).length > 0) {
      updateScoreDocument((prev) => ({ ...prev, ...nextPatch }));
    }
  }, [updateScoreDocument]);

  const initialAudioConfig = useMemo(() => ({
    tone: scoreDocument.tone,
    reverb: scoreDocument.reverb,
    globalKeyOffset: scoreDocument.globalKeyOffset,
    scaleMode: scoreDocument.scaleMode,
  }), [
    scoreDocument.globalKeyOffset,
    scoreDocument.reverb,
    scoreDocument.scaleMode,
    scoreDocument.tone,
  ]);

  return (
    <AudioConfigProvider
      initialConfig={initialAudioConfig}
      onConfigChange={handleAudioConfigChange}
    >
      <AppContent
        score={score}
        setScore={setScore}
        scoreTitle={scoreTitle}
        setScoreTitle={setScoreTitle}
        scoreDocument={scoreDocument}
        bpm={bpm}
        setBpm={setBpm}
        timeSigNum={timeSigNum}
        setTimeSigNum={setTimeSigNum}
        timeSigDen={timeSigDen}
        setTimeSigDen={setTimeSigDen}
        charResolution={charResolution}
        setCharResolution={setCharResolution}
        accidentals={accidentals}
        setAccidentals={setAccidentals}
        references={references}
        setReferences={setReferences}
        referenceNotes={referenceNotes}
        setReferenceNotes={setReferenceNotes}
        user={user}
        savedScores={savedScores}
        cloudStatus={cloudStatus}
        cloudError={cloudError}
        isSaving={isSaving}
        ensureCloudConnection={ensureCloudConnection}
        saveCloudScore={saveCloudScore}
        deleteCloudScore={deleteCloudScore}
        clearAllCloudScores={clearAllCloudScores}
        uploadCloudScores={uploadCloudScores}
        loadScoreSource={loadScoreSource}
        applySavedScore={applySavedScore}
        resetScoreState={resetScoreState}
      />
    </AudioConfigProvider>
  );
}
