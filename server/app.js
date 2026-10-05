import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { hashPassword, verifyPassword } from './passwords.js';
import { rateLimit } from './rateLimit.js';
import { validateSubmission, validateUnlock } from './validation.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const SLOW_DOWN = 'Whoa, slow down! 😅 Take a breath and try again in a minute.';

/**
 * Builds the Express app. Kept separate from `index.js` so tests can start it
 * on a random port with an in-memory database.
 */
export function createApp({ db, serveClient = false, distDir, trustProxy = false }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  app.use(securityHeaders(serveClient));
  app.use('/api', express.json({ limit: '32kb' }));

  const api = express.Router();

  // ── Rate limits ──────────────────────────────────────────────────────────
  const submitPerMinute = rateLimit({ keyPrefix: 'submit-min', windowMs: MINUTE, max: 6, message: SLOW_DOWN });
  const submitPerDay = rateLimit({
    keyPrefix: 'submit-day',
    windowMs: DAY,
    max: 20,
    message: 'That’s a lot of love for one day 💕 Please try again tomorrow.',
  });
  const unlockPerEnvelope = rateLimit({
    keyPrefix: 'unlock-env',
    windowMs: MINUTE,
    max: 10,
    key: (req) => `${req.ip}|${req.params.id}`,
    message: 'Too many guesses on this one 🙈 Take a minute and think about it!',
  });
  const unlockOverall = rateLimit({ keyPrefix: 'unlock-all', windowMs: MINUTE, max: 60, message: SLOW_DOWN });
  const readLimit = rateLimit({ keyPrefix: 'read', windowMs: MINUTE, max: 120, message: SLOW_DOWN });

  // ── Routes ───────────────────────────────────────────────────────────────

  /** Locked envelopes only: id, colour theme and whether there's a photo inside. */
  api.get('/envelopes', readLimit, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ envelopes: db.listEnvelopes() });
  });

  /** The hint is only handed out once an envelope is opened. */
  api.get('/envelopes/:id', readLimit, withEnvelopeId, (req, res) => {
    const row = db.findHint(req.envelopeId);
    if (!row) return notFound(res);
    res.set('Cache-Control', 'no-store');
    res.json({ envelope: { id: row.id, hint: row.hint } });
  });

  api.post('/messages', requireJson, submitPerMinute, submitPerDay, async (req, res, next) => {
    try {
      const { data, errors, isSpam } = validateSubmission(req.body);

      if (isSpam) {
        return res.status(422).json({ success: false, message: 'Something went wrong. Please try again.' });
      }

      if (Object.keys(errors).length === 0 && db.isDuplicate(data.senderName, data.message)) {
        errors.message = 'Looks like this exact message was already sent 💌';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(422).json({ success: false, message: 'Please check the highlighted fields.', errors });
      }

      const envelope = db.create({
        senderName: data.senderName,
        hint: data.hint,
        passwordHash: await hashPassword(data.password),
        message: data.message,
        imageUrls: data.imageUrls,
      });

      res.status(201).json({ success: true, message: 'Your message has been added! 🎉', envelope });
    } catch (error) {
      next(error);
    }
  });

  api.post(
    '/messages/:id/unlock',
    requireJson,
    withEnvelopeId,
    unlockOverall,
    unlockPerEnvelope,
    async (req, res, next) => {
      try {
        const { password, errors } = validateUnlock(req.body);
        if (errors) {
          return res.status(422).json({ success: false, message: errors.password, errors });
        }

        const row = db.findForUnlock(req.envelopeId);
        if (!row) return notFound(res);

        if (!(await verifyPassword(password, row.password_hash))) {
          return res.status(422).json({ success: false, message: 'Wrong password' });
        }

        res.set('Cache-Control', 'no-store');
        res.json({
          success: true,
          message: {
            id: row.id,
            sender_name: row.sender_name,
            message: row.message,
            image_url: row.image_urls[0] ?? null,
            image_urls: row.image_urls,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  api.use((req, res) => notFound(res, 'Not found'));

  app.use('/api', api);

  // ── Built React app (production) ─────────────────────────────────────────
  if (serveClient) {
    const indexFile = path.join(distDir, 'index.html');

    app.use(express.static(distDir, { index: false, maxAge: '1y', immutable: true }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!fs.existsSync(indexFile)) {
        return res.status(503).type('text').send('The site has not been built yet. Run "npm run build" first.');
      }
      res.set('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  }

  app.use(errorHandler);

  return app;
}

// ── Middleware helpers ─────────────────────────────────────────────────────

function withEnvelopeId(req, res, next) {
  if (!/^\d{1,10}$/.test(req.params.id)) return notFound(res);
  req.envelopeId = Number(req.params.id);
  next();
}

/** Only accept JSON bodies — this also blocks simple cross-site form posts. */
function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ success: false, message: 'Please send JSON.' });
  }
  next();
}

function notFound(res, message = 'This envelope doesn’t exist 🤔') {
  return res.status(404).json({ success: false, message });
}

function securityHeaders(withCsp) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    'img-src * data: blob:',
    'media-src * blob:',
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    if (withCsp) res.set('Content-Security-Policy', csp);
    next();
  };
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'That message is too big to fit in an envelope 😅' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'We couldn’t read that request.' });
  }

  console.error(error);
  res.status(500).json({ success: false, message: 'Something went wrong on our side. Please try again.' });
}
