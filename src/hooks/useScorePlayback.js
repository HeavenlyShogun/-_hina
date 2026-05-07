import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from '../constants/music';
import audioEngine from '../services/audioEngine';
import playbackController from '../services/playbackController';
import { normalizeScoreSource } from '../utils/score';

function transposeFrequency(baseFrequency, semitoneOffset) {
  return baseFrequency * 2 ** (semitoneOffset / 12);
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach((child) => {
    deepFreeze(child);
  });

  return value;
}

export function useScorePlayback({
  score,
  bpm,
  timeSigNum,
  timeSigDen,
  charResolution,
  legacyTimingMode,
  textNotation,
  audioConfig,
  accidentals,
  showToast,
  onKeyVisualAttack,
  onKeyVisualRelease,
  onVisualReset,
}) {
  const [playbackState, setPlaybackState] = useState(() => playbackController.getState());
  const progressBarRef = useRef(null);
  const isPlayingRef = useRef(false);
  const activeLiveVoicesRef = useRef(new Map());
  const queuedSeekJobRef = useRef(null);
  const seekLoopPromiseRef = useRef(null);
  const playbackConfigRef = useRef({
    score,
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    legacyTimingMode,
    textNotation,
    audioConfig,
    accidentals,
  });

  useEffect(() => {
    playbackConfigRef.current = {
      score,
      bpm,
      timeSigNum,
      timeSigDen,
      charResolution,
      legacyTimingMode,
      textNotation,
      audioConfig,
      accidentals,
    };
  }, [accidentals, audioConfig, bpm, charResolution, legacyTimingMode, score, textNotation, timeSigDen, timeSigNum]);

  useEffect(() => {
    isPlayingRef.current = playbackState.isPlaying;
  }, [playbackState.isPlaying]);

  useEffect(() => {
    const unregister = playbackController.setCallbacks({
      onVisualAttack: onKeyVisualAttack,
      onVisualRelease: onKeyVisualRelease,
      onVisualReset,
      onProgressUpdate: (progress) => {
        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${progress}%`;
        }
      },
      onStateChange: (nextState) => {
        setPlaybackState(nextState);
      },
    });

    setPlaybackState(playbackController.getState());

    return unregister;
  }, [onKeyVisualAttack, onKeyVisualRelease, onVisualReset]);

  useEffect(() => () => {
    queuedSeekJobRef.current = null;
    seekLoopPromiseRef.current = null;
    playbackController.stop();
    activeLiveVoicesRef.current.clear();
    audioEngine.stopAll();
  }, []);

  const buildSnapshot = useCallback((overrides = {}) => {
    const current = playbackConfigRef.current;
    const nextAudioConfig = {
      ...current.audioConfig,
      ...(overrides.audioConfig ?? {}),
    };

    return deepFreeze(cloneValue({
      tone: nextAudioConfig?.tone,
      vol: nextAudioConfig?.vol,
      reverb: nextAudioConfig?.reverb,
      globalKeyOffset: nextAudioConfig?.globalKeyOffset,
      accidentals: overrides.accidentals ?? current.accidentals,
    }));
  }, []);

  useEffect(() => {
    playbackController.updateSnapshot(buildSnapshot());
    audioEngine.setReverbEnabled(audioConfig?.reverb);
  }, [
    accidentals,
    audioConfig?.globalKeyOffset,
    audioConfig?.reverb,
    audioConfig?.tone,
    audioConfig?.vol,
    buildSnapshot,
  ]);

  useEffect(() => {
    if (!audioConfig?.tone) {
      return;
    }

    audioEngine.prepareTone(audioConfig.tone).catch((error) => {
      console.warn(`Failed to prepare tone "${audioConfig.tone}".`, error);
    });
  }, [audioConfig?.tone]);

  const loadCurrentScore = useCallback(() => {
    const current = playbackConfigRef.current;
    const normalizedBpm = Number(current.bpm) || DEFAULT_SCORE_PARAMS.bpm;
    const { events, maxTime, playback } = normalizeScoreSource(current.score, {
      bpm: normalizedBpm,
      timeSigNum: current.timeSigNum,
      timeSigDen: current.timeSigDen,
      charResolution: current.charResolution,
      globalKeyOffset: current.audioConfig?.globalKeyOffset,
      scaleMode: current.audioConfig?.scaleMode,
      legacyTimingMode: current.legacyTimingMode,
      textNotation: current.textNotation,
    });

    playbackController.load(events, maxTime, playback);
    return { events, maxTime, playback };
  }, []);

  const loadProvidedScore = useCallback((source) => {
    const normalizedBpm = Number(source?.bpm) || DEFAULT_SCORE_PARAMS.bpm;
    const { events, maxTime, playback } = normalizeScoreSource(source?.score ?? '', {
      bpm: normalizedBpm,
      timeSigNum: source?.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum,
      timeSigDen: source?.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen,
      charResolution: source?.charResolution ?? DEFAULT_SCORE_PARAMS.charResolution,
      globalKeyOffset:
        source?.audioConfig?.globalKeyOffset
        ?? source?.globalKeyOffset
        ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
      scaleMode:
        source?.audioConfig?.scaleMode
        ?? source?.scaleMode
        ?? DEFAULT_SCORE_PARAMS.scaleMode,
      textNotation: source?.textNotation,
    });

    playbackController.load(events, maxTime, playback);
    return { events, maxTime, playback };
  }, []);

  const stopAll = useCallback(() => {
    queuedSeekJobRef.current = null;
    playbackController.stop();
    activeLiveVoicesRef.current.clear();
    audioEngine.stopAll();
  }, []);

  const drainQueuedSeek = useCallback(async () => {
    if (seekLoopPromiseRef.current) {
      return seekLoopPromiseRef.current;
    }

    const run = (async () => {
      while (queuedSeekJobRef.current) {
        const job = queuedSeekJobRef.current;
        queuedSeekJobRef.current = null;

        try {
          const result = await playbackController.seek(job.target, job.snapshot);
          job.resolve?.(result);
        } catch (error) {
          job.reject?.(error);
        }
      }
    })();

    seekLoopPromiseRef.current = run;

    try {
      await run;
    } finally {
      seekLoopPromiseRef.current = null;
      if (queuedSeekJobRef.current) {
        return drainQueuedSeek();
      }
    }

    return playbackController.getState();
  }, []);

  const queueSeek = useCallback((target, options = {}) => {
    const snapshot = buildSnapshot();
    const { silent = false } = options;

    return new Promise((resolve, reject) => {
      queuedSeekJobRef.current = {
        target,
        snapshot,
        resolve,
        reject: silent ? null : reject,
      };

      drainQueuedSeek().catch((error) => {
        if (!silent) {
          reject(error);
        }
      });
    });
  }, [buildSnapshot, drainQueuedSeek]);

  const playFromStart = useCallback(async () => {
    const { events } = loadCurrentScore();

    if (!events.length) {
      stopAll();
      showToast('沒有可播放的音符。', 'error');
      return;
    }

    await audioEngine.prepareTone(playbackConfigRef.current.audioConfig?.tone);
    await playbackController.play(audioEngine.audioContext, buildSnapshot());
  }, [buildSnapshot, loadCurrentScore, showToast, stopAll]);

  const playScoreAction = useCallback(async () => {
    try {
      if (playbackState.isPlaying) {
        stopAll();
        return;
      }

      if (playbackState.isPaused) {
        await playbackController.resume(buildSnapshot());
        return;
      }

      await playFromStart();
    } catch (error) {
      console.error(error);
      stopAll();
      showToast('播放失敗。', 'error');
    }
  }, [buildSnapshot, playbackState.isPaused, playbackState.isPlaying, playFromStart, showToast, stopAll]);

  const playScoreSourceAction = useCallback(async (source) => {
    try {
      stopAll();
      const { events } = loadProvidedScore(source);

      if (!events.length) {
        showToast('沒有可播放的音符。', 'error');
        return;
      }

      await audioEngine.prepareTone(
        source?.audioConfig?.tone ?? playbackConfigRef.current.audioConfig?.tone,
      );
      await audioEngine.resume();
      audioEngine.setReverbEnabled(source?.audioConfig?.reverb);
      await playbackController.play(audioEngine.audioContext, buildSnapshot({
        audioConfig: source?.audioConfig,
        accidentals: source?.accidentals,
      }));
    } catch (error) {
      console.error(error);
      stopAll();
      showToast('播放失敗。', 'error');
    }
  }, [buildSnapshot, loadProvidedScore, showToast, stopAll]);

  const pauseScoreAction = useCallback(() => {
    queuedSeekJobRef.current = null;
    playbackController.pause();
  }, []);

  const resumeScoreAction = useCallback(async () => {
    try {
      await audioEngine.prepareTone(playbackConfigRef.current.audioConfig?.tone);
      await playbackController.resume(buildSnapshot());
    } catch (error) {
      console.error(error);
      stopAll();
      showToast('恢復播放失敗。', 'error');
    }
  }, [buildSnapshot, showToast, stopAll]);

  const seekToTime = useCallback(async (seconds) => {
    try {
      await queueSeek({ time: seconds });
    } catch (error) {
      console.error(error);
      showToast('定位失敗。', 'error');
    }
  }, [queueSeek, showToast]);

  const scrubToTime = useCallback((seconds) => {
    void queueSeek({ time: seconds }, { silent: true });
  }, [queueSeek]);

  const seekToTick = useCallback(async (tick) => {
    try {
      await queueSeek({ tick });
    } catch (error) {
      console.error(error);
      showToast('定位失敗。', 'error');
    }
  }, [queueSeek, showToast]);

  const scrubToTick = useCallback((tick) => {
    void queueSeek({ tick }, { silent: true });
  }, [queueSeek]);

  const seekToIndex = useCallback(async (index) => {
    try {
      await queueSeek({ index });
    } catch (error) {
      console.error(error);
      showToast('定位失敗。', 'error');
    }
  }, [queueSeek, showToast]);

  const setPlaybackRate = useCallback(async (rate) => {
    try {
      await playbackController.setPlaybackRate(rate);
    } catch (error) {
      console.error(error);
      showToast('播放速度更新失敗。', 'error');
    }
  }, [showToast]);

  const handleKeyActivate = useCallback((keyK) => {
    const activate = async () => {
      const info = KEY_INFO_MAP[keyK];
      const current = playbackConfigRef.current;
      const semitoneOffset =
        Number(current.audioConfig?.globalKeyOffset || 0) + (current.accidentals?.[keyK] ? 1 : 0);
      const frequency = info ? transposeFrequency(info.f, semitoneOffset) : null;

      if (info && frequency && !activeLiveVoicesRef.current.has(keyK)) {
        await audioEngine.prepareTone(current.audioConfig?.tone);
        await audioEngine.resume();
        const voice = audioEngine.playLiveNote(frequency, {
          tone: current.audioConfig?.tone,
          outputGain: current.audioConfig?.vol,
          reverb: current.audioConfig?.reverb,
          velocity: 0.9,
          voiceId: keyK,
        });

        if (voice) {
          activeLiveVoicesRef.current.set(keyK, voice);
        }
      }

      onKeyVisualAttack(keyK);
    };

    void activate();
  }, [onKeyVisualAttack]);

  const handleKeyDeactivate = useCallback((keyK) => {
    const voice = activeLiveVoicesRef.current.get(keyK);
    activeLiveVoicesRef.current.delete(keyK);
    audioEngine.releaseLiveVoice(voice ?? keyK);
    onKeyVisualRelease(keyK);
  }, [onKeyVisualRelease]);

  return {
    isPlaying: playbackState.isPlaying,
    isPaused: playbackState.isPaused,
    playbackState,
    progressBarRef,
    isPlayingRef,
    playScoreAction,
    playScoreSourceAction,
    pauseScoreAction,
    resumeScoreAction,
    seekToTime,
    scrubToTime,
    seekToTick,
    scrubToTick,
    seekToIndex,
    setPlaybackRate,
    stopAll,
    handleKeyActivate,
    handleKeyDeactivate,
  };
}
