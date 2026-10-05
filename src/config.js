// ─────────────────────────────────────────────────────────────────────────────
//  🎵 Background music — replace the placeholder with a direct link to an
//  audio file (mp3 / ogg / m4a), e.g. 'https://example.com/happy-birthday.mp3'.
//  This is the only place the music URL lives. While it's left as the
//  placeholder, the site plays its own built-in music-box 'Happy Birthday'.
// ─────────────────────────────────────────────────────────────────────────────
export const MUSIC_URL = 'YOUR_MUSIC_URL_HERE';

export const BIRTHDAY_PERSON = 'Hamza';

export const MUSIC_VOLUME = 0.5;

export function hasMusic() {
  try {
    const url = new URL(MUSIC_URL);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
