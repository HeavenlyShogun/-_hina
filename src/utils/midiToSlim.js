import { parseMidi } from 'midi-file';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Parse a MIDI byte buffer into the project's V3.2 Slim representation.
 * Track tuples preserve the legacy first five fields, then append sourceTrackIndex and programChanges.
 */
export function midiBytesToSlim(input, options = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = parseMidi(bytes);
  const ppq = Math.max(1, Number(raw.header.ticksPerBeat) || 480);
  const tracks = [];
  const notes = [];
  const globalEvents = [];
  const sourceTrackNames = [];
  const tempos = [];
  const timeSignatures = [];

  raw.tracks.forEach((events, sourceTrackIndex) => {
    let tick = 0;
    let name = '';
    const programs = new Map();
    const queues = new Map();
    const changes = [];
    const completed = [];
    events.forEach((event, order) => {
      tick += Number(event.deltaTime) || 0;
      if (sourceTrackIndex === 0 && ['setTempo', 'timeSignature', 'keySignature', 'text', 'marker', 'cuePoint'].includes(event.type)) {
        globalEvents.push({ ...event, tick, order });
      }
      if (event.type === 'setTempo' && Number(event.microsecondsPerBeat) > 0) {
        tempos.push({ startTick: tick, bpm: 60000000 / Number(event.microsecondsPerBeat) });
      }
      if (event.type === 'timeSignature') {
        timeSignatures.push([tick, Number(event.numerator) || 4, 2 ** (Number(event.denominator) || 2)]);
      }
      if (event.type === 'trackName') { name = event.text || ''; sourceTrackNames[sourceTrackIndex] = { text: name, order }; }
      const channel = Number(event.channel ?? 0);
      const stateKey = `${sourceTrackIndex}:${channel}`;
      if (!programs.has(stateKey)) programs.set(stateKey, 0);
      if (event.type === 'programChange') {
        programs.set(stateKey, Number(event.programNumber) || 0);
        changes.push({ tick, order, channel, programNumber: programs.get(stateKey) });
      } else if (event.type === 'noteOn' && Number(event.velocity) > 0) {
        const key = `${stateKey}:${event.noteNumber}`;
        if (!queues.has(key)) queues.set(key, []);
        queues.get(key).push({ tick, order, pitch: event.noteNumber, velocity: event.velocity, channel, programNumber: programs.get(stateKey) });
      } else if (event.type === 'noteOff' || (event.type === 'noteOn' && Number(event.velocity) === 0)) {
        const key = `${stateKey}:${event.noteNumber}`;
        const queue = queues.get(key);
        if (queue?.length) {
          const start = queue.shift();
          completed.push({ ...start, duration: Math.max(1, tick - start.tick) });
          completed[completed.length - 1].noteOffOrder = order;
        }
      }
    });
    const channels = new Map();
    completed.forEach((note) => {
      if (!channels.has(note.channel)) channels.set(note.channel, new Map());
      const byProgram = channels.get(note.channel);
      if (!byProgram.has(note.programNumber)) byProgram.set(note.programNumber, []);
      byProgram.get(note.programNumber).push(note);
    });
    for (const [channel, byProgram] of channels) {
      for (const [programNumber, channelNotes] of byProgram) {
        const trackIndex = tracks.length;
        tracks.push([name || `Track ${sourceTrackIndex + 1}`, channel, `program-${programNumber}`, programNumber, null,
          sourceTrackIndex, changes.filter((change) => change.channel === channel)]);
        channelNotes.forEach((note) => notes.push([note.tick, note.duration, note.pitch,
          Number((note.velocity / 127).toFixed(4)), trackIndex, note.order, note.noteOffOrder]));
      }
    }
  });

  if (!tracks.length) throw new Error('The MIDI file does not contain any note events.');
  const normalizedTempos = tempos.sort((a, b) => a.startTick - b.startTick).filter((tempo, index, list) => (
    index === 0 || tempo.startTick !== list[index - 1].startTick || tempo.bpm !== list[index - 1].bpm
  ));
  const bpm = normalizedTempos[0]?.bpm || Number(options.bpm) || 120;
  const normalizedSignatures = timeSignatures.sort((a, b) => a[0] - b[0]);
  const firstSignature = normalizedSignatures[0] || [0, Number(options.timeSigNum) || 4, Number(options.timeSigDen) || 4];
  const title = options.title || String(options.fileName || 'MIDI Import').replace(/\.[^.]+$/u, '');
  return {
    version: '3.2-ultra-slim', columns: ['startTick', 'durationTicks', 'note', 'velocity', 'trackId'],
    meta: { title, displayTitle: title, sourceType: 'midi', originalFormat: 'midi', storageFormat: 'hina-slim-score@3.2' },
    transport: { bpm, timeSigNum: firstSignature[1], timeSigDen: firstSignature[2], resolution: ppq },
    playback: { tone: options.tone ?? 'midi-original', globalKeyOffset: options.globalKeyOffset ?? 0, scaleMode: options.scaleMode ?? 'major', reverb: options.reverb ?? true, accidentals: options.accidentals ?? {}, fixedPitch: true, tempoMap: normalizedTempos.length ? normalizedTempos : [{ startTick: 0, bpm }] },
    source: { midi: [options.fileName || '', ppq, raw.header.format, raw.tracks.length, normalizedSignatures, globalEvents, sourceTrackNames] }, tracks,
    notes: notes.sort((a, b) => a[0] - b[0] || a[4] - b[4] || a[2] - b[2]),
  };
}

export async function parseMidiToSlim(fileOrBuffer, options = {}) {
  const buffer = fileOrBuffer instanceof ArrayBuffer
    ? new Uint8Array(fileOrBuffer)
    : ArrayBuffer.isView(fileOrBuffer)
      ? new Uint8Array(fileOrBuffer.buffer, fileOrBuffer.byteOffset, fileOrBuffer.byteLength)
      : new Uint8Array(await fileOrBuffer.arrayBuffer());
  return midiBytesToSlim(buffer, { ...options, fileName: options.fileName || fileOrBuffer?.name || '' });
}
