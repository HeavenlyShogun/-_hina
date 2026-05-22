import React, { useEffect, useRef } from 'react';

const STAR_COUNT = 22000;
const ARM_COUNT = 5;
const RESIZE_DEBOUNCE_MS = 200;
const TWO_PI = Math.PI * 2;
const STAR_SPIRAL_TWIST = Math.PI * 7.2;
const DUST_SPIRAL_TWIST = Math.PI * 7.6;
const DPR_LIMIT = 2;
const DUST_SPRITE_SIZE = 96;
const MAX_WAVES = 18;
const MAX_COMETS = 42;

let cachedDustSprite = null;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function drawSoftEllipse(ctx, x, y, radiusX, radiusY, rotation, stops, sceneWidth, sceneHeight, alpha = 1) {
  const gradientRadius = Math.max(radiusX, radiusY);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, gradientRadius);

  stops.forEach(([offset, color]) => {
    gradient.addColorStop(offset, color);
  });

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(radiusX / gradientRadius, radiusY / gradientRadius);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, gradientRadius, 0, TWO_PI);
  ctx.fill();
  ctx.restore();

  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 650; i += 1) {
    const starX = randomBetween(0, sceneWidth);
    const starY = randomBetween(0, sceneHeight);
    const size = randomBetween(0.35, 1.9);
    const alpha = randomBetween(0.12, 0.72);
    const cool = Math.random() > 0.72;
    const warm = Math.random() > 0.88;
    const color = warm
      ? 'rgba(253, 224, 171, 1)'
      : cool
        ? 'rgba(191, 219, 254, 1)'
        : 'rgba(255, 255, 255, 1)';

    drawStar(ctx, starX, starY, size, color, alpha, i % 53 === 0);
  }

  ctx.globalCompositeOperation = 'source-over';
}

