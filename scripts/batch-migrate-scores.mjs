import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const slimToolPath = path.join(projectRoot, 'scripts', 'slim-midi-score.mjs');
const importableScoresDir = path.join(projectRoot, '風物之琴譜', '縮小版可匯入譜面', 'slim-json');
const legacyScoresSourceDir = path.join(projectRoot, 'src', 'data', 'scores');
const importableScoreFilesPath = path.join(projectRoot, 'src', 'data', 'importableScoreFiles.js');
const musicWorkDir = path.join(projectRoot, 'music_work');
const legacyScoresDir = path.join(musicWorkDir, 'legacy_scores');

const migrationMap = [
  {
    sourceFile: 'surges.mid',
    outputId: 'surges-slim',
    title: 'surges_slim',
    outputFile: 'surges-slim.json',
    legacyFile: 'surges-midi.json',
  },
  {
    sourceFile: 'neo-aspect.mid',
    outputId: 'neo-aspect-slim',
    title: 'neo-aspect_slim',
    outputFile: 'neo-aspect-slim.json',
    legacyFile: 'neo-aspect-midi.json',
  },
  {
    sourceFile: 'combined_11.mid',
    outputId: 'dinner-song-slim',
    title: '晚餐歌',
    outputFile: 'dinner-song-slim.json',
    legacyFile: 'combined-11-midi.json',
    renameNotice: '正在將 combined-11 重新命名為 晚餐歌...',
  },
];

async function ensureFileExists(filePath, description) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${description} 不存在: ${filePath}`);
  }
}

function runSlimTool({ sourceFile, outputFile, outputId, title }) {
  const inputPath = path.join(musicWorkDir, sourceFile);
  const outputPath = path.join(importableScoresDir, outputFile);

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        slimToolPath,
        `--input=${inputPath}`,
        `--output=${outputPath}`,
        `--id=${outputId}`,
        `--title=${title}`,
      ],
      {
        cwd: projectRoot,
        stdio: 'inherit',
      },
    );

    child.on('error', (error) => {
      reject(new Error(`啟動壓縮工具失敗 (${sourceFile}): ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`壓縮工具執行失敗 (${sourceFile})，結束碼: ${code}`));
    });
  });
}

async function archiveLegacyScores() {
  const legacyFiles = migrationMap.map((entry) => entry.legacyFile);

  await mkdir(legacyScoresDir, { recursive: true });

  for (const legacyFile of legacyFiles) {
    const sourcePath = path.join(legacyScoresSourceDir, legacyFile);
    const targetPath = path.join(legacyScoresDir, legacyFile);

    try {
      await access(sourcePath);
    } catch {
      console.warn(`略過封存，找不到舊檔: ${sourcePath}`);
      continue;
    }

    await rm(targetPath, { force: true });
    await rename(sourcePath, targetPath);
    console.log(`已封存舊譜面: ${legacyFile}`);
  }
}

async function updateImportableScoreGlob() {
  const fileContent = await readFile(importableScoreFilesPath, 'utf8');
  const oldGlobPath = '../../src/data/scores/*-midi.json';
  const alternateOldGlobPath = './scores/*-slim.json';
  const newGlobPath = '../../風物之琴譜/縮小版可匯入譜面/slim-json/*-slim.json';

  if (fileContent.includes(newGlobPath)) {
    console.log('importableScoreFiles.js 的 glob 已經指向縮小版可匯入譜面，略過更新。');
    return;
  }

  const sourceGlobPath = fileContent.includes(oldGlobPath)
    ? oldGlobPath
    : fileContent.includes(alternateOldGlobPath)
      ? alternateOldGlobPath
      : null;

  if (!sourceGlobPath) {
    throw new Error(`找不到可更新的 glob 路徑，預期為 ${oldGlobPath} 或 ${alternateOldGlobPath}`);
  }

  const updatedContent = fileContent.replace(sourceGlobPath, newGlobPath);
  await writeFile(importableScoreFilesPath, updatedContent, 'utf8');
  console.log(`已更新匯入設定: ${importableScoreFilesPath}`);
}

async function runMigrations() {
  for (const entry of migrationMap) {
    const inputPath = path.join(musicWorkDir, entry.sourceFile);

    if (entry.renameNotice) {
      console.log(entry.renameNotice);
    }

    await ensureFileExists(inputPath, `來源 MIDI 檔案 ${entry.sourceFile}`);
    console.log(`開始轉換: ${entry.sourceFile} -> ${entry.outputFile}`);
    await runSlimTool(entry);
  }
}

async function main() {
  try {
    await ensureFileExists(slimToolPath, '壓縮工具');
    await ensureFileExists(importableScoreFilesPath, '匯入設定檔');
    await mkdir(importableScoresDir, { recursive: true });

    console.log('開始執行批次譜面遷移...');
    await runMigrations();
    await archiveLegacyScores();
    await updateImportableScoreGlob();
    console.log('批次譜面遷移完成。');
  } catch (error) {
    console.error('批次譜面遷移失敗:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();
