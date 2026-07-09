import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, MonitorSmartphone, Smartphone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'FaktFlow na telefon — aplikacja mobilna wkrótce',
  description:
    'Aplikacja mobilna FaktFlow jest w przygotowaniu. Do czasu premiery korzystaj z FaktFlow na komputerze.',
  robots: { index: false },
};

/**
 * BUG-008: telefony nie wchodzą do panelu aplikacji — proxy przekierowuje
 * je tutaj. Landing pozostaje dostępny; ta strona tłumaczy dlaczego i
 * wskazuje sklepy (badge'e „wkrótce" do podmiany na prawdziwe linki
 * po publikacji w App Store / Google Play).
 */
export default function MobilePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <div className="relative mb-8">
        <div
          className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(60%_60%_at_50%_50%,color-mix(in_srgb,var(--marketing-accent)_20%,transparent),transparent_70%)] blur-xl"
          aria-hidden
        />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04]">
          <Smartphone className="h-9 w-9 text-[var(--marketing-accent)]" aria-hidden />
        </div>
      </div>

      <h1 className="marketing-hero-title text-3xl sm:text-4xl">
        Aplikacja mobilna jest w przygotowaniu
      </h1>
      <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--marketing-muted)]">
        Panel FaktFlow projektujemy na telefon od nowa — dlatego na razie nie
        udostępniamy go w przeglądarce mobilnej. Zaloguj się z komputera, a po
        premierze pobierzesz aplikację prosto ze sklepu.
      </p>

      {/* Badge'e sklepów — placeholdery do podmiany po publikacji. */}
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <StoreBadge store="App Store" />
        <StoreBadge store="Google Play" />
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <p className="inline-flex items-center gap-2 text-sm text-[var(--marketing-muted)]">
          <MonitorSmartphone className="h-4 w-4" aria-hidden />
          Na komputerze wszystko działa już teraz.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-[var(--marketing-text)] transition-colors hover:border-white/25"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Wróć na stronę główną
        </Link>
      </div>
    </div>
  );
}

function StoreBadge({ store }: { store: 'App Store' | 'Google Play' }) {
  return (
    <span
      className="inline-flex cursor-not-allowed select-none flex-col items-start rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-left opacity-80"
      aria-disabled
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--marketing-muted)]">
        Wkrótce w
      </span>
      <span className="text-sm font-semibold text-[var(--marketing-text)]">{store}</span>
    </span>
  );
}
