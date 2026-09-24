import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X-05 — audyt porządku: wpięcie w bazę i kanarek (plan FLO 2, krok 1.1c).
 *
 * Do 17.09.2026 audyt na produkcji nie znalazł niczego: pytał o kolumny,
 * których tabele nie mają, a błąd zapytania wyglądał jak konto bez faktur.
 * Atrapa klienta administracyjnego w tym pliku robi dokładnie to, czego
 * zabrakło: nieznana kolumna (w `select` i `order`) to błąd `42703`, jak
 * w PostgREST. Listy kolumn są przepisane z `types/database.ts`.
 */

const store = vi.hoisted(() => ({
  rows: {
    invoices: [] as Array<Record<string, unknown>>,
    contractors: [] as Array<Record<string, unknown>>,
    expenses: [] as Array<Record<string, unknown>>,
    upo_receipts: [] as Array<Record<string, unknown>>,
  } as Record<string, Array<Record<string, unknown>>>,
  queries: 0,
  upoBatches: [] as number[],
  failInvoicesFor: new Set<string>(),
}));

const captureException = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ captureException }));

vi.mock('@/lib/supabase/admin', () => {
  const COLUMNS: Record<string, Set<string>> = {
    invoices: new Set(
      ('advance_amount advance_invoice_ids archive_storage_path archived_at bank_account_validated ' +
        'buyer_data buyer_id_number buyer_id_type buyer_nip buyer_pesel buyer_vat_status_at_issue ' +
        'correction_reason correction_type created_at currency days_to_payment direction fa3_data ' +
        'gross_total id internal_number invoice_kind invoice_type is_b2c issue_date ksef_accepted_at ' +
        'ksef_number ksef_status last_attempt_at last_error last_error_code last_error_field ' +
        'last_error_suggestion net_total notes offline_idempotency_key offline_qr_certyfikat ' +
        'offline_qr_offline origin paid_amount paid_at parent_invoice_id payment_data ' +
        'payment_due_date payment_status pdf_generated_at pdf_storage_path reminders_paused ' +
        'reminders_paused_reason sale_date scheduled_deletion_at seller_data seller_nip ' +
        'submission_attempts submitted_to_ksef_at tenant_id updated_at validation_warnings ' +
        'vat_total xml_storage_path').split(' '),
    ),
    contractors: new Set(
      ('address bank_accounts_validated created_at email id last_used_at manual_fields ' +
        'last_validation_at last_validation_source late_payment_count name nip ' +
        'payment_terms_days_avg phone reminder_excluded reminder_exclusion_reason tenant_id ' +
        'validation_warning vat_status').split(' '),
    ),
    expenses: new Set(
      ('categorization_confidence categorization_method category_label created_at created_by ' +
        'document_number document_type gross_amount id is_deductible is_reviewed issue_date ' +
        'kpir_column ksef_invoice_id net_amount notes ocr_extracted_data ocr_job_id seller_address ' +
        'seller_name seller_nip source source_file_mime source_file_path tenant_id updated_at ' +
        'vat_amount vat_deductible_amount vat_rate').split(' '),
    ),
    upo_receipts: new Set(
      ('archive_glacier_key archived_at created_at download_attempts downloaded_at id invoice_id ' +
        'ksef_acceptance_timestamp ksef_number last_error status tenant_id upo_id upo_pdf_path ' +
        'upo_xml_hash upo_xml_path').split(' '),
    ),
  };

  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: (select: string) => {
          store.queries++;
          const columns = select.split(',').map((c) => c.trim());
          const eqs: Array<[string, unknown]> = [];
          let inFilter: [string, readonly unknown[]] | null = null;
          let orderBy: string | null = null;

          const run = () => {
            const bad = [...columns, ...(orderBy ? [orderBy] : [])].find(
              (c) => !COLUMNS[table]?.has(c),
            );
            if (bad) {
              return {
                data: null,
                error: { code: '42703', message: `column ${table}.${bad} does not exist` },
              };
            }
            const tenant = eqs.find(([c]) => c === 'tenant_id')?.[1];
            if (table === 'invoices' && store.failInvoicesFor.has(String(tenant))) {
              return { data: null, error: { message: 'canceling statement due to statement timeout' } };
            }
            const rows = (store.rows[table] ?? [])
              .filter((r) => eqs.every(([c, v]) => r[c] === v))
              .filter((r) => !inFilter || inFilter[1].includes(r[inFilter[0]]))
              .map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
            return { data: rows, error: null };
          };

          const builder = {
            eq: (column: string, value: unknown) => {
              eqs.push([column, value]);
              return builder;
            },
            in: (column: string, values: readonly unknown[]) => {
              inFilter = [column, values];
              store.upoBatches.push(values.length);
              return builder;
            },
            order: (column: string) => {
              orderBy = column;
              return builder;
            },
            limit: () => builder,
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
          };
          return builder;
        },
      }),
    }),
  };
});

