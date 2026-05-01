const RECOMMENDED_SCORES = [
  {
    matchers: ['i really want to stay at your house', '我永遠想待在你的房子裡'],
    bpm: 128,
    globalKeyOffset: 6,
    scaleMode: 'major',
    timeSigNum: 4,
    timeSigDen: 4,
    charResolution: 16,
    reverb: true,
  },
  {
    matchers: ['打上花火'],
    bpm: 96,
    globalKeyOffset: 5,
    scaleMode: 'major',
    timeSigNum: 4,
    timeSigDen: 4,
    charResolution: 16,
    reverb: true,
  },
  {
    matchers: ['春日影', 'mygo'],
    bpm: 96,
    globalKeyOffset: 7,
    scaleMode: 'major',
    timeSigNum: 4,
    timeSigDen: 4,
    reverb: true,
  },
  {
    matchers: ['未聞花名', 'secret base', '君がくれたもの'],
    bpm: 70,
    globalKeyOffset: 6,
    scaleMode: 'major',
    timeSigNum: 4,
    timeSigDen: 4,
    reverb: true,
  },
  {
    matchers: ['溯 reverse', '溯', 'reverse', 'corsak'],
    bpm: 140,
    globalKeyOffset: 7,
    scaleMode: 'major',
    timeSigNum: 4,
    timeSigDen: 4,
    reverb: true,
  },
  {
    matchers: ['起風了'],
    bpm: 78,
    globalKeyOffset: 6,
    scaleMode: 'major',
    timeSigNum: 4,
    timeSigDen: 4,
    reverb: true,
  },
  {
    matchers: ['call of silence'],
    bpm: 110,
    globalKeyOffset: 9,
    scaleMode: 'minor',
    timeSigNum: 4,
    timeSigDen: 4,
    reverb: true,
  },
  {
    matchers: ['cry for me'],
    bpm: 145,
    globalKeyOffset: 10,
    scaleMode: 'major',
    timeSigNum: 4,
    timeSigDen: 4,
    reverb: true,
  },
  {
    matchers: ['千本櫻'],
    bpm: 154,
    globalKeyOffset: 2,
    scaleMode: 'minor',
    timeSigNum: 4,
    timeSigDen: 4,
    reverb: true,
  },
];

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[~〜～]/g, ' ')
    .replace(/\s+/g, ' ');
}

function hasExplicitValue(value) {
  return value !== undefined && value !== null && value !== '';
}

export function findScoreRecommendation(title) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return null;
  }

  return RECOMMENDED_SCORES.find((entry) => (
    entry.matchers.some((matcher) => normalizedTitle.includes(normalizeText(matcher)))
  )) ?? null;
}

export function applyScoreRecommendation(source = {}, options = {}) {
  const recommendation = findScoreRecommendation(source?.title);
  const { force = false } = options;

  if (!recommendation) {
    return source;
  }

  const next = { ...source };
  ['bpm', 'globalKeyOffset', 'scaleMode', 'timeSigNum', 'timeSigDen', 'charResolution', 'reverb'].forEach((key) => {
    if (recommendation[key] !== undefined && (force || !hasExplicitValue(next[key]))) {
      next[key] = recommendation[key];
    }
  });

  return next;
}

export default RECOMMENDED_SCORES;
