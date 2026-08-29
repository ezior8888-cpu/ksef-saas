import { describe, expect, it } from 'vitest';

import {
  buildForeignProposal,
  classifyForeign,
  foreignOptions,
  isEuCountry,
} from '@/lib/flo/functions/contractor-foreign';
import {
  describeMissingRate,
  LOCAL_TABLE_BUFFER,
  MAX_PUBLICATION_GAP_DAYS,
  rateBefore,
  stampRate,
  trimBuffer,
  type NbpRate,
} from '@/lib/flo/nbp';
import { isBusinessDay } from '@/lib/flo/tax-params';

/**
 * P-09 — kurs NBP i kontrahent z zagranicy (krok 45).
 *
 * Definicja gotowości z planu: testy na długie weekendy, święta
 * i przełom roku.
 */

const DAY_MS = 86_400_000;

/**
 * Zapas tabel zbudowany po dniach roboczych — tak jak publikuje NBP.
 *
 * Kalendarz bierzemy z `tax-params` (ten sam, którego pilnują testy kroku 35),
 * żeby fixture nie był ręcznie wpisaną listą dat, w której łatwo przeoczyć
 * właśnie to święto, o które chodzi.
 */
function tablesBetween(fromIso: string, toIso: string, currency = 'EUR'): NbpRate[] {
  const tables: NbpRate[] = [];
  let cursor = new Date(`${fromIso}T00:00:00.000Z`);
  const end = Date.parse(`${toIso}T00:00:00.000Z`);
  let ordinal = 1;

  while (cursor.getTime() <= end) {
    if (isBusinessDay(cursor)) {
      const iso = cursor.toISOString().slice(0, 10);
      tables.push({
        currency,
        mid: 4.3,
        tableNo: `${ordinal}/A/NBP/${cursor.getUTCFullYear()}`,
        effectiveDate: iso,
      });
      ordinal++;
    }
    cursor = new Date(cursor.getTime() + DAY_MS);
  }

  return tables;
}

// ═══════════════════════════════════════════════════════════════
// Reguła „przed", nie „w dniu"
// ═══════════════════════════════════════════════════════════════

describe('ostatnia tabela opublikowana PRZED datą', () => {
  const tables = tablesBetween('2026-09-01', '2026-09-30');

  it('bierze dzień poprzedni, nie dzień zdarzenia', () => {
    // Ta jedna litera („przed", nie „w dniu") to inna kwota VAT-u przy
    // kontroli — urząd liczy według dnia poprzedniego.
    const lookup = rateBefore(tables, 'EUR', '2026-09-16');
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.rate.effectiveDate).toBe('2026-09-15');
  });

  it('tabela z tego samego dnia jest ODRZUCANA', () => {
    const sameDayOnly: NbpRate[] = [
      { currency: 'EUR', mid: 4.3, tableNo: '1/A/NBP/2026', effectiveDate: '2026-09-16' },
    ];
    expect(rateBefore(sameDayOnly, 'EUR', '2026-09-16')).toEqual({
      found: false,
      reason: 'no_table_before',
    });
  });

  it('waluta spoza zapasu nie dostaje kursu z innej', () => {
    expect(rateBefore(tables, 'USD', '2026-09-16')).toEqual({
      found: false,
      reason: 'unknown_currency',
    });
  });

  it('kod waluty czytamy niezależnie od wielkości liter', () => {
    expect(rateBefore(tables, 'eur', '2026-09-16').found).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Weekendy, długie weekendy, święta
// ═══════════════════════════════════════════════════════════════

describe('weekend i długi weekend', () => {
  it('poniedziałek bierze kurs z piątku', () => {
    const tables = tablesBetween('2026-09-01', '2026-09-30');
    const lookup = rateBefore(tables, 'EUR', '2026-09-21');
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.rate.effectiveDate).toBe('2026-09-18');
    expect(lookup.gapDays).toBe(3);
  });

  it('majówka 2026: 1 maja piątek-święto, 3 maja niedziela-święto', () => {
    // Pierwszy dzień roboczy po majówce to poniedziałek 4 maja; kurs dla
    // niego pochodzi z czwartku 30 kwietnia.
    const tables = tablesBetween('2026-04-01', '2026-05-31');
    const lookup = rateBefore(tables, 'EUR', '2026-05-04');
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.rate.effectiveDate).toBe('2026-04-30');
    expect(lookup.gapDays).toBe(4);
  });

  it('wtorek po poniedziałku wielkanocnym bierze kurs z Wielkiego Piątku', () => {
    // Wielkanoc 2026: 5 kwietnia, poniedziałek wielkanocny 6 kwietnia.
    const tables = tablesBetween('2026-03-01', '2026-04-30');
    const lookup = rateBefore(tables, 'EUR', '2026-04-07');
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.rate.effectiveDate).toBe('2026-04-03');
  });

  it('Boże Ciało wypada w czwartek — piątek nadal ma kurs ze środy', () => {
    const tables = tablesBetween('2026-05-01', '2026-06-30');
    const lookup = rateBefore(tables, 'EUR', '2026-06-05');
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.rate.effectiveDate).toBe('2026-06-03');
  });
});

