import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { ComparisonTable, type ComparisonRow } from '@/components/marketing/comparison-table';
import { Button } from '@/components/ui/button';

// Faza 22: comparison page — SEO ważne, cache na godzinę.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'KSeF SaaS vs Fakturownia 2026 — porównanie ceny i funkcji',
  description:
    'Pełne porównanie KSeF SaaS i Fakturownia: KSeF 2.0, OCR, KPiR, mobile app, ceny. Sprawdź który system jest lepszy dla Twojej mikrofirmy.',
};

const COMPARISON_ROWS = [
  {
    category: 'KSeF 2026',
    feature: 'Wsparcie KSeF 2.0 (luty 2026)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'yes' as const },
  },
  {
    category: 'KSeF 2026',
    feature: 'Pre-send walidacja FA(3)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'KSeF 2026',
    feature: 'Post-send monitoring (false positives)',
    ksefSaas: { status: 'yes' as const, note: 'po 5 min sprawdzamy real status' },
    competitor: { status: 'no' as const, note: 'znany bug' },
  },
  {
    category: 'KSeF 2026',
    feature: 'Automatyczne UPO + archiwizacja',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'manual download' },
  },
  {
    category: 'KSeF 2026',
    feature: 'Tryb Offline24 (awarie MF)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'KSeF 2026',
    feature: 'Authorization stability',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const, note: 'znane zawieszenia 24h' },
  },
  {
    category: 'OCR + KPiR',
    feature: 'OCR faktur kosztowych (zdjęcia)',
    ksefSaas: { status: 'yes' as const, note: 'Claude Vision' },
    competitor: { status: 'partial' as const, note: '$9/mc dodatkowo' },
  },
  {
    category: 'OCR + KPiR',
    feature: 'Auto-kategoryzacja KPiR',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'OCR + KPiR',
    feature: 'OCR uczy się z poprawek',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'OCR + KPiR',
    feature: 'Eksport JPK_FA + KPiR Excel',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'yes' as const },
  },
  {
    category: 'Mobile',
    feature: 'PWA installable',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Mobile',
    feature: 'Native aparat z capture',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Mobile',
    feature: 'Push notifications',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Mobile',
    feature: 'Offline mode',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Workflow',
    feature: 'Magiczny Import z konkurencji',
    ksefSaas: { status: 'yes' as const, note: '5 min, KSeF history + CSV' },
    competitor: { status: 'partial' as const, note: 'manual CSV import' },
  },
  {
    category: 'Workflow',
    feature: 'Wkurzacz Dłużników',
    ksefSaas: { status: 'yes' as const, note: 'auto + wezwanie KPC' },
    competitor: { status: 'partial' as const, note: 'manual' },
  },
  {
    category: 'Workflow',
    feature: 'Co-Pilot Księgowego',
    ksefSaas: { status: 'yes' as const, note: 'auto-mailing' },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Workflow',
    feature: 'Korekta jednym klikiem',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const, note: 'znany bug' },
  },
  {
    category: 'Cennik',
    feature: 'Cena podstawowa',
    ksefSaas: { status: 'note' as const, note: '49 zł/mc' },
    competitor: { status: 'note' as const, note: 'od 79 zł/mc' },
  },
  {
    category: 'Cennik',
    feature: 'Wszystkie funkcje w cenie',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const, note: 'OCR osobno' },
  },
  {
    category: 'Cennik',
    feature: 'Money-back guarantee',
    ksefSaas: { status: 'yes' as const, note: '60 dni' },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Hosting',
    feature: 'Bank EU (GDPR-compliant)',
    ksefSaas: { status: 'yes' as const, note: 'Frankfurt 🇪🇺' },
    competitor: { status: 'yes' as const, note: 'Polska' },
  },
  {
    category: 'Hosting',
    feature: 'Eksport pełnych danych',
    ksefSaas: { status: 'yes' as const, note: '30 dni po anulowaniu' },
    competitor: { status: 'partial' as const },
  },
] satisfies ComparisonRow[];

export default function FakturowniaPage() {
  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Porównanie 2026
          </p>
          <h1 className="font-display text-5xl leading-[1.1] font-semibold tracking-tighter-display md:text-6xl">
            KSeF SaaS <span className="text-muted-foreground">vs</span> Fakturownia
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            Bez marketingowych frazesów. 23 funkcje porównane jeden do jednego.
          </p>
        </div>

        <div className="mb-16 rounded-3xl border border-glass-border bg-glass-white p-8 shadow-glass backdrop-blur-glass">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">TL;DR</p>
          <p className="text-lg leading-relaxed">
            <strong>Fakturownia</strong> jest dobra dla firm, które potrzebują klasycznego programu do faktur i nie
            mają dużo paragonów. Ma znane problemy z stabilnością KSeF authorization i bugi w korektach.{' '}
            <strong>KSeF SaaS</strong> jest dla freelancerów i mikrofirm, którzy chcą mieć OCR paragonów,
            mobile-first workflow i automatyczne wezwania do zapłaty — wszystko w cenie podstawowej, bez dodatków.
          </p>
        </div>

        <ComparisonTable competitorName="Fakturownia" rows={COMPARISON_ROWS} />

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-glass-border bg-glass-white p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz Fakturownię, jeśli...
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Masz duży zespół księgowy i potrzebujesz audit trail</li>
              <li>• Twoja firma istnieje od 5+ lat z dużą historią</li>
              <li>• Wystawiasz głównie faktury B2B (mało paragonów)</li>
              <li>• Akceptujesz workflow z lat 2010-2015</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-foreground/20 bg-foreground/5 p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz KSeF SaaS, jeśli...
            </h3>
            <ul className="space-y-2 text-sm">
              <li>• Jesteś freelancerem / solo founderem / mikrofirmą</li>
              <li>• Masz dużo paragonów do księgowania</li>
              <li>• Pracujesz z telefonu / w terenie</li>
              <li>• Chcesz wszystko w cenie, bez upgrade&apos;ów</li>
              <li>• Wartość Twojego czasu &gt; 100 PLN/h</li>
            </ul>
          </div>
        </div>

        <div className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-10 text-center shadow-glass-lg backdrop-blur-glass">
          <h3 className="mb-4 font-display text-3xl font-semibold tracking-tighter-display">
            Migracja z Fakturownia w 5 minut
          </h3>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Magiczny Import pobierze Twoje faktury bezpośrednio z KSeF + zaimportuje historię z eksportu CSV
            Fakturownia. Zero ręcznej pracy.
          </p>
          <Button variant="glass-primary" size="lg" asChild>
            <Link href="/register" className="inline-flex items-center gap-2">
              Wypróbuj 30 dni za darmo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">+ 60 dni gwarancji zwrotu pieniędzy</p>
        </div>
      </div>
    </article>
  );
}
