const NATURAL_NOTE_MIDI = new Set(Array.from({ length: 36 }, (_, index) => index + 48)
  .filter((midi) => [0, 2, 4, 5, 7, 9, 11].includes(midi % 12)));
const NATURAL_NAMES = ['C', null, 'D', null, 'E', 'F', null, 'G', null, 'A', null, 'B'];
const LYRE_KEYS = {
  C3: 'z', D3: 'x', E3: 'c', F3: 'v', G3: 'b', A3: 'n', B3: 'm',
  C4: 'a', D4: 's', E4: 'd', F4: 'f', G4: 'g', A4: 'h', B4: 'j',
  C5: 'q', D5: 'w', E5: 'e', F5: 'r', G5: 't', A5: 'y', B5: 'u',
};
const BAND_SLOT_FAMILIES = ['melody', 'chords', 'bass', 'drums', 'melody', 'melody', 'melody', 'melody', 'melody', 'melody', 'melody', 'bass', 'melody', 'drums', 'chords', 'melody'];

function foldMidiIntoLyreRange(value) {
  if (value === null || value === undefined || value === '') return null;
  let midi = Math.round(Number(value));
  if (!Number.isFinite(midi)) return null;
  while (midi < 48) midi += 12;
  while (midi > 83) midi -= 12;
  return midi >= 48 && midi <= 83 ? midi : null;
}

function countSimultaneous(events) {
  const counts = new Map();
  events.forEach((event) => counts.set(event.tick, (counts.get(event.tick) ?? 0) + 1));
  return events.map((event) => ({ ...event, simultaneousNotes: counts.get(event.tick) ?? 1 }));
}

function family(event) {
  const text = `${event.trackId} ${event.midiInstrument ?? ''}`.toLowerCase();
  if (event.isPercussion || /drum|percussion/u.test(text)) return 'drums';
  const hasMidi = event.midi !== null && event.midi !== undefined && Number.isFinite(Number(event.midi));
  if (/bass|contrabass|tuba/u.test(text) || (hasMidi && Number(event.midi) < 48)) return 'bass';
  if (/guitar|harp|strum|chord|accomp|comping/u.test(text)) return 'chords';
  return 'melody';
}

export function applyPlaybackMode(normalized, mode = 'solo', selectedTone = 'piano', instrumentConfig = {}) {
  const safeMode = ['solo', 'band', 'orchestra'].includes(mode) ? mode : 'solo';
  const base = normalized ?? { events: [], playback: {} };
  let events = base.events ?? [];

  if (safeMode === 'solo') {
    events = events.flatMap((event) => {
      if (event.isPercussion || event.channel === 9 || event.channel === 10) return [];
      if (event.midi === null || event.midi === undefined || !Number.isFinite(Number(event.midi))) {
        return [{ ...event, trackId: 'main', midiSampleSet: null }];
      }
      const midi = foldMidiIntoLyreRange(event.midi);
      if (midi === null || !NATURAL_NOTE_MIDI.has(midi)) return [];
      const pitchName = NATURAL_NAMES[midi % 12];
      const octave = Math.floor(midi / 12) - 1;
      const noteName = `${pitchName}${octave}`;
      return [{
        ...event,
        trackId: 'main',
        midi,
        noteName,
        k: LYRE_KEYS[noteName],
        frequency: 440 * (2 ** ((midi - 69) / 12)),
        midiSampleSet: null,
        simultaneousNotes: 1,
      }];
    });
    return { ...base, events, playback: { ...base.playback, tone: selectedTone, midiOriginalSampleSets: [] } };
  }

  if (safeMode === 'band') {
    events = events.flatMap((event) => {
      const part = family(event);
      const sampleSets = {
        melody: 'gm:acoustic_grand_piano',
        chords: 'gm:electric_guitar_clean',
        bass: 'gm:electric_bass_pick',
        drums: 'pearl-acoustic-drums',
      };
      const bandCount = Math.max(1, Math.min(16, Number(instrumentConfig.bandCount) || 4));
      const slots = Array.from({ length: bandCount }, (_, index) => {
        const slotId = `slot-${index + 1}`;
        const slotConfig = instrumentConfig.bandSlots?.[slotId]
          ?? instrumentConfig.band?.[BAND_SLOT_FAMILIES[index]]
          ?? {};
        return [slotId, slotConfig, BAND_SLOT_FAMILIES[index]];
      });
      const matchingSlots = slots.filter(([, slotConfig, defaultFamily]) => (
        slotConfig?.active !== false
        && (slotConfig?.family ?? defaultFamily) === part
      ));
      return matchingSlots.map(([slotId, slotConfig]) => ({
        ...event,
        trackId: `band-${slotId}`,
        midiInstrument: part,
        midiSampleSet: sampleSets[part],
        isPercussion: part === 'drums',
        ...(slotConfig.tone ? { tone: slotConfig.tone, midiSampleSet: null } : {}),
        channelGain: Number.isFinite(Number(slotConfig.volume)) ? Math.max(0, Math.min(1, Number(slotConfig.volume))) : 1,
      }));
    }).filter(Boolean);
    events = countSimultaneous(events);
    return {
      ...base,
      events,
      playback: {
        ...base.playback,
        tone: 'midi-original',
        midiOriginalSampleSets: [...new Set(events.map((event) => event.midiSampleSet).filter(Boolean))],
        extraToneNames: [...new Set(events.map((event) => event.tone).filter(Boolean))],
      },
    };
  }

  events = events.map((event) => {
    const sourceConfig = event.sourceId
      ? instrumentConfig.orchestraSources?.[event.sourceId] ?? {}
      : {};
    if (sourceConfig.active === false) return null;
    const channelConfig = instrumentConfig.orchestra?.[event.trackId] ?? sourceConfig;
    if (channelConfig.active === false) return null;
    const sourceVolume = Number.isFinite(Number(sourceConfig.volume)) ? Number(sourceConfig.volume) : 1;
    const channelVolume = Number.isFinite(Number(channelConfig.volume)) ? Number(channelConfig.volume) : 1;
    return {
      ...event,
      ...(channelConfig.tone ? { tone: channelConfig.tone, midiSampleSet: null } : {}),
      channelGain: Math.max(0, Math.min(1, sourceVolume * channelVolume)),
    };
  }).filter(Boolean);
  return {
    ...base,
    events: countSimultaneous(events),
    playback: {
      ...base.playback,
      tone: 'midi-original',
      midiOriginalSampleSets: [...new Set(events.filter((event) => !event.tone).map((event) => event.midiSampleSet).filter(Boolean))],
      extraToneNames: [...new Set(events.map((event) => event.tone).filter(Boolean))],
    },
  };
}
