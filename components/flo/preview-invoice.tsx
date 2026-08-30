import type { FloPreview } from '@/types/flo';

type InvoicePreview = Extract<FloPreview, { type: 'invoice' }>;

/**
 * Podgląd faktury (krok 11 toru B) — „PROJEKT FAKTURY” z makiety.
 *
 * UKŁAD JEST CELOWO TEN SAM, co w podglądzie faktury wystawianej ręcznie
 * (`components/invoices/invoice-detail-view.tsx`): te same kolumny, te same
 * nagłówki, ta sama kolejność. Klient ma poznać dokument, na który patrzy,
 * bez czytania — a nie zastanawiać się, czy „faktura od FLO” to to samo co
 * jego faktura.
 *
 * WSZYSTKIE LICZBY SĄ NAPISAMI Z SERWERA. Ten komponent nie zna arytmetyki
 * i nie ma prawa jej poznać: gdyby suma na ekranie brała się z sumowania
 * wierszy w przeglądarce, mogłaby różnić się od tej, która pójdzie do KSeF.
 */
export function FloPreviewInvoice({ preview }: { preview: InvoicePreview }) {
  return (
    <div className="space-y-3">
      <table className="w-full text-left text-[11px]">
        <thead className="text-[var(--ff-text-muted)]">
          <tr className="border-b border-[var(--ff-border)]">
            <th className="pb-1.5 font-medium">Nazwa</th>
            <th className="w-16 pb-1.5 text-right font-medium">Ilość</th>
            <th className="w-24 pb-1.5 text-right font-medium">Netto</th>
            <th className="w-20 pb-1.5 text-right font-medium">VAT</th>
            <th className="w-24 pb-1.5 text-right font-medium">Brutto</th>
          </tr>
        </thead>

        <tbody>
          {preview.lines.map((line, index) => (
            <tr
              key={`${line.name}:${index}`}
              className="border-b border-[var(--ff-row-divider)] last:border-b-0"
            >
              <td className="py-1.5 break-words">{line.name}</td>
              <td className="py-1.5 text-right tabular-nums">{line.qty}</td>
              <td className="py-1.5 text-right tabular-nums">{line.net}</td>
              <td className="py-1.5 text-right">{line.vat}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">
                {line.gross}
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={4} className="pt-2 text-right font-semibold">
              Do zapłaty
            </td>
            <td className="pt-2 text-right font-semibold tabular-nums text-[var(--ff-text-strong)]">
              {preview.total}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="text-[11px] text-[var(--ff-text-muted)]">
        Termin: <span className="text-[var(--ff-text-soft)]">{preview.due}</span>
      </p>
    </div>
  );
}
