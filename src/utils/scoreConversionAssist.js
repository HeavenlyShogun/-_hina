const NOTE_LAYOUT_GUIDE = [
  'Low:  z=C3 x=D3 c=E3 v=F3 b=G3 n=A3 m=B3',
  'Mid:  a=C4 s=D4 d=E4 f=F4 g=G4 h=A4 j=B4',
  'High: q=C5 w=D5 e=E5 r=F5 t=G5 y=A5 u=B5',
];

const FULLWIDTH_REPLACEMENTS = {
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '｜': '|',
  '／': '/',
  '，': ',',
  '。': '.',
  '：': ':',
  '；': ';',
  '！': '!',
  '？': '?',
  '　': ' ',
  '＋': '+',
  '－': '-',
  '＝': '=',
  '＃': '#',
  '♯': '#',
  '♭': 'b',
};

const FULLWIDTH_DIGITS = '０１２３４５６７８９';
const ASCII_DIGITS = '0123456789';

function replaceFullWidthCharacters(text) {
  let result = String(text ?? '');

  Object.entries(FULLWIDTH_REPLACEMENTS).forEach(([from, to]) => {
    result = result.split(from).join(to);
  });

  for (let index = 0; index < FULLWIDTH_DIGITS.length; index += 1) {
    result = result.split(FULLWIDTH_DIGITS[index]).join(ASCII_DIGITS[index]);
  }

  return result;
}

function formatReferences(references) {
  if (!Array.isArray(references) || references.length === 0) {
    return 'None';
  }

  return references
    .map((reference, index) => {
      const label = String(reference?.label ?? '').trim();
      const url = String(reference?.url ?? '').trim();
      const type = String(reference?.type ?? 'link').trim();
      return `${index + 1}. [${type}] ${label || '(no label)'}${url ? ` - ${url}` : ''}`;
    })
    .join('\n');
}

export function normalizeExternalNotationDraft(text) {
  const normalized = replaceFullWidthCharacters(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s*([\[\]\(\)])/g, ' $1')
    .replace(/([\[\]\(\)])\s*/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  return normalized;
}

export function tryParseJsonScoreText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function buildAiConversionPrompt({
  title,
  notationType,
  outputFormat,
  playbackConfig,
  references,
  referenceNotes,
  sourceText,
}) {
  const safeTitle = String(title || 'Untitled Score').trim() || 'Untitled Score';
  const safeNotationType = notationType || 'jianpu';
  const safeOutputFormat = outputFormat || 'legacy-text';
  const safeSourceText = String(sourceText ?? '').trim();
  const safeReferenceNotes = String(referenceNotes ?? '').trim();
  const safeBpm = Number(playbackConfig?.bpm) || 90;
  const safeTimeSigNum = Number(playbackConfig?.timeSigNum) || 4;
  const safeTimeSigDen = Number(playbackConfig?.timeSigDen) || 4;
  const safeCharResolution = Number(playbackConfig?.charResolution) || 8;
  const outputInstructions = safeOutputFormat === 'json-v2'
    ? [
      'Output valid JSON only. No markdown fences, no explanation.',
      'Use this schema: version, meta, transport, playback, source, tracks.',
      'Put notes in tracks[0].events[] with type, tick, duration, key, velocity.',
      'For chords, either emit multiple note events at the same tick, or use a chord event with keys[].',
      'Keep transport.resolution explicit. Recommended resolution: 96 or 480.',
      'If a pitch is outside the 21-key range C3-B5, transpose by octave into range and keep a note in meta.referenceNotes.',
      'If the original includes sharps/flats not playable on the natural 21-key layout, choose the closest musical substitute and mention the substitution in meta.referenceNotes.',
    ]
    : safeOutputFormat === 'numbered-grid'
      ? [
        'Output plain numbered-grid score only. No markdown fences, no explanation.',
        'The first line must be either `@grid 1/16` or `@grid 1/32`. Prefer 1/16; use 1/32 only when the rhythm needs finer subdivision.',
        'Use one independent line per hand or part, for example `Right:` and `Left:`.',
        'Separate measures with `|`. In 4/4, each 1/16 measure must contain exactly 16 cells; each 1/32 measure must contain exactly 32 cells.',
        'Each cell is one fixed rhythmic unit. Use `1-7` for scale degrees, `0` or `R` for rests, `-` to sustain the previous note/rest, and `[135]` for chords.',
        'Use # or b before a scale degree only when the source requires an accidental, for example `#4` or `b7`.',
      ]
      : safeOutputFormat === 'timed-token'
      ? [
        'Output plain timed-token score only. No markdown fences, no explanation.',
        'Use one independent line per hand or part, for example `Right:` and `Left:`.',
        'Use `(NoteName, beats)` for notes, for example `(C4, 1.0)` or `(G4, 0.25)`.',
        'Use `Rbeats` for rests outside parentheses, for example `R0.5`.',
        'Every 4/4 measure must sum to exactly 4.0 beats. Separate measures with `|`.',
        'Allowed durations are 4, 2, 1, 0.5, 0.25, and 0.125 beats unless the source clearly requires a dotted value.',
      ]
    : [
      'Output plain legacy text score only. No markdown fences, no explanation.',
      'Use "/" to separate beats or beat slots.',
      'Use "0" for rests.',
      'Use "(...)" for chords, for example (135) or (qwe).',
      'Use low octave as -1~-7, middle octave as 1~7, high octave as +1~+7.',
      'Keep lines readable and grouped by phrase.',
      'If a pitch is outside C3-B5, transpose by octave into range.',
      'If the original includes sharps/flats not playable on the natural 21-key layout, choose the closest musical substitute and add a short comment line at the top explaining the substitutions.',
    ];

  return [
    '你現在是 Project Hina / 原神風物之琴 的編曲助手。',
    `請把下面的 ${safeNotationType === 'staff' ? '五線譜文字描述' : safeNotationType === 'mixed' ? '混合記譜資料' : '簡譜'} 轉成我的專案可匯入格式。`,
    '',
    '樂器限制:',
    ...NOTE_LAYOUT_GUIDE,
    '',
    '專案設定:',
    `- title: ${safeTitle}`,
    `- bpm: ${safeBpm}`,
    `- time signature: ${safeTimeSigNum}/${safeTimeSigDen}`,
    `- charResolution: ${safeCharResolution}`,
    `- target format: ${safeOutputFormat}`,
    '',
    '轉換原則:',
    '- 優先保留主旋律、節奏骨架、和聲關係。',
    '- 不要輸出超出 21 鍵自然音範圍的結果。',
    '- 可以合理簡化裝飾音、琶音、過密和弦。',
    '- 如果來源資訊不足，請做最合理的音樂推定，但不要省略節奏。',
    ...outputInstructions.map((line) => `- ${line}`),
    '',
    '附帶來源參考:',
    formatReferences(references),
    '',
    '附帶備註:',
    safeReferenceNotes || 'None',
    '',
    '待轉換內容:',
    safeSourceText || '(empty)',
  ].join('\n');
}
