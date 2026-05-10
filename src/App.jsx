import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import ScoreConverter from './components/ScoreConverter';
import ScoreEditor from './components/ScoreEditor';
import ScoreLibrary from './components/ScoreLibrary';
import ScoreInfoCard from './components/ScoreInfoCard';
import WindParticles from './components/WindParticles';
import PerformanceWorkspace from './components/PerformanceWorkspace';
import PianoRoom from './pages/PianoRoom';
import { AudioConfigProvider, useAudioConfig } from './contexts/AudioConfigContext';
import { PlaybackProvider } from './contexts/PlaybackContext';
import { FEATURED_SCORES } from './data/featuredScores';
import { IMPORTABLE_SCORE_FILES, IMPORTABLE_SCORE_GROUPS } from './data/importableScoreFiles';
import demoScore from './data/scores/demo.json';
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
  const onKeyVisualAttack = useCallback((key, eventMeta = {}) => {
    const now = performance.now();
    const lastPulseAt = pulseThrottleRef.current[key] ?? 0;
    setActiveKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (!eventMeta?.resumed && now - lastPulseAt > 96) {
      pulseThrottleRef.current[key] = now;
      setKeyPulseTokens((prev) => ({
        ...prev,
        [key]: (prev[key] ?? 0) + 1,
      }));
    }
    setNoteTrail((prev) => {
      const next = [
        ...prev,
        {
          id: `${key}-${Math.round(now)}`,
          key,
          time: now,
          source: eventMeta?.source ?? 'playback',
        },
      ];
      return next.slice(-48);
    });
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
  const scrollToSection = useCallback((sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);
  const selectableScores = useMemo(
    () => [...FEATURED_SCORES, ...IMPORTABLE_SCORE_FILES],
    [],
  );
  const selectableScoreGroups = useMemo(
    () => [
      {
        id: 'featured',
        label: '精選曲目',
        files: FEATURED_SCORES,
      },
      ...IMPORTABLE_SCORE_GROUPS,
    ],
    [],
  );
  const workspaceSections = useMemo(() => ([
    { id: 'playback-preview', label: '播放預覽', caption: 'Live Preview' },
    { id: 'editor', label: '譜面編輯', caption: 'Score Editor' },
    { id: 'cloud-library', label: '雲端曲庫', caption: 'Firebase / Cloud' },
    { id: 'converter', label: '琴譜轉換', caption: 'Converter' },
  ]), []);
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
    showToast('已連接雲端', 'success');
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
      showToast('請先輸入曲譜名稱', 'error');
      return;
    }
    const saved = await saveCloudScore(title, scoreDocument);
    if (!saved) {
      showToast(cloudError || 'Firebase 儲存失敗', 'error');
      return;
    }
    showToast('已儲存到雲端', 'success');
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
        showToast(`已載入 ${source.title}`, 'success');
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
          uploaded ? `已上傳 ${payloads.length} 份譜面` : '批次上傳失敗',
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
      ? scoreDocument.rawText
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
    showToast('已重設當前譜面', 'success');
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
    showToast('已載入 JSON Demo', 'success');
  }, [loadScoreSource, showToast, stopAll]);
  const handlePlayFeaturedScore = useCallback(async (featuredScore) => {
    const score = await featuredScore.load();
    const source = {
      title: score.title,
      rawText: score.rawText,
      sourceType: score.sourceType,
      bpm: score.bpm,
      timeSigNum: score.timeSigNum,
      timeSigDen: score.timeSigDen,
      charResolution: score.charResolution,
      legacyTimingMode: score.legacyTimingMode,
      textNotation: score.textNotation,
      storageFormat: score.storageFormat,
      filename: score.filename,
      globalKeyOffset: score.globalKeyOffset,
      scaleMode: score.scaleMode,
      reverb: score.reverb,
      tone: score.tone,
      accidentals: score.accidentals,
    };
    loadScoreSource(applyScoreRecommendation(source, { force: true }));
    stopAll();
    showToast(`已切換到 ${score.displayTitle ?? score.title}`, 'success');
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
        <div className="app-background pointer-events-none fixed inset-0 bg-cover bg-center" />
        <StarrySky />
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
                    星圖導覽
                  </div>
                  <div className="mt-2 text-sm font-semibold text-sky-50/80">
                    點擊左側即可跳轉到對應調整區塊。
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
                    播放預覽
                  </div>
                  <div className="mt-2 text-sm font-semibold text-emerald-50/80">
                    已與轉換器對調位置，現在可先預覽播放，再決定是否轉譜。
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
                    譜面編輯
                  </div>
                  <div className="mt-2 text-sm font-semibold text-violet-50/80">
                    保留完整編輯、參考與微調能力，方便處理大譜面。
                  </div>
                </div>
                <ScoreEditor
                  score={score}
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
                  showGuidePanel={false}
                  showReferencePanel={false}
                />
              </div>
              <div id="cloud-library" className="rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-sm font-semibold text-sky-50/80">
                    <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-200/55">
                      雲端曲庫
                    </div>
                    <div className="mt-2 text-sm font-semibold text-sky-50/80">
                      Firebase 改成先載入摘要清單，再按需抓完整譜面，降低大譜面造成的同步負擔。
                    </div>
                  </div>
                </div>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <ScoreInfoCard title="目前譜面">
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={scoreTitle}
                        onChange={(e) => setScoreTitle(e.target.value)}
                        className="w-full bg-slate-800/60 text-white px-3 py-2 rounded-lg border border-sky-300/20"
                        placeholder="請輸入曲譜標題"
                      />
                      <button
                        onClick={handleSaveScore}
                        disabled={isSaving}
                        className="bg-sky-500 text-white px-4 py-2 rounded-lg disabled:bg-sky-800/70"
                      >
                        {isSaving ? '儲存中' : '儲存'}
                      </button>
                    </div>
                  </ScoreInfoCard>
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
              </div>
              <div id="converter" className="rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-sm font-semibold text-amber-50/80">
                    <div className="text-[10px] font-black uppercase tracking-[0.34em] text-amber-200/55">
                      琴譜轉換
                    </div>
                    <div className="mt-2 text-sm font-semibold text-amber-50/80">
                      轉換器獨立成單一區塊，避免和播放檢視混在一起。
                    </div>
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
          {APP_NAME} · {APP_TAGLINE}
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
