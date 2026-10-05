import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { burstFrom, celebrate } from '../lib/confetti.js';
import { floatHearts, prefersReducedMotion, wait } from '../lib/motion.js';

const WRONG_ANSWERS = [
  'Wrong answer 😭 Try again!',
  'Almost! Think harder 👀',
  'Nice try 😂',
  'Nope! But we believe in you 💪',
  'So close… or not 🤭 Try again!',
  'Hmm, that’s not it 🙈',
];

/**
 * The password challenge and, once unlocked, the birthday letter — both in
 * one native <dialog> so focus trapping, Esc and the top layer come for free.
 */
export function EnvelopeModal({ envelope, number, hint, unlockedMessage, hasNext, onUnlocked, onClose, onNext, onRetryHint }) {
  const dialogRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const headingRef = useRef(null);
  const effectsRef = useRef(null);
  const closingRef = useRef(false);
  const ids = useId();

  const [phase, setPhase] = useState(unlockedMessage ? 'message' : 'locked'); // locked | unlocking | message
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);

  const open = Boolean(envelope);

  // Open the dialog when an envelope is chosen.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || dialog.open) return;

    closingRef.current = false;
    setClosing(false);
    setPhase(unlockedMessage ? 'message' : 'locked');
    setPassword('');
    setError('');
    setShowPassword(false);
    dialog.showModal();

    // On touch devices don't pop the keyboard over the hint straight away.
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    requestAnimationFrame(() => {
      if (!unlockedMessage && finePointer) inputRef.current?.focus();
      else headingRef.current?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, envelope?.id]);

  const requestClose = async (afterClose = onClose) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    await wait(prefersReducedMotion() ? 0 : 260);
    dialogRef.current?.close();
    setClosing(false);
    afterClose();
  };

  const shake = () => {
    if (prefersReducedMotion()) return;
    panelRef.current?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-10px) rotate(-1deg)' },
        { transform: 'translateX(9px) rotate(1deg)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 450, easing: 'ease-in-out' },
    );
  };

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (submitting || phase !== 'locked') return;

    if (!password.trim()) {
      setError('Type a password first 👀');
      shake();
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const message = await api.unlock(envelope.id, password);

      setPhase('unlocking');
      burstFrom(panelRef.current, { count: 150, speed: 15 });
      floatHearts(effectsRef.current, { count: 16 });
      setTimeout(() => celebrate({ count: 70 }), 350);

      await wait(prefersReducedMotion() ? 0 : 950);
      onUnlocked(envelope.id, message);
      setPhase('message');
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (err) {
      const wrong = err instanceof ApiError && err.status === 422 && err.message === 'Wrong password';
      setError(wrong ? WRONG_ANSWERS[Math.floor(Math.random() * WRONG_ANSWERS.length)] : err.message);
      shake();
      requestAnimationFrame(() => inputRef.current?.select());
    } finally {
      setSubmitting(false);
    }
  };

  const message = unlockedMessage;
  const showMessage = phase === 'message' && message;
  const images = message?.image_urls?.length ? message.image_urls : message?.image_url ? [message.image_url] : [];

  return (
    <dialog
      ref={dialogRef}
      className={`modal ${closing ? 'is-closing' : ''}`}
      aria-labelledby={`${ids}-title`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      {open && (
        <div ref={panelRef} className={`modal__panel ${showMessage ? 'modal__panel--letter' : ''}`}>
          <div className="modal__airmail" aria-hidden="true" />
          <div ref={effectsRef} className="modal__effects" aria-hidden="true" />

          <button type="button" className="modal__close" onClick={() => requestClose()} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {!showMessage ? (
            <div className={`locked-view ${phase === 'unlocking' ? 'is-unlocking' : ''}`}>
              <div className="lock-badge" aria-hidden="true">
                <span className="lock-badge__icon">{phase === 'unlocking' ? '🔓' : '🔐'}</span>
              </div>

              <p className="modal__kicker">Envelope No. {number}</p>
              <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="modal__title">
                <span aria-hidden="true">🔐 </span>This message is locked
              </h2>

              <div className="hint-card" aria-live="polite">
                <span className="hint-card__label">Hint</span>
                {hint?.text ? (
                  <p className="hint-card__text">{hint.text}</p>
                ) : hint?.error ? (
                  <p className="hint-card__text hint-card__text--error">
                    Couldn’t load the hint.{' '}
                    <button type="button" className="link-btn" onClick={onRetryHint}>
                      Try again
                    </button>
                  </p>
                ) : (
                  <p className="hint-card__text">
                    <span className="skeleton-line" />
                    <span className="sr-only">Loading hint…</span>
                  </p>
                )}
              </div>

              <form className="unlock-form" onSubmit={handleUnlock} noValidate>
                <label htmlFor={`${ids}-password`} className="field-label">
                  Your answer
                </label>
                <div className={`password-field ${error ? 'has-error' : ''}`}>
                  <input
                    ref={inputRef}
                    id={`${ids}-password`}
                    type={showPassword ? 'text' : 'password'}
                    className="input"
                    placeholder="Enter the password..."
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={password}
                    maxLength={200}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError('');
                    }}
                    aria-invalid={Boolean(error)}
                    aria-describedby={`${ids}-error`}
                    disabled={phase !== 'locked'}
                  />
                  <button
                    type="button"
                    className="password-field__toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    <span aria-hidden="true">{showPassword ? '🙈' : '👁️'}</span>
                  </button>
                </div>
                <p id={`${ids}-error`} className="field-error field-error--center" role="alert">
                  {error}
                </p>

                <button type="submit" className="btn-primary w-full" disabled={submitting || phase !== 'locked'} aria-busy={submitting}>
                  {submitting ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Checking…
                    </>
                  ) : phase === 'unlocking' ? (
                    <>Unlocked! 🎉</>
                  ) : (
                    <>
                      Unlock Message <span aria-hidden="true">🔓</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <article className="message-view">
              <p className="modal__kicker">Unlocked! 🎉</p>
              <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="modal__title">
                <span aria-hidden="true">💌 </span>A message from <span className="message-view__sender">{message.sender_name}</span>
              </h2>

              <div className="letter">
                {message.message.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
                <p className="letter__signature">— {message.sender_name}</p>
              </div>

              {images.length > 0 && (
                <div className={`photos ${images.length > 1 ? 'photos--many' : ''}`}>
                  {images.map((url, i) => (
                    <Photo key={url} url={url} index={i} sender={message.sender_name} />
                  ))}
                </div>
              )}

              <div className="message-view__actions">
                {hasNext && (
                  <button type="button" className="btn-primary" onClick={() => requestClose(onNext)}>
                    Open the next envelope <span aria-hidden="true">✉️</span>
                  </button>
                )}
                <button type="button" className="btn-ghost" onClick={() => requestClose()}>
                  Close
                </button>
              </div>
            </article>
          )}
        </div>
      )}
    </dialog>
  );
}

function Photo({ url, index, sender }) {
  const [state, setState] = useState('loading'); // loading | loaded | failed
  if (state === 'failed') return null;

  return (
    <figure className={`photo ${state === 'loaded' ? 'is-loaded' : ''}`} style={{ '--photo-tilt': `${index % 2 ? 1.6 : -1.4}deg` }}>
      <img
        src={url}
        alt={`Photo from ${sender}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
    </figure>
  );
}
