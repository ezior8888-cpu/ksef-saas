/**
 * S-04 — progi pieniężne (krok 51 planu).
 *
 * Cztery momenty w życiu firmy, o których warto powiedzieć: pierwsza opłacona
 * faktura, 10 000 zł, 50 000 zł i 100 000 zł przychodu narastająco.
 *
 * WYŁĄCZNIE KWOTY. Bez odznak, bez poziomów, bez licznika faktur i bez
 * „gratulacje, wystawiłeś setną fakturę”. Setna faktura nie jest osiągnięciem
 * — jest miarą tego, ile razy klient użył programu, czyli pochwałą dla nas,
 * nie dla niego. Pieniądze na koncie są jego.
 *
 * TRZY BEZPIECZNIKI, KTÓRE DECYDUJĄ O TYM, CZY TA FUNKCJA JEST MIŁA,
 * CZY ŻENUJĄCA:
 *
 * 1. WYŁĄCZNIE PRZYCHÓD WYPRACOWANY PO REJESTRACJI KONTA. Import historii
 *    nie odblokowuje progów wstecz. Powinszowanie komuś „pierwszych 10 000 zł”
 *    w dniu, w którym zaimportował trzy lata faktur, jest dowodem, że program
 *    nie rozumie, z kim rozmawia. Osobno: konto, które w pierwszym miesiącu
 *    przekracza NAJWYŻSZY próg, nie dostaje żadnego — to nie jest ktoś, kto
 *    właśnie zaczyna, tylko firma, która się do nas przeprowadziła.
 *
 * 2. FAKTURY OPŁACONE I NIESKORYGOWANE, Z OPÓŹNIENIEM SIEDMIU DNI OD WPŁATY.
 *    Wpłata bywa cofana, a faktura korygowana. Próg przyznany i po tygodniu
 *    nieprawdziwy jest gorszy niż brak progu — a odebrać go nie wolno.
 *
 * 3. PRÓG RAZ OSIĄGNIĘTY NIE JEST ODBIERANY ANI PRZYZNAWANY PONOWNIE.
 *
 * I zasada tonu: NIGDY POWIADOMIENIE. Najniższy priorytet w wątku, a gdy
 * tego dnia jest otwarta sprawa pilna — próg czeka. Dobra wiadomość, która
 * przepycha się przed niezapłaconą fakturę, przestaje być dobrą wiadomością.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import { formatPln } from '@/lib/flo/money';
import type { CreateProposalInput } from '@/lib/flo/proposals';
import { roundToCents } from '@/lib/xml/invoice-calculator';

const DAY_MS = 86_400_000;

/** Ile dni po wpłacie próg staje się prawdziwy. */
export const SETTLE_DELAY_DAYS = 7;

/** Do kiedy konto uchodzi za „dopiero założone”. */
export const FIRST_MONTH_DAYS = 30;

export type MilestoneKey = 'first_paid' | 'pln_10k' | 'pln_50k' | 'pln_100k';

export interface Milestone {
  key: MilestoneKey;
  /** Próg przychodu narastająco; 0 = pierwsza opłacona faktura. */
  threshold: number;
  title: string;
  body: string;
}

export const MILESTONES: readonly Milestone[] = [
  {
    key: 'first_paid',
    threshold: 0,
    title: 'Pierwsza faktura opłacona',
    body: 'Pieniądze są na koncie. To jest ten moment, od którego firma zaczyna działać naprawdę.',
  },
  {
    key: 'pln_10k',
    threshold: 10_000,
    title: 'Pierwsze 10 000 zł',
    body: 'Tyle zarobiłeś od założenia konta — z faktur, które zostały opłacone.',
  },
  {
    key: 'pln_50k',
    threshold: 50_000,
    title: '50 000 zł na koncie',
    body: 'Tyle wpłynęło od Twoich klientów, odkąd jesteśmy razem.',
  },
  {
    key: 'pln_100k',
    threshold: 100_000,
    title: '100 000 zł',
    body: 'Sześć cyfr. Tyle zapłacili Ci klienci od założenia konta.',
  },
];

const HIGHEST_THRESHOLD = MILESTONES[MILESTONES.length - 1]!.threshold;

// ═══════════════════════════════════════════════════════════════
// Wejście
// ═══════════════════════════════════════════════════════════════

export interface PaidInvoice {
  id: string;
  gross: number;
  /** Kiedy wpłata została potwierdzona; ISO. */
  paidAt: string;
  /** Czy faktura została skorygowana. */
  corrected: boolean;
  /** Pochodzenie z `invoices.origin` — do progów liczy się wyłącznie „app”. */
  origin: string;
}

export interface MilestoneInput {
  /** Data założenia konta; ISO. */
  registeredAt: string;
  invoices: readonly PaidInvoice[];
  /** Progi już przyznane — nigdy nie przyznajemy ich drugi raz. */
  awarded: readonly MilestoneKey[];
  /** Czy w wątku jest teraz otwarta sprawa pilna. */
  hasUrgentOpen: boolean;
  today: Date;
}

