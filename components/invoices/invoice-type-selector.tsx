'use client';

import Link from 'next/link';

const INVOICE_TYPES = [
  {
    type: 'regular',
    label: 'Faktura zwykła',
    description: 'Standardowa faktura sprzedażowa B2B lub B2C',
    icon: 'receipt_long',
    iconWrap:
      'bg-[color-mix(in_srgb,var(--ff-primary)_20%,transparent)] text-[var(--ff-primary)]',
  },
  {
    type: 'correction',
    label: 'Faktura korygująca',
    description: 'Korekta wystawionej faktury (dane, kwoty, anulowanie)',
    icon: 'edit_document',
    iconWrap:
      'bg-[color-mix(in_srgb,var(--ff-secondary)_20%,transparent)] text-[var(--ff-secondary)]',
  },
  {
    type: 'advance',
    label: 'Faktura zaliczkowa',
    description: 'Zaliczka na poczet przyszłej dostawy lub usługi',
    icon: 'payments',
    iconWrap:
      'bg-[color-mix(in_srgb,var(--ff-tertiary)_18%,transparent)] text-[var(--ff-tertiary)]',
  },
  {
    type: 'final',
    label: 'Faktura rozliczająca',
    description: 'Rozliczenie wcześniej wystawionych zaliczek',
    icon: 'task_alt',
    iconWrap:
      'bg-[color-mix(in_srgb,var(--ff-primary)_16%,transparent)] text-[var(--ff-primary)]',
  },
] as const;

const cardLinkClass =
  'group ff-glass-pane ff-glass-pane-hover relative flex flex-col overflow-hidden rounded-[var(--ff-radius-lg)] p-6 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] hover:border-[color-mix(in_srgb,var(--ff-primary)_28%,transparent)] hover:shadow-[0_10px_28px_rgba(107,251,154,0.14)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ff-primary)_45%,transparent)]';

export function InvoiceTypeSelector() {
  return (
    <div className="mx-auto max-w-[960px] pb-10 text-[var(--ff-on-surface)]">
      <div className="mb-10">
        <h1 className="mb-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ff-text-strong)]">
          Nowa faktura
        </h1>
        <p className="text-sm text-[var(--ff-text-muted)]">
          Wybierz typ dokumentu — każda ścieżka prowadzi do formularza w tym samym
          układzie co reszta aplikacji
        </p>
      </div>

      <div className="grid grid-cols-1 gap-[var(--ff-gutter)] md:grid-cols-2">
        {INVOICE_TYPES.map((it) => (
          <Link key={it.type} href={`/invoices/new/${it.type}`} className={cardLinkClass}>
            <div className="mb-5 flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${it.iconWrap}`}
              >
                <span className="material-symbols-outlined text-[26px] leading-none">
                  {it.icon}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[18px] font-bold leading-snug tracking-tight">
                  {it.label}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[color-mix(in_srgb,var(--ff-on-surface-variant)_58%,transparent)]">
                  {it.description}
                </p>
              </div>
            </div>
            <div className="mt-auto flex items-center gap-2 text-[13px] font-bold text-[var(--ff-primary)]">
              <span>Wypełnij formularz</span>
              <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:translate-x-1">
                arrow_forward
              </span>
            </div>
            <div className="pointer-events-none absolute -bottom-6 -right-2 opacity-[0.05] transition-opacity group-hover:opacity-[0.09]">
              <span className="material-symbols-outlined text-[100px] leading-none text-[var(--ff-on-surface)]">
                {it.icon}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
