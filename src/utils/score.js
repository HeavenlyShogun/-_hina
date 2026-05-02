import { DEFAULT_SCORE_PARAMS, mapKey } from '../constants/music.js';

const OCTAVE_PREFIXES = new Set(['+', '-', '??', '??']);
const DEFAULT_TRACK_ID = 'main';
const DEFAULT_NOTE_VELOCITY = 0.85;
const DEFAULT_CHORD_STRUM_MS = 12;
const DEFAULT_JIANPU_OCTAVE = 4;
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const NUMBERED_TRACK_PREFIX = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/u;
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

function toFiniteOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function parseDurationModifiers(modifiers, quarterTicks = PPQ) {
  const safeQuarterTicks = Math.max(Math.round(Number(quarterTicks) || PPQ), 1);
  const suffix = String(modifiers ?? '');
  const addQuarterCount = (suffix.match(/-/g) ?? []).length;
  const halveCount = (suffix.match(/_/g) ?? []).length;
  const dotCount = (suffix.match(/\./g) ?? []).length;

  let duration = safeQuarterTicks + (addQuarterCount * safeQuarterTicks);
  duration /= 2 ** halveCount;

  let dottedDuration = duration;
  for (let index = 0; index < dotCount; index += 1) {
    dottedDuration += duration / (2 ** (index + 1));
  }

  return Math.max(1, Math.round(dottedDuration));
}

