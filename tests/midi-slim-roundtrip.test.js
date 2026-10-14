import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import toneMidi from '@tonejs/midi';
import midiFile from 'midi-file';
import { midiBytesToSlim, parseMidiToSlim } from '../src/utils/midiToSlim.js';
import { normalizeScoreSource } from '../src/utils/score.js';
import { scoreJsonToMidi, scoreJsonToMidiBytes } from '../src/utils/scoreToMidi.js';
import { applyPlaybackMode } from '../src/utils/scoreModeFilter.js';

const { Midi } = toneMidi;
const { parseMidi, writeMidi } = midiFile;

function asArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function insertProgramChange(bytes, trackName, tick, channel, programNumber) {
  const midiData = midiFile.parseMidi(bytes);
  const trackIndex = midiData.tracks.findIndex((track) => track.some((event) => event.type === 'trackName' && event.text === trackName));
  if (trackIndex < 0) throw new Error('Track not found: ' + trackName);
  const events = midiData.tracks[trackIndex];
  let absoluteTick = 0;
  const absoluteEvents = events.map((event) => {
    absoluteTick += Number(event.deltaTime) || 0;
    return { ...event, absoluteTick };
  });
  absoluteEvents.push({ type: 'programChange', channel, programNumber, absoluteTick: tick });
  absoluteEvents.sort((left, right) => left.absoluteTick - right.absoluteTick);
  let previousTick = 0;
  midiData.tracks[trackIndex] = absoluteEvents.map(({ absoluteTick: currentTick, ...event }) => {
    const nextEvent = { ...event, deltaTime: currentTick - previousTick };
    previousTick = currentTick;
    return nextEvent;
  });
  return Uint8Array.from(midiFile.writeMidi(midiData));
}

function createFixture(ppq) {
  const midi = new Midi();
  midi.fromJSON({
    header: {
      name: 'round-trip-fixture',
      ppq,
      meta: [],
      tempos: [
        { ticks: 0, bpm: 120 },
        { ticks: 1, bpm: 240 },
        { ticks: ppq, bpm: 72.5 },
        { ticks: ppq * 3, bpm: 180 },
      ],
      timeSignatures: [
        { ticks: 0, timeSignature: [4, 4] },
        { ticks: ppq, timeSignature: [3, 4] },
        { ticks: ppq * 2, timeSignature: [7, 8] },
      ],
      keySignatures: [],
    },
    tracks: [
      {
        name: 'Piano',
        channel: 0,
        instrument: { family: 'piano', number: 0, name: 'acoustic grand piano' },
        notes: [
          { ticks: 1, durationTicks: 1, midi: 60, velocity: 1 / 127 },
          { ticks: ppq, durationTicks: ppq / 2, midi: 64, velocity: 1 },
          { ticks: ppq, durationTicks: 1, midi: 67, velocity: 0.5 },
          { ticks: ppq * 2 + 1, durationTicks: 3, midi: 69, velocity: 0.6 },
        ],
        controlChanges: {},
        pitchBends: [],
        endOfTrackTicks: ppq * 2,
      },
      {
        name: 'Empty track',
        channel: 1,
        instrument: { family: 'strings', number: 40, name: 'violin' },
        notes: [],
        controlChanges: {},
        pitchBends: [],
        endOfTrackTicks: ppq * 2,
      },
      {
        name: 'Strings',
        channel: 2,
        instrument: { family: 'strings', number: 40, name: 'violin' },
        notes: [
          { ticks: ppq + 12, durationTicks: 3, midi: 72, velocity: 0.25 },
          { ticks: ppq * 2, durationTicks: ppq / 8, midi: 76, velocity: 0.75 },
        ],
        controlChanges: {},
        pitchBends: [],
        endOfTrackTicks: ppq * 3,
      },
      {
        name: 'Drums',
        channel: 9,
        instrument: { family: 'percussion', number: 0, name: 'standard kit' },
        notes: [
          { ticks: ppq * 2, durationTicks: 1, midi: 36, velocity: 1 },
          { ticks: ppq * 2, durationTicks: ppq / 4, midi: 38, velocity: 127 / 127 },
        ],
        controlChanges: {},
        pitchBends: [],
        endOfTrackTicks: ppq * 3,
      },
    ],
  });
  return midi;
}

