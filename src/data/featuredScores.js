import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import { applyScoreRecommendation } from '../utils/scoreRecommendations';

export const FEATURED_SCORES = [
  applyScoreRecommendation({
    id: 'i-really-want-to-stay-at-your-house',
    title: 'I Really Want to Stay at Your House',
    displayTitle: 'I Really Want to Stay at Your House',
    subtitle: '精選琴譜',
    rawText: DEFAULT_SCORE,
    sourceType: SCORE_SOURCE_TYPES.TEXT,
    ...DEFAULT_SCORE_PARAMS,
    tone: 'piano',
    reverb: true,
  }, { force: true }),
];
