// Vercel serverless function. vercel.json rewrites every /api/* request here,
// and the Express app routes it exactly as it does locally.
import { createApp } from '../server/app.js';
import { openPostgres } from '../server/postgres.js';

const databaseUrl = process.env.DATABASE_URL;

// Created once per instance and reused across requests while it stays warm.
const app = databaseUrl ? createApp({ db: openPostgres(databaseUrl), trustProxy: true }) : null;

export default function handler(req, res) {
  if (!app) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Server is missing DATABASE_URL (Vercel → Settings → Environment Variables).' }));
    return;
  }
  return app(req, res);
}
