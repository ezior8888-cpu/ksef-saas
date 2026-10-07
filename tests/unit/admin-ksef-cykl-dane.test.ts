import { describe, expect, it } from 'vitest';

import {
  clientDecisionRows,
  countByCode,
  INVARIANT_LABELS,
  NO_CODE_FILTER,
  splitClientDecisionPending,
  summarizeViolations,
} from '@/lib/admin/ksef-lifecycle';
import {
  hasOpenSubmission,
  OPERATOR_MESSAGES,
  operatorInvoiceButtons,
  operatorIssueDateMessage,
  operatorKindHeldMessage,
  operatorLegacyDataMessage,
  operatorReconcileButton,
  operatorRequeueButton,
} from '@/lib/admin/ksef-operator-policy';
import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';

import {
  decisionFacts,
  DUP_K,
  DUP_KNOWN_ID,
  DUP_KNOWN_NUMBER,
  DUP_NR,
  DUP_PROGRAM,
  DUP_SHA,
  knownNumberCheck,
  knownNumberFacts,
  validCheck,
  type DuplicateFactsShape,
} from './helpers/ksef-duplicate-decision-cases';

/**
 * Panel operatora `/admin/ksef` (PR 3c cyklu życia): zliczenia bez GROUP BY
 * i tabela decyzji przycisków operatora — te same reguły co RPC z 00131.
 */

describe('zliczenia panelu', () => {
  it('summarizeViolations: per inwariant, posortowane, z etykietą', () => {
    expect(summarizeViolations([{ invariant: 'I4' }, { invariant: 'I1' }, { invariant: 'I4' }])).toEqual([
      { invariant: 'I1', label: expect.stringContaining('queued'), count: 1 },
      { invariant: 'I4', label: expect.stringContaining('failed'), count: 2 },
    ]);
    expect(summarizeViolations([])).toEqual([]);
  });

  it('countByCode: failed/rejected per kod, brak kodu osobno, klasa z katalogu, sort po liczbie', () => {
    const counts = countByCode([
      { last_error_code: 'INFRA', ksef_status: 'failed' },
      { last_error_code: 'INFRA', ksef_status: 'failed' },
      { last_error_code: 'KSEF_REJECTED', ksef_status: 'rejected' },
      { last_error_code: null, ksef_status: 'failed' },
      { last_error_code: 'COS_STAREGO', ksef_status: 'failed' },
    ]);
    expect(counts[0]).toEqual({ code: 'INFRA', errorClass: 'transient', failed: 2, rejected: 0, total: 2 });
    expect(counts).toContainEqual({ code: 'KSEF_REJECTED', errorClass: 'terminal', failed: 0, rejected: 1, total: 1 });
    expect(counts).toContainEqual({ code: NO_CODE_FILTER, errorClass: null, failed: 1, rejected: 0, total: 1 });
    expect(counts).toContainEqual({ code: 'COS_STAREGO', errorClass: null, failed: 1, rejected: 0, total: 1 });
  });
});

/** Fakty ponowienia (A4b PR2a): dane zapisane, rodzaj niewstrzymany, data wystawienia dzisiejsza. */
const STORED: KsefResendFacts = { sendData: 'stored', kindHeld: false, issueDatePassed: false };

