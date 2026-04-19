/**
 * Seed testowego tenanta dla pipeline KSeF + Inngest.
 *
 * Co robi:
 *   1. Czyta NIP z KSEF_TEST_NIP (source-of-truth dla kontekstu tokena)
 *   2. Upsertuje tenanta w `public.tenants` (po UNIQUE nip)
 *   3. Szyfruje `{ type: 'token', nip, token }` z KSEF_TEST_TOKEN
 *   4. Zapisuje blob w `tenants.ksef_credentials_encrypted` (BYTEA)
 *   5. Drukuje tenant.id na stdout + zapisuje do `/tmp/ksef-test-tenant-id.txt`
 *      (używane przez seed-test-invoice.ts i trigger-submit.ts)
 *
 * Idempotent - możesz uruchamiać wielokrotnie (update'uje credentials).
 *
 * Uruchom:  pnpm seed:tenant
 */

import { writeFileSync } from 'node:fs';

import { config } from 'dotenv';

import { encryptCredentials } from '../lib/ksef/credentials-crypto';

import { bufferToByteaLiteral, createScriptAdminClient } from './_supabase';

config({ path: '.env.local' });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const ok = (m: string) => console.log(`${GREEN}✔${RESET} ${m}`);
const step = (m: string) => console.log(`${YELLOW}→${RESET} ${m}`);
const fail = (m: string) => console.error(`${RED}✘${RESET} ${m}`);
const info = (m: string) => console.log(`${DIM}${m}${RESET}`);

const TENANT_ID_FILE = '/tmp/ksef-test-tenant-id.txt';

function assertEnv(value: string | undefined, name: string): asserts value is string {
  if (!value) {
    fail(`brakuje ${name} w .env.local`);
    process.exit(1);
  }
}

async function main() {
  const nip = process.env.KSEF_TEST_NIP;
  const token = process.env.KSEF_TEST_TOKEN;

  assertEnv(nip, 'KSEF_TEST_NIP');
  assertEnv(token, 'KSEF_TEST_TOKEN');
  assertEnv(process.env.KSEF_CREDENTIALS_ENCRYPTION_KEY, 'KSEF_CREDENTIALS_ENCRYPTION_KEY');
  assertEnv(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');

  console.log(`${DIM}=== Seed test tenant ===${RESET}\n`);
  info(`NIP:   ${nip}`);
  info(`token: ${token.slice(0, 24)}... (${token.length} znaków)\n`);

  const supabase = createScriptAdminClient();

  // ─── Upsert tenanta po NIP ───────────────────────────────
  step('upsert w public.tenants (po unique nip)…');

  const { data: existing, error: selErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('nip', nip)
    .maybeSingle();

  if (selErr) {
    fail(`SELECT tenants FAIL: ${selErr.message}`);
    process.exit(1);
  }

  let tenantId: string;

  if (existing) {
    tenantId = existing.id;
    info(`tenant już istnieje: ${tenantId}`);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('tenants')
      .insert({
        name: 'KSeF SaaS Test Tenant',
        nip,
        subscription_tier: 'basic',
      })
      .select('id')
      .single();

    if (insErr) {
      fail(`INSERT tenants FAIL: ${insErr.message}`);
      process.exit(1);
    }

    tenantId = inserted.id;
    ok(`tenant utworzony: ${tenantId}`);
  }

  // ─── Szyfruj credentials ─────────────────────────────────
  step('szyfruj credentials (AES-256-GCM)…');

  const blob = encryptCredentials({
    type: 'token',
    nip,
    token,
  });

  info(`blob size: ${blob.length} bajtów`);

  // ─── Zapis do BYTEA ──────────────────────────────────────
  step('UPDATE tenants SET ksef_credentials_encrypted…');

  const { error: updErr } = await supabase
    .from('tenants')
    .update({
      ksef_credentials_encrypted: bufferToByteaLiteral(blob),
    })
    .eq('id', tenantId);

  if (updErr) {
    fail(`UPDATE tenants FAIL: ${updErr.message}`);
    process.exit(1);
  }

  ok('credentials zaszyfrowane i zapisane');

  // ─── Zapisz tenant_id do pliku ───────────────────────────
  writeFileSync(TENANT_ID_FILE, tenantId, 'utf8');
  info(`\ntenant_id zapisany w ${TENANT_ID_FILE}`);

  console.log(`\n${GREEN}=== SEED TENANT OK ===${RESET}`);
  console.log(`${DIM}tenant_id:${RESET} ${GREEN}${tenantId}${RESET}`);
  console.log(`${DIM}Teraz uruchom:${RESET} pnpm seed:invoice`);
}

main().catch((err) => {
  console.error(`\n${RED}unhandled:${RESET}`, err);
  process.exit(1);
});
