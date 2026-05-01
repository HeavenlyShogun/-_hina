import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { createScoreDocument, SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import { applyScoreRecommendation } from '../utils/scoreRecommendations';

const DEFAULT_SCORE_TITLE = '未命名琴譜';

function createDefaultState() {
  return createScoreDocument(applyScoreRecommendation({
    title: DEFAULT_SCORE_TITLE,
    rawText: DEFAULT_SCORE,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
  }, { force: true }));
}

export function useScoreState() {
  const [scoreDocument, setScoreDocument] = useState(createDefaultState);

  const updateScoreDocument = useCallback((updater) => {
    setScoreDocument((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      return createScoreDocument(next);
    });
  }, []);

  const setScore = useCallback((rawText) => {
    updateScoreDocument((prev) => ({
      ...prev,
      rawText: typeof rawText === 'function' ? rawText(prev.rawText) : rawText,
    }));
  }, [updateScoreDocument]);

  const setScoreTitle = useCallback((title) => {
    updateScoreDocument((prev) => ({
      ...prev,
      title: typeof title === 'function' ? title(prev.title) : title,
    }));
  }, [updateScoreDocument]);

  const setBpm = useCallback((valueOrUpdater) => {
    updateScoreDocument((prev) => ({
      ...prev,
      bpm: typeof valueOrUpdater === 'function' ? valueOrUpdater(prev.bpm) : valueOrUpdater,
    }));
  }, [updateScoreDocument]);

  const setTimeSigNum = useCallback((valueOrUpdater) => {
    updateScoreDocument((prev) => ({
      ...prev,
      timeSigNum:
        typeof valueOrUpdater === 'function' ? valueOrUpdater(prev.timeSigNum) : valueOrUpdater,
    }));
  }, [updateScoreDocument]);

  const setTimeSigDen = useCallback((valueOrUpdater) => {
    updateScoreDocument((prev) => ({
      ...prev,
      timeSigDen:
        typeof valueOrUpdater === 'function' ? valueOrUpdater(prev.timeSigDen) : valueOrUpdater,
    }));
  }, [updateScoreDocument]);

  const setCharResolution = useCallback((valueOrUpdater) => {
    updateScoreDocument((prev) => ({
      ...prev,
      charResolution:
        typeof valueOrUpdater === 'function'
          ? valueOrUpdater(prev.charResolution)
          : valueOrUpdater,
    }));
  }, [updateScoreDocument]);

  const setGlobalKeyOffset = useCallback((valueOrUpdater) => {
    updateScoreDocument((prev) => ({
      ...prev,
      globalKeyOffset:
        typeof valueOrUpdater === 'function'
          ? valueOrUpdater(prev.globalKeyOffset)
          : valueOrUpdater,
    }));
  }, [updateScoreDocument]);

  const setAccidentals = useCallback((nextValue) => {
    updateScoreDocument((prev) => ({
      ...prev,
      accidentals: typeof nextValue === 'function' ? nextValue(prev.accidentals) : nextValue,
    }));
  }, [updateScoreDocument]);

  const setScaleMode = useCallback((valueOrUpdater) => {
    updateScoreDocument((prev) => ({
      ...prev,
      scaleMode:
        typeof valueOrUpdater === 'function' ? valueOrUpdater(prev.scaleMode) : valueOrUpdater,
    }));
  }, [updateScoreDocument]);

  const setTone = useCallback((valueOrUpdater) => {
    updateScoreDocument((prev) => ({
      ...prev,
      tone: typeof valueOrUpdater === 'function' ? valueOrUpdater(prev.tone) : valueOrUpdater,
    }));
  }, [updateScoreDocument]);

  const setReverb = useCallback((nextValue) => {
    updateScoreDocument((prev) => ({
      ...prev,
      reverb: typeof nextValue === 'function' ? nextValue(prev.reverb) : nextValue,
    }));
  }, [updateScoreDocument]);

  const setReferences = useCallback((nextValue) => {
    updateScoreDocument((prev) => ({
      ...prev,
      references: typeof nextValue === 'function' ? nextValue(prev.references ?? []) : nextValue,
    }));
  }, [updateScoreDocument]);

  const setReferenceNotes = useCallback((nextValue) => {
    updateScoreDocument((prev) => ({
      ...prev,
      referenceNotes:
        typeof nextValue === 'function'
          ? nextValue(prev.referenceNotes ?? '')
          : nextValue,
    }));
  }, [updateScoreDocument]);

  const loadScoreSource = useCallback((source) => {
    setScoreDocument(createScoreDocument(applyScoreRecommendation(source)));
  }, []);

  const applySavedScore = useCallback((savedScore) => {
    setScoreDocument(createScoreDocument(applyScoreRecommendation(savedScore)));
  }, []);

  const resetScoreState = useCallback(() => {
    setScoreDocument(createDefaultState());
  }, []);

  const currentScoreParams = useMemo(() => ({
    bpm: scoreDocument.bpm,
    timeSigNum: scoreDocument.timeSigNum,
    timeSigDen: scoreDocument.timeSigDen,
    charResolution: scoreDocument.charResolution,
    globalKeyOffset: scoreDocument.globalKeyOffset,
    accidentals: scoreDocument.accidentals,
    scaleMode: scoreDocument.scaleMode,
    tone: scoreDocument.tone,
    reverb: scoreDocument.reverb,
    sourceType: scoreDocument.sourceType,
    legacyTimingMode: scoreDocument.legacyTimingMode,
  }), [scoreDocument]);

  return {
    score: scoreDocument.rawText,
    setScore,
    scoreTitle: scoreDocument.title,
    setScoreTitle,
    scoreDocument,
    updateScoreDocument,
    reverb: scoreDocument.reverb,
    setReverb,
    references: scoreDocument.references ?? [],
    setReferences,
    referenceNotes: scoreDocument.referenceNotes ?? '',
    setReferenceNotes,
    globalKeyOffset: scoreDocument.globalKeyOffset,
    setGlobalKeyOffset,
    accidentals: scoreDocument.accidentals,
    setAccidentals,
    scaleMode: scoreDocument.scaleMode,
    setScaleMode,
    tone: scoreDocument.tone,
    setTone,
    bpm: scoreDocument.bpm,
    setBpm,
    timeSigNum: scoreDocument.timeSigNum,
    setTimeSigNum,
    timeSigDen: scoreDocument.timeSigDen,
    setTimeSigDen,
    charResolution: scoreDocument.charResolution,
    setCharResolution,
    currentScoreParams,
    loadScoreSource,
    applySavedScore,
    resetScoreState,
  };
}
