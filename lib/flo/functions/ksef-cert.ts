/**
 * X-03 — opiekun certyfikatu KSeF (krok 28 planu).
 *
 * Wygasły certyfikat to firma, która nie może fakturować. Wina będzie po
 * naszej stronie niezależnie od tego, ile razy wysłaliśmy maila — więc
 * ostrzeżenie ma dotrzeć kanałem, którego nie da się przegapić.
 *
 * STAN LICZONY Z REALNEJ PRÓBY AUTORYZACJI, NIE Z POLA Z DATĄ.
 * To jest sedno tej funkcji. Klient, który odnowił certyfikat u wystawcy,
 * ale nie wgrał go do aplikacji, dostaje ostrzeżenie mimo „odnowienia" —
 * i słusznie, bo wysyłka nadal nie zadziała. Klient, który wgrał nowy
 * certyfikat, przestaje dostawać ostrzeżenia NATYCHMIAST, bez klikania
 * czegokolwiek. Data w polu bywa nieaktualna w obie strony; udana
 * autoryzacja jest faktem.
 *
 * BŁĄD UWIERZYTELNIENIA NIE KASUJE ZATWIERDZEŃ. Faktury zatwierdzone przez
 * człowieka czekają w kolejce ze stanem „czekam na certyfikat" i ruszają
 * same po pierwszej udanej autoryzacji. Odrzucenie ich zmusiłoby klienta do
 * klikania wszystkiego od nowa — a jego decyzja już padła.
 */

import { fingerprintOf } from '@/lib/flo/fingerprint';
import type { CreateProposalInput } from '@/lib/flo/proposals';

/**
 * Progi ostrzeżeń w dniach — JEDNO źródło dla karty, maila i pusha.
 *
 * Do 25.09.2026 były dwie listy: tu [30, 14, 3], a w `cert-expiry-alert`
 * [30, 14, 7]. Zadanie szukało certyfikatów w oknach 30/14/7, liczyło z nich
 * 29/13/6 dni (zaokrąglenie w dół), a karta przepuszczała wyłącznie 30/14/3.
 * Skutek: karta X-03 dla wygasającego certyfikatu NIE POWSTAŁA NIGDY, a oba
 * pliki miały zielone testy, bo każdy sprawdzał tylko swoją połowę.
 *
 * Lista wyrównana do tego, co klienci FAKTYCZNIE dostawali mailem i pushem
 * (7, nie 3). Próg 3 dni nie istniał na produkcji ani przez chwilę, więc
 * nikomu nic nie znika. Czy ostatnie ostrzeżenie ma być na 7, czy na 3 dni —
 * decyzja produktowa; teraz zmienia się ją w jednym miejscu, dla wszystkich
 * kanałów naraz.
 */
export const WARN_THRESHOLDS = [30, 14, 7] as const;

/** Poniżej tylu dni interfejs pokazuje trwały pasek, nie tylko kartę. */
export const BANNER_BELOW_DAYS = 14;

/** Jedyny przypadek w produkcie, w którym mail i push idą razem. */
export const ALARM_BELOW_DAYS = 3;

export type CertState =
  /** Autoryzacja przechodzi — wszystko gra, niezależnie od daty w polu. */
  | 'working'
  /** Autoryzacja przechodzi, ale certyfikat wygasa niedługo. */
  | 'expiring'
  /** Autoryzacja nie przechodzi — wysyłka nie zadziała. */
  | 'broken'
  /** Nigdy nie było certyfikatu. */
  | 'missing';

export interface CertSnapshot {
  /** Wynik OSTATNIEJ realnej próby autoryzacji w KSeF. */
  lastAuthOk: boolean | null;
  lastAuthAt: string | null;
  /** Data z pola — używana WYŁĄCZNIE do liczenia „ile zostało". */
  expiresAt: string | null;
}

export interface CertVerdict {
  state: CertState;
  daysLeft: number | null;
  /** Czy interfejs ma pokazać trwały pasek. */
  banner: boolean;
  /** Czy wolno wyjść poza budżet zaczepień (mail + push razem). */
  alarm: boolean;
}

export function evaluateCert(snapshot: CertSnapshot, now: Date): CertVerdict {
  const daysLeft = snapshot.expiresAt
    ? Math.floor(
        (Date.parse(snapshot.expiresAt) - now.getTime()) / 86_400_000,
      )
    : null;

  if (snapshot.lastAuthOk === null && !snapshot.expiresAt) {
    return { state: 'missing', daysLeft: null, banner: true, alarm: false };
  }

  // Nieudana autoryzacja bije wszystko: data w polu może mówić, że
  // certyfikat jest ważny jeszcze pół roku, a wysyłka i tak nie przechodzi.
  if (snapshot.lastAuthOk === false) {
    return { state: 'broken', daysLeft, banner: true, alarm: true };
  }

  if (daysLeft !== null && daysLeft <= WARN_THRESHOLDS[0]) {
    return {
      state: 'expiring',
      daysLeft,
      banner: daysLeft <= BANNER_BELOW_DAYS,
      alarm: daysLeft <= ALARM_BELOW_DAYS,
    };
  }

  return { state: 'working', daysLeft, banner: false, alarm: false };
}

