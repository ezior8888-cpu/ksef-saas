/**
 * Zastosuj migracje z supabase/migrations na bazę Postgres (production).
 *
 * SUPABASE_DB_URL — pełny connection string z Dashboard → Database → URI (direct, :5432).
 *
 * Uruchom:
 *   pnpm db:push:prod:dry    # podejrzenie
 *   pnpm db:push:prod        # faktyczny push
 *
 * Pre-flight check (audyt 00026): wymuszamy obecność migracji wprowadzających
 * krytyczne zabezpieczenia, zanim cokolwiek pójdzie na prod. Brak nawet jednego
 * pliku → exit 2 (CI fail). Lista REQUIRED_PROD_MIGRATIONS jest świadomie
 * twardo zapisana — jakakolwiek zmiana wymaga code review w tym pliku, bo
 * dotyczy bezpieczeństwa.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

// ─── Pre-flight: wymuszone migracje bezpieczeństwa ─────────────────────────
//
// Każda z tych migracji rozwiązuje konkretne ryzyko zidentyfikowane w audycie.
// Jeśli ktoś przez pomyłkę usunie którąkolwiek z folderu `supabase/migrations`,
// chcemy zatrzymać deploy do PRODA, zamiast ślepo wypychać niekompletny stan.
const REQUIRED_PROD_MIGRATIONS = [
  // Audyt #5: usuwa test_as_user / install_test_helpers (RCE w bazie po wycieku service_role).
  '00026_drop_test_helpers_in_prod.sql',
  // Audyt #6: cofa INSERT/UPDATE/DELETE na audit_logs / xml_documents / ksef_submissions.
  '00027_lockdown_audit_xml_writes.sql',
  // Audyt #11: unique (tenant_id, internal_number) — chroni przed dubletami.
  '00028_invoices_internal_number_unique.sql',
  // Audyt #14: unique (export_job_id, filename) — wymagane przez UPSERT w Inngest.
  '00029_export_files_unique.sql',
  // Audyt #23: atomowy RPC increment_export_file_download.
  '00030_increment_download_count.sql',
  // Audyt #27: tenant_feature_flags + RLS.
  '00031_feature_flags.sql',
];

const migrationsDir = path.join(root, 'supabase', 'migrations');
const missing = REQUIRED_PROD_MIGRATIONS.filter(
  (m) => !fs.existsSync(path.join(migrationsDir, m)),
);

if (missing.length > 0) {
  console.error(
    [
      '╔══════════════════════════════════════════════════════════════════╗',
      '║  BLOKADA DEPLOYU PROD: brakuje wymaganych migracji bezpieczeństwa║',
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
      'Brakujące pliki w supabase/migrations/:',
      ...missing.map((m) => `  - ${m}`),
      '',
      'Każda z tych migracji likwiduje konkretną lukę z audytu (drop test_as_user,',
      'lockdown audit_logs, unique constraints, atomic RPC, feature flags).',
      'Jeśli świadomie chcesz usunąć którąkolwiek, zaktualizuj listę',
      'REQUIRED_PROD_MIGRATIONS w scripts/supabase-push-production.mjs',
      'wraz z uzasadnieniem w PR description.',
      '',
    ].join('\n'),
  );
  process.exit(2);
}

console.log(
  `[prod-push] OK: wszystkie ${REQUIRED_PROD_MIGRATIONS.length} wymagane migracje obecne.`,
);

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
