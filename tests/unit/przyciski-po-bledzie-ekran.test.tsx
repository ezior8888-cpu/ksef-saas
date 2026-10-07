// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cykl życia faktury, PR 3b (K3, D2, D4) — ekran: przyciski po nieudanej
 * wysyłce wg tabeli stanów. Do 03.10.2026 pod każdą nieudaną fakturą stało
 * tylko zdanie „Przed kolejną wysyłką potrzebne jest ręczne uzgodnienie
 * z KSeF” — bez żadnego przycisku.
 *
 * A4b PR2b: przyciski dokumentu specjalnego (KOR, ZAL, ROZ) wg faktów
 * ponowienia z kopii na wierszu (`ksef_resend_facts` liczone na serwerze)
 * i znajomości środowiska KSeF. Do PR2b każdy dokument specjalny dostawał
 * tylko „Wróć do szkicu” z tekstem „special”, KOR_HOLD obiecywał automat,
 * toast po powrocie do szkicu kazał „poprawić i wysłać ponownie”, a odmowa
 * „Wyślij ponownie” nie odświeżała strony (fakty sprzed północy zostawały).
 */

const m = vi.hoisted(() => ({
  resend: vi.fn(),
  reset: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }));
vi.mock('@/components/invoices/actions-detail', () => ({
  resendInvoiceAction: m.resend,
  resetInvoiceToDraftAction: m.reset,
  downloadInvoiceXmlAction: vi.fn(),
}));
// Pasek akcji faktury (`InvoiceActions`) — sąsiednie przyciski bez znaczenia dla stanu po błędzie.
vi.mock('@/components/invoices/email-invoice-button', () => ({ EmailInvoiceButton: () => null }));
vi.mock('@/components/invoices/draft-invoice-actions', () => ({ DraftInvoiceActions: () => null }));
vi.mock('@/lib/download', () => ({ saveBlob: vi.fn() }));

import { FailedInvoiceActions } from '@/components/invoices/failed-invoice-actions';
import { InvoiceActions } from '@/components/invoices/invoice-actions';
import type { KsefResendFacts } from '@/lib/invoices/ksef-requeue-event';
import {
  KSEF_SEND_MESSAGES,
  KSEF_SPECIAL_SEND_MESSAGES,
  resetDoneMessage,
} from '@/lib/invoices/ksef-send-policy';
import { SUPPORT_EMAIL } from '@/lib/site';

/** Kopia danych zapisana, rodzaj niewstrzymany, dziś dzień wystawienia (A4b PR2b). */
const STORED: KsefResendFacts = { sendData: 'stored', kindHeld: false, issueDatePassed: false };
/** Brak kopii danych (dokument sprzed 00137 / sprzed koperty ZAL). */
const MISSING: KsefResendFacts = { sendData: 'missing', kindHeld: false, issueDatePassed: false };
/** Rodzaj wstrzymany w środowisku (KOR na PROD, ROZ wszędzie — do C4). */
const HELD: KsefResendFacts = { sendData: 'stored', kindHeld: true, issueDatePassed: false };
/** Data wystawienia sprzed dzisiaj (decyzja b, 00147). */
const PASSED: KsefResendFacts = { sendData: 'stored', kindHeld: false, issueDatePassed: true };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  m.resend.mockResolvedValue({ success: true });
  m.reset.mockResolvedValue({ success: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function render(props: Partial<Parameters<typeof FailedInvoiceActions>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(
    <FailedInvoiceActions
      invoiceId="inv-1"
      status="failed"
      errorCode="INFRA"
      invoiceKind="regular"
      canManage
      facts={STORED}
      environmentKnown
      {...props}
    />,
  ));
  return host;
}

function buttons(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('button, a')).map((b) => (b.textContent ?? '').trim());
}

/** Zdanie nad przyciskami (co się stało i co dalej). */
function info(el: HTMLElement): string {
  return el.querySelector('p')?.textContent ?? '';
}

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(label));
  expect(found, `brak przycisku „${label}”`).toBeDefined();
  return found!;
}

function unmount() {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
}

