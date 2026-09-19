import fs from 'node:fs/promises';
import path from 'node:path';

const SCORE_LIBRARY_ROOT = path.join('風物之琴譜', '風物之譜面');
const SLIM_JSON_DIR = path.join(SCORE_LIBRARY_ROOT, 'slim-json');
const MIDI_DIR = path.join(SCORE_LIBRARY_ROOT, 'midi');
const PUBLIC_SLIM_OUTPUT_DIR = path.join('public', 'score-library', 'slim-json');
const PUBLIC_SLIM_ROUTE = '/score-library/slim-json';
const MANIFEST_OUTPUT = path.join('public', 'score-library-manifest.json');

const OFFLINE_CORE_SLUGS = [
  'surges',
  'neo-aspect',
  'bansanka',
  'crossing-field',
  'unravel',
  'lemon',
  'tada-koe-hitotsu',
  'loser',
  'secret-base',
  'senbonzakura',
  'uchiage-hanabi',
  'gurenge',
  'romeo-cinderella',
  'haruhikage',
  'avid',
  'i-really-want-to-stay-at-your-house',
  'tenkyu-musica',
  'qing-tian',
  'sora-no-hako',
  'wrong-world',
  'nameless-voice',
  'unravel-midi',
  'lilas',
  'combined_22_mxl',
  'my-dearest',
];

const MIDI_SLUG_OVERRIDES = {
  'Avid': 'avid',
  'Crucifix X': 'crucifix-x',
  'DA Capo': 'da-capo',
  'DAYBREAK FRONTLINE': 'daybreak-frontline',
  'Haruhikage': 'haruhikage',
  'I really want to stay at your house': 'i-really-want-to-stay-at-your-house',
  'Loser': 'loser',
  'Neo-aspect': 'neo-aspect',
  'One Last Kiss': 'one-last-kiss',
  'Pretender': 'pretender',
  'Secret Base': 'secret-base',
  'This Game': 'this-game',
  'Tuning': 'tuning',
  '_S _The Way': 's-the-way',
  'cross field': 'crossing-field',
  'henceforth': 'henceforth',
  'lemon': 'lemon',
  'lilac(86)': 'lilas',
  'my dearest': 'my-dearest',
  'ray': 'ray',
  'surges': 'surges',
  'unraval': 'unravel',
  'unravel': 'unravel-midi',
  'wrong world': 'wrong-world',
  'ただ声一つ': 'tada-koe-hitotsu',
  'アスノヨゾラ哨戒班': 'asuno-yozora-shoukaihan',
  'キズナトキセキ': 'kizuna-to-kiseki',
  'グッバイ宣言': 'goodbye-sengen',
  '今はいいんだよ。': 'ima-wa-iin-dayo',
  '六兆年と一夜物語': 'roku-chounen-to-ichiya-monogatari',
  '前前前世': 'zenzenzense',
  '千本櫻': 'senbonzakura',
  '名無聲': 'nameless-voice',
  '夜に駆ける': 'yoru-ni-kakeru',
  '夢を撃ち抜く瞬間に！': 'yume-wo-uchinuku-shunkan-ni',
  '天球 Música': 'tenkyu-musica',
  '快晴': 'kaisei',
  '打上花火': 'uchiage-hanabi',
  '春日影': 'haruhikage',
  '晴天': 'qing-tian',
  '晚餐歌': 'bansanka',
  '空の箱': 'sora-no-hako',
  '紅連華': 'gurenge',
  '聿日箋秋': 'yu-ri-jian-qiu',
  '起死開戦': 'kishi-kaisen',
  '羅密歐與仙杜瑞拉': 'romeo-cinderella',
  '雑踏、僕らの街': 'zattou-bokura-no-machi',
};

function stripExtension(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/u, '');
}

function slugify(value) {
  const asciiSlug = String(value || 'score')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  if (asciiSlug) {
    return asciiSlug;
  }

  return [...String(value || 'score')]
    .map((character) => character.codePointAt(0).toString(16))
    .join('-');
}

async function buildMidiLookup() {
  const midiFiles = (await fs.readdir(MIDI_DIR))
    .filter((filename) => /\.midi?$/iu.test(filename))
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'));
  const midiBySlug = new Map();

  midiFiles.forEach((filename) => {
    const basename = stripExtension(filename);
    const slug = MIDI_SLUG_OVERRIDES[basename] ?? slugify(basename);
    midiBySlug.set(slug, {
      filename,
      title: basename,
      path: path.join(MIDI_DIR, filename),
    });
  });

  return midiBySlug;
}

function getSlimDisplayFallback(filename) {
  return stripExtension(filename).replace(/-slim$/iu, '');
}

function getSourceMidiFilename(scoreData) {
  const sourceMidiName = Array.isArray(scoreData?.source?.midi) ? scoreData.source.midi[0] : null;
  const metaFileName = scoreData?.meta?.fileName;
  const filename = sourceMidiName ?? metaFileName;

  return filename && /\.midi?$/iu.test(filename) ? path.basename(filename) : null;
}

