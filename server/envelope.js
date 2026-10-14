// Shared by the SQLite and Postgres repositories.

const THEME_COUNT = 8;

/** Public, locked view of an envelope: no sender, hint, password or message. */
export function toLockedEnvelope(id, hasImage) {
  const numericId = Number(id);
  return { id: numericId, theme: numericId % THEME_COUNT, has_image: Boolean(hasImage) };
}

/** Image URLs are stored as JSON text (SQLite) or jsonb (Postgres). */
export function parseImages(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string') : [];
}
