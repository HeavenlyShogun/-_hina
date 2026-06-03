import { getInstrumentDefinition } from '../constants/instruments.js';
import * as Tone from 'tone';

const DEFAULT_RENDER_CONFIG = {
  tone: 'piano',
  velocity: 0.85,
  outputGain: 0.58,
  reverbAmount: 0.34,
};
const LIVE_NOTE_RELEASE_SEC = 0.16;
const SAMPLE_LOAD_TIMEOUT_MS = 8000;
const SOUNDFONT_LOAD_TIMEOUT_MS = 6000;
const MIDI_JS_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const TONEJS_INSTRUMENTS_BASE_URL = 'https://nbrosowsky.github.io/tonejs-instruments/samples';
const MIDI_JS_SAMPLE_NOTES = ['C2', 'E2', 'G2', 'B2', 'D3', 'F3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5', 'F5', 'A5', 'C6', 'E6', 'G6'];
const DENSE_NOTE_GAIN_FLOOR = 0.16;
const TONE_SAMPLER_SOURCE = 'tone-sampler';
const TONE_POLYSYNTH_SOURCE = 'tone-polysynth';
const PIANO_TONE_SHAPING = {
  highShelfFrequency: 3000,
  highShelfMinGain: -6,
  highShelfMaxGain: -12,
  lowpassMinFrequency: 3000,
  lowpassMaxFrequency: 13200,
};

const TONE_PRESETS = {
  'midi-original': {
    tone: 'midi-original',
    engine: 'sampler',
    sampleSet: 'gm:acoustic_grand_piano',
    layerGain: 0.95,
    type: 'triangle',
    dur: 4.2,
    atk: 0.003,
    dec: 0.24,
    sus: 0.74,
    pk: 0.9,
    release: 0.42,
    velocity: 0.86,
  },
  piano: {
    tone: 'piano',
    engine: 'sampler',
    sampleSet: 'piano',
    pianoTimbre: true,
    layerGain: 0.92,
    type: 'triangle',
    dur: 5.8,
    atk: 0.002,
    dec: 0.34,
    sus: 0.7,
    pk: 0.86,
    flt: true,
    fltStartMult: 10,
    fltEndMult: 2.8,
    fltDec: 0.48,
    harmonics: [
      { ratio: 2, gain: 0.26, type: 'triangle', detune: -2 },
      { ratio: 3, gain: 0.12, type: 'sine', detune: 3 },
      { ratio: 4, gain: 0.055, type: 'sine', detune: -4 },
      { ratio: 5, gain: 0.024, type: 'sine', detune: 2 },
    ],
    nBufKey: 'shortNoise',
    nDur: 0.026,
    nVol: 0.028,
    hammerNoise: true,
    hammerDur: 0.018,
    hammerVol: 0.06,
    release: 0.64,
    velocity: 0.82,
  },
  'bright-acoustic-piano': {
    tone: 'bright-acoustic-piano',
    engine: 'sampler',
    sampleSet: 'gm:bright_acoustic_piano',
    layerGain: 0.66,
    type: 'triangle',
    dur: 4.4,
    atk: 0.003,
    dec: 0.28,
    sus: 0.58,
    pk: 0.54,
    flt: true,
    fltEndMult: 3.2,
    samplerFilterFrequency: 4200,
    samplerFilterQ: 0.18,
    release: 0.5,
    velocity: 0.72,
  },
  'electric-guitar-clean': {
    tone: 'electric-guitar-clean',
    engine: 'sampler',
    sampleSet: 'acoustic-guitar',
    layerGain: 0.82,
    type: 'sawtooth',
    dur: 2.8,
    atk: 0.002,
    dec: 0.16,
    sus: 0.34,
    pk: 0.72,
    flt: true,
    fltStartMult: 9,
    fltEndMult: 2.8,
    fltDec: 0.22,
    samplerFilterFrequency: 5200,
    samplerFilterQ: 0.22,
    harmonics: [
      { ratio: 2, gain: 0.18, type: 'triangle', detune: -7 },
      { ratio: 3, gain: 0.075, type: 'square', detune: 5 },
      { ratio: 4, gain: 0.035, type: 'sawtooth', detune: -3 },
    ],
    nBufKey: 'shortNoise',
    nDur: 0.018,
    nVol: 0.045,
    vibratoDepth: 2.2,
    vibratoRate: 5.8,
    vibratoDelay: 0.22,
    release: 0.22,
    velocity: 0.82,
  },
  'orchestral-harp': {
    tone: 'orchestral-harp',
    engine: 'sampler',
    sampleSet: 'harp',
    layerGain: 0.76,
    type: 'triangle',
    dur: 3.4,
    atk: 0.004,
    dec: 0.2,
    sus: 0.48,
    pk: 0.72,
    flt: true,
    fltEndMult: 3.5,
    samplerFilterFrequency: 6200,
    samplerFilterQ: 0.22,
    release: 0.36,
    velocity: 0.82,
  },
  'concert-flute': {
    tone: 'concert-flute',
    engine: 'sampler',
    sampleSet: 'flute',
    layerGain: 0.7,
    type: 'sine',
    dur: 2.8,
    atk: 0.025,
    dec: 0.2,
    sus: 0.78,
    pk: 0.52,
    samplerFilterFrequency: 7600,
    samplerFilterQ: 0.18,
    vibratoDepth: 2.2,
    vibratoRate: 5.2,
    vibratoDelay: 0.12,
    release: 0.42,
    velocity: 0.78,
  },
  'acoustic-drums': {
    tone: 'acoustic-drums',
    engine: 'sampler',
    sampleSet: 'pearl-acoustic-drums',
    layerGain: 0.58,
    type: 'triangle',
    dur: 0.9,
    atk: 0.001,
    dec: 0.12,
    sus: 0.2,
    pk: 0.54,
    samplerFilterFrequency: 7800,
    samplerFilterQ: 0.2,
    release: 0.16,
    velocity: 0.72,
  },
  'tongue-drum': {
    tone: 'tongue-drum',
    engine: 'sampler',
    sampleSet: 'steel-drums',
    layerGain: 0.78,
    type: 'triangle',
    dur: 3,
    atk: 0.02,
    dec: 0.5,
    sus: 0.2,
    pk: 0.6,
    flt: true,
    fltStartMult: 3,
    fltEndMult: 1,
    fltDec: 0.6,
    nBufKey: 'noise',
    nDur: 0.03,
    nVol: 0.05,
    release: 0.14,
    velocity: 0.85,
  },
  'tongue-drum-electronic': {
    tone: 'tongue-drum-electronic',
    engine: 'polysynth',
    layerGain: 0.78,
    type: 'sine',
    dur: 4.2,
    atk: 0.008,
    dec: 0.72,
    sus: 0.08,
    pk: 0.62,
    flt: true,
    fltStartMult: 5.8,
    fltEndMult: 1.1,
    fltDec: 0.72,
    harmonics: [
      { ratio: 2, gain: 0.16, type: 'sine', detune: 6 },
      { ratio: 3, gain: 0.07, type: 'triangle', detune: -4 },
      { ratio: 4.2, gain: 0.035, type: 'sine', detune: 2 },
    ],
    release: 0.42,
    velocity: 0.82,
  },
  'retro-saw-synth': {
    tone: 'retro-saw-synth',
    engine: 'polysynth',
    instrumentType: 'synthesized',
    layerGain: 0.72,
    type: 'sawtooth',
    dur: 2.4,
    atk: 0.045,
    dec: 0.22,
    sus: 0.54,
    pk: 0.42,
    flt: true,
    fltStartMult: 7.6,
    fltEndMult: 2.2,
    fltDec: 0.28,
    harmonics: [
      { ratio: 2, gain: 0.07, type: 'square', detune: -5 },
      { ratio: 3, gain: 0.035, type: 'sawtooth', detune: 4 },
    ],
    vibratoDepth: 5,
    vibratoRate: 5.2,
    vibratoDelay: 0.18,
    release: 0.32,
    velocity: 0.76,
  },
  'cozy-triangle-lead': {
    tone: 'cozy-triangle-lead',
    engine: 'polysynth',
    instrumentType: 'synthesized',
    layerGain: 0.82,
    type: 'triangle',
    dur: 3.2,
    atk: 0.09,
    dec: 0.36,
    sus: 0.62,
    pk: 0.46,
    flt: true,
    fltStartMult: 4.2,
    fltEndMult: 1.7,
    fltDec: 0.5,
    harmonics: [
      { ratio: 2, gain: 0.09, type: 'sine', detune: 2 },
      { ratio: 3, gain: 0.035, type: 'triangle', detune: -3 },
    ],
    release: 0.52,
    velocity: 0.8,
  },
  'breath-flute': {
    tone: 'breath-flute',
    instrumentType: 'synthesized',
    layerGain: 0.78,
    type: 'sine',
    dur: 2.6,
    atk: 0.08,
    dec: 0.28,
    sus: 0.8,
    pk: 0.36,
    flt: false,
    nBufKey: 'breathNoise',
    nDur: 0.8,
    nVol: 0.034,
    vibratoDepth: 3.2,
    vibratoRate: 5.4,
    vibratoDelay: 0.18,
    release: 0.34,
    velocity: 0.78,
  },
  'wind-lyre-long': {
    tone: 'wind-lyre-long',
    instrumentType: 'synthesized',
    layerGain: 0.72,
    type: 'sawtooth',
    dur: 4,
    atk: 0.015,
    dec: 0.6,
    sus: 0.12,
    pk: 0.44,
    flt: true,
    fltStartMult: 6,
    fltEndMult: 1.2,
    fltDec: 0.6,
    nBufKey: 'shortNoise',
    nDur: 0.05,
    nVol: 0.095,
    release: 0.9,
    velocity: 0.84,
  },
  'wind-lyre-short': {
    tone: 'wind-lyre-short',
    instrumentType: 'synthesized',
    layerGain: 0.72,
    type: 'sawtooth',
    dur: 0.7,
    atk: 0.015,
    dec: 0.1,
    sus: 0.001,
    pk: 0.42,
    flt: true,
    fltStartMult: 6,
    fltEndMult: 1.2,
    fltDec: 0.6,
    nBufKey: 'shortNoise',
    nDur: 0.05,
    nVol: 0.095,
    release: 0.07,
    velocity: 0.86,
  },
  classic: {
    tone: 'classic',
    layerGain: 0.85,
    type: 'triangle',
    atk: 0.015,
    dec: 0.1,
    sus: 0.001,
    pk: 0.4,
    flt: false,
    nBufKey: 'shortNoise',
    nDur: 0.015,
    nVol: 0.15,
    release: 0.08,
    velocity: 0.85,
  },
};

