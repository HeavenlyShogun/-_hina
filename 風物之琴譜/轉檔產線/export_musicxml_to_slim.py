import argparse
import json
from pathlib import Path


DEFAULT_RESOLUTION = 10080
DEFAULT_BPM = 120


def build_parser():
    parser = argparse.ArgumentParser(
        description="Export MusicXML directly to hina-slim-score@3.2 JSON.",
    )
    parser.add_argument("input", help="Path to a MusicXML file")
    parser.add_argument("output", help="Path to output slim JSON")
    parser.add_argument("--title", default="OMR_Export", help="Score title")
    parser.add_argument("--id", dest="score_id", default=None, help="Score id")
    parser.add_argument("--display-title", default=None, help="Display title")
    parser.add_argument("--bpm", type=float, default=DEFAULT_BPM, help="Fallback BPM")
    parser.add_argument("--resolution", type=int, default=DEFAULT_RESOLUTION, help="Ticks per whole note quarterLength")
    return parser


def load_music21():
    try:
        import music21  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "music21 is required. Install it with: pip install music21"
        ) from exc
    return music21


def normalize_velocity(volume):
    raw_velocity = getattr(volume, "velocity", None)
    if raw_velocity is None:
        return 0.7087
    return round(max(0.0, min(float(raw_velocity) / 127.0, 1.0)), 4)


def extract_bpm(score, fallback_bpm):
    for mark in score.recurse().getElementsByClass("MetronomeMark"):
        number = getattr(mark, "number", None)
        if number:
            return float(number)
    return float(fallback_bpm)


def extract_time_signature(score):
    for signature in score.recurse().getElementsByClass("TimeSignature"):
        if signature is not None:
            return int(signature.numerator), int(signature.denominator)
    return 4, 4


def score_id_from_title(title):
    normalized = "".join(
        char.lower() if char.isalnum() else "-" for char in str(title).strip()
    )
    normalized = "-".join(part for part in normalized.split("-") if part)
    return normalized or "score"


def export_to_slim_json(score, output_path, title, score_id, display_title, bpm, resolution):
    time_sig_num, time_sig_den = extract_time_signature(score)
    resolved_bpm = extract_bpm(score, bpm)
    notes = []
    tracks = []

    for part_idx, part in enumerate(score.parts):
        part_name = getattr(part, "partName", None) or f"track-{part_idx + 1}"
        tracks.append([part_name, part_idx, "unknown"])

        for element in part.flatten().notes:
            start_tick = int(round(float(element.offset) * resolution))
            duration_ticks = max(1, int(round(float(element.quarterLength) * resolution)))
            velocity = normalize_velocity(getattr(element, "volume", None))

            if getattr(element, "isNote", False):
                notes.append([
                    start_tick,
                    duration_ticks,
                    int(element.pitch.midi),
                    velocity,
                    part_idx,
                ])
                continue

            if getattr(element, "isChord", False):
                for pitch in element.pitches:
                    notes.append([
                        start_tick,
                        duration_ticks,
                        int(pitch.midi),
                        velocity,
                        part_idx,
                    ])

    notes.sort(key=lambda entry: (entry[0], entry[4], entry[2], entry[1]))

    slim_data = {
        "version": "3.2-ultra-slim",
        "columns": ["startTick", "durationTicks", "note", "velocity", "trackId"],
        "meta": {
            "id": score_id or score_id_from_title(title),
            "title": title,
            "displayTitle": display_title or title,
            "sourceType": "musicxml",
            "originalFormat": "musicxml",
            "storageFormat": "hina-slim-score@3.2",
            "fileName": Path(output_path).name,
        },
        "transport": {
            "bpm": resolved_bpm,
            "timeSigNum": time_sig_num,
            "timeSigDen": time_sig_den,
            "resolution": resolution,
        },
        "playback": {
            "tone": "piano",
            "globalKeyOffset": 0,
            "scaleMode": "major",
            "reverb": True,
            "accidentals": {},
            "tempoMap": [[0, resolved_bpm]],
        },
        "tracks": tracks,
        "notes": notes,
    }

    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(
        json.dumps(slim_data, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    print(f"Exported slim score: {output_file}")
    print(f"Notes: {len(notes)}, tracks: {len(tracks)}")


def main():
    args = build_parser().parse_args()
    music21 = load_music21()
    score = music21.converter.parse(args.input)
    export_to_slim_json(
      score=score,
      output_path=args.output,
      title=args.title,
      score_id=args.score_id,
      display_title=args.display_title,
      bpm=args.bpm,
      resolution=args.resolution,
    )


if __name__ == "__main__":
    main()
