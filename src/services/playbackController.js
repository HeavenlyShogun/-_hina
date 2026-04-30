import audioEngine from './audioEngine';
import { KEY_INFO_MAP } from '../constants/music';
import { PPQ } from '../utils/score';

const LOOKAHEAD_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.12;
const PLAY_START_DELAY_SEC = 0.3;
const STOP_TAIL_SEC = 0.12;
const MAX_VISUAL_HOLD_SEC = 0.2;
const DEFAULT_BPM = 120;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function transposeFrequency(baseFrequency, semitoneOffset) {
  return baseFrequency * 2 ** (semitoneOffset / 12);
}

function normalizePlaybackRate(rate) {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return 1;
  }

  return clamp(numericRate, 0.25, 4);
}

function createTimingModel(playback = {}) {
  const bpm = Math.max(Number(playback?.bpm) || DEFAULT_BPM, 1);
  const resolution = Math.max(Number(playback?.resolution) || PPQ, 1);
  const secondsPerTick = (60 / bpm) / resolution;

  return {
    bpm,
    resolution,
    secondsPerTick,
  };
}

function ticksToSeconds(ticks, timing) {
  return Math.max(Number(ticks) || 0, 0) * timing.secondsPerTick;
}

function secondsToTicks(seconds, timing) {
  return Math.max(Number(seconds) || 0, 0) / timing.secondsPerTick;
}

