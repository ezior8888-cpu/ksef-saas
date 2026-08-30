import type { FloPreview } from '@/types/flo';

type DiffPreview = Extract<FloPreview, { type: 'diff' }>;

/**
 * Podgląd różnicy „było → jest” (krok 13 toru B).
 *
 * Używany przez X-02 (poprawka faktury odrzuconej przez KSeF) i wszędzie, gdzie
 * zmienia się kwota, stawka VAT albo termin. To jest realizacja trzeciego
 * z czterech twardych „nigdy” z części II.3 planu: nigdy nie zmieniamy kwoty,
 * stawki ani terminu, nie pokazując różnicy.
 *
 * UKŁAD: dwie kolumny, stara wartość przekreślona i przygaszona, nowa
 * wyróżniona. Klient ma zobaczyć zmianę od razu, nie po przeczytaniu
 * całości — dlatego zmienione pole ma własny znacznik po lewej, a nie samo
 * inne tło. Kolor bywa jedynym nośnikiem tylko dla tych, którzy go widzą.
 */
export function FloPreviewDiff({ preview }: { preview: DiffPreview }) {
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="text-[var(--ff-text-muted)]">
        <tr className="border-b border-[var(--ff-border)]">
          <th className="pb-1.5 font-medium">Pole</th>
          <th className="pb-1.5 font-medium">Było</th>
          <th className="pb-1.5 font-medium">Jest</th>
        </tr>
      </thead>

      <tbody>
        {preview.rows.map((row) => (
          <tr
            key={row.field}
            className="border-b border-[var(--ff-row-divider)] last:border-b-0"
          >
            <td className="py-1.5 pr-2 align-top text-[var(--ff-text-muted)]">
              <span aria-hidden className="mr-1 text-[var(--ff-accent)]">
                ●
              </span>
              {row.field}
            </td>
            <td className="py-1.5 pr-2 align-top break-words line-through opacity-60">
              {row.before}
            </td>
            <td className="py-1.5 align-top font-medium break-words text-[var(--ff-text-strong)]">
              {row.after}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
