import { useCallback, useEffect, useMemo, useRef } from 'react';
import { KEY_INFO_MAP, mapKey } from '../constants/music';
import playbackController from '../services/playbackController';
import { normalizeScoreSource, PPQ } from '../utils/score';
import { parseScoreContent, SCORE_SOURCE_TYPES } from '../utils/scoreDocument';

const DEFAULT_PERFECT_WINDOW_TICKS = 40;
const DEFAULT_HIT_WINDOW_TICKS = 120;
const EMPTY_NOTE_INDEX = Object.freeze({
  notes: [],
  startTicks: [],
  totalNotes: 0,
  totalMeasures: 0,
  measureTicks: PPQ * 4,
  notesPerMeasure: Object.freeze({}),
});
const KEYBOARD_KEYMAP = Object.freeze(
  Object.fromEntries(
    Object.values(KEY_INFO_MAP).map((keyInfo) => [
      keyInfo.k,
      {
        keyboardKey: keyInfo.k.toUpperCase(),
        key: keyInfo.k,
        noteName: keyInfo.n,
        frequency: keyInfo.f,
      },
    ]),
  ),
);

function isTypingTarget(target) {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function lowerBound(values, target) {
  let left = 0;
  let right = values.length;

  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (values[middle] < target) {
      left = middle + 1;
      continue;
    }

    right = middle;
  }

  return left;
}

function buildScoreInput(scoreDocument) {
  if (!scoreDocument) {
    return null;
  }

  if (typeof scoreDocument === 'string') {
    return scoreDocument;
  }

  if (typeof scoreDocument.rawText === 'string') {
    return parseScoreContent(
      scoreDocument.rawText,
      scoreDocument.sourceType ?? SCORE_SOURCE_TYPES.TEXT,
    );
  }

  if (scoreDocument.content && typeof scoreDocument.content === 'object') {
    return scoreDocument.content;
  }

  return null;
}

function resolveMeasureTicks(playback = {}) {
  const resolution = Math.max(Number(playback?.resolution) || PPQ, 1);
  const timeSigNum = Math.max(Number(playback?.timeSigNum) || 4, 1);
  const timeSigDen = Math.max(Number(playback?.timeSigDen) || 4, 1);
  const beatTicks = Math.max(Math.round((resolution * 4) / timeSigDen), 1);

  return Math.max(beatTicks * timeSigNum, beatTicks);
}

function classifyGrade(absDeltaTicks, perfectWindowTicks, hitWindowTicks) {
  if (absDeltaTicks <= perfectWindowTicks) {
    return 'PERFECT';
  }

  if (absDeltaTicks <= hitWindowTicks) {
    return 'GOOD';
  }

  return null;
}

function createNoteId(event, index) {
  const tick = Math.max(0, Math.round(Number(event?.tick) || 0));
  const key = event?.k ?? 'unknown';
  const trackId = event?.trackId ?? 'main';

  return event?.id ?? `${trackId}:${tick}:${key}:${index}`;
}

function buildNoteIndex(scoreDocument) {
  if (!scoreDocument) {
    return EMPTY_NOTE_INDEX;
  }

  try {
    const scoreInput = buildScoreInput(scoreDocument);
    if (scoreInput == null) {
      return EMPTY_NOTE_INDEX;
    }

    const normalized = normalizeScoreSource(scoreInput, {
      bpm: scoreDocument.bpm,
      timeSigNum: scoreDocument.timeSigNum,
      timeSigDen: scoreDocument.timeSigDen,
      charResolution: scoreDocument.charResolution,
      legacyTimingMode: scoreDocument.legacyTimingMode,
      textNotation: scoreDocument.textNotation,
    });
    const measureTicks = resolveMeasureTicks(normalized.playback);
    const notesPerMeasure = {};
    const notes = normalized.events
      .filter((event) => !event?.isRest && event?.k)
      .map((event, index) => {
        const keyInfo = KEY_INFO_MAP[event.k];
        const startTick = Math.max(0, Math.round(Number(event.tick) || 0));
        const durationTicks = Math.max(1, Math.round(Number(event.durationTicks) || 1));
        const measureIndex = Math.floor(startTick / measureTicks);

        notesPerMeasure[measureIndex] = (notesPerMeasure[measureIndex] || 0) + 1;

        return {
          id: createNoteId(event, index),
          key: event.k,
          noteName: event.noteName ?? keyInfo?.n ?? event.k,
          startTick,
          durationTicks,
          endTick: startTick + durationTicks,
          trackId: event.trackId ?? 'main',
          measureIndex,
        };
      });
    const maxTick = notes.reduce(
      (currentMax, note) => Math.max(currentMax, note.endTick),
      0,
    );

    return {
      notes,
      startTicks: notes.map((note) => note.startTick),
      totalNotes: notes.length,
      totalMeasures: notes.length > 0 ? Math.max(Math.ceil(maxTick / measureTicks), 1) : 0,
      measureTicks,
      notesPerMeasure,
    };
  } catch (error) {
    console.warn('useKeyboardMatcher: failed to build note index.', error);
    return EMPTY_NOTE_INDEX;
  }
}

