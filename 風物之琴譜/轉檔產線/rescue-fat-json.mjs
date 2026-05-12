import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const INPUT_DIR = path.join(projectRoot, 'src', 'data', 'scores');
const OUTPUT_DIR = path.join(projectRoot, '風物之琴譜', '縮小版可匯入譜面', 'slim-json');

const migrationMap = [
  {
    input: 'surges-midi.json',
    output: 'surges-slim.json',
    id: 'surges-slim',
    title: 'surges_slim',
    displayTitle: 'surges_slim',
  },
  {
    input: 'neo-aspect-midi.json',
    output: 'neo-aspect-slim.json',
    id: 'neo-aspect-slim',
    title: 'neo-aspect_slim',
    displayTitle: 'neo-aspect_slim',
  },
  {
    input: 'combined-11-midi.json',
    output: 'dinner-song-slim.json',
    id: 'dinner-song-slim',
    title: '晚餐歌',
    displayTitle: '晚餐歌',
    renameNotice: '正在將 combined-11 重新命名為 晚餐歌...',
  },
];

function normalizeVelocity(value, fallback = 0.85) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, numeric));
}

function normalizeTrackId(track, trackIndex) {
  if (typeof track?.id === 'number' && Number.isFinite(track.id)) {
    return track.id;
  }

  const numericSuffix = /(\d+)$/u.exec(String(track?.id ?? '').trim())?.[1];
  if (numericSuffix) {
    return Number(numericSuffix) - 1;
  }

  return trackIndex;
}

function buildTempoMap(oldScore, fallbackBpm) {
  const legacyTempoMap = oldScore?.playback?.tempoMap;
  if (Array.isArray(legacyTempoMap) && legacyTempoMap.length > 0) {
    return legacyTempoMap
      .map((entry) => [
        Math.max(0, Math.round(Number(entry?.startTick ?? entry?.tick) || 0)),
        Number(entry?.bpm) || fallbackBpm,
      ])
      .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0)
      .sort((left, right) => left[0] - right[0]);
  }

  const sourceTempos = oldScore?.source?.midi?.tempos;
  if (Array.isArray(sourceTempos) && sourceTempos.length > 0) {
    return sourceTempos
      .map((entry) => [
        Math.max(0, Math.round(Number(entry?.ticks) || 0)),
        Number(entry?.bpm) || fallbackBpm,
      ])
      .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0)
      .sort((left, right) => left[0] - right[0]);
  }

  return [[0, fallbackBpm]];
}

function buildTimeSignatures(oldScore) {
  const timeSignatures = oldScore?.source?.midi?.timeSignatures;
  if (!Array.isArray(timeSignatures)) {
    return [];
  }

  return timeSignatures
    .map((entry) => [
      Math.max(0, Math.round(Number(entry?.ticks) || 0)),
      Number(entry?.timeSignature?.[0]) || 4,
      Number(entry?.timeSignature?.[1]) || 4,
    ])
    .sort((left, right) => left[0] - right[0]);
}

function extractSlimNotes(oldScore) {
  const tracks = Array.isArray(oldScore?.tracks) ? oldScore.tracks : [];

  return tracks
    .flatMap((track, trackIndex) => {
      if (track?.mute) {
        return [];
      }

      const trackId = normalizeTrackId(track, trackIndex);
      const events = Array.isArray(track?.events) ? track.events : [];

      return events
        .filter((event) => event?.type === 'note')
        .map((event) => {
          const midi = Number(event?.midi ?? event?.note);
          if (!Number.isFinite(midi)) {
            return null;
          }

          return [
            Math.max(0, Math.round(Number(event?.startTick ?? event?.tick) || 0)),
            Math.max(1, Math.round(Number(event?.durationTicks ?? event?.duration) || 0)),
            Math.max(0, Math.round(midi)),
            Number(normalizeVelocity(event?.velocity).toFixed(4)),
            trackId,
          ];
        })
        .filter(Boolean);
    })
    .sort((left, right) => (
      left[0] - right[0]
      || left[4] - right[4]
      || left[2] - right[2]
      || left[1] - right[1]
    ));
}

function createSlimScore(oldScore, task) {
  const transport = oldScore?.transport ?? {};
  const playback = oldScore?.playback ?? {};
  const meta = oldScore?.meta ?? {};
  const fallbackBpm = Number(transport?.bpm) || 120;
  const resolution = Math.max(1, Math.round(Number(transport?.resolution) || 480));
  const notes = extractSlimNotes(oldScore);

  if (notes.length === 0) {
    throw new Error(`找不到可轉換的 note 事件: ${task.input}`);
  }

  return {
    version: '3.2-ultra-slim',
    columns: ['startTick', 'durationTicks', 'note', 'velocity', 'trackId'],
    meta: {
      id: task.id,
      title: task.title,
      displayTitle: task.displayTitle ?? task.title,
      sourceType: 'midi',
      originalFormat: oldScore?.meta?.originalFormat ?? 'midi',
      storageFormat: 'hina-slim-score@3.2',
      fileName: task.output,
      importedFrom: meta.importedFrom ?? `fat-json://${task.input}`,
      migratedAt: new Date().toISOString(),
      rescuedFrom: task.input,
    },
    transport: {
      bpm: fallbackBpm,
      timeSigNum: Number(transport?.timeSigNum) || 4,
      timeSigDen: Number(transport?.timeSigDen) || 4,
      resolution,
    },
    playback: {
      tone: playback?.tone ?? 'piano',
      globalKeyOffset: Number(playback?.globalKeyOffset) || 0,
      scaleMode: playback?.scaleMode ?? 'major',
      reverb: playback?.reverb ?? true,
      accidentals: playback?.accidentals ?? {},
      tempoMap: buildTempoMap(oldScore, fallbackBpm),
    },
    source: {
      midi: [
        meta.fileName ?? oldScore?.source?.midi?.fileName ?? task.input,
        resolution,
        1,
        Array.isArray(oldScore?.tracks) ? oldScore.tracks.length : 0,
        buildTimeSignatures(oldScore),
      ],
    },
    tracks: (Array.isArray(oldScore?.tracks) ? oldScore.tracks : []).map((track, trackIndex) => [
      track?.name?.trim() || `track-${trackIndex + 1}`,
      Number(track?.channel ?? 0),
      track?.instrument || 'unknown',
    ]),
    notes,
  };
}

async function rescueScores() {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });

    for (const task of migrationMap) {
      const inputPath = path.join(INPUT_DIR, task.input);
      const outputPath = path.join(OUTPUT_DIR, task.output);

      console.log(`正在從肥版 JSON 轉換: ${task.input}`);
      if (task.renameNotice) {
        console.log(task.renameNotice);
      }

      const rawData = await readFile(inputPath, 'utf8');
      const oldScore = JSON.parse(rawData);
      const slimScore = createSlimScore(oldScore, task);
      const payload = JSON.stringify(slimScore);

      await writeFile(outputPath, `${payload}\n`, 'utf8');
      console.log(`已產出: ${task.output} (${(Buffer.byteLength(payload, 'utf8') / 1024).toFixed(2)} KB)\n`);
    }

    console.log('所有曲目瘦身完成。');
  } catch (error) {
    console.error('救援轉換失敗:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

rescueScores();
