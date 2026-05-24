import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import toneMidi from '@tonejs/midi';

const { Midi } = toneMidi;

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
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

function normalizeVelocity(value, fallback = 0.85) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, numeric));
}

function buildTempoMap(tempos, fallbackBpm) {
  const normalizedTempos = [...(Array.isArray(tempos) ? tempos : [])]
    .map((tempo) => [
      Math.max(0, Math.round(Number(tempo?.ticks) || 0)),
      Number(tempo?.bpm) || fallbackBpm,
    ])
    .filter((tempo) => Number.isFinite(tempo[1]) && tempo[1] > 0)
    .sort((left, right) => left[0] - right[0]);

  if (!normalizedTempos.length || normalizedTempos[0][0] !== 0) {
    normalizedTempos.unshift([0, fallbackBpm]);
  }

  return normalizedTempos;
}

function buildTimeSignatures(timeSignatures) {
  return [...(Array.isArray(timeSignatures) ? timeSignatures : [])]
    .map((entry) => {
      const signature = entry?.timeSignature ?? [];
      return [
        Math.max(0, Math.round(Number(entry?.ticks) || 0)),
        Number(signature[0]) || 4,
        Number(signature[1]) || 4,
      ];
    })
    .sort((left, right) => left[0] - right[0]);
}

function getTrackProgramNumber(track) {
  const candidates = [
    track?.instrument?.number,
    track?.instrument?.program,
    track?.instrument?.programNumber,
  ];

  const resolved = candidates
    .map((value) => Number(value))
    .find((value) => Number.isInteger(value) && value >= 0 && value <= 127);

  return Number.isInteger(resolved) ? resolved : null;
}

async function main() {
  const input = getArg('input');
  const output = getArg('output');

  if (!input || !output) {
    throw new Error('Usage: node scripts/slim-midi-score.mjs --input=<file.mid> --output=<score-slim.json> [--id=<id>] [--title=<title>] [--display-title=<title>] [--bpm=<number>] [--delete-input]');
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
  const resolution = Math.max(1, Math.round(Number(midi.header.ppq) || 480));
  const requestedBpm = Number(getArg('bpm'));
  const bpm = requestedBpm || Number(midi.header.tempos?.[0]?.bpm) || 120;
  const tempos = requestedBpm ? [{ ticks: 0, bpm: requestedBpm }] : midi.header.tempos;
  const firstTimeSignature = midi.header.timeSignatures?.[0]?.timeSignature ?? [];
  const timeSigNum = Number(firstTimeSignature[0]) || 4;
  const timeSigDen = Number(firstTimeSignature[1]) || 4;
  const activeTracks = midi.tracks.filter((track) => Array.isArray(track.notes) && track.notes.length > 0);

  if (!activeTracks.length) {
    throw new Error(`No note tracks found in ${input}`);
  }

  const tracks = activeTracks.map((track, index) => [
    track.name?.trim() || `track-${index + 1}`,
    Number(track.channel ?? 0),
    track.instrument?.name || 'unknown',
    getTrackProgramNumber(track),
    track.instrument?.family || null,
  ]);

  const notes = activeTracks
    .flatMap((track, trackIndex) => track.notes.map((note) => [
      Math.max(0, Math.round(Number(note.ticks) || 0)),
      Math.max(1, Math.round(Number(note.durationTicks) || 0)),
      Math.max(0, Math.round(Number(note.midi) || 0)),
      Number(normalizeVelocity(note.velocity).toFixed(4)),
      trackIndex,
    ]))
    .sort((left, right) => (
      left[0] - right[0]
      || left[4] - right[4]
      || left[2] - right[2]
      || left[1] - right[1]
    ));

  const slimScore = {
    version: '3.2-ultra-slim',
    columns: ['startTick', 'durationTicks', 'note', 'velocity', 'trackId'],
    meta: {
      id,
      title,
      displayTitle,
      sourceType: 'midi',
      originalFormat: 'midi',
      storageFormat: 'hina-slim-score@3.2',
      fileName,
      importedFrom: `file:///${input.replace(/\\/g, '/')}`,
      migratedAt: new Date().toISOString(),
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
      tempoMap: buildTempoMap(tempos, bpm),
    },
    source: {
      midi: [
        fileName,
        resolution,
        midi.header.format,
        midi.tracks.length,
        buildTimeSignatures(midi.header.timeSignatures),
      ],
    },
    tracks,
    notes,
  };

  const payload = JSON.stringify(slimScore);
  await writeFile(output, `${payload}\n`, 'utf8');

  if (hasFlag('delete-input')) {
    await rm(input);
  }

  console.log(`Wrote ${output}`);
  console.log(`Notes: ${notes.length}, tracks: ${tracks.length}, bytes: ${Buffer.byteLength(payload, 'utf8')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
