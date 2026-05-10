import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import { applyScoreRecommendation } from '../utils/scoreRecommendations';

const featuredScoreModules = import.meta.glob('../../風物之琴譜/可匯入譜面/第一版/*.txt', {
  eager: false,
  import: 'default',
  query: '?raw',
});

const EXTERNAL_LEGACY_TIMING_MODE = 'absolute';

const staticFeaturedScores = [
  {
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
  },
];

const PRESET_TITLES = {
  '打上花火.txt': { subtitle: 'DAOKO × 米津玄師' },
  'CALL OF SILENCE.txt': { subtitle: '進擊的巨人' },
  'CRY FOR ME.txt': { subtitle: 'TWICE' },
  '千本櫻.txt': { subtitle: '初音未來' },
  '春日影.txt': { subtitle: 'MyGO!!!!!' },
  '未聞花名.txt': { subtitle: 'secret base ~君がくれたもの~' },
};

function filenameFromPath(filePath) {
  return String(filePath ?? '').split('/').pop() ?? 'score.txt';
}

function titleFromFilename(filename) {
  return filename.replace(/\.txt$/iu, '').trim();
}

function idFromFilename(filename) {
  return `featured-${encodeURIComponent(filename.replace(/\.txt$/iu, ''))
    .replace(/%/g, '')
    .toLowerCase()}`;
}

const importedFeaturedScores = Object.entries(featuredScoreModules).map(([filePath, loader]) => {
  const filename = filenameFromPath(filePath);
  const title = titleFromFilename(filename);
  const id = idFromFilename(filename);
  const preset = PRESET_TITLES[filename] ?? {};

  return {
    id,
    title,
    displayTitle: title,
    subtitle: preset.subtitle,
    load: async () => {
      const rawText = await loader();
      return applyScoreRecommendation({
        id,
        title,
        displayTitle: title,
        subtitle: preset.subtitle,
        rawText,
        sourceType: SCORE_SOURCE_TYPES.TEXT,
        ...DEFAULT_SCORE_PARAMS,
        legacyTimingMode: EXTERNAL_LEGACY_TIMING_MODE,
        tone: 'piano',
        reverb: true,
      }, { force: true });
    },
  };
});

export const FEATURED_SCORES = [
  {
    id: 'surges-midi',
    title: 'surges-MIDI',
    displayTitle: 'surges-MIDI',
    subtitle: 'MIDI',
    load: async () => {
      const payload = await import('./scores/surges-midi.json').then(m => m.default);
      return {
        id: 'surges-midi',
        title: 'surges-MIDI',
        displayTitle: 'surges-MIDI',
        subtitle: 'MIDI',
        content: payload,
        sourceType: SCORE_SOURCE_TYPES.JSON,
        ...DEFAULT_SCORE_PARAMS,
        ...(payload.transport ?? {}),
        ...(payload.playback ?? {}),
      };
    },
  },
  {
    id: 'combined-4-midi',
    title: '春日影-MIDI',
    displayTitle: '春日影-MIDI',
    subtitle: 'MIDI',
    load: async () => {
      const payload = await import('./scores/combined-4-midi.json').then(m => m.default);
      return {
        id: 'combined-4-midi',
        title: '春日影-MIDI',
        displayTitle: '春日影-MIDI',
        content: {
          ...payload,
          meta: {
            ...(payload.meta ?? {}),
            title: '春日影-MIDI',
            displayTitle: '春日影-MIDI',
          },
        },
        subtitle: 'MIDI',
        sourceType: SCORE_SOURCE_TYPES.JSON,
        ...DEFAULT_SCORE_PARAMS,
        ...(payload.transport ?? {}),
        ...(payload.playback ?? {}),
      };
    },
  },
  {
    id: 'neo-aspect-midi',
    title: 'Neo aspect-MIDI',
    displayTitle: 'Neo aspect-MIDI',
    subtitle: 'MIDI',
    load: async () => {
      const payload = await import('./scores/neo-aspect-midi.json').then(m => m.default);
      return {
        id: 'neo-aspect-midi',
        title: 'Neo aspect-MIDI',
        displayTitle: 'Neo aspect-MIDI',
        content: payload,
        subtitle: 'MIDI',
        sourceType: SCORE_SOURCE_TYPES.JSON,
        ...DEFAULT_SCORE_PARAMS,
        ...(payload.transport ?? {}),
        ...(payload.playback ?? {}),
      };
    },
  },
  ...staticFeaturedScores.map(score => ({
    ...score,
    load: async () => score,
  })),
  ...importedFeaturedScores,
];