import { runKsefAuditSweep } from '@/lib/flo/functions/audit-sweep';
import { ruleRun, runFloTick } from '@/lib/flo/tick';

import { createFakeDb } from './flo-fake-db';

/** Czwartek 1 października 2026, 07:30 w Warszawie — pierwszy dzień roboczy. */
const NOW = new Date('2026-10-01T05:30:00.000Z');
const TENANT = 'ten-1';
const noKill = async () => false;

function alpha(tenantId = TENANT) {
  return { tenant_id: tenantId, kind: 'ksef.audit', enabled: true, reason: 'alfa X-05' };
}

function invoice(
  id: string,
  overrides: { number?: string; origin?: string; upo?: boolean; tenantId?: string } = {},
) {
  const tenantId = overrides.tenantId ?? TENANT;
  store.rows.invoices!.push({
    id,
    tenant_id: tenantId,
    direction: 'issued',
    internal_number: overrides.number ?? `FV/${id}`,
    issue_date: '2026-09-15',
    ksef_status: 'accepted',
    origin: overrides.origin ?? 'app',
  });
  if (overrides.upo !== false) {
    store.rows.upo_receipts!.push({ invoice_id: id, tenant_id: tenantId });
  }
}

function expense(id: string, overrides: Record<string, unknown>) {
  store.rows.expenses!.push({
    id,
    tenant_id: TENANT,
    seller_name: id,
    issue_date: '2026-09-10',
    source: 'manual',
    source_file_path: null,
    ksef_invoice_id: null,
    ...overrides,
  });
}

function labels(db: ReturnType<typeof createFakeDb>): string[] {
  const payload = db.tables.flo_proposals[0]?.payload as
    | { items?: Array<{ label: string }> }
    | undefined;
  return (payload?.items ?? []).map((item) => item.label);
}

beforeEach(() => {
  for (const table of Object.keys(store.rows)) store.rows[table]!.length = 0;
  store.queries = 0;
  store.upoBatches.length = 0;
  store.failInvoicesFor.clear();
  captureException.mockClear();
});

describe('X-05 — kanarek', () => {
  it('konto poza kanarkiem: audyt liczy do trybu cichego, klient nie dostaje karty', async () => {
    // Tak wygląda każde konto, dopóki ktoś świadomie nie odsłoni audytu
    // w flo_rollout albo nie wpuści konta w flo_kind_flags.
    // Do 24.09 ten test brzmiał „konto poza kanarkiem: nic nie czytamy"
    // i pilnował BŁĘDU: bramka przed odczytem wycinała też kanarka, więc tryb
    // cichy nie zapisał dla tej reguły ani jednego wpisu. Konto poza
    // kanarkiem ma liczyć — klient nie dostaje karty, operator dostaje wpis.
    invoice('A', { upo: false });
    const db = createFakeDb();

    const result = await runKsefAuditSweep([TENANT], NOW, db.client, { readGlobalKill: noKill });

    expect(result).toEqual({ asked: 0, closed: 0, failed: 0 });
    expect(store.queries).toBeGreaterThan(0);
    expect(db.tables.flo_proposals).toHaveLength(0);
    expect(db.tables.flo_shadow).toHaveLength(1);
  });

  it('konto wypisane przez operatora: zero zapytań o dokumenty', async () => {
    invoice('A', { upo: false });
    const db = createFakeDb({ flo_kind_flags: [{ tenant_id: TENANT, kind: 'ksef.audit', enabled: false, reason: 'klient poprosił' }] });

    const result = await runKsefAuditSweep([TENANT], NOW, db.client, { readGlobalKill: noKill });

    expect(result).toEqual({ asked: 0, closed: 0, failed: 0 });
    expect(store.queries).toBe(0);
    expect(db.tables.flo_shadow).toHaveLength(0);
  });
});

