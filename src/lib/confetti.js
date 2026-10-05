import { prefersReducedMotion } from './motion.js';

// A small, dependency-free canvas confetti. The canvas is a manual popover so
// that it renders in the top layer — above an open <dialog> and its backdrop.

const COLORS = ['#ff5fa2', '#8b5cf6', '#ffd23f', '#4cc9f0', '#ff8c42', '#ffffff', '#f472b6'];
const MAX_PARTICLES = 450;

let canvas = null;
let ctx = null;
let particles = [];
let frame = null;
let dpr = 1;

function ensureCanvas() {
  if (canvas) return true;
  canvas = document.getElementById('confetti-canvas');
  if (!canvas) return false;

  if (typeof canvas.showPopover !== 'function') {
    canvas.removeAttribute('popover');
  }

  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  return true;
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}

function raiseToTop() {
  if (typeof canvas.showPopover !== 'function') return;
  try {
    // Re-showing moves the popover above anything opened since (e.g. a modal).
    if (canvas.matches(':popover-open')) canvas.hidePopover();
    canvas.showPopover();
  } catch {
    /* popover not supported — the fixed canvas still works below modals */
  }
}

function hideCanvas() {
  try {
    if (canvas.matches?.(':popover-open')) canvas.hidePopover();
  } catch {
    /* ignore */
  }
}

/**
 * Fires one burst.
 * @param {object} options
 * @param {number} options.x       origin, 0–1 of viewport width
 * @param {number} options.y       origin, 0–1 of viewport height
 * @param {number} options.angle   direction in degrees (90 = straight up)
 * @param {number} options.spread  cone width in degrees
 * @param {number} options.count   number of pieces
 * @param {number} options.speed   initial velocity
 */
export function burst({ x = 0.5, y = 0.5, angle = 90, spread = 70, count = 120, speed = 13 } = {}) {
  if (prefersReducedMotion() || !ensureCanvas()) return;

  raiseToTop();

  const available = Math.max(0, MAX_PARTICLES - particles.length);
  const total = Math.min(count, available);

  for (let i = 0; i < total; i++) {
    const direction = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const velocity = speed * (0.55 + Math.random() * 0.6);
    particles.push({
      x: x * window.innerWidth,
      y: y * window.innerHeight,
      vx: Math.cos(direction) * velocity,
      vy: -Math.sin(direction) * velocity,
      size: 6 + Math.random() * 6,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: Math.random() < 0.65 ? 'rect' : 'circle',
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      wobble: Math.random() * 10,
      wobbleSpeed: 0.05 + Math.random() * 0.08,
      life: 0,
      maxLife: 160 + Math.random() * 90,
    });
  }

  if (!frame) frame = requestAnimationFrame(tick);
}

/** Two side cannons + a centre pop — used for the big moments. */
export function celebrate({ count = 90 } = {}) {
  burst({ x: 0, y: 0.75, angle: 60, spread: 50, count, speed: 17 });
  burst({ x: 1, y: 0.75, angle: 120, spread: 50, count, speed: 17 });
  setTimeout(() => burst({ x: 0.5, y: 0.45, angle: 90, spread: 160, count: Math.round(count * 0.8), speed: 11 }), 180);
}

/** Burst centred on an element (e.g. a button or a modal). */
export function burstFrom(element, options = {}) {
  if (!element) return burst(options);
  const rect = element.getBoundingClientRect();
  burst({
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
    spread: 180,
    ...options,
  });
}

function tick() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  particles = particles.filter((p) => p.life < p.maxLife && p.y < window.innerHeight + 40);

  for (const p of particles) {
    p.life += 1;
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + 0.28;
    p.wobble += p.wobbleSpeed;
    p.x += p.vx + Math.sin(p.wobble) * 0.6;
    p.y += p.vy;
    p.rotation += p.spin;

    const fade = Math.min(1, (p.maxLife - p.life) / 40);
    ctx.globalAlpha = fade;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    if (p.shape === 'rect') {
      ctx.scale(1, Math.abs(Math.cos(p.wobble)) * 0.8 + 0.2);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;

  if (particles.length > 0) {
    frame = requestAnimationFrame(tick);
  } else {
    frame = null;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    hideCanvas();
  }
}
