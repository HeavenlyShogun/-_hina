export const NOTES_MAP = [
  {
    label: '高音區',
    sub: '高音',
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
    sub: '中音',
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
    sub: '低音',
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

export const SCALE_MODE_OPTIONS = [
  { value: 'major', label: '大調' },
  { value: 'minor', label: '小調' },
  { value: 'custom', label: '自訂' },
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

export const DEFAULT_SCORE = `(VA) / M / (MG) /(AG) Q /
(BAQ) G /G (MD) /D (MS) /(AD) S /
(NAD) S / M / M /A /
(ZA) /A B / B /A /

(VA) / M / (MG) /(AG) Q /
(BAQ) Q /Q (MQ) /Q (MQ) /(AQ) Q /
(NAW) / M / M /A /
(ZBA) /D / / /

(VA) / M / (MG) /(AG) Q /
(BAQ) G /G (MD) /D (MS) /(AD) S /
(NAD) / (MG) /D M /A S /
(ZAS) / (BD) /A B /Z /

(VA) / M / (MJ) /(AJ) Q /
(BAQ) Q /Q (MW) /W M /A /
(NA) / M / M /A /
(ZBA) /D / /Q /
(VA) /(VAQ) W /(VAW) /(VA) Q /
(BSQ) W /(BSW) /(BSW) /(BSQ) Q /
(NDT) T /(NDT) T /(NDT) /(NDQ) Q /
(ND) Q /(NDQ) W /(NDW) /(BSQ) /

(VA) /(VA) /(VA) Q /(VAQ) Q /
(BST) T /(BST) T /(BST) /(BSQ) Q /
(NDH) /(ND) /(ND) /(NDG) /
(NDT) T /(NDT) T /(NDT) /(BSQ) /

(VA) /(VAQ) W /(VAW) /(VA) Q /
(BSQ) W /(BSW) /(BSW) /(BSQ) Q /
(NDT) T /(NDT) T /(NDT) /(ND) Y /
(ND) T /(NDT) T /(NDW) /(BSQ) W /

(XN) /(XN) /(XN) Q /(XNQ) /
(CBS) D /(CB) S /(CBA) /(CB) /
(ZV) /(ZV) /(ZV) /(ZV) /
(ZVN) (ZVN) /(ZVN) G /Q Q / Q /
(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/J (ZQ) /(AG) Q /
(CN) G /(ADQ) QN/Q (NQ) /(ADQ) W /
(XBW) E /(SGQ) GB/Q (BQ) /(SG) Q /

(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/Q (ZQ) /(AGQ) Q /
(CN) G /(ADQ) N/Q (NQ) /(ADQ) W /
(XBW) /(SGQ) QB/E (BT) /(SGE) W /

(VAW) Q /Q (VAW) /Q /(VA) /
(ZB) / (ZBW) /E /(ZBW) /
(CNW) / (CNE) /W /(CN) /
(XB) /Q (XBQ) /E T /(XBE) W /

(VAW) Q /Q (VAW) /Q /(VAG) Q /
(ZB) G /Q (ZBG) /Q Q /(ZBG) Q /
(CN) G /Q (CN) /Q Q /(CNQ) W /
(XBW) E /Q (XB) / /(XB) /

(BSQ) T / E/W / /
(CND) / / / /
(VA) /(VA) M /(VA) (MG) /(VAG) Q /
(BAQ) G /(BAG) D /(BAD) S /(BAD) S /
(NAD) S /(NA) M /(NA) M /(NA) /
(NA) /(NA) B /(NA) B /(NA) /

(VA) /(VA) M /(VA) (MG) /(VAG) Q /
(BSQ) Q /(BSQ) Q /(BSQ) Q /(BSQ) W /
(NDW) /(ND) M /(ND) (MQ) /(NADH) /
(ND) /(ND) B /(ND) (BG) /(NADQ) /

(ZVH) /(ZV) G /(ZV) G /(ZVG) Q /
(XBQ) G /(XBG) D /(XBD) S /(XBD) S /
(CND) /(CN) G /(CND) /(CN) S /
(CNS) /(CN) D /(CNA) /B /

(XN) /(XN) /(XN) G /(XNG) G /
(CBG) G /(CBG) G /(CBQ) W /(CBQ) /
(ZVA) S /(ZVA) /(ZVQ) W /(ZVQ) /
(ZVN) (ZVN) /(ZVN) G /Q Q / Q /
(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/J (ZQ) /(AG) Q /
(CN) G /(ADQ) QN/Q (NQ) /(ADQ) W /
(XBW) E /(SGQ) GB/Q (BQ) /(SG) Q /

(ZV) G /(AFQ) V/Q (VQ) /(AF) Q /
(ZB) G /(AGQ) Z/Q (ZQ) /(AGQ) Q /
(CN) G /(ADQ) N/Q (NQ) /(ADQ) W /
(XBW) /(SGQ) QB/E (BT) /(SGE) W /

(VAW) Q /Q (VAW) /Q /(VA) /
(ZB) / (ZBW) /E /(ZBW) /
(CNW) / (CNE) /W /(CN) /
(XB) /Q (XBQ) /E T /(XBE) W /

(VAW) Q /Q (VAW) /Q /(VAG) Q /
(ZB) G /Q (ZBG) /Q Q /(ZBG) Q /
(CN) G /Q (CN) /Q Q /(CNQ) W /
(XBW) E /Q (XB) / /(XBQ) /`;

export const DEFAULT_SCORE_PARAMS = {
  bpm: 90,
  timeSigNum: 4,
  timeSigDen: 4,
  charResolution: 8,
  globalKeyOffset: 0,
  accidentals: {},
  scaleMode: 'major',
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
