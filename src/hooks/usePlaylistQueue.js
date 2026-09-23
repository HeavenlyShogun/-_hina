import { useCallback, useRef, useState } from 'react';
import { scoreLibraryService } from '../services/scoreLibraryService.js';

const PLAY_MODES = ['sequence', 'loop-all', 'loop-one', 'shuffle'];

export function usePlaylistQueue({ scores = [], loadScoreData, startScore, playbackState, seekToTick, resumePlayback }) {
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playMode, setPlayMode] = useState('sequence');
  const loadRequestRef = useRef(0);

  const addToQueue = useCallback((scoreItem) => {
    if (!scoreItem) return;
    setQueue((current) => [...current, scoreItem]);
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentIndex(-1);
  }, []);

  const removeFromQueue = useCallback((index) => {
    if (index < 0 || index >= queue.length) return;
    setQueue((current) => index < 0 || index >= current.length
      ? current
      : current.filter((_, itemIndex) => itemIndex !== index));
    setCurrentIndex((active) => active === index
      ? -1
      : active > index ? active - 1 : active);
  }, [queue.length]);

  const reorderQueue = useCallback((fromIndex, toIndex) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length || fromIndex === toIndex) return;
    setQueue((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setCurrentIndex((active) => active === fromIndex ? toIndex : fromIndex < active && toIndex >= active ? active - 1 : fromIndex > active && toIndex <= active ? active + 1 : active);
  }, [queue.length]);

  const playQueueIndex = useCallback(async (index) => {
    if (index < 0 || index >= queue.length) return;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const item = queue[index];
    setCurrentIndex(index);
    let scoreData;
    if (typeof item.load === 'function') {
      scoreData = await item.load();
    } else {
      const manifestItem = item.manifestItem ?? item;
      scoreData = await scoreLibraryService.fetchScoreBySlug(item.slug, manifestItem);
      scoreData = { ...item, content: scoreData };
    }
    if (loadRequestRef.current !== requestId) return;
    await loadScoreData(scoreData);
    if (loadRequestRef.current !== requestId) return;
    await startScore();
  }, [loadScoreData, queue, startScore]);

  const playNextScore = useCallback(async ({ automatic = false } = {}) => {
    if (!queue.length) return;
    if (automatic && playMode === 'loop-one') {
      await seekToTick(0);
      await resumePlayback();
      return;
    }

    let nextIndex = currentIndex + 1;
    if (playMode === 'shuffle' && queue.length > 1) {
      const candidates = queue.map((_, index) => index).filter((index) => index !== currentIndex);
      nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
    } else if (nextIndex >= queue.length) {
      if (playMode !== 'loop-all') return;
      nextIndex = 0;
    }
    await playQueueIndex(nextIndex);
  }, [currentIndex, playMode, playQueueIndex, queue, resumePlayback, seekToTick]);

  const playPrevScore = useCallback(async () => {
    if (Number(playbackState?.currentTime) > 3) {
      await seekToTick(0);
      return;
    }
    if (queue.length) {
      const previousIndex = currentIndex > 0 ? currentIndex - 1 : playMode === 'loop-all' ? queue.length - 1 : -1;
      if (previousIndex >= 0) await playQueueIndex(previousIndex);
    }
  }, [currentIndex, playMode, playQueueIndex, playbackState?.currentTime, queue.length, seekToTick]);

  const changePlayMode = useCallback((mode) => {
    if (PLAY_MODES.includes(mode)) setPlayMode(mode);
  }, []);

  return { queue, currentIndex, playMode, playModes: PLAY_MODES, scores, addToQueue, removeFromQueue, reorderQueue, clearQueue, changePlayMode, playQueueIndex, playNextScore, playPrevScore };
}

export default usePlaylistQueue;
