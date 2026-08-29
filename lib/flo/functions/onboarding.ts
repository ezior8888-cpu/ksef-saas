/**
 * O-01 — wsparcie onboardingu (krok 49 planu).
 *
 * ZDANIE, KTÓRE RZĄDZI TYM PLIKIEM: sukces onboardingu NIE MOŻE ZALEŻEĆ
 * OD CERTYFIKATU KSeF.
 *
 * Certyfikat wymaga wizyty w profilu zaufanym albo podpisu kwalifikowanego,
 * bywa że czeka się na niego dzień, a bywa że tydzień. Nasz docelowy klient
 * — ktoś, kto zakłada pierwszą firmę — trafia na nas najczęściej dlatego,
 * że MA JUŻ USŁUGĘ WYKONANĄ i musi ją zafakturować. Produkt, który w tym
 * momencie mówi „najpierw zdobądź certyfikat”, jest produktem, z którego
 * ten człowiek wyjdzie i nie wróci.
 *
 * Dlatego ścieżka pierwszej faktury kończy się GOTOWYM PDF-em I WYSYŁKĄ
 * MAILEM. Wysyłka do KSeF czeka jako OSOBNE zadanie, z jawną listą tego,
 * czego do niej potrzeba. Osobny test przechodzi całą ścieżkę na koncie bez
 * certyfikatu i wymaga, żeby doszła do końca.
 *
 * MECHANIZM M13 — BRAK ZDOLNOŚCI = NAPRAWA PRZYCZYNY. Gdy warunek techniczny
 * nie jest spełniony, agent nie mówi „nie mogę”. Mówi, czego brakuje i co
 * z tym zrobić — i to jest jedyna rzecz, jaką wtedy proponuje.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

const DAY_MS = 86_400_000;

// ═══════════════════════════════════════════════════════════════
// Stan konta
// ═══════════════════════════════════════════════════════════════

export interface AccountState {
  /** Czy organizacja ma NIP (ścieżka „pomiń NIP” tworzy organizację szkicową). */
  hasNip: boolean;
  /** Czy podłączony jest certyfikat KSeF. */
  hasKsefCertificate: boolean;
  /** Czy uzupełniony jest profil podatkowy (krok 35). */
  hasTaxProfile: boolean;
  /** Czy jest chociaż jeden kontrahent. */
  hasContractor: boolean;
  /** Czy powstała pierwsza faktura. */
  hasFirstInvoice: boolean;
  /** Czy pierwsza faktura została doręczona (PDF mailem albo KSeF). */
  firstInvoiceDelivered: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Co FLO potrafi w tym stanie
// ═══════════════════════════════════════════════════════════════

export type FloCapability =
  | 'draft_invoice'
  | 'send_pdf'
  | 'track_payments'
  | 'read_expenses'
  | 'submit_to_ksef'
  | 'read_ksef_inbox'
  | 'tax_calendar';

export interface BlockedCapability {
  capability: FloCapability;
  /** Czego brakuje. */
  blocker: 'nip' | 'certificate' | 'tax_profile';
  /** Co z tym zrobić — M13: proponujemy WYŁĄCZNIE usunięcie przeszkody. */
  fix: string;
  href: string;
}

export interface CapabilityReport {
  can: FloCapability[];
  cannot: BlockedCapability[];
}

const CAPABILITY_LABEL: Record<FloCapability, string> = {
  draft_invoice: 'przygotować fakturę',
  send_pdf: 'wysłać ją PDF-em na maila',
  track_payments: 'pilnować, kto zapłacił',
  read_expenses: 'czytać koszty ze zdjęć i z plików',
  submit_to_ksef: 'wysyłać faktury do KSeF',
  read_ksef_inbox: 'odbierać faktury kosztowe z KSeF',
  tax_calendar: 'pilnować terminów podatkowych',
};

export function describeCapability(capability: FloCapability): string {
  return CAPABILITY_LABEL[capability];
}

/**
 * Co agent potrafi TERAZ, a czego nie i dlaczego — funkcja czysta.
 *
 * Pierwsze cztery zdolności NIE ZALEŻĄ OD NICZEGO poza kontem. To jest cała
 * sztuczka tego kroku: klient dostaje działający produkt, zanim załatwi
 * jakąkolwiek formalność.
 */
