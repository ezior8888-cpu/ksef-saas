import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// Faza 22: cennik się rzadko zmienia — godzinny revalidate na edge.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Cennik FaktFlow — 49 zł/mc, wszystkie funkcje, 60 dni gwarancji',
  description:
    'Jeden plan dla wszystkich. 49 zł/mc rocznie lub 59 zł/mc miesięcznie. OCR, KSeF 2.0, KPiR, Wkurzacz Dłużników w cenie. Bez ukrytych dodatków.',
};

const FEATURES = [
  {
    category: 'Faktury',
    items: [
      'Bez limitu wystawionych',
      'Bez limitu zakupowych',
      'Bez limitu paragonów',
      'Korekty + zaliczki + finalne',
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
      'OCR Claude Vision faktur',
      'OCR paragonów + auto-kategoryzacja',
      'Apka uczy się Twoich preferencji',
      'Auto-import z KSeF inbox',
      'Eksport JPK_FA + KPiR Excel',
    ],
  },
  {
    category: 'Mobile',
    items: [
      'PWA installable',
      'Native aparat',
      'Push notifications',
      'Offline mode',
      'Swipe gestures',
    ],
  },
  {
    category: 'Workflow',
    items: [
      'Magiczny Import z 4 innych apek',
      'Wkurzacz Dłużników (przypomnienia + wezwania KPC)',
      'Co-Pilot Księgowego (auto-mailing 25.)',
      'Live walidacja NIP/VIES',
      'Walidacja kont bankowych (Biała Lista)',
    ],
  },
  {
    category: 'Eksport',
    items: [
      'JPK_FA(4)',
      'JPK_V7M',
      'KPiR Excel',
      'Comarch Optima',
      'Insert Subiekt',
      'Symfonia',
      'Wapro Mag',
    ],
  },
  {
    category: 'Bezpieczeństwo',
    items: [
      'Hosting Frankfurt EU 🇪🇺',
      'GDPR-compliant',
      'Retencja 10 lat (zgodnie z prawem)',
      'Eksport pełnych danych',
      'Bank EU (nie Polska)',
      'Audit logs',
    ],
  },
  {
    category: 'Wsparcie',
    items: [
      'Email po polsku',
      'Dokumentacja w pl',
      'Live chat (godziny biurowe)',
      'Onboarding pomoc',
      '60 dni money-back',
    ],
  },
];

export default function PricingPage() {
  return (
    <article>
      {/* Date strip */}
      <div className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-3 text-[10px] uppercase tracking-[0.25em] text-zinc-500 lg:px-8">
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
            <span className="italic text-emerald-700">
              Wszystkie funkcje.
            </span>
          </h1>
          <p className="mt-8 max-w-xl font-editorial text-2xl leading-snug text-zinc-600">
            Bez tierów. Bez &bdquo;premium&rdquo; toggle. Bez kart kredytowych
            żeby zacząć.
          </p>
        </div>

        {/* Price plate — asymetryczna, większa wersja niż w landingu */}
        <div className="mb-20 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
          <div className="border-2 border-emerald-500/40 bg-zinc-50 p-10">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              Plan podstawowy
            </p>
            <p className="mt-6 font-editorial text-[7rem] font-medium leading-[0.85]">
              <span className="italic text-emerald-700">49 zł</span>
            </p>
            <p className="mt-2 font-editorial text-xl italic text-zinc-500">
              / miesiąc · płatne rocznie
            </p>
            <p className="mt-4 text-sm text-zinc-600">
              588 zł / rok · faktura VAT 23%
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Lub 59 zł/mc miesięcznie (708 zł/rok)
            </p>

            <Link
              href="/register"
              className="mt-10 inline-flex w-full items-center justify-center gap-3 border border-emerald-500/40 bg-emerald-500 px-6 py-3.5 text-sm font-medium tracking-wide text-emerald-950 transition-all hover:border-emerald-400 hover:bg-emerald-400"
            >
              Wypróbuj 30 dni za darmo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="mt-3 text-center text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Bez karty kredytowej · Anuluj kiedy chcesz
            </p>
          </div>

          {/* Marginalia z 3 obietnicami */}
          <div className="flex flex-col justify-center">
            <p className="editorial-section-num mb-6 text-sm">— Trzy obietnice</p>
            <div className="space-y-8">
              <Promise
                num="01"
                value="30 dni"
                label="Trial bez karty kredytowej. Pełen dostęp do wszystkich funkcji od pierwszej sekundy."
              />
              <Promise
                num="02"
                value="30 dni"
                label="Parallel Run — możesz używać równolegle z poprzednią apką, by porównać przed migracją."
              />
              <Promise
                num="03"
                value="60 dni"
                label="Money-back guarantee. Bez podawania powodu. Zwrot w 5 dni roboczych."
              />
            </div>
          </div>
        </div>

        {/* Co dostajesz w 49 zł — hairline grid */}
        <div className="mb-10 flex items-baseline gap-4 border-b border-zinc-200 pb-4">
          <span className="editorial-section-num text-3xl">02.</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            Co dostajesz w 49 zł
          </span>
        </div>

        <h2 className="mb-12 max-w-3xl font-editorial text-4xl font-medium leading-[1] tracking-[-0.02em] md:text-5xl">
          Osiem kategorii.{' '}
          <span className="italic text-emerald-700">
            Wszystko od pierwszego dnia.
          </span>
        </h2>

        <div className="grid grid-cols-1 gap-px border border-zinc-200 bg-zinc-100 md:grid-cols-2">
          {FEATURES.map((cat, i) => (
            <div key={cat.category} className="bg-background p-8">
              <div className="mb-5 flex items-baseline justify-between">
                <span className="editorial-section-num text-2xl">
                  {String(i + 1).padStart(2, '0')}.
                </span>
                <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
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
                    className="flex items-baseline gap-3 text-sm text-zinc-600"
                  >
                    <span
                      className="font-editorial text-emerald-700"
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
        <p className="font-editorial text-3xl font-medium italic text-emerald-700">
          {value}
        </p>
        <p className="mt-1 text-sm text-zinc-600">{label}</p>
      </div>
    </div>
  );
}
