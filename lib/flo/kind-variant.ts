/**
 * Mapa: rodzaj propozycji → wariant karty.
 *
 * DLACZEGO TO ISTNIEJE: interfejs implementuje SZEŚĆ komponentów, nie 33.
 * Każdy nowy rodzaj propozycji musi zadeklarować, którą kartą się rysuje —
 * inaczej tor interfejsu musiałby zgadywać albo dopisywać nowy ekran.
 *
 * `Record<FloProposalKind, FloCardVariant>` wymusza kompletność na etapie
 * kompilacji: dopisanie rodzaju do `FLO_PROPOSAL_KINDS` bez wpisu tutaj
 * zatrzymuje build. Test kontraktowy sprawdza to samo w czasie wykonania,
 * żeby błąd był czytelny także dla kogoś, kto patrzy tylko na wynik testów.
 *
 * Warianty z podglądem obowiązkowym (`preview`) to funkcje o największym
 * promieniu rażenia: dokument w rejestrze państwowym albo wiadomość
 * u obcej osoby. Tam człowiek musi zobaczyć treść, zanim kliknie.
 */

import type { FloCardVariant, FloProposalKind } from '@/types/flo';

export const FLO_KIND_VARIANT: Record<FloProposalKind, FloCardVariant> = {
  // ── Przychody ────────────────────────────────────────────────
  'invoice.draft': 'preview', // P-02/P-03 — faktura leci do KSeF
  'invoice.batch': 'list', // P-02 — paczka z zaznaczaniem
  'invoice.final': 'preview', // P-07 — faktura końcowa po zaliczce
  'invoice.raise': 'preview', // P-04 — wiadomość do kontrahenta
  'contractor.check': 'single', // P-08 — ostrzeżenie o kontrahencie
  'contractor.foreign': 'choice', // P-09 — wybór wariantu, decyzja u człowieka

  // ── Kasa ─────────────────────────────────────────────────────
  'payment.confirm': 'choice', // K-01 — tak / nie / częściowo
  'payment.chase': 'preview', // K-02 — treść maila do przeczytania
  'payment.score': 'info', // K-03 — sama informacja przy szkicu
  'payment.interest': 'choice', // K-05 — z odsetkami czy bez

  // ── Wydatki ──────────────────────────────────────────────────
  'expense.review': 'single', // W-01/W-02 — potwierdź albo popraw
  'expense.rule': 'choice', // W-03 — zawsze / pytaj za każdym razem
  'expense.missing': 'single', // W-04 — wgraj dokument

  // ── KSeF ─────────────────────────────────────────────────────
  'ksef.status': 'info', // X-01 — meldunek, brak akcji
  'ksef.fix': 'preview', // X-02 — różnica „było → jest”
  'ksef.cert': 'single', // X-03 — przejdź do wymiany certyfikatu
  'ksef.outage': 'info', // X-04 — komunikat, nie zadanie
  'ksef.audit': 'list', // X-05 — lista spraw do posprzątania

  // ── Terminy i podatki ────────────────────────────────────────
  'tax.deadline': 'single', // T-01 — pobierz plik
  'tax.limit': 'info', // T-02 — licznik limitu
  'tax.relief': 'info', // T-03 — zegar ulg
  'tax.simulate': 'info', // T-04 — zablokowane do opinii prawnej
  'tax.setaside': 'single', // T-05 — „odłożyłem”

  // ── Biuro rachunkowe ─────────────────────────────────────────
  'accountant.package': 'input', // B-01 — najpierw adres księgowej
  'accountant.format': 'choice', // B-02 — w czym pracuje księgowa

  // ── Start i rozmowa ──────────────────────────────────────────
  'onboarding.step': 'single', // O-01 — następny krok kreatora
  'import.done': 'info', // O-02 — podsumowanie importu
  'feature.hint': 'single', // O-03 — podpowiedź funkcji
  'chat.draft': 'preview', // O-04 — szkic z rozmowy

  // ── Do pokazania ─────────────────────────────────────────────
  'wrapped.ready': 'info', // S-03 — podsumowanie roku
  'milestone.money': 'info', // S-04 — próg pieniężny
};

/**
 * Rodzaje, w których kliknięcie wymaga wcześniejszego obejrzenia podglądu.
 * Wyprowadzone z mapy, żeby nie utrzymywać drugiej listy, która potrafi
 * rozjechać się z pierwszą.
 */
export function requiresPreview(kind: FloProposalKind): boolean {
  return FLO_KIND_VARIANT[kind] === 'preview';
}
