import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { kpirCostAmount } from '@/lib/categorization/kpir-cost';
import { kpirRevenueNet } from '@/lib/categorization/kpir-revenue';
import { deductibleAfterVatChange } from '@/lib/categorization/vat-deduction';

/**
 * AUD-94: raporty zaokrąglały grosze naiwnym `Math.round(x * 100) / 100`,
 * a faktura (XML, PDF) — `roundToCents`. Naiwne daje 1,00 z 1,005 (zapis
 * binarny 1,005 jest odrobinę mniejszy) i zaokrągla połówki ujemne w górę
 * (-0,125 → -0,12), więc KPiR, JPK i raporty potrafiły się rozjechać
 * z dokumentem o 1 gr.
 */

describe('grosze jak na fakturze (roundToCents)', () => {
  it('przychód KPiR: 1,005 → 1,01, nie 1,00', () => {
    expect(kpirRevenueNet({ kind: 'vat', net: 1.005 })).toBe(1.01);
  });

  it('przychód KPiR z korekty in minus: połówka od zera, jak w dokumencie', () => {
    expect(kpirRevenueNet({ kind: 'correction', net: -0.125 })).toBe(-0.13);
  });

  it('koszt KPiR: 1,005 → 1,01', () => {
    expect(
      kpirCostAmount({ net_amount: 1.005, vat_amount: 0, vat_deductible_amount: 0, document_type: 'invoice' }),
    ).toBe(1.01);
  });

  it('VAT do odliczenia po poprawce kwoty: połowa z 2,01 to 1,01', () => {
    expect(deductibleAfterVatChange({ vat: 2, deductible: 1 }, 2.01)).toBe(1.01);
  });
});

/**
 * Pliki zwolnione ze sprawdzenia — od 02.10 pusto (AUD-94 domknięte).
 * Lista ma tylko maleć.
 */
const CZEKA_NA_INNE_PR = new Set<string>([]);

function sourceFiles(root: string, dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(root, rel)).isDirectory()) return sourceFiles(root, rel);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [rel] : [];
  });
}

describe('brak naiwnego zaokrąglania groszy w kodzie', () => {
  it('żaden plik lib/ nie liczy groszy przez Math.round(x * 100) / 100', () => {
    const root = path.resolve(__dirname, '../..');
    const naive = /Math\.round\([^;]*\*\s*100\)\s*\/\s*100/;
    const offenders = sourceFiles(root, 'lib')
      .filter((file) => !CZEKA_NA_INNE_PR.has(file))
      .filter((file) =>
        readFileSync(path.join(root, file), 'utf8')
          .split('\n')
          // Komentarz opisujący błąd (invoice-calculator.ts) to nie wywołanie.
          .some((line) => naive.test(line) && !/^\s*(\*|\/\/)/.test(line)),
      );
    expect(offenders).toEqual([]);
  });
});