describe('operatorInvoiceButtons — tabela decyzji operatora', () => {
  const base = { direction: 'outgoing', invoiceKind: 'regular', openSent: false, evidence: false, facts: STORED, environmentKnown: true };

  it('failed INFRA bez dowodu: wyślij ponownie i szkic tak, uzgodnij nie (brak wpisu sent)', () => {
    const b = operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'INFRA' });
    expect(b.requeue.enabled).toBe(true);
    expect(b.reconcile).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.noOpenSent });
    expect(b.reset.enabled).toBe(true);
  });

  it('failed po hamulcu: operator może ponowić (to on zdejmuje hamulec)', () => {
    expect(operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'KSEF_PAUSED' }).requeue.enabled).toBe(true);
  });

  it('klasa reconcile z otwartym wpisem sent: cudzy duplikat — tylko „Tylko uzgodnij”', () => {
    const b = operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'KSEF_DUPLICATE_RECONCILE', openSent: true, evidence: true });
    expect(b.requeue).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.duplicateRequeue });
    expect(b.reconcile.enabled).toBe(true);
    expect(b.reset).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.evidence });
  });

  it('A4: RESULT_UNCERTAIN — także „Wyślij ponownie” (runner uzgadnia najpierw, 440 chroni przed duplikatem)', () => {
    const b = operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'RESULT_UNCERTAIN', openSent: true, evidence: true });
    expect(b.requeue).toEqual({ enabled: true, reason: null });
    expect(b.reconcile.enabled).toBe(true);
    expect(b.reset).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.evidence });
  });

  it('rejected: nigdy „wyślij ponownie”; uzgodnij tylko z wpisem sent; szkic tylko bez dowodu', () => {
    const noEvidence = operatorInvoiceButtons({ ...base, status: 'rejected', errorCode: 'KSEF_REJECTED' });
    expect(noEvidence.requeue).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.rejectedToDraft });
    expect(noEvidence.reconcile.enabled).toBe(false);
    expect(noEvidence.reset.enabled).toBe(true);
    const withSent = operatorInvoiceButtons({ ...base, status: 'rejected', errorCode: null, openSent: true, evidence: true });
    expect(withSent.reconcile.enabled).toBe(true);
    expect(withSent.reset.enabled).toBe(false);
  });

  it('błąd treści (terminal) w failed: tylko szkic', () => {
    const b = operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'INVALID_DOCUMENT' });
    expect(b.requeue).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.terminal });
    expect(b.reset.enabled).toBe(true);
  });

  it('A4b PR2a: korekta po KOR_HOLD z zapisanymi danymi, rodzaj niewstrzymany (TEST) — „Wyślij ponownie” dostępne', () => {
    const b = operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'KOR_HOLD', invoiceKind: 'correction' });
    expect(b.requeue).toEqual({ enabled: true, reason: null });
    expect(b.reset.enabled).toBe(true);
  });

  it('A4b PR2a: korekta INFRA, rodzaj wstrzymany w tym środowisku (KOR na PROD) — ponowienie i uzgodnienie z powodem hamulca, szkic tak', () => {
    const b = operatorInvoiceButtons({
      ...base, status: 'failed', errorCode: 'INFRA', invoiceKind: 'correction', openSent: true,
      facts: { ...STORED, kindHeld: true },
    });
    expect(b.requeue.enabled).toBe(false);
    expect(b.reconcile.enabled).toBe(false);
    expect(b.requeue.reason).toBe(operatorKindHeldMessage('correction'));
    expect(b.reconcile.reason).toBe(operatorKindHeldMessage('correction'));
    expect(b.reset.enabled).toBe(true);
  });

  it('A4b PR2a: stara korekta bez danych do ponowienia — oba przyciski z procedurą „Stary dokument specjalny”', () => {
    const b = operatorInvoiceButtons({
      ...base, status: 'failed', errorCode: 'INFRA', invoiceKind: 'correction', openSent: true,
      facts: { ...STORED, sendData: 'missing' },
    });
    expect(b.requeue.enabled).toBe(false);
    expect(b.reconcile.enabled).toBe(false);
    expect(b.requeue.reason).toBe(operatorLegacyDataMessage('correction'));
    expect(b.reconcile.reason).toBe(operatorLegacyDataMessage('correction'));
  });

  it('A4b PR2a: ZAL KSEF_UNAVAILABLE z datą wystawienia sprzed dzisiaj — bez pełnej wysyłki (decyzja b), „Tylko uzgodnij” przy otwartym wpisie tak', () => {
    const b = operatorInvoiceButtons({
      ...base, status: 'failed', errorCode: 'KSEF_UNAVAILABLE', invoiceKind: 'advance', openSent: true, evidence: true,
      facts: { ...STORED, issueDatePassed: true },
    });
    expect(b.reconcile).toEqual({ enabled: true, reason: null });
    expect(b.requeue.enabled).toBe(false);
    expect(b.requeue.reason).toBe(operatorIssueDateMessage('advance'));
  });

  it('A4b PR2a: failed ZAL z otwartym wpisem — uzgodnienie tylko z zapisanymi danymi i niewstrzymanym rodzajem', () => {
    const zal = { ...base, status: 'failed', errorCode: 'RESULT_UNCERTAIN', invoiceKind: 'advance', openSent: true, evidence: true };
    expect(operatorInvoiceButtons(zal).reconcile).toEqual({ enabled: true, reason: null });
    expect(operatorInvoiceButtons({ ...zal, facts: { ...STORED, kindHeld: true } }).reconcile.enabled).toBe(false);
    expect(operatorInvoiceButtons({ ...zal, facts: { ...STORED, sendData: 'missing' } }).reconcile).toEqual({
      enabled: false, reason: operatorLegacyDataMessage('advance'),
    });
  });

  it('A4b PR2a: KSEF_ENV aplikacji nieznane — ponowienie i uzgodnienie odmówione, także dla zwykłej faktury', () => {
    for (const invoiceKind of ['regular', 'advance', 'correction']) {
      const b = operatorInvoiceButtons({
        ...base, status: 'failed', errorCode: 'INFRA', invoiceKind, openSent: true, evidence: true, environmentKnown: false,
      });
      expect(b.requeue, invoiceKind).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.envUnknown });
      expect(b.reconcile, invoiceKind).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.envUnknown });
    }
    expect(OPERATOR_MESSAGES).toHaveProperty('envUnknown');
  });

  it('A4b PR2a: zwykła faktura bez pozycji z otwartym wpisem — „Tylko uzgodnij” wyłączony jak akcja (incomplete)', () => {
    const b = operatorInvoiceButtons({
      ...base, status: 'failed', errorCode: 'RESULT_UNCERTAIN', openSent: true, evidence: true,
      facts: { ...STORED, sendData: 'missing' },
    });
    expect(b.reconcile).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.incomplete });
    expect(b.requeue).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.incomplete });
  });

  it('strażnik: ISSUE_DATE_PASSED (ZAL z danymi) — ponowienie z powodem kodu bez podpowiedzi „Tylko uzgodnij”; szkic bez dowodu tak', () => {
    const b = operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'ISSUE_DATE_PASSED', invoiceKind: 'advance' });
    expect(b.requeue).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.issueDatePassedRequeue });
    expect(b.requeue.reason).not.toMatch(/Tylko uzgodnij/);
    expect(b.reset).toEqual({ enabled: true, reason: null });
  });

  it('przychodząca albo accepted: wszystko wyłączone', () => {
    for (const input of [
      { ...base, direction: 'incoming', status: 'failed', errorCode: 'INFRA' },
      { ...base, status: 'accepted', errorCode: null },
      { ...base, status: 'queued', errorCode: null },
    ]) {
      const b = operatorInvoiceButtons(input);
      expect([b.requeue.enabled, b.reconcile.enabled, b.reset.enabled]).toEqual([false, false, false]);
    }
  });
});

