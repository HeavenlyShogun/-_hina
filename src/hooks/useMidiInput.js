import { useEffect, useRef, useState } from 'react';
import { ALL_KEYS_FLAT } from '../constants/music';

const MIDI_NOTE_TO_KEY = new Map(ALL_KEYS_FLAT.map((key) => [Math.round(69 + (12 * Math.log2(key.f / 440))), key.k]));

/** Bridge class-compliant USB MIDI Note On/Off messages to the app's 21-key layout. */
export function useMidiInput({ enabled = true, onKeyActivate, onKeyDeactivate } = {}) {
  const callbacksRef = useRef({ onKeyActivate, onKeyDeactivate });
  const activeNotesRef = useRef(new Map());
  const [status, setStatus] = useState('idle');
  const [inputNames, setInputNames] = useState([]);
  useEffect(() => { callbacksRef.current = { onKeyActivate, onKeyDeactivate }; }, [onKeyActivate, onKeyDeactivate]);
  useEffect(() => {
    if (!enabled) { setStatus('disabled'); return undefined; }
    if (!navigator.requestMIDIAccess) { setStatus('unsupported'); return undefined; }
    let disposed = false;
    let access;
    const releaseAll = () => {
      activeNotesRef.current.forEach((key) => callbacksRef.current.onKeyDeactivate?.(key, { source: 'midi' }));
      activeNotesRef.current.clear();
    };
    const handleMessage = (event) => {
      const [statusByte, note, velocity = 0] = event.data;
      const command = statusByte & 0xf0;
      const key = MIDI_NOTE_TO_KEY.get(note);
      if (!key || (command !== 0x90 && command !== 0x80)) return;
      if (command === 0x90 && velocity > 0) {
        if (activeNotesRef.current.has(note)) return;
        activeNotesRef.current.set(note, key);
        callbacksRef.current.onKeyActivate?.(key, { source: 'midi', note, velocity: velocity / 127 });
      } else if (activeNotesRef.current.has(note)) {
        activeNotesRef.current.delete(note);
        callbacksRef.current.onKeyDeactivate?.(key, { source: 'midi', note, velocity: velocity / 127 });
      }
    };
    const attachInputs = () => {
      const inputs = [...access.inputs.values()];
      inputs.forEach((input) => { input.onmidimessage = handleMessage; });
      setInputNames(inputs.map((input) => input.name || input.id));
      setStatus(inputs.length ? 'connected' : 'waiting');
    };
    navigator.requestMIDIAccess().then((midiAccess) => {
      if (disposed) return;
      access = midiAccess; attachInputs(); access.onstatechange = attachInputs;
    }).catch(() => { if (!disposed) setStatus('denied'); });
    return () => {
      disposed = true; releaseAll();
      if (access) { access.onstatechange = null; [...access.inputs.values()].forEach((input) => { input.onmidimessage = null; }); }
    };
  }, [enabled]);
  return { status, inputNames, midiNoteToKey: MIDI_NOTE_TO_KEY };
}

export default useMidiInput;
