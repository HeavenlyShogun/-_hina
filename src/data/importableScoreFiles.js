import { DEFAULT_SCORE_PARAMS } from '../constants/music.js';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument.js';

const META_PREFIX = '// [META] ';

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

  return isLegacy
    ? {
      version: 'legacy',
      versionLabel: '舊版',
      groupLabel: '舊版可匯入譜面',
      storageFormat: meta.storageFormat ?? 'legacy-text@1',
      legacyTimingMode: meta.legacyTimingMode ?? 'beat',
      textNotation: meta.textNotation ?? 'legacy-beat',
    }
    : {
      version: 'modern',
      versionLabel: '新版',
      groupLabel: '新版可匯入譜面',
      storageFormat: meta.storageFormat ?? 'numbered-text@1',
      textNotation: meta.textNotation ?? 'jianpu',
    };
}

function parseMeta(rawText) {
  const [firstLine] = String(rawText ?? '').replace(/^\uFEFF/u, '').split(/\r?\n/u);

  if (!firstLine.startsWith(META_PREFIX)) {
    return {};
  }

  try {
    const parsed = JSON.parse(firstLine.slice(META_PREFIX.length));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
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
      subtitle: `${format.versionLabel}資料夾譜面`,
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
    label: '新版可匯入譜面',
    files: IMPORTABLE_SCORE_FILES.filter((score) => score.version === 'modern'),
  },
  {
    id: 'legacy',
    label: '舊版可匯入譜面',
    files: IMPORTABLE_SCORE_FILES.filter((score) => score.version === 'legacy'),
  },
];

export default IMPORTABLE_SCORE_FILES;
