'use client';

import Link from 'next/link';
import { FileText, FilePenLine, FileMinus, FileCheck2 } from 'lucide-react';

const INVOICE_TYPES = [
  {
    type: 'regular',
    label: 'Faktura zwykła',
    description: 'Standardowa faktura sprzedażowa B2B lub B2C',
    icon: FileText,
    color: 'text-foreground',
    bg: 'bg-foreground/5',
  },
  {
    type: 'correction',
    label: 'Faktura korygująca',
    description: 'Korekta wystawionej faktury (zmiana danych, kwoty, anulowanie)',
    icon: FilePenLine,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
  },
  {
    type: 'advance',
    label: 'Faktura zaliczkowa',
    description: 'Otrzymanie zaliczki na poczet przyszłej dostawy lub usługi',
    icon: FileMinus,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    type: 'final',
    label: 'Faktura rozliczająca',
    description: 'Faktura końcowa rozliczająca wcześniej wystawione zaliczki',
    icon: FileCheck2,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-500/10',
  },
] as const;

export function InvoiceTypeSelector() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tighter-display">
          Nowa faktura
        </h1>
        <p className="mt-2 text-muted-foreground">
          Wybierz typ faktury jaką chcesz wystawić
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {INVOICE_TYPES.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.type}
              href={`/invoices/new/${it.type}`}
              className="group rounded-3xl border border-glass-border bg-glass-white p-6 shadow-glass backdrop-blur-glass transition-all duration-200 ease-apple hover:bg-glass-white-strong hover:shadow-glass-lg active:scale-[0.98]"
            >
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${it.bg}`}
              >
                <Icon className={`h-6 w-6 ${it.color}`} />
              </div>
              <h3 className="font-display text-lg font-semibold tracking-tighter-text">{it.label}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {it.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
