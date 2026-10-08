import toneMidi from '@tonejs/midi';
import midiFile from 'midi-file';
import { DEFAULT_SCORE_PARAMS } from '../constants/music.js';
import { PPQ } from './score.js';

const { Midi } = toneMidi;
const { parseMidi } = midiFile;

function slugify(value) {
  return String(value || 'score')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'score';
}

function stripExtension(value) {
  return String(value || 'Untitled MIDI').replace(/\.[^.]+$/u, '') || 'Untitled MIDI';
}

function normalizeVelocity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.85;
  return Math.min(1, Math.max(0, numeric));
}

function buildTempoMap(tempos, fallbackBpm) {
  const normalized = (Array.isArray(tempos) ? tempos : [])
    .map((tempo) => [
      Math.max(0, Math.round(Number(tempo?.ticks) || 0)),
      Number(tempo?.bpm) || fallbackBpm,
    ])
    .filter(([, bpm]) => Number.isFinite(bpm) && bpm > 0)
    .sort((left, right) => left[0] - right[0]);

  if (!normalized.length || normalized[0][0] !== 0) normalized.unshift([0, fallbackBpm]);
  return normalized;
}

function buildTimeSignatures(timeSignatures) {
  return (Array.isArray(timeSignatures) ? timeSignatures : [])
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
  const candidates = [track?.instrument?.number, track?.instrument?.program, track?.instrument?.programNumber];
  return candidates.map(Number).find((value) => Number.isInteger(value) && value >= 0 && value <= 127) ?? null;
}

function toArrayBuffer(fileOrBuffer) {
  if (fileOrBuffer instanceof ArrayBuffer) return fileOrBuffer;
  if (ArrayBuffer.isView(fileOrBuffer)) {
    return fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength,
    );
  }
  return fileOrBuffer.arrayBuffer();
}