export function capabilitiesFor(state: AccountState): CapabilityReport {
  const can: FloCapability[] = [
    'draft_invoice',
    'send_pdf',
    'track_payments',
    'read_expenses',
  ];
  const cannot: BlockedCapability[] = [];

  if (state.hasKsefCertificate && state.hasNip) {
    can.push('submit_to_ksef', 'read_ksef_inbox');
  } else {
    // M13: nie „nie mogę wysyłać do KSeF", tylko „potrzebny jest certyfikat,
    // zdobywa się go tak".
    const blocker = state.hasNip ? ('certificate' as const) : ('nip' as const);
    const fix = state.hasNip
      ? 'Podłącz certyfikat KSeF — zajmuje kilka minut, jeśli masz profil zaufany.'
      : 'Uzupełnij NIP firmy; bez niego KSeF nie wie, czyje to faktury.';
    const href = state.hasNip ? '/settings/ksef' : '/settings/account';

    cannot.push(
      { capability: 'submit_to_ksef', blocker, fix, href },
      { capability: 'read_ksef_inbox', blocker, fix, href },
    );
  }

  if (state.hasTaxProfile) {
    can.push('tax_calendar');
  } else {
    cannot.push({
      capability: 'tax_calendar',
      blocker: 'tax_profile',
      fix: 'Powiedz mi, jak się rozliczasz — bez tego wolę milczeć niż zgadywać terminy.',
      href: '/settings/flo#profil-podatkowy',
    });
  }

  return { can, cannot };
}

/**
 * Zdanie „oto co potrafię teraz” do kreatora.
 *
 * Mówimy WPROST, co jest zablokowane i dlaczego. Milczenie o ograniczeniach
 * kończy się tym, że klient odkrywa je sam w najgorszym momencie — przy
 * pierwszej fakturze, która ma iść do KSeF dzisiaj.
 */
export function describeState(state: AccountState): string {
  const report = capabilitiesFor(state);
  const canList = report.can.map(describeCapability).join(', ');

  if (report.cannot.length === 0) {
    return `Mogę ${canList}. Wszystko podłączone.`;
  }

  const blocked = report.cannot.map((item) => describeCapability(item.capability));
  return `Mogę ${canList}. Na razie nie mogę: ${blocked.join(', ')} — ${report.cannot[0]!.fix}`;
}

// ═══════════════════════════════════════════════════════════════
// Ścieżka do pierwszej faktury
// ═══════════════════════════════════════════════════════════════

export type OnboardingStep =
  | 'company_data'
  | 'first_contractor'
  | 'first_invoice'
  | 'deliver_invoice';

export interface StepDescriptor {
  step: OnboardingStep;
  title: string;
  body: string;
  action: string;
  href: string;
}

/**
 * KROKI ŚCIEŻKI. NIE MA TU CERTYFIKATU KSeF I NIE BĘDZIE.
 *
 * Lista jest eksportowana, żeby test mógł sprawdzić jej zawartość — nie
 * tylko to, że ścieżka się kończy, ale też że po drodze nie wyrosło nic,
 * co wymaga formalności.
 */
export const ONBOARDING_STEPS: readonly StepDescriptor[] = [
  {
    step: 'company_data',
    title: 'Uzupełnijmy dane firmy',
    body: 'Podaj NIP, a resztę pobiorę z GUS. Jeśli firmy jeszcze nie ma, możemy zacząć bez NIP-u — pierwszą fakturę i tak przygotujesz.',
    action: 'Uzupełnij dane',
    href: '/settings/account',
  },
  {
    step: 'first_contractor',
    title: 'Dla kogo wystawiasz pierwszą fakturę?',
    body: 'Wpisz NIP kontrahenta — dane pobiorę sam. Przy osobie prywatnej wystarczy imię i nazwisko.',
    action: 'Dodaj kontrahenta',
    href: '/contractors',
  },
  {
    step: 'first_invoice',
    title: 'Wystawmy pierwszą fakturę',
    body: 'Nazwa usługi, kwota, termin. Resztę wypełnię za Ciebie.',
    action: 'Wystaw fakturę',
    href: '/invoices/new',
  },
  {
    step: 'deliver_invoice',
    // TO JEST KONIEC ŚCIEŻKI. PDF i mail, bez certyfikatu KSeF.
    title: 'Wyślij ją klientowi',
    body: 'Mam gotowy PDF. Wyślę go mailem, a Ty zobaczysz w wątku, kiedy doszedł. Wysyłkę do KSeF podłączymy osobno, kiedy będziesz gotowy.',
    action: 'Wyślij PDF mailem',
    href: '/invoices',
  },
];

