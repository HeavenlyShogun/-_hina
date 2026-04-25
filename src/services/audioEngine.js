const DEFAULT_RENDER_CONFIG = {
  tone: 'piano',
  velocity: 0.85,
  outputGain: 0.65,
  reverbAmount: 0.45,
};

const TONE_ALIASES = {
  lyre: 'lyre-long',
};

// Pure preset data; runtime buffers and duration-derived values are resolved later.
const TONE_PRESETS = {
  piano: {
    tone: 'piano',
    type: 'sawtooth',
    dur: 3.5,
    atk: 0.01,
    dec: 0.8,
    sus: 0.1,
    pk: 0.6,
    flt: true,
    fltStartMult: 5,
    fltEndMult: 1,
    fltDec: 0.2,
    nBufKey: null,
    release: 0.18,
    velocity: 0.85,
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

class AudioEngine {
  static MAX_VOICES = 32;

  constructor() {
    this.audioContext = null;
    this.compressor = null;
    this.reverbBus = null;
    this.noiseBuffer = null;
    this.shortNoiseBuffer = null;
    this.activeVoices = new Set();
    this.activeLiveVoices = new Map();
  }

  init() {
    if (this.audioContext) {
      return this.audioContext;
    }

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

    const delay = context.createDelay();
    delay.delayTime.value = 0.15;

    const feedback = context.createGain();
    feedback.gain.value = 0.15;

    const lowpass = context.createBiquadFilter();
    lowpass.frequency.value = 1500;

    reverbBus.connect(delay);
    delay.connect(feedback);
    feedback.connect(lowpass);
    lowpass.connect(delay);
    lowpass.connect(compressor);
    compressor.connect(context.destination);

    this.audioContext = context;
    this.compressor = compressor;
    this.reverbBus = reverbBus;
    this.noiseBuffer = this.createNoiseBuffer(context, 0.06, true);
    this.shortNoiseBuffer = this.createNoiseBuffer(context, 0.015, false);

    return this.audioContext;
  }

  async resume() {
    const context = this.init();

    if (context.state === 'suspended') {
      await context.resume();
    }

    return context;
  }

  getCurrentTime() {
    return this.audioContext ? this.audioContext.currentTime : 0;
  }

  scheduleNote(freq, absoluteTime, duration, renderConfig = {}) {
    const context = this.init();
    const safeFrequency = Number(freq);
    const startTime = Math.max(Number(absoluteTime) || context.currentTime, context.currentTime);
    const noteDuration = Math.max(Number(duration) || 0.1, 0.02);

    if (!Number.isFinite(safeFrequency) || safeFrequency <= 0) {
      return null;
    }

    this.enforceVoiceLimit(startTime);

    const config = this.resolveRenderConfig(renderConfig, noteDuration);
    const keyGainMod = Math.min(1, 800 / (safeFrequency + 200));
    const outputGain = Math.max(Number(config.outputGain) || 0, 0);
    const reverbAmount = Math.max(Number(config.reverbAmount) || 0, 0);
    const peak = Math.max(0.0001, (config.velocity ?? 0.85) * config.pk * keyGainMod * outputGain);
    const sustainLevel = Math.max(peak * config.sus, 0.0001);
    const sustainUntil = Math.max(startTime + noteDuration, startTime + config.dec + 0.01);
    const releaseDuration = Math.max(config.release ?? Math.min(config.dur * 0.35, 0.45), 0.04);
    const stopTime = sustainUntil + releaseDuration;

    const oscillator = context.createOscillator();
    oscillator.type = config.type;
    oscillator.frequency.setValueAtTime(safeFrequency, startTime);

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
      filter.frequency.setValueAtTime(Math.min(safeFrequency * config.fltStartMult, 20000), startTime);
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

    const sourceTarget = filter || envelopeGain;

    oscillator.connect(filter || envelopeGain);
    if (noiseSource && noiseGain) {
      noiseSource.connect(noiseGain);
      noiseGain.connect(sourceTarget);
    }

    if (filter) {
      filter.connect(envelopeGain);
    }

    envelopeGain.connect(dryGain);
    envelopeGain.connect(wetGain);
    dryGain.connect(this.compressor);
    wetGain.connect(this.reverbBus);

    const voice = {
      frequency: safeFrequency,
      oscillator,
      envelopeGain,
      dryGain,
      wetGain,
      filter,
      noiseSource,
      noiseGain,
      startedAt: startTime,
      stopTime,
      releaseAt: null,
      released: false,
      cleaned: false,
      isFuture: startTime > context.currentTime + 0.001,
    };

    this.activeVoices.add(voice);

    oscillator.onended = () => {
      this.cleanupVoice(voice);
    };

    oscillator.start(startTime);
    oscillator.stop(stopTime);

    if (noiseSource) {
      noiseSource.start(startTime);
      noiseSource.stop(Math.min(stopTime, startTime + (config.nDur ?? 0.05) + 0.02));
    }

    return voice;
  }

  playLiveNote(freq, renderConfig = {}) {
    const context = this.init();
    const safeFrequency = Number(freq);

    if (!Number.isFinite(safeFrequency) || safeFrequency <= 0) {
      return null;
    }

    const voiceKey = this.buildLiveVoiceKey(safeFrequency, renderConfig.voiceId);
    const existingVoice = this.activeLiveVoices.get(voiceKey);
    if (existingVoice && !existingVoice.cleaned) {
      return existingVoice;
    }

    this.enforceVoiceLimit(context.currentTime);

    const config = this.resolveRenderConfig({
      ...renderConfig,
      sustain: true,
    }, renderConfig.duration ?? 0.5);
    const startTime = context.currentTime + 0.005;
    const keyGainMod = Math.min(1, 800 / (safeFrequency + 200));
    const outputGain = Math.max(Number(config.outputGain) || 0, 0);
    const reverbAmount = Math.max(Number(config.reverbAmount) || 0, 0);
    const peak = Math.max(0.0001, (config.velocity ?? 0.85) * config.pk * keyGainMod * outputGain);
    const sustainLevel = Math.max(peak * config.sus, 0.0001);

    const oscillator = context.createOscillator();
    oscillator.type = config.type;
    oscillator.frequency.setValueAtTime(safeFrequency, startTime);

    const envelopeGain = context.createGain();
    envelopeGain.gain.setValueAtTime(0.0001, startTime);
    envelopeGain.gain.linearRampToValueAtTime(peak, startTime + config.atk);
    envelopeGain.gain.exponentialRampToValueAtTime(sustainLevel, startTime + config.dec);
    envelopeGain.gain.setValueAtTime(sustainLevel, startTime + config.dec + 0.01);

    const dryGain = context.createGain();
    dryGain.gain.value = 1;
    const wetGain = context.createGain();
    wetGain.gain.value = reverbAmount;

    let filter = null;
    if (config.flt) {
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(safeFrequency * config.fltStartMult, 20000), startTime);
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

    const sourceTarget = filter || envelopeGain;

    oscillator.connect(filter || envelopeGain);
    if (noiseSource && noiseGain) {
      noiseSource.connect(noiseGain);
      noiseGain.connect(sourceTarget);
    }

    if (filter) {
      filter.connect(envelopeGain);
    }

    envelopeGain.connect(dryGain);
    envelopeGain.connect(wetGain);
    dryGain.connect(this.compressor);
    wetGain.connect(this.reverbBus);

    const voice = {
      frequency: safeFrequency,
      oscillator,
      envelopeGain,
      dryGain,
      wetGain,
      filter,
      noiseSource,
      noiseGain,
      startedAt: startTime,
      stopTime: Number.POSITIVE_INFINITY,
      releaseAt: null,
      released: false,
      cleaned: false,
      isFuture: startTime > context.currentTime + 0.001,
      isLive: true,
      liveVoiceKey: voiceKey,
    };

    this.activeVoices.add(voice);
    this.activeLiveVoices.set(voiceKey, voice);

    oscillator.onended = () => {
      this.cleanupVoice(voice);
    };

    oscillator.start(startTime);

    if (noiseSource) {
      noiseSource.start(startTime);
      noiseSource.stop(startTime + (config.nDur ?? 0.05) + 0.02);
    }

    return voice;
  }

  releaseLiveVoice(voiceOrKey, releaseTime = 0.08) {
    const voice =
      typeof voiceOrKey === 'object' && voiceOrKey
        ? voiceOrKey
        : this.activeLiveVoices.get(voiceOrKey);

    if (!voice || !this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;
    const stopAt = now + Math.max(releaseTime, 0.02);
    this.releaseVoice(voice, now, stopAt, true);
  }

  stopAll(releaseTime = 0.08) {
    if (!this.audioContext || this.activeVoices.size === 0) {
      return;
    }

    const now = this.audioContext.currentTime;
    const stopAt = now + Math.max(releaseTime, 0.02);

    this.activeVoices.forEach((voice) => {
      this.releaseVoice(voice, now, stopAt, true);
    });
  }

  cleanupVoice(voice) {
    if (!voice || voice.cleaned) {
      return;
    }

    voice.cleaned = true;
    this.activeVoices.delete(voice);
    if (voice.liveVoiceKey) {
      this.activeLiveVoices.delete(voice.liveVoiceKey);
    }

    try {
      voice.oscillator.onended = null;
    } catch {}

    try {
      voice.oscillator.disconnect();
    } catch {}

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

  createNoiseBuffer(context, durationSeconds, taper) {
    const frameCount = Math.floor(context.sampleRate * durationSeconds);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) {
      const raw = Math.random() * 2 - 1;
      data[index] = taper ? raw * (1 - index / data.length) : raw * 0.08;
    }

    return buffer;
  }

  resolveRenderConfig(renderConfig, duration) {
    const baseDuration = duration ?? 0.5;
    const normalizedRenderConfig = typeof renderConfig === 'string' ? { tone: renderConfig } : renderConfig;
    const toneName = this.normalizeToneName(normalizedRenderConfig.tone || DEFAULT_RENDER_CONFIG.tone);
    const preset = this.getTonePreset(toneName);
    const dynamicOverrides = this.getDynamicToneOverrides(toneName, baseDuration);

    const resolvedConfig = {
      ...DEFAULT_RENDER_CONFIG,
      ...preset,
      ...dynamicOverrides,
      ...normalizedRenderConfig,
      tone: toneName,
    };

    if (normalizedRenderConfig.reverbAmount === undefined && normalizedRenderConfig.reverb !== undefined) {
      resolvedConfig.reverbAmount = normalizedRenderConfig.reverb ? DEFAULT_RENDER_CONFIG.reverbAmount : 0;
    }

    if (normalizedRenderConfig.nBuf === undefined) {
      const bufferKey = normalizedRenderConfig.nBufKey ?? resolvedConfig.nBufKey ?? null;
      resolvedConfig.nBuf = this.resolveNoiseBuffer(bufferKey);
    }

    delete resolvedConfig.nBufKey;

    return resolvedConfig;
  }

  normalizeToneName(tone) {
    return TONE_ALIASES[tone] || tone || 'classic';
  }

  getTonePreset(tone) {
    return TONE_PRESETS[tone] || TONE_PRESETS.classic;
  }

  getDynamicToneOverrides(tone, duration) {
    const resolveOverrides = DYNAMIC_TONE_OVERRIDES[tone];
    return resolveOverrides ? resolveOverrides(duration) : {};
  }

  resolveNoiseBuffer(bufferKey) {
    if (bufferKey === 'noise') {
      return this.noiseBuffer;
    }

    if (bufferKey === 'shortNoise') {
      return this.shortNoiseBuffer;
    }

    return null;
  }

  enforceVoiceLimit(time) {
    while (this.activeVoices.size >= AudioEngine.MAX_VOICES) {
      const voiceToSteal = this.findVoiceToSteal(time);
      if (!voiceToSteal) {
        return;
      }

      this.stealVoice(voiceToSteal, time);
    }
  }

  findVoiceToSteal(time) {
    let releasedVoice = null;
    let oldestStartedVoice = null;
    let latestFutureVoice = null;

    for (const voice of this.activeVoices) {
      if (voice.released) {
        if (!releasedVoice || (voice.releaseAt ?? voice.startedAt) < (releasedVoice.releaseAt ?? releasedVoice.startedAt)) {
          releasedVoice = voice;
        }
        continue;
      }

      if (voice.startedAt <= time + 0.001) {
        if (!oldestStartedVoice || voice.startedAt < oldestStartedVoice.startedAt) {
          oldestStartedVoice = voice;
        }
        continue;
      }

      if (!latestFutureVoice || voice.startedAt > latestFutureVoice.startedAt) {
        latestFutureVoice = voice;
      }
    }

    return releasedVoice || oldestStartedVoice || latestFutureVoice || null;
  }

  stealVoice(voice, time) {
    if (!voice || voice.cleaned) {
      return;
    }

    this.activeVoices.delete(voice);

    const releaseStart = voice.startedAt > time ? voice.startedAt : time;
    const stopAt = releaseStart + 0.03;

    this.releaseVoice(voice, releaseStart, stopAt, true);
  }

  releaseVoice(voice, releaseStartTime, stopAtTime, force = false) {
    if (!voice || voice.cleaned) {
      return;
    }

    if (voice.released && !force) {
      return;
    }

    const now = this.audioContext?.currentTime ?? 0;
    const safeReleaseStart = Math.max(releaseStartTime, now);
    const safeStopAt = Math.max(stopAtTime, safeReleaseStart + 0.005);

    voice.released = true;
    voice.releaseAt = safeReleaseStart;
    voice.stopTime = Math.min(voice.stopTime ?? safeStopAt, safeStopAt);

    try {
      voice.envelopeGain.gain.cancelScheduledValues(safeReleaseStart);
      const currentValue = safeReleaseStart > now + 0.001
        ? 0.0001
        : Math.max(voice.envelopeGain.gain.value, 0.0001);
      voice.envelopeGain.gain.setValueAtTime(currentValue, safeReleaseStart);
      voice.envelopeGain.gain.exponentialRampToValueAtTime(0.0001, safeStopAt);
    } catch {}

    try {
      voice.oscillator.stop(safeStopAt);
    } catch {}

    if (voice.noiseSource) {
      try {
        voice.noiseSource.stop(safeStopAt);
      } catch {}
    }
  }

  buildLiveVoiceKey(frequency, voiceId) {
    if (voiceId) {
      return `id:${voiceId}`;
    }

    return `freq:${Number(frequency).toFixed(4)}`;
  }
}

export default new AudioEngine();