function drawDistantGalaxy(ctx, x, y, size, rotation, hueShift = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(1, 0.38);
  ctx.globalCompositeOperation = 'screen';

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
  halo.addColorStop(0, `hsla(${210 + hueShift}, 100%, 92%, 0.58)`);
  halo.addColorStop(0.2, `hsla(${280 + hueShift}, 96%, 74%, 0.18)`);
  halo.addColorStop(0.62, `hsla(${205 + hueShift}, 96%, 66%, 0.07)`);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, TWO_PI);
  ctx.fill();

  ctx.strokeStyle = 'rgba(219, 234, 254, 0.2)';
  ctx.lineWidth = Math.max(0.6, size * 0.018);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0.2, Math.PI * 1.3);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx, x, y, size, color, alpha, glow = false) {
  if (glow) {
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 7);
    glowGradient.addColorStop(0, color.replace(/[\d.]+\)$/, `${alpha * 0.42})`));
    glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, size * 7, 0, TWO_PI);
    ctx.fill();
  }

  ctx.fillStyle = color.replace(/[\d.]+\)$/, `${alpha})`);
  ctx.beginPath();
  ctx.arc(x, y, size, 0, TWO_PI);
  ctx.fill();
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
  const viewport = window.visualViewport;
  const width = Math.ceil(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
  const height = Math.ceil(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);
  const diagonal = Math.hypot(width, height);
  const aspectRatio = width / Math.max(height, 1);
  const wideScreenBoost = aspectRatio > 1.55 ? 1.12 : 1;
  const dustSprite = createDustSprite();

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.max(Math.max(width, height) * 1.08, diagonal * 0.98) * wideScreenBoost;
  const coreRadius = Math.max(120, radius * 0.16);

  const background = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(diagonal * 0.55, Math.max(width, height) * 0.75));
  background.addColorStop(0, 'rgba(24, 18, 42, 0.98)');
  background.addColorStop(0.36, 'rgba(6, 12, 32, 0.99)');
  background.addColorStop(1, 'rgba(1, 4, 12, 1)');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'screen';
  drawSoftEllipse(ctx, width * 0.18, height * 0.2, diagonal * 0.22, diagonal * 0.12, -0.35, [
    [0, 'rgba(244, 114, 182, 0.24)'],
    [0.36, 'rgba(168, 85, 247, 0.12)'],
    [1, 'rgba(0, 0, 0, 0)'],
  ], width, height);
  drawSoftEllipse(ctx, width * 0.74, height * 0.36, diagonal * 0.28, diagonal * 0.14, 0.24, [
    [0, 'rgba(56, 189, 248, 0.24)'],
    [0.42, 'rgba(129, 140, 248, 0.13)'],
    [1, 'rgba(0, 0, 0, 0)'],
  ], width, height);
  drawSoftEllipse(ctx, width * 0.5, height * 0.72, diagonal * 0.34, diagonal * 0.16, -0.08, [
    [0, 'rgba(192, 132, 252, 0.18)'],
    [0.4, 'rgba(244, 114, 182, 0.1)'],
    [1, 'rgba(0, 0, 0, 0)'],
  ], width, height);

  for (let i = 0; i < 18; i += 1) {
    drawDistantGalaxy(
      ctx,
      randomBetween(-width * 0.05, width * 1.05),
      randomBetween(height * 0.06, height * 0.94),
      randomBetween(8, 34) * (width > 1200 ? 1.25 : 0.9),
      randomBetween(-0.8, 0.8),
      randomBetween(-24, 36),
    );
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.13);
  ctx.scale(1.08, 0.46);

  ctx.globalCompositeOperation = 'lighter';

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.75);
  halo.addColorStop(0, 'rgba(255, 246, 225, 0.42)');
  halo.addColorStop(0.24, 'rgba(255, 176, 216, 0.22)');
  halo.addColorStop(0.48, 'rgba(85, 195, 255, 0.1)');
  halo.addColorStop(0.7, 'rgba(148, 163, 255, 0.05)');
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
    const scatter = (10 + distance * 96) * Math.pow(Math.random(), 1.7);
    const scatterAngle = randomBetween(0, TWO_PI);
    const x = Math.cos(theta) * r + Math.cos(scatterAngle) * scatter;
    const y = Math.sin(theta) * r + Math.sin(scatterAngle) * scatter;
    const warmth = Math.max(0, 1 - distance * 1.18);
    const alpha = randomBetween(0.06, 0.66) * (1 - distance * 0.38);
    const size = randomBetween(0.32, 1.65) * (1.3 - distance * 0.44);

    const red = Math.round(135 + warmth * 120);
    const green = Math.round(185 + warmth * 62);
    const blue = Math.round(255 - warmth * 58);

    drawStar(ctx, x, y, size, `rgba(${red}, ${green}, ${blue}, 1)`, alpha, i % 137 === 0);
  }

  for (let i = 0; i < 1400; i += 1) {
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

  ctx.globalCompositeOperation = 'multiply';
  ctx.lineCap = 'round';
  for (let armIndex = 0; armIndex < ARM_COUNT; armIndex += 1) {
    for (let band = 0; band < 3; band += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 150; step += 1) {
        const distance = step / 150;
        const r = radius * (0.1 + distance * 0.9);
        const theta = (armIndex / ARM_COUNT) * TWO_PI + distance * DUST_SPIRAL_TWIST + band * 0.055;
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r + Math.sin(distance * Math.PI * 8 + band) * 10;

        if (step === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.08 + band * 0.025})`;
      ctx.lineWidth = radius * (0.012 + band * 0.004);
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'lighter';
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
  core.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  core.addColorStop(0.13, 'rgba(255, 248, 220, 0.9)');
  core.addColorStop(0.34, 'rgba(255, 190, 215, 0.5)');
  core.addColorStop(0.64, 'rgba(95, 165, 255, 0.16)');
  core.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(0, 0, coreRadius * 1.35, coreRadius * 0.72, 0, 0, TWO_PI);
  ctx.fill();

  ctx.restore();
}

function hashKeyToUnit(key) {
  const input = String(key ?? '');
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 9973;
  }

  return hash / 9973;
}

function drawInteractions(ctx, waves, comets, width, height, now) {
  const coreX = width * 0.5;
  const coreY = height * 0.5;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let index = waves.length - 1; index >= 0; index -= 1) {
    const wave = waves[index];
    const age = now - wave.createdAt;
    const life = 900;
    const progress = age / life;

    if (progress >= 1) {
      waves.splice(index, 1);
      continue;
    }

    const radius = 18 + progress * Math.max(width, height) * 0.38 * wave.force;
    const alpha = (1 - progress) * 0.42;
    const stretch = 1 + Math.sin(progress * Math.PI) * 0.42;
    const gradient = ctx.createRadialGradient(wave.x, wave.y, radius * 0.15, wave.x, wave.y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.58, `rgba(125, 211, 252, ${alpha * 0.2})`);
    gradient.addColorStop(0.78, `rgba(255, 255, 255, ${alpha})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.translate(wave.x, wave.y);
    ctx.rotate(wave.rotation);
    ctx.scale(stretch, 1 / stretch);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5 + wave.force * 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  for (let index = comets.length - 1; index >= 0; index -= 1) {
    const comet = comets[index];
    comet.vx += (coreX - comet.x) * 0.000018;
    comet.vy += (coreY - comet.y) * 0.000018;
    comet.vx *= 0.992;
    comet.vy *= 0.992;
    comet.x += comet.vx;
    comet.y += comet.vy;
    comet.life -= 1;

    if (comet.life <= 0 || comet.x < -80 || comet.x > width + 80 || comet.y < -80 || comet.y > height + 80) {
      comets.splice(index, 1);
      continue;
    }

    const alpha = Math.min(1, comet.life / 90) * 0.78;
    const tailX = comet.x - comet.vx * 7;
    const tailY = comet.y - comet.vy * 7;
    const tail = ctx.createLinearGradient(comet.x, comet.y, tailX, tailY);
    tail.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    tail.addColorStop(0.28, `rgba(125, 211, 252, ${alpha * 0.55})`);
    tail.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.strokeStyle = tail;
    ctx.lineWidth = comet.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(comet.x, comet.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    drawStar(ctx, comet.x, comet.y, comet.size * 0.72, 'rgba(255, 255, 255, 1)', alpha, true);
  }

  ctx.restore();
}

export default function GalaxyBackground() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const wavesRef = useRef([]);
  const cometsRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const sceneCanvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let animationFrame = 0;
    let resizeTimer = null;

    sceneRef.current = sceneCanvas;

    const syncCanvasSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
      const viewport = window.visualViewport;
      const width = Math.ceil(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
      const height = Math.ceil(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      return { width, height };
    };

    const rebuildScene = () => {
      drawGalaxy(sceneCanvas);
      syncCanvasSize();
    };

    const animate = () => {
      const viewport = window.visualViewport;
      const width = Math.ceil(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
      const height = Math.ceil(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(sceneCanvas, 0, 0, width, height);
      drawInteractions(ctx, wavesRef.current, cometsRef.current, width, height, performance.now());
      animationFrame = window.requestAnimationFrame(animate);
    };

    const handleKeyAttack = (event) => {
      const viewport = window.visualViewport;
      const width = Math.ceil(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
      const height = Math.ceil(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);
      const unit = hashKeyToUnit(event.detail?.key);
      const angle = unit * TWO_PI;
      const orbit = Math.min(width, height) * (0.18 + unit * 0.24);
      const x = width * 0.5 + Math.cos(angle) * orbit;
      const y = height * 0.5 + Math.sin(angle) * orbit * 0.42;
      const force = Math.max(0.55, Math.min(Number(event.detail?.velocity) || 0.88, 1.2));

      wavesRef.current.push({
        x,
        y,
        force,
        rotation: angle,
        createdAt: performance.now(),
      });

      while (wavesRef.current.length > MAX_WAVES) {
        wavesRef.current.shift();
      }

      for (let index = 0; index < 3; index += 1) {
        const scatter = randomBetween(-0.8, 0.8);
        cometsRef.current.push({
          x: x + randomBetween(-18, 18),
          y: y + randomBetween(-18, 18),
          vx: Math.cos(angle + Math.PI + scatter) * randomBetween(1.4, 3.2),
          vy: Math.sin(angle + Math.PI + scatter) * randomBetween(0.8, 2.4),
          size: randomBetween(1.2, 2.6),
          life: randomBetween(70, 130),
        });
      }

      while (cometsRef.current.length > MAX_COMETS) {
        cometsRef.current.shift();
      }
    };

    rebuildScene();
    animationFrame = window.requestAnimationFrame(animate);

    const handleResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        rebuildScene();
      }, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('piano-key-attack', handleKeyAttack);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('piano-key-attack', handleKeyAttack);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
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
