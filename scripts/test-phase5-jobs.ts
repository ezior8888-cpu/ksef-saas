/**
 * Test end-to-end Fazy 5: notify-user, inbox-polling, cert-expiry-alert.
 *
 * Co robi (sekwencyjnie):
 *   1. Rekonesans DB: stan test-invoice (po wcześniejszym onFailure) + tenant.
 *   2. Setup `public.users` ownera (bo `getTenantAdminEmail` go potrzebuje).
 *   3. Setup `tenants.ksef_certificate_expiry` na +6.5d (żeby trafić w okno 7d
 *      w `cert-expiry-alert` — okno to [6d, 7d]).
 *   4. `inngest.send(invoiceSubmitSucceeded)` → odpali `notifySuccessJob`.
 *   5. `inngest.send(invoiceSubmitFailed)`    → odpali `notifyFailureJob`.
 *   6. `inngest.send(inboxPollTenant)`        → odpali `inboxPollTenantJob`.
 *   7. GQL `invokeFunction(ksef-saas-cert-expiry-alert)`   → cron test.
 *   8. GQL `invokeFunction(ksef-saas-inbox-polling-cron)`  → cron + fan-out test.
 *   9. Printuje event IDs + URL do Inngest UI gdzie user może zobaczyć runs.
 *
 * Efekty do sprawdzenia:
 *   - Terminal z `pnpm dev` pokaże `[email:stub] send...` dla każdego jobu.
 *   - Inngest UI (http://localhost:8288/runs) pokaże 5+ nowych runów.
 *   - Invoice z poprzedniego run'u powinna mieć `ksef_status='failed'`.
 */

import { readFileSync } from 'node:fs';

import { config } from 'dotenv';

import { createScriptAdminClient } from './_supabase';

config({ path: '.env.local' });

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const ok = (m: string) => console.log(`${GREEN}✔${RESET} ${m}`);
const step = (m: string) => console.log(`\n${YELLOW}▸${RESET} ${m}`);
const fail = (m: string) => console.error(`${RED}✘${RESET} ${m}`);
const info = (m: string) => console.log(`${DIM}  ${m}${RESET}`);
const header = (m: string) =>
  console.log(`\n${BLUE}═══ ${m} ═══${RESET}`);

const TENANT_ID_FILE = '/tmp/ksef-test-tenant-id.txt';
const INVOICE_ID_FILE = '/tmp/ksef-test-invoice-id.txt';

const INNGEST_DEV_URL = 'http://localhost:8288';

// ─── helpers ─────────────────────────────────────────────────

function readFileOrFail(path: string, hint: string): string {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    fail(`brak ${path} - ${hint}`);
    process.exit(1);
  }
}

