import { BIRTHDAY_PERSON } from '../config.js';
import { prefersReducedMotion } from '../lib/motion.js';
import { Balloon, Bunting } from './Decorations.jsx';

export function Hero({ musicPlaying, onToggleMusic }) {
  const scrollToMessages = () => {
    document.getElementById('messages')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <header className="hero relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 pb-24 pt-28 text-center">
      <Bunting />

      <Balloon color="#ff5fa2" className="balloon--hero-1" />
      <Balloon color="#8b5cf6" className="balloon--hero-2" />
      <Balloon color="#ffd23f" className="balloon--hero-3" />
      <Balloon color="#4cc9f0" className="balloon--hero-4" />
      <Balloon color="#ff8c42" className="balloon--hero-5" />

      <p className="hero-badge">
        <span aria-hidden="true">🎈</span> A special delivery for {BIRTHDAY_PERSON}
      </p>

      <h1 className="hero-title">
        <span className="sr-only">
          Happy Birthday {BIRTHDAY_PERSON}! 🎂🎉
        </span>
        <span aria-hidden="true" className="block">
          <span className="hero-title__top">Happy Birthday</span>
          <span className="hero-title__name">
            {[...`${BIRTHDAY_PERSON}!`].map((letter, i) => (
              <span key={i} className="hero-title__letter" style={{ animationDelay: `${0.4 + i * 0.08}s` }}>
                {letter}
              </span>
            ))}
            <span className="hero-title__emoji">🎂🎉</span>
          </span>
        </span>
      </h1>

      <p className="hero-subtitle">
        Today is all about you <span aria-hidden="true">❤️</span>
      </p>

      <button
        type="button"
        className={`hero-song ${musicPlaying ? 'is-playing' : ''}`}
        onClick={onToggleMusic}
        aria-pressed={musicPlaying}
        data-music-control
      >
        <span className="hero-song__note" aria-hidden="true">🎶</span>
        <span>Today is your birthday…</span>
        <span className="hero-song__note hero-song__note--late" aria-hidden="true">🎶</span>
        <span className="hero-song__hint">{musicPlaying ? 'tap to pause' : 'tap to play the song'}</span>
      </button>

      <button type="button" className="btn-primary btn-cta mt-8" onClick={scrollToMessages}>
        Open Your Birthday Messages <span aria-hidden="true">💌</span>
      </button>

      <button type="button" className="scroll-cue" onClick={scrollToMessages} aria-label="Scroll to the messages">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </header>
  );
}
