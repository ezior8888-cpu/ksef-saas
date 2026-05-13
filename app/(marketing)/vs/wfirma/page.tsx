import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { ComparisonTable, type ComparisonRow } from '@/components/marketing/comparison-table';
import { Button } from '@/components/ui/button';

// Faza 22: comparison page — SEO ważne, cache na godzinę.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'KSeF SaaS vs wFirma 2026 — mobile, OCR i KSeF',
  description:
    'Porównanie KSeF SaaS z wFirmą: aplikacja mobilna, OCR dokumentów kosztowych, KSeF 2.0, cennik i migracja dla JDG i mikrofirm.',
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
    feature: 'Walidacja FA(3) przed wysyłką',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'yes' as const },
  },
  {
    category: 'KSeF 2026',
    feature: 'Retry kolejki przy 5xx MF',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Mobile',
    feature: 'Natywna aplikacja iOS / Android',
    ksefSaas: { status: 'yes' as const, note: 'PWA + OS install' },
    competitor: { status: 'no' as const, note: 'brak app store' },
  },
  {
    category: 'Mobile',
    feature: 'Skan z aparatu „w terenie”',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'przeglądarka' },
  },
  {
    category: 'Mobile',
    feature: 'Offline queue dokumentów',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Mobile',
    feature: 'Push: faktura opłacona / KSeF',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'email/SMS' },
  },
  {
    category: 'Mobile',
    feature: 'Biometria / Face ID w flow logowania',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'OCR i dokumenty',
    feature: 'OCR wielostronicowy kosztów',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'prostsze szablony' },
  },
  {
    category: 'OCR i dokumenty',
    feature: 'OCR przy słabym oświetleniu / cienie',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'OCR i dokumenty',
    feature: 'Batch OCR (wiele plików naraz)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'OCR i dokumenty',
    feature: 'Confidence score + podświetlenie pól',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'KPiR',
    feature: 'Auto-kategoryzacja z OCR',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'KPiR',
    feature: 'Korekta KPiR po audycie OCR',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'yes' as const },
  },
  {
    category: 'Workflow',
    feature: 'Magiczny Import (KSeF + CSV)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Workflow',
    feature: 'Wkurzacz Dłużników',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Workflow',
    feature: 'Co-Pilot Księgowego',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'Cennik',
    feature: 'Przejrzysta stawka „wszystko w jednym”',
    ksefSaas: { status: 'note' as const, note: '49 zł/mc' },
    competitor: { status: 'note' as const, note: 'pakiety wg skali' },
  },
  {
    category: 'Cennik',
    feature: 'OCR / AI bez osobnej faktury',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Cennik',
    feature: '60 dni money-back',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Desktop',
    feature: 'Pełny back-office web (JDG)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'yes' as const },
  },
  {
    category: 'Desktop',
    feature: 'Zaawansowany moduł kadrowy',
    ksefSaas: { status: 'partial' as const },
    competitor: { status: 'yes' as const, note: 'silna strona wFirma' },
  },
  {
    category: 'Hosting',
    feature: 'Dane w UE',
    ksefSaas: { status: 'yes' as const, note: 'Frankfurt' },
    competitor: { status: 'yes' as const, note: 'PL' },
  },
  {
    category: 'Hosting',
    feature: 'Eksport po rezygnacji (30 dni)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
] satisfies ComparisonRow[];

