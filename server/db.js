import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const THEME_COUNT = 8;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS birthday_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_name   TEXT    NOT NULL,
    hint          TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    message       TEXT    NOT NULL,
    image_urls    TEXT    NOT NULL DEFAULT '[]',
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
  );
`;

/**
 * Opens (and migrates) the SQLite database and returns a small repository.
 * Nothing in here ever returns a password hash or a message body except
 * `findForUnlock`, which is only used after the password has been checked.
 */
export function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const statements = {
    list: db.prepare('SELECT id, image_urls FROM birthday_messages ORDER BY id ASC'),
    hint: db.prepare('SELECT id, hint FROM birthday_messages WHERE id = ?'),
    forUnlock: db.prepare(
      'SELECT id, sender_name, password_hash, message, image_urls FROM birthday_messages WHERE id = ?',
    ),
    duplicate: db.prepare(
      'SELECT 1 FROM birthday_messages WHERE sender_name = ? COLLATE NOCASE AND message = ? LIMIT 1',
    ),
    insert: db.prepare(`
      INSERT INTO birthday_messages (sender_name, hint, password_hash, message, image_urls, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    count: db.prepare('SELECT COUNT(*) AS total FROM birthday_messages'),
  };

  return {
    /** Public, locked view of every envelope: no sender, hint, password or message. */
    listEnvelopes() {
      return statements.list.all().map(toLockedEnvelope);
    },

    findHint(id) {
      return statements.hint.get(id) ?? null;
    },

    findForUnlock(id) {
      const row = statements.forUnlock.get(id);
      return row ? { ...row, image_urls: parseImages(row.image_urls) } : null;
    },

    isDuplicate(senderName, message) {
      return Boolean(statements.duplicate.get(senderName, message));
    },

    /** Inserts exactly one message and returns its locked envelope. */
    create({ senderName, hint, passwordHash, message, imageUrls }) {
      const now = new Date().toISOString();
      const result = statements.insert.run(
        senderName,
        hint,
        passwordHash,
        message,
        JSON.stringify(imageUrls),
        now,
        now,
      );
      return toLockedEnvelope({ id: Number(result.lastInsertRowid), image_urls: JSON.stringify(imageUrls) });
    },

    count() {
      return statements.count.get().total;
    },

    close() {
      db.close();
    },
  };
}

function toLockedEnvelope(row) {
  const id = Number(row.id);
  return {
    id,
    theme: id % THEME_COUNT,
    has_image: parseImages(row.image_urls).length > 0,
  };
}

function parseImages(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string') : [];
  } catch {
    return [];
  }
}
