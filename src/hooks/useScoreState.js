import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';

const DEFAULT_TITLE = '未命名曲譜';

function createDefaultState() {
  return {
    score: DEFAULT_SCORE,
    scoreTitle: DEFAULT_TITLE,
    vol: 0.65,
    reverb: DEFAULT_SCORE_PARAMS.reverb,
    globalKeyOffset: DEFAULT_SCORE_PARAMS.globalKeyOffset,
    accidentals: DEFAULT_SCORE_PARAMS.accidentals,
    tone: DEFAULT_SCORE_PARAMS.tone,
    bpm: DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: DEFAULT_SCORE_PARAMS.charResolution,
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
      bpm: saved.bpm ?? DEFAULT_SCORE_PARAMS.bpm,
      timeSigNum: saved.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum,
      timeSigDen: saved.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen,
      charResolution: saved.charResolution ?? DEFAULT_SCORE_PARAMS.charResolution,
      globalKeyOffset: saved.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
      accidentals: saved.accidentals ?? DEFAULT_SCORE_PARAMS.accidentals,
      tone: saved.tone ?? DEFAULT_SCORE_PARAMS.tone,
      reverb: saved.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
    }));
  }, []);

  const resetScoreState = useCallback(() => {
    setState(createDefaultState());
  }, []);

  const currentScoreParams = useMemo(() => ({
    bpm: Number(state.bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: state.timeSigNum,
    timeSigDen: state.timeSigDen,
    charResolution: state.charResolution,
    globalKeyOffset: state.globalKeyOffset,
    accidentals: state.accidentals,
    tone: state.tone,
    reverb: state.reverb,
  }), [state.accidentals, state.bpm, state.charResolution, state.globalKeyOffset, state.reverb, state.timeSigDen, state.timeSigNum, state.tone]);

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
