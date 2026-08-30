'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { savePrefs } from '@/app/actions/flo';
import { floKindLabel } from '@/components/flo/kind-labels';
import { countLabel, FLO_FORMS } from '@/components/flo/format';
import type { FloPrefs, FloProposalKind } from '@/types/flo';

/**
 * Formularz ustawień agenta.
 *
 * Zapis idzie od razu po zmianie, bez przycisku „Zapisz”. Powód: każde
 * ustawienie tutaj jest pojedynczym przełącznikiem, a nie formularzem
 * z zależnościami — przycisk dokładałby krok i tworzył stan „zmienione,
 * ale niezapisane”, w którym klient nie wie, czy cisza nocna już działa.
 *
 * Gdy zapis się nie uda, wracamy do poprzedniej wartości i mówimy o tym
 * wprost. Przełącznik, który wygląda na włączony, a nie jest, to gorsze
 * kłamstwo niż komunikat o niepowodzeniu.
 */
export function FloSettingsForm({ prefs }: { prefs: FloPrefs }) {
  const router = useRouter();
  const [current, setCurrent] = useState(prefs);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function apply(patch: Partial<FloPrefs>) {
    const before = current;
    setCurrent({ ...current, ...patch });
    setSaving(true);
    setNotice(null);

    try {
      await savePrefs(patch);
      router.refresh();
    } catch {
      setCurrent(before);
      setNotice('Nie udało mi się zapisać tej zmiany. Spróbuj za chwilę.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--ff-text-strong)]">
          Ustawienia Flo
        </h1>
        <p className="mt-1.5 text-sm text-[var(--ff-text-muted)]">
          Flo sam robi tylko to, co da się cofnąć. Przed każdą wysyłką na
          zewnątrz pyta — i tego nie da się wyłączyć. Tutaj ustawiasz, kiedy
          i którędy ma się odzywać.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--ff-text-strong)]">
          Jak mam się odzywać
        </h2>

        <FloToggle
          id="flo-push"
          label="Powiadomienia w telefonie"
          hint="Najwyżej jedno dziennie. Wyjątek: cztery sprawy alarmowe — termin Offline24, odrzucenie faktury przez KSeF, wygasający certyfikat i termin podatkowy bliżej niż 72 godziny."
          checked={current.pushEnabled}
          disabled={saving}
          onChange={(next) => void apply({ pushEnabled: next })}
        />

        <FloToggle
          id="flo-email"
          label="Powiadomienia mailem"
          hint="Podsumowanie domknięcia miesiąca, raz w miesiącu."
          checked={current.emailEnabled}
          disabled={saving}
          onChange={(next) => void apply({ emailEnabled: next })}
        />
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--ff-text-strong)]">
          Cisza nocna
        </h2>
        <p className="text-xs text-[var(--ff-text-muted)]">
          W tych godzinach milczę. Sprawy poczekają do rana w wątku.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <FloTimeField
            id="flo-quiet-from"
            label="Od"
            value={current.quietFrom}
            disabled={saving}
            onChange={(next) => void apply({ quietFrom: next })}
          />
          <FloTimeField
            id="flo-quiet-to"
            label="Do"
            value={current.quietTo}
            disabled={saving}
            onChange={(next) => void apply({ quietTo: next })}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface)] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--ff-text-strong)]">
            Wyciszone sprawy
          </h2>
          <span className="text-[11px] text-[var(--ff-text-faint)]">
            {countLabel(current.mutedKinds.length, FLO_FORMS.sprawa)}
          </span>
        </div>

        {current.mutedKinds.length === 0 ? (
          <p className="text-xs text-[var(--ff-text-muted)]">
            Nic nie jest wyciszone. Gdy dwa razy odrzucisz ten sam rodzaj
            sprawy, przestanę o nim pisać i znajdziesz go tutaj.
          </p>
        ) : (
          <ul className="space-y-2">
            {current.mutedKinds.map((kind) => (
              <li
                key={kind}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--ff-border)] bg-[var(--ff-surface-container-low)] p-2.5"
              >
                <span className="min-w-0 flex-1 text-xs text-[var(--ff-text-soft)]">
                  {floKindLabel(kind)}
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void apply({
                      mutedKinds: current.mutedKinds.filter(
                        (k: FloProposalKind) => k !== kind,
                      ),
                    })
                  }
                  className="rounded-lg border border-[var(--ff-border)] px-2.5 py-1 text-[11px] text-[var(--ff-text-muted)] transition-colors hover:border-[var(--ff-border-strong)] hover:text-[var(--ff-text)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Przywróć
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice ? (
        <p role="status" className="text-xs text-[var(--ff-text-soft)]">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function FloToggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--ff-accent)] disabled:cursor-not-allowed"
      />
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-xs font-medium text-[var(--ff-text)]">
          {label}
        </span>
        <span className="block text-[11px] text-[var(--ff-text-muted)]">
          {hint}
        </span>
      </label>
    </div>
  );
}

function FloTimeField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] text-[var(--ff-text-muted)]"
      >
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded-md border border-[var(--ff-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--ff-text)] focus:border-[var(--ff-border-strong)] focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
