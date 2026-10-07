// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * F-094 (audyt bloku 1): szczegóły faktury na ekranie.
 *  - Strona pobierała `payment_data`, ale go nie pokazywała: po otwarciu
 *    faktury nie było widać terminu, formy płatności ani rachunku.
 *  - Ilość i cena przez `toFixed(2)`: 100,1234 jako „100.12” — inaczej niż
 *    PDF i XML (F-069), z kropką zamiast przecinka.
 *  - Nabywca z numerem VAT UE bez identyfikatora; czas przyjęcia w KSeF jako
 *    surowy znacznik ISO w UTC (część F-091).
 *
 * A4b PR2b: fakty ponowienia z kopii (`ksef_resend_facts`) i znajomość
 * środowiska KSeF liczy strona na serwerze; widok przekazuje je przyciskom
 * z props (po `router.refresh()` nowe), a status i kod błędu z Realtime.
 * Znaczek „Błąd — ponawiamy” tylko wtedy, gdy automat naprawdę ponowi
 * fakturę (`automaticResendExpected`, decyzja Bartosza 07.10.2026) — do PR2b
 * mówił tak przy każdym kodzie klasy transient.
 */

const realtime = vi.hoisted(() => ({ handlers: [] as Array<(payload: { new: Record<string, unknown> }) => void> }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const ch = {
      on: (_e: unknown, _f: unknown, cb: (payload: { new: Record<string, unknown> }) => void) => { realtime.handlers.push(cb); return ch; },
      subscribe: () => ch,
    };
    return { channel: () => ch, removeChannel: vi.fn() };
  },
}));
// Pasek akcji: zapisujemy props, żeby sprawdzić, co widok przekazuje przyciskom po błędzie.
const actions = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock('@/components/invoices/invoice-actions', () => ({
  InvoiceActions: (props: Record<string, unknown>) => {
    actions.props.push(props);
    return null;
  },
}));
vi.mock('@/components/invoices/upo-download', () => ({ UpoDownload: () => null }));
// Karta błędu: tekst błędu w znaczniku — D-A4-1b-3 PR B ukrywa ją obok panelu duplikatu.
vi.mock('@/components/invoices/error-display', () => ({
  InvoiceErrorDisplay: ({ errorMessage }: { errorMessage: string }) => <div data-testid="karta-bledu">{errorMessage}</div>,
}));
// Panel decyzji (D-A4-1b-3 PR B): prawdziwy komponent importuje akcje serwerowe — zapisujemy props.
const decisionPanel = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock('@/components/invoices/ksef-duplicate-decision', () => ({
  KsefDuplicateDecision: (props: Record<string, unknown>) => {
    decisionPanel.props.push(props);
    return <div data-testid="panel-decyzji">panel decyzji</div>;
  },
}));

import { renderToStaticMarkup } from 'react-dom/server';

import { InvoiceDetailView, type InvoiceDetailInitial } from '@/components/invoices/invoice-detail-view';
import { StatusBadge } from '@/components/invoices/status-badge';
import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import { describeDuplicateOriginal } from '@/lib/ksef/duplicate-check';

/** Kopia danych zapisana, rodzaj niewstrzymany, dziś dzień wystawienia (A4b PR2b). */
const STORED: KsefResendFacts = { sendData: 'stored', kindHeld: false, issueDatePassed: false };
/** Brak kopii danych (dokument sprzed 00137 / sprzed koperty ZAL, zwykła bez fa3_data). */
const MISSING: KsefResendFacts = { sendData: 'missing', kindHeld: false, issueDatePassed: false };
/** Data wystawienia dokumentu specjalnego sprzed dzisiaj (decyzja b, 00147). */
const PASSED: KsefResendFacts = { sendData: 'stored', kindHeld: false, issueDatePassed: true };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** Pola PR B (2.5) — przez rozwinięcie, żeby fixture kompilował się także przed zmianą typu. */
const NO_DUPLICATE_DECISION = { ksef_duplicate_decision: null, ksef_retired_draft: null };

