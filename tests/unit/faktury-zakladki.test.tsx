import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Poprawka Bartosza 21.10.2026: ekran „Faktury” ma zakładki Wystawione /
 * Cykliczne / Po terminie (wygląd zakładek „line” Finory, pierwszy rząd karty
 * z tabelą), a karta sięga do stopki PUSTYM arkuszem — bez dorysowanych pustych
 * wierszy. Stopka (Regulamin, Polityka, Pomoc) stoi na samym dole strony.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/actions/recurring-invoices', () => ({
  createRecurringInvoiceAction: vi.fn(),
  updateRecurringInvoiceAction: vi.fn(),
  pauseRecurringInvoiceAction: vi.fn(),
  resumeRecurringInvoiceAction: vi.fn(),
  deleteRecurringInvoiceAction: vi.fn(),
}));
vi.mock('@/app/actions/recurring-invoice-templates', () => ({ searchRecurringTemplatesAction: vi.fn() }));
vi.mock('@/components/reminders/reminder-consent-dialog', () => ({ ReminderConsentDialog: () => null }));
vi.mock('@/app/actions/reminders', () => ({ toggleInvoiceRemindersAction: vi.fn() }));
vi.mock('@/lib/supabase/page-context', () => ({
  getPageContext: async () => ({ supabase: memoryClient({ invoices: [] }), tenantId: 'firma-a' }),
}));

const { memoryClient } = await import('./helpers/baza-w-pamieci');
const { INVOICES_TABS, InvoicesTabs } = await import('@/components/invoices/invoices-tabs');
const { RecurringInvoicesView } = await import('@/app/(dashboard)/invoices/recurring/_components/recurring-invoices-view');
const { OverdueDashboard, OverdueDashboardError } = await import('@/components/reminders/overdue-dashboard');
const { default: InvoicesPage } = await import('@/app/(dashboard)/invoices/page');
const { default: RecurringInvoicesPage } = await import('@/app/(dashboard)/invoices/recurring/page');
const { InvoicesTable } = await import('@/app/(dashboard)/invoices/_components/invoices-table');

const ROOT = join(__dirname, '..', '..');

/** Linki zakładek w kolejności: [href, aktywna?]. */
function tabs(html: string): Array<[string, boolean]> {
  const nav = /<nav aria-label="Rodzaje faktur"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  expect(nav, 'brak paska zakładek Faktur').not.toBeNull();
  return [...nav![1]!.matchAll(/<a([^>]*)>/g)].map(([, attrs]) => [
    /href="([^"]*)"/.exec(attrs!)![1]!,
    attrs!.includes('aria-current="page"'),
  ]);
}

function activeTab(html: string): string[] {
  return tabs(html).filter(([, active]) => active).map(([href]) => href);
}

/** Elementy drzewa Reacta (bez renderowania komponentów) — do stron serwerowych z bazą. */
function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((child) => elements(child, out));
  else if (isValidElement(node)) {
    out.push(node);
    elements((node.props as { children?: ReactNode }).children, out);
  }
  return out;
}

const recurringItem = {
  id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d',
  tenant_id: 'firma-a',
  template_invoice_id: '7f1c2d3e-4b5a-4c6d-8e7f-901234567890',
  name: 'Abonament Acme',
  frequency: 'monthly' as const,
  day_of_month: 10,
  next_run_date: '2026-11-10',
  active: true,
  created_by: null,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  status: 'active' as const,
  period: '2026-11',
  contractorName: 'Acme sp. z o.o.',
  templateNumber: 'FV/7/10/2026',
  templateGrossTotal: 1230,
};

const overdueInvoice = {
  id: 'o-1',
  internal_number: 'FV/9/2026',
  payment_due_date: '2026-09-24',
  gross_total: 1230,
  amount_due: 1230,
  days_overdue: 27,
  buyer_name: 'Acme sp. z o.o.',
  buyer_nip: '1234567890',
  buyer_email: null,
  reminders_paused: false,
  reminders_sent_count: 0,
  reminder_status: 'none' as const,
  latest_reminder: null,
};
const overdueStats = { totalCount: 1, totalAmount: 1230, avgDaysOverdue: 27, pausedCount: 0, sentThisMonth: 0 };

