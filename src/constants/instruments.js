export const AVAILABLE_INSTRUMENTS = {
  'midi-original': {
    id: 'midi-original',
    label: 'MIDI 原始指示',
    type: 'sampled',
    icon: 'music',
    description: '依照譜面每個 MIDI 音軌的原始樂器指示播放',
  },
  piano: {
    id: 'piano',
    label: '平台鋼琴',
    type: 'sampled',
    icon: 'piano',
    description: 'Salamander grand piano samples',
  },
  'bright-acoustic-piano': {
    id: 'bright-acoustic-piano',
    label: '亮音鋼琴',
    type: 'sampled',
    icon: 'piano',
    description: 'FluidR3 bright acoustic piano SoundFont',
  },
  'electric-guitar-clean': {
    id: 'electric-guitar-clean',
    label: '電吉他',
    type: 'sampled',
    icon: 'guitar',
    description: 'FluidR3 clean electric guitar SoundFont',
  },
  'tongue-drum': {
    id: 'tongue-drum',
    label: '空靈鼓',
    type: 'sampled',
    icon: 'drum',
    description: 'FluidR3 steel drums samples',
  },
  'tongue-drum-electronic': {
    id: 'tongue-drum-electronic',
    label: '電子空靈鼓',
    type: 'synthesized',
    icon: 'audio-lines',
    description: 'Synthesized tongue drum layer',
  },
  'retro-saw-synth': {
    id: 'retro-saw-synth',
    label: '復古鋸齒波',
    type: 'synthesized',
    icon: 'waves',
    description: 'Bright sawtooth lead with a lowpass envelope',
  },
  'cozy-triangle-lead': {
    id: 'cozy-triangle-lead',
    label: '柔和三角波',
    type: 'synthesized',
    icon: 'audio-lines',
    description: 'Warm triangle lead with soft attack and release',
  },
};

export const SUPPORTED_TONES = Object.keys(AVAILABLE_INSTRUMENTS);

export function getInstrumentDefinition(id) {
  return AVAILABLE_INSTRUMENTS[id] ?? null;
}

export function listAvailableInstruments() {
  return Object.values(AVAILABLE_INSTRUMENTS);
}
