import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import {
  PRICE_GROSS,
  PRICE_NET,
  PRICE_PER_MONTH,
  PRICE_VAT,
  TRIAL_DAYS,
} from '@/lib/billing/pricing';

// Faza 22: cennik się rzadko zmienia — godzinny revalidate na edge.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Cennik FaktFlow — ${PRICE_PER_MONTH}, wszystkie funkcje, ${TRIAL_DAYS} dni za darmo`,
  description:
    `Jeden plan dla wszystkich: ${PRICE_PER_MONTH}, płatne co miesiąc. ${TRIAL_DAYS} dni za darmo. OCR, KSeF 2.0, KPiR, Wkurzacz Dłużników w cenie. Bez ukrytych dodatków.`,
};

/**
 * Lista funkcji — każda pozycja musi działać dziś (przegląd prawny 15.10.2026).
 * Usunięte wtedy: „Bez limitu paragonów” (OCR ma limit dzienny i miesięczny,
 * lib/ai/tenant-ai-budget.ts), eksporty JPK_V7M / Optima / Subiekt / Symfonia /
 * Wapro (wyłączone, lib/exports/suspended-formats.ts — pilnuje test
 * marketing-bez-fikcji), „Mobile” (panel na telefonach jest wyłączony, /mobile),
 * „Retencja 10 lat” (dane trzymamy przez czas umowy), „GDPR-compliant”,
 * „Bank EU”, „Live chat” (czat prowadzi asystent AI).
 */
const FEATURES = [
  {
    category: 'Faktury',
    items: [
      'Bez limitu faktur sprzedaży i zakupu',
      'Korekty, zaliczki i faktury rozliczające',
      'Wystawianie B2B i B2C',
    ],
  },
  {
    category: 'KSeF 2.0',
    items: [
      'Pre-send walidacja FA(3)',
      'Post-send monitoring',
      'UPO automatyczne + archiwizacja',
      'Tryb Offline24',
      'Auto-retry przy błędach',
    ],
  },
  {
    category: 'OCR + KPiR',
    items: [
      'Odczyt faktur kosztowych i paragonów (AI) — z limitem dziennym i miesięcznym',
      'Podpowiedź kolumny KPiR, która uczy się Twoich poprawek',
      'Automatyczny import faktur zakupowych z KSeF',
      'Eksport JPK_FA i KPiR (Excel)',
    ],
  },
  {
    category: 'Workflow',
    items: [
      'Magiczny Import z 4 innych programów (CSV)',
      'Wkurzacz Dłużników (przypomnienia i przedsądowe wezwania do zapłaty, wysyłane po Twoim zatwierdzeniu)',
      'Co-Pilot Księgowego (paczka dla księgowej co miesiąc)',
      'Walidacja NIP (biała lista VAT, VIES)',
      'Sprawdzanie rachunków na białej liście',
      'Powiadomienia push w przeglądarce',
    ],
  },
  {
    category: 'Eksport',
    items: [
      'JPK_FA(4)',
      'KPiR (Excel)',
      'Uniwersalny CSV dla księgowej',
    ],
  },
  {
    category: 'Bezpieczeństwo',
    items: [
      'Serwery w UE (Niemcy) 🇪🇺',
      'Umowa powierzenia danych (RODO) w standardzie',
      'Eksport pełnych danych w każdej chwili',
      'Weryfikacja dwuetapowa (2FA)',
      'Dziennik zdarzeń',
    ],
  },
  {
    category: 'Wsparcie',
    items: [
      'E-mail po polsku (dni robocze)',
      'Centrum pomocy po polsku',
      'Czat z asystentem AI i kontakt z człowiekiem',
    ],
  },
];

