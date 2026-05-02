import { readFile, readdir, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { normalizeScoreSource, PPQ } from '../src/utils/score.js';

const SCORE_DIR = path.resolve(process.cwd(), '風物之琴譜', '可匯入譜面');
const META_PREFIX = '// [META] ';
const DEFAULT_VELOCITY = 0.75;
const DEFAULT_SCALE_MODE = 'major';
const DEFAULT_GLOBAL_KEY_OFFSET = 0;

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

function parseMetaAndContent(rawText, filename) {
  const normalized = String(rawText ?? '').replace(/^\uFEFF/u, '');
  const [firstLine, ...rest] = normalized.split(/\r?\n/u);

  if (!firstLine.startsWith(META_PREFIX)) {
    return {
      meta: {
        title: path.basename(filename, path.extname(filename)),
      },
      content: normalized,
    };
  }

  try {
    return {
      meta: JSON.parse(firstLine.slice(META_PREFIX.length)),
      content: rest.join('\n').replace(/^\n/u, ''),
    };
  } catch {
    return {
      meta: {
        title: path.basename(filename, path.extname(filename)),
      },
      content: normalized,
    };
  }
}

function noteNameToMidi(noteName) {
  const match = /^([A-G])([#b]?)(-?\d+)$/u.exec(String(noteName || ''));
  if (!match) {
    return null;
  }

  const [, letter, accidental, octaveText] = match;
  const semitones = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  let midi = (Number(octaveText) + 1) * 12 + semitones[letter];
  if (accidental === '#') midi += 1;
  if (accidental === 'b') midi -= 1;
  return midi;
}

function getScaleIntervals(scaleMode) {
  return scaleMode === 'minor' ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
}

function createPlaybackConfig(meta = {}) {
  return {
    bpm: Number(meta.bpm) || 120,
    timeSigNum: Number(meta.timeSigNum) || 4,
    timeSigDen: Number(meta.timeSigDen) || 4,
    charResolution: Number(meta.charResolution) || 8,
    globalKeyOffset: Number(meta.globalKeyOffset) || DEFAULT_GLOBAL_KEY_OFFSET,
    scaleMode: meta.scaleMode ?? DEFAULT_SCALE_MODE,
    legacyTimingMode: meta.legacyTimingMode,
    textNotation: meta.legacyTimingMode === 'beat' ? 'legacy-beat' : 'legacy',
  };
}

function eventToMidi(event, playback) {
  if (
    event?.midi !== undefined
    && event?.midi !== null
    && event?.midi !== ''
    && Number.isFinite(Number(event.midi))
  ) {
    return Math.round(Number(event.midi));
  }

  if (typeof event?.noteName === 'string') {
    const direct = noteNameToMidi(event.noteName);
    if (Number.isFinite(direct)) {
      return direct;
    }
  }

  if (typeof event?.k === 'string') {
    const keyMap = {
      q: 'C5', w: 'D5', e: 'E5', r: 'F5', t: 'G5', y: 'A5', u: 'B5',
      a: 'C4', s: 'D4', d: 'E4', f: 'F4', g: 'G4', h: 'A4', j: 'B4',
      z: 'C3', x: 'D3', c: 'E3', v: 'F3', b: 'G3', n: 'A3', m: 'B3',
    };
    const noteName = keyMap[event.k];
    const baseMidi = noteNameToMidi(noteName);
    if (Number.isFinite(baseMidi)) {
      return baseMidi + (Number(playback.globalKeyOffset) || 0);
    }
  }

  return null;
}

function midiToNumberedToken(midi, playback) {
  const tonicOffset = Number(playback.globalKeyOffset) || 0;
  const tonicMidi = 60 + tonicOffset;
  const intervals = getScaleIntervals(playback.scaleMode);
  const delta = midi - tonicMidi;
  let octaveShift = Math.floor(delta / 12);
  let pitchClass = ((delta % 12) + 12) % 12;
  let accidental = '';
  let degreeIndex = intervals.findIndex((value) => value === pitchClass);

  if (degreeIndex < 0) {
    for (let index = 0; index < intervals.length; index += 1) {
      if (intervals[index] + 1 === pitchClass) {
        degreeIndex = index;
        accidental = '#';
        break;
      }

      if (intervals[index] - 1 === pitchClass) {
        degreeIndex = index;
        accidental = 'b';
        break;
      }
    }
  }

  if (degreeIndex < 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    intervals.forEach((value, index) => {
      const distance = Math.abs(value - pitchClass);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    degreeIndex = bestIndex;
    accidental = '';
  }

  const octaveMarks = octaveShift > 0
    ? "'".repeat(octaveShift)
    : ','.repeat(Math.abs(octaveShift));

  return `${accidental}${degreeIndex + 1}${octaveMarks}`;
}

function buildDurationCandidates() {
  const candidates = [];

  for (let dashCount = 0; dashCount <= 8; dashCount += 1) {
    for (let underscoreCount = 0; underscoreCount <= 4; underscoreCount += 1) {
      for (let dotCount = 0; dotCount <= 2; dotCount += 1) {
        const base = (PPQ * (1 + dashCount)) / (2 ** underscoreCount);
        let total = base;
        for (let dotIndex = 0; dotIndex < dotCount; dotIndex += 1) {
          total += base / (2 ** (dotIndex + 1));
        }

        const ticks = Math.round(total);
        const modifiers = `${'-'.repeat(dashCount)}${'_'.repeat(underscoreCount)}${'.'.repeat(dotCount)}`;
        candidates.push({
          ticks,
          modifiers,
          weight: modifiers.length,
        });
      }
    }
  }

  return [...new Map(candidates.map((item) => [`${item.ticks}:${item.modifiers}`, item])).values()]
    .sort((left, right) => {
      if (left.ticks !== right.ticks) {
        return right.ticks - left.ticks;
      }
      return left.weight - right.weight;
    });
}

const DURATION_CANDIDATES = buildDurationCandidates();

function findDurationPieces(targetTicks) {
  const cache = new Map();

  function solve(remaining) {
    if (remaining === 0) {
      return [];
    }

    if (cache.has(remaining)) {
      return cache.get(remaining);
    }

    let best = null;

    for (const candidate of DURATION_CANDIDATES) {
      if (candidate.ticks > remaining) {
        continue;
      }

      const rest = solve(remaining - candidate.ticks);
      if (!rest) {
        continue;
      }

      const attempt = [candidate, ...rest];
      if (
        !best
        || attempt.length < best.length
        || (attempt.length === best.length
          && attempt.reduce((sum, item) => sum + item.weight, 0) < best.reduce((sum, item) => sum + item.weight, 0))
      ) {
        best = attempt;
      }
    }

    cache.set(remaining, best);
    return best;
  }

  return solve(Math.max(0, Math.round(Number(targetTicks) || 0))) ?? [];
}

function stringifyEventToken(notes, durationTicks, playback) {
  const durationPieces = findDurationPieces(durationTicks);
  if (!durationPieces.length) {
    return [];
  }

  return durationPieces.map((piece, index) => {
    const body = notes.length === 0
      ? '0'
      : notes.length === 1
        ? midiToNumberedToken(notes[0], playback)
        : `[${notes.map((midi) => midiToNumberedToken(midi, playback)).join('')}]`;

    if (index === 0) {
      return `${body}${piece.modifiers}`;
    }

    return `0${piece.modifiers}`;
  });
}

function convertEventsToNumberedText(normalized, playback) {
  const grouped = new Map();

  normalized.events.forEach((event) => {
    if (event?.isRest) {
      return;
    }

    const startTick = Math.max(0, Math.round(Number(event.tick) || 0));
    const durationTicks = Math.max(1, Math.round(Number(event.durationTicks) || 1));
    const key = `${event.trackId ?? 'M'}:${startTick}:${durationTicks}`;
    const midi = eventToMidi(event, playback);

    if (!Number.isFinite(midi)) {
      return;
    }

    if (!grouped.has(key)) {
      grouped.set(key, {
        trackId: event.trackId ?? 'M',
        startTick,
        durationTicks,
        notes: [],
      });
    }

    grouped.get(key).notes.push(midi);
  });

  const trackGroups = new Map();

  [...grouped.values()]
    .sort((left, right) => left.startTick - right.startTick)
    .forEach((group) => {
      const trackId = group.trackId === 'main' ? 'M' : String(group.trackId || 'M').toUpperCase();
      if (!trackGroups.has(trackId)) {
        trackGroups.set(trackId, []);
      }
      trackGroups.get(trackId).push(group);
    });

  const lines = [];

  trackGroups.forEach((groups, trackId) => {
    let cursor = 0;
    const tokens = [];

    groups.forEach((group) => {
      if (group.startTick > cursor) {
        tokens.push(...stringifyEventToken([], group.startTick - cursor, playback));
        cursor = group.startTick;
      }

      tokens.push(...stringifyEventToken(group.notes, group.durationTicks, playback));
      cursor += group.durationTicks;
    });

    const chunks = [];
    for (let index = 0; index < tokens.length; index += 16) {
      chunks.push(tokens.slice(index, index + 16));
    }

    chunks.forEach((chunk) => {
      lines.push(`${trackId}: ${chunk.join(' ')}`.trim());
    });
  });

  return lines.join('\n').trim();
}

async function migrateFile(entryName) {
  const filePath = path.join(SCORE_DIR, entryName);
  const backupPath = filePath.replace(/\.txt$/iu, '.legacy.bak.txt');
  let sourcePath = filePath;

  try {
    await access(backupPath);
    sourcePath = backupPath;
  } catch {}

  const rawText = await readFile(sourcePath, 'utf8');
  const { meta, content } = parseMetaAndContent(rawText, entryName);
  const playback = createPlaybackConfig(meta);
  const normalized = normalizeScoreSource(content, playback);
  const numberedText = convertEventsToNumberedText(normalized, playback);

  const nextMeta = {
    ...meta,
    title: meta.title ?? path.basename(entryName, path.extname(entryName)),
    textNotation: 'jianpu',
    storageFormat: 'numbered-text@1',
    ppq: PPQ,
  };

  if (sourcePath === filePath) {
    await copyFile(filePath, backupPath);
  }
  await writeFile(filePath, `${META_PREFIX}${JSON.stringify(nextMeta)}\n${numberedText}\n`, 'utf8');

  return {
    file: entryName,
    backup: path.basename(backupPath),
    tokens: numberedText.split(/\s+/u).filter(Boolean).length,
  };
}

async function main() {
  const entries = await readdir(SCORE_DIR, { withFileTypes: true });
  const targets = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt') && !entry.name.endsWith('.legacy.bak.txt'))
    .map((entry) => entry.name);

  const summary = [];
  for (const target of targets) {
    summary.push(await migrateFile(target));
  }

  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
