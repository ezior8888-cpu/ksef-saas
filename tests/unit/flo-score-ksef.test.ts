import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { blockedKinds, isKindEnabled, kindStatus } from '@/lib/flo/flags';
import {
  buildPaymentScoreProposal,
  MIN_PAID_INVOICES,
  scorePaymentBehaviour,
  type PaidInvoiceRecord,
} from '@/lib/flo/functions/payment-score';
import {
  buildKsefStatusProposal,
  evaluateSubmission,
  isAbandoned,
  STUCK_AFTER_MS,
  UPO_ESCALATE_AFTER_MS,
  type SubmissionSnapshot,
} from '@/lib/flo/functions/ksef-status';
import { generateIdempotencyKey } from '@/lib/ksef/idempotency';

/**
 * K-03 ocena kontrahenta (krok 25) i X-01 strażnik wysyłki (krok 26).
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

// ═══════════════════════════════════════════════════════════════
// Wyłączniki
// ═══════════════════════════════════════════════════════════════

describe('wyłączniki funkcji', () => {
  it('ocena kontrahenta jest WYŁĄCZONA do czasu opinii prawnika', () => {
    expect(isKindEnabled('payment.score')).toBe(false);
    expect(kindStatus('payment.score').reason).toBe('legal');
  });

  it('cała grupa podatkowa czeka za flagą', () => {
    for (const kind of ['tax.deadline', 'tax.limit', 'tax.relief', 'tax.setaside'] as const) {
      expect(isKindEnabled(kind), kind).toBe(false);
    }
  });

  it('odsetki czekają na potwierdzenie stawek', () => {
    expect(kindStatus('payment.interest').reason).toBe('unverified_data');
  });

  it('funkcje zbudowane i bezpieczne działają', () => {
    expect(isKindEnabled('expense.review')).toBe(true);
    expect(isKindEnabled('payment.chase')).toBe(true);
    expect(isKindEnabled('ksef.status')).toBe(true);
  });

  it('każda blokada ma powód i notatkę dla człowieka', () => {
    // Lista wyłączeń, która nie mówi dlaczego, po pół roku staje się
    // listą rzeczy, których nikt nie ma odwagi włączyć.
    for (const { kind, status } of blockedKinds()) {
      expect(status.reason, kind).toBeTruthy();
      expect(status.note?.length ?? 0, kind).toBeGreaterThan(30);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// K-03
// ═══════════════════════════════════════════════════════════════

function paid(dueDate: string, paidAt: string, fromImport = false): PaidInvoiceRecord {
  return { dueDate, paidAt, fromImport };
}

describe('K-03 — ocena', () => {
  it('AWARIA: jeden wybryk nie psuje oceny — liczy mediana', () => {
    // Klient wysłał fakturę dwa tygodnie za późno, więc kontrahent zapłacił
    // po terminie nie ze swojej winy. Średnia zrobiłaby z niego dłużnika.
    const score = scorePaymentBehaviour([
      paid('2026-05-10', '2026-05-10T10:00:00Z'),
      paid('2026-06-10', '2026-06-11T10:00:00Z'),
      paid('2026-07-10', '2026-07-10T10:00:00Z'),
      paid('2026-08-10', '2026-09-25T10:00:00Z'),
    ])!;

    expect(score.medianDelayDays).toBeLessThan(3);
    expect(score.notable).toBe(false);
  });

  it('AWARIA: dane z importu NIE liczą się do oceny', () => {
    // KSeF nie zna dat zapłaty. Liczby z importu wyglądałyby wiarygodnie
    // i byłyby zmyślone — najgorszy rodzaj błędu.
    const score = scorePaymentBehaviour([
      paid('2026-05-10', '2026-06-10T10:00:00Z', true),
      paid('2026-06-10', '2026-07-10T10:00:00Z', true),
      paid('2026-07-10', '2026-08-10T10:00:00Z', true),
    ]);
    expect(score).toBeNull();
  });

  it('mniej niż trzy faktury to za mało, żeby cokolwiek mówić', () => {
    const score = scorePaymentBehaviour([
      paid('2026-06-10', '2026-06-25T10:00:00Z'),
      paid('2026-07-10', '2026-07-25T10:00:00Z'),
    ]);
    expect(score).toBeNull();
    expect(MIN_PAID_INVOICES).toBe(3);
  });

  it('opisuje, nie ocenia', () => {
    const score = scorePaymentBehaviour([
      paid('2026-05-10', '2026-05-24T10:00:00Z'),
      paid('2026-06-10', '2026-06-24T10:00:00Z'),
      paid('2026-07-10', '2026-07-24T10:00:00Z'),
    ])!;

    expect(score.description).toBe('płaci zwykle 14 dni po terminie');
    // Żadnych etykiet: to jest opis zachowania, nie wyrok na firmę.
    for (const word of ['ryzykown', 'niesolidn', 'zły', 'słaby', 'ocena']) {
      expect(score.description.toLowerCase()).not.toContain(word);
    }
  });

  it('rozpoznaje kontrahenta płacącego przed terminem', () => {
    const score = scorePaymentBehaviour([
      paid('2026-05-10', '2026-05-05T10:00:00Z'),
      paid('2026-06-10', '2026-06-05T10:00:00Z'),
      paid('2026-07-10', '2026-07-05T10:00:00Z'),
    ])!;
    expect(score.description).toContain('przed terminem');
    expect(score.notable).toBe(false);
  });

  it('nie tworzy karty, gdy nie ma o czym mówić', () => {
    const score = scorePaymentBehaviour([
      paid('2026-05-10', '2026-05-10T10:00:00Z'),
      paid('2026-06-10', '2026-06-11T10:00:00Z'),
      paid('2026-07-10', '2026-07-10T10:00:00Z'),
    ])!;

    expect(
      buildPaymentScoreProposal({
        tenantId: 'ten-1',
        contractorId: 'con-1',
        contractorName: 'Nowak',
        score,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('K-03 — ocena nie wychodzi poza kartę', () => {
  it('moduł nie eksportuje oceny do dokumentów ani maili', () => {
    // Klient pokazuje ekran na spotkaniu albo wysyła zrzut. Ocena na
    // dokumencie albo w mailu to niezręczność, której źródłem jesteśmy my.
    const source = readFileSync(
      new URL('../../lib/flo/functions/payment-score.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/payment_reminders|resend|sendJobEvent/i);
    expect(source).not.toMatch(/\.insert\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
// X-01
// ═══════════════════════════════════════════════════════════════

function snap(overrides: Partial<SubmissionSnapshot> = {}): SubmissionSnapshot {
  return {
    invoiceId: 'inv-1',
    invoiceNumber: '7/2026',
    state: 'accepted',
    hasUpo: true,
    since: '2026-08-26T11:59:00.000Z',
    attempts: 1,
    ...overrides,
  };
}

describe('X-01 — stan wysyłki', () => {
  it('„przyjęta" i „mam poświadczenie" to DWA RÓŻNE stany', () => {
    // Zlanie ich w jedno „wszystko gotowe" jest kłamstwem w sprawie,
    // w której klient ma dowód albo go nie ma.
    expect(evaluateSubmission(snap({ hasUpo: true }), NOW).kind).toBe('done');
    expect(evaluateSubmission(snap({ hasUpo: false }), NOW).kind).toBe(
      'waiting_upo',
    );
  });

  it('brak poświadczenia po dobie idzie do operatora', () => {
    const old = snap({
      hasUpo: false,
      since: new Date(NOW.getTime() - UPO_ESCALATE_AFTER_MS - 1000).toISOString(),
    });
    expect(evaluateSubmission(old, NOW).kind).toBe('upo_escalated');
  });

  it('świeża wysyłka to nie jest sprawa — agent milczy', () => {
    // Faktura w drodze od dwóch minut to normalny stan. Meldowanie o niej
    // byłoby hałasem.
    const fresh = snap({
      state: 'sending',
      hasUpo: false,
      since: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
    });
    expect(evaluateSubmission(fresh, NOW).kind).toBe('silent');
  });

  it('po piętnastu minutach agent przestaje milczeć', () => {
    const stuck = snap({
      state: 'sending',
      hasUpo: false,
      attempts: 1,
      since: new Date(NOW.getTime() - STUCK_AFTER_MS - 1000).toISOString(),
    });
    expect(evaluateSubmission(stuck, NOW).kind).toBe('stuck_retrying');
  });

  it('po drugiej próbie eskaluje', () => {
    const stuck = snap({
      state: 'queued',
      hasUpo: false,
      attempts: 2,
      since: new Date(NOW.getTime() - STUCK_AFTER_MS - 1000).toISOString(),
    });
    expect(evaluateSubmission(stuck, NOW).kind).toBe('stuck_escalated');
  });

  it('odrzucenie i kolejka offline mają własne funkcje — tu cisza', () => {
    // Dwie karty o tej samej sprawie to agent przeczący sam sobie.
    expect(evaluateSubmission(snap({ state: 'rejected' }), NOW).kind).toBe('silent');
    expect(evaluateSubmission(snap({ state: 'offline_queued' }), NOW).kind).toBe(
      'silent',
    );
  });

  it('kontrola dobowa łapie porzucone dokumenty', () => {
    const abandoned = snap({
      state: 'queued',
      since: new Date(NOW.getTime() - 25 * 3_600_000).toISOString(),
    });
    expect(isAbandoned(abandoned, NOW)).toBe(true);
    expect(isAbandoned(snap({ state: 'accepted' }), NOW)).toBe(false);
  });
});

describe('X-01 — karty', () => {
  it('karta oczekiwania NIE mówi „gotowe"', () => {
    const snapshot = snap({
      hasUpo: false,
      since: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
    });
    const proposal = buildKsefStatusProposal({
      tenantId: 'ten-1',
      snapshot,
      verdict: evaluateSubmission(snapshot, NOW),
      now: NOW,
    })!;

    expect(proposal.title).toContain('czekam na poświadczenie');
    expect(proposal.body).not.toMatch(/gotowe|zakończone/i);
  });

  it('przy nieudanej wysyłce mówi wprost, że faktura jest w archiwum', () => {
    // Bez tego zdania klient wystawia ją drugi raz i ma dwa dokumenty
    // w rejestrze państwowym.
    const snapshot = snap({
      state: 'sending',
      hasUpo: false,
      attempts: 3,
      since: new Date(NOW.getTime() - 40 * 60_000).toISOString(),
    });
    const proposal = buildKsefStatusProposal({
      tenantId: 'ten-1',
      snapshot,
      verdict: evaluateSubmission(snapshot, NOW),
      now: NOW,
    })!;

    expect(proposal.body).toContain('archiwum');
    expect(proposal.body).toContain('nie wystawiaj jej drugi raz');
  });

  it('jedna karta na fakturę, kolejne stany ją aktualizują', () => {
    // Inaczej wątek klienta zamienia się w kronikę wysyłki.
    const a = buildKsefStatusProposal({
      tenantId: 'ten-1',
      snapshot: snap({ hasUpo: false }),
      verdict: { kind: 'waiting_upo', waitingMs: 60_000 },
      now: NOW,
    })!;
    const b = buildKsefStatusProposal({
      tenantId: 'ten-1',
      snapshot: snap({ hasUpo: true }),
      verdict: { kind: 'done' },
      now: NOW,
    })!;
    expect(a.topicKey).toBe(b.topicKey);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('przy ciszy nie ma karty', () => {
    expect(
      buildKsefStatusProposal({
        tenantId: 'ten-1',
        snapshot: snap(),
        verdict: { kind: 'silent' },
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('X-01 — podwójna wysyłka', () => {
  it('klucz idempotencji jest deterministyczny', () => {
    // Pięćdziesiąt kliknięć, jedna faktura w rejestrze. Atomowe przejęcie
    // propozycji sprawdza test wykonawcy; tutaj druga warstwa — ten sam
    // input daje ten sam klucz, więc ponowienie nie duplikuje dokumentu.
    const at = new Date('2026-08-26T11:00:00.000Z');
    const keys = Array.from({ length: 50 }, () =>
      generateIdempotencyKey('ten-1', 'inv-1', at),
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('inna faktura daje inny klucz', () => {
    const at = new Date('2026-08-26T11:00:00.000Z');
    expect(generateIdempotencyKey('ten-1', 'inv-1', at)).not.toBe(
      generateIdempotencyKey('ten-1', 'inv-2', at),
    );
  });
});