const base: InvoiceDetailInitial = {
  ...NO_DUPLICATE_DECISION,
  id: 'inv-1',
  internal_number: 'FV/7/10/2026',
  invoice_type: 'VAT',
  invoice_kind: 'regular',
  issue_date: '2026-10-02',
  sale_date: '2026-10-02',
  ksef_status: 'accepted',
  ksef_number: '5260001246-20261002-0100A0B0C0D0-E1',
  ksef_accepted_at: '2026-10-02T05:12:33.123+00:00',
  xml_storage_path: null,
  net_total: '18000.19',
  vat_total: '4140.04',
  gross_total: '22140.23',
  notes: null,
  last_error: null,
  last_error_code: null,
  last_error_field: null,
  last_error_suggestion: null,
  seller_data: { nip: '5260001246', name: 'Moja Firma', address: { addressLine1: 'ul. A 1', addressLine2: '00-001 Warszawa' } },
  buyer_data: { nip: '5252241585', name: 'Klient', address: { addressLine1: 'ul. B 2', addressLine2: '02-001 Warszawa' } },
  payment_data: {
    method: 'transfer',
    dueDate: '2026-10-16',
    bankAccount: 'PL61109010140000071219812874',
    currency: 'PLN',
    amountDue: 22140.23,
  },
  lines: [
    { ordinal: 1, name: 'Usługa', unit: 'h', quantity: '1.5', unit_price_net: '100.1234', vat_rate: '23', gross_amount: '184.73' },
  ],
  upo_status: null,
  can_manage_send: false,
  ksef_duplicate_original: null,
  ksef_resend_facts: STORED,
  ksef_environment_known: true,
};

function render(initial: InvoiceDetailInitial) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<InvoiceDetailView initial={initial} />));
  // pl-PL grupuje tysiące spacją nierozdzielającą (U+00A0).
  return (host.textContent ?? '').replace(/\u00a0/g, ' ');
}

describe('szczegóły faktury na ekranie (F-094)', () => {
  it('pokazuje formę, termin płatności i rachunek', () => {
    const t = render(base);
    expect(t).toContain('Przelew');
    expect(t).toContain('2026-10-16');
    expect(t).toContain('PL61109010140000071219812874');
  });

  it('ilość i cena w całości, kwoty po polsku', () => {
    const t = render(base);
    expect(t).toContain('100,1234');
    expect(t).toContain('1,50');
    expect(t).toContain('184,73');
    expect(t).toContain('18 000,19');
    expect(t).not.toContain('100.12');
  });

  it('nabywca z numerem VAT UE ma identyfikator z etykietą', () => {
    const t = render({
      ...base,
      buyer_data: { vatUeNumber: 'DE123456789', name: 'Kunde GmbH', address: { addressLine1: 'Hauptstr. 1', addressLine2: '10115 Berlin' } },
    });
    expect(t).toContain('VAT UE: DE123456789');
  });

  it('stawka „np_ii” (AUD-70) jako „np. II”, nie „np_ii%”; „np” bez zmian', () => {
    const t = render({
      ...base,
      lines: [
        { ordinal: 1, name: 'Programowanie', unit: 'usł.', quantity: '1', unit_price_net: '2000', vat_rate: 'np_ii', gross_amount: '2000' },
        { ordinal: 2, name: 'Montaż w DE', unit: 'usł.', quantity: '1', unit_price_net: '500', vat_rate: 'np', gross_amount: '500' },
      ],
    });
    expect(t).toContain('np. II');
    expect(t).not.toContain('np_ii');
    expect(t).toMatch(/Montaż w DE.*np(?!\.)/);
  });

  it('czas przyjęcia w KSeF po polsku, w strefie Europe/Warsaw', () => {
    const t = render(base);
    expect(t).toContain('02.10.2026, 07:12');
    expect(t).not.toContain('2026-10-02T05:12');
  });

  it('faktura bez danych płatności (stary rekord) renderuje się bez sekcji płatności', () => {
    const t = render({ ...base, payment_data: null });
    expect(t).not.toContain('Termin płatności');
    expect(t).toContain('FV/7/10/2026');
  });

  it('D-A4-1b-3: nierozstrzygnięty duplikat 440 — panel z danymi faktury, którą KSeF ma pod tym numerem', () => {
    const view = describeDuplicateOriginal('FV/7/10/2026', '5260001246-20260928-0100A0B0C0D0-1A', {
      v: 1, env: 'test', checkedAt: '2026-10-04T12:00:00Z', reason: 'faktflow-original',
      sha256: 'a'.repeat(64), archivePath: 'x', sizeBytes: 1, sameContentExceptHeader: false, ownHistory: false,
      acquiredAt: '2026-09-28T07:15:00.000Z', httpStatus: null, knownInvoice: null, recheck: null,
      summary: { systemInfo: 'KSeF SaaS v1.0', number: 'FV/7/10/2026', issueDate: '2026-09-28', buyerNip: '5252241585', buyerName: 'Klient', gross: '1845.00', currency: 'PLN' },
    });
    const failed = { ...base, ksef_status: 'failed', ksef_number: null, last_error_code: 'KSEF_DUPLICATE_RECONCILE', ksef_duplicate_original: view };
    const t = render(failed);
    expect(t).toContain('W KSeF jest już faktura o tym numerze');
    expect(t).toContain('5260001246-20260928-0100A0B0C0D0-1A');
    expect(t).toContain('1845.00 PLN');
    expect(t).toContain('Klient, NIP 5252241585');
    expect(t).toContain('Nie wystawiaj tej faktury ponownie');

    // Po zmianie stanu (np. ponowne uzgodnienie) panel znika.
    expect(render({ ...failed, ksef_status: 'queued' })).not.toContain('W KSeF jest już faktura o tym numerze');
  });

  it('D-A4-1b-3: po zmianie stanu w czasie rzeczywistym panel nie wraca ze starymi danymi (nowe dane dopiero po odświeżeniu)', () => {
    realtime.handlers.length = 0;
    const view = describeDuplicateOriginal('FV/7/10/2026', '5260001246-20260928-0100A0B0C0D0-1A', null);
    render({ ...base, ksef_status: 'failed', ksef_number: null, last_error_code: 'KSEF_DUPLICATE_RECONCILE', ksef_duplicate_original: view });
    const invoiceUpdate = realtime.handlers[0]!;
    act(() => invoiceUpdate({ new: { ksef_status: 'queued', last_error_code: null, last_error: null } }));
    act(() => invoiceUpdate({ new: { ksef_status: 'failed', last_error_code: 'KSEF_DUPLICATE_RECONCILE', last_error: 'nowy werdykt' } }));
    expect((host?.textContent ?? '')).not.toContain('W KSeF jest już faktura o tym numerze');
  });
});

