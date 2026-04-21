import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';

const DEFAULT_TITLE = '未命名琴譜';

function normalizeScoreParams(source = {}) {
  return {
    bpm: Number(source.bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: source.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: source.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: source.charResolution ?? DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: source.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
    accidentals: source.accidentals ?? DEFAULT_SCORE_PARAMS.accidentals,
    tone: source.tone ?? DEFAULT_SCORE_PARAMS.tone,
    reverb: source.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
  };
}

function createDefaultState() {
  return {
    score: DEFAULT_SCORE,
    scoreTitle: DEFAULT_TITLE,
    vol: 0.65,
    ...normalizeScoreParams(DEFAULT_SCORE_PARAMS),
  };
}

export function useScoreState() {
  const [state, setState] = useState(createDefaultState);

  const setField = useCallback((field, valueOrUpdater) => {
    setState((prev) => ({
      ...prev,
      [field]: typeof valueOrUpdater === 'function' ? valueOrUpdater(prev[field]) : valueOrUpdater,
    }));
  }, []);

  const applySavedScore = useCallback((saved) => {
    setState((prev) => ({
      ...prev,
      score: saved.content,
      scoreTitle: saved.title,
      ...normalizeScoreParams(saved),
    }));
  }, []);

  const resetScoreState = useCallback(() => {
    setState(createDefaultState());
  }, []);

  const currentScoreParams = useMemo(() => normalizeScoreParams(state), [state]);

  return {
    ...state,
    currentScoreParams,
    setScore: useCallback((value) => setField('score', value), [setField]),
    setScoreTitle: useCallback((value) => setField('scoreTitle', value), [setField]),
    setVol: useCallback((value) => setField('vol', value), [setField]),
    setReverb: useCallback((value) => setField('reverb', value), [setField]),
    setGlobalKeyOffset: useCallback((value) => setField('globalKeyOffset', value), [setField]),
    setAccidentals: useCallback((value) => setField('accidentals', value), [setField]),
    setTone: useCallback((value) => setField('tone', value), [setField]),
    setBpm: useCallback((value) => setField('bpm', value), [setField]),
    setTimeSigNum: useCallback((value) => setField('timeSigNum', value), [setField]),
    setTimeSigDen: useCallback((value) => setField('timeSigDen', value), [setField]),
    setCharResolution: useCallback((value) => setField('charResolution', value), [setField]),
    applySavedScore,
    resetScoreState,
  };
}
