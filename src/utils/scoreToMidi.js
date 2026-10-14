import toneMidi from '@tonejs/midi';
import midiFile from 'midi-file';
import { ALL_KEYS_FLAT, DEFAULT_SCORE_PARAMS, mapKey } from '../constants/music.js';
import { PPQ } from './score.js';

const DEFAULT_EXPORT_PPQ = 480;
const { Midi } = toneMidi;
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

function normalizeScoreTracks(scoreJson) {
  if (scoreJson.version !== '3.2-ultra-slim' || !Array.isArray(scoreJson.notes)) {
    return Array.isArray(scoreJson.tracks) ? scoreJson.tracks.filter((track) => !track?.mute) : [];
  }

  const trackMetadata = Array.isArray(scoreJson.tracks) ? scoreJson.tracks : [];
  const grouped = new Map();
  scoreJson.notes.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 3) return;
    const trackId = String(entry[4] ?? 0);
    if (!grouped.has(trackId)) grouped.set(trackId, []);
    grouped.get(trackId).push({
      tick: entry[0],
      durationTicks: entry[1],
      midi: entry[2],
      velocity: entry[3],
    });
  });

  return [...grouped.entries()].map(([trackId, events], index) => ({
    ...(trackMetadata[Number(trackId)] ?? {}),
    id: trackMetadata[Number(trackId)]?.id ?? `track-${trackId}`,
    name: trackMetadata[Number(trackId)]?.name ?? `Track ${index + 1}`,
    channel: Array.isArray(trackMetadata[Number(trackId)]) ? trackMetadata[Number(trackId)][1] : trackMetadata[Number(trackId)]?.channel,
    programNumber: Array.isArray(trackMetadata[Number(trackId)]) ? trackMetadata[Number(trackId)][3] : trackMetadata[Number(trackId)]?.programNumber,
    sourceTrackIndex: Array.isArray(trackMetadata[Number(trackId)]) ? trackMetadata[Number(trackId)][5] : trackMetadata[Number(trackId)]?.sourceTrackIndex,
    programChanges: Array.isArray(trackMetadata[Number(trackId)]) ? trackMetadata[Number(trackId)][6] : trackMetadata[Number(trackId)]?.programChanges,
    events,
  }));
}

function resolveTempoEntries(scoreJson, sourcePpq, fallbackBpm) {
  const tempoMap = scoreJson.playback?.tempoMap;
  if (!Array.isArray(tempoMap) || !tempoMap.length) {
    return [{ ticks: 0, bpm: fallbackBpm }];
  }

  return tempoMap.map((entry) => ({
    ticks: Number(entry.startTick) || 0,
    bpm: Number(entry.bpm) > 0
      ? Number(entry.bpm)
      : 60 / (Math.max(Number(entry.secondsPerTick) || 0, Number.EPSILON) * sourcePpq),
  }));
}

