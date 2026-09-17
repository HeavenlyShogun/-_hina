import { DEFAULT_SCORE_PARAMS, KEY_INFO_MAP } from '../constants/music';
import { normalizeScoreSource } from '../utils/score';

const TAIL_SECONDS = 1.2;
const MIN_DURATION_SECONDS = 0.08;

function getOfflineAudioContext(duration, sampleRate) {
  const OfflineContext = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error('This browser does not support OfflineAudioContext.');
  return new OfflineContext(2, Math.ceil(duration * sampleRate), sampleRate);
}

function frequencyForEvent(event, globalKeyOffset, accidentals) {
  const fromEvent = Number(event?.frequency);
  const fromKey = KEY_INFO_MAP[event?.k]?.f;
  const base = Number.isFinite(fromEvent) ? fromEvent : fromKey;
  if (!Number.isFinite(base) || base <= 0) return null;
  return base * 2 ** ((Number(globalKeyOffset) + (accidentals?.[event?.k] ? 1 : 0)) / 12);
}

function schedulePluckedNote(context, destination, event, options) {
  const frequency = frequencyForEvent(event, options.globalKeyOffset, options.accidentals);
  if (!frequency) return;
  const start = Math.max(Number(event.time) || 0, 0);
  const duration = Math.max(Number(event.playDurationSec ?? event.durationSec) || 0, MIN_DURATION_SECONDS);
  const stopAt = start + duration + 0.08;
  const velocity = Math.min(1, Math.max(0.04, Number(event.v) || 0.85));
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const harmonic = context.createOscillator();
  const harmonicGain = context.createGain();
  const releaseStart = Math.max(start + 0.025, start + duration * 0.72);
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, start);
  harmonic.type = 'sine';
  harmonic.frequency.setValueAtTime(frequency * 2, start);
  harmonicGain.gain.setValueAtTime(0.18, start);
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(start + 0.35, stopAt));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.19 * velocity, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.012 * velocity, 0.0001), releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
  oscillator.connect(gain);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(gain);
  gain.connect(destination);
  oscillator.start(start); harmonic.start(start);
  oscillator.stop(stopAt); harmonic.stop(stopAt);
}

function audioBufferToWav(buffer) {
  const channels = Math.min(buffer.numberOfChannels, 2);
  const frameCount = buffer.length;
  const blockAlign = channels * 2;
  const output = new ArrayBuffer(44 + frameCount * blockAlign);
  const view = new DataView(output);
  const writeText = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeText(0, 'RIFF'); view.setUint32(4, 36 + frameCount * blockAlign, true);
  writeText(8, 'WAVE'); writeText(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, frameCount * blockAlign, true);
  const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    channelData.forEach((data) => {
      const sample = Math.max(-1, Math.min(1, data[frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    });
  }
  return new Blob([output], { type: 'audio/wav' });
}

/** Render the supplied score with browser-native synthesis and return a WAV Blob. */
export async function renderScoreToWav(score, options = {}) {
  if (typeof window === 'undefined') throw new Error('WAV rendering is only available in a browser.');
  const normalized = normalizeScoreSource(score, {
    bpm: options.bpm ?? DEFAULT_SCORE_PARAMS.bpm,
    timeSigNum: options.timeSigNum ?? DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: options.timeSigDen ?? DEFAULT_SCORE_PARAMS.timeSigDen,
    charResolution: options.charResolution ?? DEFAULT_SCORE_PARAMS.charResolution,
    globalKeyOffset: options.globalKeyOffset ?? DEFAULT_SCORE_PARAMS.globalKeyOffset,
  });
  const events = normalized.events.filter((event) => !event.isRest);
  if (!events.length) throw new Error('The current score has no playable notes.');
  const endTime = events.reduce((end, event) => Math.max(end, (event.time || 0) + (event.durationSec || 0)), 0);
  const context = getOfflineAudioContext(Math.max(endTime + TAIL_SECONDS, 1), options.sampleRate ?? 44100);
  const master = context.createGain();
  master.gain.value = Math.min(1, Math.max(0.05, Number(options.gain) || 0.72));
  master.connect(context.destination);
  events.forEach((event) => schedulePluckedNote(context, master, event, options));
  return audioBufferToWav(await context.startRendering());
}

export async function downloadTrack01Wav(score, options = {}) {
  const blob = await renderScoreToWav(score, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'TRACK01.WAV';
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return blob;
}
