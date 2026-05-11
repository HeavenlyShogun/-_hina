
/**
 * @fileoverview
 * This module provides a utility function to convert a score from the V2
 * (canonical note-duration) format to the V3 (tick-based event stream) format.
 */

/**
 * Converts a V2 score object to a V3 event stream.
 *
 * This function processes a list of note objects, each with a `startTick`
 * and `durationTicks`, and transforms them into a time-sorted list of
 * `note_on` and `note_off` events. This is beneficial for performance in
 * playback scenarios as it simplifies the logic required to determine which
 * notes should be active at any given time.
 *
 * @param {object} v2Score - The V2 score object, typically including `tracks`,
 *                           `transport`, and `playback` properties.
 * @returns {object} A V3 score object, with a version marker and a
 *                   unified, sorted event stream.
 */
export function convertV2toV3(v2Score) {
  if (!v2Score || !Array.isArray(v2Score.tracks)) {
    console.error("Invalid V2 score format provided for conversion.");
    return {
      version: "3.0",
      events: [],
    };
  }

  const v3Events = [];

  for (const track of v2Score.tracks) {
    if (!track || !Array.isArray(track.events)) {
      continue;
    }

    for (const note of track.events) {
      const startTick = note.tick ?? note.startTick;
      const durationTicks = note.durationTicks ?? note.duration;

      // Add 'note_on' event
      v3Events.push({
        type: 'note_on',
        tick: startTick,
        note: note.midi,
        velocity: note.velocity,
        trackId: track.id || 0,
      });

      // Add 'note_off' event
      v3Events.push({
        type: 'note_off',
        tick: startTick + durationTicks,
        note: note.midi,
        trackId: track.id || 0,
      });
    }
  }

  // Sort all events by tick time.
  v3Events.sort((a, b) => a.tick - b.tick);

  // Reconstruct the score in V3 format, preserving top-level properties
  return {
    version: "3.0",
    ppq: v2Score.ppq ?? v2Score.resolution,
    meta: v2Score.meta,
    transport: v2Score.transport,
    playback: v2Score.playback,
    events: v3Events,
  };
}
