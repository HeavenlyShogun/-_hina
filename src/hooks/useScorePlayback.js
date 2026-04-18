import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from '../constants/music';
import { clearActiveKeysDOM, createRippleDOM, toggleKeyDOM } from '../utils/domEffects';
import { parseScoreData } from '../utils/score';

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
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const progressBarRef = useRef(null);
  const schedulerTimerRef = useRef(null);
  const visualTimerRef = useRef(null);
  const isPlayingRef = useRef(false);
  const playbackConfigRef = useRef({
    score,
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
  });

  useEffect(() => {
    playbackConfigRef.current = {
      score,
      bpm,
      timeSigNum,
      timeSigDen,
      charResolution,
    };
  }, [bpm, charResolution, score, timeSigDen, timeSigNum]);

  const clearPlaybackTimers = useCallback(() => {
    if (schedulerTimerRef.current) clearTimeout(schedulerTimerRef.current);
    if (visualTimerRef.current) cancelAnimationFrame(visualTimerRef.current);
    schedulerTimerRef.current = null;
    visualTimerRef.current = null;
  }, []);

  const resetPlaybackVisuals = useCallback(() => {
    clearActiveKeysDOM();
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
  }, []);

  const stopAll = useCallback(() => {
    clearPlaybackTimers();
    stopAllNodes();
    isPlayingRef.current = false;
    setIsPlaying(false);
    resetPlaybackVisuals();
  }, [clearPlaybackTimers, resetPlaybackVisuals, stopAllNodes]);

  useEffect(() => () => {
    stopAll();
  }, [stopAll]);

  const handleKeyActivate = useCallback((keyK) => {
    const activate = () => {
      const info = KEY_INFO_MAP[keyK];
      if (info) triggerNote(info, 0.9);
      toggleKeyDOM(keyK, true);
      createRippleDOM(keyK);
    };

    if (!audioCtx.current || audioCtx.current.state === 'suspended') {
      setupAudio().then(activate);
      return;
    }

    activate();
  }, [audioCtx, setupAudio, triggerNote]);

  const handleKeyDeactivate = useCallback((keyK) => {
    toggleKeyDOM(keyK, false);
  }, []);

  const playScoreAction = useCallback(async () => {
    if (isPlayingRef.current) {
      stopAll();
      return;
    }

    try {
      await setupAudio();

      const config = playbackConfigRef.current;
      const normalizedBpm = Number(config.bpm) || DEFAULT_SCORE_PARAMS.bpm;
      const { events, maxTime } = parseScoreData(
        config.score,
        normalizedBpm,
        config.timeSigNum,
        config.timeSigDen,
        config.charResolution,
      );

      if (!events.length) {
        stopAll();
        showToast('琴譜內容無法解析出任何音符', 'error');
        return;
      }

      isPlayingRef.current = true;
      setIsPlaying(true);

      const startTime = audioCtx.current.currentTime + 0.3;
      const { audioQueue, visualQueue } = buildQueues(events, startTime);
      const activeVisualCounts = new Map();

      let noteIndex = 0;
      let visualIndex = 0;
      let deactivateIndex = 0;

      const scheduleAudio = () => {
        if (!isPlayingRef.current) return;

        const currentTime = audioCtx.current.currentTime;
        while (noteIndex < audioQueue.length && audioQueue[noteIndex].time < currentTime + 0.5) {
          const event = audioQueue[noteIndex];
          noteIndex += 1;
          const info = KEY_INFO_MAP[event.k];
          if (info) triggerNote(info, event.v, event.time, event.durationSec);
        }

        if (noteIndex < audioQueue.length) {
          schedulerTimerRef.current = setTimeout(scheduleAudio, 25);
        }
      };

      const syncVisuals = () => {
        if (!isPlayingRef.current) return;

        const currentTime = audioCtx.current.currentTime;
        if (progressBarRef.current && maxTime > 0) {
          const progress = ((currentTime - startTime) / maxTime) * 100;
          progressBarRef.current.style.width = `${Math.min(100, Math.max(0, progress))}%`;
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
  }, [audioCtx, setupAudio, showToast, stopAll, triggerNote]);

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