describe('A4b PR2a: przyciski „Wyślij ponownie” i „Tylko uzgodnij” osobno (wspólne z akcją operatora)', () => {
  const input = {
    direction: 'outgoing', status: 'failed', errorCode: 'INFRA', invoiceKind: 'advance', openSent: true, facts: STORED, environmentKnown: true,
  };

  it('„Tylko uzgodnij”: kolejność odmów — kierunek, stan, środowisko, dane, rodzaj, otwarty wpis; bez daty i klasy kodu', () => {
    expect(operatorReconcileButton({ ...input, direction: 'incoming' })).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.incoming });
    expect(operatorReconcileButton({ ...input, status: 'draft', environmentKnown: false }))
      .toEqual({ enabled: false, reason: OPERATOR_MESSAGES.notFailedOrRejected });
    expect(operatorReconcileButton({ ...input, environmentKnown: false, facts: { ...STORED, sendData: 'missing' } }))
      .toEqual({ enabled: false, reason: OPERATOR_MESSAGES.envUnknown });
    expect(operatorReconcileButton({ ...input, facts: { sendData: 'missing', kindHeld: true, issueDatePassed: true } }))
      .toEqual({ enabled: false, reason: operatorLegacyDataMessage('advance') });
    expect(operatorReconcileButton({ ...input, invoiceKind: 'final', facts: { ...STORED, kindHeld: true } }))
      .toEqual({ enabled: false, reason: operatorKindHeldMessage('final') });
    expect(operatorReconcileButton({ ...input, openSent: false })).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.noOpenSent });
    expect(operatorReconcileButton({ ...input, status: 'rejected', facts: { ...STORED, issueDatePassed: true } }))
      .toEqual({ enabled: true, reason: null });
  });

  it('„Wyślij ponownie”: klasa kodu przed faktami; środowisko → dane → rodzaj → data (tylko dokument specjalny)', () => {
    expect(operatorRequeueButton({ ...input, errorCode: 'XSD_INVALID', environmentKnown: false }))
      .toEqual({ enabled: false, reason: OPERATOR_MESSAGES.terminal });
    expect(operatorRequeueButton({ ...input, environmentKnown: false, facts: { sendData: 'missing', kindHeld: true, issueDatePassed: true } }))
      .toEqual({ enabled: false, reason: OPERATOR_MESSAGES.envUnknown });
    expect(operatorRequeueButton({ ...input, facts: { sendData: 'missing', kindHeld: true, issueDatePassed: true } }))
      .toEqual({ enabled: false, reason: operatorLegacyDataMessage('advance') });
    expect(operatorRequeueButton({ ...input, invoiceKind: 'correction', facts: { ...STORED, kindHeld: true, issueDatePassed: true } }))
      .toEqual({ enabled: false, reason: operatorKindHeldMessage('correction') });
    expect(operatorRequeueButton({ ...input, facts: { ...STORED, issueDatePassed: true } }))
      .toEqual({ enabled: false, reason: operatorIssueDateMessage('advance') });
    expect(operatorRequeueButton({ ...input, invoiceKind: 'regular', facts: { ...STORED, issueDatePassed: true } }))
      .toEqual({ enabled: true, reason: null });
    expect(operatorRequeueButton(input)).toEqual({ enabled: true, reason: null });
  });

  it('teksty: każdy mówi, co zrobić; nieznany rodzaj — tekst ogólny', () => {
    expect(operatorKindHeldMessage('correction')).toMatch(/KOR_HOLD/);
    expect(operatorKindHeldMessage('final')).toMatch(/ROZ_HOLD_RECONCILE/);
    expect(operatorKindHeldMessage('advance')).toBe(OPERATOR_MESSAGES.envUnknown);
    expect(operatorLegacyDataMessage('correction')).toMatch(/special_data/);
    expect(operatorLegacyDataMessage('final')).toMatch(/special_data/);
    expect(operatorLegacyDataMessage('advance')).toMatch(/advanceEnvelope/);
    expect(operatorLegacyDataMessage('regular')).toBe(OPERATOR_MESSAGES.incomplete);
    expect(operatorIssueDateMessage('advance')).toMatch(/^Zaliczka \(ZAL\) z datą wystawienia sprzed dzisiaj/);
    expect(operatorIssueDateMessage('correction')).toMatch(/^Korekta \(KOR\)/);
    for (const text of [
      operatorKindHeldMessage('correction'), operatorKindHeldMessage('final'),
      operatorLegacyDataMessage('correction'), operatorLegacyDataMessage('final'), operatorLegacyDataMessage('advance'),
      operatorIssueDateMessage('advance'),
    ]) {
      expect(text).toMatch(/Wróć do szkicu/);
    }
    // ISSUE_DATE_PASSED powstaje bez otwartego wpisu — tekst kodu nie podpowiada uzgodnienia.
    expect(OPERATOR_MESSAGES.issueDatePassedRequeue).not.toMatch(/Tylko uzgodnij/);
    expect(OPERATOR_MESSAGES.issueDatePassedRequeue).toMatch(/nie ma czego uzgadniać/);
  });
});