/**
 * Następny krok kreatora — funkcja czysta.
 *
 * BRAK CERTYFIKATU KSeF NIE POJAWIA SIĘ W TEJ FUNKCJI ANI RAZU. To nie jest
 * przeoczenie: certyfikat nie jest warunkiem żadnego kroku i nie wolno mu
 * się tu znaleźć przy żadnej późniejszej poprawce.
 */
export function nextOnboardingStep(state: AccountState): OnboardingStep | 'done' {
  // Brak NIP-u NIE ZATRZYMUJE ścieżki — organizacja szkicowa wystarczy do
  // przygotowania i wysłania PDF-a. Krok pojawia się raz, ale da się go
  // pominąć i wrócić później.
  if (!state.hasNip) return 'company_data';
  if (!state.hasContractor) return 'first_contractor';
  if (!state.hasFirstInvoice) return 'first_invoice';
  if (!state.firstInvoiceDelivered) return 'deliver_invoice';
  return 'done';
}

export function stepDescriptor(step: OnboardingStep): StepDescriptor {
  return ONBOARDING_STEPS.find((item) => item.step === step)!;
}

// ═══════════════════════════════════════════════════════════════
// Wysyłka do KSeF jako OSOBNE zadanie
// ═══════════════════════════════════════════════════════════════

export interface KsefTodo {
  /** Czego potrzeba, po kolei. */
  requirements: string[];
  /** Czy cokolwiek z tego jest już spełnione. */
  done: string[];
}

/**
 * Lista tego, czego potrzeba do wysyłki KSeF — POKAZYWANA OSOBNO.
 *
 * Nigdy jako warunek pierwszej faktury. Klient ma zobaczyć tę listę wtedy,
 * kiedy sam się na nią zdecyduje, a nie w chwili, w której próbuje
 * zafakturować wykonaną wczoraj robotę.
 */
export function ksefTodo(state: AccountState): KsefTodo {
  const requirements: string[] = [];
  const done: string[] = [];

  (state.hasNip ? done : requirements).push('NIP firmy w danych konta');
  (state.hasKsefCertificate ? done : requirements).push(
    'Certyfikat KSeF (profil zaufany albo podpis kwalifikowany)',
  );

  return { requirements, done };
}

// ═══════════════════════════════════════════════════════════════
// Propozycja
// ═══════════════════════════════════════════════════════════════

export function buildOnboardingProposal(input: {
  tenantId: string;
  state: AccountState;
  now?: Date;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const step = nextOnboardingStep(input.state);
  if (step === 'done') return null;

  const descriptor = stepDescriptor(step);

  return {
    tenantId: input.tenantId,
    kind: 'onboarding.step',
    // Jeden krok kreatora = jedna karta; kolejny podmienia poprzednią.
    topicKey: 'onboarding.step',
    title: descriptor.title,
    body: descriptor.body,
    fingerprint: fingerprintOf({ step }),
    // Kreator nie ma terminu ważności w sensie biznesowym, ale karta sprzed
    // pół roku na koncie, które utknęło, jest już tylko wyrzutem sumienia.
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    // Wysoko, ale nie na samej górze: gdy coś pilnego już się dzieje,
    // kreator poczeka.
    priority: 25,
    payload: {
      step,
      // Ostatni krok kończy się PDF-em i mailem. Certyfikat KSeF NIE JEST
      // tu warunkiem niczego.
      deliveryMethod: step === 'deliver_invoice' ? 'pdf_email' : undefined,
      requiresKsefCertificate: false,
      primaryIntent: 'open',
      primaryLabel: descriptor.action,
    },
    evidence: [{ label: descriptor.action, href: descriptor.href }],
  };
}
