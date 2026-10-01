import { describe, expect, it } from 'vitest';

import { parseFa3Xml } from '@/lib/import/fa3-parser';
import { parseJpkFaXml } from '@/lib/import/jpk-fa-parser';

/**
 * Import faktur (Magiczny Import z KSeF — FA(3), import pliku JPK_FA) czytał
 * kwoty faktury w walucie obcej jak złote: 1 000 EUR wchodziło jako 1 000 zł
 * przychodu w KPiR. Aplikacja trzyma tylko złote, przeliczenie wymaga kursu
 * NBP — parser odmawia z powodem.
 */

const fa3 = (waluta?: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Podmiot1><DaneIdentyfikacyjne><NIP>5260001246</NIP><Nazwa>Sprzedawca</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>7740001454</NIP><Nazwa>Nabywca</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    ${waluta === undefined ? '' : `<KodWaluty>${waluta}</KodWaluty>`}
    <P_1>2026-09-15</P_1>
    <P_2>FV/1/2026</P_2>
    <P_13_1>1000.00</P_13_1>
    <P_14_1>230.00</P_14_1>
    <P_15>1230.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Usługa</P_7><P_8A>szt.</P_8A><P_8B>1</P_8B><P_9A>1000</P_9A><P_11>1000.00</P_11><P_12>23</P_12></FaWiersz>
  </Fa>
</Faktura>`;

const jpkFaktura = (nr: string, waluta: string) => `
  <Faktura>
    <KodWaluty>${waluta}</KodWaluty>
    <P_1>2026-09-15</P_1>
    <P_2A>${nr}</P_2A>
    <P_5B>7740001454</P_5B>
    <P_3A>Nabywca</P_3A>
    <P_13_1>1000.00</P_13_1>
    <P_14_1>230.00</P_14_1>
    <P_15>1230.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
  </Faktura>
  <FakturaWiersz><P_2B>${nr}</P_2B><P_7>Usługa</P_7><P_8A>szt.</P_8A><P_8B>1</P_8B><P_9A>1000</P_9A><P_11>1000.00</P_11><P_12>23</P_12></FakturaWiersz>`;

const jpk = (...faktury: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<JPK>
  <Naglowek><KodFormularza>JPK_FA</KodFormularza><WariantFormularza>4</WariantFormularza><DataOd>2026-09-01</DataOd><DataDo>2026-09-30</DataDo></Naglowek>
  <Podmiot1><IdentyfikatorPodmiotu><NIP>5260001246</NIP><PelnaNazwa>Sprzedawca</PelnaNazwa></IdentyfikatorPodmiotu></Podmiot1>
  ${faktury.join('\n')}
</JPK>`;

describe('import FA(3): tylko złote', () => {
  it.each(['EUR', 'usd'])('faktura w %s — odmowa z powodem, bez kwot jak w złotych', (waluta) => {
    expect(() => parseFa3Xml(fa3(waluta))).toThrow(`faktura w walucie ${waluta.toUpperCase()}`);
  });

  it.each([['PLN'], ['pln'], [undefined]])('waluta %s — import jak dotąd', (waluta) => {
    const r = parseFa3Xml(fa3(waluta));
    expect(r.invoiceNumber).toBe('FV/1/2026');
    expect(r.totals).toMatchObject({ netTotal: 1000, grossTotal: 1230 });
  });
});

describe('import JPK_FA: faktura w walucie obcej pominięta z ostrzeżeniem', () => {
  it('jedna w EUR, jedna w PLN — importujemy tylko złotówkową, użytkownik widzi powód', () => {
    const r = parseJpkFaXml(jpk(jpkFaktura('FV/1/2026', 'EUR'), jpkFaktura('FV/2/2026', 'PLN')));
    expect(r.invoices.map((i) => i.invoiceNumber)).toEqual(['FV/2/2026']);
    expect(r.warnings.join('\n')).toContain('Pominięto fakturę FV/1/2026: faktura w walucie EUR');
  });
});
