import { DEFAULT_SCORE_PARAMS } from '../constants/music.js';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument.js';
import { getNotationDisplayName, parseScoreMetaHeader } from '../utils/scoreTextMeta.js';

const scoreModules = import.meta.glob('../../風物之琴譜/可匯入譜面/*.txt', {
  eager: true,
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
    .trim() || 'Untitled Score';
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

function parseMeta(rawText) {
  const header = parseScoreMetaHeader(rawText);
  return header.hasMeta && !header.error ? header.meta : {};
}

export const IMPORTABLE_SCORE_FILES = Object.entries(scoreModules)
  .map(([filePath, rawText]) => {
    const filename = filenameFromPath(filePath);
    const title = titleFromFilename(filename);
    const meta = parseMeta(rawText);
    const format = getImportableFormat(filename, meta);

    return {
      id: idFromFilename(filename),
      filename,
      fileContent: rawText,
      subtitle: `${format.versionLabel} import`,
      rawText,
      sourceType: SCORE_SOURCE_TYPES.TEXT,
      ...DEFAULT_SCORE_PARAMS,
      ...meta,
      ...format,
      title,
      displayTitle: `${format.versionLabel} / ${filename}`,
      sourcePath: filePath,
      playlistId: 'importable-folder-test',
      tags: ['可匯入', format.versionLabel, '測試'],
    };
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
