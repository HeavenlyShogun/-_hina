import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import demoJsonScore from './data/scores/demo.json';
import ScoreEditor from './components/ScoreEditor';
import PianoRoom from './pages/PianoRoom';
import WindParticles from './components/WindParticles';
import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from './constants/music';
import { useCloudScores } from './hooks/useCloudScores';
import { useKeyboardHandler } from './hooks/useKeyboardHandler';
import { useScoreState } from './hooks/useScoreState';
import audioEngine from './services/audioEngine';
import playbackController from './services/playbackController';
import { SCORE_COMPILER_VERSION, normalizeLoadedScore } from './services/firebase';
import { normalizeScoreSource } from './utils/score';

const ScoreLibrary = lazy(() => import('./components/ScoreLibrary'));
const META_PREFIX = '// [META] ';

function PanelFallback({ heightClass }) {
  return (
    <div className={`bg-white/[0.02] border border-white/5 rounded-[40px] ${heightClass} p-6 md:p-8 shadow-2xl animate-pulse`}>
      <div className="h-5 w-32 rounded bg-white/10 mb-6" />
      <div className="space-y-3">
        <div className="h-12 rounded-2xl bg-white/5" />
        <div className="h-12 rounded-2xl bg-white/5" />
        <div className="h-40 rounded-3xl bg-white/5" />
      </div>
    </div>
  );
}

function parseImportedScore(file, content, fallbackTitle, defaultParams) {
  if (file.name.toLowerCase().endsWith('.json')) {
    const parsedJson = JSON.parse(content);

    return {
      title: parsedJson?.meta?.title || fallbackTitle,
      payload: {
        content: parsedJson,
        ...defaultParams,
      },
    };
  }

  const [firstLine, ...restLines] = content.split('\n');
  let parsedParams = {};
  let finalContent = content;

  if (firstLine.startsWith(META_PREFIX)) {
    try {
      parsedParams = JSON.parse(firstLine.slice(META_PREFIX.length));
      finalContent = restLines.join('\n').replace(/^\n/, '');
    } catch {
      finalContent = content;
    }
  }

  return {
    title: fallbackTitle,
    payload: {
      content: finalContent,
      ...defaultParams,
      ...parsedParams,
    },
  };
}

function transposeFrequency(baseFrequency, semitoneOffset) {
  return baseFrequency * 2 ** (semitoneOffset / 12);
}

function areSetsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function buildPlaybackPayload(score, params) {
  const normalized = normalizeScoreSource(score, params);

  return {
    compilerVersion: SCORE_COMPILER_VERSION,
    toneConfig: {
      tone: params.tone ?? DEFAULT_SCORE_PARAMS.tone,
    },
    compiledEvents: normalized.events.map((event) => ({
      key: event.k,
      note: KEY_INFO_MAP[event.k]?.n || event.k,
      frequency: KEY_INFO_MAP[event.k]
        ? transposeFrequency(
          KEY_INFO_MAP[event.k].f,
          Number(params.globalKeyOffset) + (params.accidentals?.[event.k] ? 1 : 0),
        )
        : undefined,
      time: Number(event.time.toFixed(6)),
      duration: Number((event.durationSec ?? 0.1).toFixed(6)),
      velocity: Number((event.v ?? 0.85).toFixed(4)),
      trackId: event.trackId || 'main',
      toneConfig: {
        tone: params.tone ?? DEFAULT_SCORE_PARAMS.tone,
        velocity: event.v ?? 0.85,
      },
    })),
  };
}

