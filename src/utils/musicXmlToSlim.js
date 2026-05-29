import { DEFAULT_SCORE_PARAMS } from '../constants/music';

const DEFAULT_RESOLUTION = 480;
const DEFAULT_VELOCITY = 0.7087;

function slugifyFilename(value) {
  return String(value || 'score')
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'score';
}

function stripExtension(filename) {
  return String(filename || 'MusicXML score').replace(/\.[^.]+$/u, '') || 'MusicXML score';
}

function getLocalName(element) {
  return element?.localName || element?.tagName || '';
}

function childElements(parent, localName = null) {
  return Array.from(parent?.children ?? [])
    .filter((entry) => !localName || getLocalName(entry) === localName);
}

function descendantElements(parent, localName) {
  return Array.from(parent?.getElementsByTagName?.('*') ?? [])
    .filter((entry) => getLocalName(entry) === localName);
}

function firstDescendant(parent, localName) {
  return descendantElements(parent, localName)[0] ?? null;
}

function hasDescendant(parent, localName) {
  return Boolean(firstDescendant(parent, localName));
}

function findByPath(parent, selector) {
  const parts = String(selector || '').trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return null;

  return parts.reduce((current, part, index) => {
    if (!current) return null;
    return index === 0
      ? firstDescendant(current, part)
      : childElements(current, part)[0] ?? null;
  }, parent);
}

function readFirstText(parent, selector) {
  return findByPath(parent, selector)?.textContent?.trim() ?? '';
}

function readDirectText(parent, tagName) {
  if (!parent) return '';

  const child = childElements(parent, tagName)[0];
  return child?.textContent?.trim() ?? '';
}

function parseXmlDocument(xmlText) {
  if (typeof DOMParser !== 'function') {
    throw new Error('此環境不支援 MusicXML 解析，請在瀏覽器內匯入。');
  }

  const document = new DOMParser().parseFromString(String(xmlText ?? '').replace(/^\uFEFF/u, ''), 'application/xml');
  const parserError = firstDescendant(document, 'parsererror');

  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'Invalid MusicXML document.');
  }

  const rootName = getLocalName(document.documentElement);
  if (rootName !== 'score-partwise' && rootName !== 'score-timewise') {
    throw new Error('This does not look like a MusicXML score.');
  }

  return document;
}

function pitchToMidi(pitchElement) {
  const step = readDirectText(pitchElement, 'step').toUpperCase();
  const alter = Number(readDirectText(pitchElement, 'alter')) || 0;
  const octave = Number(readDirectText(pitchElement, 'octave'));
  const pitchClass = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  }[step];

  if (!Number.isFinite(pitchClass) || !Number.isFinite(octave)) {
    return null;
  }

  return Math.max(0, Math.min(127, Math.round(((octave + 1) * 12) + pitchClass + alter)));
}

function getPartNames(document) {
  return Object.fromEntries(
    descendantElements(document, 'score-part').map((part, index) => {
      const id = part.getAttribute('id') || `P${index + 1}`;
      const name = readFirstText(part, 'part-name') || readFirstText(part, 'part-abbreviation') || `Track ${index + 1}`;
      return [id, name];
    }),
  );
}

function getTitle(document, fallbackTitle) {
  return (
    readFirstText(document, 'movement-title')
    || readFirstText(document, 'work work-title')
    || fallbackTitle
  );
}

function getInitialTempo(document, fallbackBpm) {
  const soundTempo = descendantElements(document, 'sound')
    .map((sound) => Number(sound.getAttribute('tempo')))
    .find((tempo) => Number.isFinite(tempo) && tempo > 0);

  if (soundTempo) {
    return soundTempo;
  }

  const perMinute = Number(readFirstText(document, 'metronome per-minute'));
  return Number.isFinite(perMinute) && perMinute > 0 ? perMinute : fallbackBpm;
}

function getInitialTimeSignature(document, options) {
  const time = findByPath(document, 'attributes time');
  const beats = Number(readDirectText(time, 'beats'));
  const beatType = Number(readDirectText(time, 'beat-type'));

  return {
    timeSigNum: Number.isFinite(beats) && beats > 0 ? beats : options.timeSigNum,
    timeSigDen: Number.isFinite(beatType) && beatType > 0 ? beatType : options.timeSigDen,
  };
}

function getDurationTicks(noteElement, divisions, resolution) {
  const rawDuration = Number(readDirectText(noteElement, 'duration'));
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    return 0;
  }

  const safeDivisions = Math.max(Number(divisions) || 1, 1);
  return Math.max(1, Math.round((rawDuration / safeDivisions) * resolution));
}

