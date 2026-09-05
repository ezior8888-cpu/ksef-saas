import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { countsForPaymentScore } from '@/lib/flo/functions/import-history';
import type {
  ContractorFigure,
  MonthFigure,
  WrappedInput,
} from '@/lib/flo/wrapped';

/**
 * Dane do podsumowania roku (krok 37 toru B).
 *
 * Silnik ma czystą funkcję `buildWrapped`, ale nikt jej nie karmił — ten plik
 * zbiera z faktur dokładnie to, czego ona potrzebuje, i nic ponadto.
 *
 * DLACZEGO PO STRONIE TRASY, A NIE W `lib/flo/`: `lib/flo/*` należy do toru
 * silnika, a to jest odczyt na potrzeby jednego ekranu, z tabeli faktur, nie
 * z tabel agenta. Gdyby kiedyś doszła akcja serwerowa `getWrapped()`, ten plik
 * znika i zostaje jedno wywołanie.
 *
 * WSZYSTKIE LICZBY POWSTAJĄ TUTAJ, NA SERWERZE. Przeglądarka dostaje gotowe
 * napisy z `buildWrapped` — to ta sama zasada, co przy kartach agenta.
 */

interface InvoiceRow {
  issue_date: string;
  gross_total: number | null;
  ksef_status: string | null;
  paid_at: string | null;
  payment_due_date: string | null;
  buyer_nip: string | null;
  buyer_data: unknown;
  /** Pochodzenie dokumentu (migracja 00065); `app` = wystawiony tutaj. */
  origin: string | null;
}

/** Nazwa kontrahenta z `buyer_data` — bez rzutowania na siłę. */
function buyerName(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['name', 'nazwa', 'company_name', 'full_name']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) return value;
    }
  }
  return fallback;
}

/** Klucz kontrahenta: NIP, a przy jego braku nazwa. */
function buyerKey(row: InvoiceRow): string {
  if (row.buyer_nip && row.buyer_nip.trim().length > 0) return row.buyer_nip;
  return `nazwa:${buyerName(row.buyer_data, 'nieznany')}`;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Ile dni po terminie wpłynęła płatność. Ujemna wartość znaczy „przed
 * terminem” i tak ma zostać — `buildWrapped` robi z tego ekran
 * „najszybciej płacący”.
 *
 * `null` znaczy „nie wiem” i tak też jest dalej traktowane. Dokumenty spoza
 * aplikacji odpadają przez ten sam warunek, co przy ocenie terminowości
 * (`countsForPaymentScore`): historia z KSeF nie niesie dat zapłaty, więc
 * opóźnienie liczone z importu jest liczone z pustki.
 */
function daysToPay(row: InvoiceRow): number | null {
  if (!countsForPaymentScore(row.origin ?? 'app')) return null;
  if (!row.paid_at || !row.payment_due_date) return null;

  const paid = Date.parse(row.paid_at);
  const due = Date.parse(row.payment_due_date);
  if (Number.isNaN(paid) || Number.isNaN(due)) return null;

  return Math.round((paid - due) / DAY);
}

export async function readWrappedInput(
  supabase: SupabaseClient,
  tenantId: string,
  year: number,
): Promise<WrappedInput> {
  const from = `${year - 1}-01-01`;
  const to = `${year + 1}-01-01`;

  const [recentResult, historyResult] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'issue_date, gross_total, ksef_status, paid_at, payment_due_date, buyer_nip, buyer_data, origin',
      )
      .eq('tenant_id', tenantId)
      .eq('direction', 'issued')
      .gte('issue_date', from)
      .lt('issue_date', to),
    // Osobne, lekkie zapytanie po całą historię: „najdłuższa współpraca”
    // liczy się od pierwszej faktury w ogóle, nie od pierwszej w tym roku.
    supabase
      .from('invoices')
      .select('issue_date, buyer_nip, buyer_data')
      .eq('tenant_id', tenantId)
      .eq('direction', 'issued')
      .order('issue_date', { ascending: true })
      .limit(10_000),
  ]);

  // BŁĄD ZAPYTANIA TO NIE JEST „BRAK DANYCH”. Odmowa RLS albo nieprzeładowany
  // schemat PostgREST-a wyglądałyby tu identycznie jak konto bez faktur —
  // czyli klient z pełnym rokiem pracy zobaczyłby „nie mam z czego zrobić
  // podsumowania”, a my nie dowiedzielibyśmy się o awarii.
  const failure = recentResult.error ?? historyResult.error;
  if (failure) throw new Error(failure.message);

  const rows = (recentResult.data ?? []) as InvoiceRow[];
  const thisYear = rows.filter((row) => row.issue_date.startsWith(String(year)));

  // ── Miesiące ────────────────────────────────────────────────
  const months = new Map<string, MonthFigure>();

  for (const row of thisYear) {
    const yearMonth = row.issue_date.slice(0, 7);
    const bucket = months.get(yearMonth) ?? {
      yearMonth,
      invoiceCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      totalGross: 0,
    };

    bucket.invoiceCount += 1;
    if (row.ksef_status === 'accepted') bucket.acceptedCount += 1;
    if (row.ksef_status === 'rejected') bucket.rejectedCount += 1;
    bucket.totalGross += Number(row.gross_total ?? 0);

    months.set(yearMonth, bucket);
  }

  // ── Kontrahenci ─────────────────────────────────────────────
  const firstSeen = new Map<string, string>();
  for (const row of (historyResult.data ?? []) as InvoiceRow[]) {
    const key = buyerKey(row);
    if (!firstSeen.has(key)) firstSeen.set(key, row.issue_date.slice(0, 7));
  }

  const byBuyer = new Map<
    string,
    { name: string; gross: number; delays: number[] }
  >();

  for (const row of thisYear) {
    const key = buyerKey(row);
    const bucket = byBuyer.get(key) ?? {
      name: buyerName(row.buyer_data, key),
      gross: 0,
      delays: [],
    };

    bucket.gross += Number(row.gross_total ?? 0);
    const delay = daysToPay(row);
    if (delay !== null) bucket.delays.push(delay);

    byBuyer.set(key, bucket);
  }

  const contractors: ContractorFigure[] = [...byBuyer.entries()].map(
    ([key, bucket]) => ({
      id: key,
      name: bucket.name,
      gross: bucket.gross,
      // `null`, a NIE zero: brak potwierdzonej wpłaty to brak wiedzy
      // o terminowości, nie płatność w terminie.
      avgDaysToPay:
        bucket.delays.length === 0
          ? null
          : Math.round(
              bucket.delays.reduce((sum, d) => sum + d, 0) /
                bucket.delays.length,
            ),
      firstInvoiceMonth: firstSeen.get(key) ?? `${year}-01`,
    }),
  );

  // ── Rok poprzedni ───────────────────────────────────────────
  const previousRows = rows.filter((row) =>
    row.issue_date.startsWith(String(year - 1)),
  );
  const previousYearGross =
    previousRows.length === 0
      ? null
      : previousRows.reduce((sum, row) => sum + Number(row.gross_total ?? 0), 0);

  return {
    year,
    months: [...months.values()].sort((a, b) =>
      a.yearMonth.localeCompare(b.yearMonth),
    ),
    contractors,
    previousYearGross,
  };
}