const DYNAMIC_TONE_OVERRIDES = {
  classic: (baseDuration) => ({
    dur: Math.max(baseDuration * 1.5, 0.6),
  }),
};

const VALID_OSCILLATOR_TYPES = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const SAMPLE_LIBRARY_CONFIG = {
  piano: {
    source: 'direct',
    baseUrl: `${TONEJS_INSTRUMENTS_BASE_URL}/piano/`,
    samples: [
      { noteName: 'C2', url: 'C2.wav' },
      { noteName: 'F2', url: 'F2.wav' },
      { noteName: 'A2', url: 'A2.wav' },
      { noteName: 'C3', url: 'C3.wav' },
      { noteName: 'F3', url: 'F3.wav' },
      { noteName: 'A3', url: 'A3.wav' },
      { noteName: 'C4', url: 'C4.wav' },
      { noteName: 'F4', url: 'F4.wav' },
      { noteName: 'A4', url: 'A4.wav' },
      { noteName: 'C5', url: 'C5.wav' },
      { noteName: 'F5', url: 'F5.wav' },
      { noteName: 'A5', url: 'A5.wav' },
      { noteName: 'C6', url: 'C6.wav' },
    ],
  },
  'acoustic-guitar': {
    source: 'direct',
    baseUrl: `${TONEJS_INSTRUMENTS_BASE_URL}/guitar-acoustic/`,
    samples: [
      { noteName: 'E2', url: 'E2.wav' },
      { noteName: 'A2', url: 'A2.wav' },
      { noteName: 'D3', url: 'D3.wav' },
      { noteName: 'G3', url: 'G3.wav' },
      { noteName: 'B3', url: 'B3.wav' },
      { noteName: 'E4', url: 'E4.wav' },
      { noteName: 'A4', url: 'A4.wav' },
      { noteName: 'C5', url: 'C5.wav' },
    ],
  },
  harp: {
    source: 'direct',
    baseUrl: `${TONEJS_INSTRUMENTS_BASE_URL}/harp/`,
    samples: [
      { noteName: 'E3', url: 'E3.wav' },
      { noteName: 'G3', url: 'G3.wav' },
      { noteName: 'B3', url: 'B3.wav' },
      { noteName: 'D4', url: 'D4.wav' },
      { noteName: 'F4', url: 'F4.wav' },
      { noteName: 'A4', url: 'A4.wav' },
      { noteName: 'C5', url: 'C5.wav' },
      { noteName: 'E5', url: 'E5.wav' },
      { noteName: 'G5', url: 'G5.wav' },
      { noteName: 'B5', url: 'B5.wav' },
    ],
  },
  flute: {
    source: 'direct',
    baseUrl: `${TONEJS_INSTRUMENTS_BASE_URL}/flute/`,
    samples: [
      { noteName: 'C4', url: 'C4.wav' },
      { noteName: 'E4', url: 'E4.wav' },
      { noteName: 'A4', url: 'A4.wav' },
      { noteName: 'C5', url: 'C5.wav' },
      { noteName: 'E5', url: 'E5.wav' },
      { noteName: 'A5', url: 'A5.wav' },
      { noteName: 'C6', url: 'C6.wav' },
      { noteName: 'E6', url: 'E6.wav' },
      { noteName: 'A6', url: 'A6.wav' },
    ],
  },
  'steel-drums': {
    source: 'midi-js',
    instrument: 'steel_drums',
    samples: ['C4', 'E4', 'G4', 'B4', 'D5', 'F5', 'A5', 'C6'],
  },
  'electric-guitar-clean': {
    source: 'midi-js',
    instrument: 'electric_guitar_clean',
    samples: ['C2', 'E2', 'G2', 'B2', 'D3', 'F3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5', 'F5', 'A5'],
  },
  'pearl-acoustic-drums': {
    source: 'direct',
    baseUrl: 'https://oramics.github.io/sampled/DRUMS/pearl-master-studio/samples/',
    samples: [
      { noteName: 'C2', url: 'kick-01.wav' },
      { noteName: 'D2', url: 'snare-01.wav' },
      { noteName: 'E2', url: 'hihat-closed.wav' },
      { noteName: 'F2', url: 'hihat-open.wav' },
      { noteName: 'G2', url: 'tom-01.wav' },
      { noteName: 'A2', url: 'tom-02.wav' },
      { noteName: 'B2', url: 'tom-03.wav' },
      { noteName: 'C3', url: 'ride-01.wav' },
      { noteName: 'D3', url: 'crash-01.wav' },
    ],
  },
};

const GM_PROGRAM_SOUNDFONTS = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
  'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ', 'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean', 'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass', 'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2', 'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
  'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet',
  'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff', 'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead',
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere', 'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
  'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bagpipe', 'fiddle', 'shanai',
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot',
];

function soundfontNameFromMidiInstrument(instrumentName, programNumber) {
  const programIndex = Number(programNumber);
  if (Number.isInteger(programIndex) && programIndex >= 0 && programIndex < GM_PROGRAM_SOUNDFONTS.length) {
    return GM_PROGRAM_SOUNDFONTS[programIndex];
  }

  const normalized = String(instrumentName || '')
    .trim()
    .toLowerCase()
    .replace(/\(([^)]+)\)/gu, '$1')
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');

  return normalized || 'acoustic_grand_piano';
}

class BaseInstrumentAdapter {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.definition = getInstrumentDefinition(id);
  }

  getRenderPreset(presets = TONE_PRESETS) {
    return presets[this.id] ?? null;
  }

  async prepare() {
    return null;
  }
}

class SampledInstrumentAdapter extends BaseInstrumentAdapter {
  async prepare(presets = TONE_PRESETS) {
    const preset = this.getRenderPreset(presets);
    if (!preset?.sampleSet) {
      return null;
    }

    if (preset.nonBlockingSampleLoad) {
      this.engine.loadSampleSet(preset.sampleSet).catch((error) => {
        console.warn(`Sampler "${preset.sampleSet}" is unavailable. Using synth fallback.`, error);
        return null;
      });
      return null;
    }

    return this.engine.loadSampleSet(preset.sampleSet);
  }
}

class SynthesizedInstrumentAdapter extends BaseInstrumentAdapter {
  async prepare() {
    return null;
  }
}

function createImpulseResponse(context, duration = 2.6, decay = 2.4) {
  const safeDuration = Math.max(Number(duration) || 0, 0.2);
  const safeDecay = Math.max(Number(decay) || 0, 0.1);
  const frameCount = Math.floor(context.sampleRate * safeDuration);
  const impulse = context.createBuffer(2, frameCount, context.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < frameCount; index += 1) {
      const decayPosition = 1 - index / frameCount;
      const stereoSkew = channel === 0 ? 0.92 : 1;
      data[index] = (Math.random() * 2 - 1) * (decayPosition ** safeDecay) * stereoSkew;
    }
  }

  return impulse;
}

