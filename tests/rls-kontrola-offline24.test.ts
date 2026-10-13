import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createScriptHarness, labelRows, type ScriptHarness } from './helpers/kontrola-skrypt';
import { getRlsTestDatabaseUrl } from './helpers/rls-environment';

/**
 * `scripts/ops/kontrola-faktur-ksef.sh`, sekcja 4a (zaległości Offline24),
 * na prawdziwej bazie z pełnym łańcuchem migracji.
 *
 * Cały skrypt idzie przez atrapę `ssh` (`bash -c`, jak sshd), a atrapa
 * `docker` przekazuje polecenie `psql` skryptu do lokalnej bazy testowej.
 * Wyrocznia jest niezależna od SQL skryptu: surowe wiersze faktur i kolejki
 * klasyfikuje i grupuje kod testu według reguł crona
 * (`lib/jobs/runners/process-offline-queue.ts`) — kwarantanna i wygaśnięcie
 * przy przejętej fakturze zamykają wpis, a faktura zostaje `offline_queued`
 * bez wyjścia; cron bierze tylko wpisy `queued` ze środowiskiem.
 *
 * Wymaga `RLS_TEST_DATABASE_URL` i programu `psql`. Dane: własna firma
 * i prefiks `c2400000-`; sprzątanie zdejmuje klucz offline przed DELETE
 * (00132 blokuje usuwanie faktur ze śladem wysyłki dla każdej roli).
 */

const hasDatabase = Boolean(process.env.RLS_TEST_DATABASE_URL?.trim());
if (hasDatabase && process.env.RLS_TEST_ALLOW_DESTRUCTIVE !== 'isolated-local-database') {
  throw new Error('RLS_TEST_ALLOW_DESTRUCTIVE wymaga potwierdzenia isolated-local-database: test tworzy i usuwa dane.');
}

function pgEnv(url: string): Record<string, string> {
  const u = new URL(url);
  return {
    PGHOST: u.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username || 'postgres'),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, '') || 'postgres',
    PGCONNECT_TIMEOUT: '10',
  };
}
const pg = hasDatabase ? pgEnv(getRlsTestDatabaseUrl()) : {};

const FAKE_DOCKER = `#!/usr/bin/env bash
# Atrapa docker: \`exec <kontener> psql …\` → psql do lokalnej bazy testowej
# (PG* z testu); -U/-d skryptu pominięte. Reszta: nic (brak kontenerów).
[ "$1" = exec ] && [ "$3" = psql ] || exit 0
shift 3
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    -U|-d) shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
exec psql "\${args[@]}"
`;

