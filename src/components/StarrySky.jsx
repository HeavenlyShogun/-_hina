import React, { memo } from 'react';

const STAR_COUNT = 100;
const StarrySky = memo(() => (
  <div className="pointer-events-none fixed inset-0">
    {Array.from({ length: STAR_COUNT }).map((_, i) => (
      <div
        key={i}
        className="absolute rounded-full bg-white animate-twinkle"
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          width: `${Math.random() * 2 + 1}px`,
          height: `${Math.random() * 2 + 1}px`,
          animationDelay: `${Math.random() * 5}s`,
        }}
      />
    ))}
  </div>
));

export default StarrySky;
