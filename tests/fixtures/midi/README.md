# Golden MIDI Fixtures

These checked-in MIDI files are deterministic regression inputs for the MIDI -> Slim 3.2 -> Runtime -> MIDI path. Regenerate them with `npm run fixtures:midi:generate`. Create Runtime round-trip comparison files with `npm run fixtures:midi:export`; exported files are written to `tests/fixtures/midi/roundtrip/` with matching names.

- `basic.mid`: single piano track, ordinary note sequence.
- `tempo-map.mid`: PPQ 960, frequent tempo changes and 4/4 -> 3/4 -> 7/8 meter changes.
- `multi-track.mid`: piano and strings, empty track, plus a same-track program change from program 0 to 40.
- `drums.mid`: percussion notes on MIDI channel 10 (zero-based channel 9).
- `edge-cases.mid`: 1-tick notes, dense same-tick chord, and velocity minimum/maximum.

## DAW Verification SOP

For each fixture, import the source MIDI and its matching file from `roundtrip/` into the same DAW project. Compare the following manually:

1. Timeline: first note, final note, tempo changes, and meter changes.
2. Notes: event count, same-tick chords, 1-tick notes, long-note endings, and velocity values.
3. Tracks: track count, empty track, channel assignment, and percussion channel.
4. Programs: program-change events and their change positions; verify tracks do not fall back to piano.
5. Playback: dense chords, fast tempo transitions, and simultaneous instruments.

Automated tests verify parsed event data and MIDI metadata. They do not replace this listening and visual check. Record the DAW name/version and any differences alongside the release verification notes.
