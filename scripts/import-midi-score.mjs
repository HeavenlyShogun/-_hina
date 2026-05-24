import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import toneMidi from '@tonejs/midi';

const { Midi } = toneMidi;

const PROJECT_KEYS = [
  { noteName: 'C3', midi: 48, key: 'z' },
  { noteName: 'D3', midi: 50, key: 'x' },
  { noteName: 'E3', midi: 52, key: 'c' },
  { noteName: 'F3', midi: 53, key: 'v' },
  { noteName: 'G3', midi: 55, key: 'b' },
  { noteName: 'A3', midi: 57, key: 'n' },
  { noteName: 'B3', midi: 59, key: 'm' },
  { noteName: 'C4', midi: 60, key: 'a' },
  { noteName: 'D4', midi: 62, key: 's' },
  { noteName: 'E4', midi: 64, key: 'd' },
  { noteName: 'F4', midi: 65, key: 'f' },
  { noteName: 'G4', midi: 67, key: 'g' },
  { noteName: 'A4', midi: 69, key: 'h' },
  { noteName: 'B4', midi: 71, key: 'j' },
  { noteName: 'C5', midi: 72, key: 'q' },
  { noteName: 'D5', midi: 74, key: 'w' },
  { noteName: 'E5', midi: 76, key: 'e' },
  { noteName: 'F5', midi: 77, key: 'r' },
  { noteName: 'G5', midi: 79, key: 't' },
  { noteName: 'A5', midi: 81, key: 'y' },
  { noteName: 'B5', midi: 83, key: 'u' },
];

const KEY_USAGE = Object.fromEntries(PROJECT_KEYS.map((entry) => [entry.key, 0]));

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function slugify(value) {
  return String(value || 'score')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'score';
}

function stripExtension(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/u, '');
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((Number(midi) - 69) / 12);
}

function nearestProjectKey(midi) {
  const numericMidi = Number(midi);
  let nearest = PROJECT_KEYS[0];
  let nearestDistance = Math.abs(numericMidi - nearest.midi);

  PROJECT_KEYS.forEach((entry) => {
    const distance = Math.abs(numericMidi - entry.midi);
    if (distance < nearestDistance) {
      nearest = entry;
      nearestDistance = distance;
    }
  });

  return {
    ...nearest,
    distance: numericMidi - nearest.midi,
    clampedLow: numericMidi < PROJECT_KEYS[0].midi,
    clampedHigh: numericMidi > PROJECT_KEYS[PROJECT_KEYS.length - 1].midi,
  };
}

function normalizeVelocity(value, fallback = 0.85) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, numeric));
}

