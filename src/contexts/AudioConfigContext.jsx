import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SCORE_PARAMS } from '../constants/music';

const AudioConfigContext = createContext(null);

const DEFAULT_AUDIO_CONFIG = {
  vol: 0.6,
  tone: DEFAULT_SCORE_PARAMS.tone,
  reverb: DEFAULT_SCORE_PARAMS.reverb,
  globalKeyOffset: DEFAULT_SCORE_PARAMS.globalKeyOffset,
  scaleMode: DEFAULT_SCORE_PARAMS.scaleMode,
};

function resolveNextValue(nextValue, currentValue) {
  return typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
}

export function AudioConfigProvider({
  initialConfig = {},
  onConfigChange,
  children,
}) {
  const onConfigChangeRef = useRef(onConfigChange);
  const [config, setConfig] = useState(() => ({
    ...DEFAULT_AUDIO_CONFIG,
    ...initialConfig,
  }));

  useEffect(() => {
    onConfigChangeRef.current = onConfigChange;
  }, [onConfigChange]);

  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      ...(initialConfig.vol === undefined ? {} : { vol: initialConfig.vol }),
      ...(initialConfig.tone === undefined ? {} : { tone: initialConfig.tone }),
      ...(initialConfig.reverb === undefined ? {} : { reverb: initialConfig.reverb }),
      ...(initialConfig.globalKeyOffset === undefined ? {} : { globalKeyOffset: initialConfig.globalKeyOffset }),
      ...(initialConfig.scaleMode === undefined ? {} : { scaleMode: initialConfig.scaleMode }),
    }));
  }, [
    initialConfig.globalKeyOffset,
    initialConfig.reverb,
    initialConfig.scaleMode,
    initialConfig.tone,
    initialConfig.vol,
  ]);

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
    updateConfig((prev) => ({ tone: resolveNextValue(nextValue, prev.tone) }));
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
