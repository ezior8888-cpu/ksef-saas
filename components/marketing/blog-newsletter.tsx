'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';

/**
 * Karta newslettera na /blog (BUG-003). Lekki klient — zapisuje e-mail do
 * akcji marketingowej; tu bez backendu (placeholder pre-launch), pokazuje
 * potwierdzenie lokalnie, żeby UX był kompletny w nowym layoucie bento.
 */
export function BlogNewsletter() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <p className="text-sm font-semibold text-[var(--marketing-text)]">
        Bądź na bieżąco z KSeF
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--marketing-muted)]">
        Krótki mail, gdy zmieniają się przepisy albo wychodzi nowy poradnik.
        Bez spamu — wypisz się jednym kliknięciem.
      </p>

      {sent ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--marketing-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--marketing-accent)_12%,transparent)] px-4 py-3 text-[13px] font-medium text-[var(--marketing-accent)]">
          <Check className="h-4 w-4" aria-hidden />
          Zapisano — sprawdź skrzynkę.
        </div>
      ) : (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setSent(true);
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="twoj@email.pl"
            className="w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-muted)] outline-none transition-colors focus:border-[color-mix(in_srgb,var(--marketing-accent)_45%,transparent)]"
          />
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--marketing-accent)] px-4 py-2.5 text-sm font-semibold text-[#04210f] transition-colors hover:bg-[var(--marketing-accent-hover)]"
          >
            Zapisz się
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </form>
      )}
    </div>
  );
}