function noteTuples(midi) {
  return midi.tracks.flatMap((track) => track.notes.map((note) => [
    Math.round(note.ticks),
    Math.round(note.durationTicks),
    note.midi,
    Number(note.velocity.toFixed(4)),
  ])).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}

function tempoTuples(midi) {
  return midi.header.tempos.map((tempo) => [Math.round(tempo.ticks), Number(tempo.bpm.toFixed(4))]);
}

function timeSignatureTuples(midi) {
  return midi.header.timeSignatures.map((entry) => [
    Math.round(entry.ticks),
    entry.timeSignature[0],
    entry.timeSignature[1],
  ]);
}

for (const ppq of [96, 480, 960]) {
  test('MIDI -> Slim -> Runtime -> MIDI preserves ppq ' + ppq, async () => {
    const source = createFixture(ppq);
    const sourceBytes = insertProgramChange(source.toArray(), 'Piano', ppq * 2, 0, 40);
    const sourceReloaded = new Midi(asArrayBuffer(sourceBytes));
    const slim = await parseMidiToSlim(asArrayBuffer(sourceBytes), { fileName: 'round-trip.mid' });

    assert.equal(slim.version, '3.2-ultra-slim');
    assert.equal(slim.transport.resolution, ppq);
    assert.equal(slim.tracks.length, 5);
    assert.equal(slim.tracks[2][0], 'Empty track');
    assert.equal(slim.tracks[1][3], 40);
    assert.equal(slim.tracks[4][1], 9);
    assert.equal(slim.notes.length, 8);

    const runtime = normalizeScoreSource(slim);
    assert.equal(runtime.events.length, 8);
    assert.equal(runtime.events.filter((event) => event.isPercussion).length, 2);
    assert.equal(applyPlaybackMode(runtime, 'solo').events.some((event) => event.isPercussion), false);
    assert.deepEqual(
      runtime.events.map((event) => [event.tick, event.durationTicks, event.midi, Number(event.v.toFixed(4)), Number(event.trackId)]),
      slim.notes.map(([tick, duration, midi, velocity, trackId]) => [tick, duration, midi, velocity, trackId]),
    );

    const runtimeScore = {
      ...slim,
      notes: runtime.events.map((event) => [event.tick, event.durationTicks, event.midi, event.v, Number(event.trackId)]),
    };
    const exported = scoreJsonToMidi(runtimeScore);
    const roundTripped = new Midi(asArrayBuffer(exported.toArray()));
    assert.equal(roundTripped.header.ppq, ppq);
    assert.deepEqual(noteTuples(roundTripped), noteTuples(sourceReloaded));
    assert.deepEqual(tempoTuples(roundTripped), tempoTuples(sourceReloaded));
    assert.deepEqual(timeSignatureTuples(roundTripped), timeSignatureTuples(sourceReloaded));
    assert.equal(roundTripped.tracks.length, 5);
    assert.deepEqual(
      roundTripped.tracks.map((track) => [track.name, track.channel, track.instrument.number]),
      [['Piano', 0, 0], ['Piano [40]', 0, 40], ['Empty track', 0, 40], ['Strings', 2, 40], ['Drums', 9, 0]],
    );
    assert.equal(exported.tracks[2].channel, 1);
    const exportedEvents = parseMidi(exported.toArray()).tracks;
    const pianoProgramChange = exportedEvents.flat().find((event) => event.type === 'programChange' && event.programNumber === 40);
    const emptyTrackProgramChange = exportedEvents.find((events) => events.some((event) => event.type === 'trackName' && event.text === 'Empty track'))?.find((event) => event.type === 'programChange');
    assert.equal(pianoProgramChange?.channel, 0);
    assert.equal(emptyTrackProgramChange?.channel, 1);
    assert.equal(roundTripped.tracks.find((track) => track.notes.some((note) => note.midi === 69))?.instrument.number, 40);
  });
}

const goldenFixtures = [
  ['basic.mid', { notes: 3, tracks: 1 }],
  ['tempo-map.mid', { notes: 3, tracks: 1, tempos: 4, timeSignatures: 3 }],
  ['multi-track.mid', { notes: 3, tracks: 4, program40: true, emptyTrack: true }],
  ['drums.mid', { notes: 3, tracks: 1, drums: true }],
  ['edge-cases.mid', { notes: 5, tracks: 1, edgeNotes: true }],
];

