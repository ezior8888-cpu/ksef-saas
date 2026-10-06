import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { operatorInvoiceButtons } from '@/lib/admin/ksef-operator-policy';
import { failedInvoiceButtons, KSEF_SEND_MESSAGES } from '@/lib/invoices/ksef-send-policy';
import {
  compareDuplicate,
  FAKTFLOW_SYSTEM_INFO,
  hexHashToBase64,
  numberTakenMessage,
  summarizeInvoiceXml,
} from '@/lib/ksef/duplicate-verdict';

/**
 * D-A4-1: werdykt przy cudzym 440 — czysty moduł. Kierunek bezpieczny prawnie:
 * „numer zajęty” tylko dla oryginału spoza FaktFlow; zgodność z wcześniejszą
 * próbą liczy się tylko przy tej samej treści co teraz.
 */

const xml = (o: { systemInfo?: string; date?: string; gross?: string; ns?: string } = {}) => {
  const p = o.ns ? `${o.ns}:` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><${p}Faktura><${p}Naglowek><${p}DataWytworzeniaFa>${o.date ?? '2026-10-01T10:00:00Z'}</${p}DataWytworzeniaFa>` +
    `${o.systemInfo === undefined ? `<${p}SystemInfo>${FAKTFLOW_SYSTEM_INFO}</${p}SystemInfo>` : o.systemInfo ? `<${p}SystemInfo>${o.systemInfo}</${p}SystemInfo>` : ''}</${p}Naglowek>` +
    `<${p}Podmiot2><${p}DaneIdentyfikacyjne><${p}NIP>5252241585</${p}NIP><${p}Nazwa>Klient</${p}Nazwa></${p}DaneIdentyfikacyjne></${p}Podmiot2>` +
    `<${p}Fa><${p}KodWaluty>PLN</${p}KodWaluty><${p}P_1>2026-10-01</${p}P_1><${p}P_2>FV 2026/10/001</${p}P_2><${p}P_15>${o.gross ?? '123.00'}</${p}P_15></${p}Fa></${p}Faktura>`;
};
const b64 = (s: string) => createHash('sha256').update(s).digest('base64');

describe('compareDuplicate', () => {
  it('bieżący plik bajt w bajt → identical', () => {
    const ours = xml();
    expect(compareDuplicate({ originalBytes: Buffer.from(ours), currentHashBase64: b64(ours), earlierHashesBase64: [], ourXml: ours }))
      .toMatchObject({ verdict: 'identical', matchedHash: b64(ours) });
  });

  it('wcześniejsza próba z tą samą treścią (inna data wytworzenia) → identical', () => {
    const earlier = xml({ date: '2026-09-01T08:00:00Z' });
    const current = xml();
    expect(compareDuplicate({ originalBytes: Buffer.from(earlier), currentHashBase64: b64(current), earlierHashesBase64: [b64(earlier)], ourXml: current }))
      .toMatchObject({ verdict: 'identical', matchedHash: b64(earlier) });
  });

  it('wcześniejsza próba o innej treści (po powrocie do szkicu) → operator, nie identical', () => {
    const earlier = xml({ gross: '150.00' });
    const current = xml();
    expect(compareDuplicate({ originalBytes: Buffer.from(earlier), currentHashBase64: b64(current), earlierHashesBase64: [b64(earlier)], ourXml: current }))
      .toMatchObject({ verdict: 'operator', reason: 'faktflow-original' });
  });

  it('wcześniejsza próba zgodna skrótem, ale bez bieżącego pliku do porównania → operator', () => {
    const earlier = xml({ date: '2026-09-01T08:00:00Z' });
    expect(compareDuplicate({ originalBytes: Buffer.from(earlier), currentHashBase64: 'inny', earlierHashesBase64: [b64(earlier)], ourXml: null }).verdict)
      .toBe('operator');
  });

  it('oryginał z FaktFlow, inna data wytworzenia, bez skrótu w historii → operator z informacją „treść zgodna”', () => {
    const cmp = compareDuplicate({ originalBytes: Buffer.from(xml({ date: '2026-08-01T00:00:00Z' })), currentHashBase64: b64(xml()), earlierHashesBase64: [], ourXml: xml() });
    expect(cmp).toMatchObject({ verdict: 'operator', reason: 'faktflow-original', sameContentExceptHeader: true });
  });

  it('inny program, ale ta sama treść co nasza (tylko nagłówek inny) → operator (ta sama sprzedaż), nie „numer zajęty”', () => {
    const cmp = compareDuplicate({ originalBytes: Buffer.from(xml({ systemInfo: 'Inny Program 2.0', date: '2026-08-01T00:00:00Z' })), currentHashBase64: b64(xml()), earlierHashesBase64: [], ourXml: xml() });
    expect(cmp).toMatchObject({ verdict: 'operator', reason: 'same-content-other-program' });
  });

  it.each([
    ['inny SystemInfo', xml({ systemInfo: 'Inny Program 2.0', gross: '999.99' })],
    ['bez SystemInfo', xml({ systemInfo: '', gross: '999.99' })],
    ['prefiks przestrzeni nazw', xml({ systemInfo: 'Inny', ns: 'tns', gross: '999.99' })],
  ])('oryginał spoza FaktFlow o innej treści (%s) → foreign', (_l, original) => {
    expect(compareDuplicate({ originalBytes: Buffer.from(original), currentHashBase64: b64(xml()), earlierHashesBase64: [], ourXml: xml() }).verdict)
      .toBe('foreign');
  });
});

describe('dane oryginału i komunikat „numer zajęty”', () => {
  it('summarizeInvoiceXml czyta P_1, P_2, P_15, walutę i nabywcę (także z prefiksem)', () => {
    expect(summarizeInvoiceXml(xml({ systemInfo: 'Inny', ns: 'tns', gross: '999.99' }))).toEqual({
      systemInfo: 'Inny', number: 'FV 2026/10/001', issueDate: '2026-10-01',
      buyerNip: '5252241585', buyerName: 'Klient', gross: '999.99', currency: 'PLN',
    });
  });

  it('komunikat podaje numer KSeF, dane oryginału i obie drogi (ta sama sprzedaż / inna)', () => {
    const msg = numberTakenMessage('FV 2026/10/001', 'K-OBCA', summarizeInvoiceXml(xml({ systemInfo: 'Inny Program', gross: '999.99' })));
    expect(msg).toContain('K-OBCA');
    expect(msg).toContain('999.99 PLN');
    expect(msg).toContain('Klient, NIP 5252241585');
    expect(msg).toContain('„Inny Program”');
    expect(msg).toContain('nie wystawiaj jej ponownie');
    expect(msg).toContain('usuń go i wystaw fakturę z nowym numerem');
  });

  it('hexHashToBase64: tylko 64 znaki hex', () => {
    expect(hexHashToBase64('a'.repeat(64))).toBe(Buffer.from('a'.repeat(64), 'hex').toString('base64'));
    expect(hexHashToBase64('abc')).toBeNull();
    expect(hexHashToBase64(null)).toBeNull();
  });
});

describe('strażnik: każdy generator FaktFlow podpisuje plik tym samym SystemInfo', () => {
  it.each([
    'lib/xml/fa3-generator.ts',
    'lib/ksef/fa3-correction-generator.ts',
    'lib/ksef/fa3-advance-generator.ts',
  ])('%s', (file) => {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(source).toContain(`DEFAULT_SYSTEM_INFO = '${FAKTFLOW_SYSTEM_INFO}'`);
  });
});

describe('KSEF_NUMBER_TAKEN — wyjście dla klienta i operatora', () => {
  it('klient: „Wróć do szkicu” (bez „Wyślij ponownie”) i zdanie z obiema drogami', () => {
    expect(failedInvoiceButtons({ status: 'failed', errorCode: 'KSEF_NUMBER_TAKEN', invoiceKind: 'regular', canManage: true }))
      .toEqual({ resend: false, reset: true, settings: false, info: KSEF_SEND_MESSAGES.numberTaken });
  });

  it('operator: szkic dostępny (wpisy number_taken nie są dowodem), ponowienie nie', () => {
    const b = operatorInvoiceButtons({
      direction: 'outgoing', status: 'failed', errorCode: 'KSEF_NUMBER_TAKEN', invoiceKind: 'regular', openSent: false, evidence: false,
    });
    expect(b.requeue.enabled).toBe(false);
    expect(b.reset.enabled).toBe(true);
  });
});