describe('InvoicesTabs — zakładki Faktur', () => {
  it('trzy zakładki w kolejności, każda ze swoim adresem (stare adresy zostają)', () => {
    expect(INVOICES_TABS.map((t) => [t.label, t.href])).toEqual([
      ['Wystawione', '/invoices'],
      ['Cykliczne', '/invoices/recurring'],
      ['Po terminie', '/payments/overdue'],
    ]);
    const html = renderToStaticMarkup(<InvoicesTabs active="cykliczne" />);
    expect(tabs(html)).toEqual([
      ['/invoices', false],
      ['/invoices/recurring', true],
      ['/payments/overdue', false],
    ]);
  });

  it('nawigacja, nie tablist bez paneli; aktywna podkreślona jak zakładka „line” Finory', () => {
    const html = renderToStaticMarkup(<InvoicesTabs active="wystawione" />);
    expect(html).not.toContain('role="tablist"');
    expect(html).toMatch(/<nav aria-label="Rodzaje faktur" class="[^"]*\bh-11\b[^"]*\bborder-b\b/);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*class="[^"]*after:opacity-100/);
    expect(html.match(/after:opacity-100/g)).toHaveLength(1);
  });
});

describe('zakładka na każdym ekranie Faktur', () => {
  it('Wystawione: strona /invoices ma zakładki z aktywną „Wystawione” i pełny arkusz', async () => {
    const tree = await InvoicesPage({ searchParams: Promise.resolve({}) });
    expect((tree.props as { className: string }).className).toContain('ff-page-fill');
    const found = elements(tree).filter((el) => el.type === InvoicesTabs);
    expect(found.map((el) => (el.props as { active: string }).active)).toEqual(['wystawione']);
  });

  it('Cykliczne: lista i pusty stan mają zakładki z aktywną „Cykliczne”', () => {
    for (const items of [[recurringItem], []]) {
      const html = renderToStaticMarkup(<RecurringInvoicesView items={items} today="2026-10-21" candidates={[]} />);
      expect(activeTab(html), `pozycji: ${items.length}`).toEqual(['/invoices/recurring']);
    }
  });

  it('Cykliczne: strona ma pełny arkusz i te same kafle co „Wystawione”', async () => {
    const tree = await RecurringInvoicesPage({ searchParams: Promise.resolve({}) });
    expect((tree.props as { className: string }).className).toContain('ff-page-fill');
    const names = elements(tree).map((el) => (typeof el.type === 'function' ? el.type.name : el.type));
    expect(names).toContain('InvoiceStatTiles');
  });

  it('Po terminie: lista, pusty stan i błąd mają zakładki z aktywną „Po terminie”, tytuł tylko dla czytników', () => {
    const screens = [
      renderToStaticMarkup(<OverdueDashboard overdueInvoices={[overdueInvoice]} stats={overdueStats} />),
      renderToStaticMarkup(<OverdueDashboard overdueInvoices={[]} stats={{ ...overdueStats, totalCount: 0, totalAmount: 0 }} />),
      renderToStaticMarkup(<OverdueDashboardError message="test" />),
    ];
    for (const html of screens) {
      expect(activeTab(html)).toEqual(['/payments/overdue']);
      expect(html).toMatch(/^<div class="ff-page-fill /);
      expect(html).toContain('<h1 class="sr-only">Faktury po terminie</h1>');
    }
    // Zastrzeżenie z dawnego podtytułu zostaje widoczne w nocie nad kaflami.
    expect(screens[0]).toContain('Stan przypomnień jest orientacyjny.');
  });
});

describe('pusty arkusz zamiast pustych wierszy', () => {
  it('tabela faktur ma tylko wiersze faktur — brakujących do „Pokaż N” nie dorysowuje', () => {
    const invoice = {
      id: 'f-1', internal_number: 'FV/1/2026', ksef_status: 'accepted', ksef_number: null,
      buyer_data: { name: 'Acme', nip: '1234567890' }, gross_total: 123, issue_date: '2026-10-01',
      payment_due_date: '2026-10-15', payment_status: 'unpaid', paid_amount: 0, currency: 'PLN',
      invoice_kind: 'regular', created_at: '2026-10-01T10:00:00Z', last_error_code: null,
    };
    const html = renderToStaticMarkup(
      <InvoicesTable invoices={[invoice]} facts={{}} today="2026-10-21" selectedIds={new Set()} onToggleRow={() => {}} onToggleAll={() => {}} />,
    );
    const body = /<tbody[^>]*>([\s\S]*)<\/tbody>/.exec(html)![1]!;
    expect(body.match(/<tr\b/g)).toHaveLength(1);
    expect(body).not.toMatch(/<tr[^>]*aria-hidden/);
  });

  it('karta rośnie do stopki: obszar tabeli (`flex-1 border-b`) nad paginacją', () => {
    const html = renderToStaticMarkup(<RecurringInvoicesView items={[recurringItem]} today="2026-10-21" candidates={[]} />);
    expect(html).toMatch(/data-slot="card"[^>]*class="[^"]*\bflex-1\b[^"]*\bpt-0\b/);
    expect(html).toContain('<div class="flex w-full flex-1 flex-col pt-2"><div class="flex-1 border-b">');
  });

  it('łańcuch wysokości włącza się tylko na stronach z `ff-page-fill` (`:has`), reszta ekranów zostaje blokami', () => {
    const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
    expect(css).toContain('.ff-shell-content:has(.ff-page-fill),');
    expect(css).toContain('.ff-shell-content :is(.ff-route-template, .ff-invoices-route):has(.ff-page-fill)');
    expect(css).toContain('.ff-shell-content .ff-page-fill {\n  flex-grow: 1;');
  });
});

describe('stopka na samym dole', () => {
  it('przewijany obszar to kolumna flex, kontener treści rośnie i nie kurczy się pod treść', () => {
    const layout = readFileSync(join(ROOT, 'app/(dashboard)/layout.tsx'), 'utf8');
    expect(layout).toContain('className="ff-shell-scroll flex min-h-0 flex-1 flex-col overflow-y-auto"');
    const content = /<div className="(ff-shell-content [^"]*)"/.exec(layout)?.[1] ?? '';
    expect(content.split(' ')).toContain('grow');
    // `min-h-0` pozwoliłby skurczyć kontener poniżej treści — wjechałby na stopkę.
    expect(content.split(' ')).not.toContain('min-h-0');
    expect(layout.indexOf('<Footer />')).toBeGreaterThan(layout.indexOf('ff-shell-content'));
  });
});
