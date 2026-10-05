import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  rootDir,
  port: Number(process.env.PORT) || 3000,
  databasePath: process.env.DB_PATH || path.join(rootDir, 'data', 'birthday.sqlite'),
  distDir: path.join(rootDir, 'dist'),
  isProduction: process.env.NODE_ENV === 'production',
  // Set to true only when running behind a reverse proxy (nginx, Render, Fly, ...),
  // so rate limiting sees the real visitor IP instead of the proxy's.
  trustProxy: process.env.TRUST_PROXY === 'true',
};
