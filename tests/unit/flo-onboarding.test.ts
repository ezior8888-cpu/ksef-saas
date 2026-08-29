import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildOnboardingProposal,
  capabilitiesFor,
  describeState,
  ksefTodo,
  nextOnboardingStep,
  ONBOARDING_STEPS,
  stepDescriptor,
  type AccountState,
} from '@/lib/flo/functions/onboarding';
import { buildWrapped, type WrappedInput } from '@/lib/flo/wrapped';

/**
 * O-01 — wsparcie onboardingu (krok 49) i S-03 — Wrapped (krok 50).
 *
 * Definicje gotowości z planu:
 * - nowe konto BEZ CERTYFIKATU przechodzi ścieżkę do końca,
 * - konto ze spadkiem: BRAK JAKIEJKOLWIEK LICZBY UJEMNEJ w wyniku.
 */

const NOW = new Date('2026-09-16T09:00:00.000Z');

function account(overrides: Partial<AccountState> = {}): AccountState {
  return {
    hasNip: false,
    hasKsefCertificate: false,
    hasTaxProfile: false,
    hasContractor: false,
    hasFirstInvoice: false,
    firstInvoiceDelivered: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEFINICJA GOTOWOŚCI — konto bez certyfikatu
// ═══════════════════════════════════════════════════════════════

describe('konto BEZ CERTYFIKATU KSeF przechodzi ścieżkę do końca', () => {
  it('cztery kroki, aż do „done", bez ani jednego o certyfikacie', () => {
    // Nasz docelowy klient trafia na nas, bo MA JUŻ USŁUGĘ WYKONANĄ.
    // Produkt, który mówi wtedy „najpierw zdobądź certyfikat", traci go.
    let state = account();
    const walked: string[] = [];

    for (let guard = 0; guard < 10; guard++) {
      const step = nextOnboardingStep(state);
      if (step === 'done') break;
      walked.push(step);

      state = {
        ...state,
        hasNip: step === 'company_data' ? true : state.hasNip,
        hasContractor: step === 'first_contractor' ? true : state.hasContractor,
        hasFirstInvoice: step === 'first_invoice' ? true : state.hasFirstInvoice,
        firstInvoiceDelivered:
          step === 'deliver_invoice' ? true : state.firstInvoiceDelivered,
      };
    }

    expect(walked).toEqual([
      'company_data',
      'first_contractor',
      'first_invoice',
      'deliver_invoice',
    ]);
    expect(nextOnboardingStep(state)).toBe('done');
    expect(state.hasKsefCertificate).toBe(false);
  });

  it('ŻADEN krok ścieżki nie mówi o certyfikacie jako o warunku', () => {
    for (const descriptor of ONBOARDING_STEPS) {
      expect(`${descriptor.title} ${descriptor.action}`).not.toMatch(/certyfikat/i);
    }
  });

  it('ostatni krok kończy się PDF-em i mailem', () => {
    const last = stepDescriptor('deliver_invoice');
    expect(last.action).toBe('Wyślij PDF mailem');
    expect(last.body).toContain('PDF');
    expect(last.body).toContain('osobno');
  });

  it('karta ostatniego kroku deklaruje, że certyfikat nie jest potrzebny', () => {
    const proposal = buildOnboardingProposal({
      tenantId: 't1',
      state: account({
        hasNip: true,
        hasContractor: true,
        hasFirstInvoice: true,
      }),
      now: NOW,
    });

    expect(proposal?.payload?.step).toBe('deliver_invoice');
    expect(proposal?.payload?.deliveryMethod).toBe('pdf_email');
    expect(proposal?.payload?.requiresKsefCertificate).toBe(false);
  });

  it('domknięty onboarding nie produkuje karty', () => {
    expect(
      buildOnboardingProposal({
        tenantId: 't1',
        state: account({
          hasNip: true,
          hasContractor: true,
          hasFirstInvoice: true,
          firstInvoiceDelivered: true,
        }),
        now: NOW,
      }),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// M13 — brak zdolności = naprawa przyczyny
// ═══════════════════════════════════════════════════════════════

describe('M13 — agent mówi, czego brakuje i co z tym zrobić', () => {
  it('cztery zdolności działają od pierwszej minuty, bez formalności', () => {
    const report = capabilitiesFor(account());
    expect(report.can).toEqual([
      'draft_invoice',
      'send_pdf',
      'track_payments',
      'read_expenses',
    ]);
  });

  it('każda zablokowana zdolność ma POWÓD I NAPRAWĘ', () => {
    // Nie „nie mogę wysyłać do KSeF", tylko „potrzebny certyfikat, zdobywa
    // się go tak".
    const report = capabilitiesFor(account({ hasNip: true }));
    for (const blocked of report.cannot) {
      expect(blocked.fix.length).toBeGreaterThan(20);
      expect(blocked.href.startsWith('/')).toBe(true);
    }
  });

  it('bez NIP-u przeszkodą jest NIP, nie certyfikat', () => {
    const report = capabilitiesFor(account());
    const ksef = report.cannot.find((c) => c.capability === 'submit_to_ksef');
    expect(ksef?.blocker).toBe('nip');
    expect(ksef?.fix).toContain('NIP');
  });

  it('z NIP-em, bez certyfikatu — przeszkodą jest certyfikat', () => {
    const report = capabilitiesFor(account({ hasNip: true }));
    const ksef = report.cannot.find((c) => c.capability === 'submit_to_ksef');
    expect(ksef?.blocker).toBe('certificate');
    expect(ksef?.fix).toContain('profil zaufany');
  });

  it('brak profilu podatkowego blokuje TYLKO terminy', () => {
    const report = capabilitiesFor(account({ hasNip: true, hasKsefCertificate: true }));
    expect(report.cannot.map((c) => c.capability)).toEqual(['tax_calendar']);
    expect(report.can).toContain('submit_to_ksef');
  });

  it('komplet: nic nie jest zablokowane', () => {
    const report = capabilitiesFor(
      account({ hasNip: true, hasKsefCertificate: true, hasTaxProfile: true }),
    );
    expect(report.cannot).toEqual([]);
    expect(describeState(account({ hasNip: true, hasKsefCertificate: true, hasTaxProfile: true })))
      .toContain('Wszystko podłączone');
  });

  it('zdanie do kreatora mówi WPROST, czego agent teraz nie potrafi', () => {
    // Milczenie o ograniczeniach kończy się tym, że klient odkrywa je sam
    // w najgorszym momencie.
    const text = describeState(account({ hasNip: true }));
    expect(text).toContain('Mogę');
    expect(text).toContain('Na razie nie mogę');
    expect(text).toContain('wysyłać faktury do KSeF');
  });

  it('lista wymagań KSeF jest OSOBNA, nie warunkiem pierwszej faktury', () => {
    const todo = ksefTodo(account({ hasNip: true }));
    expect(todo.done).toContain('NIP firmy w danych konta');
    expect(todo.requirements[0]).toContain('Certyfikat KSeF');
  });
});

// ═══════════════════════════════════════════════════════════════
// S-03 — WRAPPED
// ═══════════════════════════════════════════════════════════════

function months(grossPerMonth: number[], year = 2026) {
  return grossPerMonth.map((gross, index) => ({
    yearMonth: `${year}-${String(index + 1).padStart(2, '0')}`,
    invoiceCount: 4,
    acceptedCount: 4,
    rejectedCount: 0,
    totalGross: gross,
  }));
}

function wrappedInput(overrides: Partial<WrappedInput> = {}): WrappedInput {
  return {
    year: 2026,
    months: months([12000, 9000, 15000, 11000, 8000, 14000]),
    contractors: [
      {
        id: 'c1',
        name: 'ACME Sp. z o.o.',
        gross: 40_000,
        avgDaysToPay: 2,
        firstInvoiceMonth: '2023-04',
      },
      {
        id: 'c2',
        name: 'Nowak Studio',
        gross: 18_000,
        avgDaysToPay: -3,
        firstInvoiceMonth: '2025-11',
      },
    ],
    previousYearGross: 50_000,
    ...overrides,
  };
}

describe('DEFINICJA GOTOWOŚCI — konto ze spadkiem nie widzi liczby ujemnej', () => {
  const declining = buildWrapped(
    wrappedInput({
      months: months([3000, 2000, 2500, 1800, 2200, 1500]),
      previousYearGross: 200_000,
    }),
  );

  it('ANI JEDNEJ liczby ujemnej w całym wyniku', () => {
    // Człowiek, który stracił dwóch największych klientów, nie potrzebuje
    // animacji z liczbą „−38%".
    const serialized = JSON.stringify(declining);
    expect(serialized).not.toMatch(/-\d/);
    expect(serialized).not.toMatch(/−/);
  });

  it('ani jednego słowa o spadku', () => {
    const serialized = JSON.stringify(declining).toLowerCase();
    for (const word of ['spad', 'mniej', 'gorzej', 'mniejsz', 'strat']) {
      expect(serialized).not.toContain(word);
    }
  });

  it('DOBIERA INNY ZESTAW EKRANÓW', () => {
    expect(declining.variant).toBe('steady');
    const keys = declining.screens.map((screen) => screen.key);
    expect(keys).toContain('clients_served');
    expect(keys).toContain('longest_relationship');
    expect(keys).toContain('punctuality');
    // Ekrany porównawcze znikają w całości.
    expect(keys).not.toContain('quarter_to_quarter');
    expect(keys).not.toContain('biggest_client');
  });

  it('dobry rok dostaje zestaw podstawowy', () => {
    const growing = buildWrapped(wrappedInput({ previousYearGross: 40_000 }));
    expect(growing.variant).toBe('growth');
    const keys = growing.screens.map((s) => s.key);
    expect(keys).toContain('biggest_client');
    expect(keys).toContain('best_month');
    expect(keys).toContain('quarter_to_quarter');
  });

  it('pierwszy rok liczy się jako dobry — nie ma z czym porównywać', () => {
    expect(buildWrapped(wrappedInput({ previousYearGross: null })).variant).toBe('growth');
  });

  it('płatność przed terminem nie jest pokazywana jako liczba ujemna', () => {
    // Wartość ujemna na ekranie wygląda jak zła wiadomość, nawet gdy jest
    // najlepszą w całym zestawieniu.
    const growing = buildWrapped(wrappedInput({ previousYearGross: 10_000 }));
    const fastest = growing.screens.find((s) => s.key === 'fastest_payer');
    expect(fastest?.value).toBe('Płaci przed terminem');
    expect(JSON.stringify(growing)).not.toMatch(/-\d/);
  });
});

describe('Wrapped — nazwy, liczba ekranów i koszt', () => {
  it('nazwy kontrahentów są DOMYŚLNIE ZASŁONIĘTE', () => {
    // Ekran zapisuje się w 9:16 i ląduje na Instagramie, a klient nie pytał
    // nikogo o zgodę na pokazanie, ile u niego wydał.
    const result = buildWrapped(wrappedInput({ previousYearGross: 10_000 }));
    expect(result.namesRevealed).toBe(false);
    expect(JSON.stringify(result)).not.toContain('ACME');
    expect(result.screens.find((s) => s.key === 'biggest_client')?.label).toBe(
      'Twój największy klient',
    );
  });

  it('prawdziwe nazwy WYŁĄCZNIE na wyraźne żądanie', () => {
    const result = buildWrapped(
      wrappedInput({ previousYearGross: 10_000, revealNames: true }),
    );
    expect(result.namesRevealed).toBe(true);
    expect(result.screens.find((s) => s.key === 'biggest_client')?.label).toBe(
      'ACME Sp. z o.o.',
    );
  });

  it('nigdy więcej niż siedem ekranów', () => {
    expect(
      buildWrapped(wrappedInput({ previousYearGross: 10_000 })).screens.length,
    ).toBeLessThanOrEqual(7);
    expect(buildWrapped(wrappedInput()).screens.length).toBeLessThanOrEqual(7);
  });

  it('każdy ekran ma jedną liczbę i podpis', () => {
    for (const screen of buildWrapped(wrappedInput()).screens) {
      expect(screen.value.length).toBeGreaterThan(0);
      expect(screen.caption.length).toBeGreaterThan(10);
    }
  });

  it('ZERO WYWOŁAŃ MODELU — plik nie importuje warstwy modelu', () => {
    // Wrapped ogląda naraz całe konto klientów w jednym tygodniu grudnia;
    // rachunek za model liczyłby się wtedy w tysiącach.
    const source = readFileSync(resolve(process.cwd(), 'lib/flo/wrapped.ts'), 'utf8');
    expect(source).not.toMatch(/from '@\/lib\/flo\/llm'/);
    expect(source).not.toMatch(/generateCopy|callAnthropic|anthropic/i);
  });

  it('puste konto nie wywraca funkcji', () => {
    const empty = buildWrapped({
      year: 2026,
      months: [],
      contractors: [],
      previousYearGross: null,
    });
    expect(empty.screens.length).toBeGreaterThan(0);
    expect(JSON.stringify(empty)).not.toMatch(/-\d/);
  });
});