export async function parseMidiToSlim(fileOrBuffer, options = {}) {
  if (!fileOrBuffer || !(fileOrBuffer instanceof ArrayBuffer) && !ArrayBuffer.isView(fileOrBuffer)
    && typeof fileOrBuffer.arrayBuffer !== 'function') {
    throw new TypeError('Expected a MIDI File, ArrayBuffer, or typed array.');
  }

  const arrayBuffer = await toArrayBuffer(fileOrBuffer);
  const midi = new Midi(arrayBuffer);
  const fileName = options.fileName || fileOrBuffer?.name || 'import.mid';
  const title = options.title || stripExtension(fileName);
  const resolution = Math.max(1, Math.round(Number(midi.header.ppq) || PPQ));
  const bpm = Number(midi.header.tempos?.[0]?.bpm) || Number(options.bpm) || DEFAULT_SCORE_PARAMS.bpm;
  const timeSignature = midi.header.timeSignatures?.[0]?.timeSignature ?? [];
  const lowLevelMidi = parseMidi(new Uint8Array(arrayBuffer));
  const tracks = [];
  const notes = [];

  const rawTrackUseCount = new Map();
  midi.tracks.forEach((track, sourceTrackIndex) => {
    const trackName = track.name?.trim() || '';
    const namedCandidates = lowLevelMidi.tracks
      .map((events, index) => ({
        events,
        index,
        name: events.find((event) => event.type === 'trackName')?.text?.trim() || '',
      }))
      .filter((entry) => entry.name === trackName);
    const usedCount = rawTrackUseCount.get(trackName) ?? 0;
    const namedTrack = namedCandidates[usedCount];
    const noteSignature = track.notes[0];
    const matchingNoteTrack = noteSignature
      ? lowLevelMidi.tracks.find((events) => {
        let tick = 0;
        return events.some((event) => {
          tick += Number(event.deltaTime) || 0;
          return event.type === 'noteOn'
            && event.noteNumber === noteSignature.midi
            && tick === noteSignature.ticks;
        });
      })
      : null;
    const rawTrack = namedTrack?.events
      ?? matchingNoteTrack
      ?? lowLevelMidi.tracks[sourceTrackIndex + Math.max(0, lowLevelMidi.tracks.length - midi.tracks.length)]
      ?? [];
    const rawTrackName = rawTrack.find((event) => event.type === 'trackName')?.text?.trim() || '';
    rawTrackUseCount.set(trackName, usedCount + 1);
    let absoluteTick = 0;
    const programChanges = rawTrack
      .flatMap((event) => {
        absoluteTick += Number(event.deltaTime) || 0;
        return event.type === 'programChange'
          ? [{ tick: absoluteTick, channel: event.channel, programNumber: event.programNumber }]
          : [];
      })
      .sort((left, right) => left.tick - right.tick);
    const sourceChannel = track.notes.length ? track.channel : programChanges[0]?.channel ?? track.channel;
    const notesByProgram = new Map();

    track.notes.forEach((note) => {
      let programNumber = programChanges.length ? 0 : getTrackProgramNumber(track) ?? 0;
      programChanges.forEach((change) => {
        if (change.tick <= note.ticks && change.channel === track.channel) {
          programNumber = change.programNumber;
        }
      });
      if (!notesByProgram.has(programNumber)) notesByProgram.set(programNumber, []);
      notesByProgram.get(programNumber).push(note);
    });

    if (!notesByProgram.size) {
      notesByProgram.set(getTrackProgramNumber(track) ?? 0, []);
    }

    const splitPrograms = notesByProgram.size > 1;
    notesByProgram.forEach((programNotes, programNumber) => {
      const trackId = tracks.length;
      const baseName = trackName || rawTrackName || 'track-' + (sourceTrackIndex + 1);
      const needsProgramLabel = splitPrograms || (rawTrackName && trackName !== rawTrackName);
      const instrumentName = programNumber === getTrackProgramNumber(track)
        ? track.instrument?.name || 'unknown'
        : 'program-' + programNumber;
      tracks.push([
        needsProgramLabel ? baseName + ' [' + programNumber + ']' : baseName,
        Math.min(15, Math.max(0, Math.round(Number(sourceChannel ?? 0) || 0))),
        instrumentName,
        programNumber,
        programNumber === getTrackProgramNumber(track) ? track.instrument?.family || null : null,
      ]);
      programNotes.forEach((note) => notes.push([
        Math.max(0, Math.round(Number(note.ticks) || 0)),
        Math.max(1, Math.round(Number(note.durationTicks) || 0)),
        Math.max(0, Math.round(Number(note.midi) || 0)),
        Number(normalizeVelocity(note.velocity).toFixed(4)),
        trackId,
      ]));
    });
  });
  if (!notes.length) throw new Error('The MIDI file does not contain any note events.');
  notes.sort((left, right) => left[0] - right[0] || left[4] - right[4] || left[2] - right[2] || left[1] - right[1]);

  return {
    version: '3.2-ultra-slim',
    columns: ['startTick', 'durationTicks', 'note', 'velocity', 'trackId'],
    meta: {
      id: options.id || `${slugify(title)}-${Date.now()}`,
      title,
      displayTitle: options.displayTitle || title,
      sourceType: 'midi',
      sourceFormat: 'midi',
      originalFormat: 'midi',
      storageFormat: 'hina-slim-score@3.2',
      fileName,
      migratedAt: new Date().toISOString(),
    },
    transport: {
      bpm,
      timeSigNum: Number(timeSignature[0]) || Number(options.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum,
      timeSigDen: Number(timeSignature[1]) || Number(options.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen,
      resolution,
    },
    playback: {
      tone: options.tone ?? DEFAULT_SCORE_PARAMS.tone,
      globalKeyOffset: Number(options.globalKeyOffset) || 0,
      scaleMode: options.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
      reverb: options.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
      accidentals: options.accidentals ?? {},
      tempoMap: buildTempoMap(midi.header.tempos, bpm),
    },
    source: {
      midi: [fileName, resolution, midi.header.format, midi.tracks.length, buildTimeSignatures(midi.header.timeSignatures)],
    },
    tracks,
    notes,
  };
}
