'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

export interface HelpSearchItem {
  slug: string;
  title: string;
  summary: string;
  categoryLabel: string;
}

/**
 * Client-side search po KB. Przy ~24 artykułach nie ma sensu indeksować
 * server-side — prosty filtr substring po tytule + summary jest instant.
 */
export function HelpSearch({ items }: { items: HelpSearchItem[] }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return items
      .filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.summary.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj w pomocy — np. „korekta faktury”, „błąd KSeF”…"
          className="w-full rounded-2xl border border-glass-border bg-glass-white py-3.5 pl-11 pr-4 text-sm outline-none backdrop-blur-glass focus:border-foreground/30"
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-glass-border bg-glass-white backdrop-blur-glass">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">
              Brak wyników dla „{query}”. Spróbuj innych słów albo zapytaj
              asystenta AI w panelu.
            </p>
          ) : (
            results.map((it) => (
              <Link
                key={it.slug}
                href={`/pomoc/${it.slug}`}
                className="block border-b border-glass-border/50 px-4 py-3 last:border-0 hover:bg-foreground/5"
              >
                <p className="text-sm font-medium">{it.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                  {it.categoryLabel} · {it.summary}
                </p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
