import { DEFAULT_SCORE_PARAMS } from '../constants/music.js';
import { DEFAULT_SCORE_NAME } from '../config/branding.js';
import { DEFAULT_MIDI_SOURCE_PATH, DEFAULT_SLIM_SCORE_PATH } from '../config/scoreLibraryPaths.js';
import { scoreLibraryService } from '../services/scoreLibraryService.js';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument.js';

const SLIM_STORAGE_FORMAT = 'hina-slim-score@3.2';
const PLAYLIST_ID = 'wind-lyre-slim-library';

export const IMPORTABLE_SCORE_TITLE_OVERRIDES = {
  'avid-slim.json': 'Avid',
  'combined_22_mxl-slim.json': 'unravel',
  'haruhikage-slim.json': '\u6625\u65e5\u5f71',
  'i-really-want-to-stay-at-your-house-slim.json': 'I really want to stay at your house',
  'my-dearest-slim.json': 'my dearest',
  'nameless-voice-slim.json': 'NAMONAKI',
  'tada-koe-hitotsu-slim.json': 'ONE VOICE',
};

export const IMPORTABLE_SCORE_PLAYBACK_OVERRIDES = {
  'haruhikage-slim.json': {
    globalKeyOffset: 11,
    scaleMode: 'major',
  },
};

export const IMPORTABLE_SCORE_ORDER = [
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
  'avid-slim.json',
  'i-really-want-to-stay-at-your-house-slim.json',
  'tenkyu-musica-slim.json',
  'qing-tian-slim.json',
  'sora-no-hako-slim.json',
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

function titleFromFilename(filename) {
  const cleanTitle = String(filename ?? '')
    .replace(/\.json$/iu, '')
    .replace(/-slim$/iu, '')
    .replace(/-/g, ' ')
    .trim();

  return cleanTitle || DEFAULT_SCORE_NAME;
}

function idFromFilename(filename) {
  return `importable-${encodeURIComponent(String(filename ?? 'score').replace(/\.json$/iu, ''))
    .replace(/%/g, '')
    .toLowerCase()}`;
}

function createManifestScoreMetadata(manifestItem = {}) {
  const filename = manifestItem.filename ?? `${manifestItem.slug ?? 'score'}-slim.json`;
  const playbackOverride = IMPORTABLE_SCORE_PLAYBACK_OVERRIDES[filename] ?? {};
  const fallbackTitle =
    manifestItem.displayTitle
    ?? manifestItem.title
    ?? IMPORTABLE_SCORE_TITLE_OVERRIDES[filename]
    ?? titleFromFilename(filename);

  return {
    id: manifestItem.id ?? idFromFilename(filename),
    slug: manifestItem.slug ?? filename.replace(/-slim\.json$/iu, ''),
    filename,
    title: fallbackTitle,
    displayTitle: fallbackTitle,
    subtitle: manifestItem.isOfflineCore ? 'Offline core score' : 'Cloud library score',
    storageFormat: manifestItem.storageFormat ?? SLIM_STORAGE_FORMAT,
    version: 'slim',
    versionLabel: 'Slim JSON',
    groupLabel: manifestItem.isOfflineCore ? 'Offline Core' : 'Cloud Library',
    sourceType: SCORE_SOURCE_TYPES.JSON,
    libraryPath: DEFAULT_SLIM_SCORE_PATH,
    defaultMidiPath: DEFAULT_MIDI_SOURCE_PATH,
    bpm: roundBpm(manifestItem.bpm ?? DEFAULT_SCORE_PARAMS.bpm),
    timeSigNum: manifestItem.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: manifestItem.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: manifestItem.resolution ?? DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: playbackOverride.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
    scaleMode: playbackOverride.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
    tone: DEFAULT_SCORE_PARAMS.tone,
    reverb: DEFAULT_SCORE_PARAMS.reverb,
    accidentals: {},
    noteCount: manifestItem.noteCount ?? 0,
    trackCount: manifestItem.trackCount ?? 0,
    durationTicks: manifestItem.durationTicks ?? 0,
    bytes: manifestItem.bytes ?? 0,
    localPath: manifestItem.localPath ?? null,
    storagePath: manifestItem.storagePath ?? null,
    downloadUrl: manifestItem.downloadUrl ?? null,
    isOfflineCore: Boolean(manifestItem.isOfflineCore),
    tags: ['Slim JSON', 'MIDI', ...(manifestItem.isOfflineCore ? ['Offline Core'] : ['Cloud Library'])],
    manifestItem,
    sourcePath: manifestItem.localPath ?? manifestItem.storagePath ?? filename,
    playlistId: PLAYLIST_ID,
  };
}

function sortScores(scores = []) {
  return [...scores].sort((left, right) => (
    scoreOrder(left.filename) - scoreOrder(right.filename)
    || String(left.displayTitle ?? left.title).localeCompare(String(right.displayTitle ?? right.title), 'zh-Hant')
    || String(left.filename).localeCompare(String(right.filename), 'zh-Hant')
  ));
}

function createLoadableScore(manifestItem = {}) {
  const metadata = createManifestScoreMetadata(manifestItem);

  return {
    ...metadata,
    load: async () => {
      const content = await scoreLibraryService.fetchScoreBySlug(metadata.slug, manifestItem);
      const latestMetadata = createManifestScoreMetadata({
        ...manifestItem,
        bpm: content?.transport?.bpm ?? manifestItem.bpm,
        timeSigNum: content?.transport?.timeSigNum ?? manifestItem.timeSigNum,
        timeSigDen: content?.transport?.timeSigDen ?? manifestItem.timeSigDen,
        resolution: content?.transport?.resolution ?? manifestItem.resolution,
        storageFormat: content?.meta?.storageFormat ?? manifestItem.storageFormat,
      });

      return {
        ...latestMetadata,
        content,
        sourcePath: metadata.sourcePath,
        playlistId: PLAYLIST_ID,
      };
    },
  };
}

export async function loadImportableScoreFiles() {
  const manifest = await scoreLibraryService.loadLibraryManifest();
  const scores = Array.isArray(manifest?.scores) ? manifest.scores : [];
  return sortScores(scores.map(createLoadableScore));
}

export async function loadImportableScoreGroups() {
  const files = await loadImportableScoreFiles();

  return [
    {
      id: 'slim',
      label: 'Slim MIDI',
      files,
    },
  ];
}

export default loadImportableScoreFiles;
