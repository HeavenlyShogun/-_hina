import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { createScoreDocument, SCORE_SOURCE_TYPES } from '../utils/scoreDocument';

const DEFAULT_SCORE_TITLE = '未命名琴譜';
const DEFAULT_VOLUME = 0.6;

function createDefaultState() {
  return createScoreDocument({
    title: DEFAULT_SCORE_TITLE,
    rawText: DEFAULT_SCORE,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
  });
}

export function useScoreState() {
  const [scoreDocument, setScoreDocument] = useState(createDefaultState);
  const [vol, setVol] = useState(DEFAULT_VOLUME);

  const updateScoreDocument = useCallback((updater) => {
    setScoreDocument((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      return createScoreDocument(next);
    });
  }, []);

  const setScore = useCallback((rawText) => {
    updateScoreDocument((prev) => ({ ...prev, rawText }));
  }, [updateScoreDocument]);

  const setScoreTitle = useCallback((title) => {
    updateScoreDocument((prev) => ({ ...prev, title }));
  }, [updateScoreDocument]);

  const setBpm = useCallback((bpm) => {
    updateScoreDocument((prev) => ({ ...prev, bpm }));
  }, [updateScoreDocument]);

  const setTimeSigNum = useCallback((timeSigNum) => {
    updateScoreDocument((prev) => ({ ...prev, timeSigNum }));
  }, [updateScoreDocument]);

  const setTimeSigDen = useCallback((timeSigDen) => {
    updateScoreDocument((prev) => ({ ...prev, timeSigDen }));
  }, [updateScoreDocument]);

  const setCharResolution = useCallback((charResolution) => {
    updateScoreDocument((prev) => ({ ...prev, charResolution }));
  }, [updateScoreDocument]);

  const setGlobalKeyOffset = useCallback((globalKeyOffset) => {
    updateScoreDocument((prev) => ({ ...prev, globalKeyOffset }));
  }, [updateScoreDocument]);

  const setAccidentals = useCallback((nextValue) => {
    updateScoreDocument((prev) => ({
      ...prev,
      accidentals: typeof nextValue === 'function' ? nextValue(prev.accidentals) : nextValue,
    }));
  }, [updateScoreDocument]);

  const setScaleMode = useCallback((scaleMode) => {
    updateScoreDocument((prev) => ({ ...prev, scaleMode }));
  }, [updateScoreDocument]);

  const setTone = useCallback((tone) => {
    updateScoreDocument((prev) => ({ ...prev, tone }));
  }, [updateScoreDocument]);

  const setReverb = useCallback((nextValue) => {
    updateScoreDocument((prev) => ({
      ...prev,
      reverb: typeof nextValue === 'function' ? nextValue(prev.reverb) : nextValue,
    }));
  }, [updateScoreDocument]);

  const loadScoreSource = useCallback((source) => {
    setScoreDocument(createScoreDocument(source));
  }, []);

  const applySavedScore = useCallback((savedScore) => {
    setScoreDocument(createScoreDocument(savedScore));
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
  }), [scoreDocument]);

  return {
    score: scoreDocument.rawText,
    setScore,
    scoreTitle: scoreDocument.title,
    setScoreTitle,
    scoreDocument,
    updateScoreDocument,
    vol,
    setVol,
    reverb: scoreDocument.reverb,
    setReverb,
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
