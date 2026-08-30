import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloPreviewDiff } from '@/components/flo/preview-diff';
import { FloPreviewFile } from '@/components/flo/preview-file';
import { FloPreviewInvoice } from '@/components/flo/preview-invoice';
import { FloPreviewMessage } from '@/components/flo/preview-message';
import { FLO_FIXTURES } from '@/lib/flo/fixtures';
import type { FloPreview } from '@/types/flo';

/**
 * Cztery podglądy (kroki 11–14 toru B).
 *
 * Podgląd jest miejscem, w którym klient decyduje, czy coś nieodwracalnego ma
 * pójść w świat. Sprawdzamy więc nie „czy się rysuje”, tylko czy pokazuje
 * WSZYSTKO, co przysłał serwer, i czy niczego nie dopowiada od siebie.
 */

function preview<T extends FloPreview['type']>(
  type: T,
): Extract<FloPreview, { type: T }> {
  const found = FLO_FIXTURES.find((f) => f.preview?.type === type)?.preview;
  if (!found) throw new Error(`brak atrapy z podglądem ${type}`);
  return found as Extract<FloPreview, { type: T }>;
}

describe('podgląd faktury (krok 11)', () => {
  const invoice = preview('invoice');
  const html = renderToStaticMarkup(<FloPreviewInvoice preview={invoice} />);

  it('ma te same kolumny co faktura wystawiana ręcznie', () => {
    for (const header of ['Nazwa', 'Ilość', 'Netto', 'VAT', 'Brutto']) {
      expect(html).toContain(header);
    }
  });

  it('pokazuje każdą pozycję z kwotami dokładnie tak, jak przyszły', () => {
    for (const line of invoice.lines) {
      expect(html).toContain(line.name);
      expect(html).toContain(line.net);
      expect(html).toContain(line.gross);
    }
  });

  it('suma i termin są przepisane z serwera, nie policzone', () => {
    expect(html).toContain(invoice.total);
    expect(html).toContain(invoice.due);
    expect(html).toContain('Do zapłaty');
  });
});

describe('podgląd wiadomości (krok 12)', () => {
  const message = preview('message');

  it('pokazuje adresata, temat i pełną treść', () => {
    const html = renderToStaticMarkup(
      <FloPreviewMessage preview={message} />,
    );

    expect(html).toContain(message.to);
    expect(html).toContain(message.subject);
    // Treść ma akapity — sprawdzamy pierwszy i ostatni wiersz.
    const lines = message.bodyText.split('\n').filter(Boolean);
    expect(html).toContain(lines[0]!);
    expect(html).toContain(lines.at(-1)!);
  });

  it('bez podpiętej edycji pole jest tylko do odczytu', () => {
    const html = renderToStaticMarkup(
      <FloPreviewMessage preview={message} />,
    );

    expect(html).toMatch(/<textarea[^>]*\sreadonly=""/i);
  });

  it('z podpiętą edycją pokazuje treść po zmianach, nie tę z serwera', () => {
    const html = renderToStaticMarkup(
      <FloPreviewMessage
        preview={message}
        value="Moja własna treść."
        onChange={() => {}}
      />,
    );

    expect(html).toContain('Moja własna treść.');
    expect(html).not.toContain(message.bodyText.split('\n')[0]!);
    expect(html).toContain('Wyślę dokładnie tę treść');
  });
});

describe('podgląd różnicy (krok 13)', () => {
  const diff = preview('diff');
  const html = renderToStaticMarkup(<FloPreviewDiff preview={diff} />);

  it('pokazuje stan przed i po dla każdego pola', () => {
    for (const row of diff.rows) {
      expect(html).toContain(row.field);
      expect(html).toContain(row.before);
      expect(html).toContain(row.after);
    }
  });

  it('stara wartość jest przekreślona, nowa wyróżniona', () => {
    expect(html).toContain('line-through');
    expect(html).toContain('font-medium');
  });

  it('zmiana jest widoczna nie tylko kolorem', () => {
    // Znacznik przy nazwie pola — dla kogoś, kto koloru nie rozróżnia.
    expect(html).toContain('●');
    expect(html).toContain('Było');
    expect(html).toContain('Jest');
  });
});

describe('podgląd pliku (krok 14)', () => {
  const file = preview('file');
  const html = renderToStaticMarkup(<FloPreviewFile preview={file} />);

  it('pokazuje nazwę, rozmiar i przycisk pobrania', () => {
    expect(html).toContain(file.label);
    expect(html).toContain(file.sizeLabel);
    expect(html).toContain('Pobierz');
    expect(html).toContain(file.href);
  });

  it('odnośnik jest zwykły — link po terminie ma pokazać odpowiedź serwera', () => {
    // Bez atrybutu `download`: przy adresie podpisanym czasowo przeglądarka
    // zapisałaby plik pod nazwą z adresu, a nie tą, którą nadał serwer.
    expect(html).not.toContain('download=');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
