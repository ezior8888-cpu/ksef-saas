import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { ComparisonTable, type ComparisonRow } from '@/components/marketing/comparison-table';
import { Button } from '@/components/ui/button';

// Faza 22: comparison page — SEO ważne, cache na godzinę.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'KSeF SaaS vs inFakt 2026 — gross invoices, OCR AI i cennik',
  description:
    'Porównanie KSeF SaaS z inFakt: faktury brutto, limity AI-OCR, pakiety cenowe, KSeF 2.0, mobile i migracja. Dla mikrofirm i freelancerów.',
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
    feature: 'Pre-send walidacja FA(3) lokalnie',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'yes' as const },
  },
  {
    category: 'KSeF 2026',
    feature: 'Tryb Offline24 (awarie MF)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'ograniczony' },
  },
  {
    category: 'Faktury i dokumenty',
    feature: 'Faktury gross (brutto) kosztowe — pełny flow',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const, note: 'brak dedykowanego flow' },
  },
  {
    category: 'Faktury i dokumenty',
    feature: 'Import gross z zagranicy (EUR/USD)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'ręczne korekty VAT' },
  },
  {
    category: 'Faktury i dokumenty',
    feature: 'Paragon + NIP — jedna sesja OCR',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'OCR i AI',
    feature: 'OCR wielostronicowy PDF bez limitu stron',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'limit stron / kolejka' },
  },
  {
    category: 'OCR i AI',
    feature: 'AI-OCR: rozpoznanie tabel pozycji',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'proste layouty' },
  },
  {
    category: 'OCR i AI',
    feature: 'Confidence score per pole',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'OCR i AI',
    feature: 'Uczenie OCR z historii poprawek',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Mobile i PWA',
    feature: 'PWA instalowalna',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'głównie responsive www' },
  },
  {
    category: 'Mobile i PWA',
    feature: 'Capture z aparatu + crop',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Mobile i PWA',
    feature: 'Push: status KSeF / płatności',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Workflow',
    feature: 'Magiczny Import (KSeF + CSV konkurencji)',
    ksefSaas: { status: 'yes' as const, note: '5–10 min' },
    competitor: { status: 'partial' as const, note: 'CSV ręcznie' },
  },
  {
    category: 'Workflow',
    feature: 'Wkurzacz Dłużników + szablony KPC',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'przypomnienia email' },
  },
  {
    category: 'Workflow',
    feature: 'Co-Pilot Księgowego (auto-pakiet miesięczny)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Cennik',
    feature: 'Stawka „wszystko w jednym”',
    ksefSaas: { status: 'note' as const, note: '49 zł/mc' },
    competitor: { status: 'note' as const, note: 'wyższy pakiet + add-ony' },
  },
  {
    category: 'Cennik',
    feature: 'Pełne AI-OCR w cenie bazowej',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const, note: 'wyższy tier / limit' },
  },
  {
    category: 'Cennik',
    feature: '60 dni money-back',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'warunki regulaminu' },
  },
  {
    category: 'Integracje',
    feature: 'Webhooks / status faktury',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Hosting',
    feature: 'Dane w UE (GDPR)',
    ksefSaas: { status: 'yes' as const, note: 'Frankfurt' },
    competitor: { status: 'yes' as const, note: 'PL cloud' },
  },
  {
    category: 'Hosting',
    feature: 'Eksport pełny po rezygnacji (30 dni)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Raportowanie',
    feature: 'JPK_FA + KPiR Excel jednym kliknięciem',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'yes' as const },
  },
  {
    category: 'Raportowanie',
    feature: 'Podgląd błędów FA przed wysyłką (diff)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
] satisfies ComparisonRow[];

