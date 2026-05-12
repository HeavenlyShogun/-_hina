import { normalizeScoreSource } from '../src/utils/score.js';

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

function runExcerptSmokeTest() {
  const source = [
    'M: 5. 5_ 5 0---- | 6- 5- 0---',
    'C: 1- 3- 0--- | 4- 6- 0---',
  ].join('\n');

  const normalized = normalizeScoreSource(source, {
    ...playbackConfig,
    textNotation: 'jianpu',
  });

  const melody = normalized.events.filter((event) => event.trackId === 'M' && !event.isRest);
  const accompaniment = normalized.events.filter((event) => event.trackId === 'C' && !event.isRest);

  assert(melody.length === 5, `Expected 5 melody events, got ${melody.length}.`);
  assert(accompaniment.length === 4, `Expected 4 accompaniment events, got ${accompaniment.length}.`);
  assert(melody[0].durationTicks === 360, `Expected M:5. to last 360 ticks, got ${melody[0].durationTicks}.`);
  assert(melody[1].tick === 360, `Expected M:5_ to start at tick 360, got ${melody[1].tick}.`);
  assert(accompaniment[1].tick === 480, `Expected C:3- to align on beat 2 at tick 480, got ${accompaniment[1].tick}.`);
  assert(melody[2].tick === accompaniment[1].tick, `Expected M third note and C second note to align at tick 480, got M=${melody[2].tick}, C=${accompaniment[1].tick}.`);
  assert(Math.abs((melody[0].v ?? 0) - 0.85) < 0.0001, `Expected melody velocity 0.85, got ${melody[0].v}.`);
  assert(Math.abs((accompaniment[0].v ?? 0) - 0.85) < 0.0001, `Expected accompaniment velocity 0.85, got ${accompaniment[0].v}.`);

  return {
    melody,
    accompaniment,
    tokenLines: normalized?.structure?.tokenLines ?? [],
  };
}

async function main() {
  const excerpt = runExcerptSmokeTest();

  console.log(JSON.stringify({
    excerpt: {
      melodyTicks: excerpt.melody.map((event) => ({ tick: event.tick, durationTicks: event.durationTicks, v: event.v })),
      accompanimentTicks: excerpt.accompaniment.map((event) => ({ tick: event.tick, durationTicks: event.durationTicks, v: event.v })),
      tokenLines: excerpt.tokenLines.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