describe('X-05 — audyt naprawdę coś znajduje', () => {
  it('AWARIA: zapytania pytają o istniejące kolumny i faktura bez UPO trafia na kartę', async () => {
    invoice('A', { upo: false });
    const db = createFakeDb({ flo_kind_flags: [alpha()] });

    const result = await runKsefAuditSweep([TENANT], NOW, db.client, { readGlobalKill: noKill });

    expect(result).toEqual({ asked: 1, closed: 0, failed: 0 });
    expect(captureException).not.toHaveBeenCalled();
    expect(db.tables.flo_proposals[0]!.topic_key).toBe('ksef.audit:2026-10');
    expect(labels(db)).toContain('Faktura FV/A bez poświadczenia odbioru');
  });

  it('błąd zapytania to NIE „zero faktur": zgłoszenie, a następne konto dostaje audyt', async () => {
    invoice('A', { upo: false });
    invoice('B', { upo: false, tenantId: 'ten-bad' });
    store.failInvoicesFor.add('ten-bad');
    const db = createFakeDb({ flo_kind_flags: [alpha('ten-bad'), alpha()] });
    const errors: string[] = [];

    const result = await runKsefAuditSweep(['ten-bad', TENANT], NOW, db.client, {
      readGlobalKill: noKill,
      logger: { error: (message: string) => errors.push(message) },
    });

    expect(result).toEqual({ asked: 1, closed: 0, failed: 1 });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]![1]).toMatchObject({
      tags: { kind: 'ksef.audit', tenant_id: 'ten-bad' },
    });
    expect(errors[0]).toContain('ten-bad');
    expect(db.tables.flo_proposals.map((p) => p.tenant_id)).toEqual([TENANT]);
  });
});

describe('X-05 — bez fałszywych zarzutów', () => {
  it('numeracja z importu nie daje luk — nasza numeracja daje', async () => {
    // Cudza numeracja z poprzedniego programu: 7 i 40. Nasza: 1, 2, 3.
    invoice('i7', { number: 'FV/7/2025', origin: 'ksef_import' });
    invoice('i40', { number: 'FV/40/2025', origin: 'file_import' });
    invoice('a1', { number: 'FV/1/2026' });
    invoice('a2', { number: 'FV/2/2026' });
    invoice('a3', { number: 'FV/3/2026' });
    const db = createFakeDb({ flo_kind_flags: [alpha()] });

    await runKsefAuditSweep([TENANT], NOW, db.client, { readGlobalKill: noKill });
    expect(db.tables.flo_proposals).toHaveLength(0);

    // Kontrola: prawdziwa luka w NASZEJ numeracji jest zgłaszana.
    invoice('a5', { number: 'FV/5/2026' });
    await runKsefAuditSweep([TENANT], NOW, db.client, { readGlobalKill: noKill });
    expect(labels(db)).toEqual(['Brakuje numerów między FV/3/2026 a FV/5/2026']);
  });

  it('koszt z KSeF ma dokument, choć nie ma skanu — ręczny bez pliku nie ma', async () => {
    invoice('A');
    expense('Z KSeF', { source: 'ksef_inbox', ksef_invoice_id: 'inv-ksef-1' });
    expense('Ze skanem', { source: 'ocr_photo', source_file_path: 'tenants/1/scan.jpg' });
    expense('Paragon zgubiony', { source: 'manual' });
    const db = createFakeDb({ flo_kind_flags: [alpha()] });

    await runKsefAuditSweep([TENANT], NOW, db.client, { readGlobalKill: noKill });

    expect(labels(db)).toEqual(['Paragon zgubiony — koszt bez dokumentu']);
  });

  it('poświadczenia czytane partiami po 100 — adres żądania nie rośnie bez końca', async () => {
    for (let i = 1; i <= 250; i++) invoice(`n${i}`, { number: `FV/${i}/2026` });
    const db = createFakeDb({ flo_kind_flags: [alpha()] });

    const result = await runKsefAuditSweep([TENANT], NOW, db.client, { readGlobalKill: noKill });

    expect(store.upoBatches).toEqual([100, 100, 50]);
    // Wszystkie mają UPO i numerację bez luk — nie ma o czym pisać.
    expect(result).toEqual({ asked: 0, closed: 0, failed: 0 });
  });
});

describe('X-05 — w pulsie', () => {
  it('pierwszy dzień roboczy: audyt dostaje tę samą listę kont co K-01', async () => {
    invoice('A', { upo: false });
    const db = createFakeDb({ flo_kind_flags: [alpha()] });

    const result = await runFloTick(undefined, NOW, db.client, {
      listTenantIds: async () => [TENANT],
      readGlobalKill: noKill,
      paymentConfirm: {
        readOverdueInvoices: async () => [],
        readInvoiceState: async () => ({ facts: {}, context: {} }),
        readGlobalKill: noKill,
      },
      expenseMissing: { readRecentExpenses: async () => [], readGlobalKill: noKill },
      invoiceMissing: { readIssuedInvoices: async () => [], readGlobalKill: noKill },
      onboarding: { readAccount: async () => null, readGlobalKill: noKill },
    });

    expect(ruleRun(result, 'ksef.audit')).toEqual({
      kind: 'ksef.audit',
      asked: 1,
      closed: 0,
      failed: 0,
    });
    expect(result.failedTenants).toBe(0);
  });
});
