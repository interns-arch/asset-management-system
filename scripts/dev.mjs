// `npm run dev` — database, API (auto-restart) and web app (hot reload) in one command.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { API_DIST, ensureDatabase, localUrl, ROOT, run, startPostgres, TSC, VITE } from './pg.mjs';

const DATABASE_URL = process.env.DATABASE_URL ?? localUrl('eam');
const API_PORT = process.env.API_PORT ?? '3000';
// PORT is set explicitly so an inherited PORT (e.g. from a preview tool) cannot move the API.
const env = { DATABASE_URL, NODE_ENV: 'development', PORT: API_PORT, API_PORT };

const db = await startPostgres();
await ensureDatabase('eam');

console.log('• Building…');
await run([TSC, '-b', 'apps/api']);
await run([path.join(API_DIST, 'db', 'migrate.js')], { env });
await run([path.join(API_DIST, 'seed', 'seed.js')], { env });

const children = [
  spawn(process.execPath, [TSC, '-b', '-w', '--preserveWatchOutput', 'apps/api'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env } }),
  spawn(process.execPath, ['--watch', path.join(API_DIST, 'main.js')], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } }),
  spawn(process.execPath, [VITE], { cwd: path.join(ROOT, 'apps', 'web'), stdio: 'inherit', env: { ...process.env, ...env } }),
];
// Only surface compiler errors from the watcher.
children[0].stdout.on('data', (buf) => {
  const text = buf.toString();
  if (/error TS/.test(text)) process.stdout.write(text);
});

console.log('\n  ➜ Open http://localhost:5173  (admin@acme.test / Demo@1234)\n');

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  await db.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
