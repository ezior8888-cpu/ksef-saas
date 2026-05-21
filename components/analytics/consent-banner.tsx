'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

import { getBrowserPosthog, isBrowserPosthogReady } from '@/lib/analytics/browser-posthog';
import {
  getAnalyticsConsent,
  isAnalyticsConfigured,
  setAnalyticsConsent,
} from '@/lib/analytics/consent';

/**
 * Lekki opt-in baner zgody na analytics (Faza 31 Krok 8).
 *
 * Pokazuje się raz (status `unset`). Po decyzji userzy nie widzą go więcej
 * — można cofnąć zgodę z `/settings/notifications` w przyszłości (Faza 38
 * przyniesie pełny granularny baner cookie).
 *
 * Wybór:
 *   - „Akceptuję" → `opt_in_capturing()` + session replay włącza się
 *   - „Tylko niezbędne" → consent denied, PostHog dalej w opt-out
 *
 * Render warunkowy — bez NEXT_PUBLIC_POSTHOG_KEY baner nie ma sensu (i tak
 * nic nie wysyłamy).
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    if (getAnalyticsConsent() === 'unset') setVisible(true);
  }, []);

  if (!visible) return null;

  const grant = () => {
    setAnalyticsConsent(true);
    const ph = getBrowserPosthog();
    if (ph && isBrowserPosthogReady()) {
      ph.opt_in_capturing();
      // Domyślnie session_recording jest disabled w init; opt_in nie odpala
      // nagrywania — potrzebny restart sesji. Najprościej: page reload.
      // Bez reload tracking eventów działa, replay włączy się przy kolejnej wizycie.
    }
    setVisible(false);
  };

  const deny = () => {
    setAnalyticsConsent(false);
    const ph = getBrowserPosthog();
    if (ph && isBrowserPosthogReady()) {
      ph.opt_out_capturing();
    }
    setVisible(false);
  };

  return (
    <div className="fixed bottom-5 left-5 right-5 z-[60] mx-auto max-w-2xl rounded-2xl border border-glass-border bg-background/95 px-4 py-3 shadow-xl backdrop-blur-glass-lg sm:left-auto sm:right-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">
          <p className="font-medium">Analityka i pomoc w rozwoju produktu</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Zbieramy anonimowe statystyki użycia (PostHog, hostowane w EU),
            żeby naprawiać błędy i ulepszać FaktFlow. Bez Twojej zgody nic nie
            śledzimy poza najważniejszymi zdarzeniami biznesowymi (rejestracja,
            płatność). Szczegóły:{' '}
            <Link
              href="/legal/polityka-prywatnosci"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Polityka prywatności
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          aria-label="Zamknij — Tylko niezbędne"
          onClick={deny}
          className="rounded-full p-1.5 transition-colors hover:bg-foreground/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={grant}
          className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Akceptuję
        </button>
        <button
          type="button"
          onClick={deny}
          className="rounded-xl border border-glass-border px-4 py-2 text-sm hover:bg-foreground/5"
        >
          Tylko niezbędne
        </button>
      </div>
    </div>
  );
}
