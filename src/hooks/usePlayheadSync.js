import { useEffect } from 'react';
import playbackController from '../services/playbackController';
import { usePlayback } from '../contexts/PlaybackContext';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setPlayheadPosition(playheadElement, ratio) {
  if (!playheadElement) {
    return;
  }

  const safeRatio = clamp(Number(ratio) || 0, 0, 1);
  playheadElement.style.left = `${safeRatio * 100}%`;
}

export function usePlayheadSync(playheadRef) {
  const { playbackState } = usePlayback();

  useEffect(() => {
    const playheadElement = playheadRef.current;
    if (!playheadElement) {
      return undefined;
    }

    let frameId = 0;

    const renderFrame = () => {
      const state = playbackController.getState();
      const maxTick = Math.max(Number(state.maxTick) || 0, 1);
      const currentTick = clamp(Number(state.currentTick) || 0, 0, maxTick);
      const ratio = maxTick > 0 ? currentTick / maxTick : 0;

      setPlayheadPosition(playheadElement, ratio);
      playheadElement.dataset.tick = String(Math.round(currentTick));

      if (state.isPlaying) {
        frameId = window.requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    if (playbackState.isPlaying) {
      frameId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    playheadRef,
    playbackState.currentTick,
    playbackState.isPaused,
    playbackState.isPlaying,
    playbackState.maxTick,
    playbackState.status,
  ]);
}

export default usePlayheadSync;
