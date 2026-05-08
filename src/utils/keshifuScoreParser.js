import { KEY_INFO_MAP, mapKey } from '../constants/music.js';

const DEFAULT_TRACK_ID = 'keshifu_track';
const DEFAULT_VELOCITY = 0.85;
const DEFAULT_TIME_SIG_NUM = 4;
const DEFAULT_TIME_SIG_DEN = 4;
const TRACK_PREFIX = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/u;
const FLOAT_TOKEN_PATTERN = /^\d+(?:\.\d+)?$/u;
const KESHIFU_KEY_PATTERN = /(?:[+-]?[1-7]|[QWERTYUIASDFGHJKLZXCVBNM])/iu;
const REST_TOKENS = new Set(['L', 'l', '0']);

function stripScoreComments(text) {
  return String(text ?? '').replace(/\/\/.*$/gm, '');
}

function preprocessKeshifuText(rawText) {
  return String(rawText ?? '')
    .replace(/^\uFEFF/u, '')
    .replace(/\\+/gu, '')
    .replace(/<\/?(?:br|div|p|span)[^>]*>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\r\n?/gu, '\n')
    .replace(/\u00A0/gu, ' ')
    .replace(/\u3000/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n');
}

function clampVelocity(value, fallback = DEFAULT_VELOCITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, numeric));
}

function toFiniteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function transposeFrequency(baseFrequency, semitoneOffset) {
  return baseFrequency * 2 ** (semitoneOffset / 12);
}

