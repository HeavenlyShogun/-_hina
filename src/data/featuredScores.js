import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import { applyScoreRecommendation } from '../utils/scoreRecommendations';
import uchiageHanabiScore from '../../風物之琴譜/可匯入譜面/打上花火.txt?raw';
import callOfSilenceScore from '../../風物之琴譜/可匯入譜面/CALL OF SILENCE.txt?raw';
import cryForMeScore from '../../風物之琴譜/可匯入譜面/CRY FOR ME.txt?raw';
import senbonzakuraScore from '../../風物之琴譜/可匯入譜面/千本櫻.txt?raw';
import haruhikageScore from '../../風物之琴譜/可匯入譜面/春日影.txt?raw';
import secretBaseScore from '../../風物之琴譜/可匯入譜面/未聞花名.txt?raw';

const EXTERNAL_LEGACY_TIMING_MODE = 'beat';

export const FEATURED_SCORES = [
  applyScoreRecommendation({
    id: 'i-really-want-to-stay-at-your-house',
    title: 'I Really Want to Stay at Your House',
    displayTitle: 'I Really Want to Stay at Your House',
    subtitle: '精選琴譜',
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
    bpm: 96,
    timeSigNum: 4,
    timeSigDen: 4,
    charResolution: 16,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
  applyScoreRecommendation({
    id: 'call-of-silence',
    title: 'CALL OF SILENCE',
    displayTitle: 'CALL OF SILENCE',
    subtitle: '精選琴譜',
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
    subtitle: '精選琴譜',
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
    subtitle: '精選琴譜',
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
    subtitle: '精選琴譜',
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
    subtitle: 'secret base',
    rawText: secretBaseScore,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
];
