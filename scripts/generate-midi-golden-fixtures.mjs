import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import toneMidi from '@tonejs/midi';
import midiFile from 'midi-file';
const { Midi } = toneMidi;
const dir = fileURLToPath(new URL('../tests/fixtures/midi/', import.meta.url));
function make({ name, ppq = 480, tempos = [{ ticks: 0, bpm: 120 }], timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }], tracks }) {
  const midi = new Midi();
  midi.fromJSON({ header: { name, ppq, meta: [], tempos, timeSignatures, keySignatures: [] }, tracks: tracks.map((track) => ({ controlChanges: {}, pitchBends: [], endOfTrackTicks: 0, ...track })) });
  return midi.toArray();
}
function addProgram(bytes, name, tick, channel, programNumber) {
  const data = midiFile.parseMidi(bytes);
  const index = data.tracks.findIndex((events) => events.some((event) => event.type === 'trackName' && event.text === name));
  if (index < 0) throw new Error('Track not found: ' + name);
  let cursor = 0;
  const events = data.tracks[index].map((event) => { cursor += Number(event.deltaTime) || 0; return { ...event, absoluteTick: cursor }; });
  events.push({ type: 'programChange', channel, programNumber, absoluteTick: tick });
  events.sort((a, b) => a.absoluteTick - b.absoluteTick);
  let previous = 0;
  data.tracks[index] = events.map(({ absoluteTick, ...event }) => { const next = { ...event, deltaTime: absoluteTick - previous }; previous = absoluteTick; return next; });
  return Uint8Array.from(midiFile.writeMidi(data));
}
const piano = { family: 'piano', number: 0, name: 'acoustic grand piano' };
const violin = { family: 'strings', number: 40, name: 'violin' };
const fixtures = {
  'basic.mid': make({ name: 'basic', tracks: [{ name: 'Piano', channel: 0, instrument: piano, notes: [{ ticks: 0, durationTicks: 240, midi: 60, velocity: 0.8 }, { ticks: 240, durationTicks: 240, midi: 64, velocity: 0.7 }, { ticks: 480, durationTicks: 480, midi: 67, velocity: 0.9 }] }] }),
  'tempo-map.mid': make({ name: 'tempo-map', ppq: 960, tempos: [{ ticks: 0, bpm: 120 }, { ticks: 120, bpm: 240 }, { ticks: 480, bpm: 72.5 }, { ticks: 1440, bpm: 180 }], timeSignatures: [{ ticks: 0, timeSignature: [4, 4] }, { ticks: 960, timeSignature: [3, 4] }, { ticks: 1920, timeSignature: [7, 8] }], tracks: [{ name: 'Tempo test', channel: 0, instrument: piano, notes: [{ ticks: 0, durationTicks: 120, midi: 60, velocity: 0.7 }, { ticks: 480, durationTicks: 240, midi: 64, velocity: 0.8 }, { ticks: 1440, durationTicks: 480, midi: 67, velocity: 0.9 }] }] }),
  'multi-track.mid': addProgram(make({ name: 'multi-track', tracks: [{ name: 'Piano', channel: 0, instrument: piano, notes: [{ ticks: 0, durationTicks: 480, midi: 60, velocity: 0.8 }, { ticks: 960, durationTicks: 240, midi: 69, velocity: 0.75 }] }, { name: 'Empty track', channel: 1, instrument: violin, notes: [] }, { name: 'Strings', channel: 2, instrument: violin, notes: [{ ticks: 240, durationTicks: 480, midi: 72, velocity: 0.65 }] }] }), 'Piano', 720, 0, 40),
  'drums.mid': make({ name: 'drums', tracks: [{ name: 'Drums', channel: 9, instrument: { family: 'percussion', number: 0, name: 'standard kit' }, notes: [{ ticks: 0, durationTicks: 1, midi: 36, velocity: 1 }, { ticks: 480, durationTicks: 120, midi: 38, velocity: 0.8 }, { ticks: 960, durationTicks: 120, midi: 42, velocity: 0.6 }] }] }),
  'edge-cases.mid': make({ name: 'edge-cases', ppq: 960, tracks: [{ name: 'Edges', channel: 0, instrument: piano, notes: [{ ticks: 1, durationTicks: 1, midi: 48, velocity: 1 / 127 }, { ticks: 120, durationTicks: 1, midi: 60, velocity: 0.5 }, { ticks: 120, durationTicks: 1, midi: 64, velocity: 0.5 }, { ticks: 120, durationTicks: 1, midi: 67, velocity: 0.5 }, { ticks: 480, durationTicks: 240, midi: 72, velocity: 1 }] }] }),
};
await mkdir(dir, { recursive: true });
for (const [name, bytes] of Object.entries(fixtures)) { await writeFile(path.join(dir, name), bytes); console.log(name + ': ' + bytes.length + ' bytes'); }