function parseNumberedPitchToken(rawToken, playback) {
  const normalized = String(rawToken ?? '').trim();
  const match = /^(?<accidental>[#bn]?)(?<degree>[0-7])(?<octaveSuffix>['',]*?)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  const degree = Number(match.groups?.degree ?? 0);
  const octaveSuffix = match.groups?.octaveSuffix ?? '';
  const accidentalSymbol = match.groups?.accidental ?? '';
  const accidental = accidentalSymbol === '#'
    ? 1
    : accidentalSymbol === 'b'
      ? -1
      : 0;
  const octaveShift = (octaveSuffix.match(/'/g) ?? []).length - (octaveSuffix.match(/,/g) ?? []).length;

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
    pitch: `${accidentalSymbol}${degree}${naturalKeyToken}`,
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
    const noteTokens = body.match(/[#bn]?[0-7]['',]*/gu) ?? [];
    const notes = noteTokens
      .map((entry) => parseNumberedPitchToken(entry, playback))
      .filter(Boolean)
      .filter((entry) => !entry.isRest);

    if (!notes.length) {
      return null;
    }

    return {
      type: 'chord',
      durationTicks: parseDurationModifiers(modifiers, PPQ),
      notes,
    };
  }

  const noteMatch = /^(?<pitch>[#bn]?[0-7]['',]*)(?<modifiers>[-_.]*)$/u.exec(token);
  if (!noteMatch) {
    return null;
  }

  const note = parseNumberedPitchToken(noteMatch.groups?.pitch, playback);
  if (!note) {
    return null;
  }

  return {
    type: note.isRest ? 'rest' : 'note',
    durationTicks: parseDurationModifiers(noteMatch.groups?.modifiers, PPQ),
    note,
  };
}

function parseJianpuPitchToken(rawToken, playback) {
  const normalized = String(rawToken ?? '').trim();
  const match = /^(?<accidental>[#bn]?)(?<octavePrefix>[+-]*)(?<degree>[0-7])(?<octaveSuffix>['',]*)(?<modifiers>[\/_.]*)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  const accidentalSymbol = match.groups?.accidental ?? '';
  const degree = Number(match.groups?.degree ?? 0);
  const modifiers = match.groups?.modifiers ?? '';
  const octavePrefix = match.groups?.octavePrefix ?? '';
  const octaveSuffix = match.groups?.octaveSuffix ?? '';
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

  return {
    degree,
    isRest: degree === 0,
    modifiers,
    accidental,
    octaveShift,
    frequency: degree === 0
      ? null
      : buildJianpuFrequency({
        degree,
        accidental,
        octaveShift,
        playback,
      }),
    mappedKey: accidental === 0 ? mapKey(`${octaveShift > 0 ? '+' : octaveShift < 0 ? '-' : ''}${degree}`) : null,
  };
}

function parseJianpuChordToken(rawToken, playback) {
  const normalized = String(rawToken ?? '').trim();
  const match = /^\((?<content>[^)]+)\)(?<modifiers>[\/_.]*)$/u.exec(normalized);
  if (!match) {
    return null;
  }

  const content = match.groups?.content ?? '';
  const modifiers = match.groups?.modifiers ?? '';
  const pitchTokens = content
    .match(/[#bn]?[+-]*[0-7]['',]*/gu)
    ?? [];
  const notes = pitchTokens
    .map((token) => parseJianpuPitchToken(token, playback))
    .filter((item) => item && !item.isRest);

  if (!notes.length) {
    return null;
  }

  return {
    type: 'chord',
    modifiers,
    notes,
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

export function parseNumberedMusicalNotation(text, config = {}) {
  const playback = createPlaybackState({
    ...config,
    resolution: PPQ,
  });
  const lines = [];
  const events = [];
  let lineIndex = 0;
  const trackCursors = new Map();

  const appendLine = (rawLine, trackId, startTick, endTick) => {
    const label = String(rawLine ?? '').trim().replace(NUMBERED_TRACK_PREFIX, '$2').trim();
    if (!label || endTick <= startTick) {
      return;
    }

    lines.push({
      id: `jianpu-line-${lineIndex}`,
      trackId,
      label: label.length > 24 ? `${label.slice(0, 24).trim()}...` : label,
      content: rawLine,
      startTick,
      endTick,
    });
    lineIndex += 1;
  };

  String(text ?? '')
    .split(/\r?\n/u)
    .forEach((rawLine) => {
      const declaration = parseTrackDeclaration(rawLine);
      if (!declaration?.body) {
        return;
      }

      const { trackId, body } = declaration;
      const tokens = tokenizeStructuredTextLine(body).filter((token) => token !== '|');
      let currentTick = trackCursors.get(trackId) ?? 0;
      const lineStartTick = currentTick;

      tokens.forEach((token) => {
        const parsedToken = parseNumberedToken(token, playback);
        if (!parsedToken) {
          return;
        }

        if (parsedToken.type === 'rest') {
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
          currentTick += parsedToken.durationTicks;
          return;
        }

        if (parsedToken.type === 'chord') {
          parsedToken.notes.forEach((note) => {
            events.push(createNormalizedNoteEvent({
              tick: currentTick,
              key: note.mappedKey,
              durationTicks: parsedToken.durationTicks,
              resolution: playback.resolution,
              bpm: playback.bpm,
              velocity: DEFAULT_NOTE_VELOCITY,
              trackId,
              frequency: note.frequency,
              noteName: note.noteName,
              midi: note.midi,
              pitchClass: note.pitchClass,
              octave: note.octave,
            }));
          });
          currentTick += parsedToken.durationTicks;
          return;
        }

        const event = createNormalizedNoteEvent({
          tick: currentTick,
          key: parsedToken.note.mappedKey,
          durationTicks: parsedToken.durationTicks,
          resolution: playback.resolution,
          bpm: playback.bpm,
          velocity: DEFAULT_NOTE_VELOCITY,
          trackId,
          frequency: parsedToken.note.frequency,
          noteName: parsedToken.note.noteName,
          midi: parsedToken.note.midi,
          pitchClass: parsedToken.note.pitchClass,
          octave: parsedToken.note.octave,
        });
        events.push(event);
        currentTick += parsedToken.durationTicks;
      });

      trackCursors.set(trackId, currentTick);
      appendLine(rawLine, trackId, lineStartTick, currentTick);
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
      contentEndTick,
      unitTicks: PPQ,
      beatTicks: PPQ,
    },
  };
}

function parseJianpuScoreText(text, config = {}) {
  return parseNumberedMusicalNotation(text, config);
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
    frequency: toFiniteOrNull(frequency),
    noteName: noteName ?? null,
    midi: toFiniteOrNull(midi),
    pitchClass: pitchClass ?? null,
    octave: toFiniteOrNull(octave),
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

function parseBeatLegacyScoreText(text, config = {}) {
  const playback = createPlaybackState({
    ...config,
    resolution: PPQ,
  });
  const timing = resolveLegacyTextTiming(playback);
  const cleanText = stripScoreComments(String(text ?? ''));
  const events = [];
  const lines = [];
  let currentTick = 0;
  let currentSegment = '';
  let lineStartTick = 0;
  let linePreview = '';
  let lineIndex = 0;

  const processSegment = (segment, forceAdvance = false) => {
    const items = parseBeatItems(segment);

    if (items.length === 0 && !forceAdvance) {
      return false;
    }

    const itemSpacingTicks = items.length > 0
      ? Math.max(Math.floor(timing.beatTicks / items.length), 1)
      : timing.beatTicks;

    items.forEach((item, itemIndex) => {
      const tick = currentTick + (itemSpacingTicks * itemIndex);

      if (item.type === 'rest') {
        events.push(createNormalizedNoteEvent({
          tick,
          key: null,
          durationTicks: itemSpacingTicks,
          resolution: PPQ,
          bpm: playback.bpm,
          velocity: 0,
          isRest: true,
        }));
        return;
      }

      if (item.type === 'chord') {
        item.keys.forEach((key, chordIndex) => {
          events.push(createNormalizedNoteEvent({
            tick: tick + (timing.chordStrumTicks * chordIndex),
            key,
            durationTicks: Math.max(itemSpacingTicks, timing.unitTicks),
            resolution: PPQ,
            bpm: playback.bpm,
            velocity: DEFAULT_NOTE_VELOCITY,
          }));
        });
        return;
      }

      if (item.type === 'note') {
        events.push(createNormalizedNoteEvent({
          tick,
          key: item.key,
          durationTicks: Math.max(itemSpacingTicks, timing.unitTicks),
          resolution: PPQ,
          bpm: playback.bpm,
          velocity: DEFAULT_NOTE_VELOCITY,
        }));
      }
    });

    currentTick += timing.beatTicks;
    return true;
  };

  const finishLine = () => {
    const preview = linePreview.replace(/\|/gu, '').trim();
    if (preview && currentTick > lineStartTick) {
      lines.push({
        id: `beat-line-${lineIndex}`,
        label: preview.length > 24 ? `${preview.slice(0, 24).trim()}...` : preview,
        startTick: lineStartTick,
        endTick: currentTick,
      });
    }

    lineIndex += 1;
    lineStartTick = currentTick;
    linePreview = '';
  };

  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];

    if (char === '/') {
      processSegment(currentSegment, true);
      linePreview += currentSegment + char;
      currentSegment = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      if (currentSegment.trim()) {
        const processed = processSegment(currentSegment);
        if (processed) {
          linePreview += currentSegment;
        }
        currentSegment = '';
      }
      finishLine();
      continue;
    }

    if (char === '|') {
      continue;
    }

    currentSegment += char;
  }

  if (currentSegment.trim()) {
    const processed = processSegment(currentSegment);
    if (processed) {
      linePreview += currentSegment;
    }
  }
  finishLine();

  const normalized = buildNormalizedResult(events, {
    ...playback,
    contentEndTick: currentTick,
  });

  return {
    ...normalized,
    structure: {
      lines,
      contentEndTick: currentTick,
      unitTicks: timing.unitTicks,
      beatTicks: timing.beatTicks,
    },
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
    if (config.textNotation === 'jianpu') {
      return parseJianpuScoreText(input, config);
    }

    if (config.textNotation === 'legacy-beat' || config.legacyTimingMode === 'beat') {
      return parseBeatLegacyScoreText(input, config);
    }

    if (config.textNotation === 'legacy') {
      return parseLegacyScoreText(input, config);
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
