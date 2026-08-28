/**
 * K-03 — ocena terminowości płatności kontrahenta (krok 25 planu).
 *
 * ⚠️ FUNKCJA WYŁĄCZONA. `lib/flo/flags.ts` blokuje rodzaj `payment.score`,
 * dopóki prawnik nie odpowie na pytanie 3 z bramki prawnej: gdy kontrahentem
 * jest jednoosobowa działalność, oceniamy zachowanie OSOBY FIZYCZNEJ, a to
 * obszar, który akt o sztucznej inteligencji traktuje surowo.
 *
 * Kod jest gotowy i przetestowany, więc włączenie to jedna linijka — ale ta
 * linijka ma przejść przez czyjąś świadomą decyzję, nie przez przypadek.
 *
 * TRZY AWARIE, KTÓRE PROJEKT ZAMYKA:
 *
 * 1. OCENA KRZYWDZĄCA. Jedna faktura zapłacona po terminie, bo klient wysłał
 *    ją dwa tygodnie za późno. Dlatego MEDIANA, nie średnia — jeden wybryk
 *    nie przesuwa wyniku — i minimum trzy opłacone faktury.
 *
 * 2. OCENA ZOBACZONA PRZEZ KONTRAHENTA. Klient pokazuje ekran na spotkaniu
 *    albo wysyła zrzut. Dlatego wynik nie trafia NIGDY do dokumentu, maila
 *    ani listy kontrahentów — wyłącznie do karty propozycji, w chwili gdy
 *    ma znaczenie dla decyzji.
 *
 * 3. OCENA Z DANYCH, KTÓRYCH NIE MAMY. Historia zaciągnięta z KSeF nie zawiera
 *    dat zapłaty, bo KSeF o płatnościach nie wie. Liczby wyglądałyby
 *    wiarygodnie i byłyby zmyślone — najgorszy rodzaj błędu, bo niewykrywalny
 *    gołym okiem. Dlatego dokumenty z importu są odfiltrowane NA POZIOMIE
 *    ZAPYTANIA, a nie dopiero przy liczeniu.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatDays } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { createAdminClient } from '@/lib/supabase/admin';

/** Mniej niż tyle opłaconych faktur i nie mówimy nic. */
export const MIN_PAID_INVOICES = 3;

/** Okno obserwacji. Sprzed roku to już nie jest opis dzisiejszego zachowania. */
const WINDOW_MONTHS = 12;

/** Poniżej tylu dni opóźnienia w medianie nie ma o czym mówić. */
const NOTABLE_DELAY_DAYS = 3;

export interface PaidInvoiceRecord {
  /** Termin płatności (YYYY-MM-DD). */
  dueDate: string;
  /** Data zaksięgowania wpłaty (ISO). */
  paidAt: string;
  /** Czy dokument pochodzi z importu historii — wtedy NIE liczy się. */
  fromImport: boolean;
}

export interface PaymentScore {
  /** Liczba faktur, na których oparta jest ocena. */
  sample: number;
  /** Mediana opóźnienia w dniach. Ujemna = płaci przed terminem. */
  medianDelayDays: number;
  /** Czy w ogóle warto o tym wspominać. */
  notable: boolean;
  /** Zdanie opisowe — bez etykiet wartościujących. */
  description: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/**
 * Ocena z historii — funkcja czysta.
 *
 * Zwraca OPIS, nigdy etykietę. „Płaci średnio 14 dni po terminie" to fakt,
 * z którym klient może zrobić, co chce. „Ryzykowny kontrahent" to wyrok
 * wydany przez program na firmę, która nigdy nie zgodziła się na ocenianie.
 */
export function scorePaymentBehaviour(
  records: readonly PaidInvoiceRecord[],
): PaymentScore | null {
  // Import odfiltrowany także tutaj, na wypadek gdyby ktoś kiedyś podał
  // dane z innego źródła niż zapytanie z `readPaymentHistory`.
  const usable = records.filter((r) => !r.fromImport);

  if (usable.length < MIN_PAID_INVOICES) return null;

  const delays = usable.map((record) => {
    const due = Date.parse(`${record.dueDate}T00:00:00Z`);
    const paid = Date.parse(record.paidAt);
    if (Number.isNaN(due) || Number.isNaN(paid)) return 0;
    return Math.round((paid - due) / 86_400_000);
  });

  const medianDelay = median(delays);
  const notable = medianDelay >= NOTABLE_DELAY_DAYS;

  return {
    sample: usable.length,
    medianDelayDays: medianDelay,
    notable,
    description: describeDelay(medianDelay),
  };
}

function describeDelay(days: number): string {
  if (days <= -1) return `płaci zwykle ${formatDays(Math.abs(days))} przed terminem`;
  if (days === 0) return 'płaci zwykle w terminie';
  return `płaci zwykle ${formatDays(days)} po terminie`;
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

export function buildPaymentScoreProposal(input: {
  tenantId: string;
  contractorId: string;
  contractorName: string;
  score: PaymentScore;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  if (!input.score.notable) return null;

  return {
    tenantId: input.tenantId,
    kind: 'payment.score',
    topicKey: `payment.score:${input.contractorId}`,
    title: `${input.contractorName} — ${input.score.description}`,
    body: `Liczone z ${input.score.sample} opłaconych faktur z ostatniego roku. Możesz dać krótszy termin albo poprosić o zaliczkę — decyzja Twoja.`,
    fingerprint: fingerprintOf({
      contractor: input.contractorId,
      median: input.score.medianDelayDays,
      sample: input.score.sample,
    }),
    expiresAt: new Date(now.getTime() + 90 * 86_400_000),
    priority: 80,
    payload: {
      contractorId: input.contractorId,
      // Ocena zostaje TUTAJ. Nie kopiujemy jej do dokumentów ani do treści
      // maili — pilnuje tego osobny test przeszukujący źródła.
      medianDelayDays: input.score.medianDelayDays,
      sample: input.score.sample,
      primaryIntent: 'open',
      primaryLabel: 'Pokaż historię',
    },
    evidence: [
      { label: 'Historia płatności', href: `/contractors/${input.contractorId}` },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Odczyt historii
// ═══════════════════════════════════════════════════════════════

interface ScoreClient {
  from: (table: 'invoices') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          neq: (
            column: string,
            value: string,
          ) => {
            gte: (
              column: string,
              value: string,
            ) => Promise<{
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
}

/**
 * Historia płatności kontrahenta.
 *
 * `neq('source', 'import')` jest tu SEDNEM, nie szczegółem: KSeF nie zna dat
 * zapłaty, więc dokumenty z importu dałyby opóźnienia liczone z pustki.
 */
export async function readPaymentHistory(
  tenantId: string,
  contractorNip: string,
  now: Date = new Date(),
  client: ScoreClient = createAdminClient() as unknown as ScoreClient,
): Promise<PaidInvoiceRecord[]> {
  const since = new Date(now);
  since.setMonth(since.getMonth() - WINDOW_MONTHS);

  const { data, error } = await client
    .from('invoices')
    .select('payment_due_date, paid_at, source')
    .eq('tenant_id', tenantId)
    .eq('buyer_nip', contractorNip)
    .neq('source', 'import')
    .gte('payment_due_date', since.toISOString().slice(0, 10));

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => typeof row.paid_at === 'string' && row.paid_at.length > 0)
    .map((row) => ({
      dueDate: String(row.payment_due_date ?? ''),
      paidAt: String(row.paid_at),
      fromImport: row.source === 'import',
    }))
    .filter((record) => record.dueDate.length > 0);
}
