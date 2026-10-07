import { describe, expect, it } from 'vitest';

import { countByCode, NO_CODE_FILTER, summarizeViolations } from '@/lib/admin/ksef-lifecycle';
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
