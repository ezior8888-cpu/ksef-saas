'use client';

import { useState, useTransition } from 'react';

import { subscribeNewsletterAction } from '@/app/actions/newsletter';

export function BlogNewsletterForm() {
  const [email, setEmail] = useState('');
  // Honeypot — pole niewidoczne dla człowieka; wypełnia je tylko bot.
  const [website, setWebsite] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await subscribeNewsletterAction({ email, website });
      if (result.success) {
        setDone(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <p className="text-sm leading-relaxed text-[var(--blog-text-excerpt)]">
        Dziękujemy! Jesteś na liście — odezwiemy się, gdy pojawi się coś
        wartego Twojej uwagi.
      </p>
    );
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label htmlFor="blog-newsletter-email" className="sr-only">
        Twój e-mail
      </label>
      <input
        id="blog-newsletter-email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        placeholder="Twój e-mail"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--blog-text-title)] outline-none transition-all placeholder:text-[var(--blog-text-metadata)]/60 focus:border-transparent focus:ring-2 focus:ring-[var(--ml-primary)]"
      />
      {/* Honeypot: poza viewportem + poza tab-order; nie `display:none`,
          bo część botów pomija pola niewidoczne w CSSOM. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(ev) => setWebsite(ev.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="ff-blog-newsletter-submit w-full rounded-xl py-3.5 text-sm font-bold transition-all disabled:opacity-60"
      >
        {pending ? 'Zapisuję…' : 'Zapisz się'}
      </button>
    </form>
  );
}
