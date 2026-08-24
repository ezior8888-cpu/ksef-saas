import { describe, expect, it } from 'vitest';

import type { FloProposalRow } from '@/lib/flo/db-types';
import { toProposalView } from '@/lib/flo/proposals';

/**
 * Zamiana wiersza bazy na kartę w interfejsie (krok 7 planu).
 *
 * To jest granica między silnikiem a interfejsem: wszystko, co przejdzie
 * przez tę funkcję, zobaczy klient. Testujemy ją bez bazy, bo to funkcja
 * czysta — i właśnie dlatego została wydzielona.
 */

function row(overrides: Partial<FloProposalRow> = {}): FloProposalRow {
  return {
    id: 'prop-1',
    tenant_id: 'ten-1',
    kind: 'payment.chase',
    topic_key: 'payment.chase:inv-1:stage_1',
    status: 'open',
    priority: 10,
    title: 'Nowak — 4 300,00 zł, 8 dni po terminie',
    body: 'Przygotowałem wiadomość. Przeczytaj ją i zdecyduj.',
    payload: {},
    evidence: [{ label: 'Faktura 5/2026', href: '/invoices/inv-1' }],
    fingerprint: 'abc',
    expires_at: '2026-08-26T12:00:00.000Z',
    created_at: '2026-08-24T09:02:00.000Z',
    approved_at: null,
    approved_by: null,
    executed_at: null,
    dismissed_reason: null,
    ...overrides,
  };
}

describe('wiersz → karta', () => {
  it('dobiera wariant karty na podstawie rodzaju propozycji', () => {
    expect(toProposalView(row())?.variant).toBe('preview');
    expect(toProposalView(row({ kind: 'ksef.status' }))?.variant).toBe('info');
    expect(toProposalView(row({ kind: 'invoice.batch' }))?.variant).toBe('list');
    expect(toProposalView(row({ kind: 'payment.confirm' }))?.variant).toBe(
      'choice',
    );
  });

  it('pomija wiersz o nieznanym rodzaju zamiast rysować go byle jak', () => {
    // Baza pamięta rzeczy ze starszych wersji kodu. Cisza jest dopuszczalna,
    // bełkot na ekranie nie.
    expect(toProposalView(row({ kind: 'cos.czego.nie.znamy' }))).toBeNull();
  });

  it('karta z podglądem wymusza jego otwarcie', () => {
    // Promień rażenia 4: wiadomość do kontrahenta albo dokument do KSeF.
    const view = toProposalView(row());
    expect(view?.primary.requiresPreview).toBe(true);
  });

  it('karta informacyjna nie proponuje wyciszenia rodzaju', () => {
    const view = toProposalView(row({ kind: 'ksef.status' }));
    expect(view?.secondary.map((a) => a.intent)).toEqual(['dismiss']);
  });

  it('karta z akcją daje odłożenie i wyciszenie', () => {
    const view = toProposalView(row({ kind: 'expense.review' }));
    expect(view?.secondary.map((a) => a.intent)).toEqual(['snooze', 'mute']);
  });
});

describe('wiersz → karta: bezpieczne czytanie ładunku', () => {
  it('pozycja wymagająca podglądu NIGDY nie jest zaznaczona z góry', () => {
    // Najważniejszy test w tym pliku. Pozycja odbiegająca od normy zaznaczona
    // domyślnie oznaczałaby hurtową wysyłkę faktury na złą kwotę do rejestru
    // państwowego — jedyną awarię z katalogu, której nie da się cofnąć.
    const view = toProposalView(
      row({
        kind: 'invoice.batch',
        payload: {
          items: [
            {
              id: 'a',
              label: 'Grupa Wschód',
              amount: '1 234 567,89 zł',
              preselected: true, // ładunek kłamie
              needsPreview: true, // ale pozycja jest odstająca
            },
          ],
        },
      }),
    );
    expect(view?.items?.[0]?.preselected).toBe(false);
  });

  it('odrzuca uszkodzone dowody, zamiast wywalać kartę', () => {
    const view = toProposalView(
      row({
        evidence: [
          { label: 'Dobry', href: '/ok' },
          { label: '', href: '/bez-etykiety' },
          { label: 'Bez odnośnika', href: '' },
        ] as FloProposalRow['evidence'],
      }),
    );
    expect(view?.evidence).toEqual([{ label: 'Dobry', href: '/ok' }]);
  });

  it('pomija podgląd nieznanego typu', () => {
    const view = toProposalView(
      row({ payload: { preview: { type: 'hologram' } } }),
    );
    expect(view?.preview).toBeUndefined();
  });

  it('przepuszcza podgląd znanego typu', () => {
    const view = toProposalView(
      row({
        payload: {
          preview: {
            type: 'diff',
            rows: [{ field: 'NIP', before: '525244576', after: '5252445767' }],
          },
        },
      }),
    );
    expect(view?.preview?.type).toBe('diff');
  });

  it('używa etykiety z ładunku, gdy propozycja ją narzuca', () => {
    // P-04 (podwyżka stawki) ma mieć „Pokaż treść”, nigdy „Wyślij” —
    // etykieta jest częścią bezpiecznika, nie kosmetyką.
    const view = toProposalView(
      row({ kind: 'invoice.raise', payload: { primaryLabel: 'Pokaż treść' } }),
    );
    expect(view?.primary.label).toBe('Pokaż treść');
  });

  it('karta pytająca o dane wymaga podglądu i zna rodzaj pola', () => {
    const view = toProposalView(
      row({
        kind: 'accountant.package',
        payload: {
          inputLabel: 'Adres e-mail księgowej',
          inputKind: 'email',
        },
      }),
    );
    expect(view?.primary.intent).toBe('input');
    expect(view?.primary.requiresPreview).toBe(true);
    expect(view?.primary.inputKind).toBe('email');
  });
});
