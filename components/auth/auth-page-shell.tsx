import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import '@/styles/zova.css';

import { AuthDotGrid } from './auth-dot-grid';

type AuthPageShellProps = {
  children: React.ReactNode;
};

const LOGO = '/landing/img/oKmGzYlWFu13ruJRasum68wrh5Y.png';

/**
 * Shell stron logowania i rejestracji w stylu landingu.
 *
 * Układ dwukolumnowy: formularz po lewej, panel 3D po prawej. Panel znika
 * poniżej `lg`, bo na telefonie zabiera całą wysokość ekranu, a formularz
 * i tak jest tam najważniejszy.
 *
 * Klasa `.zova` włącza tokeny landingu. Jest potrzebna, bo `<html>` ma na
 * stałe klasę `dark`, a te ekrany mają być jasne jak reszta strony.
 */
export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="zova relative min-h-screen w-full overflow-hidden">
      {/* Prawa połowa: siatka kropek reagująca na kursor, na gradiencie
          z nagłówka strony głównej. Warstwa jest interaktywna, więc NIE ma
          `pointer-events-none` — inaczej kropki nie widziałyby myszy. */}
      <div
        className="absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden lg:block"
        style={{
          background:
            'linear-gradient(160deg, #fff 0%, #eff5fe 45%, #dbe8fb 100%)',
        }}
      >
        <AuthDotGrid />
      </div>

      <Link
        href="/"
        className="z-small absolute left-5 top-5 z-20 inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--z-300)] bg-white px-3 py-2 font-medium text-[var(--z-black)] transition-colors hover:bg-[var(--z-50)] sm:left-7 sm:top-7"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Strona główna
      </Link>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1300px] grid-cols-1 items-center gap-16 px-5 py-24 md:px-[var(--z-gutter)] lg:grid-cols-2">
        {/* ── kolumna formularza ─────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-[420px]">
          <Link href="/" className="mb-8 inline-flex items-center">
            <Image src={LOGO} alt="FaktFlow" width={32} height={32} priority />
          </Link>

          {children}

          <p className="z-small mt-8 text-[var(--z-muted)]">
            Zakładając konto akceptujesz{' '}
            <a
              href="/legal/regulamin"
              className="underline underline-offset-2 transition-opacity hover:opacity-70"
            >
              Regulamin
            </a>{' '}
            i{' '}
            <a
              href="/legal/polityka-prywatnosci"
              className="underline underline-offset-2 transition-opacity hover:opacity-70"
            >
              Politykę Prywatności
            </a>
            .
          </p>
        </div>

        {/* Kolumna po prawej jest pusta w warstwie treści: całą robotę
            robi tło z kropkami. Hasło leży na wierzchu, ale nie przechwytuje
            myszy, żeby kropki reagowały także pod tekstem. */}
        <div className="pointer-events-none hidden lg:flex lg:flex-col lg:items-center lg:justify-center">
          <p className="z-h4 max-w-[420px] text-center font-normal text-[var(--z-black)]">
            Wystawiasz fakturę, my wysyłamy ją do KSeF i pilnujemy
            potwierdzenia.
          </p>
        </div>
      </div>
    </div>
  );
}
