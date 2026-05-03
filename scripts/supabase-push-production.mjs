/**
 * Zastosuj migracje z supabase/migrations na bazę Postgres (production).
 *
 * SUPABASE_DB_URL — pełny connection string z Dashboard → Database → URI (direct, :5432).
 *
 * Uruchom:
 *   pnpm db:push:prod:dry    # podejrzenie
 *   pnpm db:push:prod       # faktyczny push
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

const url = process.env.SUPABASE_DB_URL;
if (!url || String(url).trim() === '') {
  console.error(
    'Brak SUPABASE_DB_URL. Przykład (PowerShell):\n  $env:SUPABASE_DB_URL="postgresql://..."\nPrzykład (bash/zsh):\n  export SUPABASE_DB_URL=\'postgresql://...\'',
  );
  process.exit(1);
}

const args = [
  '--yes',
  'supabase@latest',
  'db',
  'push',
  '--workdir',
  root,
  '--db-url',
  url,
];
if (dryRun) args.push('--dry-run');
args.push('--yes');

const r = spawnSync('npx', args, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(r.status === null ? 1 : r.status);
