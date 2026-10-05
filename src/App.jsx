import { useCallback, useEffect, useRef, useState } from 'react';
import { EnvelopeSection } from './components/EnvelopeSection.jsx';
import { FloatingParty } from './components/FloatingParty.jsx';
import { FriendForm } from './components/FriendForm.jsx';
import { Hero } from './components/Hero.jsx';
import { MusicPlayer } from './components/MusicPlayer.jsx';
import { Sky } from './components/Decorations.jsx';
import { ToastRegion, useToasts } from './components/Toasts.jsx';
import { WishCake } from './components/WishCake.jsx';
import { BIRTHDAY_PERSON } from './config.js';
import { api } from './lib/api.js';
import { celebrate } from './lib/confetti.js';
import { prefersReducedMotion } from './lib/motion.js';
import { loadUnlocked, saveUnlocked } from './lib/unlockedStore.js';

export default function App() {
  const [envelopes, setEnvelopes] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [unlocked, setUnlocked] = useState(loadUnlocked);
  const [newIds, setNewIds] = useState(() => new Set());
  const [musicPlaying, setMusicPlaying] = useState(false);
  const { toasts, notify, dismiss } = useToasts();
  const musicRef = useRef(null);
  const toggleMusic = useCallback(() => musicRef.current?.toggle(), []);

  // Expose scroll position as a CSS variable for the hero parallax.
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let frame = null;
    const update = () => {
      frame = null;
      document.documentElement.style.setProperty('--scroll', String(Math.min(window.scrollY, 1600)));
    };
    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  const loadEnvelopes = useCallback(async () => {
    setStatus('loading');
    try {
      setEnvelopes(await api.listEnvelopes());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadEnvelopes();
  }, [loadEnvelopes]);

  // One welcome burst on page load.
  useEffect(() => {
    const timer = setTimeout(() => celebrate({ count: 70 }), 700);
    return () => clearTimeout(timer);
  }, []);

  const handleUnlocked = useCallback(
    (id, message) => {
      const next = { ...unlocked, [id]: message };
      setUnlocked(next);
      saveUnlocked(next);

      const openedAll = envelopes.length > 1 && envelopes.every((e) => next[e.id]);
      const wasAll = envelopes.every((e) => unlocked[e.id]);
      if (openedAll && !wasAll) {
        setTimeout(() => {
          notify(`You opened every envelope, ${BIRTHDAY_PERSON}! 🥳 You are so loved.`, 'success');
          celebrate({ count: 110 });
        }, 1400);
      }
    },
    [unlocked, envelopes, notify],
  );

  const handleCreated = useCallback((envelope) => {
    setEnvelopes((list) => (list.some((e) => e.id === envelope.id) ? list : [...list, envelope]));
    setStatus('ready');
    setNewIds((ids) => new Set(ids).add(envelope.id));
  }, []);

  return (
    <>
      <canvas id="confetti-canvas" className="confetti-canvas" popover="manual" aria-hidden="true" />
      <a href="#messages" className="skip-link">
        Skip to the messages
      </a>

      <Sky />
      <FloatingParty />

      <main>
        <Hero musicPlaying={musicPlaying} onToggleMusic={toggleMusic} />
        <EnvelopeSection
          envelopes={envelopes}
          status={status}
          unlocked={unlocked}
          newIds={newIds}
          onUnlocked={handleUnlocked}
          onRetry={loadEnvelopes}
        />
        <WishCake />
        <FriendForm onCreated={handleCreated} notify={notify} />
      </main>

      <footer className="site-footer">
        Made with <span aria-label="love">❤️</span> by {BIRTHDAY_PERSON}’s friends
      </footer>

      <MusicPlayer ref={musicRef} onPlayingChange={setMusicPlaying} notify={notify} />
      <ToastRegion toasts={toasts} dismiss={dismiss} />
    </>
  );
}