describe('A4b PR2b: widok przekazuje przyciskom fakty ponowienia i środowisko', () => {
  type ActionsProps = { invoice: Record<string, unknown>; canManageSend?: boolean };
  const lastActions = () => actions.props.at(-1) as ActionsProps | undefined;

  const zalQueued: InvoiceDetailInitial = {
    ...base,
    internal_number: 'ZAL/1/10/2026',
    invoice_type: 'ZAL',
    invoice_kind: 'advance',
    ksef_status: 'queued',
    ksef_number: null,
    ksef_accepted_at: null,
    can_manage_send: true,
    ksef_resend_facts: STORED,
  };

  it('Realtime zmienia status na failed: przyciski dostają status z Realtime i fakty z serwera, bez treści dokumentu', () => {
    realtime.handlers.length = 0;
    actions.props.length = 0;
    render(zalQueued);
    const invoiceUpdate = realtime.handlers[0]!;
    act(() => invoiceUpdate({
      new: { ksef_status: 'failed', last_error_code: 'KSEF_UNAVAILABLE', fa3_data: { advanceEnvelope: {} } },
    }));
    const props = lastActions();
    expect(props?.invoice).toMatchObject({ ksef_status: 'failed', last_error_code: 'KSEF_UNAVAILABLE', invoice_kind: 'advance' });
    expect(props?.invoice.ksef_resend_facts).toEqual(STORED);
    expect(props?.invoice.ksef_environment_known).toBe(true);
    expect(JSON.stringify(props)).not.toContain('advanceEnvelope');
  });

  it('router.refresh() z nowymi faktami (po północy): przyciski dostają nowe fakty z props, nie stan z pierwszego renderu', () => {
    actions.props.length = 0;
    const failed: InvoiceDetailInitial = { ...zalQueued, ksef_status: 'failed', last_error_code: 'KSEF_UNAVAILABLE' };
    render(failed);
    expect(lastActions()?.invoice.ksef_resend_facts).toEqual(STORED);
    // Ten sam korzeń, ten sam klucz — React nie montuje widoku od nowa, `useState(initial)` zostaje.
    act(() => root!.render(<InvoiceDetailView initial={{ ...failed, ksef_resend_facts: PASSED }} />));
    expect(lastActions()?.invoice.ksef_resend_facts).toEqual(PASSED);
    act(() => root!.render(<InvoiceDetailView initial={{ ...failed, ksef_resend_facts: PASSED, ksef_environment_known: false }} />));
    expect(lastActions()?.invoice.ksef_environment_known).toBe(false);
  });
});

