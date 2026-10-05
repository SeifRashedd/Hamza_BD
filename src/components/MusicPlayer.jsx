import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MUSIC_URL, MUSIC_VOLUME, hasMusic } from '../config.js';
import { createFileSource, createSynthSource } from '../lib/music.js';

const GESTURE_EVENTS = ['pointerdown', 'click', 'keydown', 'touchend'];

/**
 * Floating music controls. Plays the song from MUSIC_URL, or a built-in
 * music-box "Happy Birthday" when no URL is set (or the URL fails).
 * Tries to autoplay; if the browser blocks it, the song starts on the
 * visitor's first interaction (unless they paused it on purpose). One
 * source lives for the whole visit, so opening envelopes never restarts it.
 *
 * Elements marked with [data-music-control] (e.g. the hero's song line) can
 * call `ref.current.toggle()` without the gesture listener interfering.
 */
export const MusicPlayer = forwardRef(function MusicPlayer({ onPlayingChange, notify }, ref) {
  const sourceRef = useRef(null);
  const userPaused = useRef(false);

  const [status, setStatus] = useState('idle'); // idle | blocked | playing | paused
  const [muted, setMuted] = useState(false);
  const [nudge, setNudge] = useState(false);

  const play = useCallback(async () => {
    const source = sourceRef.current;
    if (!source) return false;
    try {
      await source.play();
      if (sourceRef.current !== source) return false;
      setNudge(false);
      return true;
    } catch (error) {
      if (sourceRef.current !== source) return false; // torn down meanwhile
      if (error?.name === 'NotAllowedError') {
        setStatus('blocked');
        setNudge(true);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const onState = (state) => {
      if (disposed) return;
      if (state === 'error') {
        // The configured song couldn't load — fall back to the built-in tune.
        const wasPlaying = !sourceRef.current?.paused;
        sourceRef.current?.destroy();
        sourceRef.current = createSynthSource({ volume: MUSIC_VOLUME, onState });
        notify?.('Couldn’t load the song link, so here’s our own birthday tune 🎶', 'info');
        if (wasPlaying || !userPaused.current) play();
        return;
      }
      setStatus(state);
    };

    sourceRef.current = hasMusic()
      ? createFileSource(MUSIC_URL, { volume: MUSIC_VOLUME, onState })
      : createSynthSource({ volume: MUSIC_VOLUME, onState });

    // Start on the first real interaction if autoplay is blocked.
    const onGesture = (event) => {
      if (event.target instanceof Element && event.target.closest('[data-music-control]')) return;
      removeGestureListeners();
      if (!userPaused.current && sourceRef.current?.paused) play();
    };
    const removeGestureListeners = () =>
      GESTURE_EVENTS.forEach((type) => document.removeEventListener(type, onGesture, true));

    play().then((started) => {
      if (started || disposed) return;
      GESTURE_EVENTS.forEach((type) => document.addEventListener(type, onGesture, true));
    });

    return () => {
      disposed = true;
      removeGestureListeners();
      sourceRef.current?.destroy();
      sourceRef.current = null;
    };
  }, [play, notify]);

  useEffect(() => {
    onPlayingChange?.(status === 'playing');
  }, [status, onPlayingChange]);

  const toggle = useCallback(() => {
    const source = sourceRef.current;
    if (!source) return;
    if (source.paused) {
      userPaused.current = false;
      play();
    } else {
      userPaused.current = true;
      source.pause();
    }
  }, [play]);

  useImperativeHandle(ref, () => ({ toggle }), [toggle]);

  const toggleMute = () => {
    const next = !muted;
    sourceRef.current?.setMuted(next);
    setMuted(next);
  };

  const playing = status === 'playing';
  const started = status === 'playing' || status === 'paused';
  const label = playing ? 'Pause music' : 'Play music';

  return (
    <div className="music-dock" data-music-control>
      {nudge && !playing && (
        <button type="button" className="music-nudge" onClick={toggle}>
          Tap for birthday music <span aria-hidden="true">🎶</span>
        </button>
      )}

      {started && (
        <button
          type="button"
          className="music-btn music-btn--small"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute music' : 'Mute music'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
        </button>
      )}

      <button
        type="button"
        className={`music-btn ${playing ? 'is-playing' : ''} ${status === 'blocked' || status === 'idle' ? 'is-waiting' : ''}`}
        onClick={toggle}
        aria-pressed={playing}
        aria-label={label}
        title={label}
      >
        <span className="music-btn__ring" aria-hidden="true" />
        <span className="music-btn__icon" aria-hidden="true">
          🎵
        </span>
        <span className="music-btn__eq" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
    </div>
  );
});
