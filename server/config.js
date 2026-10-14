import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load a local .env file if there is one (Vercel sets real environment variables instead).
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  /* no .env file — that's fine */
}

export const config = {
  rootDir,
  port: Number(process.env.PORT) || 3000,
  // Set → use Postgres (Supabase). Empty → use the local SQLite file below.
  databaseUrl: process.env.DATABASE_URL || '',
  databasePath: process.env.DB_PATH || path.join(rootDir, 'data', 'birthday.sqlite'),
  distDir: path.join(rootDir, 'dist'),
  isProduction: process.env.NODE_ENV === 'production',
  // Set to true only when running behind a reverse proxy (Vercel, nginx, ...),
  // so rate limiting sees the real visitor IP instead of the proxy's.
  trustProxy: process.env.TRUST_PROXY === 'true',
};
