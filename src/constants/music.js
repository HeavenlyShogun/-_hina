export const NOTES_MAP = [
  {
    label: '高音區',
    sub: 'High',
    keys: [
      { n: 'C5', k: 'q', f: 523.25 },
      { n: 'D5', k: 'w', f: 587.33 },
      { n: 'E5', k: 'e', f: 659.25 },
      { n: 'F5', k: 'r', f: 698.46 },
      { n: 'G5', k: 't', f: 783.99 },
      { n: 'A5', k: 'y', f: 880.0 },
      { n: 'B5', k: 'u', f: 987.77 },
    ],
  },
  {
    label: '中音區',
    sub: 'Mid',
    keys: [
      { n: 'C4', k: 'a', f: 261.63 },
      { n: 'D4', k: 's', f: 293.66 },
      { n: 'E4', k: 'd', f: 329.63 },
      { n: 'F4', k: 'f', f: 349.23 },
      { n: 'G4', k: 'g', f: 392.0 },
      { n: 'A4', k: 'h', f: 440.0 },
      { n: 'B4', k: 'j', f: 493.88 },
    ],
  },
  {
    label: '低音區',
    sub: 'Low',
    keys: [
      { n: 'C3', k: 'z', f: 130.81 },
      { n: 'D3', k: 'x', f: 146.83 },
      { n: 'E3', k: 'c', f: 164.81 },
      { n: 'F3', k: 'v', f: 174.61 },
      { n: 'G3', k: 'b', f: 196.0 },
      { n: 'A3', k: 'n', f: 220.0 },
      { n: 'B3', k: 'm', f: 246.94 },
    ],
  },
];

const SOLFEGE_MAP = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

export const KEY_OPTIONS = [
  { name: 'C', offset: 0 },
  { name: 'C#', offset: 1 },
  { name: 'D', offset: 2 },
  { name: 'D#', offset: 3 },
  { name: 'E', offset: 4 },
  { name: 'F', offset: 5 },
  { name: 'F#', offset: 6 },
  { name: 'G', offset: 7 },
  { name: 'G#', offset: 8 },
  { name: 'A', offset: 9 },
  { name: 'A#', offset: 10 },
  { name: 'B', offset: 11 },
];

export const CHAR_TO_KEY_MAP = {
  q: 'q',
  w: 'w',
  e: 'e',
  r: 'r',
  t: 't',
  y: 'y',
  u: 'u',
  a: 'a',
  s: 's',
  d: 'd',
  f: 'f',
  g: 'g',
  h: 'h',
  j: 'j',
  z: 'z',
  x: 'x',
  c: 'c',
  v: 'v',
  b: 'b',
  n: 'n',
  m: 'm',
  1: 'a',
  2: 's',
  3: 'd',
  4: 'f',
  5: 'g',
  6: 'h',
  7: 'j',
  '+1': 'q',
  '+2': 'w',
  '+3': 'e',
  '+4': 'r',
  '+5': 't',
  '+6': 'y',
  '+7': 'u',
  '-1': 'z',
  '-2': 'x',
  '-3': 'c',
  '-4': 'v',
  '-5': 'b',
  '-6': 'n',
  '-7': 'm',
  '↑1': 'q',
  '↑2': 'w',
  '↑3': 'e',
  '↑4': 'r',
  '↑5': 't',
  '↑6': 'y',
  '↑7': 'u',
  '↓1': 'z',
  '↓2': 'x',
  '↓3': 'c',
  '↓4': 'v',
  '↓5': 'b',
  '↓6': 'n',
  '↓7': 'm',
};

export const DEFAULT_SCORE = `// 風物之詩琴示例譜
// 高音: QWERTYU
// 中音: ASDFGHJ 或 1234567
// 低音: ZXCVBNM 或 -1 ~ -7
// 和弦請用括號，例如 (QWE) 或 (135)
// 小節線可用 | 幫助對拍

(ZA) Q (CG) Q (AW) E (CG) E | (QY) E (CG) E (EW) W
(CJ) Q (MW) Q (NW) W (DJ) W | (BS) Q (ZA) Q (VF)

(-1-1) +1 (-3-5) +1 (1+2) +3 (-3-5) +3 | (+1+6) +3 (-3-5) +3 (+3+2) +2
(-3-7) +1 (-7+3) +1 (-6+2) +2 (-5+1) +2 | (-5+2) +1 (-1-1) +1 (-4-4)`;

export const DEFAULT_SCORE_PARAMS = {
  bpm: 90,
  timeSigNum: 4,
  timeSigDen: 4,
  charResolution: 8,
  globalKeyOffset: 0,
  accidentals: {},
  tone: 'piano',
  reverb: true,
};

export const ALL_KEYS_FLAT = NOTES_MAP.flatMap((row) => row.keys);
export const KEY_INFO_MAP = Object.fromEntries(ALL_KEYS_FLAT.map((key) => [key.k, key]));

export function getSolfege(noteName) {
  return SOLFEGE_MAP[noteName.charAt(0)] || noteName;
}

export function mapKey(char) {
  if (!char) return null;
  return CHAR_TO_KEY_MAP[char.toLowerCase()] || CHAR_TO_KEY_MAP[char] || null;
}
