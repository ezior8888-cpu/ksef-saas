import fs from 'fs';
import path from 'path';

import matter from 'gray-matter';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';

import { BlogNewsletter } from '@/components/marketing/blog-newsletter';

export const metadata: Metadata = {
  title: 'Blog KSeF SaaS — KSeF 2026, OCR, KPiR, mikrofirmy',
  description:
    'Praktyczne porady dla freelancerów i mikrofirm: jak przygotować się do KSeF, jak optymalizować KPiR, jak walczyć z dłużnikami.',
};

const POSTS_PER_PAGE = 6;

interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: number;
  tags: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parsePostFile(file: string, fullPath: string): BlogPost | null {
  if (!file.endsWith('.mdx')) return null;
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data } = matter(fileContents);

  if (!isNonEmptyString(data.title) || !isNonEmptyString(data.description) || !isNonEmptyString(data.date)) {
    return null;
  }
  const dateParsed = new Date(data.date);
  if (Number.isNaN(dateParsed.getTime())) return null;

  const readTime = typeof data.readTime === 'number' && Number.isFinite(data.readTime) ? data.readTime : 5;
  const tags = isStringArray(data.tags) ? data.tags : [];

  return {
    slug: file.replace(/\.mdx$/u, ''),
    title: data.title,
    description: data.description,
    date: data.date,
    readTime,
    tags,
  };
}