/** Invokuje funkcję przez Inngest Dev Server GraphQL API. */
async function invokeFunction(
  functionSlug: string,
  data: Record<string, unknown> = {},
): Promise<{ runID: string } | null> {
  const query = `
    mutation InvokeFunction($slug: String!, $data: Map) {
      invokeFunction(functionSlug: $slug, data: $data)
    }
  `;
  const res = await fetch(`${INNGEST_DEV_URL}/v0/gql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { slug: functionSlug, data },
    }),
  });
  const body = (await res.json()) as {
    data?: { invokeFunction?: string };
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    fail(`invokeFunction '${functionSlug}' FAIL: ${body.errors[0].message}`);
    return null;
  }
  const runID = body.data?.invokeFunction;
  if (!runID) {
    fail(`invokeFunction '${functionSlug}' zwróciło pusty payload`);
    return null;
  }
  return { runID };
}

// ─── main ────────────────────────────────────────────────────

async function main() {
  if (process.env.INNGEST_DEV !== '1') {
    fail('INNGEST_DEV != "1" - ustaw w .env.local i uruchom `pnpm inngest:dev`');
    process.exit(1);
  }

  const tenantId = readFileOrFail(
    TENANT_ID_FILE,
    'uruchom najpierw: pnpm seed:tenant',
  );
  const invoiceId = readFileOrFail(
    INVOICE_ID_FILE,
    'uruchom najpierw: pnpm seed:invoice',
  );

  const supabase = createScriptAdminClient();

  // ────────────────────────────────────────────────────────────
  header('1. Rekonesans DB (po poprzednim submit-invoice run)');
  // ────────────────────────────────────────────────────────────

  const { data: invRow } = await supabase
    .from('invoices')
    .select('id, ksef_status, last_error, ksef_number, last_attempt_at')
    .eq('id', invoiceId)
    .single();

  if (!invRow) {
    fail(`invoice ${invoiceId} nie istnieje`);
    process.exit(1);
  }
  info(`invoice.ksef_status:    ${invRow.ksef_status}`);
  info(`invoice.ksef_number:    ${invRow.ksef_number ?? 'null'}`);
  info(`invoice.last_error:     ${(invRow.last_error ?? 'null').slice(0, 80)}`);
  info(`invoice.last_attempt_at: ${invRow.last_attempt_at ?? 'null'}`);

  if (invRow.ksef_status === 'failed') {
    ok('onFailure handler poprawnie oznaczył fakturę jako "failed"');
  } else if (invRow.ksef_status === 'rejected') {
    ok('onFailure handler oznaczył fakturę jako "rejected" (NonRetriableError)');
  } else if (invRow.ksef_status === 'accepted') {
    info('invoice jest "accepted" - poprzedni run zakończył się sukcesem');
  } else {
    info(`invoice jest w stanie "${invRow.ksef_status}" - nietypowe, ale OK`);
  }

  const { data: tenRow } = await supabase
    .from('tenants')
    .select('id, nip, name, ksef_certificate_expiry')
    .eq('id', tenantId)
    .single();

  if (!tenRow) {
    fail(`tenant ${tenantId} nie istnieje`);
    process.exit(1);
  }
  info(`tenant.name:                   ${tenRow.name}`);
  info(`tenant.nip:                    ${tenRow.nip}`);
  info(`tenant.ksef_certificate_expiry: ${tenRow.ksef_certificate_expiry ?? 'null'}`);

  // ────────────────────────────────────────────────────────────
  header('2. Setup: public.users owner (dla getTenantAdminEmail)');
  // ────────────────────────────────────────────────────────────

  const TEST_OWNER_EMAIL = 'owner-test@ksef-saas.test';

  const { data: existingOwner } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .maybeSingle();

  let ownerId: string;

  if (existingOwner?.id) {
    ownerId = existingOwner.id;
    info(`owner już istnieje: ${ownerId}`);
    // Pobierz email z auth.users
    const { data: authUser } = await supabase.auth.admin.getUserById(ownerId);
    info(`  email: ${authUser?.user?.email ?? '???'}`);
  } else {
    step('tworzę auth user + public.users owner');

    // Poszukaj najpierw istniejącego auth user po email (idempotencja).
    const { data: list } = await supabase.auth.admin.listUsers();
    const existingAuth = list?.users?.find(
      (u) => u.email === TEST_OWNER_EMAIL,
    );

    if (existingAuth) {
      ownerId = existingAuth.id;
      info(`auth user już istnieje: ${ownerId}`);
    } else {
      const { data: created, error: createErr } =
        await supabase.auth.admin.createUser({
          email: TEST_OWNER_EMAIL,
          password: `Test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          email_confirm: true,
        });
      if (createErr || !created?.user) {
        fail(`createUser FAIL: ${createErr?.message ?? 'null'}`);
        process.exit(1);
      }
      ownerId = created.user.id;
      ok(`auth user utworzony: ${ownerId}`);
    }

    const { error: insErr } = await supabase.from('users').upsert(
      {
        id: ownerId,
        tenant_id: tenantId,
        name: 'Test Owner',
        role: 'owner',
      },
      { onConflict: 'id' },
    );
    if (insErr) {
      fail(`UPSERT public.users FAIL: ${insErr.message}`);
      process.exit(1);
    }
    ok(`public.users owner zapisany (tenant_id=${tenantId})`);
  }

  // ────────────────────────────────────────────────────────────
  header('3. Setup: ksef_certificate_expiry = +6.5d (trafia w okno 7d)');
  // ────────────────────────────────────────────────────────────

  // Okno 7d w cert-expiry-alert: [now + 6d, now + 7d].
  // +6.5d leży w środku tego okna → tenant zostanie znaleziony.
  const expiryDate = new Date(
    Date.now() + 6.5 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: expErr } = await supabase
    .from('tenants')
    .update({ ksef_certificate_expiry: expiryDate })
    .eq('id', tenantId);

  if (expErr) {
    fail(`UPDATE tenants cert_expiry FAIL: ${expErr.message}`);
    process.exit(1);
  }
  ok(`ksef_certificate_expiry = ${expiryDate}`);

  // ────────────────────────────────────────────────────────────
  header('4-6. Wysyłka eventów testowych → Inngest');
  // ────────────────────────────────────────────────────────────

  // Dynamic import (ESM hoisting - `inngest` client reads process.env na load).
  const {
    inngest,
    invoiceSubmitSucceeded,
    invoiceSubmitFailed,
    inboxPollTenant,
  } = await import('../lib/inngest/client');

  step('invoice/submit.succeeded → notifySuccessJob');
  const r1 = await inngest.send(
    invoiceSubmitSucceeded.create({
      tenantId,
      invoiceId,
      ksefNumber: 'FAK-TEST-20260419-NOTIFY-SUCCESS',
    }),
  );
  ok(`event_id: ${r1.ids[0]}`);

  step('invoice/submit.failed → notifyFailureJob');
  const r2 = await inngest.send(
    invoiceSubmitFailed.create({
      tenantId,
      invoiceId,
      error:
        'Test błąd: NonRetriableError - KSeF odrzucił fakturę (sync test)',
    }),
  );
  ok(`event_id: ${r2.ids[0]}`);

  step('inbox/poll.tenant → inboxPollTenantJob');
  const r3 = await inngest.send(
    inboxPollTenant.create({
      tenantId,
      nip: tenRow.nip,
    }),
  );
  ok(`event_id: ${r3.ids[0]}`);

  // ────────────────────────────────────────────────────────────
  header('7-8. Ręczne invoke cron jobów (GQL API Inngest Dev)');
  // ────────────────────────────────────────────────────────────

  step('invokeFunction ksef-saas-cert-expiry-alert');
  const c1 = await invokeFunction('ksef-saas-cert-expiry-alert');
  if (c1) ok(`runID: ${c1.runID}`);

  step('invokeFunction ksef-saas-inbox-polling-cron');
  const c2 = await invokeFunction('ksef-saas-inbox-polling-cron');
  if (c2) ok(`runID: ${c2.runID}`);

  // ────────────────────────────────────────────────────────────
  header('DONE');
  // ────────────────────────────────────────────────────────────
  console.log(`${DIM}Co teraz:${RESET}`);
  console.log(`  1. Otwórz ${GREEN}http://localhost:8288/runs${RESET}`);
  console.log(`  2. Zobacz 5 nowych runów (3 od eventów + 2 od invoke)`);
  console.log(`  3. W terminalu z ${YELLOW}pnpm dev${RESET} zobaczysz logi:`);
  console.log(`       ${DIM}[email:stub] sendInvoiceAcceptedEmail → ${TEST_OWNER_EMAIL}${RESET}`);
  console.log(`       ${DIM}[email:stub] sendInvoiceFailedEmail  → ${TEST_OWNER_EMAIL}${RESET}`);
  console.log(`       ${DIM}[email:stub] sendCertExpiryAlert     → ${TEST_OWNER_EMAIL}${RESET}`);
  console.log(`  4. Ten skrypt kończy bez czekania - daj Inngest kilka sekund.`);
}

main().catch((err) => {
  console.error(`\n${RED}unhandled:${RESET}`, err);
  process.exit(1);
});
