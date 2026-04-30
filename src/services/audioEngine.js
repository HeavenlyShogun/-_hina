const DEFAULT_RENDER_CONFIG = {
  tone: 'piano',
  velocity: 0.85,
  outputGain: 0.65,
  reverbAmount: 0.45,
};

const TONE_ALIASES = {
  lyre: 'lyre-long',
};

const TONE_PRESETS = {
  piano: {
    tone: 'piano',
    type: 'triangle',
    dur: 4.4,
    atk: 0.004,
    dec: 1.25,
    sus: 0.018,
    pk: 0.92,
    flt: true,
    fltStartMult: 8,
    fltEndMult: 2.2,
    fltDec: 0.85,
    nBufKey: 'shortNoise',
    nDur: 0.018,
    nVol: 0.045,
    release: 0.32,
    velocity: 0.9,
    harmonics: [
      { ratio: 2, gain: 0.22, type: 'sine', detune: 2 },
      { ratio: 3, gain: 0.1, type: 'triangle', detune: -4 },
      { ratio: 4, gain: 0.045, type: 'sine', detune: 5 },
    ],
  },
  flute: {
    tone: 'flute',
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
  'lyre-long': {
    tone: 'lyre-long',
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
  classic: {
    tone: 'classic',
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

class AudioEngine {
  static MAX_VOICES = 32;

  constructor() {
    this.audioContext = null;
    this.compressor = null;
    this.reverbBus = null;
    this.reverbWetGain = null;
    this.noiseBuffer = null;
    this.shortNoiseBuffer = null;
    this.activeVoices = new Set();
    this.activeLiveVoices = new Map();
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

    this.enforceVoiceLimit(startTime);

    const config = this.resolveRenderConfig(noteConfig, noteDuration);
    const voice = this._buildVoice(context, safeFreq, startTime, noteDuration, config, {
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
    this.enforceVoiceLimit(now);

    const voiceKey = noteConfig.voiceId ?? freq;

    if (this.activeLiveVoices.has(voiceKey)) {
      this.releaseLiveVoice(voiceKey);
    }

    const config = this.resolveRenderConfig(noteConfig, 30);
    const voice = this._buildVoice(context, safeFreq, now, 30, config, {
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

  releaseLiveVoice(voiceOrKey, releaseTime = 0.08) {
    const key = typeof voiceOrKey === 'string' || typeof voiceOrKey === 'number'
      ? voiceOrKey
      : voiceOrKey?.liveVoiceKey;

    const voice = key !== undefined ? this.activeLiveVoices.get(key) : voiceOrKey;
    if (!voice) return;

    this.activeLiveVoices.delete(key ?? voice.liveVoiceKey);

    const now = this.audioContext?.currentTime ?? 0;
    const stopAt = now + Math.max(releaseTime, 0.02);
    this.releaseVoice(voice, now, stopAt, true);
  }

  stopAll(releaseTime = 0.08) {
    if (!this.audioContext || this.activeVoices.size === 0) return;

    const now = this.audioContext.currentTime;
    const stopAt = now + Math.max(releaseTime, 0.02);

    this.activeVoices.forEach((voice) => {
      this.releaseVoice(voice, now, stopAt, true);
    });

    this.activeLiveVoices.clear();
  }

  _buildVoice(context, safeFrequency, startTime, noteDuration, config, voiceMeta = {}) {
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

    const voice = {
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

    const oscillators = Array.isArray(voice.oscillators) ? voice.oscillators : [voice.oscillator];
    oscillators.forEach((item) => {
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
    const oscillators = Array.isArray(voice.oscillators) ? voice.oscillators : [voice.oscillator];
    oscillators.forEach((item) => {
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
}

export default new AudioEngine();
