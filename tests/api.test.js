import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';
import { createPostgresRepository } from '../server/postgres.js';

const schemaSql = fs.readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');

// Every test runs against local SQLite and against real Postgres (PGlite, an
// in-process Postgres) using the exact schema.sql that goes to Supabase.
const BACKENDS = {
  sqlite: async () => openDatabase(':memory:'),
  postgres: async () => {
    const pglite = new PGlite();
    await pglite.exec(schemaSql);
    return createPostgresRepository({ query: (text, params) => pglite.query(text, params), close: () => pglite.close() });
  },
};

let ipCounter = 0;

// A real 1×1 PNG, as the browser would send it (base64).
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const fakeJpeg = (bytes) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes - 4, 7)]).toString('base64');

const validSubmission = (overrides = {}) => ({
  sender_name: 'Ahmed',
  hint: 'Our first university project',
  password: 'SmartFit',
  message: 'Happy Birthday Hamza ❤️\n\nI hope this year brings you everything you wish for…',
  images: [{ data: TINY_PNG }],
  website: '',
  ...overrides,
});

for (const [backend, openDb] of Object.entries(BACKENDS)) {
  describe(`birthday API (${backend})`, () => {
    let db;
    let server;
    let baseUrl;
    // Each test uses its own fake client IP so the rate limiters don't interfere.
    let currentIp;

    function call(path, { method = 'GET', body, headers = {} } = {}) {
      return fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-Forwarded-For': currentIp,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      });
    }

    async function submit(overrides) {
      const res = await call('/api/messages', { method: 'POST', body: validSubmission(overrides) });
      return { res, data: await res.json() };
    }

    before(async () => {
      db = await openDb();
      const app = createApp({ db, trustProxy: true });
      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
      server.close();
      await db.close();
    });
    beforeEach(() => {
      ipCounter += 1;
      currentIp = `10.0.${ipCounter >> 8}.${ipCounter % 256}`;
    });

    it('starts with no envelopes', async () => {
      const res = await call('/api/envelopes');
      assert.equal(res.status, 200);
      assert.deepEqual((await res.json()).envelopes, []);
    });

    it('creates exactly one envelope per submission', async () => {
      const before = await db.count();
      const { res, data } = await submit();

      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(data.message, 'Your message has been added! 🎉');
      assert.equal(await db.count(), before + 1);
      assert.deepEqual(Object.keys(data.envelope).sort(), ['has_image', 'id', 'sender_name', 'theme']);
      assert.equal(typeof data.envelope.id, 'number');
      assert.equal(data.envelope.sender_name, 'Ahmed');
      assert.equal(data.envelope.has_image, true);
    });

    it('shows the sender in the envelope list, but never the password, hint, message or photos', async () => {
      await submit({ sender_name: 'Visible Sender', password: 'TopSecret99', message: 'A very hidden message body' });

      const res = await call('/api/envelopes');
      const raw = await res.text();
      const { envelopes } = JSON.parse(raw);

      assert.ok(envelopes.some((e) => e.sender_name === 'Visible Sender'), 'sender name should be listed');
      for (const secret of ['TopSecret99', 'A very hidden message body', 'Our first university project', 'scrypt', '/api/images/']) {
        assert.ok(!raw.includes(secret), `list response leaked "${secret}"`);
      }
      for (const envelope of envelopes) {
        assert.deepEqual(Object.keys(envelope).sort(), ['has_image', 'id', 'sender_name', 'theme']);
      }
    });

    it('returns the hint (and only the hint) for a single envelope', async () => {
      const { data } = await submit({ sender_name: 'Hinty', message: 'Hint test message', hint: 'The year we first met 👀' });
      const res = await call(`/api/envelopes/${data.envelope.id}`);
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(body, { envelope: { id: data.envelope.id, hint: 'The year we first met 👀' } });
    });

    it('rejects a wrong password with a 422 and no message content', async () => {
      const { data } = await submit({ sender_name: 'Wrong Test', message: 'Should stay hidden', password: '2002' });
      const res = await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: '2003' } });
      const body = await res.json();

      assert.equal(res.status, 422);
      assert.deepEqual(body, { success: false, message: 'Wrong password' });
    });

    it('requires the exact password (case-sensitive)', async () => {
      const { data } = await submit({ sender_name: 'Case Test', message: 'Case sensitive message' });
      const res = await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: 'smartfit' } });
      assert.equal(res.status, 422);
    });

    it('unlocks with the correct password and returns the message', async () => {
      const { data } = await submit({ sender_name: 'Ahmed', message: 'Happy Birthday Hamza ❤️\n\nSecond paragraph', password: 'SmartFit' });
      const res = await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: 'SmartFit' } });
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.message.id, data.envelope.id);
      assert.equal(body.message.sender_name, 'Ahmed');
      assert.equal(body.message.message, 'Happy Birthday Hamza ❤️\n\nSecond paragraph');
      assert.match(body.message.image_url, /^\/api\/images\/[0-9a-f-]{36}$/);
      assert.deepEqual(body.message.image_urls, [body.message.image_url]);
      assert.ok(!JSON.stringify(body).includes('scrypt'), 'password hash leaked');
    });

    it('serves an uploaded photo (unchanged) once its address is known', async () => {
      const { data } = await submit({ sender_name: 'Photo Friend', message: 'Look at this photo', password: 'cheese' });
      const unlocked = await (
        await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: 'cheese' } })
      ).json();

      const res = await call(unlocked.message.image_url);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.match(res.headers.get('cache-control'), /immutable/);
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(TINY_PNG, 'base64'));
    });

    it('keeps several photos in the order they were added', async () => {
      const images = [{ data: TINY_PNG }, { data: fakeJpeg(2000) }, { data: TINY_PNG }];
      const { data } = await submit({ sender_name: 'Three Pics', message: 'Three photos', password: 'three', images });
      const unlocked = await (
        await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: 'three' } })
      ).json();

      assert.equal(unlocked.message.image_urls.length, 3);
      const types = [];
      for (const url of unlocked.message.image_urls) types.push((await call(url)).headers.get('content-type'));
      assert.deepEqual(types, ['image/png', 'image/jpeg', 'image/png']);
    });

    it('accepts an envelope with a few phone-sized photos', async () => {
      const images = [{ data: fakeJpeg(700 * 1024) }, { data: fakeJpeg(700 * 1024) }, { data: fakeJpeg(700 * 1024) }];
      const { res, data } = await submit({ sender_name: 'Big Pics', message: 'Three big photos', images });
      assert.equal(res.status, 201, JSON.stringify(data));
      assert.equal(data.envelope.has_image, true);
    });

    it('returns 404 for unknown or malformed photo addresses', async () => {
      assert.equal((await call('/api/images/2f1c7c55-2a39-4f43-9a3a-3c0b5f2d9e11')).status, 404);
      assert.equal((await call('/api/images/1')).status, 404);
      assert.equal((await call('/api/images/not-a-photo')).status, 404);
    });

    it('ignores accidental spaces around the password', async () => {
      const { data } = await submit({ sender_name: 'Spaces', message: 'Spaces message', password: ' 2002 ' });
      const res = await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: '2002 ' } });
      assert.equal(res.status, 200);
    });

    it('unlocking one envelope does not unlock another', async () => {
      const first = await submit({ sender_name: 'First', message: 'First message', password: 'alpha' });
      const second = await submit({ sender_name: 'Second', message: 'Second message', password: 'beta' });

      const ok = await call(`/api/messages/${first.data.envelope.id}/unlock`, { method: 'POST', body: { password: 'alpha' } });
      assert.equal(ok.status, 200);

      const crossed = await call(`/api/messages/${second.data.envelope.id}/unlock`, { method: 'POST', body: { password: 'alpha' } });
      assert.equal(crossed.status, 422);
    });

    it('accepts a message without photos', async () => {
      const { res, data } = await submit({ sender_name: 'No Pics', message: 'No image here', images: [] });
      assert.equal(res.status, 201);
      assert.equal(data.envelope.has_image, false);
    });

    it('ignores image links: photos must be uploaded', async () => {
      const { res, data } = await submit({
        sender_name: 'Link Sender',
        message: 'Tried to send a link',
        images: [],
        image_urls: ['https://example.com/image.jpg'],
      });
      assert.equal(res.status, 201);
      assert.equal(data.envelope.has_image, false);
    });

    it('validates required fields', async () => {
      const res = await call('/api/messages', { method: 'POST', body: {} });
      const body = await res.json();

      assert.equal(res.status, 422);
      assert.deepEqual(Object.keys(body.errors).sort(), ['hint', 'message', 'password', 'sender_name']);
    });

    it('rejects files that are not photos', async () => {
      const notPhotos = {
        svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>').toString('base64'),
        html: Buffer.from('<html><script>alert(1)</script></html>').toString('base64'),
        garbage: 'this is not base64 at all!!',
        empty: '',
      };
      for (const [kind, payload] of Object.entries(notPhotos)) {
        ipCounter += 1;
        currentIp = `10.1.${ipCounter >> 8}.${ipCounter % 256}`;
        const before = await db.count();
        const { res, data } = await submit({ sender_name: `Img ${kind}`, message: `Not a photo: ${kind}`, images: [{ data: payload }] });
        assert.equal(res.status, 422, kind);
        assert.ok(data.errors['images.0'], kind);
        assert.equal(await db.count(), before, `${kind} created an envelope`);
      }
    });

    it('rejects a photo that is too big', async () => {
      const { res, data } = await submit({ sender_name: 'Huge', message: 'Way too big', images: [{ data: fakeJpeg(1100 * 1024) }] });
      assert.equal(res.status, 422);
      assert.ok(data.errors['images.0']);
    });

    it('accepts 8 photos that fill the whole envelope budget', async () => {
      // The browser keeps all photos of one envelope to 3,000,000 bytes together.
      const images = Array.from({ length: 8 }, () => ({ data: fakeJpeg(375_000) }));
      const { res, data } = await submit({ sender_name: 'Eight Pics', message: 'Eight photos at the limit', images });
      assert.equal(res.status, 201, JSON.stringify(data));
      assert.equal(data.envelope.has_image, true);
    });

    it('limits the number of photos', async () => {
      const images = Array.from({ length: 9 }, () => ({ data: TINY_PNG }));
      const { res, data } = await submit({ sender_name: 'Many', message: 'Too many photos', images });
      assert.equal(res.status, 422);
      assert.ok(data.errors.images);
    });

    it('keeps the small body limit everywhere except new envelopes', async () => {
      const { data } = await submit({ sender_name: 'Small Limit', message: 'Body limit check', password: 'p' });
      const res = await call(`/api/messages/${data.envelope.id}/unlock`, {
        method: 'POST',
        body: { password: 'x'.repeat(100 * 1024) },
      });
      assert.equal(res.status, 413);
    });

    it('stores text as-is (escaping happens when rendering) and strips control characters', async () => {
      const { data } = await submit({ sender_name: '<b>Bold</b>\u0007', message: '<script>alert(1)</script> hi', password: 'x' });
      const res = await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: 'x' } });
      const body = await res.json();
      assert.equal(body.message.sender_name, '<b>Bold</b>');
      assert.equal(res.headers.get('content-type').includes('application/json'), true);
    });

    it('blocks honeypot spam without creating an envelope', async () => {
      const before = await db.count();
      const { res } = await submit({ sender_name: 'Bot', message: 'Buy cheap stuff', website: 'http://spam.example' });
      assert.equal(res.status, 422);
      assert.equal(await db.count(), before);
    });

    it('rejects duplicate messages from the same sender', async () => {
      await submit({ sender_name: 'Dupe', message: 'Same message twice' });
      const { res, data } = await submit({ sender_name: 'dupe', message: 'Same message twice' });
      assert.equal(res.status, 422);
      assert.ok(data.errors.message);
    });

    it('only accepts JSON bodies', async () => {
      const res = await call('/api/messages', {
        method: 'POST',
        body: 'sender_name=x',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      assert.equal(res.status, 415);
    });

    it('returns 404 for unknown envelopes', async () => {
      assert.equal((await call('/api/envelopes/99999')).status, 404);
      assert.equal((await call('/api/envelopes/abc')).status, 404);
      const res = await call('/api/messages/99999/unlock', { method: 'POST', body: { password: 'x' } });
      assert.equal(res.status, 404);
    });

    it('rate limits password guesses per envelope', async () => {
      const { data } = await submit({ sender_name: 'Limit', message: 'Rate limit message', password: 'right' });
      const statuses = [];
      for (let i = 0; i < 12; i++) {
        const res = await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: `guess${i}` } });
        statuses.push(res.status);
      }
      assert.equal(statuses.filter((s) => s === 422).length, 10);
      assert.equal(statuses.at(-1), 429);
    });

    it('rate limits submissions', async () => {
      const statuses = [];
      for (let i = 0; i < 7; i++) {
        const { res } = await submit({ sender_name: `Flood ${i}`, message: `Flood message ${i}` });
        statuses.push(res.status);
      }
      assert.deepEqual(statuses, [201, 201, 201, 201, 201, 201, 429]);
    });
  });
}

describe('hosting platform compatibility', () => {
  it('accepts a JSON body the platform already parsed (as Vercel does)', async () => {
    const db = openDatabase(':memory:');
    const app = createApp({ db, trustProxy: true });

    // Mimic Vercel: read the whole body first and expose it as req.body.
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        Object.defineProperty(req, 'body', { value: JSON.parse(raw), writable: true, configurable: true });
        app(req, res);
      });
    });
    await new Promise((resolve) => server.listen(0, resolve));

    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(validSubmission({ sender_name: 'Vercel', message: 'Pre-parsed body works' })),
      });
      assert.equal(res.status, 201);
      assert.equal(await db.count(), 1);
    } finally {
      server.close();
      db.close();
    }
  });
});
