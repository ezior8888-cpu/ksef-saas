import { describe, expect, it } from 'vitest';

import {
  buildAuditProposal,
  findAuditIssues,
  isAutoRepairable,
  MAX_AUDIT_ITEMS,
  type AuditInput,
} from '@/lib/flo/functions/ksef-audit';
import {
  buildDeadlineProposal,
  buildOutageProposal,
  evaluateDeadline,
  evaluateOutage,
  FAILURES_BEFORE_OFFLINE,
  shouldReturnOnline,
  shouldSwitchOffline,
  type OutageSignals,
} from '@/lib/flo/functions/ksef-outage';

/**
 * X-04 awaria Ministerstwa (krok 29) i X-05 audyt porządku (krok 30).
 */

const NOW = new Date('2026-08-26T12:00:00.000Z'); // środa

// ═══════════════════════════════════════════════════════════════
// X-04
// ═══════════════════════════════════════════════════════════════

function signals(overrides: Partial<OutageSignals> = {}): OutageSignals {
  return {
    monitorSaysDown: false,
    lastSubmitStatus: 200,
    consecutiveFailures: 0,
    ourWorkerHealthy: true,
    ...overrides,
  };
}

describe('X-04 — kto jest winny', () => {
  it('AWARIA Z PLANU: padnięty NASZ worker nie generuje komunikatu o MF', () => {
    // Padnięty worker wygląda z zewnątrz identycznie jak awaria Ministerstwa:
    // wysyłki nie przechodzą, monitor milczy. Różnica jest taka, że w jednym
    // przypadku winni jesteśmy my — a spokój oparty na kłamstwie kończy się
    // utratą zaufania do wszystkiego, co agent mówi.
    const verdict = evaluateOutage(
      signals({
        ourWorkerHealthy: false,
        monitorSaysDown: true,
        lastSubmitStatus: 503,
        consecutiveFailures: 9,
      }),
    );
    expect(verdict.kind).toBe('our_problem');
  });

  it('własna awaria NIE tworzy karty dla klienta', () => {
    // To jest sprawa dla operatora. Klient dowie się z komunikatu
    // o utkniętej wysyłce, który mówi prawdę bez wskazywania winnego.
    expect(
      buildOutageProposal({
        tenantId: 'ten-1',
        verdict: { kind: 'our_problem' },
        queuedCount: 4,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('awarię MF wolno ogłosić dopiero przy DWÓCH źródłach', () => {
    const oneSource = evaluateOutage(
      signals({ monitorSaysDown: true, lastSubmitStatus: null }),
    );
    expect(oneSource.kind).toBe('unknown_problem');

    const twoSources = evaluateOutage(
      signals({ monitorSaysDown: true, lastSubmitStatus: 503 }),
    );
    expect(twoSources.kind).toBe('ministry_outage');
  });

  it('przy jednym źródle mówimy, co widzimy, bez wskazywania winnego', () => {
    const proposal = buildOutageProposal({
      tenantId: 'ten-1',
      verdict: { kind: 'unknown_problem' },
      queuedCount: 3,
      now: NOW,
    })!;

    expect(proposal.title).toContain('nie przechodzi');
    expect(proposal.body).not.toMatch(/ministerstw|awari[ai] KSeF/i);
    expect(proposal.body).toContain('nic nie przepadło');
  });

  it('potwierdzona awaria mówi wprost, że to nie wina klienta', () => {
    const proposal = buildOutageProposal({
      tenantId: 'ten-1',
      verdict: { kind: 'ministry_outage' },
      queuedCount: 5,
      now: NOW,
    })!;
    expect(proposal.title).toContain('nie Twoja wina');
    expect(proposal.body).toContain('automatycznie');
  });

  it('wszystko działa — cisza', () => {
    expect(evaluateOutage(signals()).kind).toBe('ok');
    expect(
      buildOutageProposal({
        tenantId: 'ten-1',
        verdict: { kind: 'ok' },
        queuedCount: 0,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe('X-04 — przełączanie w tryb offline', () => {
  it('wymaga serii niepowodzeń I potwierdzenia z dwóch źródeł', () => {
    // Fałszywe przełączenie kosztuje klienta rygor terminów i kody QR przy
    // fakturach, których nikt nie potrzebował.
    expect(
      shouldSwitchOffline(
        signals({
          monitorSaysDown: true,
          lastSubmitStatus: 503,
          consecutiveFailures: FAILURES_BEFORE_OFFLINE - 1,
        }),
      ),
    ).toBe(false);

    expect(
      shouldSwitchOffline(
        signals({
          monitorSaysDown: true,
          lastSubmitStatus: 503,
          consecutiveFailures: FAILURES_BEFORE_OFFLINE,
        }),
      ),
    ).toBe(true);
  });

  it('nasza awaria NIE przełącza w offline', () => {
    expect(
      shouldSwitchOffline(
        signals({
          ourWorkerHealthy: false,
          monitorSaysDown: true,
          lastSubmitStatus: 503,
          consecutiveFailures: 10,
        }),
      ),
    ).toBe(false);
  });

  it('powrót po PIERWSZYM sukcesie, bez czekania na serię', () => {
    expect(shouldReturnOnline(true)).toBe(true);
    expect(shouldReturnOnline(false)).toBe(false);
  });
});

describe('X-04 — termin trybu offline', () => {
  it('alarmuje sześć godzin przed terminem', () => {
    const deadline = new Date(NOW.getTime() + 5 * 3_600_000);
    expect(evaluateDeadline(deadline, NOW).kind).toBe('approaching');
  });

  it('TERMIN W WEEKEND ostrzega z wyprzedzeniem, nie w sobotę rano', () => {
    // Klient nie zagląda do aplikacji w weekend. Sześć godzin przed sobotnim
    // terminem to ostrzeżenie, którego nikt nie zobaczy — a po terminie
    // zostaje przekroczony obowiązek ustawowy z powodu narzędzia, które
    // miało przed tym chronić.
    const friday = new Date('2026-08-28T14:00:00.000Z');
    const saturdayDeadline = new Date('2026-08-29T23:59:00.000Z');

    const alert = evaluateDeadline(saturdayDeadline, friday);
    expect(alert.kind).toBe('weekend_early');
  });

  it('daleki termin to nie jest sprawa', () => {
    const deadline = new Date(NOW.getTime() + 40 * 3_600_000);
    expect(evaluateDeadline(deadline, NOW).kind).toBe('none');
  });

  it('karta terminu wychodzi poza budżet zaczepień', () => {
    // Jeden z czterech przypadków alarmowych w całym produkcie.
    const proposal = buildDeadlineProposal({
      tenantId: 'ten-1',
      alert: { kind: 'approaching', hoursLeft: 5 },
      invoiceCount: 3,
      now: NOW,
    })!;
    expect(proposal.payload?.alarm).toBe(true);
    expect(proposal.priority).toBeLessThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════
// X-05
// ═══════════════════════════════════════════════════════════════

function auditInput(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    firstOwnInvoiceDate: '2026-06-01',
    invoices: [],
    contractors: [],
    expenses: [],
    ...overrides,
  };
}

describe('X-05 — luki w numeracji', () => {
  it('AWARIA Z PLANU: dokumenty z importu NIE generują fałszywych luk', () => {
    // Klient fakturował wcześniej w innym programie: własna numeracja,
    // własne anulowania. Zgłaszanie tam „luk" każe mu tłumaczyć się z niczego.
    const issues = findAuditIssues(
      auditInput({
        invoices: [
          { id: 'a', number: '1/2025', ownNumbering: false, issueDate: '2025-01-10', status: 'accepted', hasUpo: true },
          { id: 'b', number: '9/2025', ownNumbering: false, issueDate: '2025-03-10', status: 'accepted', hasUpo: true },
          { id: 'c', number: '48/2025', ownNumbering: false, issueDate: '2025-06-10', status: 'accepted', hasUpo: true },
        ],
      }),
    );
    expect(issues.filter((i) => i.kind === 'numbering_gap')).toHaveLength(0);
  });

  it('luka w NASZEJ numeracji jest zgłaszana', () => {
    const issues = findAuditIssues(
      auditInput({
        invoices: [
          { id: 'a', number: '1/2026', ownNumbering: true, issueDate: '2026-06-10', status: 'accepted', hasUpo: true },
          { id: 'b', number: '4/2026', ownNumbering: true, issueDate: '2026-07-10', status: 'accepted', hasUpo: true },
        ],
      }),
    );
    const gaps = issues.filter((i) => i.kind === 'numbering_gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.label).toContain('1/2026');
    expect(gaps[0]!.label).toContain('4/2026');
  });

  it('ciągła numeracja nie zgłasza niczego', () => {
    const issues = findAuditIssues(
      auditInput({
        invoices: [
          { id: 'a', number: 'FV/1/2026', ownNumbering: true, issueDate: '2026-06-10', status: 'accepted', hasUpo: true },
          { id: 'b', number: 'FV/2/2026', ownNumbering: true, issueDate: '2026-07-10', status: 'accepted', hasUpo: true },
        ],
      }),
    );
    expect(issues.filter((i) => i.kind === 'numbering_gap')).toHaveLength(0);
  });
});

describe('X-05 — sprawy zastane', () => {
  it('dokumenty sprzed założenia konta są oznaczone osobno', () => {
    // To historia klienta, którą nam przyniósł, a nie zaniedbanie wobec nas.
    const issues = findAuditIssues(
      auditInput({
        firstOwnInvoiceDate: '2026-06-01',
        invoices: [
          { id: 'stary', number: '3/2025', ownNumbering: false, issueDate: '2025-03-10', status: 'accepted', hasUpo: false },
          { id: 'nowy', number: '2/2026', ownNumbering: true, issueDate: '2026-07-10', status: 'accepted', hasUpo: false },
        ],
      }),
    );

    expect(issues.find((i) => i.entityId === 'stary')!.legacy).toBe(true);
    expect(issues.find((i) => i.entityId === 'nowy')!.legacy).toBe(false);
  });

  it('bieżące sprawy idą przed zastanymi', () => {
    const issues = findAuditIssues(
      auditInput({
        invoices: [
          { id: 'stary', number: '3/2025', ownNumbering: false, issueDate: '2025-03-10', status: 'accepted', hasUpo: false },
          { id: 'nowy', number: '2/2026', ownNumbering: true, issueDate: '2026-07-10', status: 'accepted', hasUpo: false },
        ],
      }),
    );
    expect(issues[0]!.entityId).toBe('nowy');
  });

  it('karta mówi wprost, że to nie zaniedbanie', () => {
    const issues = findAuditIssues(
      auditInput({
        invoices: [
          { id: 'stary', number: '3/2025', ownNumbering: false, issueDate: '2025-03-10', status: 'accepted', hasUpo: false },
        ],
      }),
    );
    const proposal = buildAuditProposal({
      tenantId: 'ten-1',
      issues,
      periodKey: '2026-08',
      now: NOW,
    })!;
    expect(proposal.body).toContain('nie zaniedbanie');
  });
});

describe('X-05 — karta', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `c${i}`,
    name: `Firma ${i}`,
    nip: null,
  }));

  it('pokazuje najwyżej pięć pozycji', () => {
    // Lista czterdziestu siedmiu problemów to paraliż, nie audyt.
    const issues = findAuditIssues(auditInput({ contractors: many }));
    const proposal = buildAuditProposal({
      tenantId: 'ten-1',
      issues,
      periodKey: '2026-08',
      now: NOW,
    })!;

    expect((proposal.payload?.items as unknown[]).length).toBe(MAX_AUDIT_ITEMS);
    expect(proposal.payload?.hiddenCount).toBe(issues.length - MAX_AUDIT_ITEMS);
  });

  it('NIC nie jest zaznaczone z góry', () => {
    // Hurtowa naprawa dokumentów o wartości dowodowej to nie jest rzecz
    // do zrobienia w ciemno. Każda pozycja to osobna decyzja.
    const issues = findAuditIssues(auditInput({ contractors: many }));
    const proposal = buildAuditProposal({
      tenantId: 'ten-1',
      issues,
      periodKey: '2026-08',
      now: NOW,
    })!;

    for (const item of proposal.payload?.items as Array<{ preselected: boolean }>) {
      expect(item.preselected).toBe(false);
    }
  });

  it('brak spraw to brak karty', () => {
    expect(
      buildAuditProposal({
        tenantId: 'ten-1',
        issues: [],
        periodKey: '2026-08',
        now: NOW,
      }),
    ).toBeNull();
  });

  it('brak poświadczenia jest najpilniejszy', () => {
    const issues = findAuditIssues(
      auditInput({
        contractors: [{ id: 'c1', name: 'Firma', nip: null }],
        invoices: [
          { id: 'i1', number: '2/2026', ownNumbering: true, issueDate: '2026-07-10', status: 'accepted', hasUpo: false },
        ],
      }),
    );
    expect(issues[0]!.kind).toBe('missing_upo');
  });
});

describe('X-05 — naprawy', () => {
  it('automatycznie naprawiamy WYŁĄCZNIE metadane', () => {
    // Nigdy treści faktury, kwot ani stron transakcji — tam każda zmiana
    // jest zmianą dokumentu o wartości dowodowej.
    const issues = findAuditIssues(
      auditInput({
        contractors: [{ id: 'c1', name: 'Firma', nip: null }],
        invoices: [
          { id: 'i1', number: '2/2026', ownNumbering: true, issueDate: '2026-07-10', status: 'accepted', hasUpo: false },
        ],
        expenses: [
          { id: 'e1', label: 'Koszt', hasDocument: false, issueDate: '2026-07-10' },
        ],
      }),
    );

    expect(isAutoRepairable(issues.find((i) => i.kind === 'missing_upo')!)).toBe(true);
    expect(
      isAutoRepairable(issues.find((i) => i.kind === 'contractor_without_nip')!),
    ).toBe(true);
    // Kosztu bez dokumentu nie da się „naprawić" — dokument musi wgrać człowiek.
    expect(
      isAutoRepairable(issues.find((i) => i.kind === 'expense_without_document')!),
    ).toBe(false);
  });
});
