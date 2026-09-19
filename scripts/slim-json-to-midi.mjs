import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import toneMidi from '@tonejs/midi';

const { Midi } = toneMidi;

const DEFAULT_SLIM_DIR = '風物之琴譜/縮小版可匯入譜面/slim-json';
const DEFAULT_MIDI_DIR = '風物之琴譜/縮小版可匯入譜面/midi';
const DEFAULT_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function stripExtension(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/u, '');
}

function slugFromSlimFilename(filename) {
  return path.basename(filename).replace(/-slim\.json$/iu, '');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVelocity(value, fallback = 0.85) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return clamp(numeric > 1 ? numeric / 127 : numeric, 0, 1);
}

function normalizeTempoMap(score, fallbackBpm) {
  const tempoMap = score?.playback?.tempoMap;
  const tempos = Array.isArray(tempoMap)
    ? tempoMap.map((entry) => ({
      ticks: Math.max(0, Math.round(Number(Array.isArray(entry) ? entry[0] : entry?.ticks) || 0)),
      bpm: Number(Array.isArray(entry) ? entry[1] : entry?.bpm) || fallbackBpm,
    }))
    : [];

  const validTempos = tempos
    .filter((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0)
    .sort((left, right) => left.ticks - right.ticks);

  if (!validTempos.length || validTempos[0].ticks !== 0) {
    validTempos.unshift({ ticks: 0, bpm: fallbackBpm });
  }

  return validTempos;
}

function normalizeTimeSignatures(score, timeSigNum, timeSigDen) {
  const sourceSignatures = score?.source?.midi?.[4];
  const signatures = Array.isArray(sourceSignatures)
    ? sourceSignatures.map((entry) => ({
      ticks: Math.max(0, Math.round(Number(Array.isArray(entry) ? entry[0] : entry?.ticks) || 0)),
      timeSignature: [
        Number(Array.isArray(entry) ? entry[1] : entry?.timeSignature?.[0]) || timeSigNum,
        Number(Array.isArray(entry) ? entry[2] : entry?.timeSignature?.[1]) || timeSigDen,
      ],
    }))
    : [];

  if (!signatures.length || signatures[0].ticks !== 0) {
    signatures.unshift({ ticks: 0, timeSignature: [timeSigNum, timeSigDen] });
  }

  return signatures.sort((left, right) => left.ticks - right.ticks);
}

function getTrackMetadata(score, trackId, index) {
  const tracks = Array.isArray(score?.tracks) ? score.tracks : [];
  const rawTrack = tracks[trackId] ?? tracks[index] ?? null;

  if (Array.isArray(rawTrack)) {
    return {
      name: rawTrack[0] || `Track ${index + 1}`,
      channel: Number.isInteger(Number(rawTrack[1])) ? clamp(Number(rawTrack[1]), 0, 15) : DEFAULT_CHANNELS[index % DEFAULT_CHANNELS.length],
      instrumentName: rawTrack[2] || 'acoustic grand piano',
      programNumber: Number.isInteger(Number(rawTrack[3])) ? clamp(Number(rawTrack[3]), 0, 127) : 0,
      instrumentFamily: rawTrack[4] || 'piano',
    };
  }

  if (rawTrack && typeof rawTrack === 'object') {
    return {
      name: rawTrack.name || rawTrack.id || `Track ${index + 1}`,
      channel: Number.isInteger(Number(rawTrack.channel)) ? clamp(Number(rawTrack.channel), 0, 15) : DEFAULT_CHANNELS[index % DEFAULT_CHANNELS.length],
      instrumentName: rawTrack.instrument || 'acoustic grand piano',
      programNumber: Number.isInteger(Number(rawTrack.programNumber)) ? clamp(Number(rawTrack.programNumber), 0, 127) : 0,
      instrumentFamily: rawTrack.instrumentFamily || 'piano',
    };
  }

  return {
    name: `Track ${index + 1}`,
    channel: DEFAULT_CHANNELS[index % DEFAULT_CHANNELS.length],
    instrumentName: 'acoustic grand piano',
    programNumber: 0,
    instrumentFamily: 'piano',
  };
}

function normalizeSlimNotes(score) {
  if (Array.isArray(score?.notes)) {
    return score.notes
      .map((note) => ({
        ticks: Math.max(0, Math.round(Number(note?.[0]) || 0)),
        durationTicks: Math.max(1, Math.round(Number(note?.[1]) || 0)),
        midi: clamp(Math.round(Number(note?.[2]) || 0), 0, 127),
        velocity: normalizeVelocity(note?.[3]),
        trackId: Math.max(0, Math.round(Number(note?.[4]) || 0)),
      }))
      .filter((note) => Number.isFinite(note.midi));
  }

  const tracks = Array.isArray(score?.tracks) ? score.tracks : [];
  return tracks.flatMap((track, trackIndex) => {
    const events = Array.isArray(track?.events) ? track.events : [];
    return events
      .filter((event) => event?.type !== 'rest' && !event?.isRest)
      .map((event) => ({
        ticks: Math.max(0, Math.round(Number(event?.startTick ?? event?.tick) || 0)),
        durationTicks: Math.max(1, Math.round(Number(event?.durationTicks ?? event?.duration) || 0)),
        midi: clamp(Math.round(Number(event?.midi ?? event?.note) || 0), 0, 127),
        velocity: normalizeVelocity(event?.velocity ?? event?.v),
        trackId: trackIndex,
      }));
  });
}

function slimScoreToMidi(score, options = {}) {
  const transport = score?.transport ?? {};
  const ppq = Math.max(1, Math.round(Number(transport.resolution) || 480));
  const bpm = Number(transport.bpm) || 120;
  const timeSigNum = Number(transport.timeSigNum) || 4;
  const timeSigDen = Number(transport.timeSigDen) || 4;
  const notes = normalizeSlimNotes(score);

  if (!notes.length) {
    throw new Error('Slim score does not contain any notes.');
  }

  const groupedNotes = new Map();
  notes.forEach((note) => {
    if (!groupedNotes.has(note.trackId)) {
      groupedNotes.set(note.trackId, []);
    }
    groupedNotes.get(note.trackId).push(note);
  });

  const midi = new Midi();
  midi.fromJSON({
    header: {
      name: score?.meta?.displayTitle || score?.meta?.title || options.title || 'reverse-transcribed slim score',
      ppq,
      meta: [],
      tempos: normalizeTempoMap(score, bpm),
      timeSignatures: normalizeTimeSignatures(score, timeSigNum, timeSigDen),
      keySignatures: [],
    },
    tracks: [...groupedNotes.entries()]
      .sort(([leftTrackId], [rightTrackId]) => leftTrackId - rightTrackId)
      .map(([trackId, trackNotes], index) => {
        const track = getTrackMetadata(score, trackId, index);
        const normalizedNotes = trackNotes
          .sort((left, right) => left.ticks - right.ticks || left.midi - right.midi)
          .map((note) => ({
            ticks: note.ticks,
            durationTicks: note.durationTicks,
            midi: note.midi,
            velocity: note.velocity,
          }));

        const endOfTrackTicks = normalizedNotes.reduce(
          (maxTick, note) => Math.max(maxTick, note.ticks + note.durationTicks),
          0,
        );

        return {
          name: track.name,
          channel: track.channel,
          instrument: {
            family: track.instrumentFamily,
            number: track.programNumber,
            name: track.instrumentName,
          },
          notes: normalizedNotes,
          controlChanges: {},
          pitchBends: [],
          endOfTrackTicks,
        };
      }),
  });

  return midi;
}

async function convertSlimFile(input, output) {
  const raw = await readFile(input, 'utf8');
  const score = JSON.parse(raw.replace(/^\uFEFF/u, ''));
  const midi = slimScoreToMidi(score, { title: stripExtension(output) });
  const bytes = midi.toArray();

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(bytes));

  return {
    output,
    notes: normalizeSlimNotes(score).length,
    tracks: midi.tracks.length,
    bytes: bytes.byteLength,
  };
}

