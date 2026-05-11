
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import { applyScoreRecommendation } from '../utils/scoreRecommendations';
import combined4MidiUrl from './scores/combined-4-midi.json?url';
import neoAspectMidiUrl from './scores/neo-aspect-midi.json?url';

/*
const featuredScoreModules = import.meta.glob('../../風物之琴譜/可匯入譜面/第一版/*.txt', {
  eager: false,
  import: 'default',
  query: '?raw',
});
*/

const EXTERNAL_LEGACY_TIMING_MODE = 'absolute';