function buildTempoMap(tempos, fallbackBpm, resolution) {
  const normalizedTempos = [...(Array.isArray(tempos) ? tempos : [])]
    .map((tempo) => ({
      startTick: Math.max(0, Math.round(Number(tempo?.ticks) || 0)),
      bpm: Number(tempo?.bpm) || fallbackBpm,
    }))
    .filter((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0)
    .sort((left, right) => left.startTick - right.startTick);

  if (!normalizedTempos.length || normalizedTempos[0].startTick !== 0) {
    normalizedTempos.unshift({ startTick: 0, bpm: fallbackBpm });
  }

  return normalizedTempos.map((tempo) => ({
    ...tempo,
    secondsPerTick: (60 / tempo.bpm) / resolution,
  }));
}

async function main() {
  const input = getArg('input');
  const output = getArg('output');

  if (!input || !output) {
    throw new Error('Usage: node scripts/import-midi-score.mjs --input=<file.mid> --output=<score.json> [--id=<id>] [--title=<title>] [--display-title=<title>]');
  }

  const fileBuffer = await readFile(input);
  const midi = new Midi(fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  ));
  const fileName = path.basename(input);
  const title = getArg('title', stripExtension(input));
  const id = getArg('id', slugify(title));
  const displayTitle = getArg('display-title', title);
  const tempo = midi.header.tempos?.[0]?.bpm;
  const bpm = Number(tempo) || 120;
  const firstTimeSignature = midi.header.timeSignatures?.[0]?.timeSignature ?? [];
  const timeSigNum = Number(firstTimeSignature[0]) || 4;
  const timeSigDen = Number(firstTimeSignature[1]) || 4;
  const resolution = Math.max(1, Math.round(Number(midi.header.ppq) || 480));
  const tracks = midi.tracks.filter((track) => Array.isArray(track.notes) && track.notes.length > 0);

  if (!tracks.length) {
    throw new Error(`No note tracks found in ${input}`);
  }

  const stats = {
    total: 0,
    exactNatural: 0,
    nearestMapped: 0,
    clampedLow: 0,
    clampedHigh: 0,
    minMidi: Infinity,
    maxMidi: -Infinity,
    keyUsage: { ...KEY_USAGE },
  };

  const score = {
    version: '2.0',
    meta: {
      id,
      title,
      displayTitle,
      sourceType: 'midi',
      originalFormat: 'midi',
      fileName,
      importedFrom: `file:///${input.replace(/\\/g, '/')}`,
      migratedAt: new Date().toISOString(),
      visualMapping: {
        strategy: 'nearest-project-key-preserve-midi-frequency',
        source: fileName,
        keyRange: `${PROJECT_KEYS[0].noteName}-${PROJECT_KEYS[PROJECT_KEYS.length - 1].noteName}`,
        note: 'Audio keeps the original MIDI frequency and timing. The visual key is the nearest available project piano key.',
        stats,
      },
    },
    transport: {
      bpm,
      timeSigNum,
      timeSigDen,
      resolution,
    },
    playback: {
      tone: 'midi-original',
      globalKeyOffset: 0,
      scaleMode: 'major',
      reverb: true,
      accidentals: {},
      tempoMap: buildTempoMap(midi.header.tempos, bpm, resolution),
    },
    source: {
      rawText: '',
      midi: {
        fileName,
        ppq: resolution,
        format: midi.header.format,
        tracks: midi.tracks.length,
        tempos: midi.header.tempos ?? [],
        timeSignatures: midi.header.timeSignatures ?? [],
      },
    },
    tracks: tracks.map((track, trackIndex) => ({
      id: track.name?.trim() || `track-${trackIndex + 1}`,
      name: track.name?.trim() || `Track ${trackIndex + 1}`,
      mute: false,
      channel: Number(track.channel ?? 0),
      instrument: track.instrument?.name || 'unknown',
      events: [...track.notes]
        .sort((left, right) => left.ticks - right.ticks)
        .map((note, noteIndex) => {
          const midiNumber = Number(note.midi);
          const visual = nearestProjectKey(midiNumber);
          const tick = Math.max(0, Math.round(Number(note.ticks) || 0));
          const durationTicks = Math.max(1, Math.round(Number(note.durationTicks) || 0));
          const noteName = note.name || `${note.pitch ?? ''}${note.octave ?? ''}`;

          stats.total += 1;
          stats.minMidi = Math.min(stats.minMidi, midiNumber);
          stats.maxMidi = Math.max(stats.maxMidi, midiNumber);
          stats.keyUsage[visual.key] += 1;
          if (visual.distance === 0) {
            stats.exactNatural += 1;
          } else {
            stats.nearestMapped += 1;
          }
          if (visual.clampedLow) {
            stats.clampedLow += 1;
          }
          if (visual.clampedHigh) {
            stats.clampedHigh += 1;
          }

          return {
            id: `${trackIndex + 1}-${noteIndex + 1}`,
            type: 'note',
            tick,
            startTick: tick,
            duration: durationTicks,
            durationTicks,
            key: visual.key,
            velocity: normalizeVelocity(note.velocity),
            frequency: Number(midiToFrequency(midiNumber).toFixed(6)),
            midi: midiNumber,
            noteName,
            pitchClass: note.pitch ?? noteName.replace(/\d+/g, ''),
            octave: Number(note.octave),
            visualKey: visual.key,
            visualMidi: visual.midi,
            visualNoteName: visual.noteName,
            visualSemitoneDistance: visual.distance,
          };
        }),
    })),
  };

  if (stats.minMidi === Infinity) {
    stats.minMidi = null;
    stats.maxMidi = null;
  }

  await writeFile(output, `${JSON.stringify(score, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${output}`);
  console.log(`Notes: ${stats.total}, exact: ${stats.exactNatural}, mapped: ${stats.nearestMapped}, low clamp: ${stats.clampedLow}, high clamp: ${stats.clampedHigh}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
