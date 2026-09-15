import {
  summarizeVatPerRate,
  type InvoiceTotals as Totals,
} from '@/lib/xml/invoice-calculator';
import { formatPlMoney } from '@/lib/format/pl';
import { cn } from '@/lib/utils';
import type { InvoiceLineItem } from '@/types/invoice';

const OPIS_STAWKI: Record<string, string> = {
  oo: 'odwrotne obciążenie',
  np: 'nie podlega',
  zw: 'zwolniona',
};

function etykietaStawki(rate: string): string {
  const opis = OPIS_STAWKI[rate];
  return opis ? `VAT ${opis}` : `VAT ${rate}%`;
}

/**
 * Podsumowanie faktury: netto, VAT w rozbiciu na stawki, do zapłaty.
 *
 * JEDNO ŹRÓDŁO LICZB DLA OBU UKŁADÓW. Wcześniej stopka tabeli (komputer)
 * pokazywała tylko RAZEM netto i brutto — VAT nie pojawiał się nigdzie —
 * a karta podsumowania na telefonie liczyła VAT jako `brutto − netto`,
 * mimo że kalkulator zwraca `vatTotal` policzony pozycja po pozycji.
 * Przy stawkach mieszanych i zaokrągleniach do groszy te dwie liczby nie
 * muszą być równe, więc na fakturze była kwota VAT, której nie wyliczył
 * żaden przepis, tylko odejmowanie w interfejsie.
 *
 * Rozbicie na stawki idzie przez `summarizeVatPerRate` z tego samego modułu,
 * który generuje XML FA(3) — to, co klient widzi przed wysyłką, jest liczone
 * tą samą funkcją co to, co pójdzie do KSeF.
 *
 * „DO ZAPŁATY”, nie „RAZEM”: tak stoi na makiecie i tak nazywa to człowiek,
 * który patrzy na fakturę.
 */
export function InvoiceTotals({
  totals,
  lines,
  className,
}: {
  totals: Totals;
  lines: InvoiceLineItem[];
  className?: string;
}) {
  const stawki = summarizeVatPerRate(lines).filter(
    (s) => s.netSum !== 0 || s.vatSum !== 0,
  );

  return (
    <section
      aria-label="Podsumowanie faktury"
      className={cn(
        'rounded-2xl border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-4 sm:p-5',
        className,
      )}
    >
      <dl className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[13px] text-[var(--ff-text-muted)]">Netto</dt>
          <dd className="font-mono text-[15px] tabular-nums text-[var(--ff-text)]">
            {formatPlMoney(totals.netTotal)}
          </dd>
        </div>

        {stawki.map((s) => (
          <div
            key={s.rate}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-[13px] text-[var(--ff-text-muted)]">
              {etykietaStawki(s.rate)}
            </dt>
            <dd className="font-mono text-[15px] tabular-nums text-[var(--ff-text)]">
              {formatPlMoney(s.vatSum)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-[var(--ff-border)] pt-3">
        <span className="text-[15px] font-semibold text-[var(--ff-text-strong)]">
          Do zapłaty
        </span>
        <span className="font-mono text-[22px] font-bold tabular-nums text-[var(--ff-text-strong)]">
          {formatPlMoney(totals.grossTotal)} zł
        </span>
      </div>
    </section>
  );
}
