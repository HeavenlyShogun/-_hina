import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScoreSource } from '../src/utils/score.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const CYBERPUNK_NUMBERED_PATH = path.join(repoRoot, '風物之琴譜', '可匯入譜面', '我永遠想待在你的房子裡.txt');
const CYBERPUNK_LEGACY_PATH = path.join(repoRoot, '風物之琴譜', '可匯入譜面', '我永遠想待在你的房子裡.legacy.bak.txt');

const playbackConfig = {
  bpm: 125,
  timeSigNum: 4,
  timeSigDen: 4,
  charResolution: 16,
  globalKeyOffset: 6,
  scaleMode: 'major',
  tone: 'piano',
  reverb: true,
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function summarizeMismatch(numberedEvent, legacyEvent, index) {
  return {
    index,
    numbered: numberedEvent
      ? {
        tick: numberedEvent.tick,
        durationTicks: numberedEvent.durationTicks,
        key: numberedEvent.k,
        noteName: numberedEvent.noteName,
        frequency: Number(numberedEvent.frequency?.toFixed?.(3) ?? numberedEvent.frequency ?? 0),
      }
      : null,
    legacy: legacyEvent
      ? {
        tick: legacyEvent.tick,
        durationTicks: legacyEvent.durationTicks,
        key: legacyEvent.k,
        noteName: legacyEvent.noteName,
        frequency: Number(legacyEvent.frequency?.toFixed?.(3) ?? legacyEvent.frequency ?? 0),
      }
      : null,
  };
}

function runExcerptSmokeTest() {
  const source = [
    'M: 5. 5_ 5 | 6- 5-',
    'C: 1- 3- | 4- 6-',
  ].join('\n');

  const normalized = normalizeScoreSource(source, {
    ...playbackConfig,
    textNotation: 'jianpu',
  });

  const melody = normalized.events.filter((event) => event.trackId === 'M');
  const accompaniment = normalized.events.filter((event) => event.trackId === 'C');

  assert(melody.length === 5, `Expected 5 melody events, got ${melody.length}.`);
  assert(accompaniment.length === 4, `Expected 4 accompaniment events, got ${accompaniment.length}.`);

  assert(melody[0].durationTicks === 72, `Expected M:5. to last 72 ticks, got ${melody[0].durationTicks}.`);
  assert(melody[1].tick === 72, `Expected M:5_ to start at tick 72, got ${melody[1].tick}.`);
  assert(accompaniment[1].tick === 96, `Expected C:3- to align on beat 2 at tick 96, got ${accompaniment[1].tick}.`);
  assert(melody[2].tick === accompaniment[1].tick, `Expected M third note and C second note to align at tick 96, got M=${melody[2].tick}, C=${accompaniment[1].tick}.`);
  assert(Math.abs((melody[0].v ?? 0) - 0.9) < 0.0001, `Expected melody velocity 0.9, got ${melody[0].v}.`);
  assert(Math.abs((accompaniment[0].v ?? 0) - 0.72) < 0.0001, `Expected accompaniment velocity 0.72, got ${accompaniment[0].v}.`);

  return {
    melody,
    accompaniment,
    tokenLines: normalized?.structure?.tokenLines ?? [],
  };
}

async function runCyberpunkComparison() {
  const [numberedText, legacyText] = await Promise.all([
    readFile(CYBERPUNK_NUMBERED_PATH, 'utf8'),
    readFile(CYBERPUNK_LEGACY_PATH, 'utf8'),
  ]);

  const numbered = normalizeScoreSource(numberedText, {
    ...playbackConfig,
    textNotation: 'jianpu',
  });
  const legacy = normalizeScoreSource(legacyText, {
    ...playbackConfig,
    textNotation: 'legacy-beat',
    legacyTimingMode: 'beat',
  });

  const mismatches = [];
  const compareLength = Math.min(numbered.events.length, legacy.events.length);

  for (let index = 0; index < compareLength; index += 1) {
    const left = numbered.events[index];
    const right = legacy.events[index];

    if (
      left.tick !== right.tick
      || left.durationTicks !== right.durationTicks
      || left.k !== right.k
    ) {
      mismatches.push(summarizeMismatch(left, right, index));
      if (mismatches.length >= 8) {
        break;
      }
    }
  }

  return {
    numbered,
    legacy,
    parity: {
      exactEventParity: mismatches.length === 0
        && numbered.events.length === legacy.events.length
        && numbered.maxTick === legacy.maxTick,
      mismatchSample: mismatches,
      reason: mismatches.length === 0
        ? 'Numbered and legacy event streams are aligned.'
        : 'Legacy backup contains accompaniment/chord texture, while numbered score is melody-only M-track content.',
    },
  };
}

async function main() {
  const excerpt = runExcerptSmokeTest();
  const comparison = await runCyberpunkComparison();
  const firstNumberedEvent = comparison.numbered.events[0];

  console.log(JSON.stringify({
    excerpt: {
      melodyTicks: excerpt.melody.map((event) => ({ tick: event.tick, durationTicks: event.durationTicks, v: event.v })),
      accompanimentTicks: excerpt.accompaniment.map((event) => ({ tick: event.tick, durationTicks: event.durationTicks, v: event.v })),
      tokenLines: excerpt.tokenLines.length,
    },
    cyberpunk: {
      numberedEvents: comparison.numbered.events.length,
      legacyEvents: comparison.legacy.events.length,
      numberedMaxTick: comparison.numbered.maxTick,
      legacyMaxTick: comparison.legacy.maxTick,
      maxTime: Number(comparison.numbered.maxTime.toFixed(3)),
      firstEvent: {
        key: firstNumberedEvent?.k ?? null,
        noteName: firstNumberedEvent?.noteName ?? null,
        frequency: Number(firstNumberedEvent?.frequency?.toFixed?.(3) ?? 0),
        velocity: firstNumberedEvent?.v ?? null,
      },
      parity: comparison.parity,
      playbackConfig,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
