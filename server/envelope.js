// Shared by the SQLite and Postgres repositories.

const THEME_COUNT = 8;

/**
 * Public, locked view of an envelope. The sender's name is shown on purpose (it
 * helps Hamza guess the password); the hint, password, message and photos are not.
 */
export function toLockedEnvelope(id, hasImage, senderName) {
  const numericId = Number(id);
  return { id: numericId, theme: numericId % THEME_COUNT, has_image: Boolean(hasImage), sender_name: senderName };
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
