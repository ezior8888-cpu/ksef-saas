import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ResponsiveTable,
  ResponsiveTableCard,
} from '@/components/dashboard/responsive-table';

/**
 * Listy panelu na telefonie.
 *
 * DLACZEGO TE TESTY W OGÓLE ISTNIEJĄ. Baza deweloperska nie ma ani jednej
 * faktury, kontrahenta czy zaległości, więc na ekranie da się obejrzeć
 * wyłącznie stany puste — a ścieżka kart uruchamia się właśnie wtedy, gdy
 * dane SĄ. Bez tego zestawu jedyną weryfikacją wariantu mobilnego byłaby
 * lektura kodu.
 *
 * Sprawdzamy dwie rzeczy, których lektura nie łapie: że obie wersje tej samej
 * listy naprawdę są w znacznikach (a nie że ktoś zapomniał podać `cards`),
 * i że każda ma właściwy przełącznik widoczności — bo odwrócenie `hidden`
 * i `lg:hidden` daje ekran, na którym na telefonie widać tabelę 880 px,
 * a na komputerze karty.
 */

function markup(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe('ResponsiveTable — tabela na komputerze, karty na telefonie', () => {
  const html = markup(
    <ResponsiveTable
      title="Lista zaległości"
      subtitle="3 pozycje"
      table={
        <table>
          <tbody>
            <tr>
              <td>WIERSZ TABELI</td>
            </tr>
          </tbody>
        </table>
      }
      cards={<div>KARTA TELEFONU</div>}
    />,
  );

  it('renderuje obie wersje treści', () => {
    expect(html).toContain('WIERSZ TABELI');
    expect(html).toContain('KARTA TELEFONU');
  });

  it('tabela jest schowana poniżej lg', () => {
    expect(html).toMatch(/class="[^"]*hidden[^"]*lg:block[^"]*"/);
  });

  it('karty są schowane od lg', () => {
    expect(html).toMatch(/class="[^"]*lg:hidden[^"]*"/);
  });

  it('tabela dostaje własny kontener przewijania w poziomie', () => {
    // Bez tego szeroka tabela rozpycha stronę i cały panel przewija się w bok.
    expect(html).toContain('overflow-x-auto');
  });

  it('nagłówek niesie tytuł i podtytuł', () => {
    expect(html).toContain('Lista zaległości');
    expect(html).toContain('3 pozycje');
  });

  it('bez podtytułu nie zostaje pusty akapit', () => {
    const bez = markup(
      <ResponsiveTable title="Tytuł" table={<table />} cards={null} />,
    );
    expect(bez).not.toContain('<p class="mt-1');
  });
});

describe('ResponsiveTableCard — jeden wiersz jako karta', () => {
  it('pokazuje kto, co i za ile', () => {
    const html = markup(
      <ResponsiveTableCard
        title="ACME Sp. z o.o."
        subtitle="NIP 5252445767"
        amount="22 140,00"
        meta={<span>Termin 14.09.2026</span>}
      />,
    );
    expect(html).toContain('ACME Sp. z o.o.');
    expect(html).toContain('NIP 5252445767');
    expect(html).toContain('22 140,00');
    expect(html).toContain('Termin 14.09.2026');
  });

  it('kwota jest mono i tabelaryczna — dwie karty da się porównać wzrokiem', () => {
    const html = markup(<ResponsiveTableCard title="X" amount="1,00" />);
    expect(html).toMatch(/font-mono[^"]*tabular-nums/);
  });

  it('nazwa nie rozpycha karty — jest przycinana', () => {
    const html = markup(
      <ResponsiveTableCard title="BP EUROPA SE SPÓŁKA EUROPEJSKA ODDZIAŁ W POLSCE" />,
    );
    expect(html).toMatch(/class="truncate/);
  });

  it('bez kwoty nie renderuje pustej kolumny po prawej', () => {
    const html = markup(<ResponsiveTableCard title="Bez kwoty" />);
    expect(html).not.toContain('tabular-nums');
  });

  it('z odsyłaczem cała karta jest celem dotykowym', () => {
    const html = markup(
      <ResponsiveTableCard title="Faktura" href="/invoices/abc" />,
    );
    expect(html).toContain('href="/invoices/abc"');
  });
});
