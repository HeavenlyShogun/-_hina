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

function noteNameToFrequency(noteName) {
  const match = /^([A-G])([#b]?)(-?\d+)$/u.exec(String(noteName || ''));
  if (!match) {
    return NaN;
  }

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
  if (accidental === '#') midi += 1;
  if (accidental === 'b') midi -= 1;
  return 440 * 2 ** ((midi - 69) / 12);
}

function normalizePlaybackRate(rate) {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return 1;
  }

  return clamp(numericRate, 0.25, 4);
}

function normalizeTempoMap(tempoMap, bpm, resolution) {
  const fallbackSecondsPerTick = (60 / bpm) / resolution;
  const normalized = (Array.isArray(tempoMap) ? tempoMap : [])
    .map((entry) => {
      const entryBpm = Number(entry?.bpm);
      const beatSeconds = Number(entry?.beatSeconds);
      const secondsPerTick = Number(entry?.secondsPerTick);

      return {
        startTick: roundTick(entry?.startTick),
        secondsPerTick:
          Number.isFinite(secondsPerTick) && secondsPerTick > 0
            ? secondsPerTick
            : Number.isFinite(beatSeconds) && beatSeconds > 0
              ? beatSeconds / resolution
              : Number.isFinite(entryBpm) && entryBpm > 0
                ? (60 / entryBpm) / resolution
                : fallbackSecondsPerTick,
      };
    })
    .filter((entry) => Number.isFinite(entry.secondsPerTick) && entry.secondsPerTick > 0)
    .sort((left, right) => left.startTick - right.startTick);

  if (normalized.length === 0 || normalized[0].startTick !== 0) {
    normalized.unshift({
      startTick: 0,
      secondsPerTick: fallbackSecondsPerTick,
    });
  }

  return normalized.filter((entry, index) => {
    if (index === 0) {
      return true;
    }

    const previous = normalized[index - 1];
    return (
      entry.startTick !== previous.startTick
      || Math.abs(entry.secondsPerTick - previous.secondsPerTick) > 1e-9
    );
  });
}

function createTimingModel(playback = {}) {
  const bpm = Math.max(Number(playback?.bpm) || DEFAULT_BPM, 1);
  const resolution = Math.max(Number(playback?.resolution) || PPQ, 1);
  const secondsPerTick = (60 / bpm) / resolution;
  const tempoMap = normalizeTempoMap(playback?.tempoMap, bpm, resolution);

  return {
    bpm,
    resolution,
    secondsPerTick,
    tempoMap,
  };
}

function findTempoSegmentIndex(scoreTick, timing) {
  const safeTick = Math.max(Number(scoreTick) || 0, 0);
  const tempoMap = Array.isArray(timing?.tempoMap) ? timing.tempoMap : [];

  if (tempoMap.length <= 1) {
    return 0;
  }

  for (let index = tempoMap.length - 1; index >= 0; index -= 1) {
    if (safeTick >= tempoMap[index].startTick) {
      return index;
    }
  }

  return 0;
}

function ticksBetweenToSeconds(startTick, endTick, timing) {
  const safeStartTick = Math.max(Number(startTick) || 0, 0);
  const safeEndTick = Math.max(Number(endTick) || 0, 0);
  if (safeEndTick <= safeStartTick) {
    return 0;
  }

  const tempoMap = Array.isArray(timing?.tempoMap) ? timing.tempoMap : [];
  if (tempoMap.length <= 1) {
    return (safeEndTick - safeStartTick) * timing.secondsPerTick;
  }

  let totalSeconds = 0;
  let currentTick = safeStartTick;
  let tempoIndex = findTempoSegmentIndex(currentTick, timing);

  while (currentTick < safeEndTick) {
    const segment = tempoMap[tempoIndex] ?? tempoMap[tempoMap.length - 1];
    const nextStartTick = tempoMap[tempoIndex + 1]?.startTick ?? Infinity;
    const segmentEndTick = Math.min(safeEndTick, nextStartTick);
    totalSeconds += Math.max(segmentEndTick - currentTick, 0) * segment.secondsPerTick;
    currentTick = segmentEndTick;

    if (currentTick >= nextStartTick) {
      tempoIndex += 1;
    }
  }

  return totalSeconds;
}

function ticksToSeconds(ticks, timing) {
  return ticksBetweenToSeconds(0, ticks, timing);
}

function secondsToTicks(seconds, timing, startTick = 0) {
  const safeSeconds = Math.max(Number(seconds) || 0, 0);
  const safeStartTick = Math.max(Number(startTick) || 0, 0);
  const tempoMap = Array.isArray(timing?.tempoMap) ? timing.tempoMap : [];

  if (tempoMap.length <= 1) {
    return safeSeconds / timing.secondsPerTick;
  }

  let remainingSeconds = safeSeconds;
  let currentTick = safeStartTick;
  let tempoIndex = findTempoSegmentIndex(currentTick, timing);

  while (remainingSeconds > 0) {
    const segment = tempoMap[tempoIndex] ?? tempoMap[tempoMap.length - 1];
    const nextStartTick = tempoMap[tempoIndex + 1]?.startTick ?? Infinity;
    const ticksUntilNextSegment = nextStartTick - currentTick;

    if (!Number.isFinite(ticksUntilNextSegment)) {
      return currentTick + (remainingSeconds / segment.secondsPerTick) - safeStartTick;
    }

    const secondsUntilNextSegment = Math.max(ticksUntilNextSegment, 0) * segment.secondsPerTick;
    if (remainingSeconds < secondsUntilNextSegment) {
      return currentTick + (remainingSeconds / segment.secondsPerTick) - safeStartTick;
    }

    currentTick = nextStartTick;
    remainingSeconds -= secondsUntilNextSegment;
    tempoIndex += 1;
  }

  return currentTick - safeStartTick;
}

function tickSpanToSeconds(startTick, durationTicks, timing) {
  return ticksBetweenToSeconds(startTick, startTick + durationTicks, timing);
}

function roundTick(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeEvents(events, timing, articulationRatio = 1) {
  if (!Array.isArray(events)) {
    return [];
  }

  const safeArticulationRatio = normalizeArticulationRatio(articulationRatio, 1);

  return [...events]
    .map((event, index) => {
      const tick = roundTick(event?.startTick ?? event?.tick);
      const time = ticksToSeconds(tick, timing);
      const durationTicks = Math.max(
        roundTick(event?.durationTicks ?? event?.durationTick),
        1,
      );
      const durationSec = Math.max(tickSpanToSeconds(tick, durationTicks, timing), 0.02);
      const playDurationTicks = Math.min(
        durationTicks,
        Math.max(roundTick(durationTicks * safeArticulationRatio), 1),
      );
      const playDurationSec = Math.min(
        durationSec,
        Math.max(tickSpanToSeconds(tick, playDurationTicks, timing), 0.02),
      );

      if (!Number.isFinite(time) || time < 0 || !Number.isFinite(tick) || tick < 0) {
        return null;
      }

      return {
        id: event?.id ?? `event-${index}`,
        startTick: tick,
        time,
        tick,
        durationSec,
        durationTicks,
        playDurationSec,
        playDurationTicks,
        k: event?.k ?? null,
        isRest: Boolean(event?.isRest),
        v: Number.isFinite(Number(event?.v)) ? Number(event.v) : 0.85,
        importance: Number.isFinite(Number(event?.importance)) ? Number(event.importance) : 100,
        trackId: event?.trackId ?? 'main',
        frequency: Number.isFinite(Number(event?.frequency)) ? Number(event.frequency) : null,
        noteName: event?.noteName ?? null,
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

function normalizeArticulationRatio(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return clamp(numeric, 0.1, 1);
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
    this.articulationRatio = 1;
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
    this.articulationRatio = normalizeArticulationRatio(playback?.articulationRatio, 1);
    this.events = normalizeEvents(events, this.timing, this.articulationRatio);
    const eventEndTick = this.events.reduce(
      (result, event) => Math.max(result, event.tick + event.durationTicks),
      0,
    );
    this.playbackEndTick = Math.max(
      roundTick(Number(playback?.contentEndTick)),
      roundTick(secondsToTicks(maxTime, this.timing)),
      this.events.reduce((result, event) => Math.max(result, event.tick), 0),
    );
    this.eventTailTick = Math.max(eventEndTick, this.playbackEndTick);
    this.maxTick = Math.max(this.eventTailTick, 0);
    this.maxTime = Math.max(Number(maxTime) || 0, ticksToSeconds(this.maxTick, this.timing));
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
    const elapsedTicks = secondsToTicks(
      elapsedAudio * this.transport.playbackRate,
      this.timing,
      this.transport.anchorTick,
    );

    return clamp(this.transport.anchorTick + elapsedTicks, 0, this.maxTick);
  }

  getCurrentTime() {
    return clamp(ticksToSeconds(this.getCurrentTick(), this.timing), 0, this.maxTime);
  }

  getEventEndTick(event) {
    return event.tick + event.durationTicks;
  }

  getEventSoundEndTick(event) {
    return event.tick + Math.max(roundTick(event?.playDurationTicks), 1);
  }

  getScheduledDurationSec(event, startTick = event.tick) {
    const remainingTicks = Math.max(this.getEventSoundEndTick(event) - startTick, 0);
    if (remainingTicks <= 0) {
      return 0;
    }

    return Math.max(
      tickSpanToSeconds(startTick, remainingTicks, this.timing) / this.transport.playbackRate,
      0.02,
    );
  }

  getEventAbsoluteTime(scoreTick) {
    return (
      this.transport.anchorAudioTime +
      ticksBetweenToSeconds(this.transport.anchorTick, scoreTick, this.timing)
        / this.transport.playbackRate
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
    const lookaheadTicks = secondsToTicks(
      SCHEDULE_AHEAD_SEC * this.transport.playbackRate,
      this.timing,
      nowTick,
    );
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

  scheduleEvent(event, absoluteTime, durationSec = event.playDurationSec ?? event.durationSec) {
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
      velocity: Number.isFinite(Number(event.v)) ? Number(event.v) : 0.85,
    });
  }

  resolveEventFrequency(event) {
    if (Number.isFinite(event.frequency) && event.frequency > 0) {
      return event.frequency;
    }

    if (event.noteName) {
      const noteFrequency = noteNameToFrequency(event.noteName);
      if (Number.isFinite(noteFrequency) && noteFrequency > 0) {
        return noteFrequency;
      }
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
      roundTick(secondsToTicks(
        Math.min(event.durationSec ?? 0.2, MAX_VISUAL_HOLD_SEC),
        this.timing,
        event.tick,
      )),
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
