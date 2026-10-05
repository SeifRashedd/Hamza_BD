// Runs the API (with auto-restart) and the Vite dev server together.
// Open http://localhost:5173 — Vite proxies /api to the Express server on :3000.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

const processes = [
  spawn(process.execPath, ['--watch-path=server', 'server/index.js'], {
    stdio: 'inherit',
    env: { ...process.env, SERVE_CLIENT: 'false' },
  }),
  spawn(process.execPath, [viteBin], { stdio: 'inherit' }),
];

function stopAll(code = 0) {
  for (const child of processes) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(code);
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) stopAll(code);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
