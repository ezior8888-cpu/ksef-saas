/**
 * Szablon segmentu `(dashboard)` — Next.js remountuje `template` przy każdej
 * nawigacji między podstronami, więc to idealne miejsce na fade-in.
 *
 * Klasa `ff-route-template` (definicja w `app/globals.css`) animuje wyłącznie
 * `transform` + `opacity` (GPU-compositable, bez layout/paint) przez 220 ms.
 * Brak `framer-motion`, brak JS — zero kosztu w runtime, jedynie krótki
 * compositor pass przy mountcie.
 *
 * Bezpieczne dla `.ff-glass-pane`, bo karty nie używają już `backdrop-filter`
 * (animowany `opacity` na rodzicu nie wymusza re-rasteru filtra).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="ff-route-template min-h-0 w-full min-w-0">{children}</div>
  );
}