function getAllPosts(): BlogPost[] {
  const blogDir = path.join(process.cwd(), 'content/blog');
  if (!fs.existsSync(blogDir)) return [];

  const files = fs.readdirSync(blogDir);
  return files
    .map((file) => parsePostFile(file, path.join(blogDir, file)))
    .filter((p): p is BlogPost => p !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Deterministyczna „okładka" karty (render techno) — bez plików graficznych. */
const COVERS = [
  'radial-gradient(120%_120%_at_0%_0%,color-mix(in_srgb,var(--marketing-accent)_22%,transparent),transparent_60%),linear-gradient(135deg,#1b1c26,#23242f)',
  'radial-gradient(120%_120%_at_100%_0%,rgba(99,102,241,0.25),transparent_60%),linear-gradient(135deg,#202130,#191a23)',
  'radial-gradient(120%_120%_at_50%_120%,color-mix(in_srgb,var(--marketing-accent)_20%,transparent),transparent_60%),linear-gradient(135deg,#1d1e27,#26222f)',
  'radial-gradient(120%_120%_at_0%_100%,rgba(217,119,34,0.22),transparent_60%),linear-gradient(135deg,#221f2b,#1a1b24)',
];

function coverFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length].replace(/_/g, ' ');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface BlogPageProps {
  searchParams: Promise<{ cat?: string; page?: string }>;
}

export default async function BlogPage(props: BlogPageProps) {
  const sp = await props.searchParams;
  const all = getAllPosts();

  // Kategorie (z tagów) + liczność.
  const counts = new Map<string, number>();
  for (const p of all) {
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const activeCat = sp.cat && counts.has(sp.cat) ? sp.cat : null;
  const filtered = activeCat ? all.filter((p) => p.tags.includes(activeCat)) : all;

  const totalPages = Math.max(1, Math.ceil(filtered.length / POSTS_PER_PAGE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);
  const posts = filtered.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);

  const catHref = (cat: string | null) => (cat ? `/blog?cat=${encodeURIComponent(cat)}` : '/blog');
  const pageHref = (p: number) =>
    `/blog?${new URLSearchParams({ ...(activeCat ? { cat: activeCat } : {}), page: String(p) }).toString()}`;

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-14 lg:px-8 lg:py-20">
      {/* HERO — dwukolumnowy, asymetryczny */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <div>
          <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--marketing-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--marketing-accent)_12%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--marketing-accent)]">
            Blog · Wiedza KSeF
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--marketing-text)] sm:text-5xl lg:text-6xl">
            Praktyczna wiedza{' '}
            <span className="text-[var(--marketing-accent)]">o KSeF i KPiR.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--marketing-muted)]">
            Bez clickbaitu i &bdquo;10 powodów&hellip;&rdquo;. Tylko to, co
            naprawdę pomaga mikrofirmie ogarnąć faktury, koszty i urząd
            skarbowy.
          </p>
          <Link
            href="/register"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--marketing-accent)] px-5 py-2.5 text-sm font-semibold text-[#04210f] transition-colors hover:bg-[var(--marketing-accent-hover)]"
          >
            Załóż konto za darmo
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {/* Mockup aplikacji */}
        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_70%_30%,color-mix(in_srgb,var(--marketing-accent)_16%,transparent),transparent_70%)] blur-2xl"
            aria-hidden
          />
          <div className="rounded-3xl border border-white/10 bg-[#16171f] p-3 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.7)]">
            <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#1d1e27] p-5">
              <div className="flex items-center justify-between">
                <div className="h-2.5 w-24 rounded-full bg-white/15" />
                <div className="h-5 w-16 rounded-full bg-[color-mix(in_srgb,var(--marketing-accent)_22%,transparent)]" />
              </div>
              <div className="mt-5 space-y-3">
                {[88, 64, 76].map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-white/8" />
                    <div className="h-2.5 rounded-full bg-white/10" style={{ width: `${w}%` }} />
                    <div className="ml-auto h-2.5 w-10 rounded-full bg-[color-mix(in_srgb,var(--marketing-accent)_30%,transparent)]" />
                  </div>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="h-2 w-8 rounded-full bg-white/10" />
                    <div className="mt-2 h-3 w-12 rounded-full bg-white/20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TREŚĆ — asymetryczny układ 25 / 75 */}
      <section className="mt-16 grid gap-8 lg:mt-24 lg:grid-cols-[260px_1fr] lg:gap-12">
        {/* Lewa kolumna: filtry + newsletter */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--marketing-muted)]">
              Kategorie
            </p>
            <nav className="space-y-1">
              <CatLink href={catHref(null)} label="Wszystkie" count={all.length} active={!activeCat} />
              {categories.map((c) => (
                <CatLink
                  key={c.name}
                  href={catHref(c.name)}
                  label={c.name}
                  count={c.count}
                  active={activeCat === c.name}
                />
              ))}
            </nav>
          </div>

          <BlogNewsletter />
        </aside>

        {/* Prawa kolumna: siatka kart 2×2 */}
        <div>
          {posts.length === 0 ? (
            <p className="rounded-3xl border border-white/10 bg-white/[0.02] py-20 text-center text-[var(--marketing-muted)]">
              Brak wpisów w tej kategorii.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <div
                    className="aspect-[16/9] w-full"
                    style={{ backgroundImage: coverFor(post.slug) }}
                    aria-hidden
                  />
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--marketing-muted)]">
                      <span className="text-[var(--marketing-accent)]">
                        {post.tags[0] ?? 'KSeF'}
                      </span>
                      <span>{post.readTime} min</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-[var(--marketing-text)] transition-colors group-hover:text-[var(--marketing-accent)]">
                      {post.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--marketing-muted)]">
                      {post.description}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-5 text-[12px]">
                      <time dateTime={post.date} className="text-[var(--marketing-muted)]">
                        {formatDate(post.date)}
                      </time>
                      <span className="inline-flex items-center gap-1 font-medium text-[var(--marketing-text)] transition-all group-hover:gap-1.5 group-hover:text-[var(--marketing-accent)]">
                        Czytaj więcej
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Paginacja */}
          {totalPages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-2">
              <PagerArrow href={pageHref(page - 1)} disabled={page === 1} dir="prev" />
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={pageHref(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors ${
                    p === page
                      ? 'bg-[var(--marketing-accent)] text-[#04210f]'
                      : 'border border-white/10 text-[var(--marketing-muted)] hover:border-white/25 hover:text-[var(--marketing-text)]'
                  }`}
                >
                  {String(p).padStart(2, '0')}
                </Link>
              ))}
              <PagerArrow href={pageHref(page + 1)} disabled={page === totalPages} dir="next" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CatLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-full px-4 py-2 text-sm transition-colors ${
        active
          ? 'bg-[var(--marketing-accent)] font-semibold text-[#04210f]'
          : 'text-[var(--marketing-muted)] hover:bg-white/[0.04] hover:text-[var(--marketing-text)]'
      }`}
    >
      <span className="truncate capitalize">{label}</span>
      <span className={active ? 'text-[#04210f]/70' : 'text-[var(--marketing-muted)]'}>
        {count}
      </span>
    </Link>
  );
}

function PagerArrow({
  href,
  disabled,
  dir,
}: {
  href: string;
  disabled: boolean;
  dir: 'prev' | 'next';
}) {
  const Icon = dir === 'prev' ? ArrowLeft : ArrowRight;
  if (disabled) {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/8 text-[var(--marketing-muted)] opacity-40">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[var(--marketing-muted)] transition-colors hover:border-white/25 hover:text-[var(--marketing-text)]"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </Link>
  );
}
