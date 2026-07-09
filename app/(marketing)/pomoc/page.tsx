import type { Metadata } from 'next';
import Link from 'next/link';

import {
  getAllHelpArticles,
  HELP_CATEGORIES,
} from '@/lib/help/articles';
import { HelpSearch, type HelpSearchItem } from './_components/help-search';

export const metadata: Metadata = {
  title: 'Centrum pomocy — FaktFlow',
  description:
    'Poradniki i odpowiedzi na pytania o KSeF, wystawianie faktur, OCR paragonów, KPiR i rozliczenia. Pomoc dla mikrofirm i księgowych.',
};

export default function PomocPage() {
  const articles = getAllHelpArticles();

  const searchItems: HelpSearchItem[] = articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    categoryLabel:
      HELP_CATEGORIES.find((c) => c.id === a.category)?.label ?? a.category,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <div className="text-center">
        <h1 className="font-editorial text-4xl font-semibold sm:text-5xl">
          Centrum pomocy
        </h1>
        <p className="mt-3 text-[var(--marketing-muted)]">
          Poradniki krok po kroku. Nie znajdujesz odpowiedzi? Asystent AI w
          panelu odpowie w kilka sekund.
        </p>
      </div>

      <div className="mt-8">
        <HelpSearch items={searchItems} />
      </div>

      <div className="mt-12 space-y-10">
        {HELP_CATEGORIES.map((cat) => {
          const inCat = articles.filter((a) => a.category === cat.id);
          if (inCat.length === 0) return null;
          return (
            <section key={cat.id}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[var(--marketing-muted)]">
                  {cat.icon}
                </span>
                <h2 className="font-editorial text-xl font-semibold">
                  {cat.label}
                </h2>
              </div>
              <p className="mt-1 text-sm text-[var(--marketing-muted)]">
                {cat.description}
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {inCat.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/pomoc/${a.slug}`}
                      className="block rounded-2xl border border-glass-border bg-glass-white p-4 backdrop-blur-glass transition-colors hover:bg-foreground/5"
                    >
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--marketing-muted)]">
                        {a.summary}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {articles.length === 0 && (
          <p className="text-center text-sm text-[var(--marketing-muted)]">
            Artykuły pomocy są w przygotowaniu.
          </p>
        )}
      </div>

      <div className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-8 text-center backdrop-blur-glass">
        <h2 className="font-editorial text-xl font-semibold">
          Nie znalazłeś odpowiedzi?
        </h2>
        <p className="mt-2 text-sm text-[var(--marketing-muted)]">
          Zaloguj się i kliknij ikonę pomocy w prawym dolnym rogu panelu —
          asystent AI zna całą dokumentację FaktFlow.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center justify-center rounded-xl border border-glass-border bg-foreground/5 px-5 py-2.5 text-sm font-medium hover:bg-foreground/10"
        >
          Przejdź do panelu
        </Link>
      </div>
    </div>
  );
}
