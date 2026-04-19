/**
 * Ręczny trigger Inngest eventu `invoice/submit.requested`.
 *
 * Kontekst: nie mamy jeszcze formularza/UI trigger'a, ale mamy działający
 * pipeline (generateFA3Xml → R2 → KSeF → DB update). Ten skrypt robi
 * `inngest.send(invoiceSubmitRequested.create(...))`, identycznie jak
 * zrobi to przyszła Server Action ze strony `/invoices/[id]`.
 *
 * W trybie dev (INNGEST_DEV=1) SDK bije w http://localhost:8288/e/<key>.
 * Inngest Dev Server podaje event do zarejestrowanych funkcji (`submitInvoiceJob`
 * na `/api/inngest` w uruchomionym `next dev`).
 *
 * Flow:
 *   1. Czyta invoice_id z pliku lub z argumentu CLI
 *   2. SELECT invoices + tenants (tenant_id, nip, fa3_data)
 *   3. Waliduje że ksef_status pozwala na wysyłkę (draft/queued/failed)
 *   4. inngest.send(invoiceSubmitRequested.create({...}))
 *   5. Printuje event_id - można śledzić w Inngest UI
 *
 * Uruchom:  pnpm trigger:submit              # czyta z /tmp/ksef-test-invoice-id.txt
 * Uruchom:  pnpm trigger:submit <uuid>       # override argumentem
 */

import { readFileSync } from 'node:fs';

import { config } from 'dotenv';

import type { Invoice } from '../types/invoice';

import { createScriptAdminClient } from './_supabase';

// Kolejność ładowania env dla Inngest klienta:
//
// `lib/inngest/client.ts` tworzy instancję `new Inngest({...})` na poziomie
// modułu - odczytuje `process.env.INNGEST_EVENT_KEY` i `INNGEST_DEV` przy
// imporcie. W ESM statyczne importy są HOISTOWANE nad module code, więc
// `import { inngest } from '../lib/inngest/client'` wykonałoby się PRZED
// wywołaniem `config()`, z undefined env -> "Failed to send event".
//
// Rozwiązanie: `config()` top-level (wykona się przed `main()`),
// a klienta Inngest ładujemy dynamic import'em wewnątrz `main()`.
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

const INVOICE_ID_FILE = '/tmp/ksef-test-invoice-id.txt';

const SENDABLE_STATUSES = ['draft', 'queued', 'failed', 'rejected'];

async function main() {
  console.log(`${DIM}=== Trigger invoice/submit.requested ===${RESET}\n`);

  // ─── Resolve invoice_id ──────────────────────────────────
  const cliArg = process.argv[2];
  let invoiceId: string;

  if (cliArg) {
    invoiceId = cliArg.trim();
    info(`invoice_id (z argumentu): ${invoiceId}`);
  } else {
    try {
      invoiceId = readFileSync(INVOICE_ID_FILE, 'utf8').trim();
    } catch {
      fail(
        `brak ${INVOICE_ID_FILE} i brak argumentu CLI - uruchom najpierw: pnpm seed:invoice\n` +
          `  lub podaj explicit: pnpm trigger:submit <uuid>`,
      );
      process.exit(1);
    }
    info(`invoice_id (z pliku): ${invoiceId}`);
  }

  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) {
    fail(`niepoprawny UUID: ${invoiceId}`);
    process.exit(1);
  }

  // ─── Pobierz dane faktury + tenant ───────────────────────
  step('SELECT invoice + tenant…');

  const supabase = createScriptAdminClient();

  const { data: invoiceRow, error: invErr } = await supabase
    .from('invoices')
    .select('id, tenant_id, ksef_status, fa3_data')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoiceRow) {
    fail(`invoice ${invoiceId} nie istnieje: ${invErr?.message ?? 'null'}`);
    process.exit(1);
  }

  if (!SENDABLE_STATUSES.includes(invoiceRow.ksef_status)) {
    fail(
      `faktura ma status '${invoiceRow.ksef_status}' - nie można wysłać.\n` +
        `  Dozwolone statusy: ${SENDABLE_STATUSES.join(', ')}`,
    );
    process.exit(1);
  }

  const { data: tenantRow, error: tErr } = await supabase
    .from('tenants')
    .select('nip, ksef_credentials_encrypted')
    .eq('id', invoiceRow.tenant_id)
    .single();

  if (tErr || !tenantRow) {
    fail(`tenant ${invoiceRow.tenant_id} nie istnieje: ${tErr?.message ?? 'null'}`);
    process.exit(1);
  }

  if (!tenantRow.ksef_credentials_encrypted) {
    fail(
      `tenant ${invoiceRow.tenant_id} nie ma zaszyfrowanych credentials KSeF.\n` +
        `  Uruchom: pnpm seed:tenant`,
    );
    process.exit(1);
  }

  info(`tenant_id:      ${invoiceRow.tenant_id}`);
  info(`NIP:            ${tenantRow.nip}`);
  info(`ksef_status:    ${invoiceRow.ksef_status}`);

  // ─── Wyślij event ────────────────────────────────────────
  step('inngest.send(invoiceSubmitRequested.create(…))…');

  // Dynamic import - `lib/inngest/client` czyta process.env na module load,
  // więc musimy go zaimportować DOPIERO po `config({ path: '.env.local' })`
  // z topu pliku. Zobacz komentarz przy config() żeby zrozumieć dlaczego.
  const { inngest, invoiceSubmitRequested } = await import(
    '../lib/inngest/client'
  );

  // Sanity-check: bez INNGEST_DEV=1 SDK próbuje bić w Inngest Cloud (production)
  // i wymaga realnego event key. W dev chcemy uderzać w lokalny Dev Server.
  if (process.env.INNGEST_DEV !== '1') {
    fail(
      'INNGEST_DEV != "1" - SDK spróbuje wysłać event do Inngest Cloud zamiast\n' +
        '  lokalnego Dev Servera. Ustaw INNGEST_DEV=1 w .env.local i upewnij się,\n' +
        '  że `pnpm inngest:dev` działa na :8288.',
    );
    process.exit(1);
  }

  const invoice = invoiceRow.fa3_data as Invoice;

  const result = await inngest.send(
    invoiceSubmitRequested.create({
      tenantId: invoiceRow.tenant_id,
      invoiceId: invoiceRow.id,
      invoice,
      nip: tenantRow.nip,
    }),
  );

  ok('event wysłany');
  info(`event_ids: ${JSON.stringify(result.ids, null, 2)}`);

  console.log(`\n${GREEN}=== TRIGGER OK ===${RESET}`);
  console.log(`${DIM}Co teraz:${RESET}`);
  console.log(`  1. Otwórz Inngest Dev UI: ${GREEN}http://localhost:8288${RESET}`);
  console.log(`  2. Zakładka "Runs" - zobaczysz run submit-invoice-to-ksef`);
  console.log(`  3. Po sukcesie sprawdź w Supabase Studio invoices.ksef_status='accepted'`);
}

main().catch((err) => {
  console.error(`\n${RED}unhandled:${RESET}`, err);
  process.exit(1);
});
