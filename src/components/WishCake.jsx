import { useEffect, useRef, useState } from 'react';
import { BIRTHDAY_PERSON } from '../config.js';
import { burstFrom, celebrate } from '../lib/confetti.js';
import { floatHearts } from '../lib/motion.js';
import { Reveal } from './Reveal.jsx';

const CANDLE_COLORS = ['#ff5fa2', '#4cc9f0', '#ffd23f', '#8b5cf6', '#ff8c42'];
const RELIGHT_AFTER = 7000;

/** A birthday cake whose candles Hamza can blow out (they relight for another wish). */
export function WishCake() {
  const [blown, setBlown] = useState(false);
  const cakeRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    if (!blown) return undefined;
    const timer = setTimeout(() => setBlown(false), RELIGHT_AFTER);
    return () => clearTimeout(timer);
  }, [blown]);

  const blow = () => {
    if (blown) return;
    setBlown(true);
    burstFrom(cakeRef.current, { count: 110, angle: 90, spread: 120, speed: 15 });
    setTimeout(() => celebrate({ count: 60 }), 300);
    floatHearts(sceneRef.current, { count: 14 });
  };

  return (
    <section className="wish-section px-4 py-16 sm:py-20" aria-labelledby="wish-title">
      <Reveal variant="zoom" className="mx-auto max-w-xl text-center">
        <h2 id="wish-title" className="section-title">
          Make a wish, {BIRTHDAY_PERSON}! <span aria-hidden="true">🌟</span>
        </h2>
        <p className="section-subtitle">Close your eyes… then tap the cake to blow out the candles.</p>
      </Reveal>

      <Reveal variant="pop" delay={0.15} className="wish-scene">
        <div ref={sceneRef} className="wish-scene__effects" aria-hidden="true" />
        <button
          ref={cakeRef}
          type="button"
          className={`cake ${blown ? 'is-blown' : ''}`}
          onClick={blow}
          aria-label={blown ? 'Candles blown out — they will relight in a moment' : 'Blow out the candles'}
          aria-disabled={blown}
        >
          <span className="cake__glow" aria-hidden="true" />
          <span className="cake__candles" aria-hidden="true">
            {CANDLE_COLORS.map((color, i) => (
              <span key={color} className="candle" style={{ '--candle-color': color, '--i': i }}>
                <span className="candle__flame" />
                <span className="candle__smoke" />
              </span>
            ))}
          </span>
          <span className="cake__tier cake__tier--top" aria-hidden="true" />
          <span className="cake__tier cake__tier--bottom" aria-hidden="true" />
          <span className="cake__plate" aria-hidden="true" />
        </button>
      </Reveal>

      <p className="wish-status" role="status">
        {blown ? (
          <>
            Wish made! <span aria-hidden="true">✨</span> May every bit of it come true.
          </>
        ) : (
          ''
        )}
      </p>
    </section>
  );
}