function getSlimScoreEndTick(score) {
  if (!Array.isArray(score?.notes)) {
    return 0;
  }

  return score.notes.reduce((endTick, note) => {
    if (!Array.isArray(note)) return endTick;
    const startTick = Number(note[0]) || 0;
    const durationTicks = Number(note[1]) || 0;
    return Math.max(endTick, startTick + durationTicks);
  }, 0);
}

function getDynamicsVelocity(noteElement) {
  const velocity = Number(firstDescendant(noteElement, 'sound')?.getAttribute('dynamics'));
  if (!Number.isFinite(velocity)) {
    return DEFAULT_VELOCITY;
  }

  return Number(Math.min(1, Math.max(0, velocity / 127)).toFixed(4));
}

function parsePart(part, trackIndex, resolution) {
  let currentTick = 0;
  let divisions = 1;
  let lastNoteStartTick = 0;
  const notes = [];

  childElements(part, 'measure')
    .forEach((measure) => {
      const nextDivisions = Number(readFirstText(measure, 'attributes divisions'));
      if (Number.isFinite(nextDivisions) && nextDivisions > 0) {
        divisions = nextDivisions;
      }

      Array.from(measure.children).forEach((element) => {
        const elementName = getLocalName(element);

        if (elementName === 'backup') {
          const durationTicks = getDurationTicks(element, divisions, resolution);
          currentTick = Math.max(0, currentTick - durationTicks);
          return;
        }

        if (elementName === 'forward') {
          currentTick += getDurationTicks(element, divisions, resolution);
          return;
        }

        if (elementName !== 'note' || hasDescendant(element, 'grace')) {
          return;
        }

        const durationTicks = getDurationTicks(element, divisions, resolution);
        const isChordTone = hasDescendant(element, 'chord');
        const noteStartTick = isChordTone ? lastNoteStartTick : currentTick;

        if (hasDescendant(element, 'rest')) {
          if (!isChordTone) {
            currentTick += durationTicks;
          }
          return;
        }

        const pitch = firstDescendant(element, 'pitch');
        const midi = pitchToMidi(pitch);

        if (midi !== null && durationTicks > 0) {
          notes.push([
            noteStartTick,
            durationTicks,
            midi,
            getDynamicsVelocity(element),
            trackIndex,
          ]);
        }

        if (!isChordTone) {
          lastNoteStartTick = noteStartTick;
          currentTick += durationTicks;
        }
      });
    });

  return notes;
}

export function convertMusicXmlToSlim(xmlText, options = {}) {
  const document = parseXmlDocument(xmlText);
  const fileName = options.fileName || 'score.musicxml';
  const fallbackTitle = options.title || stripExtension(fileName);
  const title = getTitle(document, fallbackTitle);
  const originalFormat = String(options.originalFormat || 'musicxml').toLowerCase();
  const resolution = Math.max(Number(options.resolution) || DEFAULT_RESOLUTION, 1);
  const bpm = getInitialTempo(document, options.bpm || DEFAULT_SCORE_PARAMS.bpm);
  const { timeSigNum, timeSigDen } = getInitialTimeSignature(document, {
    timeSigNum: options.timeSigNum || DEFAULT_SCORE_PARAMS.timeSigNum,
    timeSigDen: options.timeSigDen || DEFAULT_SCORE_PARAMS.timeSigDen,
  });
  const partNames = getPartNames(document);
  const root = document.documentElement;
  const parts = getLocalName(root) === 'score-partwise'
    ? childElements(root, 'part')
    : [];

  if (!parts.length) {
    throw new Error('No MusicXML parts were found. score-timewise conversion is not supported yet.');
  }

  const tracks = parts.map((part, index) => {
    const id = part.getAttribute('id') || `P${index + 1}`;
    return [partNames[id] || `Track ${index + 1}`, index, 'musicxml'];
  });
  const notes = parts.flatMap((part, index) => parsePart(part, index, resolution))
    .sort((left, right) => left[0] - right[0] || left[4] - right[4] || left[2] - right[2] || left[1] - right[1]);
  const articulationRatio = Number(options.articulationRatio);
  const safeArticulationRatio = Number.isFinite(articulationRatio)
    ? Math.min(1, Math.max(0.1, articulationRatio))
    : 1;
  const articulatedNotes = safeArticulationRatio === 1
    ? notes
    : notes.map((note) => [
      note[0],
      Math.max(1, Math.round(note[1] * safeArticulationRatio)),
      note[2],
      note[3],
      note[4],
    ]);

  if (!articulatedNotes.length) {
    throw new Error('No playable notes were found in this MusicXML file.');
  }

  return {
    version: '3.2-ultra-slim',
    columns: ['startTick', 'durationTicks', 'note', 'velocity', 'trackId'],
    meta: {
      id: `${slugifyFilename(title)}-${Date.now()}`,
      title,
      displayTitle: title,
      sourceType: originalFormat,
      originalFormat,
      storageFormat: 'hina-slim-score@3.2',
      fileName,
      convertedAt: new Date().toISOString(),
      sourceFileCount: 1,
    },
    transport: {
      bpm,
      timeSigNum,
      timeSigDen,
      resolution,
    },
    playback: {
      tone: options.tone ?? DEFAULT_SCORE_PARAMS.tone,
      globalKeyOffset: Number(options.globalKeyOffset) || DEFAULT_SCORE_PARAMS.globalKeyOffset,
      scaleMode: options.scaleMode ?? DEFAULT_SCORE_PARAMS.scaleMode,
      reverb: options.reverb ?? DEFAULT_SCORE_PARAMS.reverb,
      accidentals: options.accidentals ?? DEFAULT_SCORE_PARAMS.accidentals,
      tempoMap: [[0, bpm]],
    },
    tracks,
    notes: articulatedNotes,
  };
}

