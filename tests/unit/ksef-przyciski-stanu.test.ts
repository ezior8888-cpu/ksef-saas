import { describe, expect, it } from 'vitest';

import {
  canManageKsefSend,
  decideResend,
  describeResetError,
  failedInvoiceButtons,
  KSEF_SEND_MESSAGES,
} from '@/lib/invoices/ksef-send-policy';
import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';

/**
 * Cykl życia faktury, PR 3b (K3, D2, D4): jedna tabela decyzji dla akcji
 * serwerowych i przycisków — interfejs nie pokazuje przycisku, którego
 * akcja odmówi, a `member` nie widzi „Wyślij ponownie”.
 */

/** Fakty ponowienia z kopii (A4b PR2a): dane zapisane, rodzaj niewstrzymany, dziś. */
const STORED: KsefResendFacts = { sendData: 'stored', kindHeld: false, issueDatePassed: false };
const ENV = { environmentKnown: true } as const;

const base = { direction: 'outgoing', invoiceKind: 'regular', facts: STORED, ...ENV } as const;

describe('decideResend — kto i kiedy może wysłać ponownie', () => {
  it.each([
    ['INFRA (transient)', 'INFRA'],
    ['CREDENTIALS_UNAVAILABLE (transient)', 'CREDENTIALS_UNAVAILABLE'],
    ['NO_CERTIFICATE (setup)', 'NO_CERTIFICATE'],
    ['brak kodu (historyczny)', null],
    ['kod spoza katalogu', 'COS_STAREGO'],
  ])('failed z %s → dozwolone', (_label, errorCode) => {
    expect(decideResend({ ...base, status: 'failed', errorCode })).toMatchObject({ allowed: true });
  });

  it.each([
    ['rejected (D2: tylko szkic)', 'rejected', 'KSEF_REJECTED', 'rejected'],
    ['failed terminal (strażnik dokumentu)', 'failed', 'INVALID_DOCUMENT', 'terminal'],
    ['failed reconcile (duplikat)', 'failed', 'KSEF_DUPLICATE_RECONCILE', 'reconcile'],
    ['failed hold (hamulec)', 'failed', 'KSEF_PAUSED', 'hold'],
    ['inny status', 'accepted', null, 'status'],
    ['inny status (queued)', 'queued', null, 'status'],
  ] as const)('%s → odmowa', (_label, status, errorCode, reason) => {
    expect(decideResend({ ...base, status, errorCode })).toMatchObject({ allowed: false, reason });
  });

  it('dokument specjalny i faktura przychodząca → odmowa', () => {
    expect(decideResend({ ...base, status: 'failed', errorCode: 'INFRA', invoiceKind: 'correction' }))
      .toMatchObject({ allowed: false, reason: 'special' });
    expect(decideResend({ ...base, direction: 'incoming', status: 'failed', errorCode: 'INFRA' }))
      .toMatchObject({ allowed: false, reason: 'direction' });
  });

  it('role: owner i admin tak, member i accountant nie', () => {
    expect(canManageKsefSend('owner')).toBe(true);
    expect(canManageKsefSend('admin')).toBe(true);
    expect(canManageKsefSend('member')).toBe(false);
    expect(canManageKsefSend('accountant')).toBe(false);
    expect(canManageKsefSend(null)).toBe(false);
  });
});

describe('failedInvoiceButtons — tabela stanów (sekcja 7 projektu)', () => {
  const manage = { invoiceKind: 'regular', canManage: true, facts: STORED, ...ENV };

  it('rejected → tylko „Wróć do szkicu”', () => {
    expect(failedInvoiceButtons({ ...manage, status: 'rejected', errorCode: 'KSEF_REJECTED' }))
      .toEqual({ resend: false, reset: true, settings: false, info: KSEF_SEND_MESSAGES.rejected });
  });

  it('failed transient → oba przyciski i informacja o automacie', () => {
    expect(failedInvoiceButtons({ ...manage, status: 'failed', errorCode: 'KSEF_UNAVAILABLE' }))
      .toEqual({ resend: true, reset: true, settings: false, info: KSEF_SEND_MESSAGES.transient });
  });

  it('failed setup → oba przyciski i link do ustawień KSeF', () => {
    expect(failedInvoiceButtons({ ...manage, status: 'failed', errorCode: 'NO_CERTIFICATE' }))
      .toEqual({ resend: true, reset: true, settings: true, info: KSEF_SEND_MESSAGES.setup });
  });

  it('failed hold / reconcile → bez przycisków, z wyjaśnieniem', () => {
    expect(failedInvoiceButtons({ ...manage, status: 'failed', errorCode: 'KOR_HOLD' }))
      .toEqual({ resend: false, reset: false, settings: false, info: KSEF_SEND_MESSAGES.hold });
    expect(failedInvoiceButtons({ ...manage, status: 'failed', errorCode: 'RESULT_UNCERTAIN' }))
      .toEqual({ resend: false, reset: false, settings: false, info: KSEF_SEND_MESSAGES.reconcile });
  });

  it('failed terminal (strażnik dokumentu) → tylko szkic', () => {
    expect(failedInvoiceButtons({ ...manage, status: 'failed', errorCode: 'INVALID_DOCUMENT' }))
      .toEqual({ resend: false, reset: true, settings: false, info: KSEF_SEND_MESSAGES.terminal });
  });

  it('failed bez kodu (historyczny) → oba przyciski', () => {
    expect(failedInvoiceButtons({ ...manage, status: 'failed', errorCode: null }))
      .toEqual({ resend: true, reset: true, settings: false, info: KSEF_SEND_MESSAGES.historical });
  });

  it('dokument specjalny: bez „Wyślij ponownie”, zostaje szkic', () => {
    expect(failedInvoiceButtons({ ...manage, status: 'failed', errorCode: 'INFRA', invoiceKind: 'correction' }))
      .toEqual({ resend: false, reset: true, settings: false, info: KSEF_SEND_MESSAGES.special });
  });

  it('member nie widzi przycisków, dostaje prośbę o właściciela', () => {
    const plan = failedInvoiceButtons({ ...manage, status: 'failed', errorCode: 'INFRA', canManage: false });
    expect(plan).toMatchObject({ resend: false, reset: false });
    expect(plan?.info).toContain(KSEF_SEND_MESSAGES.askManager);
  });

  it('stany bez błędu → null', () => {
    for (const status of ['draft', 'queued', 'sending', 'accepted', 'offline_queued']) {
      expect(failedInvoiceButtons({ ...manage, status, errorCode: null })).toBeNull();
    }
  });
});

describe('describeResetError', () => {
  it('P0001 niesie komunikat RPC, P0002 brak faktury, reszta ogólny', () => {
    expect(describeResetError({ code: 'P0001', message: 'Faktura mogła dotrzeć do KSeF — wymaga uzgodnienia, nie powrotu do szkicu' }))
      .toBe('Faktura mogła dotrzeć do KSeF — wymaga uzgodnienia, nie powrotu do szkicu');
    expect(describeResetError({ code: 'P0002', message: 'x' })).toBe(KSEF_SEND_MESSAGES.notFound);
    expect(describeResetError({ code: '08006', message: 'connection' })).toBe(KSEF_SEND_MESSAGES.resetFailed);
  });
});
