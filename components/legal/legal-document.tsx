import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  entryChildren,
  entryText,
  listLabel,
  parseInline,
  type Block,
  type LegalDocument,
  type ListEntry,
} from '@/lib/legal/doc-model';
import { isLegalEntityComplete, missingLegalEntityFields } from '@/lib/legal/entity';

/**
 * Renderer dokumentów prawnych (`lib/legal/documents/*`). Server Component —
 * treść jest statyczna, a ta sama treść idzie mailem jako plik tekstowy.
 */

function Inline({
  text,
  linkClassName,
  newTab = false,
}: {
  text: string;
  linkClassName?: string;
  newTab?: boolean;
}) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.kind === 'bold') return <strong key={i}>{t.value}</strong>;
        if (t.kind === 'link') {
          if (!newTab && (t.href.startsWith('/') || t.href.startsWith('#'))) {
            return (
              <Link key={i} href={t.href} className={linkClassName}>
                {t.value}
              </Link>
            );
          }
          return (
            <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
              {t.value}
            </a>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </>
  );
}

/**
 * Oświadczenie z linkami (np. pole akceptacji regulaminu) — to samo brzmienie,
 * które zapisujemy. Linki w nowej karcie: przejście w tej samej karcie
 * skasowałoby wypełniony formularz.
 */
export function LegalInline({ text, linkClassName }: { text: string; linkClassName?: string }) {
  return <Inline text={text} linkClassName={linkClassName} newTab />;
}

function List({ items, ordered, depth }: { items: ListEntry[]; ordered: boolean; depth: number }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className="my-3 list-none space-y-2 pl-0">
      {items.map((entry, i) => {
        const children = entryChildren(entry);
        return (
          <li key={i} className="my-0 flex gap-2 pl-0">
            <span className="w-7 shrink-0 text-right tabular-nums text-[var(--marketing-muted,inherit)]">
              {ordered ? listLabel(depth, i) : '•'}
            </span>
            <div className="min-w-0 flex-1">
              <Inline text={entryText(entry)} />
              {children.length > 0 ? <List items={children} ordered={ordered} depth={depth + 1} /> : null}
            </div>
          </li>
        );
      })}
    </Tag>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case 'p':
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case 'note':
      return (
        <div className="not-prose my-4 rounded-xl border border-emerald-600/30 bg-emerald-600/5 px-4 py-3 text-[0.95rem] leading-relaxed">
          <Inline text={block.text} />
        </div>
      );
    case 'ol':
      return <List items={block.items} ordered depth={0} />;
    case 'ul':
      return <List items={block.items} ordered={false} depth={0} />;
    case 'table':
      return (
        <div className="my-4 overflow-x-auto">
          <table className="my-0 min-w-[640px] text-sm">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} className="align-bottom">
                    <Inline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="align-top">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Baner, dopóki dane usługodawcy są niepełne — nikt nie weźmie projektu za umowę. */
export function LegalDraftBanner() {
  if (isLegalEntityComplete()) return null;
  return (
    <div
      role="note"
      className="not-prose mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed"
    >
      <p className="font-semibold">Wersja robocza dokumentu</p>
      <p className="mt-1">
        Dokument czeka na uzupełnienie danych usługodawcy i weryfikację prawną. Brakuje:{' '}
        {missingLegalEntityFields().join(', ')}.
      </p>
    </div>
  );
}

export function LegalDocumentView({
  doc,
  downloadable = true,
  children,
}: {
  doc: LegalDocument;
  /** Link do wersji tekstowej (utrwalenie treści — art. 8 ust. 1 pkt 2 u.ś.u.d.e.). */
  downloadable?: boolean;
  /** Dodatkowa treść między streszczeniem a dokumentem (np. ustawienia cookies). */
  children?: ReactNode;
}) {
  return (
    <article className="pb-16 lg:pb-24">
      <div className="prose prose-neutral mx-auto max-w-3xl px-6 dark:prose-invert">
        <LegalDraftBanner />
        <h1 className="mb-2">{doc.title}</h1>
        <p className="mt-0 text-sm text-[var(--marketing-muted,inherit)]">
          Wersja z dnia {doc.version}
          {downloadable ? (
            <>
              {' · '}
              <a href={`/legal/pobierz/${doc.slug}`} download>
                Pobierz jako plik tekstowy
              </a>
            </>
          ) : null}
        </p>

        {doc.summary && doc.summary.length > 0 ? (
          <section
            aria-labelledby="w-skrocie"
            className="not-prose my-8 rounded-2xl border border-[var(--z-300,#e5e5e5)] bg-[var(--z-50,#fafafa)] px-5 py-4"
          >
            <h2 id="w-skrocie" className="text-base font-semibold">
              W skrócie
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.95rem] leading-relaxed">
              {doc.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--marketing-muted,inherit)]">
              Streszczenie ułatwia lekturę, ale wiąże wyłącznie pełna treść poniżej.
            </p>
          </section>
        ) : null}

        {children}

        <nav aria-label="Spis treści" className="not-prose my-8">
          <p className="text-sm font-semibold">Spis treści</p>
          <ol className="mt-2 columns-1 gap-6 space-y-1 text-sm sm:columns-2">
            {doc.sections.map((s) => (
              <li key={s.id} className="break-inside-avoid">
                <a href={`#${s.id}`} className="underline-offset-2 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-32">
            <h2>{s.title}</h2>
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
