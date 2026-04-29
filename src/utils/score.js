import { DEFAULT_SCORE_PARAMS, mapKey } from '../constants/music';

const OCTAVE_PREFIXES = new Set(['+', '-', '??', '??']);
const DEFAULT_TRACK_ID = 'main';
const DEFAULT_NOTE_VELOCITY = 0.85;
const DEFAULT_CHORD_STRUM_MS = 12;
export const PPQ = 96;

function stripScoreComments(text) {
  // Score spacing carries timing data, so only strip inline comments.
  return text.replace(/\/\/.*$/gm, '');
}

function ticksToSeconds(ticks, bpm, resolution) {
  return (Number(ticks) || 0) * (60 / bpm) / resolution;
}

function millisecondsToTicks(milliseconds, bpm, resolution) {
  const safeMilliseconds = Math.max(Number(milliseconds) || 0, 0);
  const safeBpm = Math.max(Number(bpm) || DEFAULT_SCORE_PARAMS.bpm, 1);
  const safeResolution = Math.max(Number(resolution) || PPQ, 1);

  return Math.max(
    0,
    Math.round((safeMilliseconds / 1000) * (safeBpm / 60) * safeResolution),
  );
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
    if (left.tick !== right.tick) return left.tick - right.tick;
    return left.k.localeCompare(right.k);
  });
}

