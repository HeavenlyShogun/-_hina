import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import AppHeader from './components/AppHeader';
import ControlPanel from './components/ControlPanel';
import PianoKeys from './components/PianoKeys';
import ScoreLibrary from './components/ScoreLibrary';
import SheetDisplay from './components/SheetDisplay';
import WindParticles from './components/WindParticles';
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS, KEY_INFO_MAP, mapKey } from './constants/music';
import { useAudioEngine } from './hooks/useAudioEngine';
import { connectFirebaseAuth, deleteScore, saveScore, subscribeToScores, uploadScores } from './services/firebase';
import { clearActiveKeysDOM, createRippleDOM, toggleKeyDOM } from './utils/domEffects';
import { parseScoreData } from './utils/score';

export default function App() {
  const [vol, setVol] = useState(0.65);
  const [reverb, setReverb] = useState(true);
  const [globalKeyOffset, setGlobalKeyOffset] = useState(0);
  const [accidentals, setAccidentals] = useState({});
  const [tone, setTone] = useState(DEFAULT_SCORE_PARAMS.tone);
  const [score, setScore] = useState(DEFAULT_SCORE);
  const [scoreTitle, setScoreTitle] = useState('撠???');
  const [savedScores, setSavedScores] = useState([]);
  const [user, setUser] = useState(null);
  const [firebaseCtx, setFirebaseCtx] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_SCORE_PARAMS.bpm);
  const [timeSigNum, setTimeSigNum] = useState(DEFAULT_SCORE_PARAMS.timeSigNum);
  const [timeSigDen, setTimeSigDen] = useState(DEFAULT_SCORE_PARAMS.timeSigDen);
  const [charResolution, setCharResolution] = useState(DEFAULT_SCORE_PARAMS.charResolution);
  const [playHotkey, setPlayHotkey] = useState('Space');
  const [isPlaying, setIsPlaying] = useState(false);
  const [toast, setToast] = useState(null);

  const isPlayingRef = useRef(false);
  const progressBarRef = useRef(null);
  const toastTimerRef = useRef(null);
  const schedulerTimerRef = useRef(null);
  const visualTimerRef = useRef(null);
  const scoreRef = useRef(score);
  const actionRefs = useRef({ playScoreAction: null });
  const hotkeyRef = useRef(playHotkey);
  const authUnsubscribeRef = useRef(null);
  const scoresUnsubscribeRef = useRef(null);
  const connectPromiseRef = useRef(null);

  const { audioCtx, setupAudio, triggerNote, stopAllNodes, updateSettings } = useAudioEngine();

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { hotkeyRef.current = playHotkey; }, [playHotkey]);

  const stopAll = useCallback(() => {
    if (schedulerTimerRef.current) clearTimeout(schedulerTimerRef.current);
    if (visualTimerRef.current) cancelAnimationFrame(visualTimerRef.current);
    schedulerTimerRef.current = null;
    visualTimerRef.current = null;
    stopAllNodes();
    setIsPlaying(false);
    isPlayingRef.current = false;
    clearActiveKeysDOM();
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
  }, [stopAllNodes]);

  useEffect(() => () => {
    stopAll();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    authUnsubscribeRef.current?.();
    scoresUnsubscribeRef.current?.();
  }, [stopAll]);

  const showToast = useCallback((msg, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const ensureCloudConnection = useCallback(async () => {
    if (firebaseCtx) return firebaseCtx;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    setCloudStatus('loading');
    connectPromiseRef.current = connectFirebaseAuth(setUser)
      .then((result) => {
        if (!result?.ctx) {
          setCloudStatus('unavailable');
          return null;
        }
        authUnsubscribeRef.current?.();
        authUnsubscribeRef.current = result.unsubscribe;
        setFirebaseCtx(result.ctx);
        setCloudStatus('ready');
        return result.ctx;
      })
      .catch((error) => {
        console.error(error);
        setCloudStatus('error');
        showToast('Firebase 載入失敗', 'error');
        return null;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    return connectPromiseRef.current;
  }, [firebaseCtx, showToast]);

  useEffect(() => {
    if (!firebaseCtx || !user) return undefined;
    scoresUnsubscribeRef.current?.();
    const unsubscribe = subscribeToScores(firebaseCtx, user.uid, setSavedScores);
    scoresUnsubscribeRef.current = unsubscribe;
    return () => unsubscribe();
  }, [firebaseCtx, user]);

  const loadScore = useCallback((saved) => {
    setScore(saved.content);
    setScoreTitle(saved.title);
    setBpm(saved.bpm ?? DEFAULT_SCORE_PARAMS.bpm);
    setTimeSigNum(saved.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum);
    setTimeSigDen(saved.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen);
    setCharResolution(saved.charResolution ?? DEFAULT_SCORE_PARAMS.charResolution);
    setGlobalKeyOffset(saved.globalKeyOffset ?? 0);
    setAccidentals(saved.accidentals ?? {});
    setTone(saved.tone ?? DEFAULT_SCORE_PARAMS.tone);
    setReverb(saved.reverb ?? true);
    stopAll();
    showToast(`撌脰??交?蝡?${saved.title} (銝血??典?閮剖?)`, 'success');
  }, [showToast, stopAll]);

  const currentScoreParams = useMemo(() => ({
    bpm: Number(bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    globalKeyOffset,
    accidentals,
    tone,
    reverb,
  }), [accidentals, bpm, charResolution, globalKeyOffset, reverb, timeSigDen, timeSigNum, tone]);

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

    showToast(`甇??寞活?郊 ${files.length} 隞賜霅?脩垢摨?..`, 'info');
    try {
      const payloads = await Promise.all(files.map(parseImportFile));
      await uploadScores(ctx, user.uid, payloads);
      showToast(`??撠?${files.length} 隞賜霅遣瑼?脩垢摨冑`, 'success');
    } catch {
      showToast('?寞活撱箸????潛??航炊', 'error');
    }

    event.target.value = '';
  }, [ensureCloudConnection, loadScore, parseImportFile, showToast, user]);

  useEffect(() => {
    updateSettings({ vol, reverb, globalOffset: globalKeyOffset, accidentals, tone });
  }, [accidentals, globalKeyOffset, reverb, tone, updateSettings, vol]);

  const handleSaveScore = useCallback(async () => {
    const ctx = await ensureCloudConnection();
    if (!ctx || !user) return showToast('?Ｙ?璅∪??⊥??脩垢摮?', 'error');
    if (isSaving || !scoreTitle.trim()) return showToast('隢撓?交?蝡?蝔?', 'error');

    setIsSaving(true);
    try {
      await saveScore(ctx, user.uid, scoreTitle.trim(), {
        content: score,
        ...currentScoreParams,
      });
      showToast('璅?撌脩???脩垢嚗歇????憟??唾閮剖?嚗?', 'success');
    } catch {
      showToast('摮?憭望?', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [currentScoreParams, ensureCloudConnection, isSaving, score, scoreTitle, showToast, user]);

  const handleDeleteScore = useCallback(async (id) => {
    if (!window.confirm('蝣箏??芷甇斗?蝡?')) return;
    const ctx = await ensureCloudConnection();
    if (!ctx || !user) return;
    try {
      await deleteScore(ctx, user.uid, id);
      showToast('撌脣??', 'success');
    } catch {
      showToast('?芷??', 'error');
    }
  }, [ensureCloudConnection, showToast, user]);

  const handleClearAllScores = useCallback(async () => {
    if (!window.confirm('蝣箏?皜征??蝡舐霅?嚗瘜儔??')) return;
    const ctx = await ensureCloudConnection();
    if (!ctx || !user) return;
    try {
      await Promise.all(savedScores.map((saved) => deleteScore(ctx, user.uid, saved.id)));
      showToast('撌脫?蝛箇霅澈', 'success');
    } catch {
      showToast('皜征憭望?', 'error');
    }
  }, [ensureCloudConnection, savedScores, showToast, user]);

  const handleExportLocal = useCallback(() => {
    if (!score.trim()) return showToast('?渲??箇征', 'error');
    const meta = JSON.stringify(currentScoreParams);
    const exportContent = `// [META] ${meta}\n${score}`;
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${scoreTitle.trim() || '?芸????'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('撌脖?頛?祆? (?葆????貉???', 'success');
  }, [currentScoreParams, score, scoreTitle, showToast]);

  const handleResetScore = useCallback(() => {
    setScore(DEFAULT_SCORE);
    setBpm(DEFAULT_SCORE_PARAMS.bpm);
    setTone(DEFAULT_SCORE_PARAMS.tone);
    setCharResolution(DEFAULT_SCORE_PARAMS.charResolution);
    setGlobalKeyOffset(DEFAULT_SCORE_PARAMS.globalKeyOffset);
    setAccidentals(DEFAULT_SCORE_PARAMS.accidentals);
    setReverb(DEFAULT_SCORE_PARAMS.reverb);
    stopAll();
    showToast('撌脤?蝵桃?身璅???閮剖???', 'success');
  }, [showToast, stopAll]);

  const handleKeyActivate = useCallback((keyK) => {
    const doActivate = () => {
      const info = KEY_INFO_MAP[keyK];
      if (info) triggerNote(info, 0.9);
      toggleKeyDOM(keyK, true);
      createRippleDOM(keyK);
    };
    if (!audioCtx.current || audioCtx.current.state === 'suspended') setupAudio().then(doActivate);
    else doActivate();
  }, [audioCtx, setupAudio, triggerNote]);

  const handleKeyDeactivate = useCallback((keyK) => toggleKeyDOM(keyK, false), []);
  const handleToggleSharp = useCallback((key) => setAccidentals((prev) => ({ ...prev, [key]: prev[key] ? 0 : 1 })), []);
  const handleToggleReverb = useCallback(() => { setupAudio(); setReverb((value) => !value); }, [setupAudio]);

  const playScoreAction = useCallback(async () => {
    if (isPlayingRef.current) {
      stopAll();
      return;
    }

    isPlayingRef.current = true;
    setIsPlaying(true);

    try {
      await setupAudio();
      const currentBpm = Number(bpm) || DEFAULT_SCORE_PARAMS.bpm;
      const { events, maxTime } = parseScoreData(scoreRef.current, currentBpm, timeSigNum, timeSigDen, charResolution);

      if (!events.length) {
        stopAll();
        showToast('?芸皜砍???喟泵', 'error');
        return;
      }

      const start = audioCtx.current.currentTime + 0.3;
      const queue = events.map((event) => ({ ...event, time: start + event.time }));
      const visualQueue = events.map((event) => ({
        k: event.k,
        on: start + event.time,
        off: start + event.time + Math.min(event.durationSec ?? 0.2, 0.2),
      }));

      let noteIndex = 0;
      let visualIndex = 0;
      let deactivateIndex = 0;
      const activeVisualCounts = new Map();

      const scheduleAudio = () => {
        if (!isPlayingRef.current) return;
        const currentTime = audioCtx.current.currentTime;
        while (noteIndex < queue.length && queue[noteIndex].time < currentTime + 0.5) {
          const event = queue[noteIndex];
          noteIndex += 1;
          const info = KEY_INFO_MAP[event.k];
          if (info) triggerNote(info, event.v, event.time, event.durationSec);
        }
        if (noteIndex < queue.length) schedulerTimerRef.current = setTimeout(scheduleAudio, 25);
      };

      const syncVisuals = () => {
        if (!isPlayingRef.current) return;
        const currentTime = audioCtx.current.currentTime;

        if (progressBarRef.current && maxTime > 0) {
          progressBarRef.current.style.width = `${Math.min(100, Math.max(0, ((currentTime - start) / maxTime) * 100))}%`;
        }

        while (visualIndex < visualQueue.length && visualQueue[visualIndex].on <= currentTime) {
          const visual = visualQueue[visualIndex];
          visualIndex += 1;
          activeVisualCounts.set(visual.k, (activeVisualCounts.get(visual.k) ?? 0) + 1);
          toggleKeyDOM(visual.k, true);
          createRippleDOM(visual.k);
        }

        while (deactivateIndex < visualQueue.length && visualQueue[deactivateIndex].off <= currentTime) {
          const visual = visualQueue[deactivateIndex];
          deactivateIndex += 1;
          const nextCount = (activeVisualCounts.get(visual.k) ?? 1) - 1;
          if (nextCount <= 0) {
            activeVisualCounts.delete(visual.k);
            toggleKeyDOM(visual.k, false);
          } else {
            activeVisualCounts.set(visual.k, nextCount);
          }
        }

        if (currentTime - start >= maxTime + 0.4) stopAll();
        else visualTimerRef.current = requestAnimationFrame(syncVisuals);
      };

      scheduleAudio();
      visualTimerRef.current = requestAnimationFrame(syncVisuals);
    } catch (error) {
      console.error(error);
      stopAll();
      showToast('?唾????潛??航炊', 'error');
    }
  }, [audioCtx, bpm, charResolution, setupAudio, showToast, stopAll, timeSigDen, timeSigNum, triggerNote]);

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
        const element = document.getElementById(`key-${mappedKey}`);
        if (!element || !element.classList.contains('playing-active')) {
          handleKeyActivate(mappedKey);
        }
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
  }, [handleKeyActivate, handleKeyDeactivate]);

  return (
    <div className="min-h-screen bg-[#060a12] text-emerald-50 flex flex-col items-center font-serif relative overflow-hidden select-none pb-20 touch-manipulation" onContextMenu={(event) => event.preventDefault()}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />
      <WindParticles />

      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-3.5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md border flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100'}`}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />} <span className="text-sm font-bold tracking-wider">{toast.msg}</span>
        </div>
      )}

      <AppHeader playHotkey={playHotkey} setPlayHotkey={setPlayHotkey} isPlaying={isPlaying} onTogglePlay={playScoreAction} />

      <PianoKeys accidentals={accidentals} globalKeyOffset={globalKeyOffset} onKeyActivate={handleKeyActivate} onKeyDeactivate={handleKeyDeactivate} onToggleSharp={handleToggleSharp} progressBarRef={progressBarRef} />

      <ControlPanel bpm={bpm} setBpm={setBpm} timeSigNum={timeSigNum} setTimeSigNum={setTimeSigNum} timeSigDen={timeSigDen} setTimeSigDen={setTimeSigDen} charResolution={charResolution} setCharResolution={setCharResolution} vol={vol} setVol={setVol} tone={tone} setTone={setTone} reverb={reverb} onToggleReverb={handleToggleReverb} globalKeyOffset={globalKeyOffset} setGlobalKeyOffset={setGlobalKeyOffset} />

      <section className="z-20 w-full max-w-6xl grid lg:grid-cols-[300px_1fr] gap-8 px-4 items-start">
        <ScoreLibrary user={user} savedScores={savedScores} onLoadScore={loadScore} onClearAll={handleClearAllScores} onDeleteScore={handleDeleteScore} onConnectCloud={ensureCloudConnection} cloudStatus={cloudStatus} />
        <SheetDisplay score={score} setScore={setScore} scoreTitle={scoreTitle} setScoreTitle={setScoreTitle} onImport={handleImportLocal} onExport={handleExportLocal} onSave={handleSaveScore} onReset={handleResetScore} isSaving={isSaving} onConnectCloud={ensureCloudConnection} cloudStatus={cloudStatus} />
      </section>

      <footer className="z-20 mt-16 opacity-20 text-[10px] tracking-[0.6em] uppercase">Aria Engine ??Teyvat Symphony Studio</footer>

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
