import { Balloon } from './Decorations.jsx';

// Balloons and party things that keep drifting up behind the whole page,
// so every part of the site feels alive while scrolling.
// prettier-ignore
const RISERS = [
  { type: 'balloon', color: '#ff5fa2', left: 3,  size: 58, duration: 19, delay: 0 },
  { type: 'balloon', color: '#ffd23f', left: 16, size: 44, duration: 24, delay: 9 },
  { type: 'emoji',   char: '🎁',       left: 27, size: 30, duration: 27, delay: 4 },
  { type: 'balloon', color: '#8b5cf6', left: 38, size: 50, duration: 21, delay: 14 },
  { type: 'emoji',   char: '🎉',       left: 49, size: 28, duration: 25, delay: 19 },
  { type: 'balloon', color: '#4cc9f0', left: 60, size: 56, duration: 20, delay: 6 },
  { type: 'emoji',   char: '🎂',       left: 70, size: 32, duration: 29, delay: 12 },
  { type: 'balloon', color: '#ff8c42', left: 80, size: 46, duration: 23, delay: 2 },
  { type: 'emoji',   char: '🥳',       left: 88, size: 28, duration: 26, delay: 16 },
  { type: 'balloon', color: '#f472b6', left: 94, size: 52, duration: 18, delay: 11 },
  { type: 'emoji',   char: '⭐',       left: 9,  size: 22, duration: 22, delay: 17 },
  { type: 'balloon', color: '#a78bfa', left: 54, size: 40, duration: 26, delay: 22 },
  { type: 'emoji',   char: '🎈',       left: 33, size: 30, duration: 24, delay: 7 },
  { type: 'emoji',   char: '💝',       left: 76, size: 24, duration: 28, delay: 21 },
];

export function FloatingParty() {
  return (
    <div className="party-layer" aria-hidden="true">
      {RISERS.map((item, i) => (
        <div
          key={i}
          className={`riser riser--${item.type}`}
          style={{
            left: `${item.left}%`,
            '--rise-duration': `${item.duration}s`,
            animationDelay: `${-item.delay}s`,
          }}
        >
          {item.type === 'balloon' ? (
            <Balloon color={item.color} className="balloon--riser" style={{ '--size': `${item.size}px`, animationDelay: `${-i}s` }} />
          ) : (
            <span className="riser__emoji" style={{ fontSize: item.size, animationDelay: `${-i * 0.7}s` }}>
              {item.char}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
