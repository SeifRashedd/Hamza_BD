import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';

let db;
let server;
let baseUrl;
let ipCounter = 0;

// Each test uses its own fake client IP so the rate limiters don't interfere.
let currentIp;

async function startServer() {
  db = openDatabase(':memory:');
  const app = createApp({ db, trustProxy: true });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

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

const validSubmission = (overrides = {}) => ({
  sender_name: 'Ahmed',
  hint: 'Our first university project',
  password: 'SmartFit',
  message: 'Happy Birthday Hamza ❤️\n\nI hope this year brings you everything you wish for…',
  image_urls: ['https://example.com/image.jpg'],
  website: '',
  ...overrides,
});

async function submit(overrides) {
  const res = await call('/api/messages', { method: 'POST', body: validSubmission(overrides) });
  return { res, data: await res.json() };
}

describe('birthday API', () => {
  before(startServer);
  after(() => {
    server.close();
    db.close();
  });
  beforeEach(() => {
    currentIp = `10.0.0.${++ipCounter}`;
  });

  it('starts with no envelopes', async () => {
    const res = await call('/api/envelopes');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).envelopes, []);
  });

  it('creates exactly one envelope per submission', async () => {
    const before = db.count();
    const { res, data } = await submit();

    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    assert.equal(data.message, 'Your message has been added! 🎉');
    assert.equal(db.count(), before + 1);
    assert.deepEqual(Object.keys(data.envelope).sort(), ['has_image', 'id', 'theme']);
    assert.equal(data.envelope.has_image, true);
  });

  it('never exposes sender, password, hint or message in the envelope list', async () => {
    await submit({ sender_name: 'Secret Sender', password: 'TopSecret99', message: 'A very hidden message body' });

    const res = await call('/api/envelopes');
    const raw = await res.text();

    for (const secret of ['Secret Sender', 'TopSecret99', 'A very hidden message body', 'Our first university project', 'scrypt']) {
      assert.ok(!raw.includes(secret), `list response leaked "${secret}"`);
    }
    for (const envelope of JSON.parse(raw).envelopes) {
      assert.deepEqual(Object.keys(envelope).sort(), ['has_image', 'id', 'theme']);
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
    assert.equal(body.message.sender_name, 'Ahmed');
    assert.equal(body.message.message, 'Happy Birthday Hamza ❤️\n\nSecond paragraph');
    assert.equal(body.message.image_url, 'https://example.com/image.jpg');
    assert.deepEqual(body.message.image_urls, ['https://example.com/image.jpg']);
    assert.ok(!JSON.stringify(body).includes('scrypt'), 'password hash leaked');
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

  it('accepts a message without images', async () => {
    const { res, data } = await submit({ sender_name: 'No Pics', message: 'No image here', image_urls: [] });
    assert.equal(res.status, 201);
    assert.equal(data.envelope.has_image, false);
  });

  it('validates required fields', async () => {
    const res = await call('/api/messages', { method: 'POST', body: {} });
    const body = await res.json();

    assert.equal(res.status, 422);
    assert.deepEqual(Object.keys(body.errors).sort(), ['hint', 'message', 'password', 'sender_name']);
  });

  it('rejects unsafe or invalid image links', async () => {
    for (const url of ['javascript:alert(1)', 'not a url', 'ftp://example.com/a.jpg', 'https://user:pass@example.com/a.jpg']) {
      currentIp = `10.1.0.${++ipCounter}`;
      const { res, data } = await submit({ sender_name: `Img ${ipCounter}`, message: `Image test ${url}`, image_urls: [url] });
      assert.equal(res.status, 422, url);
      assert.ok(data.errors['image_urls.0'], url);
    }
  });

  it('limits the number of images', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`);
    const { res, data } = await submit({ sender_name: 'Many', message: 'Too many images', image_urls: urls });
    assert.equal(res.status, 422);
    assert.ok(data.errors.image_urls);
  });

  it('stores text as-is (escaping happens when rendering) and strips control characters', async () => {
    const { data } = await submit({ sender_name: '<b>Bold</b>\u0007', message: '<script>alert(1)</script> hi', password: 'x' });
    const res = await call(`/api/messages/${data.envelope.id}/unlock`, { method: 'POST', body: { password: 'x' } });
    const body = await res.json();
    assert.equal(body.message.sender_name, '<b>Bold</b>');
    assert.equal(res.headers.get('content-type').includes('application/json'), true);
  });

  it('blocks honeypot spam without creating an envelope', async () => {
    const before = db.count();
    const { res } = await submit({ sender_name: 'Bot', message: 'Buy cheap stuff', website: 'http://spam.example' });
    assert.equal(res.status, 422);
    assert.equal(db.count(), before);
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
