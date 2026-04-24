import { DEFAULT_SCORE_PARAMS, mapKey } from '../constants/music';

const OCTAVE_PREFIXES = new Set(['+', '-', '↑', '↓']);
const DEFAULT_TRACK_ID = 'main';
const DEFAULT_NOTE_VELOCITY = 0.85;
const DEFAULT_CHORD_STRUM_MS = 12;

function stripScoreComments(text) {
  return text.replace(/\/\/.*$/gm, '').replace(/[ \t]+$/gm, '');
}

function createLegacyTiming(bpmVal, sigNum, sigDen, charRes) {
  const beatDuration = 60 / bpmVal;
  const tickDuration = beatDuration * (sigDen / charRes);
  return { beatDuration, tickDuration };
}

function readToken(text, startIndex) {
  let nextIndex = startIndex + 1;
  let token = text[startIndex];

  if (OCTAVE_PREFIXES.has(token) && nextIndex < text.length) {
    const nextChar = text[nextIndex];
    if (nextChar >= '1' && nextChar <= '7') {
      token += nextChar;
      nextIndex += 1;
    }
  }

  return { token, nextIndex };
}

function clampVelocity(value, fallback = DEFAULT_NOTE_VELOCITY) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return fallback;
  return Math.min(1, Math.max(0, Number(value)));
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    if (left.time !== right.time) return left.time - right.time;
    return left.k.localeCompare(right.k);
  });
}

