import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackController } from '../src/services/playbackController.js';
import { AudioEngine } from '../src/services/audioEngine.js';
import { midiBytesToSlim } from '../src/utils/midiToSlim.js';
import midiFile from 'midi-file';
import { normalizeScoreSource } from '../src/utils/score.js';

let originalWindow;
let nextId;
let timers;
let frames;
let cancelledTimers;
let cancelledFrames;

function installWindowMock() {
  originalWindow = globalThis.window;
  nextId = 0;
  timers = new Map();
  frames = new Map();
  cancelledTimers = [];
  cancelledFrames = [];
  globalThis.window = {
    setTimeout(callback) { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout(id) { cancelledTimers.push(id); timers.delete(id); },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { cancelledFrames.push(id); frames.delete(id); },
  };
}

function restoreWindowMock() {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

function fakeEngine(resume = async () => {}) {
  return {
    currentTime: 1,
    stopCount: 0,
    scheduled: [],
    getCurrentTime() { return this.currentTime; },
    async resume() { await resume(); },
    stopAll() { this.stopCount += 1; },
    scheduleNote(...args) { this.scheduled.push(args); },
  };
}

function makeController(engine) {
  const controller = new PlaybackController(engine);
  controller.load([
    { tick: 0, durationTicks: 120, frequency: 440 },
    { tick: 480, durationTicks: 120, frequency: 493.88 },
  ], 1, { bpm: 120, resolution: 480 });
  return controller;
}

test('play-stop during async audio resume cannot start a stale scheduler', async () => {
  installWindowMock();
  try {
    let resolveResume;
    const resumeGate = new Promise((resolve) => { resolveResume = resolve; });
    const engine = fakeEngine(() => resumeGate);
    const controller = makeController(engine);
    const starting = controller.play();
    controller.stop();
    resolveResume();
    await starting;
    assert.equal(controller.getState().status, 'stopped');
    assert.equal(engine.scheduled.length, 0);
    assert.equal(controller.schedulerTimer, null);
    assert.equal(controller.visualFrame, null);
  } finally { restoreWindowMock(); }
});

test('concurrent play requests schedule one event loop; stop clears its timer and frame', async () => {
  installWindowMock();
  try {
    let resolveResume;
    const resumeGate = new Promise((resolve) => { resolveResume = resolve; });
    const engine = fakeEngine(() => resumeGate);
    const controller = makeController(engine);
    const firstPlay = controller.play();
    const secondPlay = controller.play();
    resolveResume();
    await Promise.all([firstPlay, secondPlay]);
    assert.equal(controller.getState().status, 'playing');
    assert.equal(engine.scheduled.length, 1);
    assert.equal(timers.size, 1);
    assert.equal(frames.size, 1);
    controller.stop();
    assert.equal(controller.schedulerTimer, null);
    assert.equal(controller.visualFrame, null);
    assert.equal(timers.size, 0);
    assert.equal(frames.size, 0);
    assert.equal(cancelledTimers.length, 1);
    assert.equal(cancelledFrames.length, 1);
  } finally { restoreWindowMock(); }
});

test('pause, seek, and reload release audio and invalidate controller timers', async () => {
  installWindowMock();
  try {
    const engine = fakeEngine();
    const controller = makeController(engine);
    await controller.play();
    controller.pause();
    assert.equal(controller.getState().status, 'paused');
    assert.equal(timers.size, 0);
    assert.equal(frames.size, 0);
    const stopCountAfterPause = engine.stopCount;
    await controller.seek({ tick: 240 });
    assert.equal(controller.getState().currentTick, 240);
    assert.ok(engine.stopCount > stopCountAfterPause);
    await controller.play();
    controller.load([{ tick: 0, durationTicks: 100, frequency: 330 }], 0.5, { bpm: 120, resolution: 480 });
    assert.equal(controller.getState().status, 'stopped');
    assert.equal(timers.size, 0);
    assert.equal(frames.size, 0);
  } finally { restoreWindowMock(); }
});

test('stop during async seek resume cannot restart the previous transport', async () => {
  installWindowMock();
  try {
    let resolveSeekResume;
    let resumeCalls = 0;
    const seekGate = new Promise((resolve) => { resolveSeekResume = resolve; });
    const engine = fakeEngine(() => (++resumeCalls === 1 ? undefined : seekGate));
    const controller = makeController(engine);
    await controller.play();
    const seeking = controller.seek({ tick: 240 });
    controller.stop();
    resolveSeekResume();
    await seeking;
    assert.equal(controller.getState().status, 'stopped');
    assert.equal(controller.schedulerTimer, null);
    assert.equal(controller.visualFrame, null);
    assert.equal(timers.size, 0);
    assert.equal(frames.size, 0);
  } finally { restoreWindowMock(); }
});

test('AudioEngine releases each shared Tone instrument with releaseAll and clears live tracking', () => {
  installWindowMock();
  try {
    const engine = new AudioEngine();
    let releases = 0;
    const instrument = { releaseAll() { releases += 1; } };
    const voice = { sourceType: 'tone-sampler', toneInstrument: instrument, endTime: 3, cleanupTimer: null };
    engine.audioContext = { currentTime: 1 };
    engine.activeVoices.add(voice);
    engine.activeLiveVoices.set('manual', voice);
    engine.scheduleToneVoiceCleanup = () => {};
    engine.stopAll();
    assert.equal(releases, 1);
    assert.equal(engine.activeLiveVoices.size, 0);
    assert.equal(voice.isReleased, true);
  } finally { restoreWindowMock(); }
});

test('Slim MIDI import normalizes the source program and channel for runtime playback', () => {
  let previous = 0;
  const tracks = [[
    { type: 'trackName', text: 'Strings', tick: 0 },
    { type: 'programChange', channel: 2, programNumber: 48, tick: 0 },
    { type: 'noteOn', channel: 2, noteNumber: 67, velocity: 100, tick: 0 },
    { type: 'noteOff', channel: 2, noteNumber: 67, velocity: 0, tick: 240 },
    { type: 'endOfTrack', tick: 240 },
  ].map((event) => { const next = { ...event, deltaTime: event.tick - previous }; previous = event.tick; delete next.tick; return next; })];
  const bytes = midiFile.writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks });
  const slim = midiBytesToSlim(bytes, { fileName: 'strings.mid' });
  const runtime = normalizeScoreSource(slim);
  assert.equal(slim.version, '3.2-ultra-slim');
  assert.equal(slim.tracks[0][5], 0);
  assert.equal(runtime.events.length, 1);
  assert.equal(runtime.events[0].midi, 67);
  assert.equal(runtime.events[0].channel, 2);
  assert.equal(runtime.events[0].midiProgramNumber, 48);
  assert.equal(runtime.events[0].frequency, 440 * 2 ** ((67 - 69) / 12));
});
