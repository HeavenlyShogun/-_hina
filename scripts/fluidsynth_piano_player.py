"""Realtime MIDI-to-FluidSynth piano renderer.

Usage examples:
  python scripts/fluidsynth_piano_player.py --sf2 C:/SoundFonts/SalamanderGrandPiano.sf2 --midi song.mid
  python scripts/fluidsynth_piano_player.py --sf2 C:/SoundFonts/SalamanderGrandPiano.sf2 --port "loopMIDI Port"

The script is intentionally standalone so it can be used to prototype a more
realistic piano engine before wiring the same ideas into an app UI.
"""

from __future__ import annotations

import argparse
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import mido


PIANO_CHANNEL = 0
SUSTAIN_CC = 64
EXPRESSION_CC = 11
BRIGHTNESS_CC = 74
REVERB_SEND_CC = 91
CHORUS_SEND_CC = 93


def load_fluidsynth_module():
    try:
        import fluidsynth  # type: ignore[import-not-found]
    except FileNotFoundError as error:
        raise SystemExit(
            "pyfluidsynth is installed, but the native FluidSynth DLL was not found. "
            "Install FluidSynth for Windows and add its bin directory to PATH, or place "
            "it at C:/tools/fluidsynth/bin. Original error: "
            f"{error}"
        ) from error
    return fluidsynth


@dataclass
class HeldNote:
    note: int
    velocity: int
    started_at: float = field(default_factory=time.perf_counter)


class RealisticPianoSynth:
    """Wraps FluidSynth with piano-specific MIDI performance behavior."""

    def __init__(
        self,
        sf2_path: Path,
        *,
        audio_driver: str | None = None,
        sample_rate: int = 44100,
        gain: float = 0.55,
        bank: int = 0,
        preset: int = 0,
    ) -> None:
        if not sf2_path.exists():
            raise FileNotFoundError(f"SoundFont not found: {sf2_path}")

        fluidsynth_module = load_fluidsynth_module()
        self.synth = fluidsynth_module.Synth(gain=gain, samplerate=float(sample_rate))
        self.synth.start(driver=audio_driver)
        self.soundfont_id = self.synth.sfload(str(sf2_path))
        if self.soundfont_id == -1:
            raise RuntimeError(f"FluidSynth failed to load SoundFont: {sf2_path}")

        self.synth.program_select(PIANO_CHANNEL, self.soundfont_id, bank, preset)
        self.sustain_down = False
        self.active_notes: dict[int, HeldNote] = {}
        self.sustained_notes: dict[int, HeldNote] = {}

        # Spatial defaults. Many piano SF2 files expose natural release samples;
        # these controller sends add room impression without baking it into notes.
        self.synth.cc(PIANO_CHANNEL, REVERB_SEND_CC, 46)
        self.synth.cc(PIANO_CHANNEL, CHORUS_SEND_CC, 8)
        self.synth.cc(PIANO_CHANNEL, EXPRESSION_CC, 112)
        self.synth.cc(PIANO_CHANNEL, BRIGHTNESS_CC, 72)

        # Global FluidSynth reverb/chorus. If the installed pyfluidsynth build
        # lacks these helpers, controller sends above still work.
        if hasattr(self.synth, "set_reverb"):
            self.synth.set_reverb(0.56, 0.34, 0.82, 0.24)
        if hasattr(self.synth, "set_chorus"):
            self.synth.set_chorus(3, 0.18, 0.35, 5.0, 0)

    @staticmethod
    def _clamp_midi(value: float) -> int:
        return max(0, min(127, int(round(value))))

    def map_velocity(self, velocity: int) -> tuple[int, int, int, int, int]:
        """Map key velocity to performance controls.

        A good piano SoundFont usually contains multiple velocity layers. The
        remapped note velocity selects those layers, so soft notes trigger rounder
        harmonics while hard notes trigger brighter hammer/string samples.

        The additional CC values shape the same idea in real time:
        - CC74 brightness opens the virtual tone as velocity increases.
        - CC11 expression gives light notes more usable body.
        - CC91/CC93 add more room to light notes and less smear to hard attacks.
        """
        normalized = max(0.0, min(1.0, velocity / 127.0))
        curved = normalized**0.72

        note_velocity = self._clamp_midi(18 + curved * 109)
        expression = self._clamp_midi(72 + curved * 48)
        brightness = self._clamp_midi(42 + (normalized**0.55) * 78)
        reverb_send = self._clamp_midi(64 - normalized * 26)
        chorus_send = self._clamp_midi(5 + (1.0 - normalized) * 9)
        return note_velocity, expression, brightness, reverb_send, chorus_send

    def note_on(self, note: int, velocity: int) -> None:
        if velocity <= 0:
            self.note_off(note)
            return

        # If a sustained copy is still ringing, release it before replaying the
        # same key. This avoids stacked samples that make fast repetitions muddy.
        if note in self.sustained_notes:
            self.synth.noteoff(PIANO_CHANNEL, note)
            self.sustained_notes.pop(note, None)

        note_velocity, expression, brightness, reverb_send, chorus_send = self.map_velocity(velocity)
        self.synth.cc(PIANO_CHANNEL, EXPRESSION_CC, expression)
        self.synth.cc(PIANO_CHANNEL, BRIGHTNESS_CC, brightness)
        self.synth.cc(PIANO_CHANNEL, REVERB_SEND_CC, reverb_send)
        self.synth.cc(PIANO_CHANNEL, CHORUS_SEND_CC, chorus_send)
        self.synth.noteon(PIANO_CHANNEL, note, note_velocity)
        self.active_notes[note] = HeldNote(note=note, velocity=note_velocity)

    def note_off(self, note: int) -> None:
        held = self.active_notes.pop(note, None)
        if self.sustain_down:
            if held:
                self.sustained_notes[note] = held
            return

        self.synth.noteoff(PIANO_CHANNEL, note)

    def sustain(self, value: int) -> None:
        was_down = self.sustain_down
        self.sustain_down = value >= 64
        self.synth.cc(PIANO_CHANNEL, SUSTAIN_CC, 127 if self.sustain_down else 0)

        if was_down and not self.sustain_down:
            # Pedal release: let FluidSynth/SF2 release envelopes handle the decay
            # after noteoff instead of hard-cutting buffered audio.
            for note in list(self.sustained_notes):
                self.synth.noteoff(PIANO_CHANNEL, note)
            self.sustained_notes.clear()

    def handle_message(self, msg: mido.Message) -> None:
        if msg.type == "note_on":
            self.note_on(msg.note, msg.velocity)
        elif msg.type == "note_off":
            self.note_off(msg.note)
        elif msg.type == "control_change" and msg.control == SUSTAIN_CC:
            self.sustain(msg.value)
        elif msg.type == "control_change":
            self.synth.cc(PIANO_CHANNEL, msg.control, msg.value)
        elif msg.type == "program_change":
            # Keep the chosen piano SF2 program unless the caller deliberately
            # forwards program changes here.
            return

    def panic(self) -> None:
        self.sustain(0)
        for note in range(128):
            self.synth.noteoff(PIANO_CHANNEL, note)
        self.active_notes.clear()
        self.sustained_notes.clear()

    def close(self) -> None:
        self.panic()
        self.synth.delete()


