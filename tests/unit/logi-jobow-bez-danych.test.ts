import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AUD-98: logger workera wypisywał NIP i e-mail wprost (`info` skrzynki,
// wysyłki faktury, powiadomień). NIP osoby fizycznej prowadzącej firmę
// i adres e-mail to dane osobowe — w logach maskujemy je po nazwie pola.

import { createJobLogger, maskNip } from '@/lib/jobs/logger';

let out: string[];

beforeEach(() => {
  out = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((line: string) => { out.push(line); });
  }
});
afterEach(() => vi.restoreAllMocks());

describe('logger jobów', () => {
  it('maskuje NIP i e-mail w polach, także zagnieżdżonych', () => {
    const logger = createJobLogger('fixture');
    logger.info('start', {
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nip: '1234567890',
      emailTo: 'jan.kowalski@example.test',
      seller: { sellerNip: '5260001246', seller_nip: '5260001246' },
      recipients: ['anna@example.test'],
    });
    logger.error('błąd', { buyerNip: '1234567890', email: 'jan.kowalski@example.test' });
    const all = out.join('\n');
    expect(all).not.toContain('1234567890');
    expect(all).not.toContain('5260001246');
    expect(all).not.toContain('jan.kowalski@example.test');
    expect(all).not.toContain('anna@example.test');
    expect(all).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(all).toContain('*******890');
    expect(all).toContain('@example.test');
  });

  it('nie rusza innych pól ani błędów', () => {
    const logger = createJobLogger('fixture');
    logger.warn('x', { invoiceId: 'inv-1', count: 3 });
    logger.error('y', new Error('fixture failure'));
    expect(out.join('\n')).toContain('"invoiceId":"inv-1"');
    expect(out.join('\n')).toContain('fixture failure');
  });

  it('maskNip zostawia trzy ostatnie cyfry', () => {
    expect(maskNip('1234567890')).toBe('*******890');
    expect(maskNip(null)).toBe('—');
  });
});