describe('hasOpenSubmission (A2): czy „Tylko uzgodnij” ma co uzgadniać', () => {
  it('sent i zamiar intent — tak; zamknięte (accepted, rejected, duplicate, abandoned) — nie', () => {
    expect(hasOpenSubmission([{ status: 'sent' }])).toBe(true);
    expect(hasOpenSubmission([{ status: 'abandoned' }, { status: 'intent' }])).toBe(true);
    expect(hasOpenSubmission([
      { status: 'accepted' }, { status: 'rejected' }, { status: 'duplicate' }, { status: 'abandoned' }, { status: null },
    ])).toBe(false);
  });
});

/**
 * D-A4-1b-3 PR B: decyzja klienta zapisywana przez operatora („Zapisz decyzję
 * klienta”) i przypomnienie („Przypomnij klientowi”, najwyżej raz na 24 h —
 * decyzja 12). Do PR B operator przy nierozstrzygniętym 440 ma tylko „Tylko
 * uzgodnij”, który powtarza ten sam deterministyczny werdykt.
 */
const NOW = new Date('2026-10-07T12:00:00.000Z');
const DECIDE_NOT_PENDING = 'Faktura nie czeka na decyzję klienta (stan albo kod inny niż failed / KSEF_DUPLICATE_RECONCILE).';
const DUPLICATE_REQUEUE_PR_B =
  'KSeF ma już fakturę o tym numerze — ponowienie powtórzy 440. Powody no-own-file i known-number z danymi oryginału: decyzja klienta („Zapisz decyzję klienta” po rozmowie z klientem, „Przypomnij klientowi”). Pobranie oryginału nieudane (download-*, storage-pending, archive-pending), known-number bez danych albo known-stale: „Tylko uzgodnij” przy otwartym wpisie. faktflow-original, same-content-other-program, archive-conflict: runbook KSEF_DUPLICATE_RECONCILE.';

