import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_MIDI_DIR = '風物之琴譜/縮小版可匯入譜面/midi';
const DEFAULT_OUTPUT_DIR = '風物之琴譜/縮小版可匯入譜面/slim-json';

const SLUG_OVERRIDES = {
  'Avid': 'avid',
  'Crucifix X': 'crucifix-x',
  'DA Capo': 'da-capo',
  'DAYBREAK FRONTLINE': 'daybreak-frontline',
  'Haruhikage': 'haruhikage',
  'henceforth': 'henceforth',
  'I really want to stay at your house': 'i-really-want-to-stay-at-your-house',
  'lemon': 'lemon',
  'Loser': 'loser',
  'One Last Kiss': 'one-last-kiss',
  'Pretender': 'pretender',
  'ray': 'ray',
  'Secret Base': 'secret-base',
  'This Game': 'this-game',
  'Tuning': 'tuning',
  'unravel': 'unravel-midi',
  'wrong world': 'wrong-world',
  '_S _The Way': 's-the-way',
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
  '空の箱': 'sora-no-hako',
  '紅連華': 'gurenge',
  '羅密歐與仙杜瑞拉': 'romeo-cinderella',
  '聿日箋秋': 'yu-ri-jian-qiu',
  '起死開戦': 'kishi-kaisen',
  '雑踏、僕らの街': 'zattou-bokura-no-machi',
};

const TITLE_OVERRIDES = {
  '_S _The Way': 'S The Way',
};

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

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

function runNodeScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${process.execPath} ${args.join(' ')}`));
    });
  });
}

async function main() {
  const midiDir = getArg('midi-dir', DEFAULT_MIDI_DIR);
  const outputDir = getArg('output-dir', DEFAULT_OUTPUT_DIR);
  const force = hasFlag('force');

  await mkdir(outputDir, { recursive: true });

  const midiFiles = (await readdir(midiDir))
    .filter((filename) => /\.midi?$/iu.test(filename))
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'));

  const results = {
    converted: [],
    skipped: [],
  };

  for (const midiFile of midiFiles) {
    const basename = stripExtension(midiFile);
    const title = TITLE_OVERRIDES[basename] ?? basename;
    const slug = SLUG_OVERRIDES[basename] ?? slugify(basename);
    const output = path.join(outputDir, `${slug}-slim.json`);

    if (!force && existsSync(output)) {
      results.skipped.push(path.basename(output));
      continue;
    }

    await runNodeScript([
      'scripts/slim-midi-score.mjs',
      `--input=${path.join(midiDir, midiFile)}`,
      `--output=${output}`,
      `--id=${slug}`,
      `--title=${title}`,
      `--display-title=${title}`,
    ]);

    results.converted.push(path.basename(output));
  }

  console.log('');
  console.log(`Converted: ${results.converted.length}`);
  results.converted.forEach((filename) => console.log(`  + ${filename}`));
  console.log(`Skipped existing: ${results.skipped.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