function noteNameToMidi(noteName) {
  const match = /^([A-G])([#b]?)(-?\d+)$/u.exec(String(noteName ?? ''));
  if (!match) {
    return null;
  }

  const [, letter, accidental, octaveText] = match;
  const semitones = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  let midi = (Number(octaveText) + 1) * 12 + semitones[letter];
  if (accidental === '#') midi += 1;
  if (accidental === 'b') midi -= 1;
  return midi;
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((Number(midi) - 69) / 12);
}

function semitoneToNoteName(semitone) {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][semitone] ?? 'C';
}

function midiToNoteName(midi) {
  const safeMidi = Math.round(Number(midi) || 0);
  const pitchClass = ((safeMidi % 12) + 12) % 12;
  const octave = Math.floor(safeMidi / 12) - 1;
  return `${semitoneToNoteName(pitchClass)}${octave}`;
}

function buildTempoEntry(startTick, beatSeconds, ppq) {
  const safeBeatSeconds = Math.max(Number(beatSeconds) || 0, 0.001);
  return {
    startTick: Math.max(0, Math.round(Number(startTick) || 0)),
    beatSeconds: safeBeatSeconds,
    bpm: 60 / safeBeatSeconds,
    secondsPerTick: safeBeatSeconds / Math.max(Number(ppq) || 96, 1),
  };
}

function normalizeTempoMap(entries, beatSeconds, ppq) {
  const fallbackEntry = buildTempoEntry(0, beatSeconds, ppq);
  const sorted = (Array.isArray(entries) ? entries : [])
    .map((entry) => buildTempoEntry(entry?.startTick, entry?.beatSeconds, ppq))
    .sort((left, right) => left.startTick - right.startTick);

  if (sorted.length === 0 || sorted[0].startTick !== 0) {
    return [fallbackEntry, ...sorted];
  }

  return sorted.filter((entry, index) => {
    if (index === 0) {
      return true;
    }

    const previous = sorted[index - 1];
    return (
      entry.startTick !== previous.startTick
      || Math.abs(entry.secondsPerTick - previous.secondsPerTick) > 1e-9
    );
  });
}

function ticksToSecondsWithTempoMap(ticks, tempoMap) {
  const safeTick = Math.max(Number(ticks) || 0, 0);
  if (!Array.isArray(tempoMap) || tempoMap.length === 0) {
    return 0;
  }

  let totalSeconds = 0;

  for (let index = 0; index < tempoMap.length; index += 1) {
    const segment = tempoMap[index];
    const nextStartTick = tempoMap[index + 1]?.startTick ?? Infinity;

    if (safeTick <= segment.startTick) {
      break;
    }

    const segmentEndTick = Math.min(safeTick, nextStartTick);
    totalSeconds += Math.max(segmentEndTick - segment.startTick, 0) * segment.secondsPerTick;

    if (safeTick < nextStartTick) {
      break;
    }
  }

  return totalSeconds;
}

function tickSpanToSeconds(startTick, durationTicks, tempoMap) {
  const safeStartTick = Math.max(Number(startTick) || 0, 0);
  const safeDurationTicks = Math.max(Number(durationTicks) || 0, 0);
  return ticksToSecondsWithTempoMap(safeStartTick + safeDurationTicks, tempoMap)
    - ticksToSecondsWithTempoMap(safeStartTick, tempoMap);
}

function createCanonicalEvent({
  tick,
  durationTicks,
  key,
  k,
  velocity = DEFAULT_VELOCITY,
  trackId = DEFAULT_TRACK_ID,
  frequency = null,
  noteName = null,
  midi = null,
  pitchClass = null,
  octave = null,
  tempoMap,
}) {
  const safeTick = Math.max(0, Math.round(Number(tick) || 0));
  const safeDurationTicks = Math.max(1, Math.round(Number(durationTicks) || 0));

  return {
    time: ticksToSecondsWithTempoMap(safeTick, tempoMap),
    startTick: safeTick,
    tick: safeTick,
    k: key ?? k ?? null,
    isRest: false,
    durationSec: tickSpanToSeconds(safeTick, safeDurationTicks, tempoMap),
    durationTick: safeDurationTicks,
    durationTicks: safeDurationTicks,
    endTick: safeTick + safeDurationTicks,
    resolution: null,
    v: clampVelocity(velocity),
    trackId,
    frequency: toFiniteOrNull(frequency),
    noteName,
    midi: toFiniteOrNull(midi),
    pitchClass,
    octave: toFiniteOrNull(octave),
  };
}

function resolveTrackDeclaration(rawLine) {
  const cleaned = String(rawLine ?? '').trim();
  if (!cleaned) {
    return null;
  }

  const match = TRACK_PREFIX.exec(cleaned);
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

function splitBeatSegments(lineText) {
  const segments = [];
  let currentSegment = '';
  let sawSlash = false;

  for (let index = 0; index < lineText.length; index += 1) {
    const char = lineText[index];
    if (char === '/') {
      segments.push(currentSegment);
      currentSegment = '';
      sawSlash = true;
      continue;
    }

    currentSegment += char;
  }

  if (currentSegment.length > 0 || !sawSlash) {
    segments.push(currentSegment);
  }

  return segments;
}

function parseInitialBeatSeconds(rawText, defaultBPM) {
  const cleaned = stripScoreComments(rawText);
  const lines = cleaned.split(/\r?\n/u);
  const remainingLines = [];
  let beatSeconds = null;
  let consumedHeader = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!consumedHeader && trimmed) {
      if (FLOAT_TOKEN_PATTERN.test(trimmed)) {
        beatSeconds = Math.max(Number(trimmed) || 0, 0.001);
        consumedHeader = true;
        return;
      }

      consumedHeader = true;
    }

    remainingLines.push(line);
  });

  return {
    beatSeconds: beatSeconds ?? (60 / Math.max(Number(defaultBPM) || 125, 1)),
    bodyText: remainingLines.join('\n'),
    usedFallbackTempo: beatSeconds === null,
  };
}

function tokenizeBeatUnits(segmentText) {
  const tokens = [];
  let index = 0;

  while (index < segmentText.length) {
    const char = segmentText[index];

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }

    if (char === '(' || char === '[') {
      const open = char;
      const close = open === '(' ? ')' : ']';
      let body = '';
      let nextIndex = index + 1;

      while (nextIndex < segmentText.length && segmentText[nextIndex] !== close) {
        body += segmentText[nextIndex];
        nextIndex += 1;
      }

      tokens.push({
        type: open === '(' ? 'chord' : 'arpeggio',
        raw: body,
      });

      index = nextIndex < segmentText.length ? nextIndex + 1 : segmentText.length;
      continue;
    }

    if (char === 'L' || char === 'l' || char === '0') {
      tokens.push({ type: 'rest', raw: char });
      index += 1;
      continue;
    }

    if ((char === '+' || char === '-') && /[1-7]/u.test(segmentText[index + 1] ?? '')) {
      tokens.push({ type: 'note', raw: `${char}${segmentText[index + 1]}` });
      index += 2;
      continue;
    }

    if (/[A-Za-z0-9]/u.test(char)) {
      tokens.push({ type: 'note', raw: char });
      index += 1;
      continue;
    }

    index += 1;
  }

  return tokens;
}

