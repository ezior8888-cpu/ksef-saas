'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import '@/styles/zova.css';

/**
 * Błąd krytyczny — ten komponent zastępuje CAŁY dokument, więc renderuje
 * własne `<html>` i `<body>`. Wcześniej pokazywał domyślną stronę błędu
 * Next.js, czyli surowy komunikat na białym tle bez śladu naszej marki.
 *
 * Nie korzystamy tu z komponentów landingu: skoro aplikacja właśnie się
 * wywróciła, strona awaryjna nie może zależeć od niczego, co też mogło paść.
 * Stąd czysty znacznik i style wpisane wprost.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pl">
      <body>
        <div className="zova flex min-h-screen flex-col items-center justify-center px-5 text-center">
          <div className="flex max-w-[550px] flex-col items-center gap-6">
            <span className="z-tiny inline-flex items-center gap-2 rounded-full border border-[var(--z-300)] bg-white px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-[var(--z-red)]" />
              Coś poszło nie tak
            </span>

            <h1 className="z-h2">Chwilowo mamy usterkę</h1>

            <p className="z-lead text-[var(--z-muted)]">
              Zgłoszenie już do nas poszło i się tym zajmujemy. Odśwież
              stronę za moment, a jeśli problem wróci, napisz do nas.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="z-body inline-flex items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
              >
                Odśwież stronę
              </button>
              {/* Celowo zwykły <a>, nie <Link>: to jest strona awaryjna
                  zastępująca cały dokument. Router Next.js mógł paść razem
                  z aplikacją, więc powrót musi być zwykłym przeładowaniem. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="z-body inline-flex items-center rounded-[12px] border border-[var(--z-300)] bg-white px-5 py-3.5 font-medium text-[var(--z-black)] transition-colors hover:bg-[var(--z-50)]"
              >
                Strona główna
              </a>
            </div>

            {error.digest ? (
              <p className="z-small text-[var(--z-700)]">
                Numer zgłoszenia: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
