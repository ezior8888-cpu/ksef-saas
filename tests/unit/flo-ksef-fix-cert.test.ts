import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildCertProposal,
  certExpiryWindow,
  evaluateCert,
  shouldHoldApprovedSubmissions,
  shouldWarn,
  WARN_THRESHOLDS,
  type CertSnapshot,
} from '@/lib/flo/functions/ksef-cert';
import {
  buildKsefFixProposal,
  decideFix,
  MAX_RETRY_SUGGESTIONS,
  needsOperatorAttention,
  type RejectionContext,
} from '@/lib/flo/functions/ksef-fix';
import type { FloProposalRow } from '@/lib/flo/db-types';
import { toProposalView } from '@/lib/flo/proposals';

/**
 * X-02 tłumacz odrzuceń (krok 27) i X-03 opiekun certyfikatu (krok 28).
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

// ═══════════════════════════════════════════════════════════════
// X-02
// ═══════════════════════════════════════════════════════════════

function rejection(overrides: Partial<RejectionContext> = {}): RejectionContext {
  return {
    code: '21001',
    rawMessage: 'Invalid date format in field IssueDate',
    attempts: 1,
    candidate: {
      field: 'issue_date',
      before: '26/08/2026',
      after: '2026-08-26',
      kind: 'format',
    },
    ...overrides,
  };
}

describe('X-02 — nieznany kod', () => {
  it('AWARIA: nieznany kod NIE powoduje żadnej modyfikacji faktury', () => {
    // Wymóg z planu. Ministerstwo dokłada kody i zmienia komunikaty;
    // model poproszony o wytłumaczenie wymyśli coś sensownie brzmiącego,
    // a stawką jest zgodność z prawem.
    const verdict = decideFix(
      rejection({ code: '99999', candidate: undefined }),
    );

    expect(verdict.kind).toBe('unknown');
    if (verdict.kind === 'unknown') {
      expect(verdict.message).toContain('Nie znam tego kodu');
      expect(verdict.message).toContain('99999');
    }
  });

  it('nieznany kod idzie do operatora, nie do modelu', () => {
    const verdict = decideFix(rejection({ code: '99999', candidate: undefined }));
    expect(needsOperatorAttention(verdict)).toBe(true);
  });

  it('karta przy nieznanym kodzie nie zawiera podglądu zmian', () => {
    const proposal = buildKsefFixProposal({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
      invoiceNumber: '8/2026',
      context: rejection({ code: '99999', candidate: undefined }),
      now: NOW,
    });

    expect(proposal.payload?.preview).toBeUndefined();
    expect(proposal.payload?.fix).toBeUndefined();
    expect(proposal.payload?.needsOperator).toBe(true);
  });
});

describe('X-02 — automatyczna poprawka', () => {
  it('poprawia tylko to, co ma jedno możliwe rozwiązanie', () => {
    const verdict = decideFix(rejection());
    expect(verdict.kind).toBe('auto');
  });

  it('AWARIA: NIGDY nie rusza tożsamości podmiotu', () => {
    // „Poprawienie" NIP-u przez dobranie z rejestru firmy o podobnej nazwie
    // wystawiłoby fakturę na obcy podmiot — w rejestrze państwowym.
    const verdict = decideFix(
      rejection({
        code: '21001',
        candidate: {
          field: 'buyer_nip',
          before: '525244576',
          after: '5252445767',
          kind: 'format',
        },
      }),
    );
    expect(verdict.kind).toBe('manual');
  });

  it('kandydat niezgodny z kodem nie jest stosowany', () => {
    // Kod mówi o dacie, a poprawka dotyczy czegoś innego — nie zgadujemy.
    const verdict = decideFix(
      rejection({
        candidate: {
          field: 'buyer_country',
          before: '',
          after: 'PL',
          kind: 'country_code',
        },
      }),
    );
    expect(verdict.kind).toBe('manual');
  });

  it('karta z poprawką ZAWSZE ma podgląd różnicy', () => {
    // Zmiana w dokumencie, której klient nie zobaczył, jest zmianą zrobioną
    // za jego plecami.
    const proposal = buildKsefFixProposal({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
      invoiceNumber: '8/2026',
      context: rejection(),
      now: NOW,
    });

    const preview = proposal.payload?.preview as { type: string; rows: unknown[] };
    expect(preview.type).toBe('diff');
    expect(preview.rows).toHaveLength(1);
  });
});

describe('X-02 — pętla odrzuceń', () => {
  it('po dwóch próbach przestaje proponować wysyłkę', () => {
    const verdict = decideFix(rejection({ attempts: MAX_RETRY_SUGGESTIONS }));
    expect(verdict.kind).toBe('give_up');
  });

  it('daje gotowy opis sprawy, żeby klient nic nie tłumaczył', () => {
    const proposal = buildKsefFixProposal({
      tenantId: 'ten-1',
      invoiceId: 'inv-1',
      invoiceNumber: '8/2026',
      context: rejection({ attempts: 3, code: '21001' }),
      now: NOW,
    });

    const summary = String(proposal.payload?.supportSummary ?? '');
    expect(summary).toContain('8/2026');
    expect(summary).toContain('21001');
    expect(summary).toContain('prób: 3');
    expect(proposal.payload?.primaryLabel).toContain('Napisz');
  });
});

// ═══════════════════════════════════════════════════════════════
// X-03
// ═══════════════════════════════════════════════════════════════

function cert(overrides: Partial<CertSnapshot> = {}): CertSnapshot {
  return {
    lastAuthOk: true,
    lastAuthAt: '2026-08-26T06:00:00.000Z',
    expiresAt: '2027-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('X-03 — stan z realnej autoryzacji, nie z pola z datą', () => {
  it('AWARIA: odnowiony, ale niewgrany — ostrzeżenie ZOSTAJE', () => {
    // Klient odnowił certyfikat u wystawcy i uważa sprawę za załatwioną.
    // Data mówi „ważny jeszcze rok", ale autoryzacja nie przechodzi —
    // i to autoryzacja ma rację, bo wysyłka nie zadziała.
    const verdict = evaluateCert(
      cert({ lastAuthOk: false, expiresAt: '2027-06-01T00:00:00.000Z' }),
      NOW,
    );
    expect(verdict.state).toBe('broken');
    expect(verdict.banner).toBe(true);
  });

  it('udana autoryzacja kasuje ostrzeżenie BEZ udziału człowieka', () => {
    // Wymóg z planu: klient wgrywa nowy certyfikat i przestaje słyszeć
    // o sprawie, nie klikając niczego.
    const verdict = evaluateCert(cert({ lastAuthOk: true }), NOW);
    expect(verdict.state).toBe('working');
    expect(
      buildCertProposal({ tenantId: 'ten-1', verdict, now: NOW }),
    ).toBeNull();
  });

  it('brak certyfikatu w ogóle', () => {
    const verdict = evaluateCert(
      { lastAuthOk: null, lastAuthAt: null, expiresAt: null },
      NOW,
    );
    expect(verdict.state).toBe('missing');
  });
});

describe('X-03 — progi', () => {
  const at = (days: number) =>
    new Date(NOW.getTime() + days * 86_400_000).toISOString();

  it('odzywa się na trzech progach, nie codziennie', () => {
    // Ostrzeganie codziennie przez miesiąc uczy ignorowania.
    //
    // Do 25.09 ten test mówił „3 tak, 7 nie" — a zadanie wysyłało maile na
    // 30/14/7. Próg 3 dni nie zadziałał na produkcji ani razu. Progi są
    // teraz wyrównane do tego, co klienci faktycznie dostawali.
    expect(shouldWarn(30)).toBe(true);
    expect(shouldWarn(14)).toBe(true);
    expect(shouldWarn(7)).toBe(true);
    expect(shouldWarn(29)).toBe(false);
    expect(shouldWarn(3)).toBe(false);
    expect(WARN_THRESHOLDS).toEqual([30, 14, 7]);
  });

  it('SZEW: w oknie zadania karta powstaje na każdym progu', () => {
    // NAJWAŻNIEJSZY TEST W TYM BLOKU. Każda połowa była przetestowana
    // osobno — `shouldWarn(30)` zielone, okno zadania poprawne — a razem
    // nie dawały ani jednej karty. W oknie `[próg−1, próg]` `evaluateCert`
    // liczy `próg−1` dni, a `shouldWarn` przepuszczał tylko równe progi.
    // Ten test idzie dokładnie drogą zadania: okno → ocena → karta.
    const DAY = 86_400_000;

    for (const days of WARN_THRESHOLDS) {
      const { from, to } = certExpiryWindow(days, NOW);

      for (const pozycja of [0.01, 0.5, 0.99]) {
        const expiresAt = new Date(
          from.getTime() + pozycja * (to.getTime() - from.getTime()),
        ).toISOString();
        const verdict = evaluateCert(cert({ expiresAt }), NOW);

        expect(verdict.state, `próg ${days}, pozycja ${pozycja}`).toBe('expiring');
        expect(verdict.daysLeft).toBe(days - 1);

        const card = buildCertProposal({
          tenantId: 't',
          verdict,
          now: NOW,
          threshold: days,
        });
        expect(card, `próg ${days}, pozycja ${pozycja}`).not.toBeNull();
      }

      expect(to.getTime() - from.getTime()).toBe(DAY);
    }
  });

  it('bez progu z zadania liczy się daysLeft — jak dotąd', () => {
    // Wywołanie spoza zadania (bez `threshold`) zachowuje się po staremu:
    // 29 dni to nie próg, więc karty nie ma.
    const verdict = evaluateCert(cert({ expiresAt: at(29.5) }), NOW);

    expect(verdict.daysLeft).toBe(29);
    expect(buildCertProposal({ tenantId: 't', verdict, now: NOW })).toBeNull();
  });

  it('zadanie cert-expiry-alert idzie przez to samo okno i przekazuje próg', () => {
    // Test szwu wyżej pilnuje modułu. Ten pilnuje zadania: to w nim brakowało
    // jednej linijki — przekazania progu — i przez to karta X-03 nie powstała
    // ani razu. Zadanie trudno odpalić w teście (kolejka, baza, mail, push),
    // więc sprawdzamy tekst: własna lista progów albo własne okno znaczyłyby
    // powrót dwóch źródeł prawdy.
    const zadanie = readFileSync('lib/inngest/jobs/cert-expiry-alert.ts', 'utf8');

    expect(zadanie).toContain('const thresholds = WARN_THRESHOLDS;');
    expect(zadanie).toContain('certExpiryWindow(days, now)');
    expect(zadanie).toContain('threshold: days');
    expect(zadanie).not.toContain('[30, 14, 7]');
  });

  it('karta nigdy nie proponuje „Nigdy więcej takich” — w żadnym stanie', () => {
    // Sprawdzamy przyciski, które zobaczy KLIENT, a nie sam ładunek karty:
    // domyślne akcje dokłada `toProposalView`, więc test ładunku by ich
    // nie zobaczył. Brak certyfikatu, nieudane logowanie i wygasanie to trzy
    // sytuacje, w których wyłączenie ostrzeżenia kończy się niewysłaną fakturą.
    const stany = [
      evaluateCert({ lastAuthOk: null, lastAuthAt: null, expiresAt: null }, NOW),
      evaluateCert(cert({ lastAuthOk: false }), NOW),
      evaluateCert(cert({ expiresAt: at(13.5) }), NOW),
    ];

    for (const verdict of stany) {
      const card = buildCertProposal({ tenantId: 't', verdict, now: NOW, threshold: 14 });
      expect(card, verdict.state).not.toBeNull();

      const view = toProposalView({
        id: 'c',
        tenant_id: 't',
        kind: card!.kind,
        topic_key: card!.topicKey,
        status: 'open',
        priority: card!.priority ?? 50,
        title: card!.title,
        body: card!.body,
        payload: card!.payload ?? {},
        evidence: card!.evidence ?? [],
        fingerprint: card!.fingerprint,
        expires_at: card!.expiresAt.toISOString(),
        created_at: NOW.toISOString(),
        approved_at: null,
        approved_by: null,
        executed_at: null,
        dismissed_reason: null,
      } as FloProposalRow)!;

      expect(view.secondary.map((a) => a.intent), verdict.state).not.toContain('mute');
      expect(view.secondary, verdict.state).toEqual([{ label: 'Nie teraz', intent: 'snooze' }]);
    }
  });

  it('próg spoza listy nie otwiera karty', () => {
    // `threshold` nie jest przepustką: zadanie z wymyślonym progiem dalej
    // przechodzi przez `shouldWarn`.
    const verdict = evaluateCert(cert({ expiresAt: at(20.5) }), NOW);

    expect(
      buildCertProposal({ tenantId: 't', verdict, now: NOW, threshold: 21 }),
    ).toBeNull();
  });

  it('trwały pasek dopiero poniżej dwóch tygodni', () => {
    expect(evaluateCert(cert({ expiresAt: at(20) }), NOW).banner).toBe(false);
    expect(evaluateCert(cert({ expiresAt: at(10) }), NOW).banner).toBe(true);
  });

  it('mail i push razem TYLKO na trzy dni przed', () => {
    // Jedyny przypadek w produkcie, w którym wychodzimy poza budżet zaczepień.
    expect(evaluateCert(cert({ expiresAt: at(10) }), NOW).alarm).toBe(false);
    expect(evaluateCert(cert({ expiresAt: at(2) }), NOW).alarm).toBe(true);
  });

  it('daleki termin to nie jest sprawa', () => {
    const verdict = evaluateCert(cert({ expiresAt: at(200) }), NOW);
    expect(verdict.state).toBe('working');
  });
});

describe('X-03 — zatwierdzenia przeżywają awarię certyfikatu', () => {
  it('faktury zatwierdzone czekają, zamiast zostać odrzucone', () => {
    // Decyzja człowieka już padła. Awaria techniczna nie ma prawa jej
    // unieważnić i zmusić go do klikania wszystkiego od nowa.
    expect(
      shouldHoldApprovedSubmissions(
        evaluateCert(cert({ lastAuthOk: false }), NOW),
      ),
    ).toBe(true);

    expect(
      shouldHoldApprovedSubmissions(evaluateCert(cert(), NOW)),
    ).toBe(false);
  });

  it('karta przy awarii mówi wprost, że nic nie przepadło', () => {
    const verdict = evaluateCert(cert({ lastAuthOk: false }), NOW);
    const proposal = buildCertProposal({
      tenantId: 'ten-1',
      verdict,
      now: NOW,
    })!;

    expect(proposal.body).toContain('czekają w kolejce');
    expect(proposal.body).toContain('nic nie przepadło');
    // Nie zgadujemy powodu: „wygasł" bywa nieprawdą (odwołany, zły plik,
    // zmienione uprawnienia), a zgadywanie wyprowadza klienta na manowce.
    expect(proposal.title).not.toContain('wygasł');
  });

  it('jedna karta na całą sprawę certyfikatu', () => {
    const a = buildCertProposal({
      tenantId: 'ten-1',
      verdict: evaluateCert(cert({ expiresAt: at30() }), NOW),
      now: NOW,
    })!;
    const b = buildCertProposal({
      tenantId: 'ten-1',
      verdict: evaluateCert(cert({ lastAuthOk: false }), NOW),
      now: NOW,
    })!;
    expect(a.topicKey).toBe(b.topicKey);
  });
});

function at30(): string {
  return new Date(NOW.getTime() + 30 * 86_400_000).toISOString();
}
