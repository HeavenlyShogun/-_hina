import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import toneMidi from '@tonejs/midi';
import { parseMidiToSlim } from '../src/utils/midiToSlim.js';
import { normalizeScoreSource } from '../src/utils/score.js';
import { scoreJsonToMidiBytes } from '../src/utils/scoreToMidi.js';
const { Midi } = toneMidi;
const sourceDirectory = fileURLToPath(new URL('../tests/fixtures/midi/', import.meta.url));
const outputDirectory = path.join(sourceDirectory, 'roundtrip');
await mkdir(outputDirectory, { recursive: true });
for (const fileName of ['basic.mid', 'tempo-map.mid', 'multi-track.mid', 'drums.mid', 'edge-cases.mid']) {
  const bytes = await readFile(path.join(sourceDirectory, fileName));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const slim = await parseMidiToSlim(buffer, { fileName });
  const runtime = normalizeScoreSource(slim);
  const runtimeScore = { ...slim, notes: runtime.events.map((event) => [event.tick, event.durationTicks, event.midi, event.v, Number(event.trackId)]) };
  await writeFile(path.join(outputDirectory, fileName), scoreJsonToMidiBytes(runtimeScore));
  console.log('Exported Runtime MIDI: ' + fileName);
}
