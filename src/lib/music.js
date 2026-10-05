import { BirthdaySong } from './birthdaySong.js';

/**
 * Common interface for the two music sources:
 *   play(): Promise (rejects with NotAllowedError when the browser blocks it)
 *   pause(), setMuted(bool), destroy(), paused
 * `onState` receives 'playing' | 'paused' | 'error'.
 */

export function createFileSource(url, { volume, onState }) {
  const audio = new Audio();
  audio.src = url;
  audio.loop = true;
  audio.preload = 'auto';

  let fadeTimer = null;
  const onPlay = () => onState('playing');
  const onPause = () => onState('paused');
  const onError = () => onState('error');
  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('error', onError);

  return {
    kind: 'file',
    get paused() {
      return audio.paused;
    },
    async play() {
      audio.volume = 0;
      await audio.play();
      clearInterval(fadeTimer);
      fadeTimer = setInterval(() => {
        audio.volume = Math.min(volume, audio.volume + 0.04);
        if (audio.volume >= volume) clearInterval(fadeTimer);
      }, 80);
    },
    pause() {
      audio.pause();
    },
    setMuted(muted) {
      audio.muted = muted;
    },
    destroy() {
      clearInterval(fadeTimer);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
}

export function createSynthSource({ volume, onState }) {
  const song = new BirthdaySong({ volume });

  return {
    kind: 'synth',
    get paused() {
      return song.paused;
    },
    async play() {
      await song.play();
      onState('playing');
    },
    pause() {
      song.pause();
      onState('paused');
    },
    setMuted(muted) {
      song.setMuted(muted);
    },
    destroy() {
      song.destroy();
    },
  };
}
