import { ALL_KEYS_FLAT, DEFAULT_SCORE_PARAMS, mapKey } from '../constants/music.js';
import { looksLikeKeshifuText, parseKeshifuToCanonical } from './keshifuScoreParser.js';

const OCTAVE_PREFIXES = new Set(['+', '-', '??', '??']);
const DEFAULT_TRACK_ID = 'main';
const DEFAULT_NOTE_VELOCITY = 0.85;
const DEFAULT_CHORD_STRUM_MS = 12;
const DEFAULT_JIANPU_OCTAVE = 4;
const DEFAULT_NUMBERED_ARTICULATION_RATIO = 0.85;
const TIMED_TOKEN_PPQ = 480;
const GRID_UNIT_PATTERN = /^@(?:grid|unit)\s*[:=]?\s*(?:1\/)?(?<unit>16|32)\s*$/iu;
const GRID_HOLD_TOKENS = new Set(['-', '_', '~']);
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const NUMBERED_TRACK_PREFIX = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/u;
export const PPQ = 96;
const EIGHTH_TICKS = PPQ / 2;
const MEASURE_BEAT_EPSILON = 1e-6;
const NOTE_NAME_TO_KEY = Object.fromEntries(ALL_KEYS_FLAT.map((entry) => [entry.n, entry.k]));

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

function toFiniteOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const leftTick = Number(left?.startTick ?? left?.tick) || 0;
    const rightTick = Number(right?.startTick ?? right?.tick) || 0;
    if (leftTick !== rightTick) return leftTick - rightTick;
    return String(left?.k ?? '').localeCompare(String(right?.k ?? ''));
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
    scaleMode: overrides.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
    tone: overrides.tone ?? DEFAULT_SCORE_PARAMS.tone,
    globalKeyOffset: Number(overrides.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
    reverb: overrides.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
    textNotation: overrides.textNotation ?? null,
    articulationRatio: Number.isFinite(Number(overrides.articulationRatio))
      ? Math.min(1, Math.max(Number(overrides.articulationRatio), 0.1))
      : 1,
  };
}

function buildNormalizedResult(events, playback) {
  const sortedEvents = sortEvents(events);
  const eventMaxTick = sortedEvents.reduce(
    (currentMax, event) => Math.max(currentMax, event.tick + event.durationTicks),
    0,
  );
  const contentEndTick = Math.max(Math.round(Number(playback?.contentEndTick) || 0), 0);
  const maxTick = Math.max(eventMaxTick, contentEndTick);

  return {
    events: sortedEvents,
    maxTime: ticksToSeconds(maxTick, playback.bpm, playback.resolution),
    playback,
  };
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function getScaleIntervals(scaleMode) {
  if (scaleMode === 'minor') {
    return MINOR_SCALE_INTERVALS;
  }

  return MAJOR_SCALE_INTERVALS;
}

function semitoneToNoteName(semitone) {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][semitone] ?? 'C';
}

function buildJianpuFrequency({
  degree,
  accidental,
  octaveShift,
  playback,
}) {
  if (degree < 1 || degree > 7) {
    return null;
  }

  const scaleIntervals = getScaleIntervals(playback?.scaleMode);
  const tonicOffset = Number(playback?.globalKeyOffset) || 0;
  const midi = (
    ((DEFAULT_JIANPU_OCTAVE + octaveShift) + 1) * 12
  ) + tonicOffset + scaleIntervals[degree - 1] + accidental;

  return midiToFrequency(midi);
}

function midiToNoteName(midi) {
  const safeMidi = Math.round(Number(midi) || 0);
  const octave = Math.floor(safeMidi / 12) - 1;
  const pitchClass = ((safeMidi % 12) + 12) % 12;
  return `${semitoneToNoteName(pitchClass)}${octave}`;
}