function createPlaybackState(overrides = {}) {
  const timeSigDen = Number(overrides.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen;
  const charResolution = Number(overrides.charResolution) || DEFAULT_SCORE_PARAMS.charResolution;
  const resolution = Math.max(1, Math.round(Number(overrides.resolution) || PPQ));

  return {
    bpm: Number(overrides.bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: Number(overrides.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen,
    charResolution,
    resolution,
    tone: overrides.tone ?? DEFAULT_SCORE_PARAMS.tone,
    globalKeyOffset: Number(overrides.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
    reverb: overrides.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
  };
}

function buildNormalizedResult(events, playback) {
  const sortedEvents = sortEvents(events);
  const maxTick = sortedEvents.reduce(
    (currentMax, event) => Math.max(currentMax, event.tick + event.durationTicks),
    0,
  );

  return {
    events: sortedEvents,
    maxTime: ticksToSeconds(maxTick, playback.bpm, playback.resolution),
    playback,
  };
}

function createNormalizedNoteEvent({
  tick,
  key,
  durationTicks,
  velocity,
  resolution,
  bpm,
  isRest = false,
  trackId = DEFAULT_TRACK_ID,
  frequency = null,
  noteName = null,
  midi = null,
  pitchClass = null,
  octave = null,
}) {
  const safeTick = Math.max(0, Math.round(Number(tick) || 0));
  const safeDurationTicks = Math.max(1, Math.round(Number(durationTicks) || 0));

  return {
    time: ticksToSeconds(safeTick, bpm, resolution),
    tick: safeTick,
    k: key,
    isRest,
    durationSec: ticksToSeconds(safeDurationTicks, bpm, resolution),
    durationTick: safeDurationTicks,
    durationTicks: safeDurationTicks,
    resolution,
    v: clampVelocity(velocity),
    trackId,
    frequency: Number.isFinite(Number(frequency)) ? Number(frequency) : null,
    noteName: noteName ?? null,
    midi: Number.isFinite(Number(midi)) ? Number(midi) : null,
    pitchClass: pitchClass ?? null,
    octave: Number.isFinite(Number(octave)) ? Number(octave) : null,
  };
}

function splitBeatSegments(text) {
  const beatSegments = [];
  let currentSegment = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '/') {
      beatSegments.push(currentSegment);
      currentSegment = '';
      continue;
    }

    if (char === '\r' || char === '\n' || char === '|') {
      continue;
    }

    currentSegment += char;
  }

  if (currentSegment.trim().length > 0) {
    beatSegments.push(currentSegment);
  }

  return beatSegments;
}

function parseBeatItems(segment) {
  const items = [];
  let index = 0;

  while (index < segment.length) {
    const char = segment[index];

    if (char === ' ' || char === '\t' || char === '\u3000') {
      index += 1;
      continue;
    }

    if (char === '0') {
      items.push({ type: 'rest' });
      index += 1;
      continue;
    }

    if (char === '(') {
      index += 1;
      const keys = [];

      while (index < segment.length && segment[index] !== ')') {
        const innerChar = segment[index];

        if (innerChar === ' ' || innerChar === '\t' || innerChar === '\u3000') {
          index += 1;
          continue;
        }

        const { token, nextIndex } = readToken(segment, index);
        const mappedKey = mapKey(token);
        if (mappedKey) {
          keys.push(mappedKey);
        }
        index = nextIndex;
      }

      if (segment[index] === ')') {
        index += 1;
      }

      if (keys.length > 0) {
        items.push({ type: 'chord', keys });
      }

      continue;
    }

    const { token, nextIndex } = readToken(segment, index);
    const mappedKey = mapKey(token);
    if (mappedKey) {
      items.push({ type: 'note', key: mappedKey });
    }
    index = nextIndex;
  }

  return items;
}

function resolveLegacyTextTiming(playback) {
  const resolution = Math.max(Number(playback?.resolution) || PPQ, 1);
  const timeSigDen = Math.max(Number(playback?.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen, 1);
  const charResolution = Math.max(
    Number(playback?.charResolution) || DEFAULT_SCORE_PARAMS.charResolution,
    1,
  );
  const beatTicks = Math.max(Math.round((resolution * 4) / timeSigDen), 1);
  const unitTicks = Math.max(Math.round((resolution * 4) / charResolution), 1);
  const noteDurationTicks = Math.max(unitTicks * 4, 1);
  const chordStrumTicks = millisecondsToTicks(DEFAULT_CHORD_STRUM_MS, playback?.bpm, resolution);

  return {
    beatTicks,
    unitTicks,
    noteDurationTicks,
    chordStrumTicks,
  };
}

function alignTickToBeatBoundary(tick, beatTicks) {
  const safeTick = Math.max(Math.round(Number(tick) || 0), 0);
  const safeBeatTicks = Math.max(Math.round(Number(beatTicks) || 0), 1);
  const remainder = safeTick % safeBeatTicks;

  if (remainder === 0) {
    return safeTick;
  }

  return safeTick + (safeBeatTicks - remainder);
}

function parseLegacyLine(lineText, parserState) {
  const events = [];
  const cleanLine = String(lineText ?? '').replace(/\/\/.*$/gm, '').replace(/[ \t\u3000]+$/u, '');
  const lineStartTick = parserState.currentTick;
  const linePreview = cleanLine.replace(/\|/gu, '').trim();
  const hasVisibleContent = linePreview.length > 0;

  let index = 0;

  while (index < cleanLine.length) {
    const char = cleanLine[index];

    if (char === ' ' || char === '\t' || char === '\u3000') {
      parserState.currentTick += parserState.unitTicks;
      index += 1;
      continue;
    }

    if (char === '|') {
      index += 1;
      continue;
    }

    if (char === '/') {
      parserState.currentTick = alignTickToBeatBoundary(parserState.currentTick, parserState.beatTicks);
      index += 1;
      continue;
    }

    if (char === '0') {
      events.push(createNormalizedNoteEvent({
        tick: parserState.currentTick,
        key: null,
        durationTicks: parserState.unitTicks,
        resolution: parserState.resolution,
        bpm: parserState.bpm,
        velocity: 0,
        isRest: true,
      }));
      parserState.currentTick += parserState.unitTicks;
      index += 1;
      continue;
    }

    if (char === '(') {
      index += 1;
      const keys = [];

      while (index < cleanLine.length && cleanLine[index] !== ')') {
        const innerChar = cleanLine[index];
        if (innerChar === ' ' || innerChar === '\t' || innerChar === '\u3000') {
          index += 1;
          continue;
        }

        const { token, nextIndex } = readToken(cleanLine, index);
        const mappedKey = mapKey(token);
        if (mappedKey) {
          keys.push(mappedKey);
        }
        index = nextIndex;
      }

      if (cleanLine[index] === ')') {
        index += 1;
      }

      if (keys.length > 0) {
        keys.forEach((key, chordIndex) => {
          events.push(createNormalizedNoteEvent({
            tick: parserState.currentTick + (parserState.chordStrumTicks * chordIndex),
            key,
            durationTicks: parserState.noteDurationTicks,
            resolution: parserState.resolution,
            bpm: parserState.bpm,
            velocity: DEFAULT_NOTE_VELOCITY,
          }));
        });
        parserState.currentTick += parserState.unitTicks;
      }

      continue;
    }

    const { token, nextIndex } = readToken(cleanLine, index);
    const mappedKey = mapKey(token);
    if (mappedKey) {
      events.push(createNormalizedNoteEvent({
        tick: parserState.currentTick,
        key: mappedKey,
        durationTicks: parserState.noteDurationTicks,
        resolution: parserState.resolution,
        bpm: parserState.bpm,
        velocity: DEFAULT_NOTE_VELOCITY,
      }));
      parserState.currentTick += parserState.unitTicks;
    }
    index = nextIndex;
  }

  return {
    events,
    line: hasVisibleContent
      ? {
        label: linePreview.length > 24 ? `${linePreview.slice(0, 24).trim()}...` : linePreview,
        startTick: lineStartTick,
        endTick: parserState.currentTick,
      }
      : null,
  };
}

export function analyzeLegacyScoreText(text, config = {}) {
  const playback = createPlaybackState({
    ...config,
    resolution: PPQ,
  });
  const timing = resolveLegacyTextTiming(playback);
  const parserState = {
    currentTick: 0,
    beatTicks: timing.beatTicks,
    unitTicks: timing.unitTicks,
    noteDurationTicks: timing.noteDurationTicks,
    chordStrumTicks: timing.chordStrumTicks,
    resolution: PPQ,
    bpm: playback.bpm,
  };
  const events = [];
  const lines = [];

  String(text ?? '')
    .split(/\r?\n/u)
    .forEach((lineText, lineIndex) => {
      const parsedLine = parseLegacyLine(lineText, parserState);
      events.push(...parsedLine.events);

      if (parsedLine.line && parsedLine.line.endTick > parsedLine.line.startTick) {
        lines.push({
          id: `legacy-line-${lineIndex}`,
          ...parsedLine.line,
        });
      }
    });

  return {
    events,
    lines,
    playback,
    contentEndTick: parserState.currentTick,
    timing,
  };
}

export function parseLegacyScoreText(text, config = {}) {
  const analysis = analyzeLegacyScoreText(text, config);
  const normalized = buildNormalizedResult(analysis.events, {
    ...analysis.playback,
    contentEndTick: analysis.contentEndTick,
  });

  return {
    ...normalized,
    structure: {
      lines: analysis.lines,
      contentEndTick: analysis.contentEndTick,
      unitTicks: analysis.timing.unitTicks,
      beatTicks: analysis.timing.beatTicks,
    },
  };
}

function normalizeJsonEvent(event, context) {
  const type = event?.type ?? 'note';
  const tick = Math.max(0, Math.round(Number(event?.tick ?? event?.startTick) || 0));
  const durationTicks = Math.max(
    1,
    Math.round(Number(event?.durationTicks ?? event?.durationTick ?? event?.duration) || 0),
  );
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

        const strumOffsetSec = (strumMs * chordIndex) / 1000;
        const strumOffsetTicks = Math.round((strumOffsetSec * context.bpm * context.resolution) / 60);

        return createNormalizedNoteEvent({
          tick: tick + strumOffsetTicks,
          key: mappedKey,
          durationTicks,
          resolution: context.resolution,
          bpm: context.bpm,
          velocity,
          trackId,
        });
      })
      .filter(Boolean);
  }

  if (type === 'rest') {
    return [createNormalizedNoteEvent({
      tick,
      key: null,
      durationTicks,
      resolution: context.resolution,
      bpm: context.bpm,
      velocity: 0,
      isRest: true,
      trackId,
    })];
  }

  const mappedKey = mapKey(event?.key);
  const frequency = Number.isFinite(Number(event?.frequency)) ? Number(event.frequency) : null;
  if (!mappedKey && !frequency) return [];

  return [createNormalizedNoteEvent({
    tick,
    key: mappedKey,
    durationTicks,
    resolution: context.resolution,
    bpm: context.bpm,
    velocity,
    trackId,
    frequency,
    noteName: event?.noteName ?? event?.note ?? null,
    midi: event?.midi ?? null,
    pitchClass: event?.pitchClass ?? null,
    octave: event?.octave ?? null,
  })];
}

export function parseScoreJson(scoreJson) {
  if (!scoreJson || typeof scoreJson !== 'object' || Array.isArray(scoreJson)) {
    throw new Error('Score JSON must be an object.');
  }

  const transport = scoreJson.transport ?? {};
  const playback = createPlaybackState({
    ...transport,
    resolution: transport.resolution,
    ...(scoreJson.playback ?? {}),
  });
  const resolution = Math.max(1, Math.round(Number(transport.resolution) || playback.resolution || PPQ));
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

  return buildNormalizedResult(events, {
    ...playback,
    resolution,
  });
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
