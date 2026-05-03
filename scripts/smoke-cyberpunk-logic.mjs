import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeScoreSource } from '../src/utils/score.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scoreDir = path.join(repoRoot, '風物之琴譜', '可匯入譜面');

const CYBERPUNK_NUMBERED_PATH = path.join(scoreDir, '我永遠想待在你的房子裡.txt');
const CYBERPUNK_LEGACY_PATH = path.join(scoreDir, '我永遠想待在你的房子裡.legacy.bak.txt');

const playbackConfig = {
  bpm: 125,
  timeSigNum: 4,
  timeSigDen: 4,
  charResolution: 16,
  globalKeyOffset: 0,
  scaleMode: 'major',
  tone: 'piano',
  reverb: true,
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripMeta(rawText) {
  return String(rawText ?? '').replace(/^\uFEFF/u, '').split(/\r?\n/u).slice(1).join('\n');
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
  const [numberedRaw, legacyRaw] = await Promise.all([
    readFile(CYBERPUNK_NUMBERED_PATH, 'utf8'),
    readFile(CYBERPUNK_LEGACY_PATH, 'utf8'),
  ]);

  const numbered = normalizeScoreSource(stripMeta(numberedRaw), {
    ...playbackConfig,
    textNotation: 'jianpu',
  });
  const legacy = normalizeScoreSource(stripMeta(legacyRaw), {
    ...playbackConfig,
    textNotation: 'legacy-beat',
    legacyTimingMode: 'beat',
  });

  const numberedEvents = numbered.events.filter((event) => !event.isRest);
  const legacyEvents = legacy.events.filter((event) => !event.isRest);

  assert(numberedEvents.length === legacyEvents.length, `Expected numbered/legacy event counts to match, got ${numberedEvents.length} vs ${legacyEvents.length}.`);
  assert(numberedEvents.length > 900, `Expected dense multi-track arrangement, got only ${numberedEvents.length} note events.`);
  assert(numbered.maxTime >= legacy.maxTime * 0.99, `Expected numbered score length to stay close to legacy, got ${numbered.maxTime} vs ${legacy.maxTime}.`);

  const trackIds = [...new Set(numbered.events.map((event) => event.trackId).filter(Boolean))];
  assert(trackIds.includes('M'), `Expected numbered score to contain melody track M, got ${trackIds.join(', ')}.`);
  assert(trackIds.includes('C1'), `Expected numbered score to retain accompaniment track C1, got ${trackIds.join(', ')}.`);
  assert(trackIds.includes('C2'), `Expected numbered score to retain accompaniment track C2, got ${trackIds.join(', ')}.`);

  const openingWindow = numberedEvents.filter((event) => event.tick <= 2);
  assert(openingWindow.length >= 2, `Expected opening chord overlap to survive conversion, got ${openingWindow.length} events in the first 2 ticks.`);
  const openingKeys = openingWindow.map((event) => event.k).sort().join(',');
  assert(openingKeys === 'a,v', `Expected opening overlap to be keys a and v, got ${openingKeys}.`);

  const firstMelodyEvent = numbered.events.find((event) => event.trackId === 'M' && !event.isRest);
  assert(firstMelodyEvent?.noteName === 'F3', `Expected first melody note to resolve to F3, got ${firstMelodyEvent?.noteName}.`);
  assert(Math.abs(Number(firstMelodyEvent?.frequency ?? 0) - 174.614) < 0.01, `Expected first melody note frequency to stay near 174.614 Hz, got ${firstMelodyEvent?.frequency}.`);

  return {
    numberedEvents,
    legacyEvents,
    trackIds,
    firstMelodyEvent: {
      key: firstMelodyEvent?.k ?? null,
      noteName: firstMelodyEvent?.noteName ?? null,
      frequency: Number(firstMelodyEvent?.frequency?.toFixed?.(3) ?? firstMelodyEvent?.frequency ?? 0),
      trackId: firstMelodyEvent?.trackId ?? null,
    },
  };
}

async function main() {
  const excerpt = runExcerptSmokeTest();
  const comparison = await runCyberpunkComparison();

  console.log(JSON.stringify({
    excerpt: {
      melodyTicks: excerpt.melody.map((event) => ({ tick: event.tick, durationTicks: event.durationTicks, v: event.v })),
      accompanimentTicks: excerpt.accompaniment.map((event) => ({ tick: event.tick, durationTicks: event.durationTicks, v: event.v })),
      tokenLines: excerpt.tokenLines.length,
    },
    cyberpunk: {
      numberedEvents: comparison.numberedEvents.length,
      legacyEvents: comparison.legacyEvents.length,
      firstEvent: comparison.firstMelodyEvent,
      trackIds: comparison.trackIds,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
