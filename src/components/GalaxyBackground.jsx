import React, { useEffect, useRef } from 'react';

const STAR_COUNT = 16000;
const ARM_COUNT = 5;
const RESIZE_DEBOUNCE_MS = 200;
const TWO_PI = Math.PI * 2;
const STAR_SPIRAL_TWIST = Math.PI * 6.2;
const DUST_SPIRAL_TWIST = Math.PI * 6.4;
const DPR_LIMIT = 2;
const DUST_SPRITE_SIZE = 96;

let cachedDustSprite = null;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createDustSprite() {
  if (cachedDustSprite) {
    return cachedDustSprite;
  }

  const sprite = document.createElement('canvas');
  const ctx = sprite.getContext('2d');
  const center = DUST_SPRITE_SIZE / 2;

  sprite.width = DUST_SPRITE_SIZE;
  sprite.height = DUST_SPRITE_SIZE;

  const dust = ctx.createRadialGradient(center, center, 0, center, center, center);
  dust.addColorStop(0, 'rgba(78, 160, 255, 0.72)');
  dust.addColorStop(0.5, 'rgba(255, 168, 214, 0.24)');
  dust.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = dust;
  ctx.fillRect(0, 0, DUST_SPRITE_SIZE, DUST_SPRITE_SIZE);

  cachedDustSprite = sprite;
  return cachedDustSprite;
}

function drawGalaxy(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dustSprite = createDustSprite();

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.max(width, height) * 0.85;
  const coreRadius = Math.max(120, radius * 0.16);

  const background = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.75);
  background.addColorStop(0, 'rgba(24, 18, 38, 0.95)');
  background.addColorStop(0.42, 'rgba(5, 10, 26, 0.98)');
  background.addColorStop(1, 'rgba(1, 4, 12, 1)');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.15);
  ctx.scale(1, 0.48);

  ctx.globalCompositeOperation = 'lighter';

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.75);
  halo.addColorStop(0, 'rgba(255, 246, 225, 0.32)');
  halo.addColorStop(0.28, 'rgba(255, 176, 216, 0.15)');
  halo.addColorStop(0.62, 'rgba(66, 180, 255, 0.06)');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.98, radius * 0.5, 0, 0, TWO_PI);
  ctx.fill();

  /*
   * Spiral math:
   * Each star starts on one of several arms. Radius grows from the core outward,
   * then angle follows an Archimedean spiral: theta = armOffset + r * twist.
   * Scatter increases with radius so the arms bloom into cloudy bands.
   * The whole galaxy is rotated and ctx.scale(1, 0.48) compresses Y, turning
   * the circular spiral field into a tilted elliptical disk.
   */
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const arm = i % ARM_COUNT;
    const distance = Math.pow(Math.random(), 1.45);
    const r = distance * radius;
    const armOffset = (arm / ARM_COUNT) * TWO_PI;
    const theta = armOffset + distance * STAR_SPIRAL_TWIST + randomBetween(-0.16, 0.16);
    const scatter = (12 + distance * 82) * Math.pow(Math.random(), 1.8);
    const scatterAngle = randomBetween(0, TWO_PI);
    const x = Math.cos(theta) * r + Math.cos(scatterAngle) * scatter;
    const y = Math.sin(theta) * r + Math.sin(scatterAngle) * scatter;
    const warmth = Math.max(0, 1 - distance * 1.18);
    const alpha = randomBetween(0.05, 0.55) * (1 - distance * 0.42);
    const size = randomBetween(0.35, 1.45) * (1.25 - distance * 0.45);

    const red = Math.round(135 + warmth * 120);
    const green = Math.round(185 + warmth * 62);
    const blue = Math.round(255 - warmth * 58);

    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TWO_PI);
    ctx.fill();
  }

  for (let i = 0; i < 850; i += 1) {
    const distance = Math.pow(Math.random(), 1.25);
    const r = distance * radius * randomBetween(0.18, 1);
    const theta = distance * DUST_SPIRAL_TWIST + randomBetween(0, TWO_PI);
    const x = Math.cos(theta) * r + randomBetween(-45, 45);
    const y = Math.sin(theta) * r + randomBetween(-35, 35);
    const size = randomBetween(4, 22) * (1 - distance * 0.35);
    const alpha = randomBetween(0.05, 0.16) * (1 - distance * 0.25);

    ctx.globalAlpha = alpha;
    ctx.drawImage(dustSprite, x - size, y - size, size * 2, size * 2);
  }
  ctx.globalAlpha = 1;

  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
  core.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  core.addColorStop(0.16, 'rgba(255, 248, 220, 0.82)');
  core.addColorStop(0.42, 'rgba(255, 190, 215, 0.38)');
  core.addColorStop(0.76, 'rgba(95, 165, 255, 0.11)');
  core.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(0, 0, coreRadius * 1.35, coreRadius * 0.72, 0, 0, TWO_PI);
  ctx.fill();

  ctx.restore();
}

export default function GalaxyBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let resizeTimer = null;
    drawGalaxy(canvas);

    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        drawGalaxy(canvas);
      }, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
