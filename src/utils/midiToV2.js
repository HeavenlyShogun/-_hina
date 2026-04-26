import { Midi } from '@tonejs/midi';
import { ALL_KEYS_FLAT, DEFAULT_SCORE_PARAMS } from '../constants/music';
import { PPQ } from './score';

const NOTE_NAME_TO_KEY = Object.fromEntries(ALL_KEYS_FLAT.map((entry) => [entry.n, entry.k]));

function slugifyFilename(value) {
  return String(value || 'score')
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'score';
}

function stripExtension(filename) {
  return String(filename || 'Untitled MIDI').replace(/\.[^.]+$/, '') || 'Untitled MIDI';
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((Number(midi) - 69) / 12);
}

function toVelocity(value, fallback = 0.85) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function toRoundedTick(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function mapMidiNoteToEvent(note) {
  const noteName = note?.name || `${note?.pitch ?? 'C'}${note?.octave ?? 4}`;
  const mappedKey = NOTE_NAME_TO_KEY[noteName] || null;
  const tick = toRoundedTick(note?.ticks);
  const durationTicks = Math.max(1, toRoundedTick(note?.durationTicks));
  const velocity = toVelocity(note?.velocity);
  const frequency = Number.isFinite(Number(note?.frequency))
    ? Number(note.frequency)
    : midiToFrequency(note?.midi);

  return {
    type: 'note',
    tick,
    startTick: tick,
    duration: durationTicks,
    durationTicks,
    key: mappedKey,
    velocity: Number(velocity.toFixed(4)),
    frequency: Number(frequency.toFixed(6)),
    midi: Number(note?.midi),
    noteName,
    pitchClass: note?.pitch ?? noteName.replace(/\d+/g, ''),
    octave: Number(note?.octave),
  };
}

export async function parseMidiToV2(fileOrBuffer, options = {}) {
  const arrayBuffer = fileOrBuffer instanceof ArrayBuffer
    ? fileOrBuffer
    : await fileOrBuffer.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  const fileName = options.fileName || fileOrBuffer?.name || 'import.mid';
  const title = options.title || stripExtension(fileName);
  const tempo = midi.header.tempos?.[0]?.bpm;
  const timeSignature = midi.header.timeSignatures?.[0]?.timeSignature || [];
  const timeSigNum = Number(timeSignature[0]) || options.timeSigNum || DEFAULT_SCORE_PARAMS.timeSigNum;
  const timeSigDen = Number(timeSignature[1]) || options.timeSigDen || DEFAULT_SCORE_PARAMS.timeSigDen;
  const resolution = Math.max(Number(midi.header.ppq) || PPQ, 1);
  const activeTracks = midi.tracks.filter((track) => Array.isArray(track.notes) && track.notes.length > 0);

  if (!activeTracks.length) {
    throw new Error('The MIDI file does not contain any note events.');
  }

  const transportBpm = Number(tempo) || options.bpm || DEFAULT_SCORE_PARAMS.bpm;
  const playback = {
    tone: options.tone ?? DEFAULT_SCORE_PARAMS.tone,
    globalKeyOffset: Number(options.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
    reverb: options.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
    scaleMode: options.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
    accidentals: options.accidentals ?? DEFAULT_SCORE_PARAMS.accidentals,
  };

  return {
    version: '2.0',
    meta: {
      id: `${slugifyFilename(title)}-${Date.now()}`,
      title,
      sourceType: 'midi',
      migratedAt: new Date().toISOString(),
      originalFormat: 'midi',
      fileName,
    },
    transport: {
      bpm: transportBpm,
      timeSigNum,
      timeSigDen,
      resolution,
    },
    playback,
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
    tracks: activeTracks.map((track, index) => ({
      id: track.name?.trim() || `track-${index + 1}`,
      name: track.name?.trim() || `Track ${index + 1}`,
      mute: false,
      channel: Number(track.channel ?? 0),
      instrument: track.instrument?.name || 'unknown',
      events: [...track.notes]
        .sort((left, right) => left.ticks - right.ticks)
        .map(mapMidiNoteToEvent),
    })),
  };
}