export default function App() {
  const {
    score,
    setScore,
    scoreTitle,
    setScoreTitle,
    vol,
    setVol,
    reverb,
    setReverb,
    globalKeyOffset,
    setGlobalKeyOffset,
    accidentals,
    setAccidentals,
    tone,
    setTone,
    bpm,
    setBpm,
    timeSigNum,
    setTimeSigNum,
    timeSigDen,
    setTimeSigDen,
    charResolution,
    setCharResolution,
    currentScoreParams,
    loadScoreSource,
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

  const [playHotkey, setPlayHotkey] = useState('Space');
  const [pressedKeys, setPressedKeys] = useState(() => new Set());
  const [playbackActiveKeys, setPlaybackActiveKeys] = useState(() => new Set());
  const [keyPulseTokens, setKeyPulseTokens] = useState({});
  const [toast, setToast] = useState(null);
  const [playbackState, setPlaybackState] = useState(() => playbackController.getSnapshot());

  const toastTimerRef = useRef(null);
  const progressBarRef = useRef(null);
  const didWakeAudioRef = useRef(false);
  const playbackEventsRef = useRef([]);
  const previousPlaybackKeysRef = useRef(new Set());

  const showToast = useCallback((msg, type = 'info') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast({ msg, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const bumpKeyPulse = useCallback((keyK) => {
    setKeyPulseTokens((prev) => ({
      ...prev,
      [keyK]: (prev[keyK] ?? 0) + 1,
    }));
  }, []);

  const markPressedKey = useCallback((keyK) => {
    setPressedKeys((prev) => {
      if (prev.has(keyK)) {
        return prev;
      }

      const next = new Set(prev);
      next.add(keyK);
      return next;
    });
    bumpKeyPulse(keyK);
  }, [bumpKeyPulse]);

  const releasePressedKey = useCallback((keyK) => {
    setPressedKeys((prev) => {
      if (!prev.has(keyK)) {
        return prev;
      }

      const next = new Set(prev);
      next.delete(keyK);
      return next;
    });
  }, []);

  const clearPlaybackVisuals = useCallback(() => {
    previousPlaybackKeysRef.current = new Set();
    setPlaybackActiveKeys((prev) => (prev.size ? new Set() : prev));
  }, []);

  const ensureAudioReady = useCallback(async () => {
    if (didWakeAudioRef.current) {
      return audioEngine.init();
    }

    didWakeAudioRef.current = true;
    return audioEngine.resume();
  }, []);

  const stopPlayback = useCallback(() => {
    playbackController.stop();
    audioEngine.stopAll();
    playbackEventsRef.current = [];
    clearPlaybackVisuals();
  }, [clearPlaybackVisuals]);

  useEffect(() => {
    audioEngine.setVolume(vol);
    audioEngine.setReverbEnabled(reverb);
    audioEngine.setTone(tone);
  }, [reverb, tone, vol]);

  useEffect(() => {
    const unsubscribe = playbackController.subscribe(setPlaybackState);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${(playbackState.progress || 0) * 100}%`;
    }
  }, [playbackState.progress]);

  useEffect(() => {
    if (!playbackState.isPlaying) {
      clearPlaybackVisuals();
      return;
    }

    const activeKeys = new Set();
    const currentTime = playbackState.currentTime;

    playbackEventsRef.current.forEach((event) => {
      const eventKey = event.key;
      const releaseTime = event.time + Math.max(Math.min(event.duration ?? 0.2, 0.2), 0.08);

      if (eventKey && event.time <= currentTime && releaseTime > currentTime) {
        activeKeys.add(eventKey);
      }
    });

    const previousKeys = previousPlaybackKeysRef.current;
    activeKeys.forEach((keyK) => {
      if (!previousKeys.has(keyK)) {
        bumpKeyPulse(keyK);
      }
    });

    previousPlaybackKeysRef.current = activeKeys;
    setPlaybackActiveKeys((prev) => (areSetsEqual(prev, activeKeys) ? prev : activeKeys));
  }, [bumpKeyPulse, clearPlaybackVisuals, playbackState.currentTime, playbackState.isPlaying]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    playbackController.stop();
    audioEngine.stopAll();
  }, []);

  const getNotePlayback = useCallback((keyK) => {
    const keyInfo = KEY_INFO_MAP[keyK];
    if (!keyInfo) {
      return null;
    }

    const semitoneOffset = Number(globalKeyOffset) + (accidentals[keyK] ? 1 : 0);

    return {
      frequency: transposeFrequency(keyInfo.f, semitoneOffset),
      duration: tone === 'flute' ? 0.55 : 0.35,
      toneConfig: {
        tone,
        velocity: 0.9,
      },
    };
  }, [accidentals, globalKeyOffset, tone]);

  const handleLiveKeyActivate = useCallback((keyK) => {
    markPressedKey(keyK);
    const notePlayback = getNotePlayback(keyK);

    if (!notePlayback?.frequency) {
      return;
    }

    void ensureAudioReady().then(() => {
      audioEngine.scheduleNote(
        notePlayback.frequency,
        audioEngine.getCurrentTime() + 0.01,
        notePlayback.duration ?? 0.35,
        notePlayback.toneConfig ?? {},
      );
    });
  }, [ensureAudioReady, getNotePlayback, markPressedKey]);

  const handleTogglePlay = useCallback(async () => {
    if (playbackState.isPlaying) {
      stopPlayback();
      return;
    }

    try {
      await ensureAudioReady();
      const playableScore = buildPlaybackPayload(score, currentScoreParams);

      if (!playableScore.compiledEvents.length) {
        showToast('沒有可播放的音符。', 'error');
        return;
      }

      playbackEventsRef.current = playableScore.compiledEvents;
      await playbackController.play(playableScore);
    } catch (error) {
      console.error(error);
      stopPlayback();
      showToast('播放失敗，請檢查樂譜格式。', 'error');
    }
  }, [currentScoreParams, ensureAudioReady, playbackState.isPlaying, score, showToast, stopPlayback]);

  useKeyboardHandler({
    playHotkey,
    isPlaying: playbackState.isPlaying,
    onTogglePlay: handleTogglePlay,
    onKeyDown: markPressedKey,
    onKeyUp: releasePressedKey,
    getNotePlayback,
  });

  const activeKeys = useMemo(() => {
    const merged = new Set(pressedKeys);
    playbackActiveKeys.forEach((keyK) => merged.add(keyK));
    return merged;
  }, [playbackActiveKeys, pressedKeys]);

  const loadScore = useCallback((source) => {
    const versionMatched = source?.compilerVersion === SCORE_COMPILER_VERSION;
    const normalized = normalizeLoadedScore(source);

    loadScoreSource(normalized);
    stopPlayback();
    showToast(
      versionMatched
        ? `已載入 ${normalized.title || '樂譜'}`
        : `已重新編譯並載入 ${normalized.title || '樂譜'}`,
      'success',
    );
  }, [loadScoreSource, showToast, stopPlayback]);

  const parseImportFile = useCallback(async (file) => {
    const content = await file.text();
    const title = file.name.replace(/\.[^/.]+$/, '');
    return parseImportedScore(file, content, title, currentScoreParams);
  }, [currentScoreParams]);

  const handleImportLocal = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      const parsedFiles = await Promise.all(files.map(parseImportFile));

      if (parsedFiles.length === 1) {
        loadScore({ title: parsedFiles[0].title, ...parsedFiles[0].payload });
        return;
      }

      const uploaded = await uploadCloudScores(parsedFiles);
      showToast(uploaded ? `已上傳 ${parsedFiles.length} 份樂譜。` : '雲端上傳失敗。', uploaded ? 'success' : 'error');
    } catch (error) {
      console.error(error);
      showToast('匯入失敗，請檢查檔案格式。', 'error');
    } finally {
      event.target.value = '';
    }
  }, [loadScore, parseImportFile, showToast, uploadCloudScores]);

  const handleSaveScore = useCallback(async () => {
    const trimmedTitle = scoreTitle.trim();
    if (!trimmedTitle) {
      showToast('請先輸入樂譜名稱。', 'error');
      return;
    }

    try {
      await ensureAudioReady();
      const saved = await saveCloudScore(trimmedTitle, {
        content: score,
        ...currentScoreParams,
      });
      showToast(saved ? '已同步到雲端。' : '雲端同步失敗。', saved ? 'success' : 'error');
    } catch (error) {
      console.error(error);
      showToast('儲存失敗。', 'error');
    }
  }, [currentScoreParams, ensureAudioReady, saveCloudScore, score, scoreTitle, showToast]);

  const handleDeleteScore = useCallback(async (id) => {
    if (!window.confirm('要刪除這份雲端樂譜嗎？')) {
      return;
    }

    try {
      const deleted = await deleteCloudScore(id);
      showToast(deleted ? '已刪除樂譜。' : '刪除失敗。', deleted ? 'success' : 'error');
    } catch (error) {
      console.error(error);
      showToast('刪除失敗。', 'error');
    }
  }, [deleteCloudScore, showToast]);

  const handleClearAllScores = useCallback(async () => {
    if (!window.confirm('要清空所有雲端樂譜嗎？此操作無法復原。')) {
      return;
    }

    try {
      const cleared = await clearAllCloudScores();
      showToast(cleared ? '雲端樂譜已清空。' : '清空失敗。', cleared ? 'success' : 'error');
    } catch (error) {
      console.error(error);
      showToast('清空失敗。', 'error');
    }
  }, [clearAllCloudScores, showToast]);

  const handleExportLocal = useCallback(() => {
    if (typeof score === 'string' && !score.trim()) {
      showToast('目前沒有可匯出的內容。', 'error');
      return;
    }

    const isJsonScore = typeof score === 'object' && score !== null;
    const exportContent = isJsonScore
      ? JSON.stringify(score, null, 2)
      : `${META_PREFIX}${JSON.stringify(currentScoreParams)}\n${score}`;
    const blob = new Blob(
      [exportContent],
      { type: isJsonScore ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${scoreTitle.trim() || 'score'}.${isJsonScore ? 'json' : 'txt'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('已匯出到本機。', 'success');
  }, [currentScoreParams, score, scoreTitle, showToast]);

  const handleLoadJsonDemo = useCallback(() => {
    loadScore({
      title: demoJsonScore.meta?.title || 'Demo',
      content: demoJsonScore,
    });
  }, [loadScore]);

  const handleResetScore = useCallback(() => {
    resetScoreState();
    stopPlayback();
    showToast('已重設編輯器。', 'success');
  }, [resetScoreState, showToast, stopPlayback]);

  const handleToggleSharp = useCallback((keyK) => {
    setAccidentals((prev) => ({ ...prev, [keyK]: prev[keyK] ? 0 : 1 }));
  }, [setAccidentals]);

  const handleToggleReverb = useCallback(() => {
    setReverb((value) => !value);
  }, [setReverb]);

  return (
    <div
      className="min-h-screen bg-[#060a12] text-emerald-50 flex flex-col items-center font-serif relative overflow-hidden select-none pb-20 touch-manipulation"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={() => {
        void ensureAudioReady();
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />
      <WindParticles />

      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-3.5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md border flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100'}`}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span className="text-sm font-bold tracking-wider">{toast.msg}</span>
        </div>
      )}

      <PianoRoom
        playHotkey={playHotkey}
        setPlayHotkey={setPlayHotkey}
        isPlaying={playbackState.isPlaying}
        onTogglePlay={handleTogglePlay}
        activeKeys={activeKeys}
        accidentals={accidentals}
        globalKeyOffset={globalKeyOffset}
        keyPulseTokens={keyPulseTokens}
        onKeyActivate={handleLiveKeyActivate}
        onKeyDeactivate={releasePressedKey}
        onToggleSharp={handleToggleSharp}
        progressBarRef={progressBarRef}
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
        onToggleReverb={handleToggleReverb}
        setGlobalKeyOffset={setGlobalKeyOffset}
      />

      <section className="z-20 w-full max-w-6xl grid lg:grid-cols-[300px_1fr] gap-8 px-4 items-start">
        <Suspense fallback={<PanelFallback heightClass="min-h-[320px]" />}>
          <ScoreLibrary
            user={user}
            savedScores={savedScores}
            onLoadScore={loadScore}
            onClearAll={handleClearAllScores}
            onDeleteScore={handleDeleteScore}
            onConnectCloud={ensureCloudConnection}
            cloudStatus={cloudStatus}
          />
        </Suspense>
        <Suspense fallback={<PanelFallback heightClass="min-h-[520px]" />}>
          <ScoreEditor
            score={score}
            setScore={setScore}
            scoreTitle={scoreTitle}
            setScoreTitle={setScoreTitle}
            onImport={handleImportLocal}
            onLoadJsonDemo={handleLoadJsonDemo}
            onExport={handleExportLocal}
            onSave={handleSaveScore}
            onReset={handleResetScore}
            isSaving={isSaving}
            onConnectCloud={ensureCloudConnection}
            cloudStatus={cloudStatus}
          />
        </Suspense>
      </section>

      <footer className="z-20 mt-16 opacity-20 text-[10px] tracking-[0.6em] uppercase">Aria Engine x Teyvat Symphony Studio</footer>

      <style>{`
        input[type=range] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 2px; border-radius: 1px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: currentColor; cursor: pointer; transition: all 0.2s; border: 2px solid rgba(0,0,0,0.5); }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.1); border-radius: 10px; }
        .touch-manipulation { touch-action: manipulation; }
        input[type="number"].no-spinners::-webkit-inner-spin-button, input[type="number"].no-spinners::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"].no-spinners { -moz-appearance: textfield; }
        @keyframes float { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 0.15; } 100% { transform: translateY(-100vh); opacity: 0; } }
        .will-change-transform { will-change: transform; }
      `}</style>
    </div>
  );
}
