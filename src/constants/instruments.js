export const AVAILABLE_INSTRUMENTS = {
  'midi-original': {
    id: 'midi-original',
    label: 'MIDI Original',
    type: 'sampled',
    icon: 'music',
    selectable: false,
    description: 'Use the original MIDI instrument where available',
  },
  piano: {
    id: 'piano',
    label: 'Piano / 鋼琴',
    type: 'sampled',
    icon: 'piano',
    description: 'Tone.Sampler WAV grand piano samples',
  },
  'bright-acoustic-piano': {
    id: 'bright-acoustic-piano',
    label: 'Bright Piano',
    type: 'sampled',
    icon: 'piano',
    selectable: false,
    description: 'FluidR3 bright acoustic piano SoundFont',
  },
  'electric-guitar-clean': {
    id: 'electric-guitar-clean',
    label: 'Guitar / 吉他',
    type: 'sampled',
    icon: 'guitar',
    description: 'Tone.Sampler WAV acoustic guitar samples',
  },
  bass: {
    id: 'bass',
    label: 'Bass / 貝斯',
    type: 'sampled',
    icon: 'music',
    description: 'GM electric bass finger SoundFont samples',
  },
  drums: {
    id: 'drums',
    label: 'Drums / 架子鼓',
    type: 'sampled',
    icon: 'drum',
    description: 'Acoustic drum SoundFont samples',
  },
  'orchestral-harp': {
    id: 'orchestral-harp',
    label: 'Harp / 豎琴',
    type: 'sampled',
    icon: 'music',
    description: 'Tone.Sampler WAV harp samples',
  },
  'concert-flute': {
    id: 'concert-flute',
    label: 'Flute / 長笛',
    type: 'sampled',
    icon: 'waves',
    description: 'Tone.Sampler WAV flute samples',
  },
  'acoustic-drums': {
    id: 'acoustic-drums',
    label: 'Drums',
    type: 'sampled',
    icon: 'drum',
    selectable: false,
    description: 'Tone.Sampler WAV acoustic drum samples',
  },
  'tongue-drum': {
    id: 'tongue-drum',
    label: 'Tongue Drum / 空靈鼓',
    type: 'sampled',
    icon: 'drum',
    description: 'Real steel tongue drum SoundFont samples',
  },
  violin: {
    id: 'violin',
    label: 'Violin / 小提琴',
    type: 'sampled',
    icon: 'music',
    description: 'GM violin SoundFont samples',
  },
  'electric-guitar': {
    id: 'electric-guitar',
    label: 'Electric Guitar / 電吉他',
    type: 'sampled',
    icon: 'guitar',
    description: 'GM electric guitar clean SoundFont samples',
  },
  glockenspiel: {
    id: 'glockenspiel',
    label: 'Glockenspiel / 鋼片琴',
    type: 'sampled',
    icon: 'music',
    description: 'GM glockenspiel SoundFont samples',
  },
  'tongue-drum-electronic': {
    id: 'tongue-drum-electronic',
    label: 'Electronic Drum',
    type: 'synthesized',
    icon: 'audio-lines',
    description: 'Synthesized tongue drum layer',
  },
  'retro-saw-synth': {
    id: 'retro-saw-synth',
    label: 'Synth Lead',
    type: 'synthesized',
    icon: 'waves',
    description: 'Bright electronic lead with a lowpass envelope',
  },
  'cozy-triangle-lead': {
    id: 'cozy-triangle-lead',
    label: 'Soft Lead',
    type: 'synthesized',
    icon: 'audio-lines',
    description: 'Warm electronic lead with soft attack and release',
  },
  'breath-flute': {
    id: 'breath-flute',
    label: 'Breath Flute',
    type: 'synthesized',
    icon: 'waves',
    description: 'Soft sine flute with slow breath noise',
  },
};

export const SUPPORTED_TONES = Object.keys(AVAILABLE_INSTRUMENTS);

export function getInstrumentDefinition(id) {
  return AVAILABLE_INSTRUMENTS[id] ?? null;
}

export function listAvailableInstruments() {
  return Object.values(AVAILABLE_INSTRUMENTS).filter((instrument) => instrument.selectable !== false);
}
