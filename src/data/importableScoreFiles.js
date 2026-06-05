import { DEFAULT_SCORE_PARAMS } from '../constants/music.js';
import { DEFAULT_SCORE_NAME } from '../config/branding.js';
import { DEFAULT_MIDI_SOURCE_PATH, DEFAULT_SLIM_SCORE_PATH } from '../config/scoreLibraryPaths.js';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument.js';

const scoreModules = import.meta.glob('../../風物之琴譜/縮小版可匯入譜面/slim-json/*-slim.json', {
  eager: false,
  import: 'default',
});

const SLIM_STORAGE_FORMAT = 'hina-slim-score@3.2';
const IMPORTABLE_SCORE_TITLE_OVERRIDES = {
  'combined_22_mxl-slim.json': 'unravel',
  'haruhikage-slim.json': '春日影',
  'my-dearest-slim.json': 'my dearest',
  'nameless-voice-slim.json': 'NAMONAKI',
  'tada-koe-hitotsu-slim.json': 'ONE VOICE',
};
const IMPORTABLE_SCORE_PLAYBACK_OVERRIDES = {
  'haruhikage-slim.json': {
    globalKeyOffset: 11,
    scaleMode: 'major',
  },
};
const IMPORTABLE_SCORE_ORDER = [
  'surges-slim.json',
  'neo-aspect-slim.json',
  'bansanka-slim.json',
  'crossing-field-slim.json',
  'unravel-slim.json',
  'lemon-slim.json',
  'tada-koe-hitotsu-slim.json',
  'loser-slim.json',
  'secret-base-slim.json',
  'senbonzakura-slim.json',
  'uchiage-hanabi-slim.json',
  'gurenge-slim.json',
  'romeo-cinderella-slim.json',
  'haruhikage-slim.json',
  'wrong-world-slim.json',
  'nameless-voice-slim.json',
  'unravel-midi-slim.json',
  'lilas-slim.json',
  'combined_22_mxl-slim.json',
  'my-dearest-slim.json',
];

function roundBpm(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SCORE_PARAMS.bpm;
  }

  return Number(numeric.toFixed(1));
}

function scoreOrder(filename) {
  const order = IMPORTABLE_SCORE_ORDER.indexOf(filename);
  return order === -1 ? Number.POSITIVE_INFINITY : order;
}

function filenameFromPath(filePath) {
  return String(filePath ?? '').split('/').pop() ?? 'score.json';
}

function titleFromFilename(filename) {
  const cleanTitle = filename
    .replace(/\.json$/iu, '')
    .replace(/-slim$/iu, '')
    .replace(/-/g, ' ')
    .trim();

  return cleanTitle || DEFAULT_SCORE_NAME;
}

function idFromFilename(filename) {
  return `importable-${encodeURIComponent(filename.replace(/\.json$/iu, ''))
    .replace(/%/g, '')
    .toLowerCase()}`;
}

function createSlimMetadata(score = {}, filename) {
  const meta = score?.meta ?? {};
  const transport = score?.transport ?? {};
  const playback = score?.playback ?? {};
  const playbackOverride = IMPORTABLE_SCORE_PLAYBACK_OVERRIDES[filename] ?? {};
  const fallbackTitle = IMPORTABLE_SCORE_TITLE_OVERRIDES[filename] ?? titleFromFilename(filename);

  return {
    id: meta.id ?? idFromFilename(filename),
    filename,
    title: fallbackTitle,
    displayTitle: fallbackTitle,
    subtitle: 'Slim JSON import',
    storageFormat: meta.storageFormat ?? SLIM_STORAGE_FORMAT,
    version: 'slim',
    versionLabel: 'Slim JSON',
    groupLabel: 'Slim MIDI',
    sourceType: SCORE_SOURCE_TYPES.JSON,
    libraryPath: DEFAULT_SLIM_SCORE_PATH,
    defaultMidiPath: DEFAULT_MIDI_SOURCE_PATH,
    bpm: roundBpm(transport.bpm ?? DEFAULT_SCORE_PARAMS.bpm),
    timeSigNum: transport.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: transport.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: transport.resolution ?? DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: playbackOverride.globalKeyOffset ?? playback.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
    scaleMode: playbackOverride.scaleMode ?? playback.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
    tone: playback.tone ?? DEFAULT_SCORE_PARAMS.tone,
    reverb: playback.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
    accidentals: playback.accidentals ?? {},
    tags: ['Slim JSON', 'MIDI'],
  };
}

export const IMPORTABLE_SCORE_FILES = Object.entries(scoreModules)
  .map(([filePath, loader]) => {
    const filename = filenameFromPath(filePath);
    const fallbackMeta = createSlimMetadata({}, filename);

    return {
      ...fallbackMeta,
      sourcePath: filePath,
      playlistId: 'wind-lyre-slim-library',
      load: async () => {
        const content = await loader();
        const metadata = createSlimMetadata(content, filename);

        return {
          ...metadata,
          content,
          sourcePath: filePath,
          playlistId: 'wind-lyre-slim-library',
        };
      },
    };
  })
  .sort((left, right) => (
    scoreOrder(left.filename) - scoreOrder(right.filename)
    || left.displayTitle.localeCompare(right.displayTitle, 'zh-Hant')
    || left.filename.localeCompare(right.filename, 'zh-Hant')
  ));

export const IMPORTABLE_SCORE_GROUPS = [
  {
    id: 'slim',
    label: 'Slim MIDI',
    files: IMPORTABLE_SCORE_FILES,
  },
];

export default IMPORTABLE_SCORE_FILES;