def iter_midi_file_messages(path: Path) -> Iterable[mido.Message]:
    midi_file = mido.MidiFile(path)
    for msg in midi_file:
        if msg.time > 0:
            time.sleep(msg.time)
        if not msg.is_meta:
            yield msg


def play_midi_file(player: RealisticPianoSynth, midi_path: Path) -> None:
    for msg in iter_midi_file_messages(midi_path):
        player.handle_message(msg)


def play_input_port(player: RealisticPianoSynth, port_name: str | None = None) -> None:
    with mido.open_input(port_name) as port:
        print(f"Listening on MIDI input: {port.name}")
        for msg in port:
            player.handle_message(msg)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Play MIDI through a realistic FluidSynth piano SoundFont.")
    parser.add_argument("--sf2", required=True, type=Path, help="Path to a piano .sf2 SoundFont.")
    parser.add_argument("--midi", type=Path, help="MIDI file to play in real time.")
    parser.add_argument("--port", help="MIDI input port name for live keyboard input.")
    parser.add_argument("--driver", help="FluidSynth audio driver, e.g. dsound, wasapi, coreaudio, alsa.")
    parser.add_argument("--gain", type=float, default=0.55, help="FluidSynth output gain.")
    parser.add_argument("--bank", type=int, default=0, help="SoundFont bank number.")
    parser.add_argument("--preset", type=int, default=0, help="SoundFont preset/program number.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.midi and not args.port:
        raise SystemExit("Provide either --midi <file.mid> or --port <midi input name>.")

    player = RealisticPianoSynth(
        args.sf2,
        audio_driver=args.driver,
        gain=args.gain,
        bank=args.bank,
        preset=args.preset,
    )
    try:
        if args.midi:
            play_midi_file(player, args.midi)
        else:
            play_input_port(player, args.port)
    finally:
        player.close()


if __name__ == "__main__":
    main()
