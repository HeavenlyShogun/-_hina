import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import AppHeader from './components/AppHeader';
import ControlPanel from './components/ControlPanel';
import PianoKeys from './components/PianoKeys';
import WindParticles from './components/WindParticles';
import { mapKey } from './constants/music';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useCloudScores } from './hooks/useCloudScores';
import { useScorePlayback } from './hooks/useScorePlayback';
import { useScoreState } from './hooks/useScoreState';

const ScoreLibrary = lazy(() => import('./components/ScoreLibrary'));
const SheetDisplay = lazy(() => import('./components/SheetDisplay'));

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

  const [playHotkey, setPlayHotkey] = useState('Space');
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const hotkeyRef = useRef(playHotkey);
  const actionRefs = useRef({ playScoreAction: null });

  const { audioCtx, setupAudio, triggerNote, stopAllNodes, updateSettings } = useAudioEngine();

  const showToast = useCallback((msg, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const {
    isPlaying,
    progressBarRef,
    isPlayingRef,
    playScoreAction,
    stopAll,
    handleKeyActivate,
    handleKeyDeactivate,
  } = useScorePlayback({
    audioCtx,
    setupAudio,
    triggerNote,
    stopAllNodes,
    score,
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    showToast,
  });

  useEffect(() => { hotkeyRef.current = playHotkey; }, [playHotkey]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const loadScore = useCallback((saved) => {
    applySavedScore(saved);
    stopAll();
    showToast(`已載入曲譜：${saved.title}（參數已同步套用）`, 'success');
  }, [applySavedScore, showToast, stopAll]);

  const parseImportFile = useCallback(async (file) => {
    const content = await file.text();
    const title = file.name.replace(/\.[^/.]+$/, '');
    let finalContent = content;
    let params = {};
    const firstLine = content.split('\n')[0];

    if (firstLine.startsWith('// [META] ')) {
      try {
        params = JSON.parse(firstLine.replace('// [META] ', ''));
        finalContent = content.substring(firstLine.length + 1).replace(/^\n/, '');
      } catch {}
    }

    return { title, payload: { content: finalContent, ...currentScoreParams, ...params } };
  }, [currentScoreParams]);

  const handleImportLocal = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (files.length === 1) {
      const parsed = await parseImportFile(files[0]);
      loadScore({ title: parsed.title, ...parsed.payload });
      event.target.value = '';
      return;
    }

    const ctx = await ensureCloudConnection();
    if (!ctx || !user) {
      showToast('需先連接 Firebase 才能批次上傳雲端', 'error');
      event.target.value = '';
      return;
    }

    showToast(`正在匯入 ${files.length} 份曲譜到雲端...`, 'info');
    try {
      await uploadCloudScores(await Promise.all(files.map(parseImportFile)));
      showToast(`已成功上傳 ${files.length} 份曲譜到雲端`, 'success');
    } catch {
      showToast('批次上傳失敗', 'error');
    }

    event.target.value = '';
  }, [ensureCloudConnection, loadScore, parseImportFile, showToast, uploadCloudScores, user]);

  useEffect(() => {
    updateSettings({ vol, reverb, globalOffset: globalKeyOffset, accidentals, tone });
  }, [accidentals, globalKeyOffset, reverb, tone, updateSettings, vol]);

  const handleSaveScore = useCallback(async () => {
    if (!scoreTitle.trim()) return showToast('請輸入曲譜名稱', 'error');

    try {
      const saved = await saveCloudScore(scoreTitle.trim(), {
        content: score,
        ...currentScoreParams,
      });

      if (!saved) {
        showToast('請先連接雲端再儲存', 'error');
        return;
      }

      showToast('已儲存到雲端，並同步目前的播放參數', 'success');
    } catch {
      showToast('儲存失敗', 'error');
    }
  }, [currentScoreParams, saveCloudScore, score, scoreTitle, showToast]);

  const handleDeleteScore = useCallback(async (id) => {
    if (!window.confirm('確定要刪除這份曲譜嗎？')) return;

    try {
      const deleted = await deleteCloudScore(id);
      if (!deleted) return;
      showToast('曲譜已刪除', 'success');
    } catch {
      showToast('刪除失敗', 'error');
    }
  }, [deleteCloudScore, showToast]);

  const handleClearAllScores = useCallback(async () => {
    if (!window.confirm('確定要清空所有雲端曲譜嗎？這個操作無法復原。')) return;

    try {
      const cleared = await clearAllCloudScores();
      if (!cleared) return;
      showToast('已清空所有雲端曲譜', 'success');
    } catch {
      showToast('清空失敗', 'error');
    }
  }, [clearAllCloudScores, showToast]);

  const handleExportLocal = useCallback(() => {
    if (!score.trim()) return showToast('目前沒有可匯出的譜面', 'error');
    const meta = JSON.stringify(currentScoreParams);
    const exportContent = `// [META] ${meta}\n${score}`;
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${scoreTitle.trim() || '未命名曲譜'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('已匯出到本機（包含目前參數）', 'success');
  }, [currentScoreParams, score, scoreTitle, showToast]);

  const handleResetScore = useCallback(() => {
    resetScoreState();
    stopAll();
    showToast('已重設為預設曲譜與參數', 'success');
  }, [resetScoreState, showToast, stopAll]);

  const handleToggleSharp = useCallback((key) => {
    setAccidentals((prev) => ({ ...prev, [key]: prev[key] ? 0 : 1 }));
  }, [setAccidentals]);

  const handleToggleReverb = useCallback(() => {
    setupAudio();
    setReverb((value) => !value);
  }, [setReverb, setupAudio]);

  useEffect(() => {
    actionRefs.current.playScoreAction = playScoreAction;
  }, [playScoreAction]);

  useEffect(() => {
    const down = (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (hotkeyRef.current !== 'None' && event.code === hotkeyRef.current) {
        event.preventDefault();
        actionRefs.current.playScoreAction?.();
        return;
      }
      if (event.repeat || isPlayingRef.current) return;

      const mappedKey = mapKey(event.key);
      if (mappedKey) {
        event.preventDefault();
        handleKeyActivate(mappedKey);
      }
    };

    const up = (event) => {
      const mappedKey = mapKey(event.key);
      if (mappedKey) handleKeyDeactivate(mappedKey);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [handleKeyActivate, handleKeyDeactivate, isPlayingRef]);

  return (
    <div className="min-h-screen bg-[#060a12] text-emerald-50 flex flex-col items-center font-serif relative overflow-hidden select-none pb-20 touch-manipulation" onContextMenu={(event) => event.preventDefault()}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />
      <WindParticles />

      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-3.5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md border flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100'}`}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span className="text-sm font-bold tracking-wider">{toast.msg}</span>
        </div>
      )}

      <AppHeader playHotkey={playHotkey} setPlayHotkey={setPlayHotkey} isPlaying={isPlaying} onTogglePlay={playScoreAction} />
      <PianoKeys accidentals={accidentals} globalKeyOffset={globalKeyOffset} onKeyActivate={handleKeyActivate} onKeyDeactivate={handleKeyDeactivate} onToggleSharp={handleToggleSharp} progressBarRef={progressBarRef} />
      <ControlPanel bpm={bpm} setBpm={setBpm} timeSigNum={timeSigNum} setTimeSigNum={setTimeSigNum} timeSigDen={timeSigDen} setTimeSigDen={setTimeSigDen} charResolution={charResolution} setCharResolution={setCharResolution} vol={vol} setVol={setVol} tone={tone} setTone={setTone} reverb={reverb} onToggleReverb={handleToggleReverb} globalKeyOffset={globalKeyOffset} setGlobalKeyOffset={setGlobalKeyOffset} />

      <section className="z-20 w-full max-w-6xl grid lg:grid-cols-[300px_1fr] gap-8 px-4 items-start">
        <Suspense fallback={<PanelFallback heightClass="min-h-[320px]" />}>
          <ScoreLibrary user={user} savedScores={savedScores} onLoadScore={loadScore} onClearAll={handleClearAllScores} onDeleteScore={handleDeleteScore} onConnectCloud={ensureCloudConnection} cloudStatus={cloudStatus} />
        </Suspense>
        <Suspense fallback={<PanelFallback heightClass="min-h-[520px]" />}>
          <SheetDisplay score={score} setScore={setScore} scoreTitle={scoreTitle} setScoreTitle={setScoreTitle} onImport={handleImportLocal} onExport={handleExportLocal} onSave={handleSaveScore} onReset={handleResetScore} isSaving={isSaving} onConnectCloud={ensureCloudConnection} cloudStatus={cloudStatus} />
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
        .key-wrapper { contain: layout style; }
        .will-change-transform { will-change: transform; }
        .playing-active {
          background: linear-gradient(to bottom right, #6ee7b7, #059669) !important;
          transform: scale(0.95) translateY(0) !important;
          box-shadow: 0 0 40px rgba(52,211,153,0.5) !important;
          border-color: transparent !important;
          will-change: transform, box-shadow, background;
        }
        .playing-active > span:first-child { color: white !important; }
        .playing-active > span:last-child { color: rgba(255,255,255,0.9) !important; }
        .playing-active sup { color: #d1fae5 !important; }
        .key-ripple-layer::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 2px solid rgba(52, 211, 153, 0.6);
          opacity: 0;
          transform: scale(0.92);
        }
        .key-ripple-layer.ripple-active::after {
          animation: key-ripple 0.8s ease-out;
        }
        @keyframes key-ripple {
          0% { opacity: 0.7; transform: scale(0.92); }
          100% { opacity: 0; transform: scale(1.28); }
        }
      `}</style>
    </div>
  );
}
