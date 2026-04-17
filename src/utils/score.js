import { mapKey } from '../constants/music';

export function parseScoreData(txt, bpmVal, sigNum, sigDen, charRes) {
  const events = [];
  const beatDuration = 60 / bpmVal;
  const tickDuration = beatDuration * (sigDen / charRes) * (4 / sigNum);
  let currentTime = 0;
  const cleanTxt = txt.replace(/\/\/.*$/gm, '').replace(/[ \t]+$/gm, '');

  let index = 0;
  while (index < cleanTxt.length) {
    const char = cleanTxt[index];
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
      const bracketKeys = [];
      while (index < cleanTxt.length && cleanTxt[index] !== ')') {
        let token = cleanTxt[index];
        if (token === ' ' || token === '\n' || token === '\r' || token === '\t') {
          index += 1;
          continue;
        }
        if ((token === '+' || token === '-' || token === '嚗?' || token === '嚗?') && index + 1 < cleanTxt.length) {
          const nextChar = cleanTxt[index + 1];
          if (nextChar >= '1' && nextChar <= '7') {
            token += nextChar;
            index += 1;
          }
        }
        const mapped = mapKey(token);
        if (mapped) bracketKeys.push(mapped);
        index += 1;
      }
      if (cleanTxt[index] === ')') index += 1;
      if (bracketKeys.length > 0) {
        bracketKeys.forEach((key, chordIndex) => {
          events.push({ time: currentTime + chordIndex * 0.012, k: key, durationSec: tickDuration * 4, v: 0.85 });
        });
        currentTime += tickDuration;
      }
      continue;
    }
    if (char === '|') {
      const beats = currentTime / beatDuration;
      if (Math.abs(beats - Math.round(beats)) > 0.01) currentTime = Math.ceil(beats - 0.01) * beatDuration;
      index += 1;
      continue;
    }

    let token = char;
    if ((token === '+' || token === '-' || token === '嚗?' || token === '嚗?') && index + 1 < cleanTxt.length) {
      const nextChar = cleanTxt[index + 1];
      if (nextChar >= '1' && nextChar <= '7') {
        token += nextChar;
        index += 1;
      }
    }
    const mapped = mapKey(token);
    if (mapped) {
      events.push({ time: currentTime, k: mapped, durationSec: tickDuration * 4, v: 0.85 });
      currentTime += tickDuration;
    }
    index += 1;
  }

  return { events, maxTime: currentTime };
}