export default function WfirmaPage() {
  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-4xl px-6">
        <header className="mb-16 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Porównanie 2026
          </p>
          <h1 className="font-display text-5xl leading-[1.1] font-semibold tracking-tighter-display md:text-6xl">
            KSeF SaaS <span className="text-muted-foreground">vs</span> wFirma
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            23 punkty porównawcze, historia produktu, cennik warstwowy i migracja — z naciskiem na mobile oraz
            jakość OCR kosztów.
          </p>
        </header>

        <div className="mb-16 rounded-3xl border border-glass-border bg-glass-white p-8 shadow-glass backdrop-blur-glass">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">TL;DR</p>
          <p className="text-lg leading-relaxed">
            <strong>wFirma</strong> to potężny kombajn dla biur i większych JDG: kadry, pełniejszy back-office i
            doświadczenie w polskim compliance. Jednocześnie mikrofirmy mobilne często słyszą dwa argumenty
            przeciw: <strong>brak dedykowanej aplikacji mobilnej</strong> w stylu „otwieram, skanuję, wysyłam do
            KSeF w windzie” oraz <strong>ograniczenia OCR</strong> na trudnych kosztach (wielostronicowe PDF-y,
            słabe zdjęcia, batch). <strong>KSeF SaaS</strong> nie próbuje zastąpić całego ERP — koncentruje się na
            superscieżce: KSeF + OCR + KPiR + windykacja + księgowa, z PWA i pushami jako domyślny sposób pracy.
          </p>
        </div>

        <section className="mb-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Krótka historia wFirma i infrastruktura
          </h2>
          <p>
            wFirma wyrosła z potrzeby połączenia księgowości, kadrowej i rozliczeń ZUS w jednym ekosystemie dla
            polskiego przedsiębiorcy. Z biegiem lat produkt rozrósł się o moduły, które dla biura rachunkowego są
            błogosławieństwem: jeden login, spójne dane, rozbudowane raporty. To sprawia, że wFirma pozostaje
            silnym graczem w segmencie „wszystko w jednym oknie przeglądarki na desktopie”.
          </p>
          <p>
            Hosting i przetwarzanie danych utrzymywane są zwykle w polskiej chmurze lub u lokalnych operatorów,
            co ułatwia argumentację „dane nie opuszczają granic”. W erze KSeF 2.0 kluczowe staje się jednak nie
            tylko „gdzie leży backup”, ale jak szybko pracownik w terenie może dodać koszt: czy musi wracać do
            biura, czy może zamknąć sprawę na telefonie z pełnym OCR i podglądem statusu wysyłki do Ministerstwa
            Finansów. Tu strategia mobile-first zaczyna dominować nad liczbą zakładek w menu desktopowym.
          </p>
          <p>
            Z perspektywy roadmapy, wFirma konsekwentnie rozbudowuje moduły kadrowe i integracje z bankami — to
            świetny wybór, gdy firma ma etat i skomplikowane listy płac. Natomiast jednoosobowa działalność
            usługowa, która żyje z telefonu i paragonów, często płaci ukrytym podatkiem czasu: brak natywnej apki
            oznacza walkę z zoomem w PDF-ie na małym ekranie i rezygnację z batch OCR, bo po prostu nie ma gdzie
            tego wygodnie ugryźć w drodze na budowę.
          </p>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 font-display text-2xl font-semibold tracking-tighter-text">
            Głosy użytkowników (zsyntetyzowane wątki publiczne)
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;Na biurku wFirma jest super, ale jak jestem na budowie, wolę zrobić zdjęcie i wrzucić później
                — szkoda, że nie ma normalnej apki.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Dyskusja branżowa, 2025</figcaption>
            </figure>
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;OCR działa, ale jak dostaję 15-stronicowy cennik jako załącznik, to i tak robię ręcznie.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Komentarz na grupie Facebook, 2024</figcaption>
            </figure>
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;Liczyłem, że telefon wystarczy do całego KPiR w podróży — okazało się, że to raczej desktop
                first.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Forum przedsiębiorców, 2025</figcaption>
            </figure>
          </div>
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
            To nie są cytaty z konkretnych osób, lecz stylizowane streszczenia częstych obserwacji — zawsze
            potwierdź stan funkcji na świeżym koncie trial i swoim zestawie dokumentów.
          </p>
        </section>

        <section className="mb-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Mobile-first vs desktop-first w erze KSeF
          </h2>
          <p>
            KSeF 2.0 zmienia psychologię pracy: status faktury nie jest już „pdf w mailu”, tylko rekord w systemie
            ministerialnym z numerem referencyjnym i audytem czasu. Oznacza to, że przedsiębiorca potrzebuje
            natychmiastowego feedbacku na telefonie: czy wysyłka się udała, czy wróciła walidacja FA(3), czy trzeba
            poprawić NIP kontrahenta. Push i offline queue nie są już „fajnym dodatkiem”, tylko redukcją ryzyka
            utraty płynności — bo przecież faktura nieopłacona często wynika z tego, że dokument utknął w
            „później zrobię na komputerze”.
          </p>
          <p>
            OCR w modelu mobilnym musi być tolerancyjny na złe warunki: lampka w aucie, papier termiczny paragonu,
            cień dłoni na kadrze. Ograniczenia OCR w sensie „działa na idealnych skanach” przekładają się na
            powrót do ręcznego przepisywania — czyli na stratę 5–8 minut na dokument, co przy setkach kosztów
            rocznie robi różnicę w pełnym etacie. Dlatego w tabeli porównujemy nie tylko checkbox „OCR jest”,
            ale batch, confidence i scenariusze trudnych zdjęć.
          </p>
          <p>
            wFirma pozostaje mocna, gdy organizacja ma biuro, które zbiera dokumenty centralnie. KSeF SaaS celuje
            w scenariusz „ja jestem biurem”: sam skanujesz, sam kategoryzujesz, sam wysyłasz do KSeF, a księgowa
            dostaje gotowy pakiet przez Co-Pilota. To dwa różne modele operacyjne — ważne, żebyś wybrał świadomie,
            a nie przez przypadek, bo „tak robi znajomy”.
          </p>
        </section>

        <ComparisonTable competitorName="wFirma" rows={COMPARISON_ROWS} />

        <section className="mt-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Pricing breakdown: gdzie rośnie koszt przy większej skali
          </h2>
          <p>
            wFirma stosuje klasyczny model pakietów zależnych od liczby dokumentów, użytkowników i modułów
            kadrowych — to uczciwe przy biurze obsługującym wiele spółek, ale bywa mniej przewidywalne dla JDG,
            która eksploduje liczbą kosztów w jednym kwartale (remont, import sprzętu, delegacje). Przy porównaniu
            zawsze policz: ile kosztuje dopięcie modułu, którego potrzebujesz tylko przez 3 miesiące, oraz czy OCR
            jest limitowany licznikami.
          </p>
          <ul className="list-disc space-y-3 pl-5 text-foreground/90">
            <li>
              <strong className="text-foreground">Warstwa podstawowa:</strong> rozliczenia, faktury, często sensowny
              start bez pełnej „maszyny mobilnej”.
            </li>
            <li>
              <strong className="text-foreground">Warstwa rozszerzeń:</strong> dodatkowe firmy, wyższe limity
              dokumentów, integracje — koszt skokowy przy wzroście skali.
            </li>
            <li>
              <strong className="text-foreground">Kadry i płace:</strong> mocna strona wFirma — jeśli tego
              potrzebujesz, może to uzasadniać wyższy abonament nawet przy słabszym mobile OCR.
            </li>
            <li>
              <strong className="text-foreground">KSeF SaaS:</strong> jedna stawka ok. 49 zł/mc, mobile + OCR + KSeF
              w jednym worku, money-back 60 dni — czyli przewidywalny TCO dla mikrofirmy bez działu IT.
            </li>
          </ul>
          <p>
            Nie traktuj tego rozdziału jako aktualnego cennika — to mapa mentalna przy negocjacjach z księgową i
            przy szacowaniu kosztu migracji. Zawsze pobierz oficjalny cennik i regulamin z dnia dzisiejszego.
          </p>
        </section>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-glass-border bg-glass-white p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz wFirmę, jeśli...
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Prowadzisz lub obsługujesz biuro z pełnym modułem kadrowym</li>
              <li>• Pracujesz głównie na desktopie i zbieracie dokumenty centralnie</li>
              <li>• Potrzebujesz głębokiej integracji z polskim stackiem bankowo-księgowym</li>
              <li>• OCR mobilny nie jest Twoim głównym KPI (np. mało kosztów)</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-foreground/20 bg-foreground/5 p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz KSeF SaaS, jeśli...
            </h3>
            <ul className="space-y-2 text-sm">
              <li>• Żyjesz z telefonu: budowy, dostawy, serwisy, taxi flota</li>
              <li>• OCR i batch kosztów to Twój bottleneck operacyjny</li>
              <li>• Chcesz push + offline queue bez obejść</li>
              <li>• Szukasz prostszego TCO niż rosnące pakiety przy skoku dokumentów</li>
            </ul>
          </div>
        </div>

        <section className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-8 shadow-glass backdrop-blur-glass">
          <h2 className="mb-4 font-display text-2xl font-semibold tracking-tighter-text">
            Wymigracja z wFirma: plan krok po kroku
          </h2>
          <ol className="list-decimal space-y-4 pl-5 text-muted-foreground leading-relaxed">
            <li>
              <strong className="text-foreground">Inwentaryzacja modułów:</strong> zaznacz, które funkcje wFirma
              są krytyczne (np. kadry) i czy zostają równolegle na okres przejściowy.
            </li>
            <li>
              <strong className="text-foreground">Eksport danych:</strong> pobierz zestawienia faktur, kosztów i
              kontrahentów w formatach obsługiwanych przez Magiczny Import; zachowaj kopie offline.
            </li>
            <li>
              <strong className="text-foreground">Import z KSeF:</strong> zsynchronizuj historię wysyłek FA z
              Ministerstwem — to redukuje ryzyko duplikatów przy ponownej rejestracji tych samych numerów.
            </li>
            <li>
              <strong className="text-foreground">Test OCR:</strong> weź 30 najbrudniejszych skanów z ostatniego
              kwartału i sprawdź, ile z nich domyka się bez Excela w KSeF SaaS.
            </li>
            <li>
              <strong className="text-foreground">Cut-over komunikacji:</strong> poinformuj kontrahentów o ewentualnej
              zmianie danych do płatności i webhooków, jeśli integrujesz sklep online.
            </li>
            <li>
              <strong className="text-foreground">Okno stabilizacji:</strong> przez 14 dni monitoruj kolejkę KSeF,
              UPO i raporty błędów; dopiero potem wyłączaj stary rutynowy eksport z wFirmy.
            </li>
          </ol>
        </section>

        <section className="mt-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Długa fala SEO: intencja „wFirma vs …”
          </h2>
          <p>
            Zapytania porównawcze mają to do siebie, że użytkownik już zna oba brandy i szuka argumentów „czy warto
            przesiadać się teraz, czy po lutym 2026”. Dlatego ta strona łączy historię produktu, realne wątki
            mobilne, breakdown cenowy i procedurę migracji: to sygnały dla wyszukiwarki, że treść jest procesowa,
            a nie tylko landingiem z jednym CTA.
          </p>
          <p>
            Dodatkowo połącz tę analizę z{' '}
            <Link href="/kalkulator-oszczednosci" className="text-foreground underline underline-offset-4 hover:text-primary">
              kalkulatorem oszczędności
            </Link>{' '}
            oraz{' '}
            <Link href="/pricing" className="text-foreground underline underline-offset-4 hover:text-primary">
              stroną cennika
            </Link>
            , żeby zbudować topical authority wokół KSeF + OCR + mikrofirma. Masz pytania migracyjne?{' '}
            <Link href="/kontakt" className="text-foreground underline underline-offset-4 hover:text-primary">
              Formularz kontaktowy
            </Link>{' '}
            zbiera też opis profilu dokumentów.
          </p>
          <p>
            Jeśli jesteś biurem rachunkowym i rozważasz hybrydę (część klientów na wFirma, część na KSeF SaaS),
            opisz nam profil dokumentów — przygotujemy szablon komunikacji do klientów końcowych i checklistę
            zgód RODO na przeniesienie eksportów.
          </p>
        </section>

        <div className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-10 text-center shadow-glass-lg backdrop-blur-glass">
          <h3 className="mb-4 font-display text-3xl font-semibold tracking-tighter-display">
            Mobile + OCR bez kompromisu
          </h3>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Załóż konto, zsynchronizuj KSeF i przetestuj batch OCR na swoich najgorszych skanach — zobaczysz różnicę
            zanim wypowiesz umowę u obecnego dostawcy.
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