export default function PricingPage() {
  return (
    <article>
      {/* Date strip */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-3 text-[10px] uppercase tracking-[0.25em] text-[var(--marketing-muted)] lg:px-8">
          <span>Wydanie I · Cennik</span>
          <span>Jeden plan, bez tierów</span>
          <span className="font-editorial text-base italic">Nº 03</span>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 py-16 lg:px-8 lg:py-24">
        {/* HERO */}
        <div className="mb-16 max-w-3xl">
          <p className="editorial-section-num mb-6 text-sm">— Cennik</p>
          <h1 className="font-editorial text-[clamp(2.5rem,6vw,5.5rem)] font-medium leading-[0.95] tracking-[-0.02em]">
            Jeden plan.{' '}
            <span className="italic text-[var(--marketing-accent)]">
              Wszystkie funkcje.
            </span>
          </h1>
          <p className="mt-8 max-w-xl font-editorial text-2xl leading-snug text-[var(--marketing-muted)]">
            Bez tierów. Bez &bdquo;premium&rdquo; toggle. Bez umowy na rok.
          </p>
        </div>

        {/* Price plate — asymetryczna, większa wersja niż w landingu */}
        <div className="mb-20 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
          <div className="border-2 border-emerald-500/40 bg-white/[0.03] p-10">
            <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--marketing-muted)]">
              Plan podstawowy
            </p>
            {/* „29,99 zł” jest szersze niż dawne „49 zł” — rozmiar od szerokości, w jednej linii. */}
            <p className="mt-6 whitespace-nowrap font-editorial text-[clamp(3.5rem,17vw,7rem)] font-medium leading-[0.85] lg:text-[clamp(3.5rem,7.5vw,7rem)]">
              <span className="italic text-[var(--marketing-accent)]">{PRICE_GROSS}</span>
            </p>
            <p className="mt-2 font-editorial text-xl italic text-[var(--marketing-muted)]">
              / miesiąc · z VAT
            </p>
            <p className="mt-4 text-sm text-[var(--marketing-muted)]">
              {PRICE_NET} netto + {PRICE_VAT} VAT · faktura VAT co miesiąc
            </p>

            <Link
              href="/register"
              className="mt-10 inline-flex w-full items-center justify-center gap-3 border border-emerald-500/40 bg-emerald-500 px-6 py-3.5 text-sm font-medium tracking-wide text-emerald-950 transition-all hover:border-emerald-400 hover:bg-emerald-400"
            >
              Wypróbuj {TRIAL_DAYS} dni za darmo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="mt-3 text-center text-[10px] uppercase tracking-[0.22em] text-[var(--marketing-muted)]">
              Pierwsza płatność po {TRIAL_DAYS} dniach · Bez umowy na rok
            </p>
          </div>

          {/* Marginalia z 3 obietnicami */}
          <div className="flex flex-col justify-center">
            <p className="editorial-section-num mb-6 text-sm">— Dwie obietnice</p>
            <div className="space-y-8">
              <Promise
                num="01"
                value={`${TRIAL_DAYS} dni`}
                label={`Pełen dostęp do wszystkich funkcji. Kartę podajesz na starcie, pierwsza płatność dopiero po ${TRIAL_DAYS} dniach.`}
              />
              <Promise
                num="02"
                value={`${TRIAL_DAYS} dni`}
                label="Parallel Run — możesz używać równolegle z poprzednią apką, by porównać przed migracją."
              />
            </div>
          </div>
        </div>

        {/* Co dostajesz w cenie — hairline grid */}
        <div className="mb-10 flex items-baseline gap-4 border-b border-white/10 pb-4">
          <span className="editorial-section-num text-3xl">02.</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--marketing-muted)]">
            Co dostajesz w {PRICE_GROSS}
          </span>
        </div>

        <h2 className="mb-12 max-w-3xl font-editorial text-4xl font-medium leading-[1] tracking-[-0.02em] md:text-5xl">
          {FEATURES.length} kategorii.{' '}
          <span className="italic text-[var(--marketing-accent)]">
            Wszystko od pierwszego dnia.
          </span>
        </h2>

        <div className="grid grid-cols-1 gap-px border border-white/10 bg-white/10 md:grid-cols-2">
          {FEATURES.map((cat, i) => (
            <div key={cat.category} className="bg-background p-8">
              <div className="mb-5 flex items-baseline justify-between">
                <span className="editorial-section-num text-2xl">
                  {String(i + 1).padStart(2, '0')}.
                </span>
                <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--marketing-muted)]">
                  Kategoria
                </span>
              </div>
              <h3 className="mb-5 font-editorial text-xl font-medium">
                {cat.category}
              </h3>
              <ul className="space-y-2">
                {cat.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-baseline gap-3 text-sm text-[var(--marketing-muted)]"
                  >
                    <span
                      className="font-editorial text-[var(--marketing-accent)]"
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm text-[var(--marketing-muted)]">
          W przygotowaniu (jeszcze niedostępne): eksport JPK_V7M(3), eksport
          do Comarch Optima i Subiekta (EDI++), panel na telefonie. Odczyt
          dokumentów przez AI ma limit dzienny i miesięczny na firmę — po jego
          wyczerpaniu dane wpisujesz ręcznie. Szczegóły w{' '}
          <Link href="/legal/regulamin" className="underline underline-offset-2">
            regulaminie
          </Link>
          .
        </p>
      </div>
    </article>
  );
}

function Promise({
  num,
  value,
  label,
}: {
  num: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-baseline gap-5 border-b border-zinc-100 pb-6">
      <span className="editorial-section-num shrink-0 text-xs">{num}.</span>
      <div>
        <p className="font-editorial text-3xl font-medium italic text-[var(--marketing-accent)]">
          {value}
        </p>
        <p className="mt-1 text-sm text-[var(--marketing-muted)]">{label}</p>
      </div>
    </div>
  );
}
