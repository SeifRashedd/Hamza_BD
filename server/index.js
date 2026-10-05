import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';

const db = openDatabase(config.databasePath);
const serveClient = process.env.SERVE_CLIENT !== 'false';

const app = createApp({
  db,
  serveClient,
  distDir: config.distDir,
  trustProxy: config.trustProxy,
});

const server = app.listen(config.port, () => {
  const where = `http://localhost:${config.port}`;
  console.log(serveClient ? `🎂 Hamza's birthday site is live at ${where}` : `🎂 API listening on ${where}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
