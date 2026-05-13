'use client';

import { useState } from 'react';

export function BlogNewsletterForm() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setDone(true);
  }

  if (done) {
    return (
      <p className="text-sm leading-relaxed text-[var(--blog-text-excerpt)]">
        Dziękujemy! Na razie zapis jest demonstracyjny — wkrótce podłączymy prawdziwy newsletter.
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
      <button
        type="submit"
        className="ff-blog-newsletter-submit w-full rounded-xl py-3.5 text-sm font-bold transition-all"
      >
        Zapisz się
      </button>
    </form>
  );
}