describe('A4b PR2b (decyzja 10, 07.10.2026): znaczek statusu „ponawiamy” tylko, gdy automat ponowi', () => {
  const failedRegular = (code: string, patch: Partial<InvoiceDetailInitial> = {}): InvoiceDetailInitial => ({
    ...base,
    ksef_status: 'failed',
    ksef_number: null,
    ksef_accepted_at: null,
    last_error_code: code,
    ...patch,
  });

  it.each(['TRANSIENT_EXHAUSTED', 'CREDENTIALS_UNAVAILABLE', 'NOT_IN_KSEF'])(
    'zwykła faktura, %s (bez automatu): „Błąd wysyłki”, nie „ponawiamy”',
    (code) => {
      const t = render(failedRegular(code));
      expect(t).not.toContain('ponawiamy');
      expect(t).toContain('Błąd wysyłki');
    },
  );

  it('strażnik: zwykła faktura, KSEF_UNAVAILABLE z kopią danych — „Błąd — ponawiamy” (cron I6)', () => {
    expect(render(failedRegular('KSEF_UNAVAILABLE'))).toContain('Błąd — ponawiamy');
  });

  it('zwykła faktura, KSEF_UNAVAILABLE bez kompletnych danych: automat jej nie ponowi — bez „ponawiamy”', () => {
    const t = render(failedRegular('KSEF_UNAVAILABLE', { ksef_resend_facts: MISSING }));
    expect(t).not.toContain('ponawiamy');
    expect(t).toContain('Błąd wysyłki');
  });

  it('nieznane środowisko KSeF: bez „ponawiamy”', () => {
    const t = render(failedRegular('KSEF_UNAVAILABLE', { ksef_environment_known: false }));
    expect(t).not.toContain('ponawiamy');
    expect(t).toContain('Błąd wysyłki');
  });

  it('ZAL, KSEF_UNAVAILABLE po dacie wystawienia: bez „ponawiamy”; ZAL z kopią dziś — „ponawiamy”', () => {
    const zal = failedRegular('KSEF_UNAVAILABLE', { invoice_kind: 'advance', invoice_type: 'ZAL', ksef_resend_facts: PASSED });
    const t = render(zal);
    expect(t).not.toContain('ponawiamy');
    expect(t).toContain('Błąd wysyłki');
    act(() => root?.unmount());
    expect(render({ ...zal, ksef_resend_facts: STORED })).toContain('Błąd — ponawiamy');
  });

  it('router.refresh() po północy: znaczek ZAL bierze fakty z props, nie ze stanu pierwszego renderu', () => {
    const zal = failedRegular('KSEF_UNAVAILABLE', { invoice_kind: 'advance', invoice_type: 'ZAL' });
    expect(render(zal)).toContain('Błąd — ponawiamy');
    act(() => root!.render(<InvoiceDetailView initial={{ ...zal, ksef_resend_facts: PASSED }} />));
    expect(host?.textContent ?? '').not.toContain('ponawiamy');
  });

  it('Realtime: status i kod znaczka z Realtime — KSEF_UNAVAILABLE „ponawiamy”, potem TRANSIENT_EXHAUSTED „Błąd wysyłki”', () => {
    realtime.handlers.length = 0;
    render({ ...base, ksef_status: 'queued', ksef_number: null, ksef_accepted_at: null });
    const invoiceUpdate = realtime.handlers[0]!;
    act(() => invoiceUpdate({ new: { ksef_status: 'failed', last_error_code: 'KSEF_UNAVAILABLE' } }));
    expect(host?.textContent ?? '').toContain('Błąd — ponawiamy');
    act(() => invoiceUpdate({ new: { ksef_status: 'failed', last_error_code: 'TRANSIENT_EXHAUSTED' } }));
    expect(host?.textContent ?? '').not.toContain('ponawiamy');
    expect(host?.textContent ?? '').toContain('Błąd wysyłki');
  });

  it('znaczek bez `automaticResend`: kod transient → „Błąd wysyłki”; z `automaticResend` → „Błąd — ponawiamy”', () => {
    expect(renderToStaticMarkup(<StatusBadge status="failed" errorCode="KSEF_UNAVAILABLE" />)).toContain('Błąd wysyłki');
    expect(renderToStaticMarkup(<StatusBadge status="failed" errorCode="KSEF_UNAVAILABLE" automaticResend={false} />))
      .not.toContain('ponawiamy');
    expect(renderToStaticMarkup(<StatusBadge status="failed" errorCode="KSEF_UNAVAILABLE" automaticResend />))
      .toContain('Błąd — ponawiamy');
  });

  it('strażnik: listy faktur (bez kodu błędu) — „Błąd” bez zmian; inne klasy bez zmian', () => {
    expect(renderToStaticMarkup(<StatusBadge status="failed" />)).toContain('>Błąd<');
    expect(renderToStaticMarkup(<StatusBadge status="failed" errorCode="KSEF_PAUSED" />)).toContain('Wstrzymana');
    expect(renderToStaticMarkup(<StatusBadge status="failed" errorCode="ISSUE_DATE_PASSED" />)).toContain('Data wystawienia minęła');
  });
});
