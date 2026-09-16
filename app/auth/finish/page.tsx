'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { finishSignInFromFragment, type FinishSignInResult } from '@/lib/auth/finish-sign-in';

import '@/styles/zova.css';

/**
 * Dokończenie logowania z linku, w którym token siedzi w KOTWICY adresu.
 *
 * GoTrue odsyła tu z `#access_token=...&refresh_token=...` przy linkach
 * generowanych administracyjnie, magic linkach i części resetów hasła.
 * Kotwica NIE jest wysyłana na serwer, więc trasa `/auth/callback` nigdy
 * jej nie widziała i kończyła komunikatem o braku kodu. Stąd nie działał
 * reset hasła ani zaproszenia.
 *
 * Kotwica przeżywa przekierowanie 3xx, o ile cel sam jej nie ma — dlatego
 * `/auth/callback` może tu przekierować bez utraty tokenu.
 */
function Finish() {
  const router = useRouter();
  const params = useSearchParams();
  const [blad, setBlad] = useState<string | null>(null);

  const completion = useRef<Promise<FinishSignInResult> | null>(null);

  useEffect(() => {
    let active = true;
    // StrictMode replays the effect. Reuse the in-flight result after URL cleanup.
    if (!completion.current) {
      completion.current = finishSignInFromFragment({
        fragment: window.location.hash,
        destination: params.get('next'),
        clearFragment: () => window.history.replaceState(null, '', window.location.pathname),
        setSession: (tokens) => createClient().auth.setSession(tokens),
      });
    }
    void completion.current.then((result) => {
      if (!active) return;
      if (result.ok) router.replace(result.destination);
      else if (result.error === 'missing_code') router.replace('/login?error=auth_callback_missing_code');
      else setBlad('Nie udało się potwierdzić linku. Spróbuj ponownie lub poproś o nowy link.');
    }).catch(() => {
      if (active) setBlad('Nie udało się dokończyć logowania. Spróbuj ponownie.');
    });
    return () => { active = false; };
  }, [params, router]);

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
          </>
        ) : (
          <p className="z-lead text-[var(--z-muted)]">Loguję Cię…</p>
        )}
      </div>
    </div>
  );
}

export default function FinishPage() {
  return (
    <Suspense fallback={null}>
      <Finish />
    </Suspense>
  );
}
