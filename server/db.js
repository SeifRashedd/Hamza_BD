import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseImages, toLockedEnvelope } from './envelope.js';
import { createMemoryRateStore } from './rateLimit.js';

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

  CREATE TABLE IF NOT EXISTS birthday_images (
    id         TEXT    PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES birthday_messages (id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    mime_type  TEXT    NOT NULL,
    data       BLOB    NOT NULL,
    created_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS birthday_images_message_id_idx ON birthday_images (message_id);
`;

/**
 * Local SQLite repository (used on your machine and in tests). It has the same
 * interface as the Postgres one in `postgres.js`; callers always `await` it.
 * Nothing in here ever returns a password hash or a message body except
 * `findForUnlock`, which is only used to check a password.
 */
export function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const statements = {
    list: db.prepare(`
      SELECT m.id, m.image_urls,
             EXISTS (SELECT 1 FROM birthday_images i WHERE i.message_id = m.id) AS has_upload
      FROM birthday_messages m ORDER BY m.id ASC
    `),
    hint: db.prepare('SELECT id, hint FROM birthday_messages WHERE id = ?'),
    forUnlock: db.prepare(
      'SELECT id, sender_name, password_hash, message, image_urls FROM birthday_messages WHERE id = ?',
    ),
    imageIds: db.prepare('SELECT id FROM birthday_images WHERE message_id = ? ORDER BY position'),
    image: db.prepare('SELECT mime_type, data FROM birthday_images WHERE id = ?'),
    duplicate: db.prepare(
      'SELECT 1 FROM birthday_messages WHERE sender_name = ? COLLATE NOCASE AND message = ? LIMIT 1',
    ),
    insert: db.prepare(`
      INSERT INTO birthday_messages (sender_name, hint, password_hash, message, image_urls, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertImage: db.prepare(`
      INSERT INTO birthday_images (id, message_id, position, mime_type, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    count: db.prepare('SELECT COUNT(*) AS total FROM birthday_messages'),
  };

  return {
    listEnvelopes() {
      return statements.list
        .all()
        .map((row) => toLockedEnvelope(row.id, row.has_upload === 1 || parseImages(row.image_urls).length > 0));
    },

    findHint(id) {
      return statements.hint.get(id) ?? null;
    },

    findForUnlock(id) {
      const row = statements.forUnlock.get(id);
      if (!row) return null;
      return {
        ...row,
        image_urls: parseImages(row.image_urls),
        image_ids: statements.imageIds.all(id).map((image) => image.id),
      };
    },

    findImage(id) {
      const row = statements.image.get(id);
      return row ? { mime_type: row.mime_type, data: Buffer.from(row.data) } : null;
    },

    isDuplicate(senderName, message) {
      return Boolean(statements.duplicate.get(senderName, message));
    },

    /**
     * Inserts exactly one message (and its photos) and returns its locked envelope.
     * `imageUrls` is only used by the demo seed; friends upload `images`.
     */
    create({ senderName, hint, passwordHash, message, imageUrls = [], images = [] }) {
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        const result = statements.insert.run(senderName, hint, passwordHash, message, JSON.stringify(imageUrls), now, now);
        images.forEach((image, position) => {
          statements.insertImage.run(image.id, result.lastInsertRowid, position, image.mimeType, image.bytes, now);
        });
        db.exec('COMMIT');
        return toLockedEnvelope(result.lastInsertRowid, images.length > 0 || imageUrls.length > 0);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    count() {
      return statements.count.get().total;
    },

    // A single local process can keep rate-limit counters in memory.
    rateLimitStore: createMemoryRateStore(),

    close() {
      db.close();
    },
  };
}
