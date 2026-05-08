import midiPackage from '@tonejs/midi';
import { ALL_KEYS_FLAT, DEFAULT_SCORE_PARAMS, mapKey } from '../constants/music.js';
import { PPQ } from './score.js';

const { Midi } = midiPackage;
const DEFAULT_EXPORT_PPQ = 480;
const DEFAULT_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
const KEY_TO_MIDI = Object.fromEntries(
  ALL_KEYS_FLAT.map((entry) => {
    const match = /^([A-G])([#b]?)(-?\d+)$/u.exec(entry.n);
    if (!match) return [entry.k, null];

    const pitchClass = {
      C: 0,
      'C#': 1,
      Db: 1,
      D: 2,
      'D#': 3,
      Eb: 3,
      E: 4,
      F: 5,
      'F#': 6,
      Gb: 6,
      G: 7,
      'G#': 8,
      Ab: 8,
      A: 9,
      'A#': 10,
      Bb: 10,
      B: 11,
    }[`${match[1]}${match[2]}`];

    return [entry.k, ((Number(match[3]) + 1) * 12) + pitchClass];
  }).filter(([, midi]) => Number.isFinite(midi)),
);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizePpq(value, fallback = PPQ) {
  const numeric = Math.round(Number(value) || fallback);
  return Math.max(1, numeric);
}

function scaleTick(value, sourcePpq, targetPpq) {
  return Math.max(0, Math.round((Number(value) || 0) * (targetPpq / sourcePpq)));
}

function resolveMidiNote(event) {
  const directMidi = Number(event?.midi);
  if (Number.isFinite(directMidi)) {
    return clamp(Math.round(directMidi), 0, 127);
  }

  const mappedKey = mapKey(event?.key ?? event?.k);
  if (mappedKey && Number.isFinite(KEY_TO_MIDI[mappedKey])) {
    return KEY_TO_MIDI[mappedKey];
  }

  return null;
}

function resolveVelocity(event) {
  const rawVelocity = Number(event?.velocity ?? event?.v ?? 0.85);
  if (!Number.isFinite(rawVelocity)) {
    return 0.85;
  }

  return clamp(rawVelocity > 1 ? rawVelocity / 127 : rawVelocity, 0, 1);
}

function normalizeTrackEvents(track, sourcePpq, targetPpq) {
  const rawEvents = Array.isArray(track?.events) ? track.events : [];
  const notes = [];
  let endOfTrackTicks = 0;

  rawEvents.forEach((event) => {
    const tick = scaleTick(event?.tick ?? event?.startTick, sourcePpq, targetPpq);
    const durationTicks = Math.max(
      1,
      scaleTick(event?.durationTicks ?? event?.durationTick ?? event?.duration, sourcePpq, targetPpq),
    );
    endOfTrackTicks = Math.max(endOfTrackTicks, tick + durationTicks);

    if (event?.type === 'rest' || event?.isRest) {
      return;
    }

    if (event?.type === 'chord' && Array.isArray(event.keys)) {
      event.keys.forEach((key) => {
        const midi = resolveMidiNote({ ...event, key });
        if (midi === null) return;
        notes.push({
          ticks: tick,
          durationTicks,
          midi,
          velocity: resolveVelocity(event),
        });
      });
      return;
    }

    const midi = resolveMidiNote(event);
    if (midi === null) {
      return;
    }

    notes.push({
      ticks: tick,
      durationTicks,
      midi,
      velocity: resolveVelocity(event),
    });
  });

  return {
    notes: notes.sort((left, right) => left.ticks - right.ticks || left.midi - right.midi),
    endOfTrackTicks,
  };
}

export function scoreJsonToMidi(scoreJson, options = {}) {
  if (!scoreJson || typeof scoreJson !== 'object') {
    throw new Error('Score JSON is required before exporting MIDI.');
  }

  const transport = scoreJson.transport ?? {};
  const sourcePpq = normalizePpq(transport.resolution, PPQ);
  const targetPpq = normalizePpq(options.ppq, DEFAULT_EXPORT_PPQ);
  const bpm = Number(transport.bpm) || DEFAULT_SCORE_PARAMS.bpm;
  const timeSigNum = Number(transport.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum;
  const timeSigDen = Number(transport.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen;
  const tracks = Array.isArray(scoreJson.tracks) ? scoreJson.tracks.filter((track) => !track?.mute) : [];
  const midi = new Midi();

  midi.fromJSON({
    header: {
      name: scoreJson.meta?.title || options.title || 'Project Hina Export',
      ppq: targetPpq,
      meta: [],
      tempos: [{ ticks: 0, bpm }],
      timeSignatures: [{ ticks: 0, timeSignature: [timeSigNum, timeSigDen] }],
      keySignatures: [],
    },
    tracks: tracks.map((track, index) => {
      const normalized = normalizeTrackEvents(track, sourcePpq, targetPpq);
      const channel = Number.isInteger(Number(track?.channel))
        ? clamp(Number(track.channel), 0, 15)
        : DEFAULT_CHANNELS[index % DEFAULT_CHANNELS.length];

      return {
        name: track?.name || track?.id || `Track ${index + 1}`,
        channel,
        instrument: {
          family: 'piano',
          number: Number.isInteger(Number(track?.programNumber)) ? clamp(Number(track.programNumber), 0, 127) : 0,
          name: 'acoustic grand piano',
        },
        notes: normalized.notes,
        controlChanges: {},
        pitchBends: [],
        endOfTrackTicks: normalized.endOfTrackTicks,
      };
    }),
  });

  return midi;
}

export function scoreJsonToMidiBytes(scoreJson, options = {}) {
  return scoreJsonToMidi(scoreJson, options).toArray();
}