function findMatchingNote({
  noteIndex,
  key,
  currentTick,
  hitWindowTicks,
  resolvedNoteIds,
}) {
  if (!noteIndex.notes.length) {
    return null;
  }

  const minTick = currentTick - hitWindowTicks;
  const maxTick = currentTick + hitWindowTicks;
  const startIndex = lowerBound(noteIndex.startTicks, minTick);
  const endIndex = lowerBound(noteIndex.startTicks, maxTick + 1);

  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = startIndex; index < endIndex; index += 1) {
    const note = noteIndex.notes[index];
    if (note.key !== key || resolvedNoteIds.has(note.id)) {
      continue;
    }

    const distance = Math.abs(note.startTick - currentTick);
    if (distance > bestDistance) {
      continue;
    }

    if (
      distance === bestDistance &&
      bestMatch &&
      note.startTick >= bestMatch.startTick
    ) {
      continue;
    }

    bestMatch = note;
    bestDistance = distance;
  }

  return bestMatch;
}

function createJudgementPayload(note, {
  grade,
  currentTick,
  hitWindowTicks,
}) {
  const deltaTicks = Math.round(currentTick - note.startTick);

  return {
    ...note,
    type: grade === 'MISS' ? 'miss' : 'hit',
    grade,
    currentTick,
    deltaTicks,
    absDeltaTicks: Math.abs(deltaTicks),
    windowTicks: hitWindowTicks,
    judgedAt: Date.now(),
  };
}

