import { describe, expect, it } from 'vitest';

import { countByCode, NO_CODE_FILTER, summarizeViolations } from '@/lib/admin/ksef-lifecycle';
import { hasOpenSubmission, OPERATOR_MESSAGES, operatorInvoiceButtons } from '@/lib/admin/ksef-operator-policy';

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

describe('operatorInvoiceButtons — tabela decyzji operatora', () => {
  const base = { direction: 'outgoing', invoiceKind: 'regular', openSent: false, evidence: false };

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

  it('dokument specjalny: bez ponowienia i uzgodnienia, szkic tak', () => {
    const b = operatorInvoiceButtons({ ...base, status: 'failed', errorCode: 'INFRA', invoiceKind: 'correction', openSent: true });
    expect(b.requeue).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.special });
    expect(b.reconcile).toEqual({ enabled: false, reason: OPERATOR_MESSAGES.special });
    expect(b.reset.enabled).toBe(true);
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

describe('hasOpenSubmission (A2): czy „Tylko uzgodnij” ma co uzgadniać', () => {
  it('sent i zamiar intent — tak; zamknięte (accepted, rejected, duplicate, abandoned) — nie', () => {
    expect(hasOpenSubmission([{ status: 'sent' }])).toBe(true);
    expect(hasOpenSubmission([{ status: 'abandoned' }, { status: 'intent' }])).toBe(true);
    expect(hasOpenSubmission([
      { status: 'accepted' }, { status: 'rejected' }, { status: 'duplicate' }, { status: 'abandoned' }, { status: null },
    ])).toBe(false);
  });
});