// ═══════════════════════════════════════════════════════════════
// Liczenie
// ═══════════════════════════════════════════════════════════════

/**
 * Faktury, które w ogóle liczą się do progów — funkcja czysta.
 *
 * Cztery warunki naraz i każdy z innego powodu: skorygowana faktura nie jest
 * przychodem, dokument z importu nie jest zasługą tego konta, wpłata sprzed
 * mniej niż tygodnia bywa cofana, a faktura opłacona przed rejestracją
 * została wystawiona gdzie indziej.
 */
export function eligibleInvoices(input: MilestoneInput): PaidInvoice[] {
  const cutoff = input.today.getTime() - SETTLE_DELAY_DAYS * DAY_MS;
  const registered = Date.parse(`${input.registeredAt}T00:00:00.000Z`);

  return input.invoices.filter((invoice) => {
    if (invoice.corrected) return false;
    if (invoice.origin !== 'app') return false;

    const paid = Date.parse(invoice.paidAt);
    if (Number.isNaN(paid)) return false;
    if (paid > cutoff) return false;
    if (!Number.isNaN(registered) && paid < registered) return false;

    return true;
  });
}

export function eligibleTotal(input: MilestoneInput): number {
  return roundToCents(
    eligibleInvoices(input).reduce((sum, invoice) => sum + invoice.gross, 0),
  );
}

export type MilestoneVerdict =
  | { kind: 'award'; milestone: Milestone; total: number }
  | {
      kind: 'silent';
      reason: 'nothing_reached' | 'already_awarded' | 'urgent_open';
    }
  /** Firma, która się do nas przeprowadziła — cała drabinka odpada. */
  | { kind: 'suppress_all'; reason: 'established_business'; keys: MilestoneKey[] };

/**
 * Który próg (jeśli którykolwiek) — funkcja czysta.
 *
 * Przy kilku progach przekroczonych naraz przyznajemy NAJWYŻSZY. Trzy karty
 * jednego dnia zamieniłyby miły moment w spam, a niższe progi i tak są już
 * nieaktualne.
 */
export function decideMilestone(input: MilestoneInput): MilestoneVerdict {
  const total = eligibleTotal(input);
  const registered = Date.parse(`${input.registeredAt}T00:00:00.000Z`);
  const inFirstMonth =
    !Number.isNaN(registered) &&
    input.today.getTime() - registered < FIRST_MONTH_DAYS * DAY_MS;

  // Konto, które w pierwszym miesiącu przebija najwyższy próg, to nie jest
  // ktoś, kto właśnie zaczyna. Gratulowanie mu „pierwszych 10 000 zł" byłoby
  // dowodem, że program nie rozumie, z kim rozmawia.
  if (inFirstMonth && total >= HIGHEST_THRESHOLD) {
    return {
      kind: 'suppress_all',
      reason: 'established_business',
      keys: MILESTONES.map((milestone) => milestone.key),
    };
  }

  const awarded = new Set(input.awarded);
  const reached = MILESTONES.filter(
    (milestone) =>
      !awarded.has(milestone.key) &&
      (milestone.key === 'first_paid'
        ? eligibleInvoices(input).length > 0
        : total >= milestone.threshold),
  );

  if (reached.length === 0) {
    return {
      kind: 'silent',
      reason: awarded.size > 0 ? 'already_awarded' : 'nothing_reached',
    };
  }

  // Dobra wiadomość, która przepycha się przed niezapłaconą fakturę,
  // przestaje być dobrą wiadomością.
  if (input.hasUrgentOpen) return { kind: 'silent', reason: 'urgent_open' };

  return { kind: 'award', milestone: reached[reached.length - 1]!, total };
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export function buildMilestoneProposal(input: {
  tenantId: string;
  milestone: MilestoneInput;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? input.milestone.today;
  const verdict = decideMilestone(input.milestone);
  if (verdict.kind !== 'award') return null;

  const { milestone, total } = verdict;

  return {
    tenantId: input.tenantId,
    kind: 'milestone.money',
    // Jeden próg = jedna karta w życiu konta.
    topicKey: `milestone.money:${milestone.key}`,
    title: milestone.title,
    body: milestone.body,
    fingerprint: fingerprintOf({ milestone: milestone.key }),
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    // NAJNIŻSZY PRIORYTET W CAŁYM WĄTKU. Niżej niż podpowiedzi funkcji.
    priority: 99,
    payload: {
      milestone: milestone.key,
      // Kwota jako gotowy napis — i to jedyna liczba, jaka tu pada.
      // Bez licznika faktur, bez odznak, bez poziomów.
      amount: formatPln(total),
      primaryIntent: 'open',
      primaryLabel: 'Zobacz swoje przychody',
      // NIGDY POWIADOMIENIE. To ma czekać w wątku, aż klient sam zajrzy.
      noPush: true,
    },
    evidence: [{ label: 'Opłacone faktury', href: '/invoices?status=paid' }],
  };
}
