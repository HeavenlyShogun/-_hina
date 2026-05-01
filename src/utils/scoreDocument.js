import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from '../constants/music';
import { normalizeScoreSource } from './score';

export const SCORE_SOURCE_TYPES = {
  TEXT: 'text',
  JSON: 'json',
};

function normalizeScoreReferences(references) {
  if (!Array.isArray(references)) {
    return [];
  }

  return references
    .map((reference, index) => {
      if (!reference || typeof reference !== 'object') {
        return null;
      }

      const label = String(reference.label ?? reference.title ?? '').trim();
      const url = String(reference.url ?? reference.href ?? '').trim();
      const type = String(reference.type ?? reference.kind ?? 'link').trim() || 'link';

      if (!label && !url) {
        return null;
      }

      return {
        id: String(reference.id ?? `reference-${index + 1}`),
        label: label || url,
        url,
        type,
      };
    })
    .filter(Boolean);
}

function resolveReferenceFields(source = {}, sourceType = SCORE_SOURCE_TYPES.TEXT) {
  const directReferences = normalizeScoreReferences(source.references);
  const directReferenceNotes = typeof source.referenceNotes === 'string' ? source.referenceNotes : '';

  if (directReferences.length > 0 || directReferenceNotes) {
    return {
      references: directReferences,
      referenceNotes: directReferenceNotes,
    };
  }

  if (sourceType === SCORE_SOURCE_TYPES.JSON && source.content && typeof source.content === 'object') {
    return {
      references: normalizeScoreReferences(source.content?.meta?.references),
      referenceNotes: String(source.content?.meta?.referenceNotes ?? ''),
    };
  }

  return {
    references: [],
    referenceNotes: '',
  };
}

export function transposeFrequency(baseFrequency, semitoneOffset) {
  return baseFrequency * 2 ** (semitoneOffset / 12);
}

export function serializeScoreContent(content, sourceType = SCORE_SOURCE_TYPES.TEXT) {
  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }

  return sourceType === SCORE_SOURCE_TYPES.JSON ? '{}' : '';
}

export function parseScoreContent(rawText, sourceType = SCORE_SOURCE_TYPES.TEXT) {
  if (sourceType === SCORE_SOURCE_TYPES.JSON) {
    return JSON.parse(rawText || '{}');
  }

  return rawText ?? '';
}

export function inferSourceType(source = {}) {
  if (source.sourceType) {
    return source.sourceType;
  }

  if (typeof source.content === 'object' && source.content !== null) {
    return SCORE_SOURCE_TYPES.JSON;
  }

  if (typeof source.rawText === 'string') {
    try {
      JSON.parse(source.rawText);
      return SCORE_SOURCE_TYPES.JSON;
    } catch {}
  }

  return SCORE_SOURCE_TYPES.TEXT;
}

export function createScorePlaybackConfig(source = {}) {
  return {
    bpm: Number(source.bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: Number(source.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: Number(source.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: Number(source.charResolution) || DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: Number(source.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
    accidentals:
      source.accidentals && typeof source.accidentals === 'object' && !Array.isArray(source.accidentals)
        ? source.accidentals
        : {},
    scaleMode: source.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
    tone: source.tone ?? DEFAULT_SCORE_PARAMS.tone,
    reverb: source.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
    legacyTimingMode: source.legacyTimingMode,
  };
}

export function compileScoreEvents(rawText, options = {}) {
  const sourceType = options.sourceType ?? SCORE_SOURCE_TYPES.TEXT;
  const playback = createScorePlaybackConfig(options);
  const content = parseScoreContent(rawText, sourceType);
  const normalized = normalizeScoreSource(content, playback);

  return normalized.events.map((event) => {
    const keyInfo = KEY_INFO_MAP[event.k];
    const semitoneOffset =
      Number(playback.globalKeyOffset) + (playback.accidentals?.[event.k] ? 1 : 0);

    return {
      key: event.k,
      note: keyInfo?.n || event.k,
      frequency: keyInfo ? transposeFrequency(keyInfo.f, semitoneOffset) : undefined,
      time: Number(event.time.toFixed(6)),
      duration: Number((event.durationSec ?? 0.1).toFixed(6)),
      velocity: Number((event.v ?? 0.85).toFixed(4)),
      trackId: event.trackId || 'main',
    };
  });
}

export function createScoreDocument(source = {}) {
  const sourceType = inferSourceType(source);
  const rawText = typeof source.rawText === 'string'
    ? source.rawText
    : serializeScoreContent(source.content, sourceType);
  const playback = createScorePlaybackConfig(source);
  const referenceFields = resolveReferenceFields(source, sourceType);
  const compiledEvents = Array.isArray(source.compiledEvents)
    ? source.compiledEvents
    : compileScoreEvents(rawText, { ...playback, sourceType });

  return {
    id: source.id ?? source.title ?? '',
    title: String(source.title ?? '未命名琴譜').trim() || '未命名琴譜',
    rawText,
    compiledEvents,
    sourceType,
    references: referenceFields.references,
    referenceNotes: referenceFields.referenceNotes,
    ...playback,
  };
}