for (const [fileName, expected] of goldenFixtures) {
  test('golden MIDI fixture round-trips: ' + fileName, async () => {
    const sourceBytes = await readFile(new URL('./fixtures/midi/' + fileName, import.meta.url));
    const source = new Midi(asArrayBuffer(sourceBytes));
    const slim = await parseMidiToSlim(asArrayBuffer(sourceBytes), { fileName });
    const runtime = normalizeScoreSource(slim);
    const runtimeScore = { ...slim, notes: runtime.events.map((event) => [event.tick, event.durationTicks, event.midi, event.v, Number(event.trackId)]) };
    const exported = scoreJsonToMidi(runtimeScore);
    const result = new Midi(asArrayBuffer(exported.toArray()));

    assert.equal(slim.notes.length, expected.notes);
    assert.equal(slim.tracks.length, expected.tracks);
    assert.equal(runtime.events.length, expected.notes);
    assert.deepEqual(noteTuples(result), noteTuples(source));
    assert.deepEqual(tempoTuples(result), tempoTuples(source));
    assert.deepEqual(timeSignatureTuples(result), timeSignatureTuples(source));
    if (expected.tempos) assert.equal(slim.playback.tempoMap.length, expected.tempos);
    if (expected.timeSignatures) assert.equal(slim.source.midi[4].length, expected.timeSignatures);
    if (expected.program40) assert.ok(slim.tracks.some((track) => track[3] === 40));
    if (expected.emptyTrack) assert.ok(slim.tracks.some((track) => track[0] === 'Empty track'));
    if (expected.drums) assert.ok(runtime.events.every((event) => event.isPercussion));
    if (expected.edgeNotes) {
      assert.ok(slim.notes.some((note) => note[0] === 1 && note[1] === 1 && note[2] === 48));
      assert.ok(slim.notes.filter((note) => note[0] === 120).length === 3);
      assert.equal(Math.min(...slim.notes.map((note) => note[3])), Number((1 / 127).toFixed(4)));
      assert.equal(Math.max(...slim.notes.map((note) => note[3])), 1);
    }
  });
}

function rawFixture(tracks, format = 1) {
  return writeMidi({
    header: { format, numTracks: tracks.length, ticksPerBeat: 480 },
    tracks: tracks.map((events) => {
      let last = 0;
      return [...events, { type: 'endOfTrack', deltaTime: 0 }].map((event) => {
        const copy = { ...event, deltaTime: (event.tick ?? last) - last };
        last = event.tick ?? last;
        delete copy.tick;
        return copy;
      });
    }),
  });
}

const roundTripMeta = { type: 'trackName', text: 'Piano', deltaTime: 0 };
const programChange = (tick, channel, programNumber) => ({ type: 'programChange', tick, channel, programNumber });
const noteOn = (tick, channel, noteNumber, velocity = 90) => ({ type: 'noteOn', tick, channel, noteNumber, velocity });
const noteOff = (tick, channel, noteNumber) => ({ type: 'noteOff', tick, channel, noteNumber, velocity: 0 });

function roundTrip(tracks) {
  const original = rawFixture(tracks);
  const first = midiBytesToSlim(original);
  const exported = scoreJsonToMidiBytes(first);
  const raw = parseMidi(exported);
  const second = midiBytesToSlim(exported);
  const canonical = (score) => score.notes.map((note) => [
    note[0], note[1], note[2], note[3], score.tracks[note[4]][1],
    score.tracks[note[4]][3], score.tracks[note[4]][5],
  ]).sort((a, b) => a[6] - b[6] || a[0] - b[0] || a[2] - b[2]);
  assert.deepEqual(canonical(second), canonical(first));
  const changes = (score) => [...new Map(score.tracks.flatMap((track) => track[6] || [])
    .map((change) => [JSON.stringify(change), change])).values()]
    .sort((a, b) => a.tick - b.tick || a.order - b.order || a.channel - b.channel);
  assert.deepEqual(changes(second), changes(first));
  assert.equal(raw.tracks.length, parseMidi(original).tracks.length);
  return { first, exported, raw, second };
}

function notesFor(score, sourceTrackIndex) {
  return score.notes.filter((note) => score.tracks[note[4]][5] === sourceTrackIndex);
}

