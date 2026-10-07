import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ffStatusPill, ffStatusTone, type FfStatusTone } from '@/lib/dashboard/ff-surface-classes';
import { sendErrorClassOf } from '@/lib/ksef/send-error-classes';

/**
 * „Pigułki" statusów z prototypu: tło = przyciemniony odcień roli, tekst =
 * kolor roli, bez obramowania. Kropka po lewej niesie status niezależnie od
 * samego koloru — dla osób nierozróżniających barw etykieta i kropka
 * wystarczają, a spinner zastępuje kropkę tam, gdzie coś trwa.
 */
const STATUS_MAP: Record<string, { label: string; tone: FfStatusTone }> = {
  draft: { label: 'Szkic', tone: 'neutral' },
  pending: { label: 'W kolejce', tone: 'warning' },
  queued: { label: 'W kolejce', tone: 'warning' },
  sending: { label: 'Wysyłanie', tone: 'info' },
  offline_queued: { label: 'Offline (do uzgodnienia)', tone: 'warning' },
  accepted: { label: 'Zaakceptowana', tone: 'success' },
  rejected: { label: 'Odrzucona', tone: 'danger' },
  failed: { label: 'Błąd', tone: 'danger' },
  received: { label: 'Odebrana', tone: 'violet' },
};

const FALLBACK: { label: string; tone: FfStatusTone } = {
  label: 'Nieznany',
  tone: 'neutral',
};

/**
 * `failed` z kodem z katalogu `ksef_error_codes` (00131): etykieta mówi, co
 * dalej — automat, operator czy klient (cykl życia faktury, sekcja 7).
 */
const FAILED_BY_CLASS: Record<string, { label: string; tone: FfStatusTone }> = {
  transient: { label: 'Błąd — ponawiamy', tone: 'warning' },
  hold: { label: 'Wstrzymana', tone: 'warning' },
  reconcile: { label: 'Do uzgodnienia', tone: 'warning' },
  setup: { label: 'Brak certyfikatu', tone: 'danger' },
  terminal: { label: 'Błąd treści', tone: 'danger' },
};

/**
 * Kody, dla których etykieta klasy myli: `ENV_MISMATCH` jest klasy terminal
 * (tylko szkic, D-A4-2), ale treść dokumentu jest w porządku.
 */
const FAILED_BY_CODE = new Map<string, { label: string; tone: FfStatusTone }>([
  ['ENV_MISMATCH', { label: 'Inne środowisko KSeF', tone: 'warning' }],
  ['ISSUE_DATE_PASSED', { label: 'Data wystawienia minęła', tone: 'warning' }],
]);

/** Klasa transient bez automatu (kod spoza `auto_requeue`, dokument po dacie wystawienia, brak danych). */
const FAILED_TRANSIENT_MANUAL: { label: string; tone: FfStatusTone } = { label: 'Błąd wysyłki', tone: 'danger' };

interface StatusBadgeProps {
  status: string;
  /** `invoices.last_error_code` — doprecyzowuje etykietę stanu `failed`. */
  errorCode?: string | null;
  /**
   * Czy automat naprawdę ponowi wysyłkę (`automaticResendExpected`). Bez tej
   * informacji znaczek nie obiecuje ponowienia: „Błąd wysyłki”.
   */
  automaticResend?: boolean;
  isLoading?: boolean;
}

export function StatusBadge({ status, errorCode, automaticResend, isLoading }: StatusBadgeProps) {
  const failedClass = status === 'failed' ? sendErrorClassOf(errorCode) : null;
  const byCode = status === 'failed' && errorCode ? FAILED_BY_CODE.get(errorCode) : undefined;
  const byClass = failedClass === 'transient' && automaticResend !== true
    ? FAILED_TRANSIENT_MANUAL
    : failedClass ? FAILED_BY_CLASS[failedClass] : undefined;
  const meta = byCode ?? byClass ?? STATUS_MAP[status] ?? FALLBACK;
  const showSpinner =
    isLoading === true ||
    status === 'queued' ||
    status === 'pending' ||
    status === 'sending';

  return (
    <span className={cn(ffStatusPill, ffStatusTone[meta.tone])}>
      {showSpinner ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden
        />
      )}
      {meta.label}
    </span>
  );
}