function tokenizeGroupNotes(groupBody) {
  return String(groupBody ?? '')
    .match(/[+-]?[1-7]|[A-Za-z0-9]/gu)
    ?.filter((token) => !REST_TOKENS.has(token))
    ?? [];
}

function resolvePitchToken(rawToken, globalKeyOffset, scaleMode) {
  // Keyboard-style keshifu tokens map to the existing 3-row key layout.
  // `scaleMode` is kept in the interface for consistency with the newer
  // numbered parser chain, while transposition remains chromatic here.
  void scaleMode;

  const mappedKey = mapKey(rawToken);
  if (!mappedKey) {
    return null;
  }

  const keyInfo = KEY_INFO_MAP[mappedKey];
  if (!keyInfo) {
    return null;
  }

  const semitoneOffset = Number(globalKeyOffset) || 0;
  const baseMidi = noteNameToMidi(keyInfo.n);
  const midi = baseMidi === null ? null : baseMidi + semitoneOffset;
  const frequency = midi === null
    ? transposeFrequency(keyInfo.f, semitoneOffset)
    : midiToFrequency(midi);
  const noteName = midi === null ? keyInfo.n : midiToNoteName(midi);

  return {
    mappedKey,
    noteName,
    frequency,
    midi,
    pitchClass: noteName.replace(/-?\d+$/u, ''),
    octave: midi === null ? null : Math.floor(midi / 12) - 1,
  };
}

function appendTempoChange(tempoMap, startTick, beatSeconds, ppq) {
  const nextEntry = buildTempoEntry(startTick, beatSeconds, ppq);
  const previousEntry = tempoMap[tempoMap.length - 1];

  if (
    previousEntry
    && previousEntry.startTick === nextEntry.startTick
    && Math.abs(previousEntry.secondsPerTick - nextEntry.secondsPerTick) <= 1e-9
  ) {
    return;
  }

  if (
    previousEntry
    && previousEntry.startTick === nextEntry.startTick
    && Math.abs(previousEntry.secondsPerTick - nextEntry.secondsPerTick) > 1e-9
  ) {
    tempoMap[tempoMap.length - 1] = nextEntry;
    return;
  }

  tempoMap.push(nextEntry);
}

function createTokenPreview(token, startTick, endTick, trackId, beatIndex) {
  return {
    id: `${trackId}-beat-${beatIndex}-${startTick}`,
    text: token,
    startTick,
    endTick,
    trackId,
    isBar: false,
    isRest: token === 'L' || token === 'l' || token === '0',
  };
}

