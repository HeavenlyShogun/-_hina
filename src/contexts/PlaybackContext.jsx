import React, { createContext, useContext } from 'react';

const PlaybackContext = createContext(null);

export function PlaybackProvider({ value, children }) {
  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const context = useContext(PlaybackContext);

  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider.');
  }

  return context;
}

export default PlaybackContext;
