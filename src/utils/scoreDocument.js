import { DEFAULT_SCORE_PARAMS } from '../constants/music.js';
import { DEFAULT_SCORE_NAME } from '../config/branding.js';
import { normalizeScoreSource } from './score.js';
import { buildScoreMetaPayload, parseScoreMetaHeader } from './scoreTextMeta.js';

export const SCORE_SOURCE_TYPES = {
  TEXT: 'text',
  JSON: 'json',
};

const JSON_PARSE_CACHE_LIMIT = 12;
const DEFAULT_EVENT_VELOCITY = 0.85;
const jsonParseCache = new Map();

function rememberParsedJson(rawText, parsed) {
  jsonParseCache.set(rawText, parsed);

  if (jsonParseCache.size > JSON_PARSE_CACHE_LIMIT) {
    const oldestKey = jsonParseCache.keys().next().value;
    if (oldestKey !== undefined) {
      jsonParseCache.delete(oldestKey);
    }
  }

  return parsed;
}

function resolveDefaultCharResolution(source = {}) {
  const explicitCharResolution = Number(source.charResolution);
  if (Number.isFinite(explicitCharResolution) && explicitCharResolution > 0) {
    return explicitCharResolution;
  }

  if (source.textNotation === 'legacy' || source.legacyTimingMode === 'absolute') {
    return 8;
  }

  return DEFAULT_SCORE_PARAMS.charResolution;
}

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

export function serializeScoreContent(content, sourceType = SCORE_SOURCE_TYPES.TEXT) {
  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object') {
    const serializableContent = sourceType === SCORE_SOURCE_TYPES.JSON
      ? minifyDefaultScoreSettings(cloneJsonValue(content))
      : content;

    return JSON.stringify(serializableContent, null, 2);
  }

  return sourceType === SCORE_SOURCE_TYPES.JSON ? '{}' : '';
}