function noteNameToMidi(noteName) {
  const match = /^([A-G])([#b]?)(-?\d+)$/u.exec(String(noteName ?? '').trim());
  if (!match) {
    return null;
  }

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

  if (!Number.isFinite(pitchClass)) {
    return null;
  }

  return ((Number(match[3]) + 1) * 12) + pitchClass;
}

function parseDurationModifiers(modifiers, baseTicks = EIGHTH_TICKS) {
  const safeBaseTicks = Math.max(Math.round(Number(baseTicks) || EIGHTH_TICKS), 1);
  const suffix = String(modifiers ?? '');
  const addQuarterCount = (suffix.match(/-/g) ?? []).length;
  const halveCount = (suffix.match(/_/g) ?? []).length;
  const dotCount = (suffix.match(/\./g) ?? []).length;

  let duration = safeBaseTicks + (addQuarterCount * safeBaseTicks);
  duration /= 2 ** halveCount;

  let dottedDuration = duration;
  for (let index = 0; index < dotCount; index += 1) {
    dottedDuration += duration / (2 ** (index + 1));
  }

  return Math.max(1, Math.round(dottedDuration));
}

function durationTicksToBeats(durationTicks, resolution = PPQ) {
  const safeResolution = Math.max(Number(resolution) || PPQ, 1);
  return (Math.max(Number(durationTicks) || 0, 0) / safeResolution);
}

function beatsToDurationTicks(durationBeats, resolution = PPQ) {
  const safeResolution = Math.max(Number(resolution) || PPQ, 1);
  return Math.max(1, Math.round((Number(durationBeats) || 0) * safeResolution));
}

function formatDurationBeats(durationBeats) {
  const safeBeats = Math.max(Number(durationBeats) || 0, 0);
  const rounded = Math.round(safeBeats * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/u, '').replace(/\.$/u, '');
}

function formatNumberedTokenDisplay(rawToken, parsedToken) {
  const durationLabel = formatDurationBeats(parsedToken?.durationBeats);

  if (parsedToken?.type === 'rest') {
    return {
      displayText: `R${durationLabel}`,
      durationLabel,
    };
  }

  if (parsedToken?.type === 'chord') {
    const body = String(rawToken ?? '').match(/^\[(?<body>[^\]]+)\]/u)?.groups?.body ?? rawToken;
    return {
      displayText: `[${body}]`,
      durationLabel,
    };
  }

  const pitch = String(rawToken ?? '').match(/^[#bn]?[+-]*[0-7]['',]*/u)?.[0] ?? rawToken;
  return {
    displayText: pitch,
    durationLabel,
  };
}

function normalizeDurationBeats(durationTicks, playback = {}) {
  return durationTicksToBeats(durationTicks, playback?.resolution);
}

function getMeasureBeats(playback = {}) {
  const timeSigNum = Math.max(Number(playback?.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum, 1);
  const timeSigDen = Math.max(Number(playback?.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen, 1);
  return timeSigNum * (4 / timeSigDen);
}

function assertMeasureBeatTotal({ trackId, lineNumber, measureIndex, actualBeats, expectedBeats }) {
  if (Math.abs(actualBeats - expectedBeats) <= MEASURE_BEAT_EPSILON) {
    return;
  }

  throw new Error(
    `Invalid measure duration: track ${trackId}, line ${lineNumber}, measure ${measureIndex} has ${actualBeats.toFixed(6)} beats; expected ${expectedBeats}.`,
  );
}

function parseNumberedPitchToken(rawToken, playback) {
  const normalized = String(rawToken ?? '').trim();
  const match = /^(?<accidental>[#bn]?)(?<octavePrefix>[+-]*)(?<degree>[0-7])(?<octaveSuffix>['',]*?)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  const degree = Number(match.groups?.degree ?? 0);
  const octavePrefix = match.groups?.octavePrefix ?? '';
  const octaveSuffix = match.groups?.octaveSuffix ?? '';
  const accidentalSymbol = match.groups?.accidental ?? '';
  const accidental = accidentalSymbol === '#'
    ? 1
    : accidentalSymbol === 'b'
      ? -1
      : 0;
  const octaveShift = (
    (octavePrefix.match(/\+/g) ?? []).length
    - (octavePrefix.match(/-/g) ?? []).length
    + (octaveSuffix.match(/'/g) ?? []).length
    - (octaveSuffix.match(/,/g) ?? []).length
  );

  if (degree === 0) {
    return {
      degree,
      isRest: true,
      accidental,
      octaveShift,
      mappedKey: null,
      frequency: null,
      midi: null,
      noteName: null,
      pitchClass: null,
      octave: null,
    };
  }

  const scaleIntervals = getScaleIntervals(playback?.scaleMode);
  const tonicOffset = Number(playback?.globalKeyOffset) || 0;
  const midi = (((DEFAULT_JIANPU_OCTAVE + octaveShift) + 1) * 12)
    + tonicOffset
    + scaleIntervals[degree - 1]
    + accidental;
  const noteName = midiToNoteName(midi);
  const octave = Math.floor(midi / 12) - 1;
  const naturalKeyToken = `${octaveShift > 0 ? "'".repeat(octaveShift) : octaveShift < 0 ? ",".repeat(Math.abs(octaveShift)) : ''}`;

  return {
    degree,
    isRest: false,
    accidental,
    octaveShift,
    mappedKey: accidental === 0
      ? mapKey(`${octaveShift > 0 ? '+' : octaveShift < 0 ? '-' : ''}${degree}`)
      : null,
    frequency: midiToFrequency(midi),
    midi,
    noteName,
    pitchClass: noteName.replace(/-?\d+$/u, ''),
    octave,
    pitch: `${accidentalSymbol}${octaveShift > 0 ? '+'.repeat(octaveShift) : octaveShift < 0 ? '-'.repeat(Math.abs(octaveShift)) : ''}${degree}${naturalKeyToken}`,
  };
}

function parseNumberedToken(rawToken, playback) {
  const token = String(rawToken ?? '').trim();
  if (!token || token === '|') {
    return null;
  }

  const chordMatch = /^\[(?<body>[^\]]+)\](?<modifiers>[-_.]*)$/u.exec(token);
  if (chordMatch) {
    const body = chordMatch.groups?.body ?? '';
    const modifiers = chordMatch.groups?.modifiers ?? '';
    const durationTicks = parseDurationModifiers(modifiers, playback?.resolution / 2);
    const noteTokens = body.match(/[#bn]?[+-]*[0-7]['',]*/gu) ?? [];
    const notes = noteTokens
      .map((entry) => parseNumberedPitchToken(entry, playback))
      .filter(Boolean)
      .filter((entry) => !entry.isRest);

    if (!notes.length) {
      return null;
    }

    return {
      type: 'chord',
      durationBeats: normalizeDurationBeats(durationTicks, playback),
      durationTicks: beatsToDurationTicks(normalizeDurationBeats(durationTicks, playback), playback?.resolution),
      notes,
    };
  }

  const noteMatch = /^(?<pitch>[#bn]?[+-]*[0-7]['',]*)(?<modifiers>[-_.]*)$/u.exec(token);
  if (!noteMatch) {
    return null;
  }

  const note = parseNumberedPitchToken(noteMatch.groups?.pitch, playback);
  if (!note) {
    return null;
  }

  const durationTicks = parseDurationModifiers(noteMatch.groups?.modifiers, playback?.resolution / 2);

  return {
    type: note.isRest ? 'rest' : 'note',
    durationBeats: normalizeDurationBeats(durationTicks, playback),
    durationTicks: beatsToDurationTicks(normalizeDurationBeats(durationTicks, playback), playback?.resolution),
    note,
  };
}

function tokenizeStructuredTextLine(lineText) {
  return String(lineText ?? '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function looksLikeJianpuText(text) {
  const source = stripScoreComments(String(text ?? ''));
  const jianpuTokens = source.match(/(?:^|[\s|\[])[#bn]?[0-7]['',]*[-_.]*/gmu) ?? [];
  const legacyTokens = source.match(/[qwertyuiasdfghjzxcvbnm]/gimu) ?? [];

  if (jianpuTokens.length === 0) {
    return false;
  }

  return jianpuTokens.length >= Math.max(2, legacyTokens.length * 2);
}

function looksLikeTimedTokenText(text) {
  const source = stripScoreComments(String(text ?? ''));
  const noteTokens = source.match(/\([A-G][#b]?-?\d+\s*,\s*\d+(?:\.\d+)?\)/giu) ?? [];
  const restTokens = source.match(/(?:^|\s)R\d+(?:\.\d+)?/giu) ?? [];
  return noteTokens.length + restTokens.length >= 2;
}

function readGridUnitFromText(text, fallback = 16) {
  const safeFallback = Number(fallback) === 32 ? 32 : 16;
  const header = String(text ?? '')
    .split(/\r?\n/u)
    .map((line) => stripScoreComments(line).trim())
    .find((line) => GRID_UNIT_PATTERN.test(line));
  const match = GRID_UNIT_PATTERN.exec(header ?? '');
  return match ? Number(match.groups.unit) : safeFallback;
}

function looksLikeNumberedGridText(text) {
  return String(text ?? '')
    .split(/\r?\n/u)
    .some((line) => GRID_UNIT_PATTERN.test(stripScoreComments(line).trim()));
}

function parseTrackDeclaration(rawLine) {
  const cleaned = stripScoreComments(String(rawLine ?? '')).trim();
  if (!cleaned) {
    return null;
  }

  const match = NUMBERED_TRACK_PREFIX.exec(cleaned);
  if (!match) {
    return {
      trackId: DEFAULT_TRACK_ID,
      body: cleaned,
    };
  }

  return {
    trackId: match[1],
    body: match[2].trim(),
  };
}

function resolveTrackVelocity(trackId) {
  // Keep converted numbered scores balanced with legacy playback.
  // Inferring dynamics from track labels made M/C tracks sound different
  // even when the source chart intended equal weight.
  return DEFAULT_NOTE_VELOCITY;
}

export function parseNumberedMusicalNotation(text, config = {}) {
  const playback = createPlaybackState({
    ...config,
    resolution: PPQ,
    textNotation: 'jianpu',
    articulationRatio: config.articulationRatio ?? DEFAULT_NUMBERED_ARTICULATION_RATIO,
  });
  const lines = [];
  const tokenLines = [];
  const events = [];
  let lineIndex = 0;
  const trackCursors = new Map();
  const trackMeasureBeats = new Map();
  const trackMeasureIndexes = new Map();
  const expectedMeasureBeats = getMeasureBeats(playback);

  const appendLine = (rawLine, trackId, startTick, endTick, tokens = []) => {
    const label = String(rawLine ?? '').trim().replace(NUMBERED_TRACK_PREFIX, '$2').trim();
    if (!label || endTick <= startTick) {
      return;
    }

    const lineId = `jianpu-line-${lineIndex}`;

    lines.push({
      id: lineId,
      trackId,
      label: label.length > 24 ? `${label.slice(0, 24).trim()}...` : label,
      content: rawLine,
      startTick,
      endTick,
    });
    tokenLines.push({
      id: lineId,
      trackId,
      label,
      content: rawLine,
      startTick,
      endTick,
      tokens,
    });
    lineIndex += 1;
  };

  String(text ?? '')
    .split(/\r?\n/u)
    .forEach((rawLine, rawLineIndex) => {
      const declaration = parseTrackDeclaration(rawLine);
      if (!declaration?.body) {
        return;
      }

      const { trackId, body } = declaration;
      const tokens = tokenizeStructuredTextLine(body);
      let currentTick = trackCursors.get(trackId) ?? 0;
      const lineStartTick = currentTick;
      const lineTokens = [];
      const trackVelocity = resolveTrackVelocity(trackId);
      let measureBeats = trackMeasureBeats.get(trackId) ?? 0;
      let measureIndex = trackMeasureIndexes.get(trackId) ?? 1;

      tokens.forEach((token, tokenIndex) => {
        if (token === '|') {
          assertMeasureBeatTotal({
            trackId,
            lineNumber: rawLineIndex + 1,
            measureIndex,
            actualBeats: measureBeats,
            expectedBeats: expectedMeasureBeats,
          });
          lineTokens.push({
            id: `${trackId}-${lineIndex}-${tokenIndex}`,
            text: token,
            startTick: currentTick,
            endTick: currentTick,
            trackId,
            isBar: true,
            isRest: false,
            measureBeats,
            expectedMeasureBeats,
            measureIndex,
          });
          measureBeats = 0;
          measureIndex += 1;
          return;
        }

        const parsedToken = parseNumberedToken(token, playback);
        if (!parsedToken) {
          return;
        }

        if (parsedToken.type === 'rest') {
          const endTick = currentTick + parsedToken.durationTicks;
          const preview = formatNumberedTokenDisplay(token, parsedToken);
          events.push(createNormalizedNoteEvent({
            tick: currentTick,
            key: null,
            durationTicks: parsedToken.durationTicks,
            resolution: playback.resolution,
            bpm: playback.bpm,
            velocity: 0,
            isRest: true,
            trackId,
          }));
          lineTokens.push({
            id: `${trackId}-${lineIndex}-${tokenIndex}`,
            text: token,
            displayText: preview.displayText,
            startTick: currentTick,
            endTick,
            trackId,
            isBar: false,
            isRest: true,
            durationBeats: parsedToken.durationBeats,
            durationLabel: preview.durationLabel,
            measureIndex,
          });
          measureBeats += parsedToken.durationBeats;
          currentTick = endTick;
          return;
        }

        if (parsedToken.type === 'chord') {
          const endTick = currentTick + parsedToken.durationTicks;
          const preview = formatNumberedTokenDisplay(token, parsedToken);
          parsedToken.notes.forEach((note) => {
            events.push(createNormalizedNoteEvent({
              tick: currentTick,
              key: note.mappedKey,
              durationTicks: parsedToken.durationTicks,
              resolution: playback.resolution,
              bpm: playback.bpm,
              velocity: trackVelocity,
              trackId,
              frequency: note.frequency,
              noteName: note.noteName,
              midi: note.midi,
              pitchClass: note.pitchClass,
              octave: note.octave,
            }));
          });
          lineTokens.push({
            id: `${trackId}-${lineIndex}-${tokenIndex}`,
            text: token,
            displayText: preview.displayText,
            startTick: currentTick,
            endTick,
            trackId,
            isBar: false,
            isRest: false,
            durationBeats: parsedToken.durationBeats,
            durationLabel: preview.durationLabel,
            measureIndex,
          });
          measureBeats += parsedToken.durationBeats;
          currentTick = endTick;
          return;
        }

        const endTick = currentTick + parsedToken.durationTicks;
        const preview = formatNumberedTokenDisplay(token, parsedToken);
        const event = createNormalizedNoteEvent({
          tick: currentTick,
          key: parsedToken.note.mappedKey,
          durationTicks: parsedToken.durationTicks,
          resolution: playback.resolution,
          bpm: playback.bpm,
          velocity: trackVelocity,
          trackId,
          frequency: parsedToken.note.frequency,
          noteName: parsedToken.note.noteName,
          midi: parsedToken.note.midi,
          pitchClass: parsedToken.note.pitchClass,
          octave: parsedToken.note.octave,
        });
        events.push(event);
        lineTokens.push({
          id: `${trackId}-${lineIndex}-${tokenIndex}`,
          text: token,
          displayText: preview.displayText,
          startTick: currentTick,
          endTick,
          trackId,
          isBar: false,
          isRest: false,
          durationBeats: parsedToken.durationBeats,
          durationLabel: preview.durationLabel,
          measureIndex,
        });
        measureBeats += parsedToken.durationBeats;
        currentTick = endTick;
      });

      trackCursors.set(trackId, currentTick);
      trackMeasureBeats.set(trackId, measureBeats);
      trackMeasureIndexes.set(trackId, measureIndex);
      appendLine(rawLine, trackId, lineStartTick, currentTick, lineTokens);
    });

  trackMeasureBeats.forEach((measureBeats, trackId) => {
    const measureIndex = trackMeasureIndexes.get(trackId) ?? 1;
    if (measureIndex <= 1 && Math.abs(measureBeats) <= MEASURE_BEAT_EPSILON) {
      return;
    }

    if (Math.abs(measureBeats) > MEASURE_BEAT_EPSILON) {
      throw new Error(
        `Invalid measure duration: track ${trackId}, measure ${measureIndex} is incomplete with ${measureBeats.toFixed(6)} beats; expected ${expectedMeasureBeats}.`,
      );
    }
  });

  const contentEndTick = [...trackCursors.values()].reduce(
    (maxTick, value) => Math.max(maxTick, value),
    0,
  );

  const normalized = buildNormalizedResult(events, {
    ...playback,
    contentEndTick,
  });

  return {
    ...normalized,
    structure: {
      lines,
      tokenLines,
      contentEndTick,
      unitTicks: PPQ,
      beatTicks: PPQ,
    },
  };
}

export function findActiveTokenLine(tokenLines, currentTick) {
  if (!Array.isArray(tokenLines) || tokenLines.length === 0) {
    return null;
  }

  const safeTick = Math.max(0, Math.round(Number(currentTick) || 0));
  return tokenLines.find((line) => safeTick >= line.startTick && safeTick < line.endTick)
    ?? tokenLines[tokenLines.length - 1]
    ?? null;
}

export function findActiveTokens(tokenLines, currentTick) {
  if (!Array.isArray(tokenLines) || tokenLines.length === 0) {
    return [];
  }

  const safeTick = Math.max(0, Math.round(Number(currentTick) || 0));

  return tokenLines.flatMap((line) => (
    Array.isArray(line.tokens)
      ? line.tokens.filter((token) => (
        !token.isBar && safeTick >= token.startTick && safeTick < token.endTick
      ))
      : []
  ));
}

function parseJianpuScoreText(text, config = {}) {
  return parseNumberedMusicalNotation(text, {
    ...config,
    textNotation: 'jianpu',
    articulationRatio: config.articulationRatio ?? DEFAULT_NUMBERED_ARTICULATION_RATIO,
  });
}

function parseTimedToken(tokenText) {
  const noteMatch = /^\((?<note>[A-G][#b]?-?\d+)\s*,\s*(?<beats>\d+(?:\.\d+)?)\)$/iu.exec(tokenText);
  if (noteMatch) {
    return {
      type: 'note',
      noteName: noteMatch.groups.note.replace(/^([a-g])/u, (letter) => letter.toUpperCase()),
      durationBeats: Number(noteMatch.groups.beats),
    };
  }

  const restMatch = /^R(?<beats>\d+(?:\.\d+)?)$/iu.exec(tokenText);
  if (restMatch) {
    return {
      type: 'rest',
      durationBeats: Number(restMatch.groups.beats),
    };
  }

  return null;
}

function tokenizeTimedMeasure(measureText) {
  return String(measureText ?? '').match(/\([A-G][#b]?-?\d+\s*,\s*\d+(?:\.\d+)?\)|R\d+(?:\.\d+)?/giu) ?? [];
}

function parseTimedTokenNotation(text, config = {}) {
  const playback = createPlaybackState({
    ...config,
    resolution: TIMED_TOKEN_PPQ,
    textNotation: 'timed-token',
    articulationRatio: 1,
  });
  const expectedMeasureBeats = getMeasureBeats(playback);
  const events = [];
  const lines = [];
  const tokenLines = [];
  const trackCursors = new Map();
  let lineIndex = 0;

  String(text ?? '')
    .split(/\r?\n/u)
    .forEach((rawLine, rawLineIndex) => {
      const declaration = parseTrackDeclaration(rawLine);
      if (!declaration?.body) {
        return;
      }

      const { trackId, body } = declaration;
      const measures = body.includes('|')
        ? body.split('|').filter((measure) => measure.trim())
        : [body];
      let currentTick = trackCursors.get(trackId) ?? 0;
      const lineStartTick = currentTick;
      const lineTokens = [];

      measures.forEach((measureText, measureOffset) => {
        const measureTokens = tokenizeTimedMeasure(measureText);
        let measureBeats = 0;

        measureTokens.forEach((rawToken, tokenIndex) => {
          const parsed = parseTimedToken(rawToken);
          if (!parsed) {
            return;
          }

          const durationTicks = beatsToDurationTicks(parsed.durationBeats, playback.resolution);
          const startTick = currentTick;
          const endTick = currentTick + durationTicks;
          const durationLabel = formatDurationBeats(parsed.durationBeats);

          if (parsed.type === 'rest') {
            events.push(createNormalizedNoteEvent({
              tick: startTick,
              key: null,
              durationTicks,
              resolution: playback.resolution,
              bpm: playback.bpm,
              velocity: 0,
              isRest: true,
              trackId,
            }));
            lineTokens.push({
              id: `${trackId}-${lineIndex}-${measureOffset}-${tokenIndex}`,
              text: rawToken,
              displayText: `R${durationLabel}`,
              startTick,
              endTick,
              trackId,
              isBar: false,
              isRest: true,
              durationBeats: parsed.durationBeats,
              durationLabel,
              measureIndex: measureOffset + 1,
            });
          } else {
            const midi = noteNameToMidi(parsed.noteName);
            const key = NOTE_NAME_TO_KEY[parsed.noteName] ?? null;
            events.push(createNormalizedNoteEvent({
              tick: startTick,
              key,
              durationTicks,
              resolution: playback.resolution,
              bpm: playback.bpm,
              velocity: DEFAULT_NOTE_VELOCITY,
              trackId,
              frequency: midi === null ? null : midiToFrequency(midi),
              noteName: parsed.noteName,
              midi,
              pitchClass: parsed.noteName.replace(/-?\d+$/u, ''),
              octave: midi === null ? null : Math.floor(midi / 12) - 1,
            }));
            lineTokens.push({
              id: `${trackId}-${lineIndex}-${measureOffset}-${tokenIndex}`,
              text: rawToken,
              displayText: parsed.noteName,
              startTick,
              endTick,
              trackId,
              isBar: false,
              isRest: false,
              durationBeats: parsed.durationBeats,
              durationLabel,
              measureIndex: measureOffset + 1,
            });
          }

          measureBeats += parsed.durationBeats;
          currentTick = endTick;
        });

        assertMeasureBeatTotal({
          trackId,
          lineNumber: rawLineIndex + 1,
          measureIndex: measureOffset + 1,
          actualBeats: measureBeats,
          expectedBeats: expectedMeasureBeats,
        });
      });

      trackCursors.set(trackId, currentTick);

      if (currentTick > lineStartTick) {
        const lineId = `timed-token-line-${lineIndex}`;
        lines.push({
          id: lineId,
          trackId,
          label: body.length > 24 ? `${body.slice(0, 24).trim()}...` : body,
          content: rawLine,
          startTick: lineStartTick,
          endTick: currentTick,
        });
        tokenLines.push({
          id: lineId,
          trackId,
          label: body,
          content: rawLine,
          startTick: lineStartTick,
          endTick: currentTick,
          tokens: lineTokens,
        });
        lineIndex += 1;
      }
    });

  const contentEndTick = [...trackCursors.values()].reduce((maxTick, value) => Math.max(maxTick, value), 0);
  const normalized = buildNormalizedResult(events, {
    ...playback,
    contentEndTick,
  });

  return {
    ...normalized,
    structure: {
      lines,
      tokenLines,
      contentEndTick,
      unitTicks: playback.resolution,
      beatTicks: playback.resolution,
    },
  };
}

function tokenizeNumberedGridMeasure(measureText) {
  return String(measureText ?? '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function parseNumberedGridToken(rawToken, playback) {
  const token = String(rawToken ?? '').trim();
  if (!token) {
    return null;
  }

  if (GRID_HOLD_TOKENS.has(token)) {
    return { type: 'hold' };
  }

  if (/^(?:0|R)$/iu.test(token)) {
    return { type: 'rest' };
  }

  const chordMatch = /^\[(?<body>[^\]]+)\]$/u.exec(token);
  if (chordMatch) {
    const noteTokens = chordMatch.groups.body.match(/[#bn]?[+-]*[1-7]['',]*/gu) ?? [];
    const notes = noteTokens
      .map((entry) => parseNumberedPitchToken(entry, playback))
      .filter(Boolean)
      .filter((entry) => !entry.isRest);

    return notes.length ? { type: 'chord', notes } : null;
  }

  const note = parseNumberedPitchToken(token, playback);
  if (!note || note.isRest) {
    return null;
  }

  return { type: 'note', note };
}

function parseNumberedGridNotation(text, config = {}) {
  const unit = readGridUnitFromText(text, config.charResolution);
  const playback = createPlaybackState({
    ...config,
    resolution: PPQ,
    charResolution: unit,
    textNotation: 'numbered-grid',
    articulationRatio: config.articulationRatio ?? 1,
  });
  const unitTicks = Math.max(Math.round((playback.resolution * 4) / unit), 1);
  const expectedMeasureUnits = Math.round(getMeasureBeats(playback) / (4 / unit));
  const expectedMeasureBeats = getMeasureBeats(playback);
  const events = [];
  const lines = [];
  const tokenLines = [];
  const trackCursors = new Map();
  const activeCells = new Map();
  let lineIndex = 0;

  const closeActiveCell = (trackId, endTick) => {
    const active = activeCells.get(trackId);
    if (!active) {
      return;
    }

    const activeEvents = Array.isArray(active) ? active : [active];
    activeEvents.forEach((event) => {
      event.endTick = endTick;
      event.durationTicks = Math.max(1, endTick - event.tick);
      event.durationTick = event.durationTicks;
      event.durationSec = ticksToSeconds(event.durationTicks, playback.bpm, playback.resolution);
    });
    activeCells.delete(trackId);
  };

  String(text ?? '')
    .split(/\r?\n/u)
    .forEach((rawLine, rawLineIndex) => {
      const cleanedLine = stripScoreComments(rawLine).trim();
      if (!cleanedLine || GRID_UNIT_PATTERN.test(cleanedLine)) {
        return;
      }

      const declaration = parseTrackDeclaration(rawLine);
      if (!declaration?.body) {
        return;
      }

      const { trackId, body } = declaration;
      const measures = body.split('|').filter((measure) => measure.trim());
      let currentTick = trackCursors.get(trackId) ?? 0;
      const lineStartTick = currentTick;
      const lineTokens = [];

      measures.forEach((measureText, measureOffset) => {
        const cells = tokenizeNumberedGridMeasure(measureText);
        if (cells.length !== expectedMeasureUnits) {
          throw new Error(
            `Invalid grid measure: track ${trackId}, line ${rawLineIndex + 1}, measure ${measureOffset + 1} has ${cells.length} units; expected ${expectedMeasureUnits} units for 1/${unit}.`,
          );
        }

        cells.forEach((cell, cellIndex) => {
          const parsed = parseNumberedGridToken(cell, playback);
          const startTick = currentTick;
          const endTick = currentTick + unitTicks;
          const tokenBase = {
            id: `${trackId}-${lineIndex}-${measureOffset}-${cellIndex}`,
            text: cell,
            startTick,
            endTick,
            trackId,
            isBar: false,
            durationBeats: 4 / unit,
            durationLabel: `1/${unit}`,
            measureIndex: measureOffset + 1,
          };

          if (!parsed || parsed.type === 'hold') {
            lineTokens.push({
              ...tokenBase,
              displayText: parsed?.type === 'hold' ? '-' : cell,
              isRest: false,
              isHold: true,
            });
            currentTick = endTick;
            return;
          }

          closeActiveCell(trackId, startTick);

          if (parsed.type === 'rest') {
            const event = createNormalizedNoteEvent({
              tick: startTick,
              key: null,
              durationTicks: unitTicks,
              resolution: playback.resolution,
              bpm: playback.bpm,
              velocity: 0,
              isRest: true,
              trackId,
            });
            events.push(event);
            activeCells.set(trackId, event);
            lineTokens.push({
              ...tokenBase,
              displayText: '0',
              isRest: true,
            });
            currentTick = endTick;
            return;
          }

          if (parsed.type === 'chord') {
            const chordEvents = [];
            parsed.notes.forEach((note) => {
              const event = createNormalizedNoteEvent({
                tick: startTick,
                key: note.mappedKey,
                durationTicks: unitTicks,
                resolution: playback.resolution,
                bpm: playback.bpm,
                velocity: DEFAULT_NOTE_VELOCITY,
                trackId,
                frequency: note.frequency,
                noteName: note.noteName,
                midi: note.midi,
                pitchClass: note.pitchClass,
                octave: note.octave,
              });
              events.push(event);
              chordEvents.push(event);
            });
            activeCells.set(trackId, chordEvents);
            lineTokens.push({
              ...tokenBase,
              displayText: cell,
              isRest: false,
            });
            currentTick = endTick;
            return;
          }

          const event = createNormalizedNoteEvent({
            tick: startTick,
            key: parsed.note.mappedKey,
            durationTicks: unitTicks,
            resolution: playback.resolution,
            bpm: playback.bpm,
            velocity: DEFAULT_NOTE_VELOCITY,
            trackId,
            frequency: parsed.note.frequency,
            noteName: parsed.note.noteName,
            midi: parsed.note.midi,
            pitchClass: parsed.note.pitchClass,
            octave: parsed.note.octave,
          });
          events.push(event);
          activeCells.set(trackId, event);
          lineTokens.push({
            ...tokenBase,
            displayText: parsed.note.pitch,
            isRest: false,
          });
          currentTick = endTick;
        });

        lineTokens.push({
          id: `${trackId}-${lineIndex}-${measureOffset}-bar`,
          text: '|',
          startTick: currentTick,
          endTick: currentTick,
          trackId,
          isBar: true,
          isRest: false,
          measureBeats: expectedMeasureBeats,
          expectedMeasureBeats,
          measureIndex: measureOffset + 1,
        });
      });

      trackCursors.set(trackId, currentTick);

      if (currentTick > lineStartTick) {
        const lineId = `numbered-grid-line-${lineIndex}`;
        lines.push({
          id: lineId,
          trackId,
          label: body.length > 24 ? `${body.slice(0, 24).trim()}...` : body,
          content: rawLine,
          startTick: lineStartTick,
          endTick: currentTick,
        });
        tokenLines.push({
          id: lineId,
          trackId,
          label: body,
          content: rawLine,
          startTick: lineStartTick,
          endTick: currentTick,
          tokens: lineTokens,
        });
        lineIndex += 1;
      }
    });

  trackCursors.forEach((endTick, trackId) => {
    closeActiveCell(trackId, endTick);
  });

  const contentEndTick = [...trackCursors.values()].reduce((maxTick, value) => Math.max(maxTick, value), 0);
  const normalized = buildNormalizedResult(events, {
    ...playback,
    contentEndTick,
  });

  return {
    ...normalized,
    structure: {
      lines,
      tokenLines,
      contentEndTick,
      unitTicks,
      beatTicks: playback.resolution,
      gridUnit: unit,
      expectedMeasureUnits,
    },
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
    startTick: safeTick,
    tick: safeTick,
    k: key,
    isRest,
    durationSec: ticksToSeconds(safeDurationTicks, bpm, resolution),
    durationTick: safeDurationTicks,
    durationTicks: safeDurationTicks,
    endTick: safeTick + safeDurationTicks,
    resolution,
    v: clampVelocity(velocity),
    trackId,
    frequency: toFiniteOrNull(frequency),
    noteName: noteName ?? null,
    midi: toFiniteOrNull(midi),
    pitchClass: pitchClass ?? null,
    octave: toFiniteOrNull(octave),
  };
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

function parseLegacyBeatCell(cellText) {
  const items = [];
  const text = String(cellText ?? '').replace(/\|/gu, '');
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === ' ' || char === '\t' || char === '\u3000') {
      items.push({ type: 'rest' });
      index += 1;
      continue;
    }

    if (char === '0') {
      items.push({ type: 'rest', explicit: true });
      index += 1;
      continue;
    }

    if (char === '(') {
      index += 1;
      const keys = [];

      while (index < text.length && text[index] !== ')') {
        const innerChar = text[index];
        if (innerChar === ' ' || innerChar === '\t' || innerChar === '\u3000') {
          index += 1;
          continue;
        }

        const { token, nextIndex } = readToken(text, index);
        const mappedKey = mapKey(token);
        if (mappedKey) {
          keys.push(mappedKey);
        }
        index = nextIndex;
      }

      if (text[index] === ')') {
        index += 1;
      }

      if (keys.length > 0) {
        items.push({ type: 'chord', keys });
      }

      continue;
    }

    const { token, nextIndex } = readToken(text, index);
    const mappedKey = mapKey(token);
    if (mappedKey) {
      items.push({ type: 'note', key: mappedKey });
    }
    index = nextIndex;
  }

  return items;
}

function appendLegacyBeatCellEvents(cellText, parserState) {
  const events = [];
  const items = parseLegacyBeatCell(cellText);
  const cellStartTick = parserState.currentTick;

  if (items.length === 0) {
    parserState.currentTick += parserState.unitTicks;
    return events;
  }

  items.forEach((item, itemIndex) => {
    const itemStartTick = cellStartTick + Math.round((itemIndex * parserState.unitTicks) / items.length);
    const itemEndTick = cellStartTick + Math.round(((itemIndex + 1) * parserState.unitTicks) / items.length);
    const durationTicks = Math.max(1, itemEndTick - itemStartTick);

    if (item.type === 'rest') {
      events.push(createNormalizedNoteEvent({
        tick: itemStartTick,
        key: null,
        durationTicks,
        resolution: parserState.resolution,
        bpm: parserState.bpm,
        velocity: 0,
        isRest: true,
      }));
      return;
    }

    if (item.type === 'chord') {
      item.keys.forEach((key, keyIndex) => {
        events.push(createNormalizedNoteEvent({
          tick: itemStartTick + (parserState.chordStrumTicks * keyIndex),
          key,
          durationTicks,
          resolution: parserState.resolution,
          bpm: parserState.bpm,
          velocity: DEFAULT_NOTE_VELOCITY,
        }));
      });
      return;
    }

    if (item.type === 'note') {
      events.push(createNormalizedNoteEvent({
        tick: itemStartTick,
        key: item.key,
        durationTicks,
        resolution: parserState.resolution,
        bpm: parserState.bpm,
        velocity: DEFAULT_NOTE_VELOCITY,
      }));
    }
  });

  parserState.currentTick += parserState.unitTicks;
  return events;
}

function parseLegacyBeatLine(lineText, parserState) {
  const events = [];
  const cleanLine = String(lineText ?? '').replace(/\/\/.*$/gm, '');
  const lineStartTick = parserState.currentTick;
  const linePreview = cleanLine.replace(/\|/gu, '').trim();
  const hasVisibleContent = linePreview.length > 0;
  let currentCell = '';

  for (let index = 0; index < cleanLine.length; index += 1) {
    const char = cleanLine[index];

    if (char === '/') {
      events.push(...appendLegacyBeatCellEvents(currentCell, parserState));
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 && currentCell.trim().length > 0) {
    events.push(...appendLegacyBeatCellEvents(currentCell, parserState));
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
        keys.forEach((key, keyIndex) => {
          events.push(createNormalizedNoteEvent({
            tick: parserState.currentTick + (parserState.chordStrumTicks * keyIndex),
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

function parseBeatLegacyScoreText(text, config = {}) {
  const playback = createPlaybackState({
    ...config,
    resolution: PPQ,
    textNotation: 'legacy-beat',
    articulationRatio: 1,
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
      const parsedLine = parseLegacyBeatLine(lineText, parserState);
      events.push(...parsedLine.events);

      if (parsedLine.line && parsedLine.line.endTick > parsedLine.line.startTick) {
        lines.push({
          id: `beat-line-${lineIndex}`,
          ...parsedLine.line,
        });
      }
    });

  const normalized = buildNormalizedResult(events, {
    ...playback,
    contentEndTick: parserState.currentTick,
  });

  return {
    ...normalized,
    structure: {
      lines,
      contentEndTick: parserState.currentTick,
      unitTicks: timing.unitTicks,
      beatTicks: timing.beatTicks,
    },
  };
}

export function analyzeLegacyScoreText(text, config = {}) {
  const playback = createPlaybackState({
    ...config,
    resolution: PPQ,
    textNotation: config.textNotation ?? 'legacy',
    articulationRatio: 1,
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

export function legacyParser(text, config = {}) {
  return parseLegacyScoreText(text, config);
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
    if (config.textNotation === 'keshifu') {
      return parseKeshifuToCanonical(input, {
        defaultBPM: config.bpm ?? DEFAULT_SCORE_PARAMS.bpm,
        globalKeyOffset: config.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
        scaleMode: config.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
        ppq: PPQ,
        arpeggioAcceleration: config.arpeggioAcceleration ?? 0,
      });
    }

    if (config.textNotation === 'jianpu') {
      return parseJianpuScoreText(input, config);
    }

    if (config.textNotation === 'timed-token') {
      return parseTimedTokenNotation(input, config);
    }

    if (config.textNotation === 'numbered-grid') {
      return parseNumberedGridNotation(input, config);
    }

    if (config.textNotation === 'legacy-beat' || config.legacyTimingMode === 'beat') {
      return parseBeatLegacyScoreText(input, config);
    }

    if (config.textNotation === 'legacy') {
      return parseLegacyScoreText(input, config);
    }

    if (looksLikeKeshifuText(input)) {
      return parseKeshifuToCanonical(input, {
        defaultBPM: config.bpm ?? DEFAULT_SCORE_PARAMS.bpm,
        globalKeyOffset: config.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
        scaleMode: config.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
        ppq: PPQ,
        arpeggioAcceleration: config.arpeggioAcceleration ?? 0,
      });
    }

    if (looksLikeTimedTokenText(input)) {
      return parseTimedTokenNotation(input, config);
    }

    if (looksLikeNumberedGridText(input)) {
      return parseNumberedGridNotation(input, config);
    }

    if (looksLikeJianpuText(input)) {
      return parseJianpuScoreText(input, config);
    }

    if (config.legacyTimingMode === 'beat') {
      return parseBeatLegacyScoreText(input, config);
    }

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