function getManifestDisplayTitle(filename, midiItem, sourceMidiFilename) {
  return midiItem?.title ?? (sourceMidiFilename ? stripExtension(sourceMidiFilename) : getSlimDisplayFallback(filename));
}

function getSlimNotes(scoreData) {
  if (Array.isArray(scoreData?.notes)) {
    return scoreData.notes;
  }

  if (Array.isArray(scoreData?.tracks)) {
    return scoreData.tracks.flatMap((track) => track?.events ?? []);
  }

  return [];
}

function getTrackCount(scoreData) {
  if (Array.isArray(scoreData?.tracks)) {
    return scoreData.tracks.length;
  }

  const notes = getSlimNotes(scoreData);
  const trackIds = new Set(notes.map((note) => Array.isArray(note) ? note[4] : note?.trackId));
  return Math.max(trackIds.size, 1);
}

function getDurationTicks(notes) {
  return notes.reduce((max, note) => {
    const startTick = Array.isArray(note) ? note[0] : (note?.tick ?? note?.startTick ?? 0);
    const duration = Array.isArray(note) ? note[1] : (note?.durationTicks ?? note?.duration ?? 0);
    const endTick = Number(startTick) + Number(duration);
    return Number.isFinite(endTick) && endTick > max ? endTick : max;
  }, 0);
}

async function copySlimJsonToPublic(filename, sourcePath) {
  await fs.mkdir(PUBLIC_SLIM_OUTPUT_DIR, { recursive: true });
  await fs.copyFile(sourcePath, path.join(PUBLIC_SLIM_OUTPUT_DIR, filename));
}

async function generateManifest() {
  console.log('Generating score library manifest from slim JSON files...');

  const midiBySlug = await buildMidiLookup();
  const files = await fs.readdir(SLIM_JSON_DIR);
  const jsonFiles = files.filter((filename) => filename.endsWith('-slim.json')).sort();

  if (jsonFiles.length === 0) {
    console.warn('No slim JSON files found.');
    return;
  }

  const scores = [];

  for (const filename of jsonFiles) {
    const filePath = path.join(SLIM_JSON_DIR, filename);
    const fileStat = await fs.stat(filePath);
    const fileContentRaw = await fs.readFile(filePath, 'utf-8');
    const fileContent = fileContentRaw.replace(/^\uFEFF/u, '');

    try {
      const scoreData = JSON.parse(fileContent);
      const version = scoreData.version || scoreData.meta?.version;

      if (version !== '3.2-ultra-slim') {
        console.warn(`[skip] ${filename}: unsupported slim version "${version}".`);
        continue;
      }

      const notes = getSlimNotes(scoreData);
      if (notes.length === 0) {
        console.warn(`[skip] ${filename}: noteCount is 0.`);
        continue;
      }

      const slug = filename.replace('-slim.json', '');
      const midiItem = midiBySlug.get(slug);
      const sourceMidiFilename = getSourceMidiFilename(scoreData);
      const displayTitle = getManifestDisplayTitle(filename, midiItem, sourceMidiFilename);

      if (!midiItem && !sourceMidiFilename) {
        console.warn(`[warn] ${filename}: no matching MIDI filename found; using slim filename fallback.`);
      }

      await copySlimJsonToPublic(filename, filePath);

      scores.push({
        id: scoreData.meta?.id || slug,
        slug,
        filename,
        title: displayTitle,
        displayTitle,
        midiFilename: midiItem?.filename ?? sourceMidiFilename,
        midiLocalPath: midiItem ? `${SCORE_LIBRARY_ROOT.replace(/\\/g, '/')}/midi/${midiItem.filename}` : null,
        bpm: scoreData.transport?.bpm || 120,
        timeSigNum: scoreData.transport?.timeSigNum || 4,
        timeSigDen: scoreData.transport?.timeSigDen || 4,
        resolution: scoreData.transport?.resolution || 192,
        noteCount: notes.length,
        trackCount: getTrackCount(scoreData),
        durationTicks: getDurationTicks(notes),
        bytes: fileStat.size,
        sourceType: scoreData.meta?.sourceType || 'midi',
        storageFormat: 'hina-slim-score@3.2',
        storagePath: `score-library/slim-json/${filename}`,
        localPath: `${PUBLIC_SLIM_ROUTE}/${filename}`,
        downloadUrl: null,
        tags: scoreData.meta?.tags || [],
        isOfflineCore: OFFLINE_CORE_SLUGS.includes(slug),
      });
    } catch (parseError) {
      console.error(`Failed to parse ${filename}:`, parseError.message);
    }
  }

  scores.sort((left, right) => left.slug.localeCompare(right.slug));

  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    storageFormat: 'hina-slim-score@3.2',
    libraryRoot: 'score-library/slim-json',
    count: scores.length,
    scores,
  };

  await fs.writeFile(MANIFEST_OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  console.log(`Manifest generated with ${scores.length} scores.`);
  console.log(`Output: ${MANIFEST_OUTPUT}`);
}

generateManifest().catch((error) => {
  console.error('Failed to generate score library manifest:', error);
  process.exitCode = 1;
});