describe('przyciski po błędzie wysyłki', () => {
  it('owner, błąd przejściowy: „Wróć do szkicu” i „Wyślij ponownie” z informacją o automacie', () => {
    const el = render();
    expect(buttons(el)).toEqual(['Wróć do szkicu', 'Wyślij ponownie']);
    expect(el.textContent).toContain('ponowimy automatycznie');
  });

  it('member nie widzi żadnego przycisku, dostaje prośbę o właściciela', () => {
    const el = render({ canManage: false });
    expect(buttons(el)).toEqual([]);
    expect(el.textContent).toContain('Poproś właściciela lub administratora');
  });

  it('rejected: tylko „Wróć do szkicu”', () => {
    const el = render({ status: 'rejected', errorCode: 'KSEF_REJECTED' });
    expect(buttons(el)).toEqual(['Wróć do szkicu']);
    expect(el.textContent).toContain('KSeF odrzucił treść');
  });

  it('brak certyfikatu: link do ustawień KSeF obok obu przycisków', () => {
    const el = render({ errorCode: 'NO_CERTIFICATE' });
    expect(buttons(el)).toEqual(['Ustawienia KSeF', 'Wróć do szkicu', 'Wyślij ponownie']);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/settings/ksef');
  });

  it('do uzgodnienia / wstrzymana: bez przycisków, z wyjaśnieniem', () => {
    expect(buttons(render({ errorCode: 'KSEF_DUPLICATE_RECONCILE' }))).toEqual([]);
    expect(host!.textContent).toContain('operator');
    act(() => root?.unmount());
    expect(buttons(render({ errorCode: 'KSEF_PAUSED' }))).toEqual([]);
    expect(host!.textContent).toContain('wstrzymana przez operatora');
  });

  it('inne stany: nic', () => {
    expect(render({ status: 'accepted', errorCode: null }).textContent).toBe('');
  });

  it('„Wyślij ponownie” woła akcję i odświeża; błąd akcji idzie do toasta', async () => {
    const el = render();
    const send = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Wyślij ponownie'))!;
    await act(async () => { send.click(); });
    expect(m.resend).toHaveBeenCalledWith('inv-1');
    expect(m.refresh).toHaveBeenCalled();

    m.resend.mockResolvedValue({ success: false, error: 'Ta faktura jest już wysyłana albo nie jest szkicem.' });
    await act(async () => { send.click(); });
    expect(m.toastError).toHaveBeenCalledWith('Ta faktura jest już wysyłana albo nie jest szkicem.');
  });

  it('„Wróć do szkicu” pyta o potwierdzenie i woła akcję', async () => {
    const el = render();
    const reset = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Wróć do szkicu'))!;
    await act(async () => { reset.click(); });
    expect(window.confirm).toHaveBeenCalled();
    expect(m.reset).toHaveBeenCalledWith('inv-1');
    expect(m.toastSuccess).toHaveBeenCalled();
  });
});

describe('A4b PR2b: dokument specjalny — przyciski wg faktów ponowienia z kopii', () => {
  it.each([
    ['ZAL', 'advance'],
    ['KOR (TEST)', 'correction'],
  ] as const)('%s z kopią, błąd przejściowy z automatem, dziś: „Wróć do szkicu” i „Wyślij ponownie”, automat tylko do północy', (_name, kind) => {
    const el = render({ invoiceKind: kind, errorCode: 'INFRA' });
    expect(buttons(el)).toEqual(['Wróć do szkicu', 'Wyślij ponownie']);
    expect(info(el)).toContain('do północy');
    expect(info(el)).toBe(KSEF_SPECIAL_SEND_MESSAGES.transient(kind));
  });

  it('ZAL bez kopii danych: tylko „Wróć do szkicu”, z powodem i adresem pomocy FaktFlow', () => {
    const el = render({ invoiceKind: 'advance', facts: MISSING });
    expect(buttons(el)).toEqual(['Wróć do szkicu']);
    expect(info(el)).toContain('nie ponowimy automatycznie');
    expect(info(el)).toContain(SUPPORT_EMAIL);
    expect(info(el)).not.toMatch(/uzgodni/);
    expect(info(el)).toBe(KSEF_SPECIAL_SEND_MESSAGES.incomplete('advance'));
  });

  const HOLD_CASES: Array<[code: string, kind: string, facts: KsefResendFacts[], message: () => string]> = [
    ['KOR_HOLD', 'correction', [STORED, HELD, MISSING], () => KSEF_SEND_MESSAGES.korHold],
    ['ROZ_HOLD_RECONCILE', 'final', [HELD, { ...HELD, sendData: 'missing' }], () => KSEF_SEND_MESSAGES.rozHold],
  ];

  it.each(HOLD_CASES)('%s (%s): bez przycisków (decyzja a), bez obietnicy automatu, z adresem pomocy FaktFlow', (code, kind, factsList, message) => {
    for (const facts of factsList) {
      const el = render({ errorCode: code, invoiceKind: kind, facts });
      expect(buttons(el)).toEqual([]);
      expect(info(el)).not.toMatch(/automatycznie/);
      expect(info(el)).toContain('pomocy FaktFlow');
      expect(info(el)).toContain(SUPPORT_EMAIL);
      expect(info(el)).toBe(message());
      unmount();
    }
  });

  it('KSEF_PAUSED, ZAL po dacie wystawienia: tylko „Wróć do szkicu” z powodem — automat jej już nie wyśle', () => {
    const el = render({ errorCode: 'KSEF_PAUSED', invoiceKind: 'advance', facts: PASSED });
    expect(buttons(el)).toEqual(['Wróć do szkicu']);
    expect(info(el)).toMatch(/datę wystawienia sprzed dzisiaj/);
    expect(info(el)).toContain('nie ponowimy automatycznie');
    expect(info(el)).toBe(KSEF_SPECIAL_SEND_MESSAGES.issueDatePassed('advance'));
  });

  it('KSEF_PAUSED, ZAL z kopią dziś: bez przycisków, automat tylko przed północą', () => {
    const el = render({ errorCode: 'KSEF_PAUSED', invoiceKind: 'advance', facts: STORED });
    expect(buttons(el)).toEqual([]);
    expect(info(el)).toContain('przed północą');
    expect(info(el)).toBe(KSEF_SPECIAL_SEND_MESSAGES.paused('advance'));
  });

  it('nieznane środowisko KSeF: żadnego przycisku, prośba o odświeżenie (także dla zwykłej faktury)', () => {
    const el = render({ environmentKnown: false });
    expect(buttons(el)).toEqual([]);
    expect(info(el)).toContain('Odśwież stronę');
    expect(info(el)).toBe(KSEF_SEND_MESSAGES.envUnknown);
  });

  it('„Wróć do szkicu” ZAL: toast mówi o usunięciu szkicu i wystawieniu od nowa, nie o poprawie i ponownej wysyłce', async () => {
    const el = render({ invoiceKind: 'advance' });
    await act(async () => { button(el, 'Wróć do szkicu').click(); });
    expect(m.reset).toHaveBeenCalledWith('inv-1');
    const message = String(m.toastSuccess.mock.calls[0]?.[0]);
    expect(message).not.toMatch(/wyślij ponownie|Popraw ją/);
    expect(message).toContain('Usuń szkic');
    expect(message).toBe(resetDoneMessage('advance', STORED));
    expect(m.refresh).toHaveBeenCalled();
  });

  it('„Wróć do szkicu” KOR wstrzymanej w środowisku: toast każe wystawić od nowa dopiero po zdjęciu blokady', async () => {
    const el = render({ invoiceKind: 'correction', facts: HELD });
    await act(async () => { button(el, 'Wróć do szkicu').click(); });
    const message = String(m.toastSuccess.mock.calls[0]?.[0]);
    expect(message).not.toMatch(/wyślij ponownie|Popraw ją/);
    expect(message).toContain('po zdjęciu blokady');
    expect(message).toBe(resetDoneMessage('correction', HELD));
  });

  it('strażnik: „Wróć do szkicu” zwykłej faktury — toast bez zmian (M.resetDone, ustalenie 29 poza PR2b)', async () => {
    const el = render();
    await act(async () => { button(el, 'Wróć do szkicu').click(); });
    expect(m.toastSuccess).toHaveBeenCalledWith(KSEF_SEND_MESSAGES.resetDone);
  });

  it('odmowa „Wyślij ponownie”: toast z powodem i odświeżenie strony (serwer liczy fakty od nowa)', async () => {
    m.resend.mockResolvedValue({ success: false, error: KSEF_SEND_MESSAGES.status });
    const el = render();
    await act(async () => { button(el, 'Wyślij ponownie').click(); });
    expect(m.toastError).toHaveBeenCalledWith(KSEF_SEND_MESSAGES.status);
    expect(m.toastSuccess).not.toHaveBeenCalled();
    expect(m.refresh).toHaveBeenCalled();
  });
});

