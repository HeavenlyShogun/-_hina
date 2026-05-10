
/**
 * @fileoverview
 * This module provides a utility function to convert a score from the V2 
 * (canonical note-duration) format to the V3 (tick-based event stream) format.
 * This is a crucial step in migrating the playback and display logic to a more 
 * performant architecture.
 */

/**
 * Converts a V2 score format to a V3 event stream format.
 *
 * The V2 format, an array of note objects with `startTick` and `durationTicks`,
 * requires traversal of the entire score to determine active notes at any given
 * time, leading to performance degradation on large scores.
 *
 * The V3 format represents the score as a time-sorted list of `note_on` and 
 * `note_off` events. This allows the playback engine to process events only at 
 * the exact tick they occur, dramatically improving performance.
 *
 * @param {object} v2Score - The V2 score object. Assumes a structure like 
 *                           { version: "2.0", notes: [{note, startTick, durationTicks, ...}] }.
 * @returns {object} A V3 score object, e.g., 
 *                   { version: "3.0", ppq: v2Score.ppq, events: [...] }.
 */
export function convertV2toV3(v2Score) {
  if (!v2Score || v2Score.version !== "2.0" || !Array.isArray(v2Score.notes)) {
    console.error("Invalid V2 score format provided for conversion.");
    return {
      version: "3.0",
      ppq: v2Score?.ppq || 480, // Default PPQ
      events: [],
    };
  }

  const v3Events = [];

  for (const note of v2Score.notes) {
    // For each V2 note, generate two V3 events: one note_on, one note_off.
    v3Events.push({
      tick: note.startTick,
      type: 'note_on',
      note: note.note, // MIDI note number
      velocity: note.velocity || 1.0, // Default velocity if not specified
      trackId: note.trackId || 0,
    });

    v3Events.push({
      tick: note.startTick + note.durationTicks,
      type: 'note_off',
      note: note.note,
      trackId: note.trackId || 0,
    });
  }

  // Sort the event stream by tick to ensure correct playback order.
  // This is the most critical step for the V3 playback logic.
  v3Events.sort((a, b) => a.tick - b.tick);

  return {
    version: "3.0",
    ppq: v2Score.ppq,
    // You can also carry over other metadata from the v2Score object here
    ...v2Score.metadata, 
    events: v3Events,
  };
}
