import Image from 'next/image';
import Link from 'next/link';

import type { BlogPostEnriched } from '@/lib/blog-marketing-data';

const TONE_CLASS: Record<BlogPostEnriched['cardTone'], string> = {
  automatyzacja: 'text-[var(--blog-category-automatyzacja)]',
  podatki: 'text-[var(--blog-category-podatki)]',
  porady: 'text-[var(--blog-category-porady)]',
  ksef: 'text-[var(--blog-category-ksef)]',
};

export function BlogArticleCard({ post }: { post: BlogPostEnriched }) {
  const formatted = new Date(post.date).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <article
      className="ff-blog-glass-card group flex flex-col overflow-hidden rounded-[2.5rem] transition-all duration-500 hover:border-[var(--ml-primary)]/40 hover:shadow-2xl hover:shadow-[var(--ml-primary)]/5"
    >
      <div className="ff-blog-thumb-wrap relative h-64 overflow-hidden">
        <Image
          src={post.coverSrc}
          alt={post.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          sizes="(min-width: 1024px) 33vw, 90vw"
        />
      </div>
      <div className="flex flex-grow flex-col p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span
            className={`text-[10px] font-bold uppercase tracking-[0.2em] ${TONE_CLASS[post.cardTone]}`}
          >
            {post.cardLabel}
          </span>
          <span className="shrink-0 text-xs font-medium text-[var(--blog-text-metadata)]/80">
            {post.readTime} min czytania
          </span>
        </div>
        <h2 className="mb-3 text-xl font-bold leading-snug text-[var(--blog-text-title)] transition-colors group-hover:text-[var(--ml-primary)] md:text-2xl">
          {post.title}
        </h2>
        <p
          className="mb-6 line-clamp-2 text-sm font-light leading-[var(--blog-line-height-article)] text-[var(--blog-text-excerpt)] md:text-base"
        >
          {post.description}
        </p>
        <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-5">
          <time className="text-xs text-[var(--blog-text-metadata)]/80" dateTime={post.date}>
            {formatted}
          </time>
          <Link
            href={`/blog/${post.slug}`}
            className="flex items-center gap-1 text-sm font-bold text-[var(--ml-primary)] transition-all hover:gap-2"
          >
            Czytaj więcej
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