test('same named tracks remain distinct by original index', () => {
  const { first: score } = roundTrip([
    [roundTripMeta, noteOn(0, 0, 60), noteOff(120, 0, 60)],
    [roundTripMeta, noteOn(0, 0, 60), noteOff(240, 0, 60)],
  ]);
  assert.deepEqual(notesFor(score, 0).map((note) => [note[0], note[1], note[2]]), [[0, 120, 60]]);
  assert.deepEqual(notesFor(score, 1).map((note) => [note[0], note[1], note[2]]), [[0, 240, 60]]);
});

test('format 1 tempo-only leading track does not shift source indexes', () => {
  const { first: score } = roundTrip([
    [{ type: 'setTempo', tick: 0, microsecondsPerBeat: 500000 }],
    [roundTripMeta, noteOn(0, 0, 60), noteOff(120, 0, 60)],
    [roundTripMeta, noteOn(0, 0, 62), noteOff(240, 0, 62)],
  ]);
  assert.equal(score.tracks[0][5], 1);
  assert.equal(score.tracks[1][5], 2);
});

test('program changes split notes while preserving source metadata', () => {
  const { first: score, second } = roundTrip([[
    roundTripMeta, programChange(0, 0, 0), noteOn(0, 0, 60), noteOff(100, 0, 60),
    programChange(480, 0, 48), noteOn(480, 0, 64), noteOff(600, 0, 64),
  ]]);
  assert.deepEqual(score.notes.map((note) => [note[0], score.tracks[note[4]][3]]), [[0, 0], [480, 48]]);
  assert.deepEqual(score.tracks[0][6], [
    { tick: 0, order: 1, channel: 0, programNumber: 0 },
    { tick: 480, order: 4, channel: 0, programNumber: 48 },
  ]);
  assert.deepEqual(second.tracks.map((track) => track[6]), score.tracks.map((track) => track[6]));
});

test('same tick program changes are applied in source event order', () => {
  const { first: score, raw } = roundTrip([[
    roundTripMeta, programChange(0, 0, 10), programChange(240, 0, 24),
    programChange(240, 0, 25), noteOn(240, 0, 60), programChange(240, 0, 26),
    noteOff(360, 0, 60), noteOn(600, 0, 62), programChange(600, 0, 27), noteOff(720, 0, 62),
  ]]);
  assert.equal(score.tracks[score.notes[0][4]][3], 25);
  assert.deepEqual(score.tracks[0][6].filter((event) => event.tick === 240)
    .map((event) => [event.tick, event.order, event.programNumber]), [[240, 2, 24], [240, 3, 25], [240, 5, 26]]);
  let tick = 0;
  const sameTick = raw.tracks[0].map((event) => {
    tick += event.deltaTime || 0;
    return { ...event, tick };
  }).filter((event) => event.tick === 240 && ['programChange', 'noteOn'].includes(event.type));
  assert.deepEqual(sameTick.map((event) => [event.type, event.programNumber ?? event.noteNumber]), [
    ['programChange', 24], ['programChange', 25], ['noteOn', 60], ['programChange', 26],
  ]);
  const laterNote = score.notes.find((note) => note[2] === 62);
  assert.equal(score.tracks[laterNote[4]][3], 26);
});

test('channels on one source track have independent program state', () => {
  const { first: score } = roundTrip([[
    roundTripMeta, programChange(0, 0, 48), noteOn(0, 0, 60), noteOn(0, 9, 36),
    noteOff(100, 0, 60), noteOff(100, 9, 36),
  ]]);
  const melodic = score.tracks.find((track) => track[1] === 0);
  const drums = score.tracks.find((track) => track[1] === 9);
  assert.equal(melodic[3], 48);
  assert.equal(drums[3], 0);
  assert.equal(notesFor(score, 0).length, 2);
});

test('note off after a program change closes the original FIFO note', () => {
  const { first: score } = roundTrip([[
    roundTripMeta, programChange(0, 0, 0), noteOn(240, 0, 60),
    programChange(480, 0, 48), noteOff(960, 0, 60),
  ]]);
  assert.equal(score.notes.length, 1);
  assert.deepEqual(score.notes[0].slice(0, 4), [240, 720, 60, Number((90 / 127).toFixed(4))]);
  assert.equal(score.tracks[score.notes[0][4]][3], 0);
});
