import audioEngine from './audioEngine';
import { KEY_INFO_MAP } from '../constants/music';

const LOOKAHEAD_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_TIME_SEC = 0.12;
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
    this.nextEventIndex = 0;
    this.playStartTime = 0;
    this.pauseOffset = 0;
    this.totalDuration = 0;
    this.isPlaying = false;
    this.isPaused = false;
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

  getPlaybackTime() {
    if (this.isPlaying) {
      return Math.max(0, this.audioEngine.getCurrentTime() - this.playStartTime);
    }

    if (this.isPaused) {
      return this.pauseOffset;
    }

    return 0;
  }

  getSnapshot() {
    const currentTime = this.getPlaybackTime();
    const progress =
      this.totalDuration > 0
        ? Math.min(1, Math.max(0, currentTime / this.totalDuration))
        : 0;

    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentTime,
      totalDuration: this.totalDuration,
      progress,
      eventsCount: this.events.length,
    };
  }

  async play(score) {
    const normalizedEvents = this.normalizeScore(score);
    await this.audioEngine.resume();

    this.stop({ hardReset: false });

    this.events = normalizedEvents;
    this.nextEventIndex = 0;
    this.pauseOffset = 0;
    this.totalDuration = this.events.reduce(
      (maxDuration, event) => Math.max(maxDuration, event.time + event.duration),
      0,
    );
    this.playStartTime = this.audioEngine.getCurrentTime() + 0.02;
    this.isPlaying = true;
    this.isPaused = false;
    this.notify();

    this.startSchedulerLoop();
  }

  pause() {
    if (!this.isPlaying) {
      return;
    }

    this.pauseOffset = Math.max(0, this.audioEngine.getCurrentTime() - this.playStartTime);
    this.isPlaying = false;
    this.isPaused = true;

    this.stopSchedulerLoop();
    this.audioEngine.stopAll();
    this.notify();
  }

  async resume() {
    if (!this.isPaused || !this.events.length) {
      return;
    }

    await this.audioEngine.resume();

    this.isPlaying = true;
    this.isPaused = false;
    this.playStartTime = this.audioEngine.getCurrentTime() - this.pauseOffset + 0.02;
    this.nextEventIndex = this.findNextEventIndex(this.pauseOffset);
    this.notify();

    this.startSchedulerLoop();
  }

  stop(options = {}) {
    const { hardReset = true } = options;

    this.stopSchedulerLoop();
    this.audioEngine.stopAll();

    this.isPlaying = false;
    this.isPaused = false;
    this.pauseOffset = 0;
    this.nextEventIndex = 0;

    if (hardReset) {
      this.events = [];
      this.totalDuration = 0;
      this.playStartTime = 0;
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
    if (!this.isPlaying || !this.events.length) {
      this.notify();
      return;
    }

    const now = this.audioEngine.getCurrentTime();
    const scheduleWindowEnd = now + SCHEDULE_AHEAD_TIME_SEC;

    while (this.nextEventIndex < this.events.length) {
      const event = this.events[this.nextEventIndex];
      const absoluteTime = this.playStartTime + event.time;

      if (absoluteTime > scheduleWindowEnd) {
        break;
      }

      this.audioEngine.scheduleNote(
        event.frequency,
        absoluteTime,
        event.duration,
        event.toneConfig,
      );

      this.nextEventIndex += 1;
    }

    if (
      this.nextEventIndex >= this.events.length &&
      now >= this.playStartTime + this.totalDuration + 0.1
    ) {
      this.stopSchedulerLoop();
      this.isPlaying = false;
      this.isPaused = false;
      this.pauseOffset = 0;
      this.notify();
      return;
    }

    this.notify();
  }

  normalizeScore(score) {
    const compiledEvents = Array.isArray(score) ? score : score?.compiledEvents;
    if (!Array.isArray(compiledEvents)) {
      return [];
    }

    return compiledEvents
      .map((event) => {
        const time = Number(event.time);
        const duration = Math.max(Number(event.duration) || 0.1, 0.02);
        const frequency = this.resolveFrequency(event.note ?? event.frequency ?? event.key);

        if (!Number.isFinite(time) || time < 0 || !Number.isFinite(frequency) || frequency <= 0) {
          return null;
        }

        return {
          note: event.note,
          time,
          duration,
          frequency,
          toneConfig: event.toneConfig || score?.toneConfig || {},
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.time - right.time);
  }

  findNextEventIndex(playbackOffset) {
    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index];
      if (event.time + event.duration > playbackOffset) {
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