/** Zapytanie testu (nie skryptu): wiersze rozdzielone \x01, pola tabulatorem; NULL = ''. */
function query(sql: string): string[][] {
  const r = spawnSync('psql', ['-X', '-q', '-At', '-F', '\t', '-R', '\x01', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, ...pg },
  });
  if (r.error) throw new Error(`psql niedostępny: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  const out = r.stdout.replace(/\n$/, '');
  return out ? out.split('\x01').map((row) => row.split('\t')) : [];
}

const T = 'c2400000-0000-4000-8000-000000000001';
const inv = (s: string) => `c2400000-0000-4000-8000-0000000000${s}`;
const [A1, A2, A3, A4, A5, A6, A7, A8, B1, B2, C1, C2, N1] =
  ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'b1', 'b2', 'c1', 'c2', 'd1'].map(inv);

const invoiceRow = (id: string, nr: string, status: string, extra: { code?: string; key?: string; submitted?: string; qr?: string } = {}) =>
  `('${id}','${T}','outgoing','FV/OFF/${nr}','VAT','regular',current_date,'1234567890','1234567890',123,100,23,'${status}',` +
  `${extra.code ? `'${extra.code}'` : 'NULL'},${extra.key ? `'${extra.key}'` : 'NULL'},${extra.submitted ?? 'NULL'},${extra.qr ? `'${extra.qr}'` : 'NULL'},'{}','{}','{}')`;

const queueRow = (id: string, key: string, status: string, env: string | null, o: { deadline: string; next?: string; created: string; error?: string }) =>
  `('${T}','${id}','${key}','${status}',${o.deadline},${env ? `'${env}'` : 'NULL'},${o.next ?? 'now()'},${o.created},` +
  `${o.error ? `'${o.error}'` : 'NULL'})`;

const QUARANTINE = 'OFFLINE_REPLAY_PAUSED_REQUIRES_RECONCILIATION';

const SEED = `
INSERT INTO tenants (id, name, nip) VALUES ('${T}', 'Kontrola sekcja 4a', '1234567890');
INSERT INTO invoices (id, tenant_id, direction, internal_number, invoice_type, invoice_kind, issue_date, seller_nip, buyer_nip, gross_total, net_total, vat_total, ksef_status, last_error_code, offline_idempotency_key, submitted_to_ksef_at, offline_qr_offline, fa3_data, seller_data, buyer_data) VALUES
 ${invoiceRow(A1, 'A1', 'offline_queued', { code: 'OFFLINE_REPLAY_PAUSED', key: 'kontrola-off-a1' })},
 ${invoiceRow(A2, 'A2', 'offline_queued', { key: 'kontrola-off-a2', submitted: "now() - interval '1 day'" })},
 ${invoiceRow(A3, 'A3', 'offline_queued', { key: 'kontrola-off-a3', submitted: "now() - interval '2 days'", qr: 'qr-a3' })},
 ${invoiceRow(A4, 'A4', 'offline_queued', { key: 'kontrola-off-a4' })},
 ${invoiceRow(A5, 'A5', 'offline_queued', { key: 'kontrola-off-a5' })},
 ${invoiceRow(A6, 'A6', 'offline_queued', { key: 'kontrola-off-a6' })},
 ${invoiceRow(A7, 'A7', 'offline_queued', { key: 'kontrola-off-a7' })},
 ${invoiceRow(A8, 'A8', 'offline_queued', { key: 'kontrola-off-a8' })},
 ${invoiceRow(B1, 'B1', 'failed', { code: 'OFFLINE_DEADLINE_EXCEEDED', key: 'kontrola-off-b1' })},
 ${invoiceRow(B2, 'B2', 'rejected', { code: 'OFFLINE_SPECIAL_DOCUMENT', key: 'kontrola-off-b2', submitted: "now() - interval '3 days'" })},
 ${invoiceRow(C1, 'C1', 'draft', { key: 'kontrola-off-c1' })},
 ${invoiceRow(C2, 'C2', 'failed', { code: 'TRANSIENT_EXHAUSTED', key: 'kontrola-off-c2' })},
 ${invoiceRow(N1, 'N1', 'failed', { code: 'INFRA' })};
INSERT INTO ksef_offline_queue (tenant_id, invoice_id, idempotency_key, status, deadline, ksef_environment, next_attempt_at, created_at, last_error) VALUES
 ${queueRow(A1, 'kontrola-off-a1', 'failed', 'test', { deadline: "now() + interval '10 hours'", created: "now() - interval '2 days'", error: QUARANTINE })},
 ${queueRow(A2, 'kontrola-off-a2', 'failed', 'test', { deadline: "now() + interval '12 hours'", created: "now() - interval '2 days'", error: QUARANTINE })},
 ${queueRow(A3, 'kontrola-off-a3', 'expired', 'test', { deadline: "now() - interval '1 hour'", created: "now() - interval '3 days'", error: 'OFFLINE_DEADLINE_EXCEEDED' })},
 ${queueRow(A5, 'kontrola-off-a5', 'queued', null, { deadline: "now() + interval '5 hours'", next: "now() - interval '3 days'", created: "now() - interval '4 days'" })},
 ${queueRow(A6, 'kontrola-off-a6', 'sending', 'test', { deadline: "now() - interval '2 hours'", created: "now() - interval '5 days'" })},
 ${queueRow(A7, 'kontrola-off-a7', 'queued', 'test', { deadline: "now() + interval '20 hours'", next: "now() - interval '10 minutes'", created: "now() - interval '1 hour'" })},
 ${queueRow(A8, 'kontrola-off-a8-stary', 'failed', 'test', { deadline: "now() + interval '1 hour'", created: "now() - interval '6 days'", error: QUARANTINE })},
 ${queueRow(A8, 'kontrola-off-a8', 'queued', 'test', { deadline: "now() + interval '15 hours'", next: "now() - interval '1 hour'", created: "now() - interval '1 day'" })},
 ${queueRow(B1, 'kontrola-off-b1', 'expired', 'test', { deadline: "now() - interval '3 hours'", created: "now() - interval '4 days'", error: 'OFFLINE_DEADLINE_EXCEEDED' })},
 ${queueRow(B2, 'kontrola-off-b2', 'failed', 'test', { deadline: "now() - interval '1 day'", created: "now() - interval '5 days'", error: 'Offline24 callback failed' })},
 ${queueRow(C1, 'kontrola-off-c1', 'failed', 'test', { deadline: "now() - interval '1 day'", created: "now() - interval '6 days'", error: QUARANTINE })};
-- Dowód kontaktu (00136): wpis sent w ksef_submissions — faktura mogła dotrzeć do KSeF.
INSERT INTO ksef_submissions (invoice_id, tenant_id, submission_type, status, session_reference_number, attempted_at)
VALUES ('${A1}', '${T}', 'online', 'sent', 'KONTROLA-OFF-A1', now() - interval '3 days');
`;

function cleanup(): void {
  query(`DELETE FROM ksef_offline_queue WHERE tenant_id = '${T}'`);
  query(`DELETE FROM ksef_submissions WHERE tenant_id = '${T}'`);
  // 00132 blokuje DELETE faktur ze śladem wysyłki (także klucz offline) dla każdej roli — najpierw szkic.
  query(`UPDATE invoices SET ksef_status = 'draft', offline_idempotency_key = NULL, submitted_to_ksef_at = NULL, ksef_send_owner = NULL WHERE tenant_id = '${T}' AND ksef_status <> 'accepted'`);
  query(`DELETE FROM invoices WHERE tenant_id = '${T}'`);
  query(`DELETE FROM tenants WHERE id = '${T}'`);
}

// ── Wyrocznia: surowe wiersze + reguły crona w kodzie testu ─────────────────

interface Entry {
  id: string; invoiceId: string; tenantId: string; status: string; env: string | null;
  created: number; updatedText: string; updated: number; createdDate: string;
  deadlineText: string; deadline: number; pastDeadline: boolean; staleNext: boolean; error: string | null;
}
interface Invoice {
  id: string; tenantId: string; number: string; issueDate: string; status: string; code: string | null;
  submitted: boolean; evidence: boolean; qr: boolean; key: boolean; ksefNumber: boolean; kind: string;
  updatedText: string; updated: number;
}

/** Wartość logiczna z zapytania testu: `::text` daje true/false, psql bez rzutowania t/f. */
const tf = (v: string) => v === 't' || v === 'true';
const orNull = (v: string) => (v === '' ? null : v);

function entries(): Entry[] {
  return query(
    `SELECT id, invoice_id, tenant_id, status::text, coalesce(ksef_environment, ''), extract(epoch FROM created_at), updated_at::text,
            extract(epoch FROM updated_at), created_at::date::text, deadline::text, extract(epoch FROM deadline),
            (deadline < now())::text, (next_attempt_at < now() - interval '15 minutes')::text, coalesce(last_error, '')
       FROM ksef_offline_queue`,
  ).map(([id, invoiceId, tenantId, status, env, created, updatedText, updated, createdDate, deadlineText, deadline, past, stale, error]) => ({
    id, invoiceId, tenantId, status, env: orNull(env), created: Number(created), updatedText, updated: Number(updated),
    createdDate, deadlineText, deadline: Number(deadline), pastDeadline: tf(past), staleNext: tf(stale), error: orNull(error),
  }));
}

function invoices(): Invoice[] {
  return query(
    `SELECT id, tenant_id, internal_number, issue_date::text, ksef_status, coalesce(last_error_code, ''),
            (submitted_to_ksef_at IS NOT NULL)::text, ksef_has_contact_evidence(id, tenant_id)::text,
            (offline_qr_offline IS NOT NULL)::text, (offline_idempotency_key IS NOT NULL)::text,
            (ksef_number IS NOT NULL)::text, invoice_kind, updated_at::text, extract(epoch FROM updated_at)
       FROM invoices WHERE direction = 'outgoing'`,
  ).map(([id, tenantId, number, issueDate, status, code, submitted, evidence, qr, key, ksefNumber, kind, updatedText, updated]) => ({
    id, tenantId, number, issueDate, status, code: orNull(code), submitted: tf(submitted), evidence: tf(evidence),
    qr: tf(qr), key: tf(key), ksefNumber: tf(ksefNumber), kind, updatedText, updated: Number(updated),
  }));
}

/** Najnowszy wpis kolejki faktury (kilka wpisów na fakturę jest możliwe — brak UNIQUE na invoice_id). */
function latestEntry(all: Entry[], invoice: Invoice): Entry | null {
  const own = all.filter((e) => e.invoiceId === invoice.id && e.tenantId === invoice.tenantId);
  own.sort((a, b) => b.created - a.created || (a.id < b.id ? -1 : 1));
  return own[0] ?? null;
}

/** (c) Werdykt: cron bierze tylko wpis `queued` ze środowiskiem; zamknięty wpis nie wraca nigdy. */
function verdict(e: Entry | null): string {
  if (!e || ['failed', 'expired', 'sent'].includes(e.status)) return 'BEZ WYJSCIA: wpis zamkniety albo brak wpisu (luka 5)';
  if (e.status === 'sending' || e.env === null) return 'BEZ WYJSCIA: otwarty wpis, ktorego cron nie wezmie';
  return 'czeka na cron, jesli srodowisko wpisu = KSEF_ENV (sekcja 9)';
}

/** (b) Powód, dla którego otwarty wpis stoi. */
function reason(e: Entry): string {
  if (e.status === 'sending') return 'sending: odtworzenie wylaczone od 02.10, nic go nie zamknie';
  if (e.env === null) return 'srodowisko NULL sprzed 00117: cron pomija na zawsze';
  if (e.staleNext) return 'queued ponad 15 min: srodowisko inne niz KSEF_ENV (sekcja 9) albo cron nie dziala (sekcja 7, h)';
  return 'queued: cron zamknie przy najblizszym przebiegu (po terminie faktura failed z wyjsciem, w terminie kwarantanna bez wyjscia)';
}

const b = (v: boolean) => (v ? 't' : 'f');
const isOfflineCode = (code: string | null) => (code ?? '').slice(0, 8) === 'OFFLINE_';

/** Zliczenie po kluczu (wiersz bez ostatniej kolumny) — kolejność nieistotna. */
function grouped<T>(items: T[], key: (item: T) => string, tail?: (group: T[]) => string): string[] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups].map(([k, g]) => `${k} | ${g.length}${tail ? ` | ${tail(g)}` : ''}`).sort();
}

let harness: ScriptHarness;
let section = '';

describe.skipIf(!hasDatabase)('kontrola-faktur-ksef.sh, sekcja 4a na bazie — zaległości Offline24', () => {
  beforeAll(() => {
    cleanup();
    query(SEED);
    harness = createScriptHarness(FAKE_DOCKER);
    const result = harness.run(pg);
    expect(result.status, result.stderr).toBe(0);
    const start = result.stdout.indexOf('\n=== 4a.');
    const next = result.stdout.indexOf('\n=== ', start + 1);
    section = start === -1 ? '' : result.stdout.slice(start, next === -1 ? undefined : next);
    expect(section, 'brak sekcji 4a').not.toBe('');
  }, 120_000);

  afterAll(() => {
    harness?.cleanup();
    if (hasDatabase) cleanup();
  });

  it('każde zapytanie sekcji działa na schemacie po wszystkich migracjach', () => {
    expect(section).not.toContain('zapytanie nieudane');
  });

  it('(c) faktury offline_queued wg werdyktu: wszystkie zamknięte wpisy i brak wpisu = BEZ WYJŚCIA, najnowszy wpis decyduje', () => {
    const all = entries();
    const queued = invoices().filter((i) => i.status === 'offline_queued');
    const expected = grouped(queued, (i) => {
      const e = latestEntry(all, i);
      const termin = !e ? '-' : e.pastDeadline ? 'po terminie' : 'w terminie';
      return [e?.status ?? '(brak wpisu)', e?.env ?? '(null)', i.code ?? '(brak kodu)', verdict(e), termin, b(i.submitted), b(i.evidence), b(i.qr)].join(' | ');
    });
    expect(labelRows(section, '(c) faktury offline_queued').sort()).toEqual(expected);

    // Kotwice na własnych danych: 6 z 8 faktur bez wyjścia (A1–A6), A7 i A8 (nowszy wpis queued) czekają na cron.
    const mine = queued.filter((i) => i.tenantId === T);
    const verdicts = mine.map((i) => verdict(latestEntry(all, i)));
    expect(verdicts.filter((v) => v.startsWith('BEZ WYJSCIA'))).toHaveLength(6);
    expect(verdict(latestEntry(all, mine.find((i) => i.id === A8)!))).toMatch(/^czeka na cron/);
    // Kwarantanna przejętej faktury nie ma kodu na fakturze (drugi zapis wymaga submitted_to_ksef_at IS NULL).
    expect(labelRows(section, '(c) faktury offline_queued')).toContainEqual(
      expect.stringMatching(/^failed \| test \| \(brak kodu\) \| BEZ WYJSCIA: wpis zamkniety albo brak wpisu \(luka 5\) \| w terminie \| t \| f \| f \| \d+$/),
    );
    // Dowód kontaktu (wpis sent w ksef_submissions) przy fakturze po kwarantannie z kodem.
    expect(labelRows(section, '(c) faktury offline_queued')).toContainEqual(
      expect.stringMatching(/^failed \| test \| OFFLINE_REPLAY_PAUSED \| BEZ WYJSCIA: wpis zamkniety albo brak wpisu \(luka 5\) \| w terminie \| f \| t \| f \| \d+$/),
    );
    expect(labelRows(section, '(c) faktury offline_queued')).toContainEqual(
      expect.stringMatching(/^\(brak wpisu\) \| \(null\) \| \(brak kodu\) \| BEZ WYJSCIA: wpis zamkniety albo brak wpisu \(luka 5\) \| - \| f \| f \| f \| \d+$/),
    );
  });

  it('(d) lista do uzgodnienia: każda faktura offline_queued firmy z najnowszym wpisem, najpierw bez wpisu, potem wg terminu', () => {
    const all = entries();
    const mine = invoices().filter((i) => i.status === 'offline_queued' && i.tenantId === T);
    const order = mine
      .map((i) => ({ i, e: latestEntry(all, i) }))
      .sort((x, y) => {
        if (!x.e !== !y.e) return x.e ? 1 : -1;
        return (x.e?.deadline ?? 0) - (y.e?.deadline ?? 0) || x.i.updated - y.i.updated || (x.i.id < y.i.id ? -1 : 1);
      });
    const expected = order.map(({ i, e }) =>
      [T, i.id, i.number, i.issueDate, i.code ?? '-', e?.status ?? '(brak wpisu)', e?.env ?? '(null)', e?.deadlineText ?? '', i.updatedText].join(' | '));
    const rows = labelRows(section, '(d) faktury offline_queued do uzgodnienia z KSeF').filter((r) => r.startsWith(T));
    expect(rows).toEqual(expected);
    expect(rows[0]).toContain(`| ${A4} |`);
    expect(rows.find((r) => r.includes(A8))).toContain('| queued | test |');
  });

  it('(b) otwarte wpisy: powód z reguł crona, stan faktury, po terminie', () => {
    const all = entries();
    const byId = new Map(invoices().map((i) => [`${i.id}/${i.tenantId}`, i]));
    const open = all.filter((e) => e.status === 'queued' || e.status === 'sending');
    const expected = grouped(
      open,
      (e) => [e.status, e.env ?? '(null)', reason(e), byId.get(`${e.invoiceId}/${e.tenantId}`)?.status ?? '(brak faktury)', b(e.pastDeadline)].join(' | '),
      (g) => g.reduce((m, e) => (e.deadline < m.deadline ? e : m)).deadlineText,
    );
    expect(labelRows(section, '(b) otwarte wpisy kolejki').sort()).toEqual(expected);
    expect(open.filter((e) => e.tenantId === T).map((e) => reason(e)).sort()).toEqual([
      'queued ponad 15 min: srodowisko inne niz KSEF_ENV (sekcja 9) albo cron nie dziala (sekcja 7, h)',
      'queued: cron zamknie przy najblizszym przebiegu (po terminie faktura failed z wyjsciem, w terminie kwarantanna bez wyjscia)',
      'sending: odtworzenie wylaczone od 02.10, nic go nie zamknie',
      'srodowisko NULL sprzed 00117: cron pomija na zawsze',
    ]);
  });

  it('(e) failed/rejected z kodem OFFLINE_*: kod spoza katalogu (I4), najnowszy wpis, przejęcie', () => {
    const all = entries();
    const failed = invoices().filter((i) => ['failed', 'rejected'].includes(i.status) && isOfflineCode(i.code));
    const catalog = new Set(query('SELECT code FROM ksef_error_codes').map(([c]) => c));
    const expected = grouped(failed, (i) =>
      [i.code, i.status, i.kind, latestEntry(all, i)?.status ?? '(brak wpisu)', b(i.submitted), b(i.evidence), b(catalog.has(i.code!))].join(' | '));
    expect(labelRows(section, '(e) failed/rejected z kodem OFFLINE_').sort()).toEqual(expected);
    expect(expected.join('\n')).toMatch(/^OFFLINE_DEADLINE_EXCEEDED \| failed \| regular \| expired \| f \| f \| f \| \d+$/m);
    expect(expected.join('\n')).toMatch(/^OFFLINE_SPECIAL_DOCUMENT \| rejected \| regular \| failed \| t \| f \| f \| \d+$/m);
  });

  it('(f) inny ślad Offline24 bez numeru KSeF: zamrożony szkic i failed z kluczem, bez faktur z (c) i (e)', () => {
    const all = entries();
    const trace = invoices().filter((i) =>
      !i.ksefNumber && i.status !== 'offline_queued' && !(['failed', 'rejected'].includes(i.status) && isOfflineCode(i.code))
      && (i.key || latestEntry(all, i) !== null));
    const expected = grouped(trace, (i) =>
      [i.status, i.code ?? '(brak kodu)', latestEntry(all, i)?.status ?? '(brak wpisu)', b(i.key)].join(' | '));
    expect(labelRows(section, '(f) inny ślad Offline24').sort()).toEqual(expected);
    const mine = trace.filter((i) => i.tenantId === T).map((i) => i.id).sort();
    expect(mine).toEqual([C1, C2].sort());
  });

  it('(g) wpisy zamknięte: powód (60 znaków) i stan faktury; (a) kolejka wg stanu i środowiska', () => {
    const all = entries();
    const byId = new Map(invoices().map((i) => [`${i.id}/${i.tenantId}`, i]));
    const closed = all.filter((e) => e.status === 'failed' || e.status === 'expired');
    const latestUpdate = (g: Entry[]) => g.reduce((m, e) => (e.updated > m.updated ? e : m)).updatedText;
    expect(labelRows(section, '(g) wpisy kolejki zamknięte').sort()).toEqual(grouped(
      closed,
      (e) => [e.status, (e.error ?? '(brak)').slice(0, 60), byId.get(`${e.invoiceId}/${e.tenantId}`)?.status ?? '(brak faktury)'].join(' | '),
      latestUpdate,
    ));
    expect(labelRows(section, '(g) wpisy kolejki zamknięte')).toContainEqual(
      expect.stringMatching(new RegExp(`^failed \\| ${QUARANTINE} \\| offline_queued \\| \\d+ \\| `)),
    );

    const minCreated = (g: Entry[]) => g.reduce((m, e) => (e.created < m.created ? e : m)).createdDate;
    const maxCreated = (g: Entry[]) => g.reduce((m, e) => (e.created > m.created ? e : m)).createdDate;
    expect(labelRows(section, '(a) kolejka ksef_offline_queue wg stanu').sort()).toEqual(grouped(
      all,
      (e) => [e.status, e.env ?? '(null)'].join(' | '),
      (g) => [minCreated(g), maxCreated(g), latestUpdate(g)].join(' | '),
    ));
  });

  it('faktura bez śladu Offline24 nie trafia do żadnego zapytania sekcji', () => {
    expect(section).not.toContain(N1);
    expect(section).not.toContain('FV/OFF/N1');
  });
});