/** Widok „do decyzji” (2.2.1) — tak, jak go oddaje `duplicateDecisionOptions` dla operatora. */
function decidable(reason: 'no-own-file' | 'known-number') {
  return {
    kind: 'decidable' as const,
    reason,
    invoiceNumber: DUP_NR,
    originalKsefNumber: DUP_K,
    originalSha256: DUP_SHA,
    comparison: [
      { label: 'Numer faktury', ksef: DUP_NR, ours: DUP_NR, same: true },
      { label: 'Data wystawienia', ksef: '2026-10-01', ours: '2026-10-01', same: true },
      { label: 'Nabywca', ksef: 'Nabywca Testowy Sp. z o.o.', ours: 'Nabywca Testowy Sp. z o.o.', same: true },
      { label: 'NIP nabywcy', ksef: '1234567890', ours: '1234567890', same: true },
      { label: 'Kwota brutto', ksef: '1230.00 PLN', ours: '1230.00 PLN', same: true },
      { label: 'Program', ksef: DUP_PROGRAM, ours: 'FaktFlow', same: null },
    ],
    sameContent: reason === 'known-number' ? false : null,
    needsConfirmation: { same_sale: false, other_sale: true },
    program: DUP_PROGRAM,
    knownInvoice: reason === 'known-number' ? { id: DUP_KNOWN_ID, internalNumber: DUP_KNOWN_NUMBER } : null,
    heldCorrections: false,
  };
}