describe('A4b PR2b: pasek akcji faktury przekazuje fakty ponowienia i środowisko', () => {
  type ActionsInvoice = Parameters<typeof InvoiceActions>[0]['invoice'];

  function renderActions(invoice: Partial<ActionsInvoice>) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(
      <InvoiceActions
        invoice={{
          id: 'inv-1',
          ksef_status: 'failed',
          xml_storage_path: null,
          invoice_type: 'ZAL',
          invoice_kind: 'advance',
          last_error_code: 'KSEF_UNAVAILABLE',
          ksef_resend_facts: STORED,
          ksef_environment_known: true,
          ...invoice,
        }}
        canManageSend
      />,
    ));
    return host;
  }

  it('ZAL z kopią dziś, KSEF_UNAVAILABLE: „Wyślij ponownie” jest na stronie faktury', () => {
    const el = renderActions({});
    expect(buttons(el)).toContain('Wyślij ponownie');
    expect(buttons(el)).toContain('Wróć do szkicu');
    expect(el.textContent).toContain('do północy');
  });

  it('fakty z serwera decydują: ZAL po dacie wystawienia — bez „Wyślij ponownie”', () => {
    const el = renderActions({ ksef_resend_facts: PASSED });
    expect(buttons(el)).toContain('Wróć do szkicu');
    expect(buttons(el)).not.toContain('Wyślij ponownie');
    expect(el.textContent).toMatch(/datę wystawienia sprzed dzisiaj/);
  });

  it('nieznane środowisko z serwera: zwykła faktura bez „Wyślij ponownie” i bez „Wróć do szkicu”', () => {
    const el = renderActions({ invoice_type: 'VAT', invoice_kind: 'regular', last_error_code: 'INFRA', ksef_environment_known: false });
    expect(buttons(el)).not.toContain('Wyślij ponownie');
    expect(buttons(el)).not.toContain('Wróć do szkicu');
    expect(el.textContent).toContain(KSEF_SEND_MESSAGES.envUnknown);
  });
});
