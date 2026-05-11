
import { DEFAULT_SCORE, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';
import { applyScoreRecommendation } from '../utils/scoreRecommendations';

// Import from the new V3 location
import surgesMidiUrl from '../../風物之琴譜/可匯入譜面/第三版/surges-midi.json?url';
import combined4MidiUrl from '../../風物之琴譜/可匯入譜面/第三版/combined-4-midi.json?url';
import neoAspectMidiUrl from '../../風物之琴譜/可匯入譜面/第三版/neo-aspect-midi.json?url';

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

// Helper function to load V3 scores directly
async function loadV3Score(url, id, title, subtitle = 'MIDI') {
  const v3Score = await fetch(url).then(res => res.json());

  return {
    id,
    title,
    displayTitle: title,
    subtitle,
    content: v3Score, // Pass the V3 score directly
    sourceType: SCORE_SOURCE_TYPES.JSON,
    ...DEFAULT_SCORE_PARAMS,
    ...(v3Score.transport ?? {}),
    ...(v3Score.playback ?? {}),
  };
}

export const FEATURED_SCORES = [
  {
    id: 'surges-midi',
    title: 'surges-MIDI',
    displayTitle: 'surges-MIDI',
    subtitle: 'MIDI',
    load: () => loadV3Score(surgesMidiUrl, 'surges-midi', 'surges-MIDI'),
  },
  {
    id: 'combined-4-midi',
    title: '春日影-MIDI',
    displayTitle: '春日影-MIDI',
    subtitle: 'MIDI',
    load: () => loadV3Score(combined4MidiUrl, 'combined-4-midi', '春日影-MIDI'),
  },
  {
    id: 'neo-aspect-midi',
    title: 'Neo aspect-MIDI',
    displayTitle: 'Neo aspect-MIDI',
    subtitle: 'MIDI',
    load: () => loadV3Score(neoAspectMidiUrl, 'neo-aspect-midi', 'Neo aspect-MIDI'),
  },
  ...staticFeaturedScores.map(score => ({
    ...score,
    load: async () => score,
  })),
  ...importedFeaturedScores,
];
