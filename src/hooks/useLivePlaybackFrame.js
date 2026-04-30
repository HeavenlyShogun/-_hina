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

export function useLivePlaybackFrame() {
  const { playbackState } = usePlayback();
  const [liveState, setLiveState] = useState(() => playbackController.getState());

  useEffect(() => {
    let frameId = 0;

    const updateFrame = () => {
      const nextState = playbackController.getState();
      setLiveState((prevState) => (isSameFrameState(prevState, nextState) ? prevState : nextState));

      if (nextState.isPlaying) {
        frameId = window.requestAnimationFrame(updateFrame);
      }
    };

    updateFrame();

    if (playbackState.isPlaying) {
      frameId = window.requestAnimationFrame(updateFrame);
    }

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
  ]);

  return liveState;
}

export default useLivePlaybackFrame;
