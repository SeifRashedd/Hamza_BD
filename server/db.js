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
    listEnvelopes() {
      return statements.list.all().map((row) => toLockedEnvelope(row.id, parseImages(row.image_urls).length > 0));
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
      const result = statements.insert.run(senderName, hint, passwordHash, message, JSON.stringify(imageUrls), now, now);
      return toLockedEnvelope(result.lastInsertRowid, imageUrls.length > 0);
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
