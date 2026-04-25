import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from '../constants/music';
import audioEngine from '../services/audioEngine';
import { normalizeScoreSource } from '../utils/score';

function transposeFrequency(baseFrequency, semitoneOffset) {
  return baseFrequency * 2 ** (semitoneOffset / 12);
}

function buildQueues(events, startTime) {
  const audioQueue = new Array(events.length);
  const visualQueue = new Array(events.length);

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const on = startTime + event.time;
    audioQueue[index] = { ...event, time: on };
    visualQueue[index] = {
      k: event.k,
      on,
      off: on + Math.min(event.durationSec ?? 0.2, 0.2),
    };
  }

  return { audioQueue, visualQueue };
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
  const [isPlaying, setIsPlaying] = useState(false);
  const progressBarRef = useRef(null);
  const schedulerTimerRef = useRef(null);
  const visualTimerRef = useRef(null);
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

  const clearPlaybackTimers = useCallback(() => {
    if (schedulerTimerRef.current) clearTimeout(schedulerTimerRef.current);
    if (visualTimerRef.current) cancelAnimationFrame(visualTimerRef.current);
    schedulerTimerRef.current = null;
    visualTimerRef.current = null;
  }, []);

  const resetPlaybackVisuals = useCallback(() => {
    onVisualReset();
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
  }, [onVisualReset]);

  const stopAll = useCallback(() => {
    clearPlaybackTimers();
    activeLiveVoicesRef.current.clear();
    audioEngine.stopAll();
    isPlayingRef.current = false;
    setIsPlaying(false);
    resetPlaybackVisuals();
  }, [clearPlaybackTimers, resetPlaybackVisuals]);

  useEffect(() => () => {
    stopAll();
  }, [stopAll]);

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

  const playScoreAction = useCallback(async () => {
    if (isPlayingRef.current) {
      stopAll();
      return;
    }

    try {
      await audioEngine.resume();

      const config = playbackConfigRef.current;
      const normalizedBpm = Number(config.bpm) || DEFAULT_SCORE_PARAMS.bpm;
      const { events, maxTime } = normalizeScoreSource(config.score, {
        bpm: normalizedBpm,
        timeSigNum: config.timeSigNum,
        timeSigDen: config.timeSigDen,
        charResolution: config.charResolution,
      });

      if (!events.length) {
        stopAll();
        showToast('琴譜內容無法解析出任何音符', 'error');
        return;
      }

      isPlayingRef.current = true;
      setIsPlaying(true);

      const startTime = audioEngine.getCurrentTime() + 0.3;
      const { audioQueue, visualQueue } = buildQueues(events, startTime);
      const activeVisualCounts = new Map();

      let noteIndex = 0;
      let visualIndex = 0;
      let deactivateIndex = 0;

      const scheduleAudio = () => {
        if (!isPlayingRef.current) return;

        const currentTime = audioEngine.getCurrentTime();
        while (noteIndex < audioQueue.length && audioQueue[noteIndex].time < currentTime + 0.5) {
          const event = audioQueue[noteIndex];
          noteIndex += 1;
          const info = KEY_INFO_MAP[event.k];
          if (!info) {
            continue;
          }

          const semitoneOffset =
            Number(config.audioConfig?.globalKeyOffset || 0) + (config.accidentals?.[event.k] ? 1 : 0);

          audioEngine.scheduleNote(
            transposeFrequency(info.f, semitoneOffset),
            event.time,
            event.durationSec,
            {
              tone: config.audioConfig?.tone,
              outputGain: config.audioConfig?.vol,
              reverb: config.audioConfig?.reverb,
              velocity: event.v,
            },
          );
        }

        if (noteIndex < audioQueue.length) {
          schedulerTimerRef.current = setTimeout(scheduleAudio, 25);
        }
      };

      const syncVisuals = () => {
        if (!isPlayingRef.current) return;

        const currentTime = audioEngine.getCurrentTime();
        if (progressBarRef.current && maxTime > 0) {
          const progress = ((currentTime - startTime) / maxTime) * 100;
          progressBarRef.current.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        }

        while (visualIndex < visualQueue.length && visualQueue[visualIndex].on <= currentTime) {
          const visual = visualQueue[visualIndex];
          visualIndex += 1;
          activeVisualCounts.set(visual.k, (activeVisualCounts.get(visual.k) ?? 0) + 1);
          onKeyVisualAttack(visual.k);
        }

        while (deactivateIndex < visualQueue.length && visualQueue[deactivateIndex].off <= currentTime) {
          const visual = visualQueue[deactivateIndex];
          deactivateIndex += 1;
          const nextCount = (activeVisualCounts.get(visual.k) ?? 1) - 1;

          if (nextCount <= 0) {
            activeVisualCounts.delete(visual.k);
            onKeyVisualRelease(visual.k);
          } else {
            activeVisualCounts.set(visual.k, nextCount);
          }
        }

        if (currentTime - startTime >= maxTime + 0.4) {
          stopAll();
          return;
        }

        visualTimerRef.current = requestAnimationFrame(syncVisuals);
      };

      scheduleAudio();
      visualTimerRef.current = requestAnimationFrame(syncVisuals);
    } catch (error) {
      console.error(error);
      stopAll();
      showToast('播放失敗，請檢查琴譜內容', 'error');
    }
  }, [showToast, stopAll]);

  return {
    isPlaying,
    progressBarRef,
    isPlayingRef,
    playScoreAction,
    stopAll,
    handleKeyActivate,
    handleKeyDeactivate,
  };
}
