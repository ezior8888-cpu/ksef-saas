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
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Blog</p>
          <h1 className="font-display text-5xl leading-[1.1] font-semibold tracking-tighter-display md:text-6xl">
            Praktyczna wiedza o KSeF
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            Bez clickbaitu. Bez &quot;10 powodów dlaczego…&quot;. Tylko to, co potrzebujesz wiedzieć.
          </p>
        </div>

        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass transition-all duration-200 ease-apple hover:bg-glass-white-strong"
            >
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString('pl-PL', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
                <span aria-hidden>·</span>
                <span>{post.readTime} min czytania</span>
              </div>
              <h2 className="mb-2 font-display text-2xl font-semibold tracking-tighter-text group-hover:underline">
                {post.title}
              </h2>
              <p className="mb-4 leading-relaxed text-muted-foreground">{post.description}</p>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-glass-border bg-foreground/5 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}

          {posts.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">Wkrótce pojawią się tu nowe wpisy.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