function resolveExpectedMidiNames(score, slimFilename) {
  const sourceMidiName = Array.isArray(score?.source?.midi) ? score.source.midi[0] : null;
  const names = new Set();

  if (sourceMidiName && /\.midi?$/iu.test(sourceMidiName)) {
    names.add(path.basename(sourceMidiName));
  }

  names.add(`${slugFromSlimFilename(slimFilename)}.mid`);
  return [...names];
}

async function scanMissing() {
  const slimDir = getArg('slim-dir', DEFAULT_SLIM_DIR);
  const midiDir = getArg('midi-dir', DEFAULT_MIDI_DIR);
  const dryRun = hasFlag('dry-run');

  await mkdir(midiDir, { recursive: true });
  const midiFiles = new Set((await readdir(midiDir)).filter((filename) => /\.midi?$/iu.test(filename)));
  const slimFiles = (await readdir(slimDir)).filter((filename) => /-slim\.json$/iu.test(filename)).sort();

  const converted = [];
  const skipped = [];

  for (const slimFile of slimFiles) {
    const slimPath = path.join(slimDir, slimFile);
    const raw = await readFile(slimPath, 'utf8');
    const score = JSON.parse(raw.replace(/^\uFEFF/u, ''));
    const expectedNames = resolveExpectedMidiNames(score, slimFile);
    const existingName = expectedNames.find((name) => midiFiles.has(name));

    if (existingName) {
      skipped.push({ slimFile, reason: existingName });
      continue;
    }

    const outputName = expectedNames[0] ?? `${slugFromSlimFilename(slimFile)}.mid`;
    const outputPath = path.join(midiDir, outputName);

    if (!dryRun) {
      const result = await convertSlimFile(slimPath, outputPath);
      converted.push(result);
      midiFiles.add(outputName);
    } else {
      converted.push({ output: outputPath, notes: normalizeSlimNotes(score).length, tracks: null, bytes: 0 });
    }
  }

  console.log(`Reverse transcribed: ${converted.length}`);
  converted.forEach((result) => {
    console.log(`  + ${result.output}${dryRun ? ' (dry run)' : ` (${result.notes} notes, ${result.tracks} tracks)`}`);
  });
  console.log(`Skipped existing MIDI: ${skipped.length}`);
}

async function main() {
  if (hasFlag('scan-missing')) {
    await scanMissing();
    return;
  }

  const input = getArg('input');
  const output = getArg('output');

  if (!input || !output) {
    throw new Error('Usage: node scripts/slim-json-to-midi.mjs --input=<score-slim.json> --output=<score.mid> OR --scan-missing [--slim-dir=<dir>] [--midi-dir=<dir>] [--dry-run]');
  }

  const result = await convertSlimFile(input, output);
  console.log(`Wrote ${result.output}`);
  console.log(`Notes: ${result.notes}, tracks: ${result.tracks}, bytes: ${result.bytes}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