export default function InfaktPage() {
  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-4xl px-6">
        <header className="mb-16 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Porównanie 2026
          </p>
          <h1 className="font-display text-5xl leading-[1.1] font-semibold tracking-tighter-display md:text-6xl">
            KSeF SaaS <span className="text-muted-foreground">vs</span> inFakt
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            24 wiersze tabeli plus przewodnik migracji i rozbicie cenowe — pod kątem mikrofirm, które żyją z
            paragonów i faktur brutto.
          </p>
        </header>

        <div className="mb-16 rounded-3xl border border-glass-border bg-glass-white p-8 shadow-glass backdrop-blur-glass">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">TL;DR</p>
          <p className="text-lg leading-relaxed">
            <strong>inFakt</strong> to dojrzały program online z szeroką bazą użytkowników i sensowną integracją
            KSeF, ale w praktyce wielu przedsiębiorców odbija się od trzech ścian: braku wygodnego flow dla{' '}
            <strong>faktur gross</strong> (kosztowych w cenach brutto), <strong>ograniczeń AI-OCR</strong> na
            trudnych PDF-ach oraz <strong>drogiego stacku</strong>, gdzie „pełna moc” siedzi w wyższych pakietach
            i dodatkach. <strong>KSeF SaaS</strong> stawia na jedną, przewidywalną stawkę, OCR inspirowany pracą
            w terenie i flow zaprojektowany pod KSeF 2.0 od pierwszego dnia — bez dopłat za „inteligentne”
            funkcje, które i tak są potrzebne przy KPiR.
          </p>
        </div>

        <section className="mb-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Krótka historia inFakt i model hostingu
          </h2>
          <p>
            inFakt zbudował pozycję na polskim rynku SaaS księgowym jeszcze w erze, gdy KSeF był raczej
            obietnicą legislacyjną niż codziennym obowiązkiem. Produkt wyrosł z prostego fakturowania online,
            stopnio rozszerzany o rozliczenia ZUS, magazyn czy współpracę z biurem rachunkowym. To doświadczenie
            widać po stronie stabilności biznesowej i rozpoznawalności marki — dla wielu księgowych „inFakt” to
            domyślny punkt odniesienia przy onboardingu klienta.
          </p>
          <p>
            Z perspektywy architektury, typowy hosting inFakt to polskie centra danych i ścisłe trzymanie się
            lokalnych standardów compliance, co jest plusem dla firm szukających „100% PL”. Jednocześnie przy
            KSeF 2.0 liczy się nie tylko lokalizacja serwera, ale przepływ danych: jak szybko system odróżnia
            fałszywie pozytywny status wysyłki od realnego UPO, jak radzi sobie z wielostronicowymi fakturami
            kosztowymi i czy pozwala pracować na fakturach gross bez obejść w arkuszu. Tu właśnie pojawiają się
            różnice kultury produktowej: inFakt ewoluował z klasycznego e-fakturowania, podczas gdy KSeF SaaS
            projektujemy od zera pod mikrofirmę, która skanuje dokumenty w aucie i chce zamknąć KPiR tego samego
            dnia.
          </p>
          <p>
            Warto też pamiętać, że „historia produktu” to nie tylko data założenia firmy, ale tempo wdrażania
            zmian ministerialnych. KSeF 2.0 wymusza krótsze SLA na poprawki, więcej telemetrii po stronie API MF
            oraz większą odporność na weekendowe maintenance. W takim środowisku liczy się, czy Twój dostawca
            traktuje OCR i walidację FA(3) jako rdzeń subskrypcji, czy jako moduł premium — i ile realnie
            zapłacisz, zanim „zwykła” faktura kosztowa przestanie być walką z formularzem.
          </p>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 font-display text-2xl font-semibold tracking-tighter-text">
            Co mówią użytkownicy (skróty z publicznych opinii)
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;Super do prostych faktur, ale jak wchodzi paragon z Biedronki i brutto, to znów Excel.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Opinia z forum branżowego, 2025</figcaption>
            </figure>
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;AI OCR pomaga, ale na skanach wielostronicowych kończy się na ręcznym przepisywaniu pozycji.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Komentarz użytkownika LinkedIn, 2025</figcaption>
            </figure>
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;Liczyłem na jeden pakiet, a żeby dogonić potrzeby biura, musiałem wejść znacznie wyżej w cennik.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Wątek dyskusyjny, grupa Facebook, 2024</figcaption>
            </figure>
          </div>
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
            Powyższe cytaty są stylizowanymi skrótami typowych wątków z publicznych dyskusji — nie cytują
            konkretnej osoby ani nie są gwarancją aktualnego stanu produktu konkurenta. Zawsze zweryfikuj
            funkcje na własnym koncie trial przed decyzją migracyjną.
          </p>
        </section>

        <section className="mb-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Dlaczego gross invoices i OCR to dziś „hard requirement”
          </h2>
          <p>
            Gross invoices — czyli dokumenty kosztowe w cenach brutto, często z paragonów albo z importu zagranicznego
            — nie są ciekawostką dla jednej branży. To codzienność usług remontowych, transportu, gastronomii i
            freelancingu B2B, gdzie kontrahent wystawia brutto, a Ty musisz rozłożyć VAT i koszt bez błędu. Jeśli
            system nie prowadzi Cię przez ten flow jak przez checklistę KSeF, tracisz czas na korekty i
            podwójne wpisy w KPiR.
          </p>
          <p>
            AI-OCR z kolei nie może być „ładną ikonką” w cenniku. Musi radzić sobie z krzywym skanem, drugą stroną
            faktury z regulaminem na odwrocie i tabelą pozycji, gdzie każda linia ma inną stawkę VAT. Ograniczenia
            modelu — limit stron, brak confidence score, brak uczenia z poprawek — przekładają się bezpośrednio na
            godziny Twojej pracy albo koszt księgowej. Dlatego w tabeli porównawczej celowo eksponujemy wiersze,
            które bolą najczęściej w rozmowach z naszymi beta-użytkownikami.
          </p>
          <p>
            Trzeci filar to cena całkowita posiadania (TCO): nawet jeśli pakiet startowy wygląda atrakcyjnie,
            suma add-onów za OCR, dodatkowe firmy czy wyższe limity dokumentów bywa nieprzewidywalna. KSeF SaaS
            trzyma prostą zasadę: funkcje potrzebne do domknięcia KPiR i KSeF nie są zakładką „Pro+”, tylko rdzeniem
            produktu — stąd nacisk na jedną stawkę i money-back jako realny hedge ryzyka dla mikrofirmy.
          </p>
        </section>

        <ComparisonTable competitorName="inFakt" rows={COMPARISON_ROWS} />

        <section className="mt-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Pricing breakdown: co zwykle jest w bazie, a co „dopłata”
          </h2>
          <p>
            Poniższy podział ma charakter edukacyjny i opiera się na typowym schemacie „pakiet + moduły”, który
            wielokrotnie widzimy u polskich SaaS księgowych — nie jest prawnym opisem cennika konkurenta. Zanim
            podejmiesz decyzję, pobierz aktualny cennik inFakt i porównaj limity (liczba firm, użytkowników,
            dokumentów, integracji) linia po linii.
          </p>
          <ul className="list-disc space-y-3 pl-5 text-foreground/90">
            <li>
              <strong className="text-foreground">Baza (najczęściej reklamowana stawka):</strong> proste faktury
              sprzedaży, podstawowe rozliczenia, często sensowny start dla jednoosobowej działalności bez dużej
              skrzynki kosztowej.
            </li>
            <li>
              <strong className="text-foreground">Wyższe pakiety:</strong> więcej dokumentów, wielofirmowość,
              rozbudowane uprawnienia dla biura — tu cena rośnie skokowo, bo łączy się z limitami API i
              raportowania.
            </li>
            <li>
              <strong className="text-foreground">AI / OCR / automatyzacje:</strong> często jako osobny moduł albo
              feature-gating — dokładnie te elementy, które w KSeF SaaS traktujemy jako standard przy mikrofirmie
              z dużą liczbą kosztów.
            </li>
            <li>
              <strong className="text-foreground">KSeF SaaS (referencja):</strong> jedna stawka ok. 49 zł/mc,
              pełny OCR w pakiecie, Magiczny Import, Wkurzacz, Co-Pilot księgowego i 60 dni money-back — bez
              tajnych „upgrade’ów”, żeby domknąć miesiąc.
            </li>
          </ul>
          <p>
            Jeśli porównujesz oferty, policz nie tylko miesięczny abonament, ale też koszt godziny Twojej pracy przy
            ręcznym poprawianiu OCR i koszt błędów wysyłki do KSeF. Często okazuje się, że „tańszy pakiet” jest
            droższy o 10–20 godzin rocznie — dokładnie ten mechanizm modelujemy w kalkulatorze oszczędności na
            landing page.
          </p>
        </section>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-glass-border bg-glass-white p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz inFakt, jeśli...
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Masz etatową księgową, która zna produkt „na pamięć” i pilnuje limitów</li>
              <li>• Większość dokumentów to proste faktury netto B2B</li>
              <li>• Potrzebujesz głębokiej integracji z ekosystemem, w którym inFakt jest już osadzony</li>
              <li>• Akceptujesz dopłaty za moduły AI/OCR w zamian za markę „znaną z rynku”</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-foreground/20 bg-foreground/5 p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz KSeF SaaS, jeśli...
            </h3>
            <ul className="space-y-2 text-sm">
              <li>• Masz gross invoices i paragony, które muszą wejść do KPiR bez obejść</li>
              <li>• OCR na trudnych PDF-ach to Twój bottleneck, nie „nice to have”</li>
              <li>• Chcesz przewidywalny rachunek: jedna stawka, pełne funkcje KSeF-first</li>
              <li>• Pracujesz mobilnie i chcesz push + offline capture w jednym produkcie</li>
            </ul>
          </div>
        </div>

        <section className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-8 shadow-glass backdrop-blur-glass">
          <h2 className="mb-4 font-display text-2xl font-semibold tracking-tighter-text">
            Wymigracja z inFakt: krok po kroku
          </h2>
          <ol className="list-decimal space-y-4 pl-5 text-muted-foreground leading-relaxed">
            <li>
              <strong className="text-foreground">Spisz checklistę:</strong> lista NIP-ów, użytkowników, integracji
              bankowych i okresów, które muszą wejść do nowego systemu bez luki w JPK.
            </li>
            <li>
              <strong className="text-foreground">Eksport z inFakt:</strong> pobierz CSV / JPK / ZIP zgodnie z
              dokumentacją eksportu — zachowaj kopie na dysku zewnętrznym (audyt RODO).
            </li>
            <li>
              <strong className="text-foreground">KSeF jako źródło prawdy:</strong> uruchom Magiczny Import: historia
              z KSeF (np. ostatnie 24 miesiące) + pliki z konkurencji — to skraca czas migracji z godzin do minut.
            </li>
            <li>
              <strong className="text-foreground">Walidacja brutto/netto:</strong> dla faktur gross przejdź próbkę
              20 dokumentów i porównaj kwoty VAT z oryginałem — upewnij się, że nowy flow nie wymusza ręcznych
              korekt.
            </li>
            <li>
              <strong className="text-foreground">Cut-over:</strong> ustal dzień przełączenia wysyłki nowych FA(3)
              tylko z KSeF SaaS, wyłącz duplikaty webhooków i poinformuj kontrahentów o ewentualnej zmianie numeracji
              (jeśli dotyczy).
            </li>
            <li>
              <strong className="text-foreground">Hypercare:</strong> przez 2 tygodnie monitoruj kolejkę KSeF,
              statusy UPO i raporty błędów — po stabilizacji zaplanuj szkolenie księgowej z Co-Pilotem.
            </li>
          </ol>
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
            Jeśli potrzebujesz checklisty PDF lub wsparcia przy imporcie wielofirmowym, zostaw zgłoszenie na
            support@ksef-saas.pl — dopasujemy scenariusz do Twojej skali.
          </p>
        </section>

        <section className="mt-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            SEO: słowa kluczowe i intencja wyszukiwania
          </h2>
          <p>
            Użytkownicy szukający „inFakt vs …”, „inFakt KSeF 2.0”, „inFakt OCR cena” mają wysoką intencję
            migracyjną — ale też wysokie oczekiwanie merytoryczne. Dlatego ta strona celowo miesza twardą tabelę
            funkcji z narracją o TCO, gross invoices i limitach OCR: to są sygnały jakościowe, które Google
            coraz częściej wiąże z E-E-A-T (doświadczenie, ekspertyza, autorytet, wiarygodność). Nie obiecujemy
            magii — pokazujemy, które decyzje produktowe realnie wpływają na Twój dzień pracy.
          </p>
          <p>
            Jeśli jesteś na etapie due diligence, zestaw tę stronę z naszym{' '}
            <Link href="/kalkulator-oszczednosci" className="text-foreground underline underline-offset-4 hover:text-primary">
              kalkulatorem oszczędności
            </Link>
            ,{' '}
            <Link href="/pricing" className="text-foreground underline underline-offset-4 hover:text-primary">
              cennikiem
            </Link>{' '}
            oraz regulaminem money-back. Dla biur rachunkowych przygotowujemy osobny scenariusz wielomiesięczny
            (tokeny księgowe, pakiet eksportów) —{' '}
            <Link href="/kontakt" className="text-foreground underline underline-offset-4 hover:text-primary">
              napisz
            </Link>
            , ile firm planujesz przenieść w Q1/Q2, a zaproponujemy harmonogram techniczny.
          </p>
        </section>

        <div className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-10 text-center shadow-glass-lg backdrop-blur-glass">
          <h3 className="mb-4 font-display text-3xl font-semibold tracking-tighter-display">
            Przenieś gross invoices i OCR bez stresu
          </h3>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Magiczny Import zaciąga historię z KSeF i pliki eksportu inFakt. Przez 30 dni trialu sprawdzisz, czy
            Twój najgorszy PDF przechodzi przez OCR bez Excela.
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
