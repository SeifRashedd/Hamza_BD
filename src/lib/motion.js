export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Floats a handful of hearts and sparkles up from a point (DOM + Web Animations, auto-cleaned). */
export function floatHearts(container, { x, y, count = 14 } = {}) {
  if (!container || prefersReducedMotion() || !Element.prototype.animate) return;

  const rect = container.getBoundingClientRect();
  const originX = x ?? rect.width / 2;
  const originY = y ?? rect.height / 2;
  const symbols = ['❤️', '💖', '💕', '✨', '💗', '⭐'];

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'floating-heart';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = symbols[i % symbols.length];
    el.style.left = `${originX}px`;
    el.style.top = `${originY}px`;
    el.style.fontSize = `${14 + Math.random() * 16}px`;
    container.appendChild(el);

    const dx = (Math.random() - 0.5) * 260;
    const dy = -(120 + Math.random() * 200);
    const rotate = (Math.random() - 0.5) * 60;

    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.4}px)) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.9) rotate(${rotate}deg)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 700, delay: Math.random() * 250, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
    ).onfinish = () => el.remove();
  }
}
