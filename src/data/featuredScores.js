import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import { applyScoreRecommendation } from '../utils/scoreRecommendations';
import uchiageHanabiScore from '../../風物之琴譜/可匯入譜面/第一版/打上花火.txt?raw';
import callOfSilenceScore from '../../風物之琴譜/可匯入譜面/第一版/CALL OF SILENCE.txt?raw';
import cryForMeScore from '../../風物之琴譜/可匯入譜面/第一版/CRY FOR ME.txt?raw';
import senbonzakuraScore from '../../風物之琴譜/可匯入譜面/第一版/千本櫻.txt?raw';
import haruhikageScore from '../../風物之琴譜/可匯入譜面/第一版/春日影.txt?raw';
import secretBaseScore from '../../風物之琴譜/可匯入譜面/第一版/未聞花名.txt?raw';
import surgesMidiScore from './scores/surges-midi.json?raw';

const EXTERNAL_LEGACY_TIMING_MODE = 'absolute';
const surgesMidiPayload = JSON.parse(surgesMidiScore);

export const FEATURED_SCORES = [
  {
    id: 'surges-midi',
    title: 'surges-MIDI',
    displayTitle: 'surges-MIDI',
    subtitle: 'MIDI',
    rawText: surgesMidiScore,
    sourceType: SCORE_SOURCE_TYPES.JSON,
    ...DEFAULT_SCORE_PARAMS,
    ...(surgesMidiPayload.transport ?? {}),
    ...(surgesMidiPayload.playback ?? {}),
  },
  applyScoreRecommendation({
    id: 'i-really-want-to-stay-at-your-house',
    title: 'I Really Want to Stay at Your House',
    displayTitle: 'I Really Want to Stay at Your House',
    subtitle: 'Cyberpunk: Edgerunners',
    rawText: DEFAULT_SCORE,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    bpm: 125,
    timeSigNum: 4,
    timeSigDen: 4,
    charResolution: 16,
    globalKeyOffset: 6,
    scaleMode: 'major',
    textNotation: 'keshifu',
    tone: 'piano',
    reverb: true,
  }, { force: true }),
  applyScoreRecommendation({
    id: 'uchiage-hanabi',
    title: '打上花火',
    displayTitle: '打上花火',
    subtitle: 'DAOKO × 米津玄師',
    rawText: uchiageHanabiScore,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
  applyScoreRecommendation({
    id: 'call-of-silence',
    title: 'CALL OF SILENCE',
    displayTitle: 'CALL OF SILENCE',
    subtitle: '進擊的巨人',
    rawText: callOfSilenceScore,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
  applyScoreRecommendation({
    id: 'cry-for-me',
    title: 'CRY FOR ME',
    displayTitle: 'CRY FOR ME',
    subtitle: 'TWICE',
    rawText: cryForMeScore,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
  applyScoreRecommendation({
    id: 'senbonzakura',
    title: '千本櫻',
    displayTitle: '千本櫻',
    subtitle: '初音未來',
    rawText: senbonzakuraScore,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
  applyScoreRecommendation({
    id: 'haruhikage',
    title: '春日影',
    displayTitle: '春日影',
    subtitle: 'MyGO!!!!!',
    rawText: haruhikageScore,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
  applyScoreRecommendation({
    id: 'secret-base',
    title: '未聞花名',
    displayTitle: '未聞花名',
    subtitle: 'secret base ~君がくれたもの~',
    rawText: secretBaseScore,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
];
