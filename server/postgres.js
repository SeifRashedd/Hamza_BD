import pg from 'pg';
import { parseImages, toLockedEnvelope } from './envelope.js';

/**
 * Postgres repository (Supabase in production). Same interface as the SQLite
 * one in `db.js`. Tables come from `schema.sql`, run once in Supabase.
 *
 * `query(text, params)` must resolve to `{ rows }` — a pg Pool in production,
 * PGlite in the tests.
 */
export function createPostgresRepository({ query, close = async () => {} }) {
  const rateLimitStore = {
    async hit(key, windowMs) {
      // One atomic statement: start a new window or count one more hit in the current one.
      const { rows } = await query(
        `insert into rate_limits as r (key, count, reset_at)
         values ($1, 1, now() + $2::int * interval '1 millisecond')
         on conflict (key) do update set
           count    = case when r.reset_at <= now() then 1 else r.count + 1 end,
           reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
         returning count, reset_at`,
        [key, windowMs],
      );

      // Now and then, clear out windows that have expired.
      if (Math.random() < 0.02) {
        await query('delete from rate_limits where reset_at < now()');
      }

      return { count: Number(rows[0].count), resetAt: rows[0].reset_at };
    },
  };

  return {
    async listEnvelopes() {
      const { rows } = await query(
        `select m.id,
                (jsonb_array_length(m.image_urls) > 0
                  or exists (select 1 from birthday_images i where i.message_id = m.id)) as has_image
         from birthday_messages m
         order by m.id`,
      );
      return rows.map((row) => toLockedEnvelope(row.id, row.has_image));
    },

    async findHint(id) {
      const { rows } = await query('select id, hint from birthday_messages where id = $1', [id]);
      return rows[0] ? { id: Number(rows[0].id), hint: rows[0].hint } : null;
    },

    async findForUnlock(id) {
      const { rows } = await query(
        `select m.id, m.sender_name, m.password_hash, m.message, m.image_urls,
                coalesce((select array_agg(i.id::text order by i.position)
                          from birthday_images i where i.message_id = m.id), '{}') as image_ids
         from birthday_messages m
         where m.id = $1`,
        [id],
      );
      const row = rows[0];
      return row ? { ...row, id: Number(row.id), image_urls: parseImages(row.image_urls) } : null;
    },

    async findImage(id) {
      const { rows } = await query('select mime_type, data from birthday_images where id = $1::uuid', [id]);
      return rows[0] ? { mime_type: rows[0].mime_type, data: Buffer.from(rows[0].data) } : null;
    },

    async isDuplicate(senderName, message) {
      const { rows } = await query(
        'select 1 from birthday_messages where lower(sender_name) = lower($1) and message = $2 limit 1',
        [senderName, message],
      );
      return rows.length > 0;
    },

    /**
     * Inserts exactly one message and its photos in a single statement (all or
     * nothing) and returns its locked envelope. `imageUrls` is only used by the
     * demo seed; friends upload `images`.
     */
    async create({ senderName, hint, passwordHash, message, imageUrls = [], images = [] }) {
      const photos = images.map((image) => ({ id: image.id, type: image.mimeType, data: image.bytes.toString('base64') }));
      const { rows } = await query(
        `with m as (
           insert into birthday_messages (sender_name, hint, password_hash, message, image_urls)
           values ($1, $2, $3, $4, $5::jsonb)
           returning id
         ), photos as (
           insert into birthday_images (id, message_id, position, mime_type, data)
           select (p.photo->>'id')::uuid, m.id, (p.ord - 1)::smallint, p.photo->>'type', decode(p.photo->>'data', 'base64')
           from m, jsonb_array_elements($6::jsonb) with ordinality as p(photo, ord)
         )
         select id from m`,
        [senderName, hint, passwordHash, message, JSON.stringify(imageUrls), JSON.stringify(photos)],
      );
      return toLockedEnvelope(rows[0].id, images.length > 0 || imageUrls.length > 0);
    },

    async count() {
      const { rows } = await query('select count(*)::int as total from birthday_messages');
      return rows[0].total;
    },

    rateLimitStore,
    close,
  };
}

/** Connects to Postgres using a connection string (Supabase "Transaction pooler"). */
export function openPostgres(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL. If your database password has symbols like @ # / ?, reset it to letters and numbers only.',
    );
  }

  // TLS is configured below; a `sslmode` in the URL would override it.
  url.searchParams.delete('sslmode');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

  const pool = new pg.Pool({
    connectionString: url.toString(),
    // Supabase's certificate is signed by its own CA, so encrypt without verifying the chain.
    ssl: isLocal ? false : { rejectUnauthorized: false },
    // Serverless: keep each instance's footprint tiny; Supabase's pooler does the real pooling.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (error) => console.error('Postgres pool error:', error.message));

  return createPostgresRepository({
    query: (text, params) => pool.query(text, params),
    close: () => pool.end(),
  });
}