export function looksLikeKeshifuText(rawText) {
  const cleaned = stripScoreComments(preprocessKeshifuText(rawText));
  const slashCount = (cleaned.match(/\//gu) ?? []).length;
  if (slashCount < 2) {
    return false;
  }

  const lines = cleaned
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstToken = lines[0] ?? '';
  if (FLOAT_TOKEN_PATTERN.test(firstToken)) {
    return true;
  }

  const withoutTrackPrefixes = cleaned.replace(/^[A-Za-z][\w-]*\s*:\s*/gmu, '');
  return KESHIFU_KEY_PATTERN.test(withoutTrackPrefixes);
}

export function parseKeshifuToCanonical(
  rawText,
  defaultBPM = 125,
  globalKeyOffset = 0,
  scaleMode = 'major',
  ppq = 96,
  arpeggioAcceleration = 0,
) {
  let options = null;
  if (defaultBPM && typeof defaultBPM === 'object' && !Array.isArray(defaultBPM)) {
    options = defaultBPM;
  }

  const resolvedDefaultBPM = options?.defaultBPM ?? options?.bpm ?? defaultBPM;
  const resolvedGlobalKeyOffset = options?.globalKeyOffset ?? globalKeyOffset;
  const resolvedScaleMode = options?.scaleMode ?? scaleMode;
  const resolvedPpq = options?.ppq ?? options?.resolution ?? ppq;
  const resolvedArpeggioAcceleration = options?.arpeggioAcceleration ?? arpeggioAcceleration;
  const safePpq = Math.max(1, Math.round(Number(resolvedPpq) || 96));
  const safeArpeggioAcceleration = Math.min(1, Math.max(0, Number(resolvedArpeggioAcceleration) || 0));
  const cleanText = preprocessKeshifuText(rawText);
  const { beatSeconds: initialBeatSeconds, bodyText } = parseInitialBeatSeconds(cleanText, resolvedDefaultBPM);
  const initialBpm = 60 / initialBeatSeconds;
  const tempoMap = [buildTempoEntry(0, initialBeatSeconds, safePpq)];
  const trackCursors = new Map();
  const events = [];
  const lines = [];
  const tokenLines = [];
  let lineIndex = 0;

  String(bodyText ?? '')
    .split(/\r?\n/u)
    .forEach((rawLine) => {
      const declaration = resolveTrackDeclaration(rawLine);
      if (!declaration?.body) {
        return;
      }

      const { trackId, body } = declaration;
      const beatSegments = splitBeatSegments(body);
      let currentTick = trackCursors.get(trackId) ?? 0;
      let currentBeatSeconds = tempoMap
        .slice()
        .reverse()
        .find((entry) => entry.startTick <= currentTick)?.beatSeconds ?? initialBeatSeconds;
      const lineStartTick = currentTick;
      const lineTokens = [];

      beatSegments.forEach((rawSegment, beatIndex) => {
        const trimmed = String(rawSegment ?? '').trim();

        if (trimmed && FLOAT_TOKEN_PATTERN.test(trimmed)) {
          currentBeatSeconds = Math.max(Number(trimmed) || currentBeatSeconds, 0.001);
          appendTempoChange(tempoMap, currentTick, currentBeatSeconds, safePpq);
          currentTick += safePpq;
          lineTokens.push(createTokenPreview(trimmed, currentTick - safePpq, currentTick, trackId, beatIndex));
          return;
        }

        const beatStartTick = currentTick;
        const units = tokenizeBeatUnits(trimmed);

        if (units.length === 0) {
          currentTick += safePpq;
          lineTokens.push(createTokenPreview('', beatStartTick, currentTick, trackId, beatIndex));
          return;
        }

        // Each `/.../` span is exactly one beat. We distribute the beat across
        // units by rounded boundaries so the full beat always sums back to `ppq`.
        units.forEach((unit, unitIndex) => {
          const unitStartTick = beatStartTick + Math.round((unitIndex * safePpq) / units.length);
          const unitEndTick = beatStartTick + Math.round(((unitIndex + 1) * safePpq) / units.length);
          const durationTicks = Math.max(1, unitEndTick - unitStartTick);

          if (unit.type === 'rest') {
            lineTokens.push(createTokenPreview(unit.raw, unitStartTick, unitEndTick, trackId, beatIndex));
            return;
          }

          if (unit.type === 'note') {
            const pitch = resolvePitchToken(unit.raw, resolvedGlobalKeyOffset, resolvedScaleMode);
            if (!pitch) {
              lineTokens.push(createTokenPreview(unit.raw, unitStartTick, unitEndTick, trackId, beatIndex));
              return;
            }

            events.push({
              tick: unitStartTick,
              durationTicks,
              k: pitch.mappedKey,
              v: DEFAULT_VELOCITY,
              noteName: pitch.noteName,
              frequency: pitch.frequency,
              trackId,
              midi: pitch.midi,
              pitchClass: pitch.pitchClass,
              octave: pitch.octave,
            });
            lineTokens.push(createTokenPreview(unit.raw, unitStartTick, unitEndTick, trackId, beatIndex));
            return;
          }

          if (unit.type === 'chord') {
            const chordNotes = tokenizeGroupNotes(unit.raw)
              .map((token) => resolvePitchToken(token, resolvedGlobalKeyOffset, resolvedScaleMode))
              .filter(Boolean);

            chordNotes.forEach((pitch) => {
              events.push({
                tick: unitStartTick,
                durationTicks,
                k: pitch.mappedKey,
                v: DEFAULT_VELOCITY,
                noteName: pitch.noteName,
                frequency: pitch.frequency,
                trackId,
                midi: pitch.midi,
                pitchClass: pitch.pitchClass,
                octave: pitch.octave,
              });
            });
            lineTokens.push(createTokenPreview(`(${unit.raw})`, unitStartTick, unitEndTick, trackId, beatIndex));
            return;
          }

          if (unit.type === 'arpeggio') {
            const arpeggioNotes = tokenizeGroupNotes(unit.raw)
              .map((token) => resolvePitchToken(token, resolvedGlobalKeyOffset, resolvedScaleMode))
              .filter(Boolean);

            const maxSpreadTicks = Math.max(0, Math.min(
              durationTicks - 1,
              Math.round(durationTicks * 0.5 * safeArpeggioAcceleration),
            ));
            const perNoteOffset = arpeggioNotes.length > 1
              ? maxSpreadTicks / (arpeggioNotes.length - 1)
              : 0;

            arpeggioNotes.forEach((pitch, noteIndex) => {
              const noteStartTick = unitStartTick + Math.round(noteIndex * perNoteOffset);
              const noteDurationTicks = Math.max(1, unitEndTick - noteStartTick);

              events.push({
                tick: noteStartTick,
                durationTicks: noteDurationTicks,
                k: pitch.mappedKey,
                v: DEFAULT_VELOCITY,
                noteName: pitch.noteName,
                frequency: pitch.frequency,
                trackId,
                midi: pitch.midi,
                pitchClass: pitch.pitchClass,
                octave: pitch.octave,
              });
            });
            lineTokens.push(createTokenPreview(`[${unit.raw}]`, unitStartTick, unitEndTick, trackId, beatIndex));
          }
        });

        currentTick += safePpq;
      });

      trackCursors.set(trackId, currentTick);

      if (currentTick > lineStartTick) {
        const label = String(rawLine ?? '').trim();
        const lineId = `keshifu-line-${lineIndex}`;
        lines.push({
          id: lineId,
          trackId,
          label: label.length > 24 ? `${label.slice(0, 24).trim()}...` : label,
          content: rawLine,
          startTick: lineStartTick,
          endTick: currentTick,
        });
        tokenLines.push({
          id: lineId,
          trackId,
          label,
          content: rawLine,
          startTick: lineStartTick,
          endTick: currentTick,
          tokens: lineTokens,
        });
        lineIndex += 1;
      }
    });

  const normalizedTempoMap = normalizeTempoMap(tempoMap, initialBeatSeconds, safePpq);
  const canonicalEvents = events
    .map((event) => createCanonicalEvent({
      ...event,
      tempoMap: normalizedTempoMap,
    }))
    .sort((left, right) => {
      if (left.tick !== right.tick) {
        return left.tick - right.tick;
      }

      return String(left.k ?? '').localeCompare(String(right.k ?? ''));
    });
  const contentEndTick = [...trackCursors.values()].reduce((maxTick, tick) => Math.max(maxTick, tick), 0);
  const maxTick = canonicalEvents.reduce(
    (result, event) => Math.max(result, event.tick + event.durationTicks),
    contentEndTick,
  );
  const maxTime = ticksToSecondsWithTempoMap(maxTick, normalizedTempoMap);

  return {
    events: canonicalEvents,
    maxTime,
    playback: {
      bpm: initialBpm,
      timeSigNum: DEFAULT_TIME_SIG_NUM,
      timeSigDen: DEFAULT_TIME_SIG_DEN,
      resolution: safePpq,
      globalKeyOffset: Number(resolvedGlobalKeyOffset) || 0,
      scaleMode: resolvedScaleMode ?? 'major',
      textNotation: 'keshifu',
      tempoMap: normalizedTempoMap,
    },
    structure: {
      lines,
      tokenLines,
      contentEndTick,
      unitTicks: safePpq,
      beatTicks: safePpq,
    },
  };
}
