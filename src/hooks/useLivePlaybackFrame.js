import { useEffect, useState } from 'react';
import playbackController from '../services/playbackController';
import { usePlayback } from '../contexts/PlaybackContext';

function isSameFrameState(left, right) {
  return (
    left.status === right.status
    && left.generation === right.generation
    && left.currentTick === right.currentTick
    && left.currentTime === right.currentTime
    && left.maxTick === right.maxTick
    && left.maxTime === right.maxTime
    && left.progress === right.progress
    && left.playbackRate === right.playbackRate
    && left.eventsCount === right.eventsCount
  );
}

export function useLivePlaybackFrame(frameIntervalMs = 33) {
  const { playbackState } = usePlayback();
  const [liveState, setLiveState] = useState(() => playbackController.getState());

  useEffect(() => {
    let frameId = 0;
    let lastStateUpdateAt = 0;
    const safeFrameIntervalMs = Math.max(Number(frameIntervalMs) || 0, 0);

    const updateFrame = (timestamp = 0) => {
      const nextState = playbackController.getState();
      const shouldPublish = (
        !nextState.isPlaying
        || timestamp - lastStateUpdateAt >= safeFrameIntervalMs
      );

      if (shouldPublish) {
        lastStateUpdateAt = timestamp;
        setLiveState((prevState) => (isSameFrameState(prevState, nextState) ? prevState : nextState));
      }

      if (nextState.isPlaying) {
        frameId = window.requestAnimationFrame(updateFrame);
      }
    };

    updateFrame();

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    playbackState.generation,
    playbackState.isPaused,
    playbackState.isPlaying,
    playbackState.maxTick,
    playbackState.maxTime,
    playbackState.status,
    frameIntervalMs,
  ]);

  return liveState;
}

export default useLivePlaybackFrame;