function roundTick(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeEvents(events, timing) {
  if (!Array.isArray(events)) {
    return [];
  }

  return [...events]
    .map((event, index) => {
      const rawTick = Number(event?.tick);
      const rawTime = Number(event?.time);
      const tick = Number.isFinite(rawTick)
        ? roundTick(rawTick)
        : roundTick(secondsToTicks(rawTime, timing));
      const time = ticksToSeconds(tick, timing);
      const rawDurationTicks = Number(event?.durationTick ?? event?.durationTicks ?? event?.duration);
      const durationTicks = Math.max(
        Number.isFinite(rawDurationTicks)
          ? roundTick(rawDurationTicks)
          : roundTick(secondsToTicks(Number(event?.durationSec) || 0.1, timing)),
        1,
      );
      const durationSec = Math.max(ticksToSeconds(durationTicks, timing), 0.02);

      if (!Number.isFinite(time) || time < 0 || !Number.isFinite(tick) || tick < 0) {
        return null;
      }

      return {
        id: event?.id ?? `event-${index}`,
        time,
        tick,
        durationSec,
        durationTicks,
        k: event?.k ?? event?.key ?? null,
        isRest: Boolean(event?.isRest || event?.type === 'rest'),
        v: Number.isFinite(Number(event?.v)) ? Number(event.v) : 0.85,
        importance: Number.isFinite(Number(event?.importance)) ? Number(event.importance) : 100,
        trackId: event?.trackId ?? 'main',
        frequency: Number.isFinite(Number(event?.frequency)) ? Number(event.frequency) : null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.tick !== right.tick) {
        return left.tick - right.tick;
      }

      return String(left.k ?? '').localeCompare(String(right.k ?? ''));
    });
}

class PlaybackController {
  constructor(engine = audioEngine) {
    this.audioEngine = engine;
    this.events = [];
    this.maxTime = 0;
    this.maxTick = 0;
    this.playbackEndTick = 0;
    this.currentPointer = 0;
    this.currentAudioTime = 0;
    this.timing = createTimingModel();
    this.transport = this.createTransportState();
    this.snapshot = this.createSnapshot();
    this.callbacks = {
      onVisualAttack: null,
      onVisualRelease: null,
      onVisualReset: null,
      onProgressUpdate: null,
      onStateChange: null,
    };
    this.schedulerTimer = null;
    this.visualFrame = null;
    this.visualAttackIndex = 0;
    this.visualReleaseIndex = 0;
    this.activeVisualCounts = new Map();
  }

  createTransportState() {
    return {
      status: 'stopped',
      currentTick: 0,
      currentTime: 0,
      anchorAudioTime: 0,
      anchorTick: 0,
      anchorScoreTime: 0,
      playbackRate: 1,
      generation: 0,
    };
  }

  createSnapshot(overrides = {}) {
    return {
      tone: 'piano',
      vol: 0.65,
      reverb: true,
      globalKeyOffset: 0,
      accidentals: {},
      ...overrides,
    };
  }

  updateSnapshot(snapshotPatch = {}) {
    this.snapshot = this.createSnapshot({
      ...this.snapshot,
      ...snapshotPatch,
    });

    return this.snapshot;
  }

  load(events, maxTime = 0, playback = {}) {
    this.stop({ preserveLoadedEvents: false });

    this.timing = createTimingModel(playback);
    this.events = normalizeEvents(events, this.timing);
    const eventEndTick = this.events.reduce(
      (result, event) => Math.max(result, event.tick + event.durationTicks),
      0,
    );
    this.playbackEndTick = Math.max(
      roundTick(Number(playback?.contentEndTick)),
      roundTick(secondsToTicks(maxTime, this.timing)),
      this.events.reduce((result, event) => Math.max(result, event.tick), 0),
    );
    this.maxTick = Math.max(this.playbackEndTick, 0);
    this.maxTime = Math.max(Number(maxTime) || 0, ticksToSeconds(this.maxTick, this.timing));
    this.eventTailTick = Math.max(eventEndTick, this.playbackEndTick);
    this.currentPointer = 0;
    this.currentAudioTime = 0;
    this.transport = {
      ...this.transport,
      status: 'stopped',
      currentTick: 0,
      currentTime: 0,
      anchorAudioTime: 0,
      anchorTick: 0,
      anchorScoreTime: 0,
    };

    this.resetVisualState({ fromTick: 0, emitReset: true });
    this.emitProgress();
    this.emitState();

    return this.getState();
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = {
      ...this.callbacks,
      ...callbacks,
    };

    return () => {
      Object.keys(callbacks).forEach((key) => {
        if (this.callbacks[key] === callbacks[key]) {
          this.callbacks[key] = null;
        }
      });
    };
  }

  getState() {
    const currentTick = this.getCurrentTick();
    const currentTime = this.getCurrentTime();
    const progress = this.maxTime > 0 ? clamp((currentTime / this.maxTime) * 100, 0, 100) : 0;

    return {
      status: this.transport.status,
      isPlaying: this.transport.status === 'playing',
      isPaused: this.transport.status === 'paused',
      generation: this.transport.generation,
      currentTick,
      currentTime,
      currentPointer: this.currentPointer,
      currentAudioTime: this.currentAudioTime,
      maxTick: this.maxTick,
      maxTime: this.maxTime,
      progress,
      playbackRate: this.transport.playbackRate,
      eventsCount: this.events.length,
    };
  }

  getCurrentTick() {
    if (this.transport.status !== 'playing') {
      return clamp(this.transport.currentTick, 0, this.maxTick);
    }

    const now = this.audioEngine.getCurrentTime();
    const elapsedAudio = Math.max(0, now - this.transport.anchorAudioTime);
    const elapsedTicks = secondsToTicks(elapsedAudio * this.transport.playbackRate, this.timing);

    return clamp(this.transport.anchorTick + elapsedTicks, 0, this.maxTick);
  }

  getCurrentTime() {
    return clamp(ticksToSeconds(this.getCurrentTick(), this.timing), 0, this.maxTime);
  }

  getEventEndTick(event) {
    return event.tick + event.durationTicks;
  }

  getScheduledDurationSec(event, startTick = event.tick) {
    const remainingTicks = Math.max(this.getEventEndTick(event) - startTick, 0);
    if (remainingTicks <= 0) {
      return 0;
    }

    return Math.max(
      ticksToSeconds(remainingTicks, this.timing) / this.transport.playbackRate,
      0.02,
    );
  }

  getEventAbsoluteTime(scoreTick) {
    return (
      this.transport.anchorAudioTime +
      ticksToSeconds(scoreTick - this.transport.anchorTick, this.timing) / this.transport.playbackRate
    );
  }

  async play(_audioContext = null, snapshot = null) {
    if (!this.events.length) {
      return this.getState();
    }

    if (snapshot) {
      this.snapshot = this.createSnapshot({
        ...this.snapshot,
        ...snapshot,
      });
    }

    if (this.transport.status === 'playing') {
      return this.getState();
    }

    await this.audioEngine.resume();

    const startTick = this.transport.status === 'paused' ? this.transport.currentTick : this.transport.currentTick || 0;
    const generation = this.bumpTransportGeneration();
    this.audioEngine.stopAll();
    this.currentPointer = this.findNextEventIndex(startTick);
    this.resetVisualState({ fromTick: startTick, emitReset: true });
    this.startTransport(startTick, generation);
    this.startLoops(generation);
    this.emitProgress();
    this.emitState();

    return this.getState();
  }

  pause() {
    if (this.transport.status !== 'playing') {
      return this.getState();
    }

    const pausedTick = this.getCurrentTick();
    const pausedTime = ticksToSeconds(pausedTick, this.timing);
    const generation = this.bumpTransportGeneration();
    this.stopLoops();
    this.audioEngine.stopAll();
    this.releaseAllVisuals();

    this.transport = {
      ...this.transport,
      status: 'paused',
      currentTick: pausedTick,
      currentTime: pausedTime,
      anchorAudioTime: 0,
      anchorTick: pausedTick,
      anchorScoreTime: pausedTime,
      generation,
    };
    this.currentPointer = this.findNextEventIndex(pausedTick);
    this.currentAudioTime = 0;
    this.resetVisualState({ fromTick: pausedTick });
    this.emitProgress();
    this.emitState();

    return this.getState();
  }

  async resume(snapshot = null) {
    if (snapshot) {
      this.snapshot = this.createSnapshot({
        ...this.snapshot,
        ...snapshot,
      });
    }

    if (this.transport.status !== 'paused') {
      return this.getState();
    }

    return this.play(null, this.snapshot);
  }

  async seek(targetTimeOrIndex, snapshot = null) {
    if (snapshot) {
      this.snapshot = this.createSnapshot({
        ...this.snapshot,
        ...snapshot,
      });
    }

    const wasPlaying = this.transport.status === 'playing';
    const targetTick = this.resolveSeekTick(targetTimeOrIndex);
    const targetTime = ticksToSeconds(targetTick, this.timing);
    const generation = this.bumpTransportGeneration();

    this.stopLoops();
    this.audioEngine.stopAll();
    this.releaseAllVisuals();

    this.currentPointer = this.findNextEventIndex(targetTick);
    this.currentAudioTime = 0;
    this.transport = {
      ...this.transport,
      currentTick: targetTick,
      currentTime: targetTime,
      anchorAudioTime: 0,
      anchorTick: targetTick,
      anchorScoreTime: targetTime,
      status: this.events.length ? 'paused' : 'stopped',
      generation,
    };
    this.resetVisualState({ fromTick: targetTick, emitReset: true });
    this.emitProgress();

    if (wasPlaying && this.events.length) {
      await this.audioEngine.resume();
      this.startTransport(targetTick, generation);
      this.startLoops(generation);
    }

    this.emitState();
    return this.getState();
  }

  stop(options = {}) {
    const { preserveLoadedEvents = true } = options;

    const generation = this.bumpTransportGeneration();
    this.stopLoops();
    this.audioEngine.stopAll();
    this.releaseAllVisuals();

    this.transport = {
      ...this.transport,
      status: 'stopped',
      currentTick: 0,
      currentTime: 0,
      anchorAudioTime: 0,
      anchorTick: 0,
      anchorScoreTime: 0,
      generation,
    };
    this.currentPointer = 0;
    this.currentAudioTime = 0;
    this.resetVisualState({ fromTick: 0, emitReset: true });

    if (!preserveLoadedEvents) {
      this.events = [];
      this.maxTick = 0;
      this.playbackEndTick = 0;
      this.eventTailTick = 0;
      this.maxTime = 0;
      this.timing = createTimingModel();
    }

    this.emitProgress();
    this.emitState();
    return this.getState();
  }

  async setPlaybackRate(nextRate) {
    const playbackRate = normalizePlaybackRate(nextRate);
    if (playbackRate === this.transport.playbackRate) {
      return this.getState();
    }

    const currentTick = this.getCurrentTick();
    const currentTime = ticksToSeconds(currentTick, this.timing);
    const wasPlaying = this.transport.status === 'playing';
    const generation = this.bumpTransportGeneration();

    this.transport = {
      ...this.transport,
      playbackRate,
      currentTick,
      currentTime,
      anchorAudioTime: 0,
      anchorTick: currentTick,
      anchorScoreTime: currentTime,
      status: wasPlaying ? 'paused' : this.transport.status,
      generation,
    };
    this.currentPointer = this.findNextEventIndex(currentTick);
    this.currentAudioTime = 0;
    this.resetVisualState({ fromTick: currentTick });

    if (wasPlaying) {
      await this.seek({ tick: currentTick }, this.snapshot);
      return this.getState();
    }

    this.emitProgress();
    this.emitState();
    return this.getState();
  }

  startTransport(startTick, generation = this.transport.generation) {
    const anchorAudioTime = this.audioEngine.getCurrentTime() + PLAY_START_DELAY_SEC;
    const anchorScoreTime = ticksToSeconds(startTick, this.timing);

    this.transport = {
      ...this.transport,
      status: 'playing',
      currentTick: startTick,
      currentTime: anchorScoreTime,
      anchorAudioTime,
      anchorTick: startTick,
      anchorScoreTime,
      generation,
    };
    this.currentAudioTime = anchorAudioTime;
  }

  startLoops(generation = this.transport.generation) {
    this.stopLoops();
    this.schedulerTick(generation);
    this.visualTick(generation);
  }

  stopLoops() {
    if (this.schedulerTimer !== null) {
      window.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    if (this.visualFrame !== null) {
      window.cancelAnimationFrame(this.visualFrame);
      this.visualFrame = null;
    }
  }

  schedulerTick(generation = this.transport.generation) {
    if (this.transport.status !== 'playing' || generation !== this.transport.generation) {
      return;
    }

    const nowAudioTime = this.audioEngine.getCurrentTime();
    const nowTick = this.getCurrentTick();
    const nowScoreTime = ticksToSeconds(nowTick, this.timing);
    const lookaheadTicks = secondsToTicks(SCHEDULE_AHEAD_SEC * this.transport.playbackRate, this.timing);
    const scheduleUntilTick = nowTick + lookaheadTicks;

    while (this.currentPointer < this.events.length) {
      const event = this.events[this.currentPointer];
      if (event.tick > scheduleUntilTick) {
        break;
      }

      const scheduleStartTick = Math.max(event.tick, this.transport.anchorTick);
      const absoluteTime = this.getEventAbsoluteTime(scheduleStartTick);
      const durationSec = this.getScheduledDurationSec(event, scheduleStartTick);

      if (absoluteTime >= nowAudioTime - 0.001 && durationSec > 0) {
        this.scheduleEvent(event, absoluteTime, durationSec);
      }

      this.currentPointer += 1;
    }

    this.transport = {
      ...this.transport,
      currentTick: nowTick,
      currentTime: nowScoreTime,
    };
    this.currentAudioTime = nowAudioTime;

    const playbackEndAudioTime = this.getEventAbsoluteTime(this.eventTailTick) + STOP_TAIL_SEC;
    if (this.currentPointer >= this.events.length && nowAudioTime >= playbackEndAudioTime) {
      this.finishPlayback();
      return;
    }

    this.emitProgress();
    this.schedulerTimer = window.setTimeout(() => {
      this.schedulerTick(generation);
    }, LOOKAHEAD_INTERVAL_MS);
  }

  visualTick(generation = this.transport.generation) {
    if (this.transport.status !== 'playing' || generation !== this.transport.generation) {
      return;
    }

    const nowTick = this.getCurrentTick();

    while (
      this.visualAttackIndex < this.events.length &&
      this.events[this.visualAttackIndex].tick <= nowTick
    ) {
      const event = this.events[this.visualAttackIndex];
      this.visualAttackIndex += 1;

      if (!event.k) {
        continue;
      }

      this.activeVisualCounts.set(event.k, (this.activeVisualCounts.get(event.k) ?? 0) + 1);
      this.callbacks.onVisualAttack?.(event.k, event);
    }

    while (
      this.visualReleaseIndex < this.events.length &&
      this.getVisualOffTick(this.events[this.visualReleaseIndex]) <= nowTick
    ) {
      const event = this.events[this.visualReleaseIndex];
      this.visualReleaseIndex += 1;

      if (!event.k) {
        continue;
      }

      const nextCount = (this.activeVisualCounts.get(event.k) ?? 1) - 1;
      if (nextCount <= 0) {
        this.activeVisualCounts.delete(event.k);
        this.callbacks.onVisualRelease?.(event.k, event);
      } else {
        this.activeVisualCounts.set(event.k, nextCount);
      }
    }

    this.emitProgress();
    this.visualFrame = window.requestAnimationFrame(() => {
      this.visualTick(generation);
    });
  }

  finishPlayback() {
    const generation = this.bumpTransportGeneration();
    this.stopLoops();
    this.audioEngine.stopAll();
    this.releaseAllVisuals();

    this.transport = {
      ...this.transport,
      status: 'stopped',
      currentTick: 0,
      currentTime: 0,
      anchorAudioTime: 0,
      anchorTick: 0,
      anchorScoreTime: 0,
      generation,
    };
    this.currentPointer = 0;
    this.currentAudioTime = 0;
    this.resetVisualState({ fromTick: 0, emitReset: true });
    this.emitProgress();
    this.emitState();
  }

  scheduleEvent(event, absoluteTime, durationSec = event.durationSec) {
    if (event?.isRest) {
      return;
    }

    const frequency = this.resolveEventFrequency(event);
    if (!Number.isFinite(frequency) || frequency <= 0) {
      return;
    }

    this.audioEngine.scheduleNote(frequency, absoluteTime, durationSec, {
      tone: this.snapshot.tone,
      mode: 'scheduled',
      importance: event.importance ?? 100,
      outputGain: this.snapshot.vol,
      reverb: this.snapshot.reverb,
      velocity: event.v ?? 0.85,
    });
  }

  resolveEventFrequency(event) {
    if (Number.isFinite(event.frequency) && event.frequency > 0) {
      return event.frequency;
    }

    const keyInfo = event.k ? KEY_INFO_MAP[event.k] : null;
    if (!keyInfo) {
      return NaN;
    }

    const globalOffset = Number(this.snapshot.globalKeyOffset || 0);
    const accidentalOffset = this.snapshot.accidentals?.[event.k] ? 1 : 0;

    return transposeFrequency(keyInfo.f, globalOffset + accidentalOffset);
  }

  resolveSeekTick(target) {
    if (this.maxTick <= 0) {
      return 0;
    }

    if (typeof target === 'number') {
      return clamp(roundTick(secondsToTicks(target, this.timing)), 0, this.maxTick);
    }

    if (target && typeof target === 'object') {
      if (Number.isFinite(Number(target.tick))) {
        return clamp(roundTick(Number(target.tick)), 0, this.maxTick);
      }

      if (Number.isFinite(Number(target.time))) {
        return clamp(roundTick(secondsToTicks(Number(target.time), this.timing)), 0, this.maxTick);
      }

      if (Number.isFinite(Number(target.index))) {
        const index = clamp(Math.floor(Number(target.index)), 0, this.events.length);
        if (index >= this.events.length) {
          return this.maxTick;
        }

        return clamp(this.events[index].tick, 0, this.maxTick);
      }
    }

    return 0;
  }

  findNextEventIndex(scoreTick) {
    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index];
      if (this.getEventEndTick(event) > scoreTick) {
        return index;
      }
    }

    return this.events.length;
  }

  findVisualAttackIndex(scoreTick) {
    for (let index = 0; index < this.events.length; index += 1) {
      if (this.events[index].tick >= scoreTick) {
        return index;
      }
    }

    return this.events.length;
  }

  findVisualReleaseIndex(scoreTick) {
    for (let index = 0; index < this.events.length; index += 1) {
      if (this.getVisualOffTick(this.events[index]) >= scoreTick) {
        return index;
      }
    }

    return this.events.length;
  }

  getVisualOffTick(event) {
    const visualHoldTick = Math.max(
      1,
      roundTick(secondsToTicks(Math.min(event.durationSec ?? 0.2, MAX_VISUAL_HOLD_SEC), this.timing)),
    );
    return event.tick + visualHoldTick;
  }

  resetVisualState({ fromTick = 0, emitReset = false } = {}) {
    this.visualAttackIndex = this.findVisualAttackIndex(fromTick);
    this.visualReleaseIndex = this.findVisualReleaseIndex(fromTick);
    this.activeVisualCounts.clear();

    if (emitReset) {
      this.callbacks.onVisualReset?.();
    }

    this.events.forEach((event) => {
      if (!event.k) {
        return;
      }

      if (event.tick < fromTick && this.getVisualOffTick(event) > fromTick) {
        this.activeVisualCounts.set(event.k, (this.activeVisualCounts.get(event.k) ?? 0) + 1);
      }
    });

    this.activeVisualCounts.forEach((_, key) => {
      this.callbacks.onVisualAttack?.(key, { resumed: true });
    });
  }

  releaseAllVisuals() {
    if (this.activeVisualCounts.size > 0) {
      this.activeVisualCounts.forEach((_, key) => {
        this.callbacks.onVisualRelease?.(key);
      });
    }

    this.activeVisualCounts.clear();
    this.callbacks.onVisualReset?.();
  }

  emitProgress() {
    const currentTime = this.getCurrentTime();
    const progress = this.maxTime > 0 ? clamp((currentTime / this.maxTime) * 100, 0, 100) : 0;
    this.callbacks.onProgressUpdate?.(progress, currentTime, this.maxTime);
  }

  emitState() {
    this.callbacks.onStateChange?.(this.getState());
  }

  bumpTransportGeneration() {
    return (Number(this.transport.generation) || 0) + 1;
  }
}

export default new PlaybackController();
