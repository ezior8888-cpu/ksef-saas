'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

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

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const h = new URLSearchParams(hash);

    const opis = h.get('error_description');
    if (opis) {
      setBlad(opis);
      return;
    }

    const access_token = h.get('access_token');
    const refresh_token = h.get('refresh_token');
    if (!access_token || !refresh_token) {
      router.replace('/login?error=auth_callback_missing_code');
      return;
    }

    const dokad = params.get('next') || '/dashboard';

    void (async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) {
        setBlad(error.message);
        return;
      }
      // czyścimy kotwicę, żeby token nie został w historii przeglądarki
      window.history.replaceState(null, '', window.location.pathname);
      router.replace(dokad);
    })();
  }, [params, router]);

  return (
    <div className="zova flex min-h-screen items-center justify-center px-5 text-center">
      <div className="flex max-w-[420px] flex-col items-center gap-4">
        {blad ? (
          <>
            <h1 className="z-h4">Link wygasł albo był już użyty</h1>
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
