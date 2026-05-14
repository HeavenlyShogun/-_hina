import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import ScoreConverter from './components/ScoreConverter';
import ScoreEditor from './components/ScoreEditor';
import ScoreLibrary from './components/ScoreLibrary';
import WindParticles from './components/WindParticles';
import PerformanceWorkspace from './components/PerformanceWorkspace';
import PianoRoom from './pages/PianoRoom';
import { AudioConfigProvider, useAudioConfig } from './contexts/AudioConfigContext';
import { PlaybackProvider } from './contexts/PlaybackContext';
import { IMPORTABLE_SCORE_FILES, IMPORTABLE_SCORE_GROUPS } from './data/importableScoreFiles';
import { useCloudScores } from './hooks/useCloudScores';
import useKeyboardMatcher from './hooks/useKeyboardMatcher';
import { useScorePlayback } from './hooks/useScorePlayback';
import { useScoreState } from './hooks/useScoreState';
import { APP_NAME, APP_TAGLINE } from './config/branding';
import {
  createScoreDocument,
  createScoreTextMeta,
  parseScoreContent,
  SCORE_SOURCE_TYPES,
} from './utils/scoreDocument';
import { applyScoreRecommendation } from './utils/scoreRecommendations';
import { buildScoreTextWithMeta } from './utils/scoreTextMeta';
import StarrySky from './components/StarrySky';

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
  loadCloudScore,
  loadScoreSource,
  applySavedScore,
  resetScoreState,
}) {
  const audioConfig = useAudioConfig();
  const [playHotkey, setPlayHotkey] = useState('Space');
  const [toast, setToast] = useState(null);
  const [activeKeys, setActiveKeys] = useState(() => new Set());
  const [keyPulseTokens, setKeyPulseTokens] = useState({});
  const [noteTrail, setNoteTrail] = useState([]);
  const pageRef = useRef(null);
  const toastTimerRef = useRef(null);
  const pulseThrottleRef = useRef({});
  const visualEventQueueRef = useRef([]);
  const visualFlushFrameRef = useRef(0);

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
    if (visualFlushFrameRef.current) {
      window.cancelAnimationFrame(visualFlushFrameRef.current);
    }
  }, []);

  const flushVisualEvents = useCallback(() => {
    visualFlushFrameRef.current = 0;
    const queuedEvents = visualEventQueueRef.current;
    visualEventQueueRef.current = [];

    if (!queuedEvents.length) {
      return;
    }

    const now = performance.now();
    const nextActiveKeys = new Set();
    const releasedKeys = new Set();
    const pulseIncrements = {};
    const trailEntries = [];

    queuedEvents.forEach((entry) => {
      if (entry.type === 'release') {
        releasedKeys.add(entry.key);
        nextActiveKeys.delete(entry.key);
        return;
      }

      releasedKeys.delete(entry.key);
      nextActiveKeys.add(entry.key);

      if (!entry.eventMeta?.resumed) {
        const lastPulseAt = pulseThrottleRef.current[entry.key] ?? 0;
        if (now - lastPulseAt > 96) {
          pulseThrottleRef.current[entry.key] = now;
          pulseIncrements[entry.key] = (pulseIncrements[entry.key] ?? 0) + 1;
        }
      }

      trailEntries.push({
        id: `${entry.key}-${Math.round(now)}-${trailEntries.length}`,
        key: entry.key,
        time: now,
        source: entry.eventMeta?.source ?? 'playback',
      });
    });

    if (nextActiveKeys.size || releasedKeys.size) {
      setActiveKeys((prev) => {
        const next = new Set(prev);
        releasedKeys.forEach((key) => next.delete(key));
        nextActiveKeys.forEach((key) => next.add(key));
        return next;
      });
    }

    if (Object.keys(pulseIncrements).length) {
      setKeyPulseTokens((prev) => {
        const next = { ...prev };
        Object.entries(pulseIncrements).forEach(([key, increment]) => {
          next[key] = (next[key] ?? 0) + increment;
        });
        return next;
      });
    }

    if (trailEntries.length) {
      setNoteTrail((prev) => [...prev, ...trailEntries].slice(-48));
    }
  }, []);

  const queueVisualEvent = useCallback((entry) => {
    visualEventQueueRef.current.push(entry);
    if (!visualFlushFrameRef.current) {
      visualFlushFrameRef.current = window.requestAnimationFrame(flushVisualEvents);
    }
  }, [flushVisualEvents]);

  const onKeyVisualAttack = useCallback((key, eventMeta = {}) => {
    queueVisualEvent({ type: 'attack', key, eventMeta });
  }, [queueVisualEvent]);

  const onKeyVisualRelease = useCallback((key) => {
    queueVisualEvent({ type: 'release', key });
  }, [queueVisualEvent]);

  const onVisualReset = useCallback(() => {
    visualEventQueueRef.current = [];
    if (visualFlushFrameRef.current) {
      window.cancelAnimationFrame(visualFlushFrameRef.current);
      visualFlushFrameRef.current = 0;
    }
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

  const scrollToSection = useCallback((sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  const selectableScores = useMemo(() => IMPORTABLE_SCORE_FILES, []);
  const selectableScoreGroups = useMemo(() => IMPORTABLE_SCORE_GROUPS, []);

  const workspaceSections = useMemo(() => ([
    { id: 'playback-preview', label: '演奏預覽', caption: 'Live Preview' },
    { id: 'editor', label: '譜面編輯', caption: 'Score Editor' },
    { id: 'cloud-library', label: '雲端曲庫', caption: 'Firebase / Cloud' },
    { id: 'converter', label: '譜面轉換', caption: 'Converter' },
  ]), []);

  const playbackScore = useMemo(() => {
    if (
      scoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON
      && scoreDocument.content
      && typeof scoreDocument.content === 'object'
    ) {
      return scoreDocument.content;
    }

    try {
      return parseScoreContent(scoreDocument.rawText, scoreDocument.sourceType);
    } catch {
      return scoreDocument.rawText;
    }
  }, [scoreDocument.content, scoreDocument.rawText, scoreDocument.sourceType]);

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
      showToast(cloudError || 'Firebase 連線失敗', 'error');
      return;
    }
    showToast('已連接 Firebase', 'success');
  }, [cloudError, ensureCloudConnection, showToast]);

  const handleLoadScore = useCallback(async (savedScore) => {
    const fullScore = savedScore?.rawText ? savedScore : await loadCloudScore(savedScore.id);

    if (!fullScore) {
      showToast('雲端譜面讀取失敗', 'error');
      return;
    }

    applySavedScore(fullScore);
    stopAll();
    showToast(`已載入 ${fullScore.title}`, 'success');
  }, [applySavedScore, loadCloudScore, showToast, stopAll]);

  const handleSaveScore = useCallback(async () => {
    const title = scoreTitle.trim();

    if (!title) {
      showToast('請先輸入譜面名稱', 'error');
      return;
    }

    const saved = await saveCloudScore(title, scoreDocument);
    if (!saved) {
      showToast(cloudError || 'Firebase 儲存失敗', 'error');
      return;
    }

    showToast('已儲存到雲端曲庫', 'success');
  }, [cloudError, saveCloudScore, scoreDocument, scoreTitle, showToast]);

  const handleDeleteScore = useCallback(async (id) => {
    const deleted = await deleteCloudScore(id);
    showToast(deleted ? '已刪除雲端譜面' : '刪除失敗', deleted ? 'success' : 'error');
  }, [deleteCloudScore, showToast]);

  const handleClearAllScores = useCallback(async () => {
    if (!window.confirm('確定要刪除所有雲端譜面嗎？')) {
      return;
    }

    const cleared = await clearAllCloudScores();
    showToast(cleared ? '已清空雲端曲庫' : '清空失敗', cleared ? 'success' : 'error');
  }, [clearAllCloudScores, showToast]);

  const handleImportLocal = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      if (files.length === 1) {
        const source = await readImportedScore(files[0]);
        loadScoreSource(
          source.sourceType === SCORE_SOURCE_TYPES.JSON
            ? applyScoreRecommendation(source)
            : source,
        );
        stopAll();
        showToast(`已匯入 ${source.title}`, 'success');
      } else {
        const payloads = await Promise.all(
          files.map(async (file) => {
            const source = await readImportedScore(file);
            return {
              title: source.title,
              payload: createScoreDocument(
                source.sourceType === SCORE_SOURCE_TYPES.JSON
                  ? applyScoreRecommendation(source)
                  : source,
              ),
            };
          }),
        );

        const uploaded = await uploadCloudScores(payloads);
        showToast(
          uploaded ? `已批次上傳 ${payloads.length} 份譜面` : '批次上傳失敗',
          uploaded ? 'success' : 'error',
        );
      }
    } catch (error) {
      console.error(error);
      showToast('匯入失敗', 'error');
    } finally {
      event.target.value = '';
    }
  }, [loadScoreSource, showToast, stopAll, uploadCloudScores]);

  const handleExportLocal = useCallback(() => {
    const extension = scoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON ? 'json' : 'txt';
    const filename = `${scoreTitle.trim() || 'score'}.${extension}`;
    const payload = scoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON
      ? (scoreDocument.rawText || JSON.stringify(scoreDocument.content ?? {}, null, 2))
      : buildScoreTextWithMeta(
        scoreDocument.rawText,
        createScoreTextMeta({
          ...scoreDocument,
          title: scoreTitle.trim() || scoreDocument.title,
        }),
      );

    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`已匯出 ${filename}`, 'success');
  }, [scoreDocument, scoreTitle, showToast]);

  const handleResetScore = useCallback(() => {
    resetScoreState();
    stopAll();
    showToast('已重設目前譜面', 'success');
  }, [resetScoreState, showToast, stopAll]);

  const handlePlayFeaturedScore = useCallback(async (featuredScore) => {
    const nextScore = await featuredScore.load();
    const source = {
      title: nextScore.title,
      rawText: nextScore.rawText,
      content: nextScore.content,
      sourceType: nextScore.sourceType,
      bpm: nextScore.bpm,
      timeSigNum: nextScore.timeSigNum,
      timeSigDen: nextScore.timeSigDen,
      charResolution: nextScore.charResolution,
      legacyTimingMode: nextScore.legacyTimingMode,
      textNotation: nextScore.textNotation,
      storageFormat: nextScore.storageFormat,
      filename: nextScore.filename,
      globalKeyOffset: nextScore.globalKeyOffset,
      scaleMode: nextScore.scaleMode,
      reverb: nextScore.reverb,
      tone: nextScore.tone,
      accidentals: nextScore.accidentals,
    };

    loadScoreSource(applyScoreRecommendation(source, { force: true }));
    stopAll();
    showToast(`已載入 ${nextScore.displayTitle ?? nextScore.title}`, 'success');
  }, [loadScoreSource, showToast, stopAll]);

  const handleLoadLocalConvertedScore = useCallback((payload) => {
    loadScoreSource({
      title: payload?.meta?.title ?? '轉換後譜面',
      content: payload,
      sourceType: SCORE_SOURCE_TYPES.JSON,
      ...payload?.transport,
      ...payload?.playback,
    });
    stopAll();
  }, [loadScoreSource, stopAll]);

  const editorScore = useMemo(() => {
    if (scoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON) {
      if (scoreDocument.content && typeof scoreDocument.content === 'object') {
        return scoreDocument.content;
      }

      try {
        return parseScoreContent(scoreDocument.rawText, SCORE_SOURCE_TYPES.JSON);
      } catch {
        return score;
      }
    }

    return score;
  }, [score, scoreDocument.content, scoreDocument.rawText, scoreDocument.sourceType]);

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
        className="app-shell relative flex min-h-screen select-none flex-col items-center pb-20 font-serif text-slate-900 touch-pan-y"
        onPointerMove={handlePagePointerMove}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="app-background pointer-events-none fixed inset-0 bg-cover bg-center" />
        <StarrySky />
        <WindParticles />

        {toast ? (
          <div className={`fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl border px-6 py-3.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'border-rose-500/50 bg-rose-500/20 text-rose-100' : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-100'}`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span className="text-sm font-bold tracking-wider">{toast.message}</span>
          </div>
        ) : null}

        <PianoRoom
          playHotkey={playHotkey}
          setPlayHotkey={setPlayHotkey}
          featuredScores={selectableScores}
          scoreGroups={selectableScoreGroups}
          onPlayFeaturedScore={handlePlayFeaturedScore}
          activeKeys={activeKeys}
          accidentals={accidentals}
          keyPulseTokens={keyPulseTokens}
          noteTrail={noteTrail}
          onKeyActivate={handleKeyActivate}
          onKeyDeactivate={handleKeyDeactivate}
          onToggleSharp={handleToggleSharp}
          progressBarRef={progressBarRef}
          score={editorScore}
          scoreTitle={scoreTitle}
          onJumpToSection={scrollToSection}
          workspaceSections={workspaceSections}
        />

        <section className="z-20 w-full max-w-6xl px-4">
          <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="xl:sticky xl:top-6 xl:self-start">
              <div className="rounded-[32px] border border-white/10 bg-black/25 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm">
                <div className="mb-4 px-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-200/55">
                    Workspace
                  </div>
                  <div className="mt-2 text-sm font-semibold text-sky-50/80">
                    保留主要流程，先收斂未完成系統的介面資源。
                  </div>
                </div>

                <div className="space-y-2">
                  {workspaceSections.map((section, index) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:border-sky-300/30 hover:bg-sky-500/10"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-sky-50">{section.label}</span>
                        <span className="block text-[10px] uppercase tracking-[0.24em] text-sky-200/40">{section.caption}</span>
                      </span>
                      <span className="ml-3 text-[10px] font-black text-sky-300/60">{String(index + 1).padStart(2, '0')}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="space-y-8">
              <div id="playback-preview" className="rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-emerald-200/55">
                    Playback Preview
                  </div>
                  <div className="mt-2 text-sm font-semibold text-emerald-50/80">
                    即時保留演奏預覽與鍵位視覺回饋，作為核心操作區。
                  </div>
                </div>

                <PerformanceWorkspace
                  embedded
                  score={editorScore}
                  scoreTitle={scoreTitle}
                />
              </div>

              <div id="editor" className="rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-violet-200/55">
                    Score Editor
                  </div>
                  <div className="mt-2 text-sm font-semibold text-violet-50/80">
                    編輯器維持原有匯入、匯出、儲存與重設流程。
                  </div>
                </div>

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
                  onExport={handleExportLocal}
                  onSave={handleSaveScore}
                  onReset={handleResetScore}
                  isSaving={isSaving}
                  onConnectCloud={handleConnectCloud}
                  cloudStatus={cloudStatus}
                  showGuidePanel={false}
                  showReferencePanel={false}
                />
              </div>

              <div id="cloud-library" className="rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-200/55">
                    Cloud Library
                  </div>
                  <div className="mt-2 text-sm font-semibold text-sky-50/80">
                    雲端曲庫存系統先保留同步、讀取與摘要管理骨架。
                  </div>
                </div>

                <div className="mb-5 flex flex-col gap-3 rounded-[28px] border border-white/8 bg-white/[0.03] p-4 md:flex-row md:items-center">
                  <input
                    type="text"
                    value={scoreTitle}
                    onChange={(event) => setScoreTitle(event.target.value)}
                    className="w-full rounded-2xl border border-sky-300/20 bg-slate-900/55 px-4 py-3 text-sm text-white outline-none"
                    placeholder="輸入目前譜面的雲端名稱"
                  />
                  <button
                    type="button"
                    onClick={handleSaveScore}
                    disabled={isSaving}
                    className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-bold text-white disabled:bg-sky-800/70"
                  >
                    {isSaving ? '儲存中...' : '儲存到雲端'}
                  </button>
                </div>

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
              </div>

              <div id="converter" className="rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-amber-200/55">
                    Converter
                  </div>
                  <div className="mt-2 text-sm font-semibold text-amber-50/80">
                    上傳 MusicXML 或 MIDI，轉換成可播放譜面並下載 slim JSON。
                  </div>
                </div>

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
            </div>
          </div>
        </section>

        <footer className="z-20 mt-16 text-[10px] uppercase tracking-[0.6em] text-slate-400">
          {APP_NAME} 繚 {APP_TAGLINE}
        </footer>

        <style>{`
          input[type=range] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 2px; border-radius: 1px; }
          input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: currentColor; cursor: pointer; transition: all 0.2s; border: 2px solid rgba(0,0,0,0.5); }
          .custom-scrollbar::-webkit-scrollbar { width: 5px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.18); border-radius: 10px; }
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
    loadCloudScore,
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
        loadCloudScore={loadCloudScore}
        loadScoreSource={loadScoreSource}
        applySavedScore={applySavedScore}
        resetScoreState={resetScoreState}
      />
    </AudioConfigProvider>
  );
}
