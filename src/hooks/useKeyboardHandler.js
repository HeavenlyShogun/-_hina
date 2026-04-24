import { useEffect, useRef } from 'react';
import { mapKey } from '../constants/music';
import audioEngine from '../services/audioEngine';

function isTypingTarget(target) {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useKeyboardHandler({
  playHotkey,
  isPlaying,
  onTogglePlay,
  onKeyDown,
  onKeyUp,
  getNotePlayback,
}) {
  const stateRef = useRef({
    playHotkey,
    isPlaying,
    onTogglePlay,
    onKeyDown,
    onKeyUp,
    getNotePlayback,
  });

  useEffect(() => {
    stateRef.current = {
      playHotkey,
      isPlaying,
      onTogglePlay,
      onKeyDown,
      onKeyUp,
      getNotePlayback,
    };
  }, [getNotePlayback, isPlaying, onKeyDown, onKeyUp, onTogglePlay, playHotkey]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const current = stateRef.current;

      if (isTypingTarget(event.target)) {
        return;
      }

      if (current.playHotkey !== 'None' && event.code === current.playHotkey) {
        event.preventDefault();
        current.onTogglePlay?.();
        return;
      }

      if (event.repeat || current.isPlaying) {
        return;
      }

      const mappedKey = mapKey(event.key);
      if (!mappedKey) {
        return;
      }

      const notePlayback = current.getNotePlayback?.(mappedKey);
      if (!notePlayback?.frequency) {
        return;
      }

      event.preventDefault();
      current.onKeyDown?.(mappedKey);
      void audioEngine.resume();
      audioEngine.scheduleNote(
        notePlayback.frequency,
        audioEngine.getCurrentTime() + 0.01,
        notePlayback.duration ?? 0.35,
        notePlayback.toneConfig ?? {},
      );
    };

    const handleKeyUp = (event) => {
      const mappedKey = mapKey(event.key);
      if (!mappedKey) {
        return;
      }

      stateRef.current.onKeyUp?.(mappedKey);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
}
