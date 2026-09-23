'use client';

import { useEffect, useRef, useState } from 'react';

import { finishSignInFromFragment, type FinishSignInResult } from '@/lib/auth/finish-sign-in';

import '@/styles/zova.css';

/**
 * Czyści historyczne linki z tokenami w kotwicy bez zmiany bieżącej sesji.
 * Nowe logowania i reset hasła kończą się przez PKCE w /auth/callback.
 */
export default function FinishPage() {
  const [blad, setBlad] = useState<string | null>(null);
  const completion = useRef<Promise<FinishSignInResult> | null>(null);

  useEffect(() => {
    let active = true;
    // StrictMode replays the effect. Reuse the result after URL cleanup.
    if (!completion.current) {
      completion.current = finishSignInFromFragment({
        fragment: window.location.hash,
        clearFragment: () => window.history.replaceState(null, '', window.location.pathname),
      });
    }
    void completion.current.then((result) => {
      if (!active) return;
      setBlad(result.error === 'legacy_link'
        ? 'Ten link logowania nie jest już obsługiwany. Zaloguj się standardowo lub poproś o nowy link do zmiany hasła.'
        : 'Nie udało się potwierdzić linku. Zaloguj się lub poproś o nowy link do zmiany hasła.');
    }).catch(() => {
      if (active) setBlad('Nie udało się dokończyć logowania. Spróbuj ponownie.');
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="zova flex min-h-screen items-center justify-center px-5 text-center">
      <div className="flex max-w-[420px] flex-col items-center gap-4">
        {blad ? (
          <>
            <h1 className="z-h4">Nie udało się dokończyć logowania</h1>
            <p className="z-body text-[var(--z-muted)]">{blad}</p>
            <a
              href="/login"
              className="z-body mt-2 inline-flex items-center rounded-[12px] bg-[var(--z-black)] px-5 py-3.5 font-medium text-white"
            >
              Wróć do logowania
            </a>
            <a href="/forgot-password" className="z-body text-[var(--z-muted)] underline">
              Poproś o nowy link do zmiany hasła
            </a>
          </>
        ) : (
          <p className="z-lead text-[var(--z-muted)]">Sprawdzam link…</p>
        )}
      </div>
    </div>
  );
}
