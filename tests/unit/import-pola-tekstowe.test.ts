import { describe, expect, it } from 'vitest';

import { parseFa3Xml } from '@/lib/import/fa3-parser';
import { parseJpkFaXml } from '@/lib/import/jpk-fa-parser';

/**
 * F-079 (audyt bloku 1): parsery importu (FA(3) z KSeF i plik JPK_FA) miały
 * `parseTagValue: true`, więc fast-xml-parser zamieniał na liczby wszystko,
 * co liczbę przypomina. Numer rachunku z 26 cyfr wracał jako
 * „1.2345678901234568e+25” (i tak trafiał na PDF zaimportowanej faktury),
 * numer faktury „000123” jako „123”, a „1e3” jako „1000”. Kwoty dalej mają
 * być liczbami.
 */

const NRB = '12345678901234567890123456';

const fa3 = (numer: string, pkwiu = '62.10') => `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Podmiot1><DaneIdentyfikacyjne><NIP>5260001246</NIP><Nazwa>Sprzedawca</Nazwa></DaneIdentyfikacyjne><Adres><KodKraju>PL</KodKraju><AdresL1>ul. Testowa 1</AdresL1><AdresL2>00-001 Warszawa</AdresL2></Adres></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>7740001454</NIP><Nazwa>Nabywca</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-15</P_1>
    <P_2>${numer}</P_2>
    <P_13_1>1000.00</P_13_1>
    <P_14_1>230.00</P_14_1>
    <P_15>1230.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><PKWiU>${pkwiu}</PKWiU><P_7>Usługa</P_7><P_8A>szt.</P_8A><P_8B>2</P_8B><P_9A>500.00</P_9A><P_11>1000.00</P_11><P_12>23</P_12></FaWiersz>
    <Platnosc><FormaPlatnosci>6</FormaPlatnosci><RachunekBankowy><NrRB>${NRB}</NrRB></RachunekBankowy></Platnosc>
  </Fa>
</Faktura>`;

const jpk = (numer: string) => `<?xml version="1.0" encoding="UTF-8"?>
<JPK>
  <Naglowek><KodFormularza>JPK_FA</KodFormularza><WariantFormularza>4</WariantFormularza><DataOd>2026-09-01</DataOd><DataDo>2026-09-30</DataDo></Naglowek>
  <Podmiot1><IdentyfikatorPodmiotu><NIP>5260001246</NIP><PelnaNazwa>Sprzedawca</PelnaNazwa></IdentyfikatorPodmiotu></Podmiot1>
  <Faktura>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-15</P_1>
    <P_2A>${numer}</P_2A>
    <P_5B>7740001454</P_5B>
    <P_3A>Nabywca</P_3A>
    <P_13_1>1000.00</P_13_1>
    <P_14_1>230.00</P_14_1>
    <P_15>1230.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
  </Faktura>
  <FakturaWiersz><P_2B>${numer}</P_2B><P_7>Usługa</P_7><P_8A>szt.</P_8A><P_8B>1</P_8B><P_9A>1000</P_9A><P_11>1000.00</P_11><P_12>23</P_12></FakturaWiersz>
</JPK>`;

describe('import FA(3) — pola tekstowe bez zmian (F-079)', () => {
  it('numer rachunku z 26 cyfr zostaje numerem, nie liczbą wykładniczą', () => {
    expect(parseFa3Xml(fa3('FV/1/2026')).bankAccount).toBe(NRB);
  });

  it.each(['000123', '1e3', '0012.50', 'FV/1/2026'])('numer faktury „%s” bez zmian', (numer) => {
    expect(parseFa3Xml(fa3(numer)).invoiceNumber).toBe(numer);
  });

  it('kwoty i ilości nadal są liczbami', () => {
    const r = parseFa3Xml(fa3('FV/1/2026'));
    expect(r.totals).toMatchObject({ netTotal: 1000, vatTotal: 230, grossTotal: 1230 });
    expect(r.lines[0]).toMatchObject({ quantity: 2, unitPriceNet: 500, netAmount: 1000, vatRate: '23' });
  });

  it('NIP-y stron jako tekst', () => {
    const r = parseFa3Xml(fa3('FV/1/2026'));
    expect(r.seller.nip).toBe('5260001246');
    expect(r.buyer.nip).toBe('7740001454');
  });
});

describe('import JPK_FA — numer faktury bez zmian (F-079)', () => {
  it.each(['000123', '1e3', 'FV/2/2026'])('numer „%s” i jego pozycje', (numer) => {
    const r = parseJpkFaXml(jpk(numer));
    expect(r.invoices.map((i) => i.invoiceNumber)).toEqual([numer]);
    expect(r.invoices[0]!.lines).toHaveLength(1);
    expect(r.invoices[0]!.totals).toMatchObject({ grossTotal: 1230 });
  });
});
