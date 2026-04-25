import { useCallback, useEffect, useRef } from 'react';

const SEMITONE_RATIOS = new Float32Array(61);
for (let i = -30; i <= 30; i += 1) SEMITONE_RATIOS[i + 30] = 2 ** (i / 12);

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

export function useAudioEngine() {
  const audioCtx = useRef(null);
  const masterGain = useRef(null);
  const reverbBus = useRef(null);
  const activeVoices = useRef(new Set());
  const activeLiveVoices = useRef(new Map());
  const noiseBufferRef = useRef(null);
  const shortNoiseBufferRef = useRef(null);
  const settingsRef = useRef({ vol: 0.65, reverb: true, globalOffset: 0, accidentals: {}, tone: 'piano' });

  const cleanupVoice = useCallback((voice) => {
    if (!voice || voice.cleaned) return;
    voice.cleaned = true;
    activeVoices.current.delete(voice);

    try { voice.osc.onended = null; } catch {}
    try { voice.osc.disconnect(); } catch {}
    try { voice.noise?.disconnect(); } catch {}
    try { voice.noiseGain?.disconnect(); } catch {}
    try { voice.filter?.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
  }, []);

  const releaseVoice = useCallback((voice, releaseStartTime, stopAtTime) => {
    if (!voice || voice.cleaned) return;
    if (voice.releasing) return;
    voice.releasing = true;

    try {
      voice.gain.gain.cancelScheduledValues(releaseStartTime);
      const currentGain = Math.max(voice.gain.gain.value, 0.0001);
      voice.gain.gain.setValueAtTime(currentGain, releaseStartTime);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, stopAtTime);
    } catch {}

    try {
      voice.osc.stop(stopAtTime);
    } catch {}

    if (voice.noise) {
      try {
        voice.noise.stop(Math.max(releaseStartTime, stopAtTime - 0.02));
      } catch {}
    }
  }, []);

  useEffect(() => () => {
    activeVoices.current.forEach((voice) => cleanupVoice(voice));
    if (audioCtx.current && audioCtx.current.state !== 'closed') {
      audioCtx.current.close().catch(console.error);
    }
  }, [cleanupVoice]);

  const updateSettings = useCallback((newSettings) => {
    settingsRef.current = { ...settingsRef.current, ...newSettings };
    if (masterGain.current && audioCtx.current) {
      masterGain.current.gain.setTargetAtTime(settingsRef.current.vol, audioCtx.current.currentTime, 0.05);
    }
    if (reverbBus.current && audioCtx.current) {
      reverbBus.current.gain.setTargetAtTime(settingsRef.current.reverb ? 1 : 0, audioCtx.current.currentTime, 0.1);
    }
  }, []);

  const setupAudio = useCallback(async () => {
    if (!audioCtx.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ac = new AudioContextClass();
      audioCtx.current = ac;

      const gain = ac.createGain();
      gain.gain.value = settingsRef.current.vol;
      masterGain.current = gain;

      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value = 5;
      comp.ratio.value = 20;
      comp.attack.value = 0.005;
      comp.release.value = 0.1;

      const reverbInput = ac.createGain();
      reverbInput.gain.value = 1;

      const convolver = ac.createConvolver();
      convolver.buffer = createImpulseResponse(ac, 2.8, 2.6);

      const reverbTone = ac.createBiquadFilter();
      reverbTone.type = 'lowpass';
      reverbTone.frequency.value = 4600;
      reverbTone.Q.value = 0.4;

      const reverbOutput = ac.createGain();
      reverbOutput.gain.value = settingsRef.current.reverb ? 1 : 0;
      reverbBus.current = reverbOutput;

      reverbInput.connect(convolver);
      convolver.connect(reverbTone);
      reverbTone.connect(reverbOutput);
      reverbOutput.connect(comp);
      gain.connect(comp);
      gain.connect(reverbInput);
      comp.connect(ac.destination);

      const buffer1 = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.06), ac.sampleRate);
      const data1 = buffer1.getChannelData(0);
      for (let i = 0; i < data1.length; i += 1) data1[i] = (Math.random() * 2 - 1) * (1 - i / data1.length);
      noiseBufferRef.current = buffer1;

      const buffer2 = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.015), ac.sampleRate);
      const data2 = buffer2.getChannelData(0);
      for (let i = 0; i < data2.length; i += 1) data2[i] = (Math.random() * 2 - 1) * 0.08;
      shortNoiseBufferRef.current = buffer2;
    }
    if (audioCtx.current.state === 'suspended') {
      try {
        await audioCtx.current.resume();
      } catch (error) {
        console.warn('AudioContext resume failed', error);
      }
    }
  }, []);

  const getToneConfig = useCallback((tone, durationSec) => {
    const baseDur = durationSec !== null ? durationSec : 0.5;
    switch (tone) {
      case 'piano':
        return { type: 'sawtooth', dur: 3.5, atk: 0.01, dec: 0.8, sus: 0.1, pk: 0.6, flt: true, fltStartMult: 5.0, fltEndMult: 1.0, fltDec: 0.2, nBuf: null };
      case 'flute':
        return { type: 'sine', dur: 2.5, atk: 0.08, dec: 0.2, sus: 0.8, pk: 0.7, flt: false, nBuf: noiseBufferRef.current, nDur: 0.8, nVol: 0.015 };
      case 'lyre-long':
      case 'lyre':
        return { type: 'sawtooth', dur: 4.0, atk: 0.015, dec: 0.6, sus: 0.1, pk: 0.4, flt: true, fltStartMult: 6, fltEndMult: 1.2, fltDec: 0.4, nBuf: noiseBufferRef.current, nDur: 0.05, nVol: 0.08 };
      case 'lyre-short':
        return { type: 'sawtooth', dur: Math.max(baseDur * 2.0, 0.8), atk: 0.015, dec: 0.1, sus: 0.001, pk: 0.4, flt: true, fltStartMult: 6, fltEndMult: 1.2, fltDec: 0.3, nBuf: noiseBufferRef.current, nDur: 0.06, nVol: 0.1 };
      case 'tongue-drum':
        return { type: 'triangle', dur: 3.0, atk: 0.02, dec: 0.5, sus: 0.2, pk: 0.6, flt: true, fltStartMult: 3.0, fltEndMult: 1.0, fltDec: 0.6, nBuf: noiseBufferRef.current, nDur: 0.03, nVol: 0.05 };
      default:
        return { type: 'triangle', dur: Math.max(baseDur * 1.5, 0.6), atk: 0.015, dec: 0.1, sus: 0.001, pk: 0.4, flt: false, nBuf: shortNoiseBufferRef.current, nDur: 0.015, nVol: 0.15 };
    }
  }, []);

  const createVoice = useCallback((keyInfo, velocity = 0.8, startTime, durationSec = null, sustain = false) => {
    const ctx = audioCtx.current;
    if (!ctx || ctx.state !== 'running') return null;

    const { globalOffset, accidentals, tone } = settingsRef.current;
    const freqRatio = SEMITONE_RATIOS[globalOffset + (accidentals[keyInfo.k] || 0) + 30];
    const freq = keyInfo.f * freqRatio;
    const keyGainMod = Math.min(1.0, 800 / (freq + 200));
    const config = getToneConfig(tone, durationSec);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const finalPeak = velocity * config.pk * keyGainMod;

    osc.type = config.type;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(finalPeak, startTime + config.atk);
    const sustainGain = Math.max(finalPeak * config.sus, 0.001);
    gain.gain.exponentialRampToValueAtTime(sustainGain, startTime + config.dec);
    if (!sustain) {
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + config.dur);
    }
    osc.frequency.setValueAtTime(freq, startTime);

    let filter = null;
    if (config.flt) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(freq * config.fltStartMult, 20000), startTime);
      filter.frequency.exponentialRampToValueAtTime(Math.max(freq * config.fltEndMult, 100), startTime + config.fltDec);
    }

    let noise = null;
    let noiseGain = null;
    if (config.nBuf) {
      noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, startTime);
      noiseGain.gain.linearRampToValueAtTime(config.nVol * velocity, startTime + 0.002);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + config.nDur);
      noise = ctx.createBufferSource();
      noise.buffer = config.nBuf;
    }

    if (config.flt) {
      osc.connect(filter);
      if (noise) noise.connect(noiseGain).connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
      if (noise) noise.connect(noiseGain).connect(gain);
    }

    gain.connect(masterGain.current);

    const endTime = sustain ? Number.POSITIVE_INFINITY : startTime + config.dur;
    const voice = {
      key: keyInfo.k,
      noteName: keyInfo.n,
      frequency: freq,
      osc,
      gain,
      filter,
      noise,
      noiseGain,
      endTime,
      cleaned: false,
      releasing: false,
    };

    osc.onended = () => cleanupVoice(voice);

    activeVoices.current.add(voice);
    osc.start(startTime);
    if (noise) {
      noise.start(startTime);
      try {
        noise.stop(Math.min(endTime, startTime + config.nDur + 0.02));
      } catch {}
    }
    if (!sustain) osc.stop(endTime);

    return voice;
  }, [cleanupVoice, getToneConfig]);

  const triggerNote = useCallback((keyInfo, velocity = 0.8, absoluteTime = null, durationSec = null) => {
    const ctx = audioCtx.current;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    let startTime = absoluteTime !== null ? absoluteTime : now;
    if (startTime < now) startTime = now + 0.005;

    activeVoices.current.forEach((voice) => {
      if (voice.key === keyInfo.k && voice.endTime > startTime) {
        const fadeStart = Math.max(now, startTime - 0.03);
        releaseVoice(voice, fadeStart, fadeStart + 0.05);
      }
    });

    if (activeVoices.current.size > 48) {
      const oldestVoices = Array.from(activeVoices.current)
        .sort((left, right) => left.endTime - right.endTime)
        .slice(0, activeVoices.current.size - 48);

      oldestVoices.forEach((voice) => {
        const killTime = now + 0.015;
        releaseVoice(voice, killTime, killTime + 0.05);
      });
    }

    createVoice(keyInfo, velocity, startTime, durationSec, false);
  }, [createVoice, releaseVoice]);

  const playLiveNote = useCallback((keyInfo, velocity = 0.9) => {
    const ctx = audioCtx.current;
    if (!ctx || ctx.state !== 'running') return null;
    if (activeLiveVoices.current.has(keyInfo.k)) return activeLiveVoices.current.get(keyInfo.k);

    const startTime = ctx.currentTime + 0.005;
    const voice = createVoice(keyInfo, velocity, startTime, null, true);
    if (!voice) return null;

    activeLiveVoices.current.set(keyInfo.k, voice);
    return voice;
  }, [createVoice]);

  const releaseLiveNote = useCallback((keyK) => {
    const ctx = audioCtx.current;
    const voice = activeLiveVoices.current.get(keyK);
    if (!ctx || !voice) return;

    activeLiveVoices.current.delete(keyK);
    const releaseStartTime = ctx.currentTime;
    const stopAtTime = releaseStartTime + 0.08;
    voice.endTime = stopAtTime;
    releaseVoice(voice, releaseStartTime, stopAtTime);
  }, [releaseVoice]);

  const stopAllNodes = useCallback(() => {
    const ctx = audioCtx.current;
    if (!ctx) return;

    const stopTime = ctx.currentTime + 0.08;
    activeLiveVoices.current.clear();
    activeVoices.current.forEach((voice) => {
      releaseVoice(voice, ctx.currentTime, stopTime);
    });
  }, [releaseVoice]);

  return { audioCtx, setupAudio, triggerNote, playLiveNote, releaseLiveNote, stopAllNodes, updateSettings };
}
