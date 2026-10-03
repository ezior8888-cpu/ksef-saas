// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cykl życia faktury, PR 3b (K3, D2, D4) — ekran: przyciski po nieudanej
 * wysyłce wg tabeli stanów. Do 03.10.2026 pod każdą nieudaną fakturą stało
 * tylko zdanie „Przed kolejną wysyłką potrzebne jest ręczne uzgodnienie
 * z KSeF” — bez żadnego przycisku.
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
}));

import { FailedInvoiceActions } from '@/components/invoices/failed-invoice-actions';

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
      {...props}
    />,
  ));
  return host;
}

function buttons(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('button, a')).map((b) => (b.textContent ?? '').trim());
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
