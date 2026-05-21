import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import ScoreConverter from './components/ScoreConverter';
import ScoreEditor from './components/ScoreEditor';
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
import { APP_NAME, APP_TAGLINE, APP_VERSION } from './config/branding';
import {
  applyScoreSettingsToJsonContent,
  createScoreDocument,
  createScoreTextMeta,
  parseScoreContent,
  SCORE_SOURCE_TYPES,
} from './utils/scoreDocument';
import { applyScoreRecommendation } from './utils/scoreRecommendations';
import { buildScoreTextWithMeta } from './utils/scoreTextMeta';
import { normalizeScoreSource } from './utils/score';
import { scoreJsonToMidiBytes } from './utils/scoreToMidi';
import GalaxyBackground from './components/GalaxyBackground';

function getFileTitle(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

async function readImportedScore(file) {
  const raw = await file.text();
  const isJsonFile = file.name.toLowerCase().endsWith('.json');

  if (isJsonFile) {
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

  return {
    title: getFileTitle(file.name),
    rawText: raw,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
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
  const [keyPulseTokens, setKeyPulseTokens] = useState({});
  const [noteTrail, setNoteTrail] = useState([]);
  const [featuredLoadState, setFeaturedLoadState] = useState({ isLoading: false, message: '' });
  const pageRef = useRef(null);
  const toastTimerRef = useRef(null);
  const pulseThrottleRef = useRef({});
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
    { id: 'main-screen', label: '\u4e3b\u756b\u9762', shortLabel: '\u4e3b\u756b\u9762', caption: '\u66f2\u5eab\u8207\u64ad\u653e\u5165\u53e3' },
    { id: 'lyre-keyboard', label: '\u9375\u76e4', shortLabel: '\u9375\u76e4', caption: '\u5373\u6642\u6f14\u594f\u9375\u76e4' },
    { id: 'rhythm-controls', label: '\u7bc0\u594f\u8207\u8abf\u6027\u8abf\u6574', shortLabel: '\u7bc0\u594f\u8abf\u6027', caption: 'BPM\u3001\u62cd\u865f\u3001\u97f3\u8272\u8207\u8abf\u6027' },
    { id: 'playback-preview', label: '\u6f14\u594f\u9810\u89bd', shortLabel: '\u6f14\u594f\u9810\u89bd', caption: 'Live Preview' },
    { id: 'editor', label: '\u8b5c\u9762\u7de8\u8f2f', shortLabel: '\u8b5c\u9762\u7de8\u8f2f', caption: 'Score Editor' },
    { id: 'converter', label: '\u8b5c\u9762\u8f49\u63db', shortLabel: '\u8b5c\u9762\u8f49\u63db', caption: 'MusicXML / MIDI Converter' },
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
      reverb: audioConfig.reverb,
      globalKeyOffset: audioConfig.globalKeyOffset,
      scaleMode: audioConfig.scaleMode,
    };

    if (effectiveScoreDocument.sourceType === SCORE_SOURCE_TYPES.JSON) {
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
    }

    return createScoreDocument({
      ...effectiveScoreDocument,
      title: titleOverride,
      rawText: buildScoreTextWithMeta(
        effectiveScoreDocument.rawText,
        createScoreTextMeta({
          ...effectiveScoreDocument,
          title: titleOverride,
        }),
      ),
      sourceType: SCORE_SOURCE_TYPES.TEXT,
    });
  }, [
    accidentals,
    audioConfig.globalKeyOffset,
    audioConfig.reverb,
    audioConfig.scaleMode,
    audioConfig.tone,
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
    let filename = `${scoreTitle.trim() || 'score'}.txt`;
    let blob = null;

    if (format === 'midi') {
      const scoreJson = snapshot.sourceType === SCORE_SOURCE_TYPES.JSON
        ? snapshot.content
        : normalizeScoreSource(snapshot.rawText, snapshot);
      const midiBytes = scoreJsonToMidiBytes(
        snapshot.sourceType === SCORE_SOURCE_TYPES.JSON
          ? scoreJson
          : {
            version: '2.0',
            meta: {
              title: snapshot.title,
              sourceType: 'text',
            },
            transport: {
              bpm: snapshot.bpm,
              timeSigNum: snapshot.timeSigNum,
              timeSigDen: snapshot.timeSigDen,
              resolution: scoreJson?.playback?.resolution ?? 480,
            },
            playback: {
              tone: snapshot.tone,
              globalKeyOffset: snapshot.globalKeyOffset,
              reverb: snapshot.reverb,
              scaleMode: snapshot.scaleMode,
              accidentals: snapshot.accidentals,
            },
            tracks: [
              {
                id: 'main',
                name: 'Main',
                mute: false,
                events: (scoreJson?.events ?? [])
                  .filter((event) => !event?.isRest)
                  .map((event) => ({
                    type: 'note',
                    startTick: event.startTick ?? event.tick,
                    durationTicks: event.durationTicks,
                    key: event.k ?? null,
                    velocity: event.v ?? 0.85,
                    frequency: event.frequency ?? null,
                    noteName: event.noteName ?? null,
                    midi: event.midi ?? null,
                  })),
              },
            ],
          },
      );
      filename = `${scoreTitle.trim() || 'score'}.mid`;
      blob = new Blob([midiBytes], { type: 'audio/midi' });
    } else if (snapshot.sourceType === SCORE_SOURCE_TYPES.JSON) {
      filename = `${scoreTitle.trim() || 'score'}.json`;
      blob = new Blob([JSON.stringify(snapshot.content ?? {}, null, 2)], { type: 'application/json;charset=utf-8' });
    } else {
      filename = `${scoreTitle.trim() || 'score'}.txt`;
      blob = new Blob([snapshot.rawText], { type: 'text/plain;charset=utf-8' });
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
    loadScoreSource({
      id: `cleared-score-${Date.now()}`,
      title: '未命名譜面',
      rawText: '',
      sourceType: SCORE_SOURCE_TYPES.TEXT,
    });
    stopAll();
  }, [loadScoreSource, stopAll]);

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
  }, [loadScoreSource, showToast, stopAll]);

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
    });
    stopAll();
  }, [loadScoreSource, scoreDocument.content, scoreDocument.rawText, scoreDocument.sourceType, stopAll]);

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
    onApplySettingsToScore: handleApplyCurrentSettingsToScore,
  }), [
    bpm,
    charResolution,
    handleApplyCurrentSettingsToScore,
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
        <div className="app-background pointer-events-none fixed inset-0 z-0 bg-cover bg-center" />
        <GalaxyBackground />
        <WindParticles />

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
          isBusy={isUiBusy}
          busyMessage={uiBusyMessage}
        />

        <section className="z-20 w-full max-w-6xl px-4">
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="xl:sticky xl:top-6 xl:self-start">
              <div className="rounded-[32px] border border-white/10 bg-black/25 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm">
                <div className="mb-4 px-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-200/55">
                    Workspace
                  </div>
                  <div className="mt-2 text-sm font-semibold text-sky-50/80">
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
                        <span className="block text-[10px] uppercase tracking-[0.24em] text-sky-200/40">{section.caption}</span>
                      </span>
                      <span className="ml-3 text-[10px] font-black text-sky-300/60">{String(index + 1).padStart(2, '0')}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="space-y-8">
              <div id="playback-preview" className="scroll-mt-6 rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-emerald-200/55">
                    Playback Preview
                  </div>
                  <div className="mt-2 text-sm font-semibold text-emerald-50/80">
                    Live timeline and section preview for the current score.
                  </div>
                </div>

                <PerformanceWorkspace
                  embedded
                  score={editorScore}
                  scoreTitle={scoreTitle}
                />
              </div>

              <div id="editor" className="scroll-mt-6 rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-violet-200/55">
                    Score Editor
                  </div>
                  <div className="mt-2 text-sm font-semibold text-violet-50/80">
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

              <div id="converter" className="scroll-mt-6 rounded-[36px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex flex-col gap-2 px-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.34em] text-amber-200/55">
                    Converter
                  </div>
                  <div className="mt-2 text-sm font-semibold text-amber-50/80">
                    Convert MusicXML or MIDI into the current playable score.
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
                  onClearCurrentScore={handleClearCurrentScore}
                />
              </div>
            </div>
          </div>
        </section>

        <footer className="z-20 mt-16 text-[10px] uppercase tracking-[0.6em] text-slate-400">
          {APP_NAME} / {APP_TAGLINE}
        </footer>

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
        updateScoreDocument={updateScoreDocument}
      />
    </AudioConfigProvider>
  );
}

