import { mapKey } from '../constants/music';

const OCTAVE_PREFIXES = new Set(['+', '-', '↑', '↓']);

function stripScoreComments(text) {
  return text.replace(/\/\/.*$/gm, '').replace(/[ \t]+$/gm, '');
}

function createTiming(bpmVal, sigNum, sigDen, charRes) {
  const beatDuration = 60 / bpmVal;
  const tickDuration = beatDuration * (sigDen / charRes) * (4 / sigNum);
  return { beatDuration, tickDuration };
}

function readToken(text, startIndex) {
  let nextIndex = startIndex + 1;
  let token = text[startIndex];

  if (OCTAVE_PREFIXES.has(token) && nextIndex < text.length) {
    const nextChar = text[nextIndex];
    if (nextChar >= '1' && nextChar <= '7') {
      token += nextChar;
      nextIndex += 1;
    }
  }

  return { token, nextIndex };
}

function pushNoteEvent(events, key, currentTime, durationSec, velocity, offset = 0) {
  events.push({ time: currentTime + offset, k: key, durationSec, v: velocity });
}

export function parseScoreData(text, bpmVal, sigNum, sigDen, charRes) {
  const events = [];
  const { beatDuration, tickDuration } = createTiming(bpmVal, sigNum, sigDen, charRes);
  const cleanText = stripScoreComments(text);
  let currentTime = 0;
  let index = 0;

  while (index < cleanText.length) {
    const char = cleanText[index];

    if (char === '\n' || char === '\r') {
      index += 1;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\u3000') {
      currentTime += tickDuration;
      index += 1;
      continue;
    }

    if (char === '(') {
      index += 1;
      const chordKeys = [];

      while (index < cleanText.length && cleanText[index] !== ')') {
        const chordChar = cleanText[index];
        if (chordChar === ' ' || chordChar === '\n' || chordChar === '\r' || chordChar === '\t') {
          index += 1;
          continue;
        }

        const { token, nextIndex } = readToken(cleanText, index);
        const mappedKey = mapKey(token);
        if (mappedKey) chordKeys.push(mappedKey);
        index = nextIndex;
      }

      if (cleanText[index] === ')') index += 1;

      if (chordKeys.length > 0) {
        chordKeys.forEach((key, chordIndex) => {
          pushNoteEvent(events, key, currentTime, tickDuration * 4, 0.85, chordIndex * 0.012);
        });
        currentTime += tickDuration;
      }

      continue;
    }

    if (char === '|') {
      const beats = currentTime / beatDuration;
      if (Math.abs(beats - Math.round(beats)) > 0.01) {
        currentTime = Math.ceil(beats - 0.01) * beatDuration;
      }
      index += 1;
      continue;
    }

    const { token, nextIndex } = readToken(cleanText, index);
    const mappedKey = mapKey(token);
    if (mappedKey) {
      pushNoteEvent(events, mappedKey, currentTime, tickDuration * 4, 0.85);
      currentTime += tickDuration;
    }
    index = nextIndex;
  }

  return { events, maxTime: currentTime };
}
