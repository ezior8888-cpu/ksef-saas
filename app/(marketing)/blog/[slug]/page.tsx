import fs from 'fs';
import path from 'path';

import matter from 'gray-matter';
import { compileMDX } from 'next-mdx-remote/rsc';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import { cn } from '@/lib/utils';

type PageProps = { params: Promise<{ slug: string }> };

function blogDirPath(): string {
  return path.join(process.cwd(), 'content/blog');
}

function postFilePath(slug: string): string {
  return path.join(blogDirPath(), `${slug}.mdx`);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseMatterData(data: unknown): {
  title: string;
  description: string;
  date: string;
  readTime: number;
} | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!isNonEmptyString(d.title) || !isNonEmptyString(d.description) || !isNonEmptyString(d.date)) return null;
  if (Number.isNaN(new Date(d.date).getTime())) return null;
  const readTime =
    typeof d.readTime === 'number' && Number.isFinite(d.readTime) && d.readTime > 0 ? d.readTime : 5;
  return {
    title: d.title,
    description: d.description,
    date: d.date,
    readTime,
  };
}

export async function generateStaticParams() {
  const dir = blogDirPath();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => ({ slug: f.replace(/\.mdx$/u, '') }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const fullPath = postFilePath(slug);
  if (!fs.existsSync(fullPath)) {
    return { title: 'Blog' };
  }
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data } = matter(fileContents);
  const parsed = parseMatterData(data);
  if (!parsed) {
    return { title: 'Blog' };
  }
  return {
    title: `${parsed.title} | KSeF SaaS Blog`,
    description: parsed.description,
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const fullPath = postFilePath(slug);
  if (!fs.existsSync(fullPath)) notFound();

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);
  const parsed = parseMatterData(data);
  if (!parsed) notFound();

  const { content: compiledContent } = await compileMDX({
    source: content,
    options: { parseFrontmatter: false },
  });

  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Powrót do bloga
        </Link>

        <div className="mb-12">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <time dateTime={parsed.date}>
              {new Date(parsed.date).toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
            <span aria-hidden>·</span>
            <span>{parsed.readTime} min czytania</span>
          </div>
          <h1 className="font-display text-4xl leading-[1.1] font-semibold tracking-tighter-display md:text-5xl">
            {parsed.title}
          </h1>
          <p className="mt-6 text-xl leading-relaxed text-muted-foreground">{parsed.description}</p>
        </div>

        <div
          className={cn(
            'prose prose-lg max-w-none dark:prose-invert',
            'prose-headings:font-display prose-headings:tracking-tighter-text',
            'prose-h2:mt-12 prose-h2:mb-4 prose-h2:text-3xl',
            'prose-h3:mt-8 prose-h3:text-xl',
            'prose-p:leading-relaxed',
            'prose-a:text-foreground prose-a:underline prose-a:underline-offset-2',
            'prose-code:rounded prose-code:bg-foreground/5 prose-code:px-1 prose-code:text-foreground',
            'prose-blockquote:border-l-foreground prose-blockquote:bg-foreground/2',
          )}
        >
          {compiledContent}
        </div>
      </div>
    </article>
  );
}