export default function useKeyboardMatcher({
  scoreDocument,
  playbackState,
  playHotkey = 'Space',
  onTogglePlay,
  onKeyActivate,
  onKeyDeactivate,
  onJudge,
  perfectWindowTicks = DEFAULT_PERFECT_WINDOW_TICKS,
  hitWindowTicks = DEFAULT_HIT_WINDOW_TICKS,
  enabled = true,
  controller = playbackController,
}) {
  const noteIndex = useMemo(() => buildNoteIndex(scoreDocument), [scoreDocument]);
  const pressedKeysRef = useRef(new Set());
  const hitNoteIdsRef = useRef(new Set());
  const resolvedNoteIdsRef = useRef(new Set());
  const missCursorRef = useRef(0);
  const lastObservedTickRef = useRef(0);
  const rafIdRef = useRef(0);
  const stateRef = useRef({
    controller,
    enabled,
    playHotkey,
    onTogglePlay,
    onKeyActivate,
    onKeyDeactivate,
    onJudge,
    perfectWindowTicks,
    hitWindowTicks,
    noteIndex,
  });

  useEffect(() => {
    stateRef.current = {
      controller,
      enabled,
      playHotkey,
      onTogglePlay,
      onKeyActivate,
      onKeyDeactivate,
      onJudge,
      perfectWindowTicks,
      hitWindowTicks,
      noteIndex,
    };
  }, [
    controller,
    enabled,
    hitWindowTicks,
    noteIndex,
    onJudge,
    onKeyActivate,
    onKeyDeactivate,
    onTogglePlay,
    perfectWindowTicks,
    playHotkey,
  ]);

  const resetPracticeState = useCallback((targetTick = 0) => {
    const safeTick = Math.max(Math.round(Number(targetTick) || 0), 0);
    const currentWindow = Math.max(
      1,
      Math.round(Number(stateRef.current.hitWindowTicks) || DEFAULT_HIT_WINDOW_TICKS),
    );
    const cursorTick = Math.max(safeTick - currentWindow, 0);

    hitNoteIdsRef.current.clear();
    resolvedNoteIdsRef.current.clear();
    missCursorRef.current = lowerBound(stateRef.current.noteIndex.startTicks, cursorTick);
  }, []);

  useEffect(() => {
    resetPracticeState(0);
    lastObservedTickRef.current = 0;
  }, [noteIndex, resetPracticeState]);

  useEffect(() => {
    const currentTick = Math.max(0, Math.round(Number(playbackState?.currentTick) || 0));
    const lastTick = lastObservedTickRef.current;
    const rewound = currentTick + hitWindowTicks < lastTick;
    const restarted = playbackState?.status === 'stopped' && currentTick === 0 && lastTick > 0;

    if (rewound || restarted) {
      resetPracticeState(currentTick);
    }

    lastObservedTickRef.current = currentTick;
  }, [hitWindowTicks, playbackState?.currentTick, playbackState?.status, resetPracticeState]);

  useEffect(() => {
    const scanMisses = () => {
      const current = stateRef.current;

      if (current.enabled && current.onJudge && current.noteIndex.notes.length > 0) {
        const currentTick = Math.max(0, Math.round(Number(current.controller.getCurrentTick()) || 0));
        const notes = current.noteIndex.notes;
        let cursor = missCursorRef.current;

        while (cursor < notes.length) {
          const note = notes[cursor];
          if (note.startTick + current.hitWindowTicks >= currentTick) {
            break;
          }

          if (!resolvedNoteIdsRef.current.has(note.id)) {
            resolvedNoteIdsRef.current.add(note.id);
            current.onJudge?.(createJudgementPayload(note, {
              grade: 'MISS',
              currentTick,
              hitWindowTicks: current.hitWindowTicks,
            }));
          }

          cursor += 1;
        }

        missCursorRef.current = cursor;
      }

      rafIdRef.current = window.requestAnimationFrame(scanMisses);
    };

    rafIdRef.current = window.requestAnimationFrame(scanMisses);

    return () => {
      window.cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  useEffect(() => {
    const releasePressedKeys = () => {
      const { onKeyDeactivate: currentOnKeyDeactivate } = stateRef.current;
      if (!pressedKeysRef.current.size) {
        return;
      }

      pressedKeysRef.current.forEach((key) => {
        currentOnKeyDeactivate?.(key);
      });
      pressedKeysRef.current.clear();
    };

    const handleKeyDown = (event) => {
      const current = stateRef.current;

      if (event.code === 'Escape') {
        const activeElement = document.activeElement;
        if (activeElement && typeof activeElement.blur === 'function' && isTypingTarget(activeElement)) {
          activeElement.blur();
          event.preventDefault();
        }
        return;
      }

      if (!current.enabled || isTypingTarget(event.target)) {
        return;
      }

      if (current.playHotkey !== 'None' && event.code === current.playHotkey) {
        event.preventDefault();
        current.onTogglePlay?.();
        return;
      }

      if (event.repeat) {
        return;
      }

      const mappedKey = mapKey(event.key);
      if (!mappedKey || pressedKeysRef.current.has(mappedKey)) {
        return;
      }

      event.preventDefault();
      pressedKeysRef.current.add(mappedKey);
      current.onKeyActivate?.(mappedKey);

      if (!current.onJudge) {
        return;
      }

      const currentTick = Math.max(0, Math.round(Number(current.controller.getCurrentTick()) || 0));
      const matchedNote = findMatchingNote({
        noteIndex: current.noteIndex,
        key: mappedKey,
        currentTick,
        hitWindowTicks: Math.max(1, Math.round(Number(current.hitWindowTicks) || DEFAULT_HIT_WINDOW_TICKS)),
        resolvedNoteIds: resolvedNoteIdsRef.current,
      });

      if (!matchedNote) {
        return;
      }

      const deltaTicks = Math.round(currentTick - matchedNote.startTick);
      const absDeltaTicks = Math.abs(deltaTicks);
      const grade = classifyGrade(
        absDeltaTicks,
        current.perfectWindowTicks,
        current.hitWindowTicks,
      );

      if (!grade) {
        return;
      }

      resolvedNoteIdsRef.current.add(matchedNote.id);
      hitNoteIdsRef.current.add(matchedNote.id);
      current.onJudge?.(createJudgementPayload(matchedNote, {
        grade,
        currentTick,
        hitWindowTicks: current.hitWindowTicks,
      }));
    };

    const handleKeyUp = (event) => {
      const mappedKey = mapKey(event.key);
      if (!mappedKey || !pressedKeysRef.current.has(mappedKey)) {
        return;
      }

      pressedKeysRef.current.delete(mappedKey);
      stateRef.current.onKeyDeactivate?.(mappedKey);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releasePressedKeys);

    return () => {
      releasePressedKeys();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releasePressedKeys);
    };
  }, []);

  return {
    keymap: KEYBOARD_KEYMAP,
    indexedNotesCount: noteIndex.totalNotes,
    practiceMeta: {
      totalNotes: noteIndex.totalNotes,
      totalMeasures: noteIndex.totalMeasures,
      measureTicks: noteIndex.measureTicks,
      notesPerMeasure: noteIndex.notesPerMeasure,
      perfectWindowTicks,
      goodWindowTicks: hitWindowTicks,
    },
    clearMatchedNotes: resetPracticeState,
    resetPracticeState,
  };
}
