import { forwardRef, useRef } from 'react';
import { BIRTHDAY_PERSON } from '../config.js';
import { useInView } from '../lib/useInView.js';

/**
 * One locked (or unlocked) envelope. The pin is the main control; clicking
 * anywhere on the envelope also works for mouse/touch users.
 */
export const Envelope = forwardRef(function Envelope({ envelope, number, isOpening, unlockedMessage, isNew, onOpen }, pinRef) {
  const isUnlocked = Boolean(unlockedMessage);
  const isOpen = isOpening || isUnlocked;
  const tilt = (((envelope.id * 37) % 7) - 3) * 0.7;
  const floatDelay = -((envelope.id * 1.3) % 6);
  const cardRef = useRef(null);
  const revealed = useInView(cardRef, { threshold: 0.25 });

  const classes = [
    'envelope-card',
    `env-theme-${envelope.theme}`,
    isOpen && 'is-open',
    isUnlocked && 'is-unlocked',
    isNew && 'is-new',
    'reveal-envelope',
    revealed && 'is-visible',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      ref={cardRef}
      className={classes}
      style={{ '--tilt': `${tilt}deg`, '--float-delay': `${floatDelay}s`, '--reveal-delay': `${((number - 1) % 4) * 0.12}s` }}
      data-envelope-id={envelope.id}>
      <div className="envelope-card__float">
        <div className="envelope" onClick={() => onOpen(envelope.id)} aria-hidden="true">
          <div className="envelope__back" />
          <div className="envelope__letter">
            <span className="envelope__letter-line" />
            <span className="envelope__letter-line" />
            <span className="envelope__letter-line envelope__letter-line--short" />
            <span className="envelope__letter-heart">❤</span>
          </div>
          <div className="envelope__pocket">
            <span className="envelope__to">To: {BIRTHDAY_PERSON} ♥</span>
            <span className="envelope__stamp">
              <span>No.</span>
              <strong>{number}</strong>
            </span>
            {envelope.has_image && (
              <span className="envelope__photo-badge" title="Includes a photo">
                📸
              </span>
            )}
          </div>
          <div className="envelope__flap" />
          <span className="envelope__seal">♥</span>
        </div>

        <button
          ref={pinRef}
          type="button"
          className="envelope__pin"
          onClick={() => onOpen(envelope.id)}
          aria-label={
            isUnlocked
              ? `Read envelope number ${number} again, from ${unlockedMessage.sender_name}`
              : `Open envelope number ${number}${envelope.has_image ? ', it includes a photo' : ''}`
          }
        >
          <span className="pin__head" aria-hidden="true" />
          <span className="pin__needle" aria-hidden="true" />
        </button>
      </div>

      <div className="envelope-card__caption">
        {isUnlocked ? (
          <>
            <p className="envelope-card__from">
              <span aria-hidden="true">💌</span> From {unlockedMessage.sender_name}
            </p>
            <p className="envelope-card__tip">Tap to read again</p>
          </>
        ) : (
          <>
            <p className="envelope-card__mystery">Someone left you a message…</p>
            <p className="envelope-card__tip">
              Tap the pin <span aria-hidden="true">📌</span>
            </p>
          </>
        )}
      </div>
    </li>
  );
});
