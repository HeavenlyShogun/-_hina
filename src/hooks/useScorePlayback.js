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
  const playbackConfigRef = useRef({
    score,
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
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
      audioConfig,
      accidentals,
    };
  }, [accidentals, audioConfig, bpm, charResolution, score, timeSigDen, timeSigNum]);

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
    playbackController.stop();
    activeLiveVoicesRef.current.clear();
    audioEngine.stopAll();
  }, []);

  const buildSnapshot = useCallback(() => {
    const current = playbackConfigRef.current;

    return deepFreeze(cloneValue({
      tone: current.audioConfig?.tone,
      vol: current.audioConfig?.vol,
      reverb: current.audioConfig?.reverb,
      globalKeyOffset: current.audioConfig?.globalKeyOffset,
      accidentals: current.accidentals,
    }));
  }, []);

  useEffect(() => {
    playbackController.updateSnapshot(buildSnapshot());
    audioEngine.setReverbEnabled(audioConfig?.reverb);
  }, [accidentals, audioConfig?.globalKeyOffset, audioConfig?.reverb, audioConfig?.tone, audioConfig?.vol, buildSnapshot]);

  const loadCurrentScore = useCallback(() => {
    const current = playbackConfigRef.current;
    const normalizedBpm = Number(current.bpm) || DEFAULT_SCORE_PARAMS.bpm;
    const { events, maxTime, playback } = normalizeScoreSource(current.score, {
      bpm: normalizedBpm,
      timeSigNum: current.timeSigNum,
      timeSigDen: current.timeSigDen,
      charResolution: current.charResolution,
    });

    playbackController.load(events, maxTime, playback);
    return { events, maxTime, playback };
  }, []);

  const stopAll = useCallback(() => {
    playbackController.stop();
    activeLiveVoicesRef.current.clear();
    audioEngine.stopAll();
  }, []);

  const playFromStart = useCallback(async () => {
    const { events } = loadCurrentScore();

    if (!events.length) {
      stopAll();
      showToast('沒有可播放的音符事件', 'error');
      return;
    }

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
      showToast('播放失敗', 'error');
    }
  }, [playFromStart, playbackState.isPaused, playbackState.isPlaying, showToast, stopAll]);

  const pauseScoreAction = useCallback(() => {
    playbackController.pause();
  }, []);

  const resumeScoreAction = useCallback(async () => {
    try {
      await playbackController.resume(buildSnapshot());
    } catch (error) {
      console.error(error);
      stopAll();
      showToast('恢復播放失敗', 'error');
    }
  }, [buildSnapshot, showToast, stopAll]);

  const seekToTime = useCallback(async (seconds) => {
    try {
      await playbackController.seek({ time: seconds }, buildSnapshot());
    } catch (error) {
      console.error(error);
      showToast('跳轉失敗', 'error');
    }
  }, [buildSnapshot, showToast]);

  const seekToIndex = useCallback(async (index) => {
    try {
      await playbackController.seek({ index }, buildSnapshot());
    } catch (error) {
      console.error(error);
      showToast('跳轉失敗', 'error');
    }
  }, [buildSnapshot, showToast]);

  const setPlaybackRate = useCallback(async (rate) => {
    try {
      await playbackController.setPlaybackRate(rate);
    } catch (error) {
      console.error(error);
      showToast('變速失敗', 'error');
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
    pauseScoreAction,
    resumeScoreAction,
    seekToTime,
    seekToIndex,
    setPlaybackRate,
    stopAll,
    handleKeyActivate,
    handleKeyDeactivate,
  };
}
