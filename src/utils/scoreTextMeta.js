export const META_PREFIX = '// [META] ';

export const SUPPORTED_TEXT_NOTATIONS = new Set([
  'jianpu',
  'legacy',
  'legacy-beat',
  'keshifu',
  'timed-token',
  'numbered-grid',
]);

export function parseScoreMetaHeader(rawText) {
  const source = String(rawText ?? '').replace(/^\uFEFF/u, '');
  const [firstLine = ''] = source.split(/\r?\n/u);
  const trimmed = firstLine.trim();

  if (!trimmed.startsWith(META_PREFIX)) {
    return {
      hasMeta: false,
      meta: {},
      error: null,
    };
  }

  try {
    const parsed = JSON.parse(trimmed.slice(META_PREFIX.length));
    return {
      hasMeta: true,
      meta: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {},
      error: null,
    };
  } catch (error) {
    return {
      hasMeta: true,
      meta: {},
      error,
    };
  }
}

export function stripScoreMetaHeader(rawText) {
  const source = String(rawText ?? '').replace(/^\uFEFF/u, '');
  const lines = source.split(/\r?\n/u);

  if (!lines[0]?.trim().startsWith(META_PREFIX)) {
    return source;
  }

  return lines.slice(1).join('\n').replace(/^\r?\n/u, '');
}

export function buildScoreMetaPayload(source = {}) {
  const payload = {};
  const keys = [
    'title',
    'bpm',
    'timeSigNum',
    'timeSigDen',
    'charResolution',
    'globalKeyOffset',
    'accidentals',
    'scaleMode',
    'tone',
    'reverb',
    'storageFormat',
    'textNotation',
    'legacyTimingMode',
    'ppq',
  ];

  keys.forEach((key) => {
    if (source[key] !== undefined) {
      payload[key] = source[key];
    }
  });

  return payload;
}

export function buildScoreTextWithMeta(rawText, meta = {}) {
  const body = stripScoreMetaHeader(rawText);
  return `${META_PREFIX}${JSON.stringify(meta)}\n${body}`;
}

export function getNotationDisplayName(textNotation) {
  switch (textNotation) {
    case 'legacy':
      return 'Legacy-Key';
    case 'jianpu':
      return 'Modern-Jianpu';
    case 'legacy-beat':
      return 'Legacy-Beat';
    case 'keshifu':
      return 'Keshifu';
    case 'timed-token':
      return 'Timed-Token';
    case 'numbered-grid':
      return 'Numbered-Grid';
    default:
      return String(textNotation ?? 'Unknown');
  }
}
