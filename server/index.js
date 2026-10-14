import { createApp } from './app.js';
import { config } from './config.js';

// Postgres when DATABASE_URL is set (e.g. testing against Supabase), otherwise local SQLite.
const db = config.databaseUrl
  ? (await import('./postgres.js')).openPostgres(config.databaseUrl)
  : (await import('./db.js')).openDatabase(config.databasePath);
const serveClient = process.env.SERVE_CLIENT !== 'false';

const app = createApp({
  db,
  serveClient,
  distDir: config.distDir,
  trustProxy: config.trustProxy,
});

const server = app.listen(config.port, () => {
  const where = `http://localhost:${config.port}`;
  const store = config.databaseUrl ? 'Postgres (DATABASE_URL)' : 'local SQLite';
  console.log(serveClient ? `🎂 Hamza's birthday site is live at ${where}` : `🎂 API listening on ${where}`);
  console.log(`   Database: ${store}`);
});

function shutdown() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
