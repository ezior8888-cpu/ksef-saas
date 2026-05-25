import fs from 'fs';
import path from 'path';

import matter from 'gray-matter';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog KSeF SaaS — KSeF 2026, OCR, KPiR, mikrofirmy',
  description:
    'Praktyczne porady dla freelancerów i mikrofirm: jak przygotować się do KSeF, jak optymalizować KPiR, jak walczyć z dłużnikami.',
};

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

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <article>
      {/* Date strip */}
      <div className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-3 text-[10px] uppercase tracking-[0.25em] text-zinc-500 lg:px-8">
          <span>Wydanie I · Archiwum</span>
          <span>Praktyczne porady KSeF / KPiR</span>
          <span className="font-editorial text-base italic">Nº 04</span>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 py-16 lg:px-8 lg:py-24">
        {/* HERO */}
        <div className="mb-16 max-w-3xl">
          <p className="editorial-section-num mb-6 text-sm">— Blog</p>
          <h1 className="font-editorial text-[clamp(2.5rem,6vw,5.5rem)] font-medium leading-[0.95] tracking-[-0.02em]">
            Praktyczna wiedza{' '}
            <span className="italic text-emerald-700">
              o KSeF.
            </span>
          </h1>
          <p className="mt-8 max-w-xl font-editorial text-2xl leading-snug text-zinc-600">
            Bez clickbaitu. Bez &bdquo;10 powodów dlaczego&hellip;&rdquo;.{' '}
            <span className="italic">Tylko to, co potrzebujesz wiedzieć.</span>
          </p>
        </div>

        {/* Index — lista wpisów jak spis treści magazynu */}
        <div className="mb-6 flex items-baseline gap-4 border-b border-emerald-500/40 pb-4">
          <span className="editorial-section-num text-3xl">04.</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            Spis wpisów ({posts.length})
          </span>
        </div>

        <ol className="divide-y divide-white/[0.08] border-b border-emerald-500/40">
          {posts.map((post, i) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group block py-8 transition-colors hover:bg-zinc-50 lg:py-10"
              >
                <div className="grid grid-cols-12 gap-4 px-2 lg:gap-8 lg:px-4">
                  {/* Numer wpisu — italic cynober jak w rocznikach */}
                  <div className="col-span-2 lg:col-span-1">
                    <span className="editorial-section-num text-2xl lg:text-3xl">
                      {String(i + 1).padStart(2, '0')}.
                    </span>
                  </div>

                  {/* Tytuł + opis + tagi */}
                  <div className="col-span-10 lg:col-span-8">
                    <h2 className="font-editorial text-2xl font-medium leading-tight transition-colors group-hover:text-emerald-700 lg:text-3xl">
                      {post.title}
                    </h2>
                    <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600">
                      {post.description}
                    </p>
                    {post.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className="font-editorial text-xs italic text-zinc-500"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Metadata — data + czas czytania w pionowej kolumnie po prawej */}
                  <div className="col-span-12 mt-4 flex items-baseline gap-3 text-[10px] uppercase tracking-[0.22em] text-zinc-500 lg:col-span-3 lg:mt-0 lg:flex-col lg:items-end lg:gap-2 lg:text-right">
                    <time dateTime={post.date} className="font-editorial italic">
                      {new Date(post.date).toLocaleDateString('pl-PL', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </time>
                    <span className="hidden lg:inline" aria-hidden>
                      ·
                    </span>
                    <span>{post.readTime} min czytania</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>

        {posts.length === 0 ? (
          <p className="py-16 text-center font-editorial text-xl italic text-zinc-500">
            Wkrótce pojawią się tu nowe wpisy.
          </p>
        ) : null}
      </div>
    </article>
  );
}
