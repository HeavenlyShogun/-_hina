import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from '../constants/music';
import { clearActiveKeysDOM, createRippleDOM, toggleKeyDOM } from '../utils/domEffects';
import { parseScoreData } from '../utils/score';

export function useScorePlayback({ audioCtx, setupAudio, triggerNote, stopAllNodes, score, bpm, timeSigNum, timeSigDen, charResolution, showToast }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const progressBarRef = useRef(null);
  const schedulerTimerRef = useRef(null);
  const visualTimerRef = useRef(null);
  const scoreRef = useRef(score);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

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
  }, [stopAll]);

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

  const handleKeyDeactivate = useCallback((keyK) => {
    toggleKeyDOM(keyK, false);
  }, []);

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
        showToast('譜面中沒有可播放的音符', 'error');
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
      showToast('播放失敗，請檢查譜面格式', 'error');
    }
  }, [audioCtx, bpm, charResolution, setupAudio, showToast, stopAll, timeSigDen, timeSigNum, triggerNote]);

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
