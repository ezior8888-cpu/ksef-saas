import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloThread } from '@/components/flo/thread';
import { FLO_FIXTURES } from '@/lib/flo/fixtures';
import type { FloProposalView } from '@/types/flo';

/**
 * Wątek `/flo` (krok 4 toru B).
 *
 * Pilnujemy układu z makiety (nagłówki dni, godzina przy każdej pozycji)
 * i jednej zasady produktowej, którą łatwo złamać przy pierwszym przeglądzie
 * treści: stan pusty nie namawia do niczego.
 */

function proposal(over: Partial<FloProposalView> = {}): FloProposalView {
  return {
    id: 'p1',
    kind: 'ksef.status',
    variant: 'info',
    title: 'Faktura 7/2026 przyjęta przez KSeF',
    body: 'UPO w archiwum.',
    evidence: [],
    primary: { label: 'Pokaż fakturę', intent: 'open' },
    secondary: [],
    expiresAt: '2026-08-30T12:00:00.000Z',
    priority: 10,
    createdAt: '2026-08-24T06:34:00.000Z',
    ...over,
  };
}

const now = new Date('2026-08-24T10:00:00.000Z');

describe('FloThread — wątek agenta', () => {
  it('dzieli karty na dni i podpisuje je jak w makiecie', () => {
    const html = renderToStaticMarkup(
      <FloThread
        proposals={[
          proposal({ id: 'a', createdAt: '2026-08-23T12:31:00.000Z' }),
          proposal({ id: 'b' }),
        ]}
        now={now}
      />,
    );

    expect(html).toContain('WCZORAJ');
    expect(html).toContain('DZIŚ');
    expect(html.indexOf('WCZORAJ')).toBeLessThan(html.indexOf('DZIŚ'));
  });

  it('godzina stoi przy pozycji dokładnie raz — w osi, nie w karcie', () => {
    const html = renderToStaticMarkup(
      <FloThread proposals={[proposal()]} now={now} />,
    );

    // 06:34 UTC = 08:34 w Warszawie
    expect(html.split('08:34')).toHaveLength(2);
  });

  it('renderuje komplet atrap bez wywrotki', () => {
    const html = renderToStaticMarkup(
      <FloThread proposals={FLO_FIXTURES} now={now} />,
    );

    for (const fixture of FLO_FIXTURES) {
      expect(html).toContain(fixture.title.slice(0, 40));
    }
  });

  it('pusty wątek mówi jedno spokojne zdanie i do niczego nie namawia', () => {
    const html = renderToStaticMarkup(<FloThread proposals={[]} now={now} />);

    expect(html).toContain('Nic nie wymaga Twojej decyzji');
    // Cisza jest dobrą wiadomością — stan pusty nie jest miejscem na zachętę
    // „skonfiguruj coś”, bo klient miałby wrażenie, że czegoś zaniedbał.
    expect(html).not.toMatch(/skonfiguruj|ustaw |dodaj |zacznij|uzupełnij/i);
  });
});
