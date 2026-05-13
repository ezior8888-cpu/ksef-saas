import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

// Faza 22: cennik się rzadko zmienia — godzinny revalidate na edge.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Cennik KSeF SaaS — 49 zł/mc, wszystkie funkcje, 60 dni gwarancji',
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
    items: ['PWA installable', 'Native aparat', 'Push notifications', 'Offline mode', 'Swipe gestures'],
  },
  {
    category: 'Workflow',
    items: [
      'Magiczny Import z 4 konkurencji',
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
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Cennik</p>
          <h1 className="font-display text-5xl leading-[1.1] font-semibold tracking-tighter-display md:text-6xl">
            Jeden plan. <span className="text-muted-foreground">Wszystkie funkcje.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            Bez tier&apos;ów. Bez &quot;premium&quot; toggle. Bez kart kredytowych żeby zacząć.
          </p>
        </div>

        <div className="mx-auto mb-16 max-w-md rounded-3xl border border-foreground/20 bg-foreground/5 p-10 shadow-glass-lg backdrop-blur-glass">
          <p className="text-sm text-muted-foreground">Plan podstawowy</p>
          <p className="mt-2 font-display text-6xl font-bold tracking-tighter-display">
            49 zł
            <span className="ml-2 text-lg font-normal text-muted-foreground">/ mc</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Płatne rocznie · 588 zł / rok</p>
          <p className="mt-3 text-xs text-muted-foreground">Lub 59 zł/mc miesięcznie (708 zł/rok)</p>

          <Button variant="glass-primary" size="lg" className="mt-8 w-full" asChild>
            <Link href="/register" className="inline-flex items-center justify-center gap-2">
              Wypróbuj 30 dni za darmo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Bez karty kredytowej. Anuluj kiedy chcesz.</p>
        </div>

        <div className="space-y-8">
          <h2 className="text-center font-display text-3xl font-semibold tracking-tighter-text">
            Co dostajesz w 49 zł
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {FEATURES.map((cat) => (
              <div
                key={cat.category}
                className="rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass"
              >
                <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">{cat.category}</h3>
                <ul className="space-y-2.5">
                  {cat.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
                        aria-hidden
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-8 text-center shadow-glass backdrop-blur-glass">
          <h3 className="mb-3 font-display text-2xl font-semibold tracking-tighter-text">Trzy obietnice</h3>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div>
              <p className="mb-2 font-display text-3xl font-bold tracking-tighter-display">30 dni</p>
              <p className="text-sm text-muted-foreground">Trial bez karty kredytowej</p>
            </div>
            <div>
              <p className="mb-2 font-display text-3xl font-bold tracking-tighter-display">30 dni</p>
              <p className="text-sm text-muted-foreground">Parallel Run z konkurencją</p>
            </div>
            <div>
              <p className="mb-2 font-display text-3xl font-bold tracking-tighter-display">60 dni</p>
              <p className="text-sm text-muted-foreground">Money-back guarantee</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
