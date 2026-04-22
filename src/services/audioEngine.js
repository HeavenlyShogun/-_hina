class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.reverbBus = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.shortNoiseBuffer = null;
    this.activeVoices = new Set();
    this.settings = {
      volume: 0.65,
      reverb: true,
      tone: 'piano',
    };
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
    const masterGain = context.createGain();
    masterGain.gain.value = this.settings.volume;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 5;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.1;

    const reverbBus = context.createGain();
    reverbBus.gain.value = this.settings.reverb ? 0.45 : 0;

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

    masterGain.connect(compressor);
    masterGain.connect(reverbBus);
    compressor.connect(context.destination);

    this.audioContext = context;
    this.masterGain = masterGain;
    this.reverbBus = reverbBus;
    this.compressor = compressor;

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

  setVolume(value) {
    const volume = Math.max(0, Math.min(1, Number(value) || 0));
    this.settings.volume = volume;

    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.05);
    }
  }

  setReverbEnabled(enabled) {
    this.settings.reverb = Boolean(enabled);

    if (this.reverbBus && this.audioContext) {
      this.reverbBus.gain.setTargetAtTime(
        this.settings.reverb ? 0.45 : 0,
        this.audioContext.currentTime,
        0.1,
      );
    }
  }

  setTone(tone) {
    if (typeof tone === 'string' && tone.trim()) {
      this.settings.tone = tone.trim();
    }
  }

  scheduleNote(freq, absoluteTime, duration, toneConfig = {}) {
    const context = this.init();
    const safeFrequency = Number(freq);
    const startTime = Math.max(Number(absoluteTime) || context.currentTime, context.currentTime);
    const noteDuration = Math.max(Number(duration) || 0.1, 0.02);

    if (!Number.isFinite(safeFrequency) || safeFrequency <= 0) {
      return null;
    }

    const config = this.resolveToneConfig(toneConfig, noteDuration);
    const keyGainMod = Math.min(1, 800 / (safeFrequency + 200));
    const peak = Math.max(0.0001, (config.velocity ?? 0.85) * config.pk * keyGainMod);
    const sustainLevel = Math.max(peak * config.sus, 0.0001);
    const sustainUntil = Math.max(startTime + noteDuration, startTime + config.dec + 0.01);
    const releaseDuration = Math.max(config.release ?? Math.min(config.dur * 0.35, 0.45), 0.04);
    const stopTime = sustainUntil + releaseDuration;

    const oscillator = context.createOscillator();
    oscillator.type = config.type;
    oscillator.frequency.setValueAtTime(safeFrequency, startTime);

    const noteGain = context.createGain();
    noteGain.gain.setValueAtTime(0.0001, startTime);
    noteGain.gain.linearRampToValueAtTime(peak, startTime + config.atk);
    noteGain.gain.exponentialRampToValueAtTime(sustainLevel, startTime + config.dec);
    noteGain.gain.setValueAtTime(sustainLevel, sustainUntil);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

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
        Math.max(0.0001, (config.nVol ?? 0.05) * (config.velocity ?? 0.85)),
        startTime + 0.002,
      );
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + (config.nDur ?? 0.05));
    }

    if (filter) {
      oscillator.connect(filter);
      if (noiseSource && noiseGain) {
        noiseSource.connect(noiseGain);
        noiseGain.connect(filter);
      }
      filter.connect(noteGain);
    } else {
      oscillator.connect(noteGain);
      if (noiseSource && noiseGain) {
        noiseSource.connect(noiseGain);
        noiseGain.connect(noteGain);
      }
    }

    noteGain.connect(this.masterGain);

    const voice = {
      oscillator,
      noteGain,
      filter,
      noiseSource,
      noiseGain,
      stopTime,
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
        voice.noteGain.gain.cancelScheduledValues(now);
        const currentValue = Math.max(voice.noteGain.gain.value, 0.0001);
        voice.noteGain.gain.setValueAtTime(currentValue, now);
        voice.noteGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
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
      voice.noteGain.disconnect();
    } catch {}

    try {
      voice.filter?.disconnect();
    } catch {}

    try {
      voice.noiseSource?.disconnect();
    } catch {}

    try {
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

  resolveToneConfig(toneConfig, duration) {
    if (typeof toneConfig === 'string') {
      return this.createTonePreset(toneConfig, duration);
    }

    const toneName = toneConfig.tone || this.settings.tone;
    return {
      ...this.createTonePreset(toneName, duration),
      ...toneConfig,
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
