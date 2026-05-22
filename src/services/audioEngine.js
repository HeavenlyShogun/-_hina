const DEFAULT_RENDER_CONFIG = {
  tone: 'piano',
  velocity: 0.85,
  outputGain: 0.65,
  reverbAmount: 0.45,
};
const LIVE_NOTE_RELEASE_SEC = 0.16;
const SAMPLE_LOAD_TIMEOUT_MS = 8000;
const MIDI_JS_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';

const TONE_ALIASES = {
  lyre: 'lyre-long',
};

const TONE_PRESETS = {
  piano: {
    tone: 'piano',
    engine: 'sampler',
    sampleSet: 'acoustic-grand-piano',
    layerGain: 1.08,
    dur: 5.2,
    atk: 0.003,
    dec: 0.22,
    sus: 0.82,
    pk: 1,
    flt: false,
    release: 0.38,
    velocity: 0.9,
  },
  flute: {
    tone: 'flute',
    engine: 'sampler',
    sampleSet: 'flute',
    layerGain: 0.82,
    type: 'sine',
    dur: 2.5,
    atk: 0.08,
    dec: 0.2,
    sus: 0.8,
    pk: 0.7,
    flt: false,
    nBufKey: 'noise',
    nDur: 0.8,
    nVol: 0.015,
    release: 0.12,
    velocity: 0.85,
  },
  violin: {
    tone: 'violin',
    engine: 'sampler',
    sampleSet: 'violin',
    layerGain: 0.56,
    type: 'sawtooth',
    dur: 3.8,
    atk: 0.075,
    dec: 0.42,
    sus: 0.78,
    pk: 0.28,
    flt: true,
    fltStartMult: 7.5,
    fltEndMult: 2.8,
    fltDec: 0.32,
    detune: -3,
    vibratoDelay: 0.18,
    vibratoRate: 5.8,
    vibratoDepth: 16,
    harmonics: [
      { ratio: 1, gain: 0.44, type: 'sawtooth', detune: 5 },
      { ratio: 2, gain: 0.1, type: 'triangle', detune: -2 },
      { ratio: 3, gain: 0.04, type: 'sine', detune: 3 },
      { ratio: 4, gain: 0.018, type: 'sine', detune: -4 },
    ],
    nBufKey: 'noise',
    nDur: 0.24,
    nVol: 0.026,
    release: 0.34,
    velocity: 0.78,
  },
  'lyre-long': {
    tone: 'lyre-long',
    engine: 'sampler',
    sampleSet: 'orchestral-harp',
    layerGain: 0.86,
    type: 'sawtooth',
    dur: 4,
    atk: 0.015,
    dec: 0.6,
    sus: 0.1,
    pk: 0.4,
    flt: true,
    fltStartMult: 6,
    fltEndMult: 1.2,
    fltDec: 0.4,
    nBufKey: 'noise',
    nDur: 0.05,
    nVol: 0.08,
    release: 0.18,
    velocity: 0.85,
  },
  'lyre-short': {
    tone: 'lyre-short',
    engine: 'sampler',
    sampleSet: 'orchestral-harp',
    layerGain: 0.9,
    type: 'sawtooth',
    atk: 0.015,
    dec: 0.1,
    sus: 0.001,
    pk: 0.4,
    flt: true,
    fltStartMult: 6,
    fltEndMult: 1.2,
    fltDec: 0.3,
    nBufKey: 'noise',
    nDur: 0.06,
    nVol: 0.1,
    release: 0.1,
    velocity: 0.85,
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
  'lyre-short': (baseDuration) => ({
    dur: Math.max(baseDuration * 2, 0.8),
  }),
  classic: (baseDuration) => ({
    dur: Math.max(baseDuration * 1.5, 0.6),
  }),
};

const VALID_OSCILLATOR_TYPES = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const SAMPLE_LIBRARY_CONFIG = {
  'acoustic-grand-piano': {
    source: 'midi-js',
    instrument: 'acoustic_grand_piano',
    samples: ['A2', 'C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5', 'A5'],
  },
  violin: {
    source: 'midi-js',
    instrument: 'violin',
    samples: ['G3', 'C4', 'E4', 'G4', 'B4', 'D5', 'F#5', 'A5', 'C6'],
  },
  flute: {
    source: 'midi-js',
    instrument: 'flute',
    samples: ['C4', 'D4', 'F4', 'A4', 'C5', 'D5', 'F5', 'A5', 'C6'],
  },
  'orchestral-harp': {
    source: 'midi-js',
    instrument: 'orchestral_harp',
    samples: ['C3', 'E3', 'G3', 'B3', 'D4', 'F4', 'A4', 'C5', 'E5', 'G5', 'B5'],
  },
  'steel-drums': {
    source: 'midi-js',
    instrument: 'steel_drums',
    samples: ['C4', 'E4', 'G4', 'B4', 'D5', 'F5', 'A5', 'C6'],
  },
};

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

function normalizeMidiJsNoteName(noteName) {
  return String(noteName || '').replace('s', '#');
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
    this.reverbBus = null;
    this.reverbWetGain = null;
    this.noiseBuffer = null;
    this.shortNoiseBuffer = null;
    this.activeVoices = new Set();
    this.activeLiveVoices = new Map();
    this.sampleSets = new Map();
    this.sampleSetLoads = new Map();
  }

  init() {
    if (this.audioContext) return this.audioContext;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    const context = new AudioContextClass();

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 5;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.1;

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
    reverbWetGain.connect(compressor);
    compressor.connect(context.destination);

    this.audioContext = context;
    this.compressor = compressor;
    this.reverbBus = reverbBus;
    this.reverbWetGain = reverbWetGain;
    this.noiseBuffer = this.createNoiseBuffer(context, 0.06, true);
    this.shortNoiseBuffer = this.createNoiseBuffer(context, 0.015, false);

    return this.audioContext;
  }

  async resume() {
    const context = this.init();
    if (context.state === 'suspended') await context.resume();
    return context;
  }

  async prepareTone(tone) {
    const context = this.init();
    const toneNames = this.normalizeToneList(tone);
    const sampleSetIds = new Set();

    toneNames.forEach((toneName) => {
      const config = this.resolveRenderConfig({ tone: toneName }, 1);
      if (config.engine === 'sampler' && config.sampleSet) {
        sampleSetIds.add(config.sampleSet);
      }
    });

    await Promise.all([...sampleSetIds].map((sampleSetId) => (
      this.loadSampleSet(sampleSetId).catch((error) => {
        console.warn(`Sampler "${sampleSetId}" is unavailable. Falling back to synth playback.`, error);
        return null;
      })
    )));
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

  _buildSynthVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta = {}) {
    const keyGainMod = Math.min(1, 800 / (safeFrequency + 200));
    const outputGain = Math.max(Number(config.outputGain) || 0, 0);
    const reverbAmount = Math.max(Number(config.reverbAmount) || 0, 0);
    const peak = Math.max(0.0001, (config.velocity ?? 0.85) * config.pk * keyGainMod * outputGain);
    const sustainLevel = Math.max(peak * config.sus, 0.0001);
    const sustainUntil = Math.max(startTime + noteDuration, startTime + config.dec + 0.01);
    const releaseDuration = Math.max(
      config.release ?? Math.min(config.dur * 0.35, 0.45),
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

    let noiseSource = null;
    let noiseGain = null;
    if (config.nBuf) {
      noiseSource = context.createBufferSource();
      noiseSource.buffer = config.nBuf;
      noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.0001, startTime);
      noiseGain.gain.linearRampToValueAtTime(
        Math.max(0.0001, (config.nVol ?? 0.05) * (config.velocity ?? 0.85) * outputGain),
        startTime + 0.002,
      );
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + (config.nDur ?? 0.05));
    }

    oscillator.connect(filter || envelopeGain);
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
        harmonicGain.connect(filter || envelopeGain);
        oscillators.push(harmonicOscillator);
      });
    }
    if (noiseSource && noiseGain) {
      noiseSource.connect(noiseGain);
      noiseGain.connect(filter || envelopeGain);
    }
    if (filter) filter.connect(envelopeGain);
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
    const peak = Math.max(0.0001, (config.velocity ?? 0.85) * (config.pk ?? 1) * outputGain);
    const sustainUntil = Math.max(startTime + noteDuration, startTime + 0.04);
    const releaseDuration = Math.max(config.release ?? 0.28, 0.05);
    const naturalDuration = sample.buffer.duration / playbackRate;
    const stopTime = Math.min(sustainUntil + releaseDuration, startTime + naturalDuration);
    const endTime = voiceMeta.endTime ?? stopTime;

    const source = context.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.setValueAtTime(playbackRate, startTime);

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

    source.connect(envelopeGain);
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
      sourceNodes: [source],
    };

    this.activeVoices.add(voice);
    source.onended = () => this.cleanupVoice(voice);
    source.start(startTime);
    source.stop(stopTime);

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

    try {
      voice.envelopeGain.gain.cancelScheduledValues(safeReleaseStart);
      const currentValue = safeReleaseStart > now + 0.001
        ? 0.0001
        : Math.max(voice.envelopeGain.gain.value, 0.0001);
      voice.envelopeGain.gain.setValueAtTime(currentValue, safeReleaseStart);
      voice.envelopeGain.gain.exponentialRampToValueAtTime(0.0001, safeStopAt);
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
    return TONE_ALIASES[tone] || tone || 'classic';
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
    return TONE_PRESETS[tone] || TONE_PRESETS.classic;
  }

  getDynamicToneOverrides(tone, duration) {
    const fn = DYNAMIC_TONE_OVERRIDES[tone];
    return fn ? fn(duration) : {};
  }

  resolveNoiseBuffer(bufferKey) {
    if (bufferKey === 'noise') return this.noiseBuffer;
    if (bufferKey === 'shortNoise') return this.shortNoiseBuffer;
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
      return null;
    }

    const context = this.init();
    const soundfontEntriesPromise = sampleConfig.source === 'midi-js'
      ? this.loadMidiJsSoundfont(sampleConfig.instrument)
      : Promise.resolve(null);

    const loadPromise = soundfontEntriesPromise.then((soundfontEntries) => (
      Promise.all(sampleConfig.samples.map(async (sampleEntry) => {
      const noteName = typeof sampleEntry === 'string' ? sampleEntry : sampleEntry?.noteName;
      const midi = Number(sampleEntry?.midi) || noteNameToMidi(noteName);
      if (!Number.isFinite(midi)) {
        return null;
      }

      const normalizedNoteName = normalizeMidiJsNoteName(noteName);
      const url = sampleConfig.source === 'midi-js'
        ? soundfontEntries?.[normalizedNoteName] ?? soundfontEntries?.[noteName]
        : sampleEntry?.url ?? `${sampleConfig.baseUrl}/${noteName}.mp3`;

      if (!url) {
        return null;
      }

      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? window.setTimeout(() => controller.abort(), SAMPLE_LOAD_TIMEOUT_MS)
        : null;
      let response = null;

      try {
        response = await fetch(url, {
          mode: 'cors',
          ...(controller ? { signal: controller.signal } : {}),
        });
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      }

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
    })))
    )
      .then((samples) => {
        const loadedSet = samples.filter(Boolean).sort((left, right) => left.midi - right.midi);
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
    const loadPromise = fetch(url, { mode: 'cors' })
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

export default new AudioEngine();