export function scoreJsonToMidi(scoreJson, options = {}) {
  if (!scoreJson || typeof scoreJson !== 'object') {
    throw new Error('Score JSON is required before exporting MIDI.');
  }
  if (hasSourceMetadata(scoreJson)) {
    return { toArray: () => exportRoundTripBytes(scoreJson, options) };
  }

  const transport = scoreJson.transport ?? {};
  const sourcePpq = normalizePpq(transport.resolution, PPQ);
  const targetPpq = normalizePpq(options.ppq, DEFAULT_EXPORT_PPQ);
  const bpm = Number(transport.bpm) || DEFAULT_SCORE_PARAMS.bpm;
  const timeSigNum = Number(transport.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum;
  const timeSigDen = Number(transport.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen;
  const tracks = normalizeScoreTracks(scoreJson);
  const hasRoundTripMetadata = tracks.length > 0 && tracks.every((track) => (
    Number.isInteger(Number(track?.sourceTrackIndex)) && Array.isArray(track?.programChanges)
  ));
  const midi = new Midi();

  midi.fromJSON({
    header: {
      name: scoreJson.meta?.title || options.title || 'universe rhythm recorder export',
      ppq: targetPpq,
      meta: [],
      tempos: resolveTempoEntries(scoreJson, sourcePpq, bpm),
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

  if (hasRoundTripMetadata) {
    const raw = midiFile.parseMidi(midi.toArray());
    tracks.forEach((track, index) => {
      const sourceIndex = Number(track.sourceTrackIndex);
      const channel = clamp(Number(track.channel) || 0, 0, 15);
      let target = raw.tracks.find((events) => events.some((event) => event.type === 'trackName' && event.text === (track.name || track.id)));
      if (!target) target = raw.tracks[index + 1];
      if (!target) return;
      const existing = target.reduce((list, event) => { list.push(event); return list; }, []);
      const absolute = [];
      let tick = 0;
      existing.forEach((event, order) => { tick += event.deltaTime || 0; absolute.push({ ...event, tick, order }); });
      const changes = track.programChanges.filter((change) => Number(change.channel) === channel)
        .map((change) => ({ type: 'programChange', channel, programNumber: clamp(Number(change.programNumber) || 0, 0, 127), tick: scaleTick(change.tick, sourcePpq, targetPpq), order: Number(change.order) || 0 }));
      const merged = [...absolute.filter((event) => event.type !== 'programChange'), ...changes]
        .sort((a, b) => a.tick - b.tick || a.order - b.order);
      let last = 0;
      target.splice(0, target.length, ...merged.map(({ tick: at, order, ...event }) => { event.deltaTime = at - last; last = at; return event; }));
    });
    midi.toArray = () => midiFile.writeMidi(raw);
  }

  return midi;
}

function hasSourceMetadata(score) {
  return Array.isArray(score?.tracks) && score.tracks.some((track) => Array.isArray(track) ? track[5] != null : track?.sourceTrackIndex != null);
}

function exportRoundTripBytes(score, options = {}) {
  const source = score.source?.midi;
  const sourcePpq = normalizePpq(score.transport?.resolution, PPQ);
  const ppq = normalizePpq(options.ppq, sourcePpq);
  const metadata = score.tracks || [];
  const trackInfo = metadata.map((track) => Array.isArray(track)
    ? { channel: Number(track[1]) || 0, programNumber: Number(track[3]) || 0, sourceTrackIndex: Number(track[5]), programChanges: track[6] || [] }
    : { channel: Number(track.channel) || 0, programNumber: Number(track.programNumber) || 0, sourceTrackIndex: Number(track.sourceTrackIndex), programChanges: track.programChanges || [] });
  const count = Math.max(Number(source?.[3]) || 0, ...trackInfo.map((track) => track.sourceTrackIndex + 1), 1);
  const tracks = Array.from({ length: count }, () => []);
  const add = (index, event) => tracks[index].push(event);
  const seenChanges = new Set();
  trackInfo.forEach((info) => info.programChanges.forEach((change) => {
    const channel = clamp(Number(change.channel ?? info.channel), 0, 15);
    const tick = scaleTick(change.tick, sourcePpq, ppq);
    const programNumber = clamp(Number(change.programNumber) || 0, 0, 127);
    const key = `${info.sourceTrackIndex}/${tick}/${change.order}/${channel}/${programNumber}`;
    if (seenChanges.has(key)) return;
    seenChanges.add(key);
    add(info.sourceTrackIndex, { type: 'programChange', channel, programNumber, tick, order: Number(change.order) || 0 });
  }));

  (score.notes || []).forEach((note) => {
    const info = trackInfo[Number(note?.[4])];
    if (!info) return;
    const start = scaleTick(note[0], sourcePpq, ppq);
    const end = start + Math.max(1, scaleTick(note[1], sourcePpq, ppq));
    const channel = clamp(info.channel, 0, 15);
    const pitch = clamp(Math.round(Number(note[2]) || 0), 0, 127);
    const velocity = clamp(Math.round((Number(note[3]) || 0.85) * 127), 1, 127);
    let onOrder = Number.isFinite(Number(note[5])) ? Number(note[5]) : null;
    let offOrder = Number.isFinite(Number(note[6])) ? Number(note[6]) : null;
    if (onOrder === null) {
      const sameTick = info.programChanges.filter((pc) => Number(pc.tick) === Number(note[0]) && Number(pc.channel) === channel).sort((a, b) => a.order - b.order);
      const matching = sameTick.filter((pc) => Number(pc.programNumber) === info.programNumber);
      onOrder = matching.length ? Number(matching[matching.length - 1].order) + 0.5 : -0.5;
    }
    add(info.sourceTrackIndex, { type: 'noteOn', channel, noteNumber: pitch, velocity, tick: start, order: onOrder });
    add(info.sourceTrackIndex, { type: 'noteOff', channel, noteNumber: pitch, velocity: 0, tick: end, order: offOrder ?? Number.MAX_SAFE_INTEGER });
  });

  const bpm = Number(score.transport?.bpm) || DEFAULT_SCORE_PARAMS.bpm;
  const signatures = Array.isArray(source?.[4]) ? source[4] : [];
  signatures.forEach((sig, i) => add(0, { type: 'timeSignature', numerator: Number(sig[1]) || 4, denominator: Number(sig[2]) || 4, metronome: 24, thirtyseconds: 8, tick: scaleTick(sig[0], sourcePpq, ppq), order: -90000 + i }));
  (Array.isArray(source?.[5]) ? source[5] : []).forEach(({ tick, order, ...event }) => add(0, { ...event, tick: scaleTick(tick, sourcePpq, ppq), order: order ?? 0 }));

  const rawTracks = tracks.map((events, index) => {
    const trackNames = Array.isArray(source?.[6]) ? source[6] : [];
    if (!events.some((event) => event.type === 'trackName')) {
      const stored = trackNames[index];
      events.push({ type: 'trackName', text: typeof stored === 'object' ? stored.text : (stored || (index === 0 ? score.meta?.title || 'MIDI export' : '')), tick: 0, order: typeof stored === 'object' ? stored.order : -200000 });
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    let previous = 0;
    const encoded = events.map(({ tick, order, ...event }) => { event.deltaTime = tick - previous; previous = tick; return event; });
    encoded.push({ type: 'endOfTrack', deltaTime: 0 });
    return encoded;
  });
  return midiFile.writeMidi({ header: { format: Number(source?.[2]) === 0 ? 0 : 1, numTracks: count, ticksPerBeat: ppq }, tracks: rawTracks });
}

export function scoreJsonToMidiBytes(scoreJson, options = {}) {
  return scoreJsonToMidi(scoreJson, options).toArray();
}