export function parseScoreContent(rawText, sourceType = SCORE_SOURCE_TYPES.TEXT) {
  if (sourceType === SCORE_SOURCE_TYPES.JSON) {
    const source = rawText || '{}';
    if (jsonParseCache.has(source)) {
      return jsonParseCache.get(source);
    }

    return rememberParsedJson(source, JSON.parse(source));
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
  const contentPlayback = source.sourceType === SCORE_SOURCE_TYPES.JSON && source.content && typeof source.content === 'object'
    ? source.content.playback ?? {}
    : {};
  const contentTransport = source.sourceType === SCORE_SOURCE_TYPES.JSON && source.content && typeof source.content === 'object'
    ? source.content.transport ?? {}
    : {};
  const base = {
    ...contentTransport,
    ...contentPlayback,
    ...source,
  };

  return {
    bpm: Number(base.bpm) || DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: Number(base.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: Number(base.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: resolveDefaultCharResolution(base),
    globalKeyOffset: Number(base.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
    accidentals:
      base.accidentals && typeof base.accidentals === 'object' && !Array.isArray(base.accidentals)
        ? base.accidentals
        : {},
    scaleMode: base.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
    tone: base.tone ?? DEFAULT_SCORE_PARAMS.tone,
    reverb: base.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
    vol: Number.isFinite(Number(base.vol)) ? Number(base.vol) : undefined,
    resolution: Number.isFinite(Number(base.resolution)) ? Math.max(1, Math.round(Number(base.resolution))) : undefined,
    tempoMap: Array.isArray(base.tempoMap) ? base.tempoMap : undefined,
    articulationRatio: Number.isFinite(Number(base.articulationRatio)) ? Number(base.articulationRatio) : undefined,
    legacyTimingMode: base.legacyTimingMode,
    textNotation: base.textNotation,
  };
}

export function compileScoreEvents(rawText, options = {}) {
  const sourceType = options.sourceType ?? SCORE_SOURCE_TYPES.TEXT;
  const playback = createScorePlaybackConfig(options);
  const content = parseScoreContent(rawText, sourceType);
  const normalized = normalizeScoreSource(content, playback);
  return normalized.events;
}

function isCanonicalCompiledEvent(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }

  return Number.isFinite(Number(event.tick))
    && Number.isFinite(Number(event.durationTicks))
    && Number.isFinite(Number(event.time))
    && Number.isFinite(Number(event.durationSec))
    && Number.isFinite(Number(event.v));
}

export function createScoreDocument(source = {}) {
  const sourceType = inferSourceType(source);
  const rawText = typeof source.rawText === 'string'
    ? source.rawText
    : sourceType === SCORE_SOURCE_TYPES.JSON && source.content && typeof source.content === 'object'
      ? ''
      : serializeScoreContent(source.content, sourceType);
  const content = sourceType === SCORE_SOURCE_TYPES.JSON && source.content && typeof source.content === 'object'
    ? source.content
    : null;
  const textMeta = sourceType === SCORE_SOURCE_TYPES.TEXT ? parseScoreMetaHeader(rawText) : null;
  const mergedSource = textMeta?.hasMeta && !textMeta?.error
    ? { ...source, ...textMeta.meta }
    : source;
  const playback = createScorePlaybackConfig(mergedSource);
  const referenceFields = resolveReferenceFields(source, sourceType);
  const compiledEvents = Array.isArray(source.compiledEvents)
    && source.compiledEvents.every(isCanonicalCompiledEvent)
    ? source.compiledEvents
    : [];
  const resolvedTitle = String(
    mergedSource.title
    ?? source.title
    ?? content?.meta?.displayTitle
    ?? content?.meta?.title
    ?? DEFAULT_SCORE_NAME,
  ).trim() || DEFAULT_SCORE_NAME;
  const resolvedId = String(
    mergedSource.id
    ?? source.id
    ?? source.meta?.id
    ?? content?.meta?.id
    ?? mergedSource.title
    ?? source.title
    ?? '',
  ).trim();

  return {
    id: resolvedId,
    title: resolvedTitle,
    rawText,
    content,
    compiledEvents,
    sourceType,
    references: referenceFields.references,
    referenceNotes: referenceFields.referenceNotes,
    ...playback,
  };
}

export function createScoreTextMeta(source = {}) {
  return buildScoreMetaPayload({
    ...source,
    storageFormat:
      source.storageFormat
      ?? (source.textNotation === 'legacy' ? 'legacy-text@1' : source.textNotation === 'legacy-beat' ? 'legacy-beat@1' : 'numbered-text@1'),
    textNotation: source.textNotation ?? 'jianpu',
    ppq: source.ppq ?? 96,
  });
}

function hasOwnValue(source, key) {
  return source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined;
}

function numberOrFallback(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cloneJsonValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function valuesMatch(left, right) {
  if (Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
    return Math.abs(Number(left) - Number(right)) < 1e-6;
  }

  return left === right;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyPlainObject(value) {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function deleteIfDefault(target, key, fallback) {
  if (!target || !Object.prototype.hasOwnProperty.call(target, key)) {
    return;
  }

  if (valuesMatch(target[key], fallback)) {
    delete target[key];
  }
}

function minifyDefaultScoreSettings(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return content;
  }

  const transport = content.transport;
  if (isPlainObject(transport)) {
    ['bpm', 'timeSigNum', 'timeSigDen'].forEach((key) => {
      deleteIfDefault(transport, key, DEFAULT_SCORE_PARAMS[key]);
    });

    if (isEmptyPlainObject(transport)) {
      delete content.transport;
    }
  }

  const playback = content.playback;
  if (isPlainObject(playback)) {
    deleteIfDefault(playback, 'tone', DEFAULT_SCORE_PARAMS.tone);
    deleteIfDefault(playback, 'globalKeyOffset', DEFAULT_SCORE_PARAMS.globalKeyOffset);
    deleteIfDefault(playback, 'scaleMode', DEFAULT_SCORE_PARAMS.scaleMode);
    deleteIfDefault(playback, 'reverb', DEFAULT_SCORE_PARAMS.reverb);

    if (isEmptyPlainObject(playback.accidentals)) {
      delete playback.accidentals;
    }

    if (isEmptyPlainObject(playback)) {
      delete content.playback;
    }
  }

  if (Array.isArray(content.tracks)) {
    content.tracks.forEach((track) => {
      if (!Array.isArray(track?.events)) {
        return;
      }

      track.events.forEach((event) => {
        if (!event || typeof event !== 'object') {
          return;
        }

        deleteIfDefault(event, 'velocity', DEFAULT_EVENT_VELOCITY);
      });
    });
  }

  return content;
}

function buildTransportPatch(settings = {}) {
  const patch = {};

  ['bpm', 'timeSigNum', 'timeSigDen'].forEach((key) => {
    if (hasOwnValue(settings, key)) {
      patch[key] = numberOrFallback(settings[key], DEFAULT_SCORE_PARAMS[key]);
    }
  });

  if (hasOwnValue(settings, 'resolution')) {
    patch.resolution = Math.max(1, Math.round(numberOrFallback(settings.resolution, 480)));
  }

  return patch;
}

function resolveTransportResolution(content = {}, settings = {}) {
  const candidates = [
    settings.resolution,
    content?.transport?.resolution,
    content?.playback?.resolution,
    settings.ppq,
  ];

  const resolved = candidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0);

  return resolved || 480;
}

function applySingleTempoMapBpm(content, bpm, settings = {}) {
  if (!Array.isArray(content?.playback?.tempoMap) || content.playback.tempoMap.length !== 1) {
    return;
  }

  const [entry] = content.playback.tempoMap;
  if (Array.isArray(entry)) {
    content.playback.tempoMap = [[Number(entry[0]) || 0, bpm]];
    return;
  }

  if (entry && typeof entry === 'object') {
    const resolution = resolveTransportResolution(content, settings);
    content.playback.tempoMap = [{
      ...entry,
      startTick: Math.max(0, Math.round(Number(entry.startTick ?? entry.ticks ?? 0) || 0)),
      bpm,
      secondsPerTick: (60 / bpm) / resolution,
    }];
  }
}

function buildPlaybackPatch(settings = {}) {
  const patch = {};

  if (hasOwnValue(settings, 'tone')) {
    patch.tone = settings.tone;
  }
  if (hasOwnValue(settings, 'vol')) {
    patch.vol = numberOrFallback(settings.vol, 0.6);
  }
  if (hasOwnValue(settings, 'globalKeyOffset')) {
    patch.globalKeyOffset = numberOrFallback(
      settings.globalKeyOffset,
      DEFAULT_SCORE_PARAMS.globalKeyOffset,
    );
  }
  if (hasOwnValue(settings, 'scaleMode')) {
    patch.scaleMode = settings.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode;
  }
  if (hasOwnValue(settings, 'reverb')) {
    patch.reverb = Boolean(settings.reverb);
  }
  if (settings.accidentals && typeof settings.accidentals === 'object' && !Array.isArray(settings.accidentals)) {
    patch.accidentals = { ...settings.accidentals };
  }

  return patch;
}

export function applyScoreSettingsToJsonContent(content, settings = {}) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return content;
  }

  const nextContent = cloneJsonValue(content);
  const transportPatch = buildTransportPatch(settings);
  const playbackPatch = buildPlaybackPatch(settings);

  nextContent.transport = {
    ...(nextContent.transport ?? {}),
    ...transportPatch,
  };

  nextContent.playback = {
    ...(nextContent.playback ?? {}),
    ...playbackPatch,
  };

  if (hasOwnValue(settings, 'title')) {
    nextContent.meta = {
      ...(nextContent.meta ?? {}),
      title: String(settings.title || nextContent.meta?.title || DEFAULT_SCORE_NAME),
      displayTitle: nextContent.meta?.displayTitle ?? String(settings.title || DEFAULT_SCORE_NAME),
    };
  }

  if (hasOwnValue(settings, 'bpm')) {
    applySingleTempoMapBpm(nextContent, transportPatch.bpm, settings);
  }

  return minifyDefaultScoreSettings(nextContent);
}