// ═══════════════════════════════════════════════════════════════
// Przełom roku
// ═══════════════════════════════════════════════════════════════

describe('przełom roku', () => {
  const tables = [
    ...tablesBetween('2026-12-01', '2026-12-31'),
    ...tablesBetween('2027-01-01', '2027-01-31'),
  ];

  it('2 stycznia bierze kurs z ostatniego dnia roboczego grudnia', () => {
    // 1 stycznia 2027 to piątek-święto, 31 grudnia 2026 to czwartek.
    const lookup = rateBefore(tables, 'EUR', '2027-01-02');
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.rate.effectiveDate).toBe('2026-12-31');
  });

  it('numeracja tabel startuje od nowa w nowym roku', () => {
    const first2027 = tables.find((table) => table.effectiveDate.startsWith('2027'));
    expect(first2027?.tableNo).toMatch(/^1\/A\/NBP\/2027$/);
  });

  it('pierwszy dzień roboczy roku nie sięga po kurs z tego samego dnia', () => {
    const lookup = rateBefore(tables, 'EUR', '2027-01-04');
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.rate.effectiveDate.startsWith('2026')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Brak kursu — nigdy podstawienie
// ═══════════════════════════════════════════════════════════════

describe('brak kursu nie jest problemem do obejścia', () => {
  it('nieaktualny zapas NIE podstawia starego kursu', () => {
    // Kurs bliski prawdzie wygląda na fakturze tak samo jak prawdziwy
    // i różni się od niego przy każdej korekcie.
    const tables = tablesBetween('2026-08-01', '2026-08-14');
    const lookup = rateBefore(tables, 'EUR', '2026-09-16');
    expect(lookup).toEqual({ found: false, reason: 'stale_buffer' });
  });

  it('granica dopuszczalnej dziury to długi weekend ze świętami', () => {
    expect(MAX_PUBLICATION_GAP_DAYS).toBe(7);
    const tables: NbpRate[] = [
      { currency: 'EUR', mid: 4.3, tableNo: '1/A/NBP/2026', effectiveDate: '2026-09-09' },
    ];
    expect(rateBefore(tables, 'EUR', '2026-09-16').found).toBe(true);
    expect(rateBefore(tables, 'EUR', '2026-09-17').found).toBe(false);
  });

  it('każdy powód braku ma własne zdanie i ŻADEN nie podaje kursu', () => {
    // Data w komunikacie jest w porządku; zakazana jest LICZBA UDAJĄCA KURS.
    for (const reason of ['unknown_currency', 'no_table_before', 'stale_buffer'] as const) {
      const text = describeMissingRate(reason, 'EUR', '2026-09-16');
      expect(text).toMatch(/ręcznie/);
      expect(text).not.toContain('4,3');
      expect(text).not.toContain('4.3');
      expect(text).not.toMatch(/kurs [\d]/i);
    }
  });

  it('karta bez kursu też go nie podstawia', () => {
    const stale = tablesBetween('2026-08-01', '2026-08-14');
    const { proposal, rate } = buildForeignProposal({
      tenantId: 't1',
      contractorId: 'c1',
      contractorName: 'Muster GmbH',
      contractor: { countryCode: 'DE', viesValid: true },
      currency: 'EUR',
      rateDate: '2026-09-16',
      tables: stale,
      now: new Date('2026-09-16T09:00:00.000Z'),
    });

    expect(rate).toBeNull();
    expect(proposal.body).not.toContain('4,3');
    expect(proposal.body).not.toContain('4.3');
    expect(proposal.body).toContain('za stara');
  });
});

// ═══════════════════════════════════════════════════════════════
// Zapas i ślad kursu
// ═══════════════════════════════════════════════════════════════

describe('zapas 30 tabel i ślad kursu', () => {
  it('przycinamy PER WALUTA, nie globalnie', () => {
    // Przy trzech walutach globalny limit zostawiłby dziesięć dni historii
    // na każdą z nich.
    const mixed = [
      ...tablesBetween('2026-06-01', '2026-09-30', 'EUR'),
      ...tablesBetween('2026-06-01', '2026-09-30', 'USD'),
    ];
    const trimmed = trimBuffer(mixed);

    expect(trimmed.filter((t) => t.currency === 'EUR')).toHaveLength(LOCAL_TABLE_BUFFER);
    expect(trimmed.filter((t) => t.currency === 'USD')).toHaveLength(LOCAL_TABLE_BUFFER);
  });

  it('zostają NAJNOWSZE tabele', () => {
    const trimmed = trimBuffer(tablesBetween('2026-06-01', '2026-09-30'));
    expect(trimmed[trimmed.length - 1]?.effectiveDate).toBe('2026-09-30');
  });

  it('ślad kursu niesie numer tabeli i obie daty', () => {
    // Sam kurs bez numeru tabeli jest liczbą, której nie da się obronić.
    const stamp = stampRate(
      { currency: 'eur', mid: 4.3123, tableNo: '170/A/NBP/2026', effectiveDate: '2026-09-15' },
      '2026-09-16',
    );
    expect(stamp).toEqual({
      currency: 'EUR',
      mid: 4.3123,
      tableNo: '170/A/NBP/2026',
      effectiveDate: '2026-09-15',
      appliedFor: '2026-09-16',
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// P-09 — agent nie ustawia stawki VAT
// ═══════════════════════════════════════════════════════════════

describe('P-09 — domyślną odpowiedzią jest „zapytaj człowieka"', () => {
  const tables = tablesBetween('2026-09-01', '2026-09-30');

  function build(overrides: Partial<Parameters<typeof buildForeignProposal>[0]> = {}) {
    return buildForeignProposal({
      tenantId: 't1',
      contractorId: 'c1',
      contractorName: 'Muster GmbH',
      contractor: { countryCode: 'DE', viesValid: true },
      currency: 'EUR',
      rateDate: '2026-09-16',
      tables,
      now: new Date('2026-09-16T09:00:00.000Z'),
      ...overrides,
    });
  }

  it('rozpoznaje trzy sytuacje', () => {
    expect(classifyForeign({ countryCode: 'DE', viesValid: true })).toBe('eu_vat_registered');
    expect(classifyForeign({ countryCode: 'DE', viesValid: false })).toBe('eu_no_vat');
    expect(classifyForeign({ countryCode: 'US', viesValid: false })).toBe('outside_eu');
    expect(isEuCountry('de')).toBe(true);
    expect(isEuCountry('CH')).toBe(false);
  });

  it('W ŁADUNKU NIE MA POLA ZE STAWKĄ VAT', () => {
    // Dopóki go nie ma, nikt nie zbuduje interfejsu, który ustawia stawkę
    // „jednym kliknięciem".
    const { proposal } = build();
    const keys = Object.keys(proposal.payload!);
    for (const forbidden of ['vatRate', 'reverseCharge', 'taxRate', 'stawka']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('KAŻDA sytuacja kończy się odesłaniem do księgowej', () => {
    for (const contractor of [
      { countryCode: 'DE', viesValid: true },
      { countryCode: 'DE', viesValid: false },
      { countryCode: 'US', viesValid: false },
    ]) {
      const { proposal } = build({ contractor });
      expect(proposal.body).toContain('Nie ustawiam za Ciebie stawki VAT');
      expect(proposal.body).toContain('pokaż to księgowej');
    }
  });

  it('warianty są OPISAMI — każdy zaczyna się od „zwykle"', () => {
    for (const situation of ['eu_vat_registered', 'eu_no_vat', 'outside_eu'] as const) {
      const options = foreignOptions(situation);
      expect(options.length).toBeGreaterThanOrEqual(2);
      expect(options.length).toBeLessThanOrEqual(3);
      expect(options.every((option) => option.note.startsWith('Zwykle'))).toBe(true);
    }
  });

  it('agent niczego nie wykonuje', () => {
    expect(build().proposal.payload?.primaryIntent).toBe('open');
  });

  it('kurs trafia do treści, do dowodów i do śladu', () => {
    const { proposal, rate } = build();
    expect(rate?.tableNo).toBeTruthy();
    expect(proposal.body).toContain('tabeli');
    expect(proposal.evidence?.some((e) => e.label.includes('Kurs EUR'))).toBe(true);
  });

  it('brak kursu mówi wprost i nie blokuje karty', () => {
    const { proposal, rate } = build({ tables: [], rateDate: '2026-09-16' });
    expect(rate).toBeNull();
    expect(proposal.payload?.rateMissing).toBe(true);
    expect(proposal.body).toContain('ręcznie');
  });

  it('faktura w złotówkach nie szuka kursu', () => {
    const { proposal, rate } = build({ currency: 'PLN', tables: [] });
    expect(rate).toBeNull();
    expect(proposal.payload?.rateMissing).toBe(false);
  });

  it('jeden kontrahent = jedna karta', () => {
    expect(build().proposal.topicKey).toBe('contractor.foreign:c1');
  });
});
