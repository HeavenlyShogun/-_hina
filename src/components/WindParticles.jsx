import React, { memo } from 'react';

const WIND_PARTICLE_STYLES = Array.from({ length: 15 }, () => ({
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  fontSize: `${Math.random() * 20 + 10}px`,
  animation: `float ${Math.random() * 10 + 5}s linear infinite`,
}));

const WindParticles = memo(() => (
  <>
    {WIND_PARTICLE_STYLES.map((style, index) => (
      <div key={index} className="absolute pointer-events-none opacity-20 text-emerald-300/30 select-none" style={style} />
    ))}
  </>
));

export default WindParticles;
