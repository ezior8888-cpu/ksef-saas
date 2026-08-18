import Link from 'next/link';

import '@/styles/zova.css';

/**
 * Strona 404 w stylu landingu. Bez nagłówka i stopki — z błędu użytkownik
 * ma wrócić na stronę główną albo poszukać w pomocy, a nie zwiedzać serwis.
 */
export default function NotFound() {
  return (
    <div className="zova flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-5 h-[520px] rounded-[20px]"
        style={{
          background:
            'linear-gradient(180deg, #fff 0%, #eff5fe 70%, #dbe8fb 100%)',
        }}
      />

      <div className="relative flex max-w-[550px] flex-col items-center gap-6">
        <span className="z-tiny inline-flex items-center gap-2 rounded-full border border-[var(--z-300)] bg-white/70 px-3 py-1.5">
          <span className="size-1.5 rounded-full bg-[var(--z-blue)]" />
          Błąd 404
        </span>

        <h1 className="z-h2">Tej strony u nas nie ma</h1>

        <p className="z-lead text-[var(--z-muted)]">
          Adres jest nieaktualny albo zawiera literówkę. Wróć na stronę
          główną, a jeśli czegoś konkretnego szukasz, zajrzyj do pomocy.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="z-body inline-flex items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
          >
            Strona główna
          </Link>
          <Link
            href="/pomoc"
            className="z-body inline-flex items-center rounded-[12px] border border-[var(--z-300)] bg-white px-5 py-3.5 font-medium text-[var(--z-black)] transition-colors hover:bg-[var(--z-50)]"
          >
            Centrum pomocy
          </Link>
        </div>
      </div>
    </div>
  );
}
