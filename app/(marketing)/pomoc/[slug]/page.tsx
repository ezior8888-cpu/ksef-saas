import fs from 'fs';
import path from 'path';

import { compileMDX } from 'next-mdx-remote/rsc';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import {
  getArticlesByCategory,
  getCategory,
  getHelpArticle,
} from '@/lib/help/articles';
import { cn } from '@/lib/utils';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const dir = path.join(process.cwd(), 'content/help');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => ({ slug: f.replace(/\.mdx$/u, '') }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) return { title: 'Pomoc — FaktFlow' };
  return {
    title: `${article.title} — Pomoc FaktFlow`,
    description: article.summary,
  };
}

export default async function HelpArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();

  const category = getCategory(article.category);
  // Powiązane artykuły z tej samej kategorii (max 4, bez bieżącego).
  const related = getArticlesByCategory(article.category)
    .filter((a) => a.slug !== article.slug)
    .slice(0, 4);

  const { content } = await compileMDX({
    source: article.content,
    options: { parseFrontmatter: false },
  });

  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <Link
          href="/pomoc"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Centrum pomocy
        </Link>

        <div className="mb-10">
          {category && (
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              {category.label}
            </p>
          )}
          <h1 className="font-display text-3xl leading-[1.15] font-semibold tracking-tighter-display md:text-4xl">
            {article.title}
          </h1>
          {article.updated && (
            <p className="mt-3 text-xs text-muted-foreground">
              Zaktualizowano:{' '}
              {new Date(article.updated).toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </div>

        <div
          className={cn(
            'prose prose-lg max-w-none dark:prose-invert',
            'prose-headings:font-display prose-headings:tracking-tighter-text',
            'prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-2xl',
            'prose-h3:mt-6 prose-h3:text-lg',
            'prose-p:leading-relaxed',
            'prose-a:text-foreground prose-a:underline prose-a:underline-offset-2',
            'prose-code:rounded prose-code:bg-foreground/5 prose-code:px-1 prose-code:text-foreground',
            'prose-blockquote:border-l-foreground prose-blockquote:bg-foreground/2',
          )}
        >
          {content}
        </div>

        {related.length > 0 && (
          <div className="mt-14 border-t border-glass-border pt-8">
            <h2 className="font-display text-lg font-semibold tracking-tighter-text">
              Zobacz też
            </h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/pomoc/${r.slug}`}
                    className="block rounded-2xl border border-glass-border bg-glass-white p-4 backdrop-blur-glass transition-colors hover:bg-foreground/5"
                  >
                    <p className="text-sm font-medium">{r.title}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
