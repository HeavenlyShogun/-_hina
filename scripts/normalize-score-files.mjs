import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SCORE_PARAMS } from '../src/constants/music.js';

const ROOT_DIR = path.resolve(process.cwd(), '風物之琴譜');
const IMPORTABLE_DIR = path.join(ROOT_DIR, '可匯入譜面');
const REVIEW_DIR = path.join(ROOT_DIR, '待整理');
const ASSET_DIR = path.join(ROOT_DIR, '工具與參考');
const META_PREFIX = '// [META] ';

function buildDefaultMeta(title) {
  return {
    title,
    bpm: DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: DEFAULT_SCORE_PARAMS.globalKeyOffset,
    accidentals: DEFAULT_SCORE_PARAMS.accidentals,
    scaleMode: DEFAULT_SCORE_PARAMS.scaleMode,
    tone: DEFAULT_SCORE_PARAMS.tone,
    reverb: DEFAULT_SCORE_PARAMS.reverb,
    storageFormat: 'legacy-text@1',
  };
}

function parseMetaAndContent(rawText) {
  const normalized = String(rawText ?? '');
  const [firstLine, ...rest] = normalized.split(/\r?\n/);

  if (!firstLine.startsWith(META_PREFIX)) {
    return { meta: null, content: normalized };
  }

  try {
    return {
      meta: JSON.parse(firstLine.slice(META_PREFIX.length)),
      content: rest.join('\n').replace(/^\n/, ''),
    };
  } catch {
    return { meta: null, content: normalized };
  }
}

function isImportableLegacyScore(content) {
  const text = String(content ?? '');

  if (/(^|\n)\s*(M\d+|[LR]:)/m.test(text)) {
    return false;
  }

  const stripped = text.replace(/\/\/.*$/gm, '');
  const validTokenCount = (stripped.match(/[QWERTYUASDFGHJZXCVBNMqwertyuasdfghjzxcvbnm()\/+\-1234567|]/g) ?? []).length;

  return validTokenCount >= 24;
}

async function ensureDirs() {
  await Promise.all([
    mkdir(IMPORTABLE_DIR, { recursive: true }),
    mkdir(REVIEW_DIR, { recursive: true }),
    mkdir(ASSET_DIR, { recursive: true }),
  ]);
}

async function writeImportableScore(entryPath, entryName) {
  const raw = await readFile(entryPath, 'utf8');
  const { meta, content } = parseMetaAndContent(raw);
  const title = path.basename(entryName, path.extname(entryName));

  if (!isImportableLegacyScore(content)) {
    await rename(entryPath, path.join(REVIEW_DIR, entryName));
    return { file: entryName, action: 'moved-review' };
  }

  const nextMeta = {
    ...buildDefaultMeta(title),
    ...(meta && typeof meta === 'object' ? meta : {}),
    title,
  };

  const destination = path.join(IMPORTABLE_DIR, entryName);
  const normalizedOutput = `${META_PREFIX}${JSON.stringify(nextMeta)}\n${content.trimEnd()}\n`;
  await writeFile(destination, normalizedOutput, 'utf8');

  if (path.resolve(entryPath) !== path.resolve(destination)) {
    await rename(entryPath, path.join(REVIEW_DIR, `${title}.legacy.bak.txt`));
  }

  return { file: entryName, action: 'normalized' };
}

async function moveAsset(entryPath, entryName) {
  await rename(entryPath, path.join(ASSET_DIR, entryName));
  return { file: entryName, action: 'moved-asset' };
}

async function writeReadme(summary) {
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const lines = [
    '# 風物之琴譜',
    '',
    '- `可匯入譜面/`: 可直接由目前網站匯入的文字譜，第一行帶有 `// [META]` 設定。',
    '- `待整理/`: 暫時不符合目前網站譜面語法，或保留的原始備份。',
    '- `工具與參考/`: 外掛、捷徑、圖片等非譜面檔。',
    '',
    '目前 `META` 會保存：',
    '- `bpm`',
    '- `timeSigNum` / `timeSigDen`',
    '- `charResolution`',
    '- `globalKeyOffset`',
    '- `accidentals`',
    '- `scaleMode`',
    '- `tone`',
    '- `reverb`',
    '',
    '本次整理結果：',
    ...summary.map((item) => `- ${item.file}: ${item.action}`),
    '',
  ];

  await writeFile(readmePath, lines.join('\n'), 'utf8');
}

async function main() {
  await ensureDirs();
  const entries = await readdir(ROOT_DIR, { withFileTypes: true });
  const summary = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.name === 'README.md') {
      continue;
    }

    const entryPath = path.join(ROOT_DIR, entry.name);
    const lower = entry.name.toLowerCase();

    if (lower.endsWith('.txt')) {
      summary.push(await writeImportableScore(entryPath, entry.name));
      continue;
    }

    if (lower.endsWith('.exe') || lower.endsWith('.lnk') || lower.endsWith('.png')) {
      summary.push(await moveAsset(entryPath, entry.name));
    }
  }

  await writeReadme(summary);
  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
