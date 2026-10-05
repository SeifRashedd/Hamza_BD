const PALETTE = ['#ff5fa2', '#8b5cf6', '#ffd23f', '#4cc9f0', '#ff8c42'];

/** Soft drifting colour blobs + twinkling hearts and stars behind everything. */
export function Sky() {
  const sprinkles = [
    { kind: 'heart', left: '6%', top: '18%', size: 18, color: 0, delay: 0 },
    { kind: 'star', left: '14%', top: '62%', size: 16, color: 2, delay: 1.2 },
    { kind: 'dot', left: '22%', top: '34%', size: 10, color: 3, delay: 2.1 },
    { kind: 'star', left: '31%', top: '86%', size: 14, color: 1, delay: 0.6 },
    { kind: 'heart', left: '43%', top: '9%', size: 14, color: 4, delay: 2.8 },
    { kind: 'dot', left: '52%', top: '72%', size: 8, color: 0, delay: 1.7 },
    { kind: 'star', left: '61%', top: '24%', size: 18, color: 2, delay: 0.3 },
    { kind: 'heart', left: '72%', top: '55%', size: 16, color: 1, delay: 2.4 },
    { kind: 'dot', left: '79%', top: '12%', size: 12, color: 4, delay: 1 },
    { kind: 'star', left: '88%', top: '40%', size: 14, color: 3, delay: 3.1 },
    { kind: 'heart', left: '94%', top: '78%', size: 18, color: 0, delay: 1.5 },
    { kind: 'dot', left: '4%', top: '92%', size: 9, color: 2, delay: 2.2 },
  ];

  return (
    <div className="sky" aria-hidden="true">
      <div className="sky__blob sky__blob--pink" />
      <div className="sky__blob sky__blob--purple" />
      <div className="sky__blob sky__blob--blue" />
      <div className="sky__blob sky__blob--yellow" />
      {sprinkles.map((s, i) => (
        <span
          key={i}
          className={`sprinkle sprinkle--${s.kind}`}
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            color: PALETTE[s.color],
            animationDelay: `${-s.delay}s, ${-s.delay * 1.7}s`,
          }}
        >
          {s.kind === 'heart' && <HeartIcon />}
          {s.kind === 'star' && <StarIcon />}
        </span>
      ))}
    </div>
  );
}

export function HeartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 21s-7.5-4.6-10-9.3C.3 8.4 2.1 4.5 5.8 4.1 8.1 3.8 10 5 12 7.2c2-2.2 3.9-3.4 6.2-3.1 3.7.4 5.5 4.3 3.8 7.6C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export function StarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 1.5l2.6 6.9 7.4.4-5.8 4.6 2 7.1L12 16.4l-6.2 4.1 2-7.1L2 8.8l7.4-.4z" />
    </svg>
  );
}

/** Party bunting hanging across the top of the hero, sagging in the middle. */
export function Bunting({ flags = 17 }) {
  const colors = ['#ff5fa2', '#ffd23f', '#4cc9f0', '#8b5cf6', '#ff8c42'];
  return (
    <div className="bunting" style={{ '--flags': flags }} aria-hidden="true">
      <svg className="bunting__string" viewBox="0 0 100 10" preserveAspectRatio="none">
        <path d="M0 0 Q50 18 100 0" fill="none" stroke="currentColor" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: flags }, (_, i) => {
        const t = (i + 0.5) / flags;
        const sag = 4 * t * (1 - t); // 0 at the ends, 1 in the middle
        return (
          <span
            key={i}
            className="bunting__flag"
            style={{
              '--flag-color': colors[i % colors.length],
              '--sag': sag,
              '--angle': `${(t - 0.5) * -14}deg`,
              animationDelay: `${-i * 0.35}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/** A glossy CSS balloon with a curly string. */
export function Balloon({ color, className = '', style }) {
  return (
    <div className={`balloon ${className}`} style={{ '--balloon-color': color, ...style }} aria-hidden="true">
      <span className="balloon__shine" />
      <span className="balloon__knot" />
      <svg className="balloon__string" viewBox="0 0 20 120" preserveAspectRatio="none">
        <path d="M10 0 C 2 20, 18 40, 10 60 S 2 100, 10 120" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>
  );
}
