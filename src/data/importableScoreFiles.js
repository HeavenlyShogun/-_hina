import { DEFAULT_SCORE_PARAMS } from '../constants/music';
import { SCORE_SOURCE_TYPES } from '../utils/scoreDocument';

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
  return `importable-${encodeURIComponent(titleFromFilename(filename))
    .replace(/%/g, '')
    .toLowerCase()}`;
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

    if (/\.legacy\.bak\.txt$/iu.test(filename)) {
      return null;
    }

    const title = titleFromFilename(filename);
    const meta = parseMeta(rawText);

    return {
      id: idFromFilename(filename),
      subtitle: '資料夾測試譜面',
      rawText,
      sourceType: SCORE_SOURCE_TYPES.TEXT,
      ...DEFAULT_SCORE_PARAMS,
      ...meta,
      title,
      displayTitle: `可匯入 / ${title}`,
      sourcePath: filePath,
      playlistId: 'importable-folder-test',
      tags: ['可匯入', '測試'],
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.title.localeCompare(right.title, 'zh-Hant'));

export default IMPORTABLE_SCORE_FILES;