describe('D-A4-1b-3 PR B: „Zapisz decyzję klienta” i „Przypomnij klientowi” (operator)', () => {
  const pending = {
    direction: 'outgoing', invoiceKind: 'regular', openSent: true, evidence: true, facts: STORED, environmentKnown: true,
    status: 'failed', errorCode: 'KSEF_DUPLICATE_RECONCILE', now: NOW,
  };

  it.each(['no-own-file', 'known-number'] as const)('U14a: %s z danymi oryginału — „Zapisz decyzję klienta” i „Przypomnij klientowi” dostępne; ponowienie nadal nie (nowy tekst)', (reason) => {
    const b = operatorInvoiceButtons({ ...pending, duplicateDecision: decidable(reason), duplicateNotice: null });
    expect(b.decide).toEqual({ enabled: true, reason: null });
    expect(b.remind).toEqual({ enabled: true, reason: null });
    expect(b.requeue).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.duplicateRequeue });
    expect(OPERATOR_MESSAGES.duplicateRequeue).toBe(DUPLICATE_REQUEUE_PR_B);
  });

  it('U14b: bez widoku decyzji (inny stan, inny kod, brak danych) — oba przyciski wyłączone z powodem notPending', () => {
    for (const input of [
      { ...pending },
      { ...pending, duplicateDecision: null },
      { ...pending, errorCode: 'RESULT_UNCERTAIN', duplicateDecision: null },
      { ...pending, status: 'draft', errorCode: null, openSent: false, evidence: false },
    ]) {
      const b = operatorInvoiceButtons(input);
      expect(b.decide).toEqual({ enabled: false, reason: DECIDE_NOT_PENDING });
      expect(b.remind).toEqual({ enabled: false, reason: DECIDE_NOT_PENDING });
    }
  });

  it('U14c (decyzja 12): przypomnienie najwyżej raz na 24 h — wcześniej wyłączone z datą ostatniego powiadomienia', () => {
    const at = (iso: string | null, count = 1) => operatorInvoiceButtons({
      ...pending, duplicateDecision: decidable('no-own-file'), duplicateNotice: { count, lastAt: iso },
    });
    const tooSoon = at('2026-10-07T00:00:00.000Z');
    expect(tooSoon.decide).toEqual({ enabled: true, reason: null });
    expect(tooSoon.remind.enabled).toBe(false);
    expect(tooSoon.remind.reason).toMatch(/^Ostatnie powiadomienie: .+ — przypomnienie najwcześniej 24 h później\.$/);
    expect(at('2026-10-06T12:00:01.000Z').remind.enabled).toBe(false);
    expect(at('2026-10-06T12:00:00.000Z').remind).toEqual({ enabled: true, reason: null });
    expect(at('2026-10-05T09:00:00.000Z', 3).remind).toEqual({ enabled: true, reason: null });
    // Faktura sprzed PR B, nigdy niepowiadomiona — pierwsze powiadomienie z przycisku.
    expect(at(null, 0).remind).toEqual({ enabled: true, reason: null });
  });

  it('U14d: I5D osobno od naruszeń — etykieta, podział i wiersze z `detail` (środowisko zgodne albo nie)', () => {
    expect(summarizeViolations([{ invariant: 'I5D' }, { invariant: 'I5D' }])).toEqual([
      { invariant: 'I5D', label: INVARIANT_LABELS.I5D, count: 2 },
    ]);
    expect(INVARIANT_LABELS.I5D).toBe(
      'czeka na decyzję klienta: nierozstrzygnięty 440 z danymi oryginału (no-own-file, known-number) — bez automatu i bez alarmu; klient dostał e-mail',
    );
    const row = (invariant: string, invoiceId: string, detail: Record<string, unknown> = {}) => ({
      invariant, label: INVARIANT_LABELS[invariant] ?? invariant, invoiceId, tenantId: 't-1', tenantName: 'Firma Testowa',
      internalNumber: `FV/${invoiceId}`, ksefStatus: 'failed', detail,
    });
    const i5dTest = row('I5D', 'a', { original_ksef_number: DUP_K, reason: 'no-own-file', env: 'test', attempted_at: '2026-10-01T10:00:00.000Z' });
    const i5dProd = row('I5D', 'b', { original_ksef_number: DUP_K, reason: 'known-number', env: 'production', attempted_at: '2026-10-02T10:00:00.000Z' });
    const rows = [row('I1', 'c'), i5dTest, row('I5', 'd'), i5dProd];

    const split = splitClientDecisionPending(rows);
    expect(split.violations.map((r: { invariant: string }) => r.invariant)).toEqual(['I1', 'I5']);
    expect(split.clientPending).toEqual([i5dTest, i5dProd]);
    expect(summarizeViolations(split.violations).map((v) => v.invariant)).toEqual(['I1', 'I5']);

    expect(clientDecisionRows(split.clientPending, 'test')).toEqual([
      { invoiceId: 'a', tenantName: 'Firma Testowa', internalNumber: 'FV/a', originalKsefNumber: DUP_K, reason: 'no-own-file', env: 'test', envMatches: true, attemptedAt: '2026-10-01T10:00:00.000Z' },
      { invoiceId: 'b', tenantName: 'Firma Testowa', internalNumber: 'FV/b', originalKsefNumber: DUP_K, reason: 'known-number', env: 'production', envMatches: false, attemptedAt: '2026-10-02T10:00:00.000Z' },
    ]);
    // KSEF_ENV nieznane — żadne środowisko się nie zgadza (I5D-env).
    expect(clientDecisionRows([i5dTest], null).map((r: { envMatches: boolean }) => r.envMatches)).toEqual([false]);
  });
});

