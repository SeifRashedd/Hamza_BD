import { useCallback, useEffect, useRef, useState } from 'react';
import { BIRTHDAY_PERSON } from '../config.js';
import { api } from '../lib/api.js';
import { burst } from '../lib/confetti.js';
import { useInView } from '../lib/useInView.js';
import { prefersReducedMotion, wait } from '../lib/motion.js';
import { Balloon, Bunting } from './Decorations.jsx';
import { Reveal } from './Reveal.jsx';
import { Envelope } from './Envelope.jsx';
import { EnvelopeModal } from './EnvelopeModal.jsx';

const OPENING_DURATION = 950; // pin pops → flap opens → letter peeks

export function EnvelopeSection({ envelopes, status, unlocked, newIds, onUnlocked, onRetry }) {
  const [openingId, setOpeningId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [hints, setHints] = useState({}); // id → { text } | { error: true }
  const pinRefs = useRef(new Map());
  const busy = useRef(false);
  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { threshold: 0.6 });

  // A little confetti pop the first time Hamza scrolls down to the envelopes.
  useEffect(() => {
    if (!headerInView || window.scrollY < 200) return;
    burst({ x: 0.08, y: 0.25, angle: 45, spread: 50, count: 45, speed: 13 });
    burst({ x: 0.92, y: 0.25, angle: 135, spread: 50, count: 45, speed: 13 });
  }, [headerInView]);
  const activeRef = useRef(null); // read at call time, so chained opens never see stale state

  const loadHint = useCallback(async (id) => {
    setHints((h) => ({ ...h, [id]: undefined }));
    try {
      const text = await api.getHint(id);
      setHints((h) => ({ ...h, [id]: { text } }));
    } catch {
      setHints((h) => ({ ...h, [id]: { error: true } }));
    }
  }, []);

  const openEnvelope = useCallback(
    async (id) => {
      if (busy.current || activeRef.current !== null) return;
      busy.current = true;

      setOpeningId(id);
      if (!unlocked[id] && !hints[id]?.text) loadHint(id); // fetched while the flap opens

      await wait(prefersReducedMotion() || unlocked[id] ? 150 : OPENING_DURATION);
      activeRef.current = id;
      setActiveId(id);
      busy.current = false;
    },
    [unlocked, hints, loadHint],
  );

  const closeModal = useCallback(() => {
    const id = activeId;
    activeRef.current = null;
    setActiveId(null);
    setOpeningId(null);
    pinRefs.current.get(id)?.focus({ preventScroll: true });
  }, [activeId]);

  const nextLockedId = (() => {
    if (activeId === null) return null;
    const start = envelopes.findIndex((e) => e.id === activeId);
    for (let step = 1; step < envelopes.length; step++) {
      const candidate = envelopes[(start + step) % envelopes.length];
      if (!unlocked[candidate.id]) return candidate.id;
    }
    return null;
  })();

  const openNext = useCallback(async () => {
    const nextId = nextLockedId;
    activeRef.current = null;
    setActiveId(null);
    setOpeningId(null);
    if (nextId === null) return;

    const card = document.querySelector(`[data-envelope-id="${nextId}"]`);
    card?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    await wait(prefersReducedMotion() ? 0 : 450);
    pinRefs.current.get(nextId)?.focus({ preventScroll: true });
    openEnvelope(nextId);
  }, [nextLockedId, openEnvelope]);

  const total = envelopes.length;
  const openedCount = envelopes.filter((e) => unlocked[e.id]).length;
  const activeIndex = envelopes.findIndex((e) => e.id === activeId);
  const activeEnvelope = activeIndex >= 0 ? envelopes[activeIndex] : null;

  return (
    <section id="messages" className="relative scroll-mt-6 px-4 pb-20 pt-32 sm:px-6 sm:pb-24 sm:pt-36" aria-labelledby="messages-title">
      <Bunting flags={13} />
      <Balloon color="#4cc9f0" className="balloon--side balloon--side-left" />
      <Balloon color="#ff5fa2" className="balloon--side balloon--side-right" />

      <div className="mx-auto max-w-6xl">
        <Reveal variant="zoom" className="mx-auto max-w-2xl text-center">
          <h2 id="messages-title" ref={headerRef} className="section-title">
            Messages From Your Friends <span aria-hidden="true">💌</span>
          </h2>
          <p className="section-subtitle">Open each envelope and discover a surprise.</p>

          {status === 'ready' && total > 0 && (
            <div className="progress-pill" role="status">
              <span>
                {openedCount === total ? (
                  <>
                    You opened them all! <span aria-hidden="true">🥳</span>
                  </>
                ) : (
                  <>
                    <strong>{openedCount}</strong> of <strong>{total}</strong> opened
                  </>
                )}
              </span>
              <span className="progress-pill__bar" aria-hidden="true">
                <span style={{ width: `${(openedCount / total) * 100}%` }} />
              </span>
            </div>
          )}
        </Reveal>

        {status === 'loading' && (
          <ul className="envelope-grid mt-12" aria-label="Loading envelopes">
            {[0, 1, 2].map((i) => (
              <li key={i} className="envelope-skeleton" />
            ))}
          </ul>
        )}

        {status === 'error' && (
          <div className="empty-state mt-12">
            <p className="empty-state__emoji" aria-hidden="true">
              🙈
            </p>
            <p className="empty-state__text">We couldn’t fetch the envelopes right now.</p>
            <button type="button" className="btn-ghost mt-4" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && total === 0 && (
          <div className="empty-state mt-12">
            <p className="empty-state__emoji" aria-hidden="true">
              👀
            </p>
            <p className="empty-state__text">Your friends haven’t left any surprises yet…</p>
            <a href="#leave-a-message" className="btn-ghost mt-5">
              Be the first to leave {BIRTHDAY_PERSON} a message <span aria-hidden="true">💌</span>
            </a>
          </div>
        )}

        {status === 'ready' && total > 0 && (
          <ul className="envelope-grid mt-14">
            {envelopes.map((envelope, index) => (
              <Envelope
                key={envelope.id}
                ref={(node) => {
                  if (node) pinRefs.current.set(envelope.id, node);
                  else pinRefs.current.delete(envelope.id);
                }}
                envelope={envelope}
                number={index + 1}
                isOpening={openingId === envelope.id}
                unlockedMessage={unlocked[envelope.id]}
                isNew={newIds.has(envelope.id)}
                onOpen={openEnvelope}
              />
            ))}
          </ul>
        )}
      </div>

      <EnvelopeModal
        envelope={activeEnvelope}
        number={activeIndex + 1}
        hint={activeEnvelope ? hints[activeEnvelope.id] : undefined}
        unlockedMessage={activeEnvelope ? unlocked[activeEnvelope.id] : undefined}
        hasNext={nextLockedId !== null}
        onUnlocked={onUnlocked}
        onClose={closeModal}
        onNext={openNext}
        onRetryHint={() => activeEnvelope && loadHint(activeEnvelope.id)}
      />
    </section>
  );
}
