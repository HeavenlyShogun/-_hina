import { useCallback, useEffect, useRef } from 'react';

const SEMITONE_RATIOS = new Float32Array(61);
for (let i = -30; i <= 30; i += 1) SEMITONE_RATIOS[i + 30] = 2 ** (i / 12);

export function useAudioEngine() {
  const audioCtx = useRef(null);
  const masterGain = useRef(null);
  const reverbBus = useRef(null);
  const activeVoices = useRef([]);
  const noiseBufferRef = useRef(null);
  const shortNoiseBufferRef = useRef(null);
  const settingsRef = useRef({ vol: 0.65, reverb: true, globalOffset: 0, accidentals: {}, tone: 'piano' });

  useEffect(() => () => {
    if (audioCtx.current && audioCtx.current.state !== 'closed') {
      audioCtx.current.close().catch(console.error);
    }
  }, []);

  const updateSettings = useCallback((newSettings) => {
    settingsRef.current = { ...settingsRef.current, ...newSettings };
    if (masterGain.current && audioCtx.current) {
      masterGain.current.gain.setTargetAtTime(settingsRef.current.vol, audioCtx.current.currentTime, 0.05);
    }
    if (reverbBus.current && audioCtx.current) {
      reverbBus.current.gain.setTargetAtTime(settingsRef.current.reverb ? 0.45 : 0, audioCtx.current.currentTime, 0.1);
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

      const rev = ac.createGain();
      rev.gain.value = settingsRef.current.reverb ? 0.45 : 0;
      reverbBus.current = rev;

      const delay = ac.createDelay();
      delay.delayTime.value = 0.15;
      const feedback = ac.createGain();
      feedback.gain.value = 0.15;
      const filter = ac.createBiquadFilter();
      filter.frequency.value = 1500;

      rev.connect(delay);
      delay.connect(feedback);
      feedback.connect(filter);
      filter.connect(delay);
      filter.connect(comp);
      gain.connect(comp);
      gain.connect(rev);
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

  const triggerNote = useCallback((keyInfo, velocity = 0.8, absoluteTime = null, durationSec = null) => {
    const ctx = audioCtx.current;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    let startTime = absoluteTime !== null ? absoluteTime : now;
    if (startTime < now) startTime = now + 0.005;

    activeVoices.current = activeVoices.current.filter((voice) => {
      if (voice.key === keyInfo.k && voice.endTime > startTime) {
        const fadeStart = Math.max(now, startTime - 0.03);
        try {
          voice.g.gain.cancelScheduledValues(fadeStart);
          voice.g.gain.setTargetAtTime(0, fadeStart, 0.01);
          voice.osc.stop(fadeStart + 0.05);
        } catch {}
        return false;
      }
      return true;
    });

    if (activeVoices.current.length > 48) {
      activeVoices.current.sort((left, right) => left.endTime - right.endTime);
      const toKill = activeVoices.current.splice(0, activeVoices.current.length - 48);
      toKill.forEach((voice) => {
        try {
          const killTime = now + 0.015;
          voice.g.gain.cancelScheduledValues(killTime);
          voice.g.gain.setTargetAtTime(0, killTime, 0.01);
          voice.osc.stop(killTime + 0.05);
        } catch {}
      });
    }

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
    gain.gain.exponentialRampToValueAtTime(Math.max(finalPeak * config.sus, 0.001), startTime + config.dec);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + config.dur);
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
    osc.start(startTime);
    if (noise) noise.start(startTime);

    const endTime = startTime + config.dur;
    osc.stop(endTime);

    const voiceObj = { key: keyInfo.k, osc, g: gain, filter, endTime };
    activeVoices.current.push(voiceObj);

    setTimeout(() => {
      activeVoices.current = activeVoices.current.filter((voice) => voice !== voiceObj);
      try {
        osc.disconnect();
        if (filter) filter.disconnect();
        gain.disconnect();
        if (noise) noise.disconnect();
      } catch {}
    }, (config.dur + 0.1) * 1000);
  }, [getToneConfig]);

  const stopAllNodes = useCallback(() => {
    activeVoices.current.forEach((voice) => {
      try {
        voice.g.gain.cancelScheduledValues(audioCtx.current.currentTime);
        voice.g.gain.setTargetAtTime(0, audioCtx.current.currentTime, 0.015);
        voice.osc.stop(audioCtx.current.currentTime + 0.08);
        setTimeout(() => {
          try {
            voice.osc.disconnect();
            voice.g.disconnect();
          } catch {}
        }, 100);
      } catch {}
    });
    activeVoices.current = [];
  }, []);

  return { audioCtx, setupAudio, triggerNote, stopAllNodes, updateSettings };
}