/**
 * Czy przy tej liczbie dni w ogóle się odzywać.
 *
 * Ostrzeganie codziennie przez miesiąc uczy ignorowania. Odzywamy się na
 * trzech progach i tyle — każdy z nich znaczy co innego: „zaplanuj",
 * „zrób to w tym tygodniu", „ostatnie dni".
 */
export function shouldWarn(daysLeft: number | null): boolean {
  if (daysLeft === null) return false;
  return WARN_THRESHOLDS.includes(daysLeft as (typeof WARN_THRESHOLDS)[number]);
}

/**
 * Okno, w którym zadanie szuka certyfikatów na danym progu: `[próg−1, próg]`
 * dni od teraz. Jednodniowe, żeby jeden próg trafiał jednego dnia, a nie
 * codziennie przez tydzień.
 *
 * Tutaj, a nie w zadaniu, bo z tym oknem musi się zgadzać karta: w tym oknie
 * `evaluateCert` policzy `próg−1` dni (zaokrąglenie w dół), więc karta nie
 * może pytać `shouldWarn` o `daysLeft` — musi dostać próg, na którym
 * wywołało ją zadanie. Test szwu w `flo-ksef-fix-cert.test.ts` pilnuje obu
 * stron naraz.
 */
export function certExpiryWindow(days: number, now: Date): { from: Date; to: Date } {
  const DAY = 86_400_000;
  return {
    from: new Date(now.getTime() + (days - 1) * DAY),
    to: new Date(now.getTime() + days * DAY),
  };
}

// ═══════════════════════════════════════════════════════════════
// Karta
// ═══════════════════════════════════════════════════════════════

export function buildCertProposal(input: {
  tenantId: string;
  verdict: CertVerdict;
  now?: Date;
  /**
   * Próg, na którym wywołało nas zadanie (`WARN_THRESHOLDS`). Zadanie już
   * wybrało certyfikat po oknie, więc to próg decyduje, czy się odezwać —
   * `verdict.daysLeft` w tym oknie wynosi `próg−1` i nie trafiłby nigdy.
   * Bez progu (wywołanie spoza zadania) liczy się `daysLeft`.
   */
  threshold?: number;
}): CreateProposalInput | null {
  const now = input.now ?? new Date();
  const { verdict } = input;

  if (verdict.state === 'working') return null;
  if (
    verdict.state === 'expiring' &&
    !shouldWarn(input.threshold ?? verdict.daysLeft)
  ) {
    return null;
  }

  const base = {
    tenantId: input.tenantId,
    kind: 'ksef.cert' as const,
    // Jedna karta na całą sprawę certyfikatu. Trzy progi aktualizują ją
    // w miejscu, zamiast budować kolejkę ostrzeżeń.
    topicKey: 'ksef.cert',
    fingerprint: fingerprintOf({
      state: verdict.state,
      daysLeft: verdict.daysLeft,
    }),
    expiresAt: new Date(now.getTime() + 60 * 86_400_000),
    payload: {
      state: verdict.state,
      daysLeft: verdict.daysLeft,
      // Interfejs czyta to i pokazuje trwały pasek — kanał, którego nie
      // da się przegapić, bo mail bywa w spamie.
      banner: verdict.banner,
      alarm: verdict.alarm,
      primaryIntent: 'open',
      primaryLabel: 'Wgraj certyfikat',
    },
    evidence: [{ label: 'Ustawienia KSeF', href: '/settings/ksef' }],
  };

  if (verdict.state === 'missing') {
    return {
      ...base,
      title: 'Bez certyfikatu nie wyślę faktury do KSeF',
      body: 'Mogę przygotować dokument i wysłać go mailem, ale do rejestru trafi dopiero po wgraniu certyfikatu.',
      priority: 25,
    };
  }

  if (verdict.state === 'broken') {
    // Nie mówimy „wygasł" — mówimy, co widzimy. Powód może być inny
    // (odwołany, zły plik, zmienione uprawnienia), a zgadywanie tylko
    // wyprowadziłoby klienta na manowce.
    return {
      ...base,
      title: 'Nie mogę zalogować się do KSeF Twoim certyfikatem',
      body: 'Wysyłka nie przejdzie, dopóki tego nie naprawimy. Faktury, które zatwierdziłeś, czekają w kolejce — nic nie przepadło.',
      priority: 5,
    };
  }

  const days = verdict.daysLeft ?? 0;
  return {
    ...base,
    title:
      days <= ALARM_BELOW_DAYS
        ? `Certyfikat KSeF wygasa za ${days} dni`
        : `Certyfikat KSeF wygasa za ${days} dni — zaplanuj wymianę`,
    body:
      days <= ALARM_BELOW_DAYS
        ? 'Po wygaśnięciu nie wystawisz faktury do KSeF. To jest rzecz na dziś.'
        : 'Wymiana zajmuje chwilę, ale u wystawcy potrafi potrwać. Lepiej zacząć teraz niż w ostatni dzień.',
    priority: days <= ALARM_BELOW_DAYS ? 5 : 40,
  };
}

/**
 * Czy zatwierdzone wysyłki mają czekać, zamiast zostać odrzucone.
 *
 * Odpowiedź brzmi „zawsze, gdy problem jest po stronie certyfikatu".
 * Decyzja człowieka już padła; awaria techniczna nie ma prawa jej unieważnić.
 */
export function shouldHoldApprovedSubmissions(verdict: CertVerdict): boolean {
  return verdict.state === 'broken' || verdict.state === 'missing';
}
