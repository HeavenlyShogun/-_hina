import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import ScoreEditor from './components/ScoreEditor';
import ScoreLibrary from './components/ScoreLibrary';
import WindParticles from './components/WindParticles';
import PianoRoom from './pages/PianoRoom';
import { AudioConfigProvider, useAudioConfig } from './contexts/AudioConfigContext';
import { PlaybackProvider } from './contexts/PlaybackContext';
import { mapKey } from './constants/music';
import demoScore from './data/scores/demo.json';
import { useCloudScores } from './hooks/useCloudScores';
import { useScorePlayback } from './hooks/useScorePlayback';
import { useScoreState } from './hooks/useScoreState';
import {
  createScoreDocument,
  parseScoreContent,
  SCORE_SOURCE_TYPES,
} from './utils/scoreDocument';

function isTypingTarget(target) {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

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
  user,
  savedScores,
  cloudStatus,
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

  const toastTimerRef = useRef(null);
  const pressedKeysRef = useRef(new Set());

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
    isPlayingRef,
    playScoreAction,
    pauseScoreAction,
    resumeScoreAction,
    seekToTime,
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
    audioConfig,
    accidentals,
    showToast,
    onKeyVisualAttack,
    onKeyVisualRelease,
    onVisualReset,
  });

  const handleToggleSharp = useCallback((key) => {
    setAccidentals((prev) => ({
      ...prev,
      [key]: prev[key] ? 0 : 1,
    }));
  }, [setAccidentals]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (playHotkey !== 'None' && event.code === playHotkey) {
        event.preventDefault();
        void playScoreAction();
        return;
      }

      if (event.repeat || isPlayingRef.current) {
        return;
      }

      const mappedKey = mapKey(event.key);
      if (!mappedKey || pressedKeysRef.current.has(mappedKey)) {
        return;
      }

      event.preventDefault();
      pressedKeysRef.current.add(mappedKey);
      handleKeyActivate(mappedKey);
    };

    const handleKeyUp = (event) => {
      const mappedKey = mapKey(event.key);
      if (!mappedKey) {
        return;
      }

      pressedKeysRef.current.delete(mappedKey);
      handleKeyDeactivate(mappedKey);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyActivate, handleKeyDeactivate, isPlayingRef, playHotkey, playScoreAction]);

  const handleConnectCloud = useCallback(async () => {
    const result = await ensureCloudConnection();
    if (result) {
      showToast('Cloud connected', 'success');
      return;
    }

    showToast('Cloud unavailable', 'error');
  }, [ensureCloudConnection, showToast]);

  const handleLoadScore = useCallback((savedScore) => {
    applySavedScore(savedScore);
    stopAll();
    showToast(`Loaded ${savedScore.title}`, 'success');
  }, [applySavedScore, showToast, stopAll]);

  const handleSaveScore = useCallback(async () => {
    const title = scoreTitle.trim();
    if (!title) {
      showToast('Score title is required', 'error');
      return;
    }

    const saved = await saveCloudScore(title, scoreDocument);
    showToast(saved ? 'Saved to cloud' : 'Connect cloud first', saved ? 'success' : 'error');
  }, [saveCloudScore, scoreDocument, scoreTitle, showToast]);

  const handleDeleteScore = useCallback(async (id) => {
    const deleted = await deleteCloudScore(id);
    showToast(deleted ? 'Deleted score' : 'Delete failed', deleted ? 'success' : 'error');
  }, [deleteCloudScore, showToast]);

  const handleClearAllScores = useCallback(async () => {
    if (!window.confirm('Delete all cloud scores?')) {
      return;
    }

    const cleared = await clearAllCloudScores();
    showToast(cleared ? 'Cleared library' : 'Clear failed', cleared ? 'success' : 'error');
  }, [clearAllCloudScores, showToast]);

  const handleImportLocal = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      if (files.length === 1) {
        const source = await readImportedScore(files[0]);
        loadScoreSource(source);
        stopAll();
        showToast(`Loaded ${source.title}`, 'success');
      } else {
        const payloads = await Promise.all(
          files.map(async (file) => {
            const source = await readImportedScore(file);
            return {
              title: source.title,
              payload: createScoreDocument(source),
            };
          }),
        );

        const uploaded = await uploadCloudScores(payloads);
        showToast(
          uploaded ? `Uploaded ${payloads.length} scores` : 'Connect cloud first',
          uploaded ? 'success' : 'error',
        );
      }
    } catch (error) {
      console.error(error);
      showToast('Import failed', 'error');
    } finally {
      event.target.value = '';
    }
  }, [loadScoreSource, showToast, stopAll, uploadCloudScores]);

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
    showToast(`Exported ${filename}`, 'success');
  }, [scoreDocument.rawText, scoreDocument.sourceType, scoreTitle, showToast]);

  const handleResetScore = useCallback(() => {
    resetScoreState();
    stopAll();
    showToast('Score reset', 'success');
  }, [resetScoreState, showToast, stopAll]);

  const handleLoadJsonDemo = useCallback(() => {
    loadScoreSource({
      title: demoScore.meta?.title ?? 'JSON Demo',
      content: demoScore,
      sourceType: SCORE_SOURCE_TYPES.JSON,
      ...demoScore.transport,
      ...demoScore.playback,
    });
    stopAll();
    showToast('Loaded JSON demo', 'success');
  }, [loadScoreSource, showToast, stopAll]);

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
    isPlaying,
    isPaused,
    playbackState,
    onTogglePlay: playScoreAction,
    onPause: pauseScoreAction,
    onResume: resumeScoreAction,
    onSeekToTime: seekToTime,
    onSetPlaybackRate: setPlaybackRate,
  }), [
    bpm,
    charResolution,
    isPlaying,
    isPaused,
    playbackState,
    pauseScoreAction,
    playScoreAction,
    resumeScoreAction,
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
        className="min-h-screen bg-[#060a12] text-emerald-50 flex flex-col items-center font-serif relative overflow-hidden select-none pb-20 touch-manipulation"
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />
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
          activeKeys={activeKeys}
          accidentals={accidentals}
          keyPulseTokens={keyPulseTokens}
          onKeyActivate={handleKeyActivate}
          onKeyDeactivate={handleKeyDeactivate}
          onToggleSharp={handleToggleSharp}
          progressBarRef={progressBarRef}
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
          />
          <ScoreEditor
            score={editorScore}
            setScore={setScore}
            scoreTitle={scoreTitle}
            setScoreTitle={setScoreTitle}
            onImport={handleImportLocal}
            onLoadJsonDemo={handleLoadJsonDemo}
            onExport={handleExportLocal}
            onSave={handleSaveScore}
            onReset={handleResetScore}
            isSaving={isSaving}
            onConnectCloud={handleConnectCloud}
            cloudStatus={cloudStatus}
          />
        </section>

        <footer className="z-20 mt-16 opacity-20 text-[10px] tracking-[0.6em] uppercase">
          Aria Engine Teyvat Symphony Studio
        </footer>

        <style>{`
          input[type=range] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 2px; border-radius: 1px; }
          input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: currentColor; cursor: pointer; transition: all 0.2s; border: 2px solid rgba(0,0,0,0.5); }
          .custom-scrollbar::-webkit-scrollbar { width: 5px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.1); border-radius: 10px; }
          .touch-manipulation { touch-action: manipulation; }
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
        user={user}
        savedScores={savedScores}
        cloudStatus={cloudStatus}
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
