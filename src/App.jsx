import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, FolderOpen, Trash2 } from 'lucide-react';
import ScoreConverter from './components/ScoreConverter';
import ScoreEditor from './components/ScoreEditor';
import PianoRoom from './pages/PianoRoom';
import galaxyBackgroundUrl from './assets/galaxy-background.jpg';
import { AudioConfigProvider, useAudioConfig } from './contexts/AudioConfigContext';
import { PlaybackProvider } from './contexts/PlaybackContext';
import { IMPORTABLE_SCORE_FILES, IMPORTABLE_SCORE_GROUPS } from './data/importableScoreFiles';
import { useCloudScores } from './hooks/useCloudScores';
import useKeyboardMatcher from './hooks/useKeyboardMatcher';
import { useScorePlayback } from './hooks/useScorePlayback';
import { useScoreState } from './hooks/useScoreState';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from './config/branding';
import {
  applyScoreSettingsToJsonContent,
  createScoreDocument,
  parseScoreContent,
  SCORE_SOURCE_TYPES,
} from './utils/scoreDocument';
import { applyScoreRecommendation } from './utils/scoreRecommendations';
import { normalizeScoreSource } from './utils/score';
import { scoreJsonToMidiBytes } from './utils/scoreToMidi';

function getFileTitle(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

async function readImportedScore(file) {
  const raw = await file.text();
  const isJsonFile = file.name.toLowerCase().endsWith('.json');

  if (!isJsonFile) {
    throw new Error(`${file.name} 不是可直接讀取的譜面。請匯入 JSON/Slim JSON；MIDI、MusicXML 與 MXL 請使用轉換區載入。`);
  }

  if (!raw.trim()) {
    throw new Error(`${file.name} 是空的 JSON 檔案。`);
  }

  let content;
  try {
    content = JSON.parse(raw);
  } catch {
    throw new Error(`${file.name} 的 JSON 格式無法解析。`);
  }

  return {
    title: getFileTitle(file.name),
    content,
    sourceType: SCORE_SOURCE_TYPES.JSON,
  };
}

function convertEventToV2Note(event, targetResolution) {
  const sourceResolution = Math.max(Number(event?.resolution) || targetResolution || 480, 1);
  const safeTargetResolution = Math.max(Number(targetResolution) || sourceResolution, 1);
  const startTick = Math.max(
    0,
    Math.round(((Number(event?.startTick ?? event?.tick) || 0) * safeTargetResolution) / sourceResolution),
  );
  const durationTicks = Math.max(
    1,
    Math.round((Math.max(Number(event?.durationTicks ?? event?.durationTick) || 0, 1) * safeTargetResolution) / sourceResolution),
  );

  return {
    type: 'note',
    startTick,
    durationTicks,
    key: event?.k ?? null,
    velocity: Number((event?.v ?? 0.85).toFixed(4)),
    frequency: event?.frequency ?? null,
    noteName: event?.noteName ?? null,
    midi: event?.midi ?? null,
    pitchClass: event?.pitchClass ?? null,
    octave: event?.octave ?? null,
  };
}

function mergeConvertedScorePayloads(currentPayload, incomingPayload) {
  const currentNormalized = normalizeScoreSource(currentPayload);
  const incomingNormalized = normalizeScoreSource(incomingPayload);
  const targetResolution = Math.max(
    Number(currentPayload?.transport?.resolution) || 0,
    Number(incomingPayload?.transport?.resolution) || 0,
    Number(currentNormalized?.playback?.resolution) || 0,
    Number(incomingNormalized?.playback?.resolution) || 0,
    480,
  );

  const currentEvents = (currentNormalized?.events ?? [])
    .filter((event) => !event?.isRest)
    .map((event) => ({
      ...convertEventToV2Note(event, targetResolution),
      trackId: String(event?.trackId ?? 'main'),
    }));
  const currentEndTick = currentEvents.reduce(
    (maxTick, event) => Math.max(maxTick, event.startTick + event.durationTicks),
    0,
  );
  const incomingEvents = (incomingNormalized?.events ?? [])
    .filter((event) => !event?.isRest)
    .map((event) => {
      const nextEvent = convertEventToV2Note(event, targetResolution);
      return {
        ...nextEvent,
        startTick: nextEvent.startTick + currentEndTick,
        trackId: String(event?.trackId ?? 'main'),
      };
    });

  const groupedTracks = new Map();
  const trackOrder = [];
  const ensureTrack = (trackId) => {
    if (!groupedTracks.has(trackId)) {
      groupedTracks.set(trackId, []);
      trackOrder.push(trackId);
    }
    return groupedTracks.get(trackId);
  };

  currentEvents.forEach((event) => {
    ensureTrack(event.trackId).push({
      type: event.type,
      startTick: event.startTick,
      durationTicks: event.durationTicks,
      key: event.key,
      velocity: event.velocity,
      frequency: event.frequency,
      noteName: event.noteName,
      midi: event.midi,
      pitchClass: event.pitchClass,
      octave: event.octave,
    });
  });
  incomingEvents.forEach((event) => {
    ensureTrack(event.trackId).push({
      type: event.type,
      startTick: event.startTick,
      durationTicks: event.durationTicks,
      key: event.key,
      velocity: event.velocity,
      frequency: event.frequency,
      noteName: event.noteName,
      midi: event.midi,
      pitchClass: event.pitchClass,
      octave: event.octave,
    });
  });

  const tracks = trackOrder.map((trackId, index) => ({
    id: trackId,
    name: trackId === 'main' ? `Track ${index + 1}` : trackId,
    mute: false,
    events: groupedTracks.get(trackId).sort((left, right) => left.startTick - right.startTick),
  }));

  return applyScoreSettingsToJsonContent({
    version: '2.0',
    meta: {
      ...(currentPayload?.meta ?? {}),
      title: currentPayload?.meta?.title ?? incomingPayload?.meta?.title ?? 'Merged score',
      displayTitle: currentPayload?.meta?.displayTitle ?? currentPayload?.meta?.title ?? incomingPayload?.meta?.title ?? 'Merged score',
      sourceType: currentPayload?.meta?.sourceType ?? incomingPayload?.meta?.sourceType ?? 'json',
      originalFormat: currentPayload?.meta?.originalFormat ?? incomingPayload?.meta?.originalFormat ?? 'json',
      mergedAt: new Date().toISOString(),
    },
    transport: {
      ...(currentPayload?.transport ?? incomingPayload?.transport ?? {}),
      resolution: targetResolution,
    },
    playback: {
      ...(currentPayload?.playback ?? incomingPayload?.playback ?? {}),
    },
    source: {
      ...(currentPayload?.source ?? {}),
      mergedFrom: [
        currentPayload?.meta?.title ?? 'current-score',
        incomingPayload?.meta?.title ?? 'incoming-score',
      ],
    },
    tracks,
  }, {
    ...(currentPayload?.transport ?? incomingPayload?.transport ?? {}),
    ...(currentPayload?.playback ?? incomingPayload?.playback ?? {}),
    title: currentPayload?.meta?.title ?? incomingPayload?.meta?.title ?? 'Merged score',
  });
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
  updateScoreDocument,
}) {
  const audioConfig = useAudioConfig();
  const [playHotkey, setPlayHotkey] = useState('Space');
  const [toast, setToast] = useState(null);
  const [activeKeys, setActiveKeys] = useState(() => new Set());
  const [featuredLoadState, setFeaturedLoadState] = useState({ isLoading: false, message: '' });
  const [uiMode, setUiMode] = useState('normal');
  const [panelModes, setPanelModes] = useState({});
  const [pendingConvertedScores, setPendingConvertedScores] = useState([]);
  const toastTimerRef = useRef(null);
  const visualEventQueueRef = useRef([]);
  const visualFlushFrameRef = useRef(0);
  const featuredRequestIdRef = useRef(0);

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

  useEffect(() => {
    const blockDefault = (event) => {
      event.preventDefault();
    };
    const handleKeyDown = (event) => {
      const key = event.key?.toLowerCase();
      const blocked =
        event.key === 'F12'
        || (event.ctrlKey && key === 'u')
        || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key));

      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('contextmenu', blockDefault);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('contextmenu', blockDefault);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const flushVisualEvents = useCallback(() => {
    visualFlushFrameRef.current = 0;
    const queuedEvents = visualEventQueueRef.current;
    visualEventQueueRef.current = [];

    if (!queuedEvents.length) {
      return;
    }

    const nextActiveKeys = new Set();
    const releasedKeys = new Set();

    queuedEvents.forEach((entry) => {
      if (entry.type === 'release') {
        releasedKeys.add(entry.key);
        nextActiveKeys.delete(entry.key);
        return;
      }

      releasedKeys.delete(entry.key);
      nextActiveKeys.add(entry.key);
    });

    if (nextActiveKeys.size || releasedKeys.size) {
      setActiveKeys((prev) => {
        const next = new Set(prev);
        releasedKeys.forEach((key) => next.delete(key));
        nextActiveKeys.forEach((key) => next.add(key));
        return next;
      });
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

  const handleBackgroundPointerDown = useCallback((event) => {
    if (event.target.closest('[data-ui-panel="true"], button, a, input, textarea, select, [role="slider"]')) {
      return;
    }

    setUiMode('clear');
  }, []);

  const handlePanelPointerDown = useCallback((event) => {
    event.stopPropagation();
  }, []);

  const togglePanelMode = useCallback((panelId) => {
    setPanelModes((prev) => ({
      ...prev,
      [panelId]: (prev[panelId] ?? uiMode) === 'clear' ? 'normal' : 'clear',
    }));
  }, [uiMode]);

  const getPanelMode = useCallback((panelId) => panelModes[panelId] ?? uiMode, [panelModes, uiMode]);

  const scrollToSection = useCallback((sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  const selectableScores = useMemo(() => IMPORTABLE_SCORE_FILES, []);
  const pendingConvertedScoreOptions = useMemo(() => (
    pendingConvertedScores.map((result, index) => {
      const payload = result.payload;
      const title = payload?.meta?.displayTitle ?? payload?.meta?.title ?? result.file?.name ?? `本機暫存 ${index + 1}`;

      return {
        id: `pending-converted-${index}-${result.file?.name ?? title}`,
        filename: result.file?.name,
        title,
        displayTitle: title,
        subtitle: result.sourceType ?? 'Converted score',
        versionLabel: result.sourceType ?? 'Converted',
        groupLabel: '本機暫存轉檔',
        sourceType: SCORE_SOURCE_TYPES.JSON,
        bpm: payload?.transport?.bpm ?? payload?.playback?.bpm,
        timeSigNum: payload?.transport?.timeSigNum,
        timeSigDen: payload?.transport?.timeSigDen,
        charResolution: payload?.transport?.resolution,
        globalKeyOffset: payload?.playback?.globalKeyOffset,
        scaleMode: payload?.playback?.scaleMode,
        tone: payload?.playback?.tone,
        reverb: payload?.playback?.reverb,
        accidentals: payload?.playback?.accidentals ?? {},
        load: async () => ({
          title,
          displayTitle: title,
          content: payload,
          sourceType: SCORE_SOURCE_TYPES.JSON,
          ...payload?.transport,
          ...payload?.playback,
        }),
      };
    })
  ), [pendingConvertedScores]);
  const selectableScoreGroups = useMemo(() => (
    pendingConvertedScoreOptions.length
      ? [
        ...IMPORTABLE_SCORE_GROUPS,
        {
          id: 'pending-converted',
          label: '本機暫存轉檔',
          files: pendingConvertedScoreOptions,
        },
      ]
      : IMPORTABLE_SCORE_GROUPS
  ), [pendingConvertedScoreOptions]);

  const workspaceSections = useMemo(() => ([
    { id: 'main-screen', label: '\u4e3b\u756b\u9762', shortLabel: '\u4e3b\u756b\u9762', caption: '\u66f2\u5eab\u8207\u64ad\u653e\u5165\u53e3' },
    { id: 'lyre-keyboard', label: '\u9375\u76e4', shortLabel: '\u9375\u76e4', caption: '\u5373\u6642\u6f14\u594f\u9375\u76e4' },
    { id: 'rhythm-controls', label: '\u7bc0\u594f\u8207\u8abf\u6027\u8abf\u6574', shortLabel: '\u7bc0\u594f\u8abf\u6027', caption: 'BPM\u3001\u62cd\u865f\u3001\u97f3\u8272\u8207\u8abf\u6027' },
    { id: 'editor', label: '\u8b5c\u9762\u7de8\u8f2f', shortLabel: '\u8b5c\u9762\u7de8\u8f2f', caption: 'Score Editor' },
    { id: 'converter', label: '\u8b5c\u9762\u8f49\u63db', shortLabel: '\u8b5c\u9762\u8f49\u63db', caption: 'MusicXML / MIDI Converter' },
    { id: 'background-board', label: '\u80cc\u666f', shortLabel: '\u80cc\u666f', caption: '\u5e03\u544a\u6b04\u8207\u80cc\u666f\u6b23\u8cde' },
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
    isBusy: isPlaybackBusy,
    busyMessage: playbackBusyMessage,
    playbackState,
    progressBarRef,
    playScoreAction,
    pauseScoreAction,
    resumeScoreAction,
    restartScoreAction,
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
    audioConfig,
    accidentals,
    showToast,
    onKeyVisualAttack,
    onKeyVisualRelease,
    onVisualReset,
  });

  const isUiBusy = isPlaybackBusy || featuredLoadState.isLoading;
  const uiBusyMessage = featuredLoadState.isLoading
    ? featuredLoadState.message
    : playbackBusyMessage;

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

  const buildCurrentScoreSnapshot = useCallback((titleOverride = scoreTitle.trim() || scoreDocument.title) => {
    const effectiveScoreDocument = {
      ...scoreDocument,
      bpm,
      timeSigNum,
      timeSigDen,
      charResolution,
      accidentals,
      tone: audioConfig.tone,
      vol: audioConfig.vol,
      reverb: audioConfig.reverb,
      globalKeyOffset: audioConfig.globalKeyOffset,
      scaleMode: audioConfig.scaleMode,
    };

    const currentContent = effectiveScoreDocument.content ?? parseScoreContent(
      effectiveScoreDocument.rawText,
      SCORE_SOURCE_TYPES.JSON,
    );
    const content = applyScoreSettingsToJsonContent(currentContent, {
      ...effectiveScoreDocument,
      title: titleOverride,
    });

    return createScoreDocument({
      ...effectiveScoreDocument,
      title: titleOverride,
      content,
      rawText: JSON.stringify(content, null, 2),
      sourceType: SCORE_SOURCE_TYPES.JSON,
    });
  }, [
    accidentals,
    audioConfig.globalKeyOffset,
    audioConfig.reverb,
    audioConfig.scaleMode,
    audioConfig.tone,
    audioConfig.vol,
    bpm,
    charResolution,
    scoreDocument,
    scoreTitle,
    timeSigDen,
    timeSigNum,
  ]);

  const handleApplyCurrentSettingsToScore = useCallback(() => {
    const title = scoreTitle.trim() || scoreDocument.title;
    const snapshot = buildCurrentScoreSnapshot(title);

    updateScoreDocument(snapshot);
    showToast('已將目前節奏與調性寫入譜面', 'success');
  }, [buildCurrentScoreSnapshot, scoreDocument.title, scoreTitle, showToast, updateScoreDocument]);

  const handleConnectCloud = useCallback(async () => {
    const result = await ensureCloudConnection();
    if (!result) {
      showToast(cloudError || 'Firebase 連線失敗', 'error');
      return;
    }
    showToast('已連線到 Firebase', 'success');
  }, [cloudError, ensureCloudConnection, showToast]);

  const handleLoadScore = useCallback(async (savedScore) => {
    const fullScore = savedScore?.rawText ? savedScore : await loadCloudScore(savedScore.id);

    if (!fullScore) {
      showToast('雲端譜面載入失敗', 'error');
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

    const saved = await saveCloudScore(title, buildCurrentScoreSnapshot(title));
    if (!saved) {
      showToast(cloudError || 'Firebase 存檔失敗', 'error');
      return;
    }

    showToast('已存入雲端曲庫，節奏與調性也已寫入譜面', 'success');
  }, [buildCurrentScoreSnapshot, cloudError, saveCloudScore, scoreTitle, showToast]);

  const handleDeleteScore = useCallback(async (id) => {
    const deleted = await deleteCloudScore(id);
    showToast(deleted ? '已刪除雲端譜面' : '刪除失敗', deleted ? 'success' : 'error');
  }, [deleteCloudScore, showToast]);

  const handleClearAllScores = useCallback(async () => {
    if (!window.confirm('確定要刪除所有雲端譜面嗎？')) {
      return;
    }

    const cleared = await clearAllCloudScores();
    showToast(cleared ? '雲端曲庫已清空' : '清空失敗', cleared ? 'success' : 'error');
  }, [clearAllCloudScores, showToast]);

  const handleImportLocal = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      if (files.length === 1) {
        const source = await readImportedScore(files[0]);
        loadScoreSource(applyScoreRecommendation(source));
        stopAll();
        showToast(`已匯入 ${source.title}`, 'success');
      } else {
        const payloads = await Promise.all(
          files.map(async (file) => {
            const source = await readImportedScore(file);
            return {
              title: source.title,
              payload: createScoreDocument(applyScoreRecommendation(source)),
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
      showToast(error?.message || '匯入失敗', 'error');
    } finally {
      event.target.value = '';
    }
  }, [loadScoreSource, showToast, stopAll, uploadCloudScores]);

  const handleExportLocal = useCallback((format = 'source') => {
    const snapshot = buildCurrentScoreSnapshot(scoreTitle.trim() || scoreDocument.title);
    let filename = `${scoreTitle.trim() || 'score'}.json`;
    let blob = null;

    if (format === 'midi') {
      const midiBytes = scoreJsonToMidiBytes(snapshot.content ?? {});
      filename = `${scoreTitle.trim() || 'score'}.mid`;
      blob = new Blob([midiBytes], { type: 'audio/midi' });
    } else {
      filename = `${scoreTitle.trim() || 'score'}.json`;
      blob = new Blob([JSON.stringify(snapshot.content ?? {}, null, 2)], { type: 'application/json;charset=utf-8' });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`已匯出 ${filename}`, 'success');
  }, [buildCurrentScoreSnapshot, scoreDocument, scoreTitle, showToast]);

  const handleResetScore = useCallback(() => {
    resetScoreState();
    stopAll();
    showToast('已重設目前譜面', 'success');
  }, [resetScoreState, showToast, stopAll]);

  const handleClearCurrentScore = useCallback(() => {
    const emptyScore = {
      version: '3.2-ultra-slim',
      meta: {
        title: '未命名譜面',
        displayTitle: '未命名譜面',
        sourceType: 'json',
        storageFormat: 'hina-slim-score@3.2',
      },
      transport: {
        bpm,
        timeSigNum,
        timeSigDen,
        resolution: 480,
      },
      playback: {
        tone: audioConfig.tone,
        globalKeyOffset: audioConfig.globalKeyOffset,
        scaleMode: audioConfig.scaleMode,
        reverb: audioConfig.reverb,
        accidentals,
      },
      tracks: [],
      notes: [],
    };

    loadScoreSource({
      id: `cleared-score-${Date.now()}`,
      title: '未命名譜面',
      content: emptyScore,
      sourceType: SCORE_SOURCE_TYPES.JSON,
    });
    stopAll();
  }, [
    accidentals,
    audioConfig.globalKeyOffset,
    audioConfig.reverb,
    audioConfig.scaleMode,
    audioConfig.tone,
    bpm,
    loadScoreSource,
    stopAll,
    timeSigDen,
    timeSigNum,
  ]);

  const handlePlayFeaturedScore = useCallback(async (featuredScore) => {
    const requestId = featuredRequestIdRef.current + 1;
    featuredRequestIdRef.current = requestId;
    setFeaturedLoadState({
      isLoading: true,
      message: `載入曲目 ${featuredScore.displayTitle ?? featuredScore.title} 中...`,
    });

    try {
    const nextScore = await featuredScore.load();
    if (featuredRequestIdRef.current !== requestId) {
      return;
    }
    const source = {
      title: nextScore.title,
      rawText: nextScore.rawText,
      content: nextScore.content,
      sourceType: nextScore.sourceType,
      bpm: nextScore.bpm,
      timeSigNum: nextScore.timeSigNum,
      timeSigDen: nextScore.timeSigDen,
      charResolution: nextScore.charResolution,
      storageFormat: nextScore.storageFormat,
      filename: nextScore.filename,
      globalKeyOffset: nextScore.globalKeyOffset,
      scaleMode: nextScore.scaleMode,
      reverb: nextScore.reverb,
      tone: audioConfig.tone,
      accidentals: nextScore.accidentals,
    };

    loadScoreSource(applyScoreRecommendation(source, { force: true }));
    stopAll();
    showToast(`已載入 ${nextScore.displayTitle ?? nextScore.title}`, 'success');
    } catch (error) {
      console.error(error);
      if (featuredRequestIdRef.current === requestId) {
        showToast('載入曲目失敗', 'error');
      }
    } finally {
      if (featuredRequestIdRef.current === requestId) {
        setFeaturedLoadState({ isLoading: false, message: '' });
      }
    }
  }, [audioConfig.tone, loadScoreSource, showToast, stopAll]);

  const handleLoadLocalConvertedScore = useCallback((payload, options = {}) => {
    const { mode = 'replace' } = options;
    let nextPayload = payload;

    if (mode === 'append' && scoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON) {
      try {
        const currentPayload = scoreDocument.content && typeof scoreDocument.content === 'object'
          ? scoreDocument.content
          : parseScoreContent(scoreDocument.rawText, SCORE_SOURCE_TYPES.JSON);
        if (currentPayload && typeof currentPayload === 'object') {
          nextPayload = mergeConvertedScorePayloads(currentPayload, payload);
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadScoreSource({
      id: nextPayload?.meta?.id ?? nextPayload?.id,
      title: nextPayload?.meta?.title ?? 'Converted score',
      rawText: JSON.stringify(nextPayload, null, 2),
      content: nextPayload,
      sourceType: SCORE_SOURCE_TYPES.JSON,
      ...nextPayload?.transport,
      ...nextPayload?.playback,
      tone: audioConfig.tone,
    });
    stopAll();
  }, [audioConfig.tone, loadScoreSource, scoreDocument.content, scoreDocument.rawText, scoreDocument.sourceType, stopAll]);

  const handleRemovePendingConvertedScore = useCallback((indexToRemove) => {
    setPendingConvertedScores((prev) => prev.filter((_, index) => index !== indexToRemove));
    showToast('已移除本機暫存譜面', 'success');
  }, [showToast]);

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
    isPlaying,
    isPaused,
    playbackState,
    onTogglePlay: playScoreAction,
    onPause: pauseScoreAction,
    onResume: resumeScoreAction,
    onRestart: restartScoreAction,
    onSeekToTime: seekToTime,
    onScrubToTime: scrubToTime,
    onSeekToTick: seekToTick,
    onScrubToTick: scrubToTick,
    onSetPlaybackRate: setPlaybackRate,
    onApplySettingsToScore: handleApplyCurrentSettingsToScore,
  }), [
    bpm,
    charResolution,
    handleApplyCurrentSettingsToScore,
    isPlaying,
    isPaused,
    playbackState,
    pauseScoreAction,
    playScoreAction,
    restartScoreAction,
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
        data-ui-mode={uiMode}
        className="app-shell relative flex min-h-screen select-none flex-col items-center pb-20 font-serif text-slate-50 touch-pan-y"
        onPointerDown={handleBackgroundPointerDown}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(2, 3, 15, 0.38), rgba(24, 18, 54, 0.34) 44%, rgba(3, 12, 32, 0.58)), url(${galaxyBackgroundUrl})`,
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      >
        {toast ? (
          <div className={`fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl border px-6 py-3.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-md animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'border-rose-500/50 bg-rose-500/20 text-rose-100' : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-100'}`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span className="text-sm font-bold tracking-wider">{toast.message}</span>
          </div>
        ) : null}

        {isUiBusy ? (
          <div className="fixed left-1/2 top-6 z-40 -translate-x-1/2 rounded-full border border-amber-300/40 bg-slate-950/85 px-5 py-2.5 text-xs font-bold tracking-[0.18em] text-amber-100 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {uiBusyMessage || '載入中...'}
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
          onKeyActivate={handleKeyActivate}
          onKeyDeactivate={handleKeyDeactivate}
          onToggleSharp={handleToggleSharp}
          progressBarRef={progressBarRef}
          score={editorScore}
          scoreTitle={scoreTitle}
          onJumpToSection={scrollToSection}
          workspaceSections={workspaceSections}
          isBusy={isUiBusy}
          busyMessage={uiBusyMessage}
          uiMode={uiMode}
          onPanelPointerDown={handlePanelPointerDown}
        />

        <section className="z-20 w-full max-w-6xl px-4">
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="xl:sticky xl:top-6 xl:self-start">
              <div data-ui-panel="true" data-panel-mode={getPanelMode('workspace')} onPointerDown={handlePanelPointerDown} className="ui-panel rounded-[32px] border border-white/10 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] transition-colors duration-300">
                <div role="button" tabIndex={0} onClick={() => togglePanelMode('workspace')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') togglePanelMode('workspace'); }} className="mb-4 px-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-100">
                    Workspace
                  </div>
                  <div className="mt-2 text-sm font-semibold text-sky-50">
                    快速跳到演奏、設定、編輯、轉換與雲端區塊。
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
                        <span className="block text-[10px] uppercase tracking-[0.24em] text-sky-100/80">{section.caption}</span>
                      </span>
                      <span className="ml-3 text-[10px] font-black text-sky-200">{String(index + 1).padStart(2, '0')}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-100/65">
                        Local Stash
                      </div>
                      <div className="mt-1 text-xs font-semibold text-amber-50/75">
                        本機暫存轉檔
                      </div>
                    </div>
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] font-black text-amber-100">
                      {pendingConvertedScores.length}
                    </span>
                  </div>

                  <div className="custom-scrollbar max-h-[280px] space-y-2 overflow-y-auto pr-1">
                    {pendingConvertedScores.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-xs leading-relaxed text-white/45">
                        轉換 MIDI、MusicXML 或 MXL 後，譜面會先暫存在這裡，也會出現在上方預設歌曲選單。
                      </div>
                    ) : pendingConvertedScores.map((result, index) => (
                      <div
                        key={`${result.file?.name ?? 'converted'}-${index}`}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                      >
                        <button
                          type="button"
                          onClick={() => handleLoadLocalConvertedScore(result.payload, { mode: 'replace' })}
                          className="flex w-full items-start gap-2 text-left"
                        >
                          <FolderOpen size={14} className="mt-0.5 shrink-0 text-amber-100" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-amber-50">
                              {result.payload?.meta?.displayTitle ?? result.payload?.meta?.title ?? result.file?.name}
                            </span>
                            <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.18em] text-amber-100/60">
                              {result.sourceType ?? 'Converted'}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePendingConvertedScore(index)}
                          className="mt-2 inline-flex items-center gap-1 rounded-xl border border-rose-300/20 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-100/80 transition hover:bg-rose-500/20"
                        >
                          <Trash2 size={12} />
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <div className="space-y-8">
              <div id="editor" data-ui-panel="true" data-panel-mode={getPanelMode('editor')} onPointerDown={handlePanelPointerDown} className="ui-panel scroll-mt-6 rounded-[36px] border border-white/10 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] transition-colors duration-300 md:p-6">
                <div role="button" tabIndex={0} onClick={() => togglePanelMode('editor')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') togglePanelMode('editor'); }} className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-violet-100">
                    Score Editor
                  </div>
                  <div className="mt-2 text-sm font-semibold text-violet-50">
                    Edit, import, export, and save the current score.
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

              <div id="converter" data-ui-panel="true" data-panel-mode={getPanelMode('converter')} onPointerDown={handlePanelPointerDown} className="ui-panel scroll-mt-6 rounded-[36px] border border-white/10 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] transition-colors duration-300 md:p-6">
                <div role="button" tabIndex={0} onClick={() => togglePanelMode('converter')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') togglePanelMode('converter'); }} className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-amber-100">
                    Converter
                  </div>
                  <div className="mt-2 text-sm font-semibold text-amber-50">
                    拖放或選擇 MIDI、MusicXML、MXL，轉換後可先載入目前譜面測試，也可整批上傳曲庫。
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 text-[11px] font-semibold text-amber-50/75">
                    <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1">單檔會直接載入</span>
                    <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1">多檔會進待上傳清單</span>
                    <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1">清單按鈕可取代或接到現有譜面</span>
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
                  onBatchUpload={uploadCloudScores}
                  convertedResults={pendingConvertedScores}
                  onConvertedResultsChange={setPendingConvertedScores}
                  onClearCurrentScore={handleClearCurrentScore}
                />
              </div>
            </div>
          </div>
        </section>

        <section id="background-board" className="z-10 mt-12 w-full max-w-6xl scroll-mt-6 px-4">
          <div data-ui-panel="true" data-panel-kind="background-board" data-panel-mode={getPanelMode('background-board')} onPointerDown={handlePanelPointerDown} className="relative min-h-[64vh] overflow-hidden rounded-[36px] border border-white/12 bg-slate-950/16 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.18)] transition-colors duration-300 md:min-h-[68vh] md:rounded-[44px] md:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.22),rgba(2,6,23,0.08)_42%,rgba(2,6,23,0.26)),radial-gradient(circle_at_18%_18%,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_82%_26%,rgba(253,224,171,0.10),transparent_28%)]" />
            <button
              type="button"
              onClick={() => togglePanelMode('background-board')}
              className="absolute right-4 top-4 z-10 rounded-full border border-white/12 bg-slate-950/45 px-4 py-2 text-[10px] font-black tracking-[0.2em] text-sky-50/85 transition hover:bg-slate-900/70"
            >
              {getPanelMode('background-board') === 'clear' ? '顯示介紹' : '淡化介紹'}
            </button>
            <div className={`relative flex min-h-[calc(64vh-2.5rem)] flex-col justify-between gap-10 transition duration-500 md:min-h-[calc(68vh-4rem)] ${getPanelMode('background-board') === 'clear' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
              <div className="max-w-3xl">
                <div className="text-[10px] font-black uppercase tracking-[0.38em] text-sky-100/75">
                  Background Board
                </div>
                <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl md:text-5xl">
                  {APP_NAME}
                </h2>
                <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-sky-50/82 sm:text-base">
                  {APP_TAGLINE} 是一個把譜面編輯、即時演奏、MIDI / MusicXML 轉換與雲端曲庫整合在同一個畫面的音樂工作台。這個區域保留給公告、演出提示與背景欣賞，播放時也能把介面視線放回星空。
                </p>
              </div>

              <div className="grid gap-3 text-sm text-slate-50/82 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-4 backdrop-blur-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/70">Play</div>
                  <div className="mt-2 font-semibold leading-6">用鍵盤或畫面琴鍵即時演奏，並跟隨播放進度練習。</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-4 backdrop-blur-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-100/70">Convert</div>
                  <div className="mt-2 font-semibold leading-6">匯入 MIDI、MusicXML、MXL，轉成可播放與可保存的譜面資料。</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-4 backdrop-blur-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/70">Archive</div>
                  <div className="mt-2 font-semibold leading-6">把完成的曲目存入雲端曲庫，保留節奏、調性、音色與參考資料。</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="z-20 mt-16 text-[10px] uppercase tracking-[0.6em] text-slate-200">
          {APP_NAME} / {APP_TAGLINE}
        </footer>

        <div className="h-[24vh] w-full pointer-events-none" aria-hidden="true" />

        <div className="fixed bottom-4 right-4 z-30 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[10px] font-black tracking-[0.22em] text-slate-200 shadow-[0_14px_30px_rgba(0,0,0,0.32)] backdrop-blur-md">
          v{APP_VERSION}
        </div>

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
    if (patch.vol !== undefined) {
      nextPatch.vol = patch.vol;
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
    ...(scoreDocument.vol === undefined ? {} : { vol: scoreDocument.vol }),
    tone: scoreDocument.tone,
    reverb: scoreDocument.reverb,
    globalKeyOffset: scoreDocument.globalKeyOffset,
    scaleMode: scoreDocument.scaleMode,
  }), [
    scoreDocument.globalKeyOffset,
    scoreDocument.reverb,
    scoreDocument.scaleMode,
    scoreDocument.tone,
    scoreDocument.vol,
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
        updateScoreDocument={updateScoreDocument}
      />
    </AudioConfigProvider>
  );
}

