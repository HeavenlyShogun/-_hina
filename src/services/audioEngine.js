const DEFAULT_RENDER_CONFIG = {
  tone: 'piano',
  velocity: 0.85,
  outputGain: 0.65,
  reverbAmount: 0.45,
};

class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.compressor = null;
    this.reverbBus = null;
    this.noiseBuffer = null;
    this.shortNoiseBuffer = null;
    this.activeVoices = new Set();
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
      oscillator,
      envelopeGain,
      dryGain,
      wetGain,
      filter,
      noiseSource,
      noiseGain,
      released: false,
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

  stopAll(releaseTime = 0.08) {
    if (!this.audioContext || this.activeVoices.size === 0) {
      return;
    }

    const now = this.audioContext.currentTime;
    const stopAt = now + Math.max(releaseTime, 0.02);

    this.activeVoices.forEach((voice) => {
      if (voice.released) {
        return;
      }

      voice.released = true;

      try {
        voice.envelopeGain.gain.cancelScheduledValues(now);
        const currentValue = Math.max(voice.envelopeGain.gain.value, 0.0001);
        voice.envelopeGain.gain.setValueAtTime(currentValue, now);
        voice.envelopeGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      } catch {}

      try {
        voice.oscillator.stop(stopAt);
      } catch {}

      if (voice.noiseSource) {
        try {
          voice.noiseSource.stop(stopAt);
        } catch {}
      }
    });
  }

  cleanupVoice(voice) {
    if (!voice || !this.activeVoices.has(voice)) {
      return;
    }

    this.activeVoices.delete(voice);

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
    if (typeof renderConfig === 'string') {
      return {
        ...DEFAULT_RENDER_CONFIG,
        ...this.createTonePreset(renderConfig, duration),
      };
    }

    const toneName = renderConfig.tone || DEFAULT_RENDER_CONFIG.tone;

    return {
      ...DEFAULT_RENDER_CONFIG,
      ...this.createTonePreset(toneName, duration),
      ...renderConfig,
    };
  }

  createTonePreset(tone, duration) {
    const baseDuration = duration !== null ? duration : 0.5;

    switch (tone) {
      case 'piano':
        return {
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
          nBuf: null,
          release: 0.18,
          velocity: 0.85,
        };
      case 'flute':
        return {
          tone: 'flute',
          type: 'sine',
          dur: 2.5,
          atk: 0.08,
          dec: 0.2,
          sus: 0.8,
          pk: 0.7,
          flt: false,
          nBuf: this.noiseBuffer,
          nDur: 0.8,
          nVol: 0.015,
          release: 0.12,
          velocity: 0.85,
        };
      case 'lyre':
      case 'lyre-long':
        return {
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
          nBuf: this.noiseBuffer,
          nDur: 0.05,
          nVol: 0.08,
          release: 0.18,
          velocity: 0.85,
        };
      case 'lyre-short':
        return {
          tone: 'lyre-short',
          type: 'sawtooth',
          dur: Math.max(baseDuration * 2, 0.8),
          atk: 0.015,
          dec: 0.1,
          sus: 0.001,
          pk: 0.4,
          flt: true,
          fltStartMult: 6,
          fltEndMult: 1.2,
          fltDec: 0.3,
          nBuf: this.noiseBuffer,
          nDur: 0.06,
          nVol: 0.1,
          release: 0.1,
          velocity: 0.85,
        };
      case 'tongue-drum':
        return {
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
          nBuf: this.noiseBuffer,
          nDur: 0.03,
          nVol: 0.05,
          release: 0.14,
          velocity: 0.85,
        };
      default:
        return {
          tone: 'classic',
          type: 'triangle',
          dur: Math.max(baseDuration * 1.5, 0.6),
          atk: 0.015,
          dec: 0.1,
          sus: 0.001,
          pk: 0.4,
          flt: false,
          nBuf: this.shortNoiseBuffer,
          nDur: 0.015,
          nVol: 0.15,
          release: 0.08,
          velocity: 0.85,
        };
    }
  }
}

export default new AudioEngine();