function compareVoicePriority(a, b, now) {
  if (a.isReleased !== b.isReleased) {
    return a.isReleased ? -1 : 1;
  }

  const aImp = Number(a.importance ?? 0);
  const bImp = Number(b.importance ?? 0);
  if (aImp !== bImp) {
    return aImp - bImp;
  }

  const aRemaining = Math.max(0, (a.endTime ?? Infinity) - now);
  const bRemaining = Math.max(0, (b.endTime ?? Infinity) - now);
  if (aRemaining !== bRemaining) {
    return aRemaining - bRemaining;
  }

  return (a.startTime ?? 0) - (b.startTime ?? 0);
}

function normalizeOscillatorType(type, fallback = 'triangle') {
  return VALID_OSCILLATOR_TYPES.has(type) ? type : fallback;
}

function noteNameToMidi(noteName) {
  const match = /^([A-G])([sb#]?)(-?\d+)$/u.exec(String(noteName || ''));
  if (!match) return null;

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
  if (accidental === '#' || accidental === 's') midi += 1;
  if (accidental === 'b') midi -= 1;
  return midi;
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function frequencyToMidi(frequency) {
  return 69 + (12 * Math.log2(frequency / 440));
}

function midiToNoteName(midi) {
  const safeMidi = Math.max(0, Math.min(127, Math.round(Number(midi) || 0)));
  const octave = Math.floor(safeMidi / 12) - 1;
  const pitchClass = ((safeMidi % 12) + 12) % 12;
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[pitchClass] ?? 'C'}${octave}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPianoTimbreCurve(frequency, velocity = DEFAULT_RENDER_CONFIG.velocity) {
  const midi = frequencyToMidi(frequency);
  const normalizedVelocity = clamp(Number(velocity) || DEFAULT_RENDER_CONFIG.velocity, 0.05, 1);
  const lowWeight = clamp((60 - midi) / 24, 0, 1);
  const highWeight = clamp((midi - 68) / 24, 0, 1);
  const bodyWeight = 1 - clamp(Math.abs(midi - 52) / 30, 0, 1);
  const upperRegisterWeight = clamp((midi - 72) / 24, 0, 1);
  const softTouchWeight = 1 - normalizedVelocity;
  const velocityBrightness = 0.58 + normalizedVelocity * 0.62;
  const lowpassFrequency = clamp(
    frequency * (9.2 - upperRegisterWeight * 4.6) * velocityBrightness,
    PIANO_TONE_SHAPING.lowpassMinFrequency,
    PIANO_TONE_SHAPING.lowpassMaxFrequency,
  );

  return {
    midi,
    velocity: normalizedVelocity,
    gain: 0.96 + lowWeight * 0.13 - upperRegisterWeight * 0.24 - softTouchWeight * 0.05,
    lowShelfGain: 1.5 + lowWeight * 3.2,
    bodyGain: 1.2 + bodyWeight * 2.1,
    presenceGain: 0.7 + highWeight * 0.9 - upperRegisterWeight * 1.35 - softTouchWeight * 0.55,
    highShelfFrequency: PIANO_TONE_SHAPING.highShelfFrequency,
    highShelfGain: PIANO_TONE_SHAPING.highShelfMinGain
      + (PIANO_TONE_SHAPING.highShelfMaxGain - PIANO_TONE_SHAPING.highShelfMinGain)
        * clamp(upperRegisterWeight + softTouchWeight * 0.35, 0, 1),
    lowpassFrequency,
    lowpassQ: 0.38 - upperRegisterWeight * 0.12,
    hammerBandFrequency: clamp(1450 + highWeight * 2100 - lowWeight * 420, 900, 3900),
    hammerHighpassFrequency: clamp(380 + highWeight * 420, 320, 900),
    hammerGain: 1.08 - lowWeight * 0.16 - upperRegisterWeight * 0.38 + normalizedVelocity * 0.18,
    releaseScale: 1 - upperRegisterWeight * 0.62 - softTouchWeight * 0.08,
  };
}

function createPianoToneNodes(context, timbreCurve) {
  if (!timbreCurve) {
    return [];
  }

  const lowShelf = context.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 180;
  lowShelf.gain.value = timbreCurve.lowShelfGain;

  const bodyPeak = context.createBiquadFilter();
  bodyPeak.type = 'peaking';
  bodyPeak.frequency.value = 360;
  bodyPeak.Q.value = 0.85;
  bodyPeak.gain.value = timbreCurve.bodyGain;

  const presencePeak = context.createBiquadFilter();
  presencePeak.type = 'peaking';
  presencePeak.frequency.value = 2600;
  presencePeak.Q.value = 0.75;
  presencePeak.gain.value = timbreCurve.presenceGain;

  const highShelf = context.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = timbreCurve.highShelfFrequency;
  highShelf.gain.value = timbreCurve.highShelfGain;

  const toneLimit = context.createBiquadFilter();
  toneLimit.type = 'lowpass';
  toneLimit.frequency.value = timbreCurve.lowpassFrequency;
  toneLimit.Q.value = timbreCurve.lowpassQ;

  // Piano tuning guide:
  // - highShelfGain spans about -6 to -12 dB above 3 kHz; lower it for darker treble.
  // - Lower lowpassFrequency if high notes still feel digital or piercing.
  // - Velocity feeds lowpassFrequency, so soft notes stay warmer and hard notes open up.
  // - Raise presenceGain only if notes lose definition around the melody range.
  return [lowShelf, bodyPeak, presencePeak, highShelf, toneLimit];
}

function connectNodeChain(sourceNode, nodes, destinationNode) {
  if (!nodes.length) {
    sourceNode.connect(destinationNode);
    return;
  }

  sourceNode.connect(nodes[0]);
  nodes.forEach((node, index) => {
    node.connect(nodes[index + 1] ?? destinationNode);
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SAMPLE_LOAD_TIMEOUT_MS) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    return await fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function rampAudioParamToSilence(param, releaseStartTime, stopAtTime, fallbackValue = 0.0001) {
  if (!param) return;

  const safeStart = Math.max(Number(releaseStartTime) || 0, 0);
  const safeEnd = Math.max(Number(stopAtTime) || 0, safeStart + 0.005);
  const floor = 0.0001;

  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(safeStart);
  } else {
    param.cancelScheduledValues(safeStart);
    param.setValueAtTime(Math.max(Number(param.value) || fallbackValue, floor), safeStart);
  }

  param.setTargetAtTime(floor, safeStart, Math.max((safeEnd - safeStart) / 4, 0.004));
  param.exponentialRampToValueAtTime(floor, safeEnd);
}

function normalizeMidiJsNoteName(noteName) {
  return String(noteName || '').replace('s', '#');
}

function resolveSampleUrl(baseUrl, url) {
  if (!url) {
    return null;
  }

  if (/^(?:https?:)?\/\//iu.test(url) || String(url).startsWith('data:')) {
    return url;
  }

  if (!baseUrl) {
    return url;
  }

  return `${String(baseUrl).replace(/\/?$/u, '/')}${String(url).replace(/^\/+/u, '')}`;
}

function parseMidiJsSoundfont(text) {
  const match = /=\s*(\{[\s\S]*\})\s*;?\s*$/u.exec(String(text || '').trim());
  if (!match) {
    return {};
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    console.warn('Failed to parse MIDI.js soundfont.', error);
    return {};
  }
}

class AudioEngine {
  static MAX_VOICES = 72;

  constructor() {
    this.audioContext = null;
    this.compressor = null;
    this.masterOutput = null;
    this.reverbConvolver = null;
    this.reverbBus = null;
    this.reverbWetGain = null;
    this.noiseBuffer = null;
    this.shortNoiseBuffer = null;
    this.breathNoiseBuffer = null;
    this.activeVoices = new Set();
    this.activeLiveVoices = new Map();
    this.sampleSets = new Map();
    this.sampleSetLoads = new Map();
    this.toneSamplers = new Map();
    this.toneSamplerLoads = new Map();
    this.tonePolySynths = new Map();
    this.toneContext = null;
    this.instrumentAdapters = new Map();
  }

  init() {
    if (this.audioContext) return this.audioContext;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    const context = new AudioContextClass();

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 8;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;

    const reverbBus = context.createGain();
    reverbBus.gain.value = 1;

    const convolver = context.createConvolver();
    convolver.buffer = createImpulseResponse(context, 2.8, 2.6);

    const reverbTone = context.createBiquadFilter();
    reverbTone.type = 'lowpass';
    reverbTone.frequency.value = 4600;
    reverbTone.Q.value = 0.4;

    const reverbWetGain = context.createGain();
    reverbWetGain.gain.value = 1;

    reverbBus.connect(convolver);
    convolver.connect(reverbTone);
    reverbTone.connect(reverbWetGain);
    const masterOutput = context.createGain();
    masterOutput.gain.value = 0.86;

    reverbWetGain.connect(compressor);
    compressor.connect(masterOutput);
    masterOutput.connect(context.destination);

    this.audioContext = context;
    this.bindToneContext(context);
    this.compressor = compressor;
    this.masterOutput = masterOutput;
    this.reverbConvolver = convolver;
    this.reverbBus = reverbBus;
    this.reverbWetGain = reverbWetGain;
    this.noiseBuffer = this.createNoiseBuffer(context, 0.06, true);
    this.shortNoiseBuffer = this.createNoiseBuffer(context, 0.015, false);
    this.breathNoiseBuffer = this.createNoiseBuffer(context, 0.8, false);

    return this.audioContext;
  }

  bindToneContext(context) {
    if (!context || this.toneContext === context) {
      return;
    }

    Tone.setContext(context);
    this.toneContext = context;
  }

  async resume() {
    const context = this.init();
    if (context.state === 'suspended') await context.resume();
    return context;
  }

  async prepareTone(tone, playback = {}) {
    const context = this.init();
    const toneNames = this.normalizeToneList(tone);
    const midiOriginalSampleSets = toneNames.includes('midi-original')
      ? [...new Set((playback?.midiOriginalSampleSets ?? []).filter(Boolean))]
      : [];

    await Promise.all([
      ...toneNames.map((toneName) => {
        const adapter = this.getInstrumentAdapter(toneName);
        if (adapter) {
          return adapter.prepare(TONE_PRESETS).catch((error) => {
            console.warn(`Instrument "${toneName}" is unavailable. Falling back to synth playback.`, error);
            return null;
          });
        }

        const config = this.resolveRenderConfig({ tone: toneName }, 1);
        if (config.engine !== 'sampler' || !config.sampleSet) {
          return null;
        }

        return this.loadSampleSet(config.sampleSet).catch((error) => {
          console.warn(`Sampler "${config.sampleSet}" is unavailable. Falling back to synth playback.`, error);
          return null;
        });
      }),
      ...toneNames.map((toneName) => {
        const config = this.resolveRenderConfig({ tone: toneName }, 1);
        if (config.engine === 'sampler' && config.sampleSet) {
          return this.loadToneSampler(config.sampleSet, config).catch((error) => {
            console.warn(`Tone.Sampler "${config.sampleSet}" is unavailable.`, error);
            return null;
          });
        }
        if (config.engine === 'polysynth') {
          return this.getTonePolySynth(toneName, config);
        }
        return null;
      }),
      ...midiOriginalSampleSets.map((sampleSet) => this.loadSampleSet(sampleSet).catch((error) => {
        console.warn(`MIDI original sampler "${sampleSet}" is unavailable.`, error);
        return null;
      })),
      ...midiOriginalSampleSets.map((sampleSet) => this.loadToneSampler(sampleSet, { sampleSet }).catch((error) => {
        console.warn(`MIDI original Tone.Sampler "${sampleSet}" is unavailable.`, error);
        return null;
      })),
    ]);
    return context;
  }

  getCurrentTime() {
    return this.audioContext ? this.audioContext.currentTime : 0;
  }

  setReverbEnabled(enabled, wetLevel = 1) {
    if (!this.audioContext || !this.reverbWetGain) return;

    const now = this.audioContext.currentTime;
    const nextValue = enabled ? Math.max(Number(wetLevel) || 0, 0) : 0;

    try {
      this.reverbWetGain.gain.cancelScheduledValues(now);
      this.reverbWetGain.gain.setTargetAtTime(nextValue, now, enabled ? 0.12 : 0.06);
    } catch {}
  }

  scheduleNote(freq, absoluteTime, duration, noteConfig = {}) {
    const context = this.init();
    const safeFreq = Number(freq);
    const startTime = Math.max(Number(absoluteTime) || context.currentTime, context.currentTime);
    const noteDuration = Math.max(Number(duration) || 0.1, 0.02);

    if (!Number.isFinite(safeFreq) || safeFreq <= 0) return null;

    const toneNames = this.normalizeToneList(noteConfig.tone);
    if (toneNames.length > 1) {
      return this.buildLayeredVoices(toneNames, context, safeFreq, startTime, noteDuration, noteConfig, {
        mode: noteConfig.mode ?? 'scheduled',
        importance: noteConfig.importance ?? 100,
      });
    }

    const config = this.resolveRenderConfig(noteConfig, noteDuration);
    this.enforceVoiceLimit(startTime);
    const voice = this.buildVoice(context, safeFreq, startTime, noteDuration, config, {
      mode: noteConfig.mode ?? 'scheduled',
      importance: noteConfig.importance ?? 100,
    });

    return voice;
  }

  playLiveNote(freq, noteConfig = {}) {
    const context = this.init();
    const safeFreq = Number(freq);
    if (!Number.isFinite(safeFreq) || safeFreq <= 0) return null;

    const now = context.currentTime;
    const voiceKey = noteConfig.voiceId ?? freq;

    if (this.activeLiveVoices.has(voiceKey)) {
      this.releaseLiveVoice(voiceKey);
    }

    const toneNames = this.normalizeToneList(noteConfig.tone);
    if (toneNames.length > 1) {
      const bundle = this.buildLayeredVoices(toneNames, context, safeFreq, now, 30, noteConfig, {
        mode: 'live',
        importance: noteConfig.importance ?? 80,
        liveVoiceKey: voiceKey,
        endTime: Infinity,
      });

      if (bundle) {
        this.activeLiveVoices.set(voiceKey, bundle);
      }

      return bundle;
    }

    const config = this.resolveRenderConfig(noteConfig, 30);
    this.enforceVoiceLimit(now);
    const voice = this.buildVoice(context, safeFreq, now, 30, config, {
      mode: 'live',
      importance: noteConfig.importance ?? 80,
      liveVoiceKey: voiceKey,
      endTime: Infinity,
    });

    if (voice) {
      this.activeLiveVoices.set(voiceKey, voice);
    }

    return voice;
  }

  releaseLiveVoice(voiceOrKey, releaseTime = LIVE_NOTE_RELEASE_SEC) {
    const key = typeof voiceOrKey === 'string' || typeof voiceOrKey === 'number'
      ? voiceOrKey
      : voiceOrKey?.liveVoiceKey;

    const voice = key !== undefined ? this.activeLiveVoices.get(key) : voiceOrKey;
    if (!voice) return;

    this.activeLiveVoices.delete(key ?? voice.liveVoiceKey);

    const now = this.audioContext?.currentTime ?? 0;
    const stopAt = now + Math.max(releaseTime, 0.02);
    const voices = Array.isArray(voice?.voices)
      ? voice.voices
      : Array.isArray(voice)
        ? voice
        : [voice];

    voices.forEach((entry) => {
      this.releaseVoice(entry, now, stopAt, true);
    });
  }

  async loadImpulseResponse(url) {
    const context = this.init();
    if (!url || !this.reverbConvolver) {
      return null;
    }

    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Failed to load impulse response: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    this.reverbConvolver.buffer = buffer;
    return buffer;
  }

  stopAll(releaseTime = LIVE_NOTE_RELEASE_SEC) {
    if (!this.audioContext || this.activeVoices.size === 0) return;

    const now = this.audioContext.currentTime;
    const stopAt = now + Math.max(releaseTime, 0.02);

    this.activeVoices.forEach((voice) => {
      this.releaseVoice(voice, now, stopAt, true);
    });

    this.activeLiveVoices.clear();
  }

  buildVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta = {}) {
    if (config.engine === 'sampler') {
      const toneVoice = this._buildToneSamplerVoice(
        context,
        safeFrequency,
        startTime,
        noteDuration,
        config,
        voiceMeta,
      );
      if (toneVoice) {
        return toneVoice;
      }

      const sampledVoice = this._buildSamplerVoice(
        context,
        safeFrequency,
        startTime,
        noteDuration,
        config,
        voiceMeta,
      );
      if (sampledVoice) {
        return sampledVoice;
      }
    }

    if (config.engine === 'polysynth') {
      const toneVoice = this._buildTonePolySynthVoice(
        context,
        safeFrequency,
        startTime,
        noteDuration,
        config,
        voiceMeta,
      );
      if (toneVoice) {
        return toneVoice;
      }
    }

    return this._buildSynthVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta);
  }

  buildLayeredVoices(toneNames, context, safeFrequency, startTime, noteDuration, noteConfig = {}, voiceMeta = {}) {
    const normalizedToneNames = this.normalizeToneList(toneNames);
    const layerGainScale = 1 / Math.sqrt(Math.max(normalizedToneNames.length, 1));
    const outputGain = Math.max(Number(noteConfig.outputGain ?? DEFAULT_RENDER_CONFIG.outputGain) || 0, 0);
    const voices = normalizedToneNames
      .map((toneName, index) => {
        this.enforceVoiceLimit(startTime);
        const config = this.resolveRenderConfig({
          ...noteConfig,
          tone: toneName,
          outputGain: outputGain * layerGainScale * (this.getTonePreset(toneName)?.layerGain ?? 1),
        }, noteDuration);

        return this.buildVoice(context, safeFrequency, startTime, noteDuration, config, {
          ...voiceMeta,
          layerIndex: index,
          layerCount: normalizedToneNames.length,
        });
      })
      .filter(Boolean);

    if (!voices.length) {
      return null;
    }

    return {
      sourceType: 'layered',
      voices,
      toneNames: normalizedToneNames,
      liveVoiceKey: voiceMeta.liveVoiceKey ?? null,
      startTime,
      endTime: voiceMeta.endTime ?? Math.max(...voices.map((voice) => Number(voice?.endTime) || startTime)),
    };
  }

  getToneSampleUrls(sampleConfig, soundfontEntries = null) {
    const urls = {};

    (sampleConfig.samples ?? []).forEach((sampleEntry) => {
      const noteName = typeof sampleEntry === 'string' ? sampleEntry : sampleEntry?.noteName;
      const toneNoteName = normalizeMidiJsNoteName(noteName);
      if (!toneNoteName) {
        return;
      }

      if (sampleConfig.source === 'midi-js') {
        const sourceUrl = soundfontEntries?.[toneNoteName] ?? soundfontEntries?.[noteName];
        if (sourceUrl) {
          urls[toneNoteName] = sourceUrl;
        }
        return;
      }

      urls[toneNoteName] = sampleEntry?.url ?? `${noteName}.mp3`;
    });

    return urls;
  }

  async loadToneSampler(sampleSetId, config = {}) {
    if (!sampleSetId) {
      return null;
    }

    if (this.toneSamplers.has(sampleSetId)) {
      return this.toneSamplers.get(sampleSetId);
    }

    if (this.toneSamplerLoads.has(sampleSetId)) {
      return this.toneSamplerLoads.get(sampleSetId);
    }

    this.init();
    const sampleConfig = SAMPLE_LIBRARY_CONFIG[sampleSetId];
    const resolvedSampleConfig = sampleConfig ?? (
      String(sampleSetId).startsWith('gm:')
        ? {
          source: 'midi-js',
          instrument: String(sampleSetId).slice(3) || 'acoustic_grand_piano',
          samples: MIDI_JS_SAMPLE_NOTES,
        }
        : null
    );

    if (!resolvedSampleConfig) {
      return null;
    }

    const loadPromise = (async () => {
      const soundfontEntries = resolvedSampleConfig.source === 'midi-js'
        ? await this.loadMidiJsSoundfont(resolvedSampleConfig.instrument)
        : null;
      const urls = this.getToneSampleUrls(resolvedSampleConfig, soundfontEntries);

      if (!Object.keys(urls).length) {
        throw new Error(`No Tone.Sampler URLs for "${sampleSetId}".`);
      }

      const sampler = await new Promise((resolve, reject) => {
        const instance = new Tone.Sampler({
          urls,
          baseUrl: resolvedSampleConfig.baseUrl ?? '',
          attack: Math.max(Number(config.atk) || 0.003, 0),
          release: Math.max(Number(config.release) || 0.28, 0.02),
          curve: 'exponential',
          onload: () => resolve(instance),
          onerror: reject,
        });
        instance.connect(this.compressor);
      });

      this.toneSamplers.set(sampleSetId, sampler);
      this.toneSamplerLoads.delete(sampleSetId);
      return sampler;
    })().catch((error) => {
      this.toneSamplerLoads.delete(sampleSetId);
      throw error;
    });

    this.toneSamplerLoads.set(sampleSetId, loadPromise);
    return loadPromise;
  }

  getTonePolySynth(toneName, config = {}) {
    this.init();

    if (this.tonePolySynths.has(toneName)) {
      return this.tonePolySynths.get(toneName);
    }

    const synth = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: Math.min(AudioEngine.MAX_VOICES, 48),
      options: {
        oscillator: {
          type: normalizeOscillatorType(config.type, 'triangle'),
        },
        envelope: {
          attack: Math.max(Number(config.atk) || 0.01, 0.001),
          decay: Math.max(Number(config.dec) || 0.2, 0.001),
          sustain: clamp(Number(config.sus) || 0.45, 0.001, 1),
          release: Math.max(Number(config.release) || 0.35, 0.02),
        },
      },
    });

    synth.connect(this.compressor);
    this.tonePolySynths.set(toneName, synth);
    return synth;
  }

  scheduleToneVoiceCleanup(voice, stopTime) {
    if (!voice || voice.cleaned) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    const delayMs = Math.max((stopTime - now) * 1000, 0) + 80;
    if (voice.cleanupTimer) {
      window.clearTimeout(voice.cleanupTimer);
    }

    voice.cleanupTimer = window.setTimeout(() => this.cleanupVoice(voice), delayMs);
  }

  _buildToneSamplerVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta = {}) {
    const sampler = this.toneSamplers.get(config.sampleSet);
    if (!sampler?.loaded) {
      return null;
    }

    const noteVelocity = clamp(Number(config.velocity ?? DEFAULT_RENDER_CONFIG.velocity) || 0, 0.001, 1);
    const outputGain = clamp(Number(config.outputGain) || 0, 0, 1.4);
    const denseGain = Math.max(Number(config.denseGainScale) || 1, DENSE_NOTE_GAIN_FLOOR);
    const instrumentGain = Math.max(Number(config.layerGain) || 1, 0);
    const velocity = clamp(noteVelocity * outputGain * denseGain * instrumentGain, 0.001, 1);
    const releaseDuration = Math.max(Number(config.release) || 0.28, 0.02);
    const stopTime = startTime + Math.max(noteDuration, 0.02) + releaseDuration;
    const noteName = midiToNoteName(frequencyToMidi(safeFrequency));

    sampler.triggerAttackRelease(noteName, Math.max(noteDuration, 0.02), startTime, velocity);

    const voice = {
      sourceType: TONE_SAMPLER_SOURCE,
      mode: voiceMeta.mode ?? 'scheduled',
      importance: voiceMeta.importance ?? 0,
      liveVoiceKey: voiceMeta.liveVoiceKey ?? null,
      startTime,
      endTime: voiceMeta.endTime ?? stopTime,
      stopTime,
      releaseAt: null,
      isReleased: false,
      cleaned: false,
      toneInstrument: sampler,
      noteName,
      cleanupTimer: null,
    };

    this.activeVoices.add(voice);
    this.scheduleToneVoiceCleanup(voice, stopTime);
    return voice;
  }

  _buildTonePolySynthVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta = {}) {
    const synth = this.getTonePolySynth(config.tone, config);
    if (!synth) {
      return null;
    }

    const noteVelocity = clamp(Number(config.velocity ?? DEFAULT_RENDER_CONFIG.velocity) || 0, 0.001, 1);
    const outputGain = clamp(Number(config.outputGain) || 0, 0, 1.4);
    const denseGain = Math.max(Number(config.denseGainScale) || 1, DENSE_NOTE_GAIN_FLOOR);
    const instrumentGain = Math.max(Number(config.layerGain) || 1, 0);
    const velocity = clamp(noteVelocity * outputGain * denseGain * instrumentGain, 0.001, 1);
    const releaseDuration = Math.max(Number(config.release) || 0.35, 0.02);
    const stopTime = startTime + Math.max(noteDuration, 0.02) + releaseDuration;
    const noteName = midiToNoteName(frequencyToMidi(safeFrequency));

    synth.triggerAttackRelease(noteName, Math.max(noteDuration, 0.02), startTime, velocity);

    const voice = {
      sourceType: TONE_POLYSYNTH_SOURCE,
      mode: voiceMeta.mode ?? 'scheduled',
      importance: voiceMeta.importance ?? 0,
      liveVoiceKey: voiceMeta.liveVoiceKey ?? null,
      startTime,
      endTime: voiceMeta.endTime ?? stopTime,
      stopTime,
      releaseAt: null,
      isReleased: false,
      cleaned: false,
      toneInstrument: synth,
      noteName,
      cleanupTimer: null,
    };

    this.activeVoices.add(voice);
    this.scheduleToneVoiceCleanup(voice, stopTime);
    return voice;
  }

  _buildSynthVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta = {}) {
    const noteVelocity = Math.max(Number(config.velocity ?? DEFAULT_RENDER_CONFIG.velocity) || 0, 0);
    const timbreCurve = config.pianoTimbre ? getPianoTimbreCurve(safeFrequency, noteVelocity) : null;
    const keyGainMod = timbreCurve?.gain ?? Math.min(1, 800 / (safeFrequency + 200));
    const outputGain = Math.max(Number(config.outputGain) || 0, 0);
    const reverbAmount = Math.max(Number(config.reverbAmount) || 0, 0);
    const denseGain = Math.max(Number(config.denseGainScale) || 1, DENSE_NOTE_GAIN_FLOOR);
    const peak = Math.max(0.0001, noteVelocity * config.pk * keyGainMod * outputGain * denseGain);
    const sustainLevel = Math.max(peak * config.sus, 0.0001);
    const sustainUntil = Math.max(startTime + noteDuration, startTime + config.dec + 0.01);
    const releaseDuration = Math.max(
      (config.release ?? Math.min(config.dur * 0.35, 0.45)) * (timbreCurve?.releaseScale ?? 1),
      0.04,
    );
    const stopTime = sustainUntil + releaseDuration;
    const endTime = voiceMeta.endTime ?? stopTime;

    const oscillator = context.createOscillator();
    oscillator.type = normalizeOscillatorType(config.type);
    oscillator.frequency.setValueAtTime(safeFrequency, startTime);
    oscillator.detune.setValueAtTime(Number(config.detune) || 0, startTime);

    const oscillators = [oscillator];

    const envelopeGain = context.createGain();
    envelopeGain.gain.setValueAtTime(0.0001, startTime);
    envelopeGain.gain.linearRampToValueAtTime(peak, startTime + config.atk);
    envelopeGain.gain.exponentialRampToValueAtTime(sustainLevel, startTime + config.dec);
    envelopeGain.gain.setValueAtTime(sustainLevel, sustainUntil);
    envelopeGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    const dryGain = context.createGain();
    dryGain.gain.value = 1;
    const wetGain = context.createGain();
    wetGain.gain.value = reverbAmount;

    let filter = null;
    if (config.flt) {
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        Math.min(safeFrequency * config.fltStartMult, 20000),
        startTime,
      );
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(safeFrequency * config.fltEndMult, 100),
        startTime + config.fltDec,
      );
    }
    const timbreNodes = createPianoToneNodes(context, timbreCurve);
    const sourceDestination = filter || (timbreNodes[0] ?? envelopeGain);

    let noiseSource = null;
    let noiseGain = null;
    if (config.nBuf) {
      noiseSource = context.createBufferSource();
      noiseSource.buffer = config.nBuf;
      noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.0001, startTime);
      noiseGain.gain.linearRampToValueAtTime(
        Math.max(0.0001, (config.nVol ?? 0.05) * noteVelocity * outputGain),
        startTime + 0.002,
      );
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + (config.nDur ?? 0.05));
    }

    oscillator.connect(sourceDestination);
    if (Array.isArray(config.harmonics)) {
      config.harmonics.forEach((harmonic) => {
        const ratio = Math.max(Number(harmonic?.ratio) || 1, 0.25);
        const gainValue = Math.max(Number(harmonic?.gain) || 0, 0);
        if (gainValue <= 0) {
          return;
        }

        const harmonicOscillator = context.createOscillator();
        const harmonicGain = context.createGain();
        harmonicOscillator.type = normalizeOscillatorType(harmonic?.type, 'sine');
        harmonicOscillator.frequency.setValueAtTime(safeFrequency * ratio, startTime);
        harmonicOscillator.detune.setValueAtTime(Number(harmonic?.detune) || 0, startTime);
        harmonicGain.gain.value = gainValue;
        harmonicOscillator.connect(harmonicGain);
        harmonicGain.connect(sourceDestination);
        oscillators.push(harmonicOscillator);
      });
    }
    if (noiseSource && noiseGain) {
      noiseSource.connect(noiseGain);
      noiseGain.connect(sourceDestination);
    }
    if (filter) {
      connectNodeChain(filter, timbreNodes, envelopeGain);
    } else if (timbreNodes.length) {
      connectNodeChain(timbreNodes[0], timbreNodes.slice(1), envelopeGain);
    }
    envelopeGain.connect(dryGain);
    envelopeGain.connect(wetGain);
    dryGain.connect(this.compressor);
    wetGain.connect(this.reverbBus);

    let vibratoOscillator = null;
    let vibratoGain = null;
    if (Number(config.vibratoDepth) > 0) {
      vibratoOscillator = context.createOscillator();
      vibratoGain = context.createGain();
      vibratoOscillator.type = 'sine';
      vibratoOscillator.frequency.setValueAtTime(Math.max(Number(config.vibratoRate) || 5.5, 0.1), startTime);
      vibratoGain.gain.setValueAtTime(0.0001, startTime);
      vibratoGain.gain.linearRampToValueAtTime(
        Math.max(Number(config.vibratoDepth) || 0, 0),
        startTime + Math.max(Number(config.vibratoDelay) || 0, 0),
      );
      vibratoOscillator.connect(vibratoGain);
      oscillators.forEach((item) => {
        vibratoGain.connect(item.detune);
      });
    }

    const voice = {
      sourceType: 'oscillator',
      mode: voiceMeta.mode ?? 'scheduled',
      importance: voiceMeta.importance ?? 0,
      liveVoiceKey: voiceMeta.liveVoiceKey ?? null,
      startTime,
      endTime,
      stopTime,
      releaseAt: null,
      isReleased: false,
      cleaned: false,
      oscillator,
      envelopeGain,
      dryGain,
      wetGain,
      filter,
      timbreNodes,
      noiseSource,
      noiseGain,
      vibratoOscillator,
      vibratoGain,
      oscillators,
    };

    this.activeVoices.add(voice);

    oscillator.onended = () => this.cleanupVoice(voice);
    oscillators.forEach((item) => {
      item.start(startTime);
      item.stop(stopTime);
    });

    if (noiseSource) {
      noiseSource.start(startTime);
      noiseSource.stop(Math.min(stopTime, startTime + (config.nDur ?? 0.05) + 0.02));
    }
    if (vibratoOscillator) {
      vibratoOscillator.start(startTime);
      vibratoOscillator.stop(stopTime);
    }

    return voice;
  }

  _buildSamplerVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta = {}) {
    const sample = this.pickSample(config.sampleSet, safeFrequency);
    if (!sample?.buffer) {
      return null;
    }

    const outputGain = Math.max(Number(config.outputGain) || 0, 0);
    const reverbAmount = Math.max(Number(config.reverbAmount) || 0, 0);
    const playbackRate = Math.max(safeFrequency / sample.frequency, 0.125);
    const noteVelocity = Math.max(Number(config.velocity ?? DEFAULT_RENDER_CONFIG.velocity) || 0, 0);
    const timbreCurve = config.pianoTimbre ? getPianoTimbreCurve(safeFrequency, noteVelocity) : null;
    const denseGain = Math.max(Number(config.denseGainScale) || 1, DENSE_NOTE_GAIN_FLOOR);
    const peak = Math.max(
      0.0001,
      noteVelocity * (config.pk ?? 1) * outputGain * denseGain * (timbreCurve?.gain ?? 1),
    );
    const sustainUntil = Math.max(startTime + noteDuration, startTime + 0.04);
    const releaseDuration = Math.max((config.release ?? 0.28) * (timbreCurve?.releaseScale ?? 1), 0.05);
    const sampleStartOffset = Math.min(
      Math.max(Number(config.sampleStartOffset) || 0, 0),
      Math.max(sample.buffer.duration - 0.02, 0),
    );
    const naturalDuration = Math.max(0.02, (sample.buffer.duration - sampleStartOffset) / playbackRate);
    const stopTime = Math.min(sustainUntil + releaseDuration, startTime + naturalDuration);
    const endTime = voiceMeta.endTime ?? stopTime;

    const source = context.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.setValueAtTime(playbackRate, startTime);
    if (source.detune && Number.isFinite(Number(config.samplerDetune ?? config.detune))) {
      source.detune.setValueAtTime(Number(config.samplerDetune ?? config.detune), startTime);
    }

    const envelopeGain = context.createGain();
    envelopeGain.gain.setValueAtTime(0.0001, startTime);
    envelopeGain.gain.linearRampToValueAtTime(peak, startTime + Math.max(config.atk ?? 0.003, 0.002));
    envelopeGain.gain.exponentialRampToValueAtTime(
      Math.max(peak * Math.max(config.sus ?? 0.82, 0.05), 0.0001),
      startTime + Math.max(config.dec ?? 0.18, 0.05),
    );
    envelopeGain.gain.setValueAtTime(Math.max(peak * Math.max(config.sus ?? 0.82, 0.05), 0.0001), sustainUntil);
    envelopeGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    const dryGain = context.createGain();
    dryGain.gain.value = 1;
    const wetGain = context.createGain();
    wetGain.gain.value = reverbAmount;
    let hammerSource = null;
    let hammerGain = null;
    let hammerBandpass = null;
    let hammerHighpass = null;

    let samplerFilter = null;
    if (config.samplerFilterFrequency || (config.flt && config.fltEndMult)) {
      samplerFilter = context.createBiquadFilter();
      samplerFilter.type = config.samplerFilterType || 'lowpass';
      samplerFilter.frequency.setValueAtTime(
        Math.max(
          Number(config.samplerFilterFrequency) || safeFrequency * Math.max(Number(config.fltEndMult) || 1, 1),
          80,
        ),
        startTime,
      );
      samplerFilter.Q.value = Math.max(Number(config.samplerFilterQ) || 0.3, 0.0001);
    }
    const timbreNodes = createPianoToneNodes(context, timbreCurve);

    let noiseSource = null;
    let noiseGain = null;
    if (config.nBuf && Number(config.nVol) > 0) {
      noiseSource = context.createBufferSource();
      noiseSource.buffer = config.nBuf;
      noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.0001, startTime);
      noiseGain.gain.linearRampToValueAtTime(
        Math.max(0.0001, Number(config.nVol) * noteVelocity * outputGain),
        startTime + 0.002,
      );
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.max(Number(config.nDur) || 0.03, 0.006));
    }

    if (config.hammerNoise && this.shortNoiseBuffer && timbreCurve) {
      const hammerDuration = Math.max(Number(config.hammerDur) || 0.016, 0.006);
      hammerSource = context.createBufferSource();
      hammerSource.buffer = this.shortNoiseBuffer;

      hammerBandpass = context.createBiquadFilter();
      hammerBandpass.type = 'bandpass';
      hammerBandpass.frequency.value = timbreCurve.hammerBandFrequency;
      hammerBandpass.Q.value = 1.8;

      hammerHighpass = context.createBiquadFilter();
      hammerHighpass.type = 'highpass';
      hammerHighpass.frequency.value = timbreCurve.hammerHighpassFrequency;
      hammerHighpass.Q.value = 0.55;

      hammerGain = context.createGain();
      hammerGain.gain.setValueAtTime(0.0001, startTime);
      hammerGain.gain.linearRampToValueAtTime(
        Math.max(0.0001, (config.hammerVol ?? 0.08) * noteVelocity * outputGain * timbreCurve.hammerGain),
        startTime + 0.0015,
      );
      hammerGain.gain.exponentialRampToValueAtTime(0.0001, startTime + hammerDuration);

      hammerSource.connect(hammerBandpass);
      hammerBandpass.connect(hammerHighpass);
      hammerHighpass.connect(hammerGain);
      hammerGain.connect(dryGain);
      hammerGain.connect(wetGain);
    }

    const samplerToneNodes = samplerFilter ? [samplerFilter, ...timbreNodes] : timbreNodes;
    connectNodeChain(source, samplerToneNodes, envelopeGain);
    if (noiseSource && noiseGain) {
      noiseSource.connect(noiseGain);
      connectNodeChain(noiseGain, timbreNodes, envelopeGain);
    }
    envelopeGain.connect(dryGain);
    envelopeGain.connect(wetGain);
    dryGain.connect(this.compressor);
    wetGain.connect(this.reverbBus);

    const voice = {
      sourceType: 'sample',
      mode: voiceMeta.mode ?? 'scheduled',
      importance: voiceMeta.importance ?? 0,
      liveVoiceKey: voiceMeta.liveVoiceKey ?? null,
      startTime,
      endTime,
      stopTime,
      releaseAt: null,
      isReleased: false,
      cleaned: false,
      sampleMeta: sample,
      envelopeGain,
      dryGain,
      wetGain,
      filter: samplerFilter,
      noiseSource,
      noiseGain,
      timbreNodes,
      hammerSource,
      hammerGain,
      hammerBandpass,
      hammerHighpass,
      sourceNodes: [source, hammerSource].filter(Boolean),
    };

    this.activeVoices.add(voice);
    source.onended = () => this.cleanupVoice(voice);
    source.start(startTime, sampleStartOffset);
    source.stop(stopTime);
    if (noiseSource) {
      noiseSource.start(startTime);
      noiseSource.stop(Math.min(stopTime, startTime + Math.max(Number(config.nDur) || 0.03, 0.006) + 0.02));
    }
    if (hammerSource) {
      hammerSource.start(startTime);
      hammerSource.stop(Math.min(stopTime, startTime + Math.max(Number(config.hammerDur) || 0.018, 0.006) + 0.01));
    }

    return voice;
  }

  enforceVoiceLimit(time) {
    while (this.activeVoices.size >= AudioEngine.MAX_VOICES) {
      const victim = this.findVoiceToSteal(time);
      if (!victim) return;
      this.stealVoice(victim, time);
    }
  }

  findVoiceToSteal(time) {
    const candidates = Array.from(this.activeVoices).filter((v) => !v.cleaned);
    if (!candidates.length) return null;
    candidates.sort((a, b) => compareVoicePriority(a, b, time));
    return candidates[0] ?? null;
  }

  stealVoice(voice, time) {
    if (!voice || voice.cleaned) return;
    this.activeVoices.delete(voice);
    if (voice.liveVoiceKey != null) {
      this.activeLiveVoices.delete(voice.liveVoiceKey);
    }
    const releaseStart = voice.startTime > time ? voice.startTime : time;
    const stopAt = releaseStart + 0.03;
    this.releaseVoice(voice, releaseStart, stopAt, true);
  }

  releaseVoice(voice, releaseStartTime, stopAtTime, force = false) {
    if (!voice || voice.cleaned) return;
    if (voice.isReleased && !force) return;

    const now = this.audioContext?.currentTime ?? 0;
    const safeReleaseStart = Math.max(releaseStartTime, now);
    const safeStopAt = Math.max(stopAtTime, safeReleaseStart + 0.005);

    voice.isReleased = true;
    voice.releaseAt = safeReleaseStart;
    voice.endTime = Math.min(voice.endTime ?? safeStopAt, safeStopAt);

    if (voice.sourceType === TONE_SAMPLER_SOURCE || voice.sourceType === TONE_POLYSYNTH_SOURCE) {
      try {
        voice.toneInstrument?.triggerRelease?.(voice.noteName, safeReleaseStart);
      } catch {}
      this.scheduleToneVoiceCleanup(voice, safeStopAt);
      return;
    }

    try {
      rampAudioParamToSilence(voice.envelopeGain.gain, safeReleaseStart, safeStopAt);
      rampAudioParamToSilence(voice.noiseGain?.gain, safeReleaseStart, safeStopAt);
      rampAudioParamToSilence(voice.hammerGain?.gain, safeReleaseStart, safeStopAt);
    } catch {}

    const sourceNodes = Array.isArray(voice.sourceNodes)
      ? voice.sourceNodes
      : Array.isArray(voice.oscillators)
        ? voice.oscillators
        : [voice.oscillator].filter(Boolean);
    sourceNodes.forEach((item) => {
      try { item.stop(safeStopAt); } catch {}
    });
    if (voice.noiseSource) {
      try { voice.noiseSource.stop(safeStopAt); } catch {}
    }
  }

  cleanupVoice(voice) {
    if (!voice || voice.cleaned) return;
    voice.cleaned = true;
    this.activeVoices.delete(voice);

    if (voice.cleanupTimer) {
      window.clearTimeout(voice.cleanupTimer);
      voice.cleanupTimer = null;
    }

    if (voice.sourceType === TONE_SAMPLER_SOURCE || voice.sourceType === TONE_POLYSYNTH_SOURCE) {
      return;
    }

    try { voice.oscillator.onended = null; } catch {}
    const sourceNodes = Array.isArray(voice.sourceNodes)
      ? voice.sourceNodes
      : Array.isArray(voice.oscillators)
        ? voice.oscillators
        : [voice.oscillator].filter(Boolean);
    sourceNodes.forEach((item) => {
      try { item.onended = null; } catch {}
      try { item.disconnect(); } catch {}
    });
    try {
      voice.envelopeGain.disconnect();
      voice.dryGain.disconnect();
      voice.wetGain.disconnect();
    } catch {}
    try {
      voice.filter?.disconnect();
      voice.timbreNodes?.forEach((node) => node.disconnect());
      voice.hammerSource?.disconnect();
      voice.hammerGain?.disconnect();
      voice.hammerBandpass?.disconnect();
      voice.hammerHighpass?.disconnect();
      voice.noiseSource?.disconnect();
      voice.noiseGain?.disconnect();
      voice.vibratoOscillator?.disconnect();
      voice.vibratoGain?.disconnect();
    } catch {}
  }

  resolveRenderConfig(renderConfig, duration) {
    const baseDuration = duration ?? 0.5;
    const normalized = typeof renderConfig === 'string'
      ? { tone: renderConfig }
      : renderConfig;

    const toneName = this.normalizeToneName(normalized.tone || DEFAULT_RENDER_CONFIG.tone);
    const preset = this.getTonePreset(toneName);
    const dynamicOverrides = this.getDynamicToneOverrides(toneName, baseDuration);

    const resolved = {
      ...DEFAULT_RENDER_CONFIG,
      ...preset,
      ...dynamicOverrides,
      ...normalized,
      tone: toneName,
    };

    const density = Math.max(Number(normalized.density ?? normalized.simultaneousNotes) || 1, 1);
    resolved.denseGainScale = Math.max(1 / Math.sqrt(density), DENSE_NOTE_GAIN_FLOOR);

    if (typeof resolved.reverb === 'boolean') {
      resolved.reverbAmount = resolved.reverb ? DEFAULT_RENDER_CONFIG.reverbAmount : 0;
    } else if (resolved.reverbAmount === undefined) {
      resolved.reverbAmount = DEFAULT_RENDER_CONFIG.reverbAmount;
    }

    if (normalized.nBuf === undefined) {
      const bufKey = normalized.nBufKey ?? resolved.nBufKey ?? null;
      resolved.nBuf = this.resolveNoiseBuffer(bufKey);
    }
    delete resolved.nBufKey;

    return resolved;
  }

  normalizeToneName(tone) {
    if (getInstrumentDefinition(tone) || TONE_PRESETS[tone]) {
      return tone;
    }

    return DEFAULT_RENDER_CONFIG.tone;
  }

  normalizeToneList(tone) {
    const rawTones = Array.isArray(tone) ? tone : [tone ?? DEFAULT_RENDER_CONFIG.tone];
    const seen = new Set();
    return rawTones
      .map((entry) => this.normalizeToneName(entry))
      .filter((entry) => {
        if (!entry || seen.has(entry)) {
          return false;
        }
        seen.add(entry);
        return true;
      });
  }

  getTonePreset(tone) {
    const adapter = this.getInstrumentAdapter(tone);
    return adapter?.getRenderPreset(TONE_PRESETS) || TONE_PRESETS[tone] || TONE_PRESETS.classic;
  }

  getInstrumentAdapter(tone) {
    const definition = getInstrumentDefinition(tone);
    if (!definition) {
      return null;
    }

    if (this.instrumentAdapters.has(tone)) {
      return this.instrumentAdapters.get(tone);
    }

    const AdapterClass = definition.type === 'sampled'
      ? SampledInstrumentAdapter
      : SynthesizedInstrumentAdapter;
    const adapter = new AdapterClass(this, tone);
    this.instrumentAdapters.set(tone, adapter);
    return adapter;
  }

  getDynamicToneOverrides(tone, duration) {
    const fn = DYNAMIC_TONE_OVERRIDES[tone];
    return fn ? fn(duration) : {};
  }

  resolveNoiseBuffer(bufferKey) {
    if (bufferKey === 'noise') return this.noiseBuffer;
    if (bufferKey === 'shortNoise') return this.shortNoiseBuffer;
    if (bufferKey === 'breathNoise') return this.breathNoiseBuffer;
    return null;
  }

  createNoiseBuffer(context, durationSeconds, taper) {
    const frameCount = Math.floor(context.sampleRate * durationSeconds);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const raw = Math.random() * 2 - 1;
      data[i] = taper ? raw * (1 - i / data.length) : raw * 0.08;
    }
    return buffer;
  }

  async loadSampleSet(sampleSetId) {
    if (!sampleSetId) {
      return null;
    }

    if (this.sampleSets.has(sampleSetId)) {
      return this.sampleSets.get(sampleSetId);
    }

    if (this.sampleSetLoads.has(sampleSetId)) {
      return this.sampleSetLoads.get(sampleSetId);
    }

    const sampleConfig = SAMPLE_LIBRARY_CONFIG[sampleSetId];
    if (!sampleConfig) {
      if (!String(sampleSetId).startsWith('gm:')) {
        return null;
      }
    }
    const resolvedSampleConfig = sampleConfig ?? {
      source: 'midi-js',
      instrument: String(sampleSetId).slice(3) || 'acoustic_grand_piano',
      samples: MIDI_JS_SAMPLE_NOTES,
    };

    const context = this.init();
    const soundfontEntriesPromise = resolvedSampleConfig.source === 'midi-js'
      ? this.loadMidiJsSoundfont(resolvedSampleConfig.instrument)
      : Promise.resolve(null);

    const loadPromise = soundfontEntriesPromise.then((soundfontEntries) => (
      Promise.allSettled(resolvedSampleConfig.samples.map(async (sampleEntry) => {
        const noteName = typeof sampleEntry === 'string' ? sampleEntry : sampleEntry?.noteName;
        const midi = Number(sampleEntry?.midi) || noteNameToMidi(noteName);
        if (!Number.isFinite(midi)) {
          return null;
        }

        const normalizedNoteName = normalizeMidiJsNoteName(noteName);
        const url = resolvedSampleConfig.source === 'midi-js'
          ? soundfontEntries?.[normalizedNoteName] ?? soundfontEntries?.[noteName]
          : resolveSampleUrl(
            resolvedSampleConfig.baseUrl,
            sampleEntry?.url ?? `${noteName}.mp3`,
          );

        if (!url) {
          return null;
        }

        const response = await fetchWithTimeout(url, { mode: 'cors' }, SAMPLE_LOAD_TIMEOUT_MS);

        if (!response.ok) {
          throw new Error(`Failed to load sample: ${url}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(arrayBuffer.slice(0));

        return {
          id: normalizedNoteName,
          midi,
          frequency: midiToFrequency(midi),
          buffer,
        };
      }))
    ))
      .then((results) => {
        const loadedSet = results
          .filter((result) => result.status === 'fulfilled' && result.value)
          .map((result) => result.value)
          .sort((left, right) => left.midi - right.midi);
        if (!loadedSet.length) {
          throw new Error(`No usable samples loaded for "${sampleSetId}".`);
        }
        this.sampleSets.set(sampleSetId, loadedSet);
        this.sampleSetLoads.delete(sampleSetId);
        return loadedSet;
      })
      .catch((error) => {
        this.sampleSetLoads.delete(sampleSetId);
        console.warn(`Sampler load failed for "${sampleSetId}". Falling back to synth.`, error);
        throw error;
      });

    this.sampleSetLoads.set(sampleSetId, loadPromise);
    return loadPromise;
  }

  async loadMidiJsSoundfont(instrument) {
    if (!instrument) {
      return {};
    }

    const cacheKey = `midi-js:${instrument}`;
    if (this.sampleSets.has(cacheKey)) {
      return this.sampleSets.get(cacheKey);
    }

    if (this.sampleSetLoads.has(cacheKey)) {
      return this.sampleSetLoads.get(cacheKey);
    }

    const url = `${MIDI_JS_SOUNDFONT_BASE_URL}/${instrument}-mp3.js`;
    const loadPromise = fetchWithTimeout(url, { mode: 'cors' }, SOUNDFONT_LOAD_TIMEOUT_MS)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load soundfont: ${url}`);
        }
        return response.text();
      })
      .then((text) => {
        const parsed = parseMidiJsSoundfont(text);
        this.sampleSets.set(cacheKey, parsed);
        this.sampleSetLoads.delete(cacheKey);
        return parsed;
      })
      .catch((error) => {
        this.sampleSetLoads.delete(cacheKey);
        console.warn(`MIDI.js soundfont load failed for "${instrument}".`, error);
        throw error;
      });

    this.sampleSetLoads.set(cacheKey, loadPromise);
    return loadPromise;
  }

  pickSample(sampleSetId, targetFrequency) {
    const samples = this.sampleSets.get(sampleSetId);
    if (!Array.isArray(samples) || !samples.length) {
      return null;
    }

    const targetMidi = frequencyToMidi(targetFrequency);
    let bestSample = samples[0];
    let bestDistance = Infinity;

    samples.forEach((sample) => {
      const distance = Math.abs(sample.midi - targetMidi);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSample = sample;
      }
    });

    return bestSample;
  }
}

export { soundfontNameFromMidiInstrument };

export default new AudioEngine();