describe('D-A4-1b-3 PR B: powody wyłączenia z prawdziwej polityki (duplicateDecisionOptions, operator)', () => {
  async function operatorView(facts: DuplicateFactsShape, environment: 'test' | 'production' = 'test') {
    const { duplicateDecisionOptions } = await import('@/lib/ksef/duplicate-decision');
    return duplicateDecisionOptions({ facts, actor: 'operator', canManage: false, environment, now: NOW });
  }
  const buttonsFor = async (facts: DuplicateFactsShape, environment: 'test' | 'production' = 'test') => operatorInvoiceButtons({
    direction: 'outgoing', invoiceKind: facts.invoice.invoice_kind, openSent: true, evidence: true, facts: STORED, environmentKnown: true,
    status: 'failed', errorCode: 'KSEF_DUPLICATE_RECONCILE', now: NOW,
    duplicateDecision: await operatorView(facts, environment), duplicateNotice: null,
  });

  it('U14a: no-own-file i known-number (Y z K, przyjęta) — oba przyciski dostępne', async () => {
    for (const facts of [decisionFacts(), knownNumberFacts(true)]) {
      const b = await buttonsFor(facts);
      expect(b.decide).toEqual({ enabled: true, reason: null });
      expect(b.remind).toEqual({ enabled: true, reason: null });
    }
  });

  it('U14b: wpłaty, inne środowisko, korekta, known-stale (oba warianty Y), inny powód — wyłączone z powodem dla operatora', async () => {
    const payments = await buttonsFor(decisionFacts({ invoice: { paid_amount: 100 } }));
    expect(payments.decide.enabled).toBe(false);
    expect(payments.decide.reason).toMatch(
      /^Wpłaty na fakturze \(paid_amount 100(\.00)?\) — decyzja zablokowana \(decyzja Bartosza 07\.10\.2026 \(A\)\); wpłaty zmieniamy tylko za zgodą Bartosza \(runbook, decyzja \(6\)\)\.$/,
    );
    expect(payments.remind).toEqual(payments.decide);

    const env = await buttonsFor(decisionFacts({ check: validCheck({ env: 'production' }) }), 'test');
    expect(env.decide).toEqual({
      enabled: false,
      reason: 'original_check.env „production” ≠ KSEF_ENV „test” — nie zapisuj decyzji (runbook: przełączenie środowiska; alarm I5D-env).',
    });

    const kor = await buttonsFor(decisionFacts({ invoice: { invoice_kind: 'correction' } }));
    expect(kor.decide).toEqual({ enabled: false, reason: 'kind: runbook KSEF_DUPLICATE_RECONCILE — sprawdź w KSeF i zgłoś Bartoszowi.' });
    expect(kor.remind).toEqual(kor.decide);

    const staleText = `known-stale: dokument ${DUP_KNOWN_NUMBER} nie ma już numeru KSeF ${DUP_K} albo nie jest przyjęty w KSeF — „Tylko uzgodnij” powtórzy werdykt; dokument ${DUP_KNOWN_NUMBER} w stanie failed z numerem KSeF to I9 — najpierw I9.`;
    // Y nie trzyma już K albo nie jest przyjęta (holdsOriginal false) i Y nieodczytana (null).
    for (const facts of [knownNumberFacts(false), decisionFacts({ check: knownNumberCheck(), knownInvoice: null })]) {
      const b = await buttonsFor(facts);
      expect(b.decide).toEqual({ enabled: false, reason: staleText });
    }

    const other = await buttonsFor(decisionFacts({ check: validCheck({ reason: 'faktflow-original' }) }));
    expect(other.decide).toEqual({
      enabled: false,
      reason: 'Powód faktflow-original: decyzji klienta w panelu jeszcze nie ma (faktflow-original — PR C; same-content-other-program — D-A4-1b-2; archive-conflict — runbook; download-*/storage-pending/archive-pending i known-number bez danych — „Tylko uzgodnij”; ownHistory — runbook).',
    });
  });
});
