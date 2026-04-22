import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';

const DEFAULT_SCORE_TITLE = '未命名琴譜';
const DEFAULT_VOLUME = 0.6;

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAccidentals(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function extractScoreParams(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return {};
  }

  return {
    bpm: content.transport?.bpm,
    timeSigNum: content.transport?.timeSigNum,
    timeSigDen: content.transport?.timeSigDen,
    tone: content.playback?.tone,
    globalKeyOffset: content.playback?.globalKeyOffset,
    reverb: content.playback?.reverb,
  };
}

function resolveScoreState(source = {}) {
  const score = source.content ?? DEFAULT_SCORE;
  const extracted = extractScoreParams(score);
  const title =
    String(source.title ?? score?.meta?.title ?? DEFAULT_SCORE_TITLE).trim() || DEFAULT_SCORE_TITLE;

  return {
    score,
    scoreTitle: title,
    bpm: parseNumber(source.bpm ?? extracted.bpm, DEFAULT_SCORE_PARAMS.bpm),
    timeSigNum: parseNumber(source.timeSigNum ?? extracted.timeSigNum, DEFAULT_SCORE_PARAMS.timeSigNum),
    timeSigDen: parseNumber(source.timeSigDen ?? extracted.timeSigDen, DEFAULT_SCORE_PARAMS.timeSigDen),
    charResolution: parseNumber(source.charResolution, DEFAULT_SCORE_PARAMS.charResolution),
    globalKeyOffset: parseNumber(
      source.globalKeyOffset ?? extracted.globalKeyOffset,
      DEFAULT_SCORE_PARAMS.globalKeyOffset,
    ),
    accidentals: normalizeAccidentals(source.accidentals),
    tone: source.tone ?? extracted.tone ?? DEFAULT_SCORE_PARAMS.tone,
    reverb: source.reverb ?? extracted.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
  };
}

export function useScoreState() {
  const [score, setScore] = useState(DEFAULT_SCORE);
  const [scoreTitle, setScoreTitle] = useState(DEFAULT_SCORE_TITLE);
  const [vol, setVol] = useState(DEFAULT_VOLUME);
  const [bpm, setBpm] = useState(DEFAULT_SCORE_PARAMS.bpm);
  const [timeSigNum, setTimeSigNum] = useState(DEFAULT_SCORE_PARAMS.timeSigNum);
  const [timeSigDen, setTimeSigDen] = useState(DEFAULT_SCORE_PARAMS.timeSigDen);
  const [charResolution, setCharResolution] = useState(DEFAULT_SCORE_PARAMS.charResolution);
  const [globalKeyOffset, setGlobalKeyOffset] = useState(DEFAULT_SCORE_PARAMS.globalKeyOffset);
  const [accidentals, setAccidentals] = useState(DEFAULT_SCORE_PARAMS.accidentals);
  const [tone, setTone] = useState(DEFAULT_SCORE_PARAMS.tone);
  const [reverb, setReverb] = useState(DEFAULT_SCORE_PARAMS.reverb);

  const applyResolvedState = useCallback((nextState) => {
    setScore(nextState.score);
    setScoreTitle(nextState.scoreTitle);
    setBpm(nextState.bpm);
    setTimeSigNum(nextState.timeSigNum);
    setTimeSigDen(nextState.timeSigDen);
    setCharResolution(nextState.charResolution);
    setGlobalKeyOffset(nextState.globalKeyOffset);
    setAccidentals(nextState.accidentals);
    setTone(nextState.tone);
    setReverb(nextState.reverb);
  }, []);

  const loadScoreSource = useCallback((source) => {
    applyResolvedState(resolveScoreState(source));
  }, [applyResolvedState]);

  const applySavedScore = useCallback((savedScore) => {
    applyResolvedState(resolveScoreState(savedScore));
  }, [applyResolvedState]);

  const resetScoreState = useCallback(() => {
    applyResolvedState(resolveScoreState());
  }, [applyResolvedState]);

  const currentScoreParams = useMemo(() => ({
    bpm,
    timeSigNum,
    timeSigDen,
    charResolution,
    globalKeyOffset,
    accidentals,
    tone,
    reverb,
  }), [accidentals, bpm, charResolution, globalKeyOffset, reverb, timeSigDen, timeSigNum, tone]);

  return {
    score,
    setScore,
    scoreTitle,
    setScoreTitle,
    vol,
    setVol,
    reverb,
    setReverb,
    globalKeyOffset,
    setGlobalKeyOffset,
    accidentals,
    setAccidentals,
    tone,
    setTone,
    bpm,
    setBpm,
    timeSigNum,
    setTimeSigNum,
    timeSigDen,
    setTimeSigDen,
    charResolution,
    setCharResolution,
    currentScoreParams,
    loadScoreSource,
    applySavedScore,
    resetScoreState,
  };
}
