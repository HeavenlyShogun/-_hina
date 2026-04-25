import audioEngine from './audioEngine';
import { KEY_INFO_MAP } from '../constants/music';

const LOOKAHEAD_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_TIME_SEC = 0.5;
const PLAY_START_DELAY_SEC = 0.15;
const STOP_TAIL_SEC = 0.12;
const NOTE_NAME_TO_SEMITONE = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

class PlaybackController {
  constructor(engine = audioEngine) {
    this.audioEngine = engine;
    this.listeners = new Set();
    this.intervalId = null;
    this.events = [];
    this.score = null;
    this.nextEventIndex = 0;
    this.totalDuration = 0;
    this.transportState = {
      status: 'stopped',
      position: 0,
      anchorContextTime: 0,
      anchorTransportTime: 0,
      scheduledFromTransportTime: 0,
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }

  getTransportTime() {
    const { status, position, anchorContextTime, anchorTransportTime } = this.transportState;

    if (status !== 'playing') {
      return position;
    }

    const contextTime = this.audioEngine.getCurrentTime();
    if (contextTime <= anchorContextTime) {
      return anchorTransportTime;
    }

    return Math.max(0, anchorTransportTime + (contextTime - anchorContextTime));
  }

  getSnapshot() {
    const currentTime = this.getTransportTime();
    const progress =
      this.totalDuration > 0
        ? Math.min(1, Math.max(0, currentTime / this.totalDuration))
        : 0;

    return {
      isPlaying: this.transportState.status === 'playing',
      isPaused: this.transportState.status === 'paused',
      status: this.transportState.status,
      currentTime,
      totalDuration: this.totalDuration,
      progress,
      eventsCount: this.events.length,
      canResume: this.transportState.status === 'paused' && this.events.length > 0,
    };
  }

  async play(score, options = {}) {
    const normalized = this.normalizeScore(score);
    await this.audioEngine.resume();

    this.stop({ hardReset: false });

    this.score = normalized.score;
    this.events = normalized.events;
    this.totalDuration = normalized.totalDuration;

    const startPosition = Math.max(0, Number(options.from) || 0);
    this.transportState = {
      status: 'playing',
      position: startPosition,
      anchorContextTime: this.audioEngine.getCurrentTime() + PLAY_START_DELAY_SEC,
      anchorTransportTime: startPosition,
      scheduledFromTransportTime: startPosition,
    };
    this.nextEventIndex = this.findNextEventIndex(startPosition);
    this.notify();

    this.startSchedulerLoop();
  }

  pause() {
    if (this.transportState.status !== 'playing') {
      return;
    }

    this.transportState = {
      ...this.transportState,
      status: 'paused',
      position: this.getTransportTime(),
      scheduledFromTransportTime: this.getTransportTime(),
    };
    this.stopSchedulerLoop();
    this.audioEngine.stopAll();
    this.notify();
  }

  async resume() {
    if (this.transportState.status !== 'paused' || !this.events.length) {
      return;
    }

    await this.audioEngine.resume();

    const startPosition = this.transportState.position;
    this.transportState = {
      ...this.transportState,
      status: 'playing',
      anchorContextTime: this.audioEngine.getCurrentTime() + PLAY_START_DELAY_SEC,
      anchorTransportTime: startPosition,
      scheduledFromTransportTime: startPosition,
    };
    this.nextEventIndex = this.findNextEventIndex(startPosition);
    this.notify();

    this.startSchedulerLoop();
  }

  stop(options = {}) {
    const { hardReset = true } = options;

    this.stopSchedulerLoop();
    this.audioEngine.stopAll();

    this.transportState = {
      status: 'stopped',
      position: 0,
      anchorContextTime: 0,
      anchorTransportTime: 0,
      scheduledFromTransportTime: 0,
    };
    this.nextEventIndex = 0;

    if (hardReset) {
      this.score = null;
      this.events = [];
      this.totalDuration = 0;
    }

    this.notify();
  }

  startSchedulerLoop() {
    this.stopSchedulerLoop();
    this.intervalId = window.setInterval(() => {
      this.schedulerTick();
    }, LOOKAHEAD_INTERVAL_MS);
    this.schedulerTick();
  }

  stopSchedulerLoop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  schedulerTick() {
    if (this.transportState.status !== 'playing' || !this.events.length) {
      this.notify();
      return;
    }

    const transportTime = this.getTransportTime();
    const scheduleUntilTransportTime = Math.max(
      this.transportState.scheduledFromTransportTime,
      transportTime + SCHEDULE_AHEAD_TIME_SEC,
    );

    while (this.nextEventIndex < this.events.length) {
      const event = this.events[this.nextEventIndex];
      if (event.time > scheduleUntilTransportTime) {
        break;
      }

      const absoluteTime =
        this.transportState.anchorContextTime + (event.time - this.transportState.anchorTransportTime);

      this.audioEngine.scheduleNote(
        event.frequency,
        absoluteTime,
        event.duration,
        event.renderConfig,
      );

      this.nextEventIndex += 1;
    }

    this.transportState = {
      ...this.transportState,
      position: transportTime,
      scheduledFromTransportTime: scheduleUntilTransportTime,
    };

    if (
      this.nextEventIndex >= this.events.length &&
      transportTime >= this.totalDuration + STOP_TAIL_SEC
    ) {
      this.stopSchedulerLoop();
      this.transportState = {
        status: 'stopped',
        position: 0,
        anchorContextTime: 0,
        anchorTransportTime: 0,
        scheduledFromTransportTime: 0,
      };
      this.notify();
      return;
    }

    this.notify();
  }

  normalizeScore(score) {
    const compiledEvents = Array.isArray(score) ? score : score?.compiledEvents;
    if (!Array.isArray(compiledEvents)) {
      return { score: null, events: [], totalDuration: 0 };
    }

    const scoreTone = score?.tone;
    const scoreReverbAmount = score?.reverb ? 0.45 : 0;
    const scoreOutputGain = Number(score?.outputGain);
    const scoreEvents = compiledEvents
      .map((event) => {
        const time = Number(event.time);
        const duration = Math.max(Number(event.duration) || 0.1, 0.02);
        const frequency = this.resolveFrequency(event.frequency ?? event.note ?? event.key);

        if (!Number.isFinite(time) || time < 0 || !Number.isFinite(frequency) || frequency <= 0) {
          return null;
        }

        return {
          key: event.key,
          note: event.note,
          time,
          duration,
          frequency,
          renderConfig: {
            tone: event.tone ?? scoreTone,
            velocity: event.velocity ?? 0.85,
            outputGain: Number.isFinite(scoreOutputGain) ? scoreOutputGain : 0.65,
            reverbAmount: Number.isFinite(Number(score?.reverbAmount))
              ? Number(score.reverbAmount)
              : scoreReverbAmount,
          },
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.time - right.time);

    return {
      score,
      events: scoreEvents,
      totalDuration: scoreEvents.reduce(
        (maxDuration, event) => Math.max(maxDuration, event.time + event.duration),
        0,
      ),
    };
  }

  findNextEventIndex(transportTime) {
    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index];
      if (event.time + event.duration > transportTime) {
        return index;
      }
    }

    return this.events.length;
  }

  resolveFrequency(note) {
    if (typeof note === 'number' && Number.isFinite(note)) {
      return note;
    }

    if (typeof note !== 'string' || !note.trim()) {
      return NaN;
    }

    const normalized = note.trim();

    if (KEY_INFO_MAP[normalized]) {
      return KEY_INFO_MAP[normalized].f;
    }

    const match = normalized.match(/^([A-G](?:#|b)?)(-?\d)$/);
    if (!match) {
      return NaN;
    }

    const semitone = NOTE_NAME_TO_SEMITONE[match[1]];
    const octave = Number(match[2]);

    if (!Number.isFinite(semitone) || !Number.isFinite(octave)) {
      return NaN;
    }

    const midi = (octave + 1) * 12 + semitone;
    return 440 * 2 ** ((midi - 69) / 12);
  }
}

export default new PlaybackController();
