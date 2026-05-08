import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { normalizeScoreSource } from '../src/utils/score.js';

const SCORE_DIR = path.resolve(process.cwd(), '風物之琴譜', '可匯入譜面');
const META_PREFIX = '// [META] ';
const DEFAULT_ITERATIONS = 80;
const DEFAULT_WARMUPS = 5;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

const ITERATIONS = parsePositiveInt(process.env.ITERATIONS, DEFAULT_ITERATIONS);
const WARMUPS = parsePositiveInt(process.env.WARMUPS, DEFAULT_WARMUPS);
const SCORE_FILTER = String(process.env.SCORE_FILTER ?? '').toLowerCase();

function parseMetaAndContent(rawText, filename) {
  const normalized = String(rawText ?? '').replace(/^\uFEFF/u, '');
  const [firstLine, ...rest] = normalized.split(/\r?\n/u);

  if (!firstLine.startsWith(META_PREFIX)) {
    return {
      meta: {
        title: path.basename(filename, path.extname(filename)),
        textNotation: 'jianpu',
      },
      content: normalized,
    };
  }

  try {
    return {
      meta: JSON.parse(firstLine.slice(META_PREFIX.length)),
      content: rest.join('\n').replace(/^\n/u, ''),
    };
  } catch {
    return {
      meta: {
        title: path.basename(filename, path.extname(filename)),
        textNotation: 'jianpu',
      },
      content: normalized,
    };
  }
}

function createPlaybackConfig(meta = {}) {
  return {
    bpm: Number(meta.bpm) || 125,
    timeSigNum: Number(meta.timeSigNum) || 4,
    timeSigDen: Number(meta.timeSigDen) || 4,
    charResolution: Number(meta.charResolution) || 16,
    globalKeyOffset: Number(meta.globalKeyOffset) || 0,
    scaleMode: meta.scaleMode ?? 'major',
    tone: meta.tone ?? 'piano',
    reverb: meta.reverb ?? true,
    textNotation: meta.textNotation ?? 'jianpu',
    legacyTimingMode: meta.legacyTimingMode,
  };
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits));
}

function measureScore(score) {
  for (let index = 0; index < WARMUPS; index += 1) {
    normalizeScoreSource(score.content, score.playback);
  }

  const samples = [];
  let lastNormalized = null;

  for (let index = 0; index < ITERATIONS; index += 1) {
    const startedAt = performance.now();
    lastNormalized = normalizeScoreSource(score.content, score.playback);
    samples.push(performance.now() - startedAt);
  }

  const noteEvents = lastNormalized.events.filter((event) => !event.isRest).length;
  return {
    file: score.file,
    title: score.playback.title ?? score.file,
    notation: score.playback.textNotation,
    bytes: Buffer.byteLength(score.content, 'utf8'),
    events: lastNormalized.events.length,
    noteEvents,
    lines: lastNormalized.structure?.lines?.length ?? 0,
    avgMs: round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
    p95Ms: round(percentile(samples, 0.95)),
    maxMs: round(Math.max(...samples)),
  };
}

async function loadScores() {
  const entries = await readdir(SCORE_DIR, { withFileTypes: true });
  const targets = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.toLowerCase().endsWith('.txt'))
    .filter((entry) => !entry.name.toLowerCase().endsWith('.legacy.bak.txt'))
    .filter((entry) => !SCORE_FILTER || entry.name.toLowerCase().includes(SCORE_FILTER));

  return Promise.all(targets.map(async (entry) => {
    const rawText = await readFile(path.join(SCORE_DIR, entry.name), 'utf8');
    const { meta, content } = parseMetaAndContent(rawText, entry.name);
    const playback = createPlaybackConfig(meta);

    return {
      file: entry.name,
      content,
      playback: {
        ...playback,
        title: meta.title,
      },
    };
  }));
}

async function main() {
  const scores = await loadScores();

  if (!scores.length) {
    throw new Error(`No score files matched in ${SCORE_DIR}.`);
  }

  const startedAt = performance.now();
  const results = scores.map(measureScore);
  const elapsedMs = performance.now() - startedAt;
  const totals = results.reduce((summary, item) => ({
    files: summary.files + 1,
    bytes: summary.bytes + item.bytes,
    events: summary.events + item.events,
    noteEvents: summary.noteEvents + item.noteEvents,
    avgMs: summary.avgMs + item.avgMs,
    maxMs: Math.max(summary.maxMs, item.maxMs),
  }), {
    files: 0,
    bytes: 0,
    events: 0,
    noteEvents: 0,
    avgMs: 0,
    maxMs: 0,
  });

  console.table(results.map((item) => ({
    file: item.file,
    notation: item.notation,
    bytes: item.bytes,
    events: item.events,
    noteEvents: item.noteEvents,
    lines: item.lines,
    avgMs: item.avgMs,
    p95Ms: item.p95Ms,
    maxMs: item.maxMs,
  })));

  console.log(JSON.stringify({
    iterations: ITERATIONS,
    warmups: WARMUPS,
    elapsedMs: round(elapsedMs),
    totals: {
      ...totals,
      avgMsPerFile: round(totals.avgMs / totals.files),
      maxMs: round(totals.maxMs),
    },
    memoryMB: {
      rss: round(process.memoryUsage().rss / 1024 / 1024, 2),
      heapUsed: round(process.memoryUsage().heapUsed / 1024 / 1024, 2),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
