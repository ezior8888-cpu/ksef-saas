import fs from 'fs';
import path from 'path';

import matter from 'gray-matter';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { asset } from '../_assets';
import { Rise } from '../_components/anim';
import { SiteFooter } from '../_components/closing';
import { IconSprite } from '../_components/icon-sprite';
import { MaskReveal, MaskRevealWords } from '../_components/mask-reveal';
import { SiteNav } from '../_components/site-nav';
import { Container } from '../_components/ui';

export const metadata: Metadata = {
  title: 'Blog | FaktFlow',
  description:
    'Poradniki o KSeF, fakturach i prowadzeniu małej firmy. Konkretnie, bez urzędowego żargonu.',
};

interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: number;
}

/**
 * Wpisy czytamy z `content/blog` tym samym sposobem co poprzednia wersja
 * listy (gray-matter na frontmatterze). Kolejność: od najnowszego.
 */
function getPosts(): Post[] {
  const dir = path.join(process.cwd(), 'content', 'blog');
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((file) => {
      const { data } = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
      return {
        slug: file.replace(/\.mdx$/, ''),
        title: String(data.title ?? ''),
        description: String(data.description ?? ''),
        date: String(data.date ?? ''),
        readTime: Number(data.readTime ?? 5),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Obrazki z szablonu krążą po kolei, bo wpisy nie mają własnych okładek. */
const OKLADKI = asset.blog;

const MIESIACE = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

function dataPl(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MIESIACE[d.getMonth()]} ${d.getFullYear()}`;
}

export default function BlogPage() {
  const posts = getPosts();

  return (
    <>
      <IconSprite />
      <SiteNav />

      {/* ── nagłówek: sekcja 704 px, tytuł w bloku 700 ──────────────── */}
      <header className="pb-10 pt-[128px]">
        <Container>
          <div className="flex max-w-[752px] flex-col gap-6">
            <h1 className="z-h1 max-w-[700px]">
              <MaskRevealWords text="Poradniki dla tych, którzy wolą mieć to z głowy" />
            </h1>
            <MaskReveal delay={0.2}>
              <p className="z-lead max-w-[550px] text-[var(--z-muted)]">
                Piszemy o KSeF, kosztach i pilnowaniu płatności. Konkretnie,
                bez urzędowego żargonu i bez wciskania Ci niczego na siłę.
              </p>
            </MaskReveal>
          </div>
        </Container>
      </header>

      {/* ── siatka wpisów: karty 372 szerokości, przerwa 12 ─────────── */}
      <section className="pb-20">
        <Container>
          <div className="grid grid-cols-1 gap-x-3 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              // Oryginał animuje karty samym zanikiem, bez przesunięcia.
              <Rise key={p.slug} delay={i * 0.06}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="group flex h-full flex-col gap-5"
                >
                  <div className="overflow-hidden rounded-[14px] bg-[var(--z-50)]">
                    <Image
                      src={OKLADKI[i % OKLADKI.length]}
                      alt=""
                      width={372}
                      height={274}
                      className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="z-small flex items-center gap-2 text-[var(--z-muted)]">
                      <span>{dataPl(p.date)}</span>
                      <span aria-hidden>·</span>
                      <span>{p.readTime} min czytania</span>
                    </div>
                    <h2 className="z-lead font-medium transition-opacity group-hover:opacity-70">
                      {p.title}
                    </h2>
                    <p className="z-body text-[var(--z-muted)]">
                      {p.description}
                    </p>
                  </div>

                  <span className="z-body mt-auto w-fit font-medium underline underline-offset-4">
                    Czytaj dalej
                  </span>
                </Link>
              </Rise>
            ))}
          </div>
        </Container>
      </section>

      <SiteFooter />
    </>
  );
}