function createPlaybackState(overrides = {}) {
  return {
    bpm: Number(overrides.bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: Number(overrides.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: Number(overrides.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen,
    tone: overrides.tone ?? DEFAULT_SCORE_PARAMS.tone,
    globalKeyOffset: Number(overrides.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
    reverb: overrides.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
  };
}

function buildNormalizedResult(events, playback) {
  const sortedEvents = sortEvents(events);
  const maxTime = sortedEvents.reduce(
    (currentMax, event) => Math.max(currentMax, event.time + (event.durationSec ?? 0)),
    0,
  );

  return {
    events: sortedEvents,
    maxTime,
    playback,
  };
}

function createNormalizedNoteEvent({
  time,
  key,
  durationSec,
  velocity,
  trackId = DEFAULT_TRACK_ID,
}) {
  return {
    time,
    k: key,
    durationSec,
    v: clampVelocity(velocity),
    trackId,
  };
}

export function parseLegacyScoreText(text, config = {}) {
  const playback = createPlaybackState(config);
  const charResolution = Number(config.charResolution) || DEFAULT_SCORE_PARAMS.charResolution;
  const events = [];
  const { beatDuration, tickDuration } = createLegacyTiming(
    playback.bpm,
    playback.timeSigNum,
    playback.timeSigDen,
    charResolution,
  );
  const cleanText = stripScoreComments(String(text ?? ''));
  let currentTime = 0;
  let index = 0;

  while (index < cleanText.length) {
    const char = cleanText[index];

    if (char === '\n' || char === '\r') {
      index += 1;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\u3000') {
      currentTime += tickDuration;
      index += 1;
      continue;
    }

    if (char === '(') {
      index += 1;
      const chordKeys = [];

      while (index < cleanText.length && cleanText[index] !== ')') {
        const chordChar = cleanText[index];
        if (chordChar === ' ' || chordChar === '\n' || chordChar === '\r' || chordChar === '\t') {
          index += 1;
          continue;
        }

        const { token, nextIndex } = readToken(cleanText, index);
        const mappedKey = mapKey(token);
        if (mappedKey) chordKeys.push(mappedKey);
        index = nextIndex;
      }

      if (cleanText[index] === ')') index += 1;

      if (chordKeys.length > 0) {
        chordKeys.forEach((key, chordIndex) => {
          events.push(createNormalizedNoteEvent({
            time: currentTime + chordIndex * (DEFAULT_CHORD_STRUM_MS / 1000),
            key,
            durationSec: tickDuration * 4,
            velocity: DEFAULT_NOTE_VELOCITY,
          }));
        });
        currentTime += tickDuration;
      }

      continue;
    }

    if (char === '|') {
      const beats = currentTime / beatDuration;
      if (Math.abs(beats - Math.round(beats)) > 0.01) {
        currentTime = Math.ceil(beats - 0.01) * beatDuration;
      }
      index += 1;
      continue;
    }

    const { token, nextIndex } = readToken(cleanText, index);
    const mappedKey = mapKey(token);
    if (mappedKey) {
      events.push(createNormalizedNoteEvent({
        time: currentTime,
        key: mappedKey,
        durationSec: tickDuration * 4,
        velocity: DEFAULT_NOTE_VELOCITY,
      }));
      currentTime += tickDuration;
    }
    index = nextIndex;
  }

  return buildNormalizedResult(events, playback);
}

function ticksToSeconds(ticks, bpm, resolution) {
  return (Number(ticks) || 0) * (60 / bpm) / resolution;
}

function normalizeJsonEvent(event, context) {
  const type = event?.type ?? 'note';
  const tick = Number(event?.tick) || 0;
  const durationTicks = Math.max(0, Number(event?.duration) || 0);
  const baseTime = ticksToSeconds(tick, context.bpm, context.resolution);
  const durationSec = ticksToSeconds(durationTicks, context.bpm, context.resolution);
  const velocity = clampVelocity(event?.velocity);
  const trackId = context.trackId;

  if (type === 'chord') {
    const keys = Array.isArray(event?.keys) ? event.keys : [];
    const strumMs = Number.isFinite(Number(event?.strumMs))
      ? Number(event.strumMs)
      : DEFAULT_CHORD_STRUM_MS;

    return keys
      .map((rawKey, chordIndex) => {
        const mappedKey = mapKey(rawKey);
        if (!mappedKey) return null;

        return createNormalizedNoteEvent({
          time: baseTime + (strumMs * chordIndex) / 1000,
          key: mappedKey,
          durationSec,
          velocity,
          trackId,
        });
      })
      .filter(Boolean);
  }

  const mappedKey = mapKey(event?.key);
  if (!mappedKey) return [];

  return [createNormalizedNoteEvent({
    time: baseTime,
    key: mappedKey,
    durationSec,
    velocity,
    trackId,
  })];
}

export function parseScoreJson(scoreJson) {
  if (!scoreJson || typeof scoreJson !== 'object' || Array.isArray(scoreJson)) {
    throw new Error('Score JSON must be an object.');
  }

  const transport = scoreJson.transport ?? {};
  const playback = createPlaybackState({
    ...transport,
    ...(scoreJson.playback ?? {}),
  });
  const resolution = Math.max(1, Number(transport.resolution) || 480);
  const tracks = Array.isArray(scoreJson.tracks) ? scoreJson.tracks : [];
  const events = [];

  tracks.forEach((track, trackIndex) => {
    if (!track || track.mute) return;

    const trackId = track.id || `track-${trackIndex + 1}`;
    const trackEvents = Array.isArray(track.events) ? track.events : [];

    trackEvents.forEach((event) => {
      events.push(...normalizeJsonEvent(event, {
        bpm: playback.bpm,
        resolution,
        trackId,
      }));
    });
  });

  return buildNormalizedResult(events, playback);
}

export function normalizeScoreSource(input, config = {}) {
  if (typeof input === 'string') {
    return parseLegacyScoreText(input, config);
  }

  if (input && typeof input === 'object') {
    return parseScoreJson(input);
  }

  return buildNormalizedResult([], createPlaybackState(config));
}

export function parseScoreData(text, bpmVal, sigNum, sigDen, charRes) {
  return normalizeScoreSource(text, {
    bpm: bpmVal,
    timeSigNum: sigNum,
    timeSigDen: sigDen,
    charResolution: charRes,
  });
}