export function mergeSlimScores(scores, options = {}) {
  const sourceScores = Array.isArray(scores) ? scores.filter(Boolean) : [];
  if (!sourceScores.length) {
    throw new Error('No converted MusicXML scores were provided.');
  }

  const resolution = Math.max(Number(sourceScores[0]?.transport?.resolution) || DEFAULT_RESOLUTION, 1);
  const bpm = Number(options.bpm) || Number(sourceScores[0]?.transport?.bpm) || DEFAULT_SCORE_PARAMS.bpm;
  const title = String(options.title || `combined_${sourceScores.length}_musicxml`).trim();
  const fileName = String(options.fileName || `${slugifyFilename(title)}.json`).trim();
  const sourceFormats = [...new Set(sourceScores
    .map((score) => score?.meta?.originalFormat || score?.meta?.sourceType)
    .filter(Boolean)
    .map((format) => String(format).toLowerCase()))];
  const originalFormat = sourceFormats.includes('mxl') ? 'mxl' : 'musicxml';
  const notes = [];
  const tracks = [];
  let currentOffset = 0;
  let nextTrackId = 0;

  sourceScores.forEach((score, scoreIndex) => {
    const trackIdMap = new Map();
    const sourceTracks = Array.isArray(score.tracks) ? score.tracks : [];

    sourceTracks.forEach((track, trackIndex) => {
      const sourceTrackId = Array.isArray(track) ? track[1] : track?.id ?? trackIndex;
      const newTrackId = nextTrackId;
      nextTrackId += 1;
      trackIdMap.set(String(sourceTrackId), newTrackId);
      tracks.push([
        `${scoreIndex + 1}. ${Array.isArray(track) ? track[0] : track?.name || `Track ${trackIndex + 1}`}`,
        newTrackId,
        Array.isArray(track) ? track[2] || 'musicxml' : 'musicxml',
      ]);
    });

    (score.notes || []).forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 3) return;
      const sourceTrackId = String(entry[4] ?? 0);
      notes.push([
        Math.max(0, Math.round((Number(entry[0]) || 0) + currentOffset)),
        Math.max(1, Math.round(Number(entry[1]) || 1)),
        Math.round(Number(entry[2]) || 60),
        Number.isFinite(Number(entry[3])) ? Number(entry[3]) : DEFAULT_VELOCITY,
        trackIdMap.get(sourceTrackId) ?? trackIdMap.get('0') ?? 0,
      ]);
    });

    currentOffset += getSlimScoreEndTick(score);
  });

  notes.sort((left, right) => left[0] - right[0] || left[4] - right[4] || left[2] - right[2] || left[1] - right[1]);

  return {
    version: '3.2-ultra-slim',
    columns: ['startTick', 'durationTicks', 'note', 'velocity', 'trackId'],
    meta: {
      id: `${slugifyFilename(title)}-${Date.now()}`,
      title,
      displayTitle: title,
      sourceType: originalFormat,
      originalFormat,
      storageFormat: 'hina-slim-score@3.2',
      fileName,
      convertedAt: new Date().toISOString(),
      sourceFileCount: sourceScores.length,
      sourceFormats,
    },
    transport: {
      bpm,
      timeSigNum: Number(options.timeSigNum) || Number(sourceScores[0]?.transport?.timeSigNum) || DEFAULT_SCORE_PARAMS.timeSigNum,
      timeSigDen: Number(options.timeSigDen) || Number(sourceScores[0]?.transport?.timeSigDen) || DEFAULT_SCORE_PARAMS.timeSigDen,
      resolution,
    },
    playback: {
      ...(sourceScores[0]?.playback ?? {}),
      bpm,
      tempoMap: [[0, bpm]],
    },
    tracks,
    notes,
  };
}
