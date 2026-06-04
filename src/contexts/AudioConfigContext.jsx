import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SCORE_PARAMS, normalizeToneSelection } from '../constants/music';

const AudioConfigContext = createContext(null);

const DEFAULT_AUDIO_CONFIG = {
  vol: 0.6,
  tone: DEFAULT_SCORE_PARAMS.tone,
  reverb: DEFAULT_SCORE_PARAMS.reverb,
  globalKeyOffset: DEFAULT_SCORE_PARAMS.globalKeyOffset,
  scaleMode: DEFAULT_SCORE_PARAMS.scaleMode,
};
const AUDIO_CONFIG_STORAGE_KEY = 'hina-audio-config@2';
const LEGACY_AUDIO_CONFIG_KEYS = [
  'hina-audio-config',
  'hina-audio-settings',
  'universal-rhythm-recorder-audio',
];

function resolveNextValue(nextValue, currentValue) {
  return typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
}

function readStoredAudioConfig() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    LEGACY_AUDIO_CONFIG_KEYS.forEach((key) => window.localStorage.removeItem(key));
    const stored = JSON.parse(window.localStorage.getItem(AUDIO_CONFIG_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object'
      ? {
        ...(stored.vol === undefined ? {} : { vol: stored.vol }),
        ...(stored.tone === undefined ? {} : { tone: normalizeToneSelection(stored.tone) }),
        ...(stored.reverb === undefined ? {} : { reverb: stored.reverb }),
        ...(stored.globalKeyOffset === undefined ? {} : { globalKeyOffset: stored.globalKeyOffset }),
        ...(stored.scaleMode === undefined ? {} : { scaleMode: stored.scaleMode }),
      }
      : {};
  } catch {
    return {};
  }
}

function writeStoredAudioConfig(config) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(AUDIO_CONFIG_STORAGE_KEY, JSON.stringify({
      vol: config.vol,
      tone: config.tone,
      reverb: config.reverb,
      globalKeyOffset: config.globalKeyOffset,
      scaleMode: config.scaleMode,
    }));
  } catch {}
}

export function AudioConfigProvider({
  initialConfig = {},
  onConfigChange,
  children,
}) {
  const onConfigChangeRef = useRef(onConfigChange);
  const [config, setConfig] = useState(() => {
    const storedConfig = readStoredAudioConfig();

    return {
      ...DEFAULT_AUDIO_CONFIG,
      ...initialConfig,
      ...storedConfig,
      tone: normalizeToneSelection(storedConfig.tone ?? initialConfig.tone ?? DEFAULT_AUDIO_CONFIG.tone),
    };
  });

  useEffect(() => {
    onConfigChangeRef.current = onConfigChange;
  }, [onConfigChange]);

  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      ...(initialConfig.vol === undefined ? {} : { vol: initialConfig.vol }),
      ...(initialConfig.reverb === undefined ? {} : { reverb: initialConfig.reverb }),
      ...(initialConfig.globalKeyOffset === undefined ? {} : { globalKeyOffset: initialConfig.globalKeyOffset }),
      ...(initialConfig.scaleMode === undefined ? {} : { scaleMode: initialConfig.scaleMode }),
    }));
  }, [
    initialConfig.globalKeyOffset,
    initialConfig.reverb,
    initialConfig.scaleMode,
    initialConfig.vol,
  ]);

  useEffect(() => {
    writeStoredAudioConfig(config);
  }, [config]);

  const updateConfig = useCallback((updater, options = {}) => {
    setConfig((prev) => {
      const patch = typeof updater === 'function' ? updater(prev) : updater;
      const next = { ...prev, ...patch };

      if (!options.silent && onConfigChangeRef.current) {
        onConfigChangeRef.current(patch, next);
      }

      return next;
    });
  }, []);

  const setVol = useCallback((nextValue) => {
    updateConfig((prev) => ({ vol: resolveNextValue(nextValue, prev.vol) }));
  }, [updateConfig]);

  const setTone = useCallback((nextValue) => {
    updateConfig((prev) => ({ tone: normalizeToneSelection(resolveNextValue(nextValue, prev.tone)) }));
  }, [updateConfig]);

  const setReverb = useCallback((nextValue) => {
    updateConfig((prev) => ({ reverb: resolveNextValue(nextValue, prev.reverb) }));
  }, [updateConfig]);

  const onToggleReverb = useCallback(() => {
    updateConfig((prev) => ({ reverb: !prev.reverb }));
  }, [updateConfig]);

  const setGlobalKeyOffset = useCallback((nextValue) => {
    updateConfig((prev) => ({
      globalKeyOffset: resolveNextValue(nextValue, prev.globalKeyOffset),
    }));
  }, [updateConfig]);

  const setScaleMode = useCallback((nextValue) => {
    updateConfig((prev) => ({ scaleMode: resolveNextValue(nextValue, prev.scaleMode) }));
  }, [updateConfig]);

  const value = useMemo(() => ({
    ...config,
    setVol,
    setTone,
    setReverb,
    onToggleReverb,
    setGlobalKeyOffset,
    setScaleMode,
    renderConfig: {
      tone: config.tone,
      outputGain: config.vol,
      reverbAmount: config.reverb ? 0.45 : 0,
    },
  }), [
    config,
    onToggleReverb,
    setGlobalKeyOffset,
    setReverb,
    setScaleMode,
    setTone,
    setVol,
  ]);

  return (
    <AudioConfigContext.Provider value={value}>
      {children}
    </AudioConfigContext.Provider>
  );
}

export function useAudioConfig() {
  const context = useContext(AudioConfigContext);

  if (!context) {
    throw new Error('useAudioConfig must be used within an AudioConfigProvider.');
  }

  return context;
}

export default AudioConfigContext;
