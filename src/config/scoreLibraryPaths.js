export const DEFAULT_MIDI_LIBRARY_ROOT = '\u98a8\u7269\u4e4b\u7434\u8b5c/\u98a8\u7269\u4e4b\u8b5c\u9762';
export const DEFAULT_MIDI_SOURCE_PATH = `${DEFAULT_MIDI_LIBRARY_ROOT}/midi`;
export const DEFAULT_SLIM_SCORE_PATH = `${DEFAULT_MIDI_LIBRARY_ROOT}/slim-json`;
export const DEFAULT_SLIM_SCORE_FILENAME = 'surges-slim.json';

export function getDefaultSlimScorePath(filename = DEFAULT_SLIM_SCORE_FILENAME) {
  return `${DEFAULT_SLIM_SCORE_PATH}/${filename}`;
}
