import { DEFAULT_SCORE_PARAMS } from '../constants/music.js';
import { DEFAULT_SCORE_NAME } from '../config/branding.js';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument.js';
import { getNotationDisplayName, parseScoreMetaHeader } from '../utils/scoreTextMeta.js';

const scoreModules = import.meta.glob('../../src/data/scores/*-midi.json', {
  eager: false,
  import: 'default',
  query: '?raw',
});

function filenameFromPath(filePath) {
  return String(filePath ?? '').split('/').pop() ?? 'score.txt';
}

function titleFromFilename(filename) {
  return filename
    .replace(/\.legacy\.bak\.txt$/iu, '')
    .replace(/\.txt$/iu, '')
    .trim() || DEFAULT_SCORE_NAME;
}

function idFromFilename(filename) {
  return `importable-${encodeURIComponent(filename.replace(/\.txt$/iu, ''))
    .replace(/%/g, '')
    .toLowerCase()}`;
}

function getImportableFormat(filename, meta = {}) {
  const storageFormat = String(meta.storageFormat ?? '').toLowerCase();
  const isLegacy = /\.legacy\.bak\.txt$/iu.test(filename) || storageFormat.startsWith('legacy');
  const notationLabel = getNotationDisplayName(meta.textNotation ?? (isLegacy ? 'legacy' : 'jianpu'));

  return isLegacy
    ? {
      version: 'legacy',
      versionLabel: notationLabel,
      groupLabel: 'Legacy 匯入譜面',
      storageFormat: meta.storageFormat ?? 'legacy-text@1',
      legacyTimingMode: meta.legacyTimingMode ?? 'beat',
      textNotation: meta.textNotation ?? 'legacy-beat',
    }
    : {
      version: 'modern',
      versionLabel: notationLabel,
      groupLabel: 'Modern 匯入譜面',
      storageFormat: meta.storageFormat ?? 'numbered-text@1',
      textNotation: meta.textNotation ?? 'jianpu',
    };
}

export const IMPORTABLE_SCORE_FILES = Object.entries(scoreModules)
  .map(([filePath, loader]) => {
    const filename = filenameFromPath(filePath);
    const title = titleFromFilename(filename);
    const id = idFromFilename(filename);
    const provisionalFormat = getImportableFormat(filename, {});

    const scoreStub = {
      id,
      filename,
      title,
      subtitle: `${provisionalFormat.versionLabel} import`,
      displayTitle: title,
      sourcePath: filePath,
      playlistId: 'importable-folder-test',
      tags: ['可匯入', provisionalFormat.versionLabel, '測試'],
      version: provisionalFormat.version,
      sourceType: SCORE_SOURCE_TYPES.TEXT,

      load: async () => {
        const rawText = await loader();
        const header = parseScoreMetaHeader(rawText);
        const meta = header.hasMeta && !header.error ? header.meta : {};
        const format = getImportableFormat(filename, meta);

        return {
          id,
          filename,
          fileContent: rawText,
          subtitle: `${format.versionLabel} import`,
          rawText,
          sourceType: SCORE_SOURCE_TYPES.TEXT,
          ...DEFAULT_SCORE_PARAMS,
          ...meta,
          ...format,
          title,
          displayTitle: title,
          sourcePath: filePath,
          playlistId: 'importable-folder-test',
          tags: ['可匯入', format.versionLabel, '測試'],
        };
      },
    };
    return scoreStub;
  })
  .sort((left, right) => (
    left.version.localeCompare(right.version)
    || left.title.localeCompare(right.title, 'zh-Hant')
    || left.filename.localeCompare(right.filename, 'zh-Hant')
  ));

export const IMPORTABLE_SCORE_GROUPS = [
  {
    id: 'modern',
    label: 'Modern 匯入譜面',
    files: IMPORTABLE_SCORE_FILES.filter((score) => score.version === 'modern'),
  },
  {
    id: 'legacy',
    label: 'Legacy 匯入譜面',
    files: IMPORTABLE_SCORE_FILES.filter((score) => score.version === 'legacy'),
  },
];

export default IMPORTABLE_SCORE_FILES;
