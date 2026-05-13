import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { ComparisonTable, type ComparisonRow } from '@/components/marketing/comparison-table';
import { Button } from '@/components/ui/button';

// Faza 22: comparison page — SEO ważne, cache na godzinę.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'KSeF SaaS vs iFirma 2026 — UI, push i KSeF',
  description:
    'Porównanie KSeF SaaS z iFirmą: interfejs, powiadomienia push, KSeF 2.0, OCR, cennik i migracja dla JDG oraz biur rachunkowych.',
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
    feature: 'Monitoring statusu po wysyłce',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Interfejs i UX',
    feature: 'Layout 2026 (glass / gesty / spacing)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'starszy UI' },
  },
  {
    category: 'Interfejs i UX',
    feature: 'Tryb ciemny spójny w całej aplikacji',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Interfejs i UX',
    feature: 'Skróty klawiszowe dla power userów',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Interfejs i UX',
    feature: 'Focus states / czytelność formularzy',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Powiadomienia',
    feature: 'Push web: status KSeF / UPO',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const, note: 'brak push' },
  },
  {
    category: 'Powiadomienia',
    feature: 'Push: przypomnienia o płatności',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const, note: 'email/SMS' },
  },
  {
    category: 'Powiadomienia',
    feature: 'Ciche godziny / kanały per użytkownik',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Mobile',
    feature: 'PWA instalowalna',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Mobile',
    feature: 'Capture z aparatu + przycinanie',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'OCR i KPiR',
    feature: 'OCR wielostronicowy kosztów',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'OCR i KPiR',
    feature: 'Confidence score dla pól OCR',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'no' as const },
  },
  {
    category: 'OCR i KPiR',
    feature: 'Auto-kategoryzacja KPiR',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
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
    feature: 'Jedna stawka „KSeF + OCR + workflow”',
    ksefSaas: { status: 'note' as const, note: '49 zł/mc' },
    competitor: { status: 'note' as const, note: 'pakiety modułowe' },
  },
  {
    category: 'Cennik',
    feature: '60 dni money-back',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Integracje',
    feature: 'Webhooks / API dla automatyzacji',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
  {
    category: 'Hosting',
    feature: 'Dane w UE (GDPR)',
    ksefSaas: { status: 'yes' as const, note: 'Frankfurt' },
    competitor: { status: 'yes' as const, note: 'PL' },
  },
  {
    category: 'Hosting',
    feature: 'Eksport pełny po rezygnacji (30 dni)',
    ksefSaas: { status: 'yes' as const },
    competitor: { status: 'partial' as const },
  },
] satisfies ComparisonRow[];

export default function IfirmaPage() {
  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-4xl px-6">
        <header className="mb-16 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Porównanie 2026
          </p>
          <h1 className="font-display text-5xl leading-[1.1] font-semibold tracking-tighter-display md:text-6xl">
            KSeF SaaS <span className="text-muted-foreground">vs</span> iFirma
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            23 wiersze porównania, historia marki, głosy użytkowników, rozbicie cen i migracja — z naciskiem na
            odświeżenie UI oraz push jako kanał operacyjny.
          </p>
        </header>

        <div className="mb-16 rounded-3xl border border-glass-border bg-glass-white p-8 shadow-glass backdrop-blur-glass">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">TL;DR</p>
          <p className="text-lg leading-relaxed">
            <strong>iFirma</strong> to jedna z najstarszych marek fakturowych w Polsce — stabilna, rozpoznawalna,
            z szeroką gamą funkcji „wszystko w jednym panelu”. Jednak w rozmowach z przedsiębiorcami mobilnymi
            pojawiają się dwa wątki: <strong>postarzały interfejs</strong> (wolniejsza nawigacja, mniej współczesnych
            mikrointerakcji) oraz <strong>brak sensownych pushy</strong> w modelu web-first, co oznacza, że status
            KSeF odkrywasz dopiero po wejściu na skrzynkę mailową. <strong>KSeF SaaS</strong> stawia na świeży UI,
            PWA z pushami i flow zaprojektowany pod KSeF 2.0 oraz OCR w jednym pakiecie — bo przecież „widziałem
            status wysyłki” nie może być funkcją premium.
          </p>
        </div>

        <section className="mb-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Krótka historia iFirma i hosting
          </h2>
          <p>
            iFirma funkcjonuje na rynku od lat — przez dekadę zdążyła przejść przez wiele iteracji funkcjonalnych i
            integracji z polskimi systemami bankowymi. To ogromna zaleta dla użytkowników, którzy cenią
            przewidywalność marki i szeroką dokumentację. Jednocześnie długa historia produktu często oznacza
            narastającą złożoność menu, starsze wzorce UI oraz techniczny dług w warstwie front-end, który trudno
            przebudować bez szoku dla milionów użytkowników.
          </p>
          <p>
            Hosting i przetwarzanie danych utrzymywane są zwykle w polskiej infrastrukturze, co jest plusem przy
            negocjacjach z księgową i przy wymaganiach dotyczących lokalizacji kopii zapasowych. W erze KSeF 2.0
            kluczowe staje się jednak nie tylko „gdzie stoi serwer”, ale jak szybko widzisz błąd walidacji FA(3) na
            telefonie — i czy możesz go naprawić jednym gestem, zamiast przeklikiwać pięć ekranów zaprojektowanych
            w czasach, gdy smartfon był jeszcze gadżetem.
          </p>
          <p>
            KSeF SaaS nie próbuje sklonować całej historii iFirma — celujemy w superscieżkę mikrofirmy: faktura,
            koszt, KPiR, KSeF, windykacja, księgowa. Dzięki temu możemy poświęcić więcej uwagi detalom UX (spacing,
            focus, dark mode) oraz kanałom realtime (push), które w codziennym życiu przedsiębiorcy zastępują
            „sprawdzę maila wieczorem”.
          </p>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 font-display text-2xl font-semibold tracking-tighter-text">
            Co mówią użytkownicy (parafrazy publicznych opinii)
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;Wszystko jest, tylko szukanie tej jednej opcji zajmuje mi za dużo czasu — czuję, że to UI z
                poprzedniej epoki.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Wątek forum, 2025</figcaption>
            </figure>
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;Mail przychodzi, ale wolałbym push jak w banku — wtedy od razu wiem, że KSeF przyjął fakturę.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Komentarz LinkedIn, 2024</figcaption>
            </figure>
            <figure className="rounded-2xl border border-glass-border bg-glass-white p-5 shadow-glass backdrop-blur-glass">
              <blockquote className="text-sm leading-relaxed text-muted-foreground">
                &quot;Jak już się nauczyłem, działa stabilnie — ale onboarding nowej osoby w firmie zajął tydzień.&quot;
              </blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">Grupa Facebook, 2025</figcaption>
            </figure>
          </div>
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
            Cytaty są stylizowane i nie identyfikują konkretnych osób — traktuj je jako ilustrację typowych frustracji
            UX / powiadomień, a nie jako ocenę sądową produktu konkurenta.
          </p>
        </section>

        <section className="mb-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Dlaczego UI i push mają znaczenie przy KSeF
          </h2>
          <p>
            Interfejs to nie kwestia „ładnych ikonek”, tylko koszt błędu ludzkiego: im więcej kroków i rozproszenia
            uwagi, tym wyższe ryzyko pomyłki NIP, stawki VAT lub numeru faktury zaliczkowej. Przy KSeF 2.0 błąd
            walidacji oznacza stratę czasu na poprawkę, a czasem także problem z płynnością, jeśli kontrahent
            czeka na poprawny dokument. Nowoczesny layout z wyraźnymi stanami focusu i czytelną hierarchią sekcji
            redukuje ten koszt — szczególnie u przedsiębiorców pracujących wieczorami na laptopie w półświetle.
          </p>
          <p>
            Push z kolei zmienia model uwagi: zamiast „sprawdzę skrzynkę co godzinę”, dostajesz atomowy komunikat o
            statusie KSeF lub przypomnieniu o płatności. To nie zastępuje pełnego audytu w panelu, ale obniża latency
            Twojej reakcji — a przy windykacji i łańcuchu dostaw latency przekłada się bezpośrednio na cash flow.
            Dlatego w tabeli eksponujemy brak pushy jako twardy wiersz, a nie marketingowy przymiotnik.
          </p>
          <p>
            Starszy UI bywa jednocześnie zaletą dla użytkowników przyzwyczajonych do konkretnych ścieżek — jeśli
            pracujesz 10 lat w tym samym menu, zmiana może boleć. KSeF SaaS adresuje osoby, które wolą odświeżone
            wzorce nawigacji i są gotowe na migrację pod warunkiem, że onboarding i Magiczny Import skrócą czas
            przejścia z tygodni do dni.
          </p>
        </section>

        <ComparisonTable competitorName="iFirma" rows={COMPARISON_ROWS} />

        <section className="mt-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Pricing breakdown: moduły vs jeden pakiet
          </h2>
          <p>
            iFirma tradycyjnie sprzedaje szeroki zestaw funkcji w modelu modułowym — to pozwala dopasować ofertę do
            biura rachunkowego, ale bywa mniej przejrzyste dla JDG, która chce po prostu KSeF + OCR + KPiR w jednym pakiecie.
            Przy porównaniu zawsze rozłóż cennik na: abonament bazowy, limity dokumentów, moduły kadrowe,
            integracje premium oraz ewentualne opłaty za szkolenie użytkowników.
          </p>
          <ul className="list-disc space-y-3 pl-5 text-foreground/90">
            <li>
              <strong className="text-foreground">Warstwa wejścia:</strong> często atrakcyjna dla prostych faktur
              sprzedaży, ale bez pełnego stacku mobilnego i push.
            </li>
            <li>
              <strong className="text-foreground">Warstwa rozszerzeń:</strong> dodatkowe moduły, wyższe limity,
              integracje — koszt skokowy przy wzroście skali biura.
            </li>
            <li>
              <strong className="text-foreground">Koszty ukryte:</strong> czas pracy na szkoleniu nowych osób w
              złożonym UI oraz czas na ręczne sprawdzanie statusów, jeśli brak push.
            </li>
            <li>
              <strong className="text-foreground">KSeF SaaS:</strong> jedna stawka ok. 49 zł/mc, push + OCR + KSeF w
              jednym worku, money-back 60 dni — czyli prostszy TCO dla mikrofirmy.
            </li>
          </ul>
          <p>
            Pamiętaj, że cenniki zmieniają się kwartalnie — zanim podejmiesz decyzję migracyjną, pobierz aktualny PDF
            z witryny iFirmy i porównaj go z naszym pricingiem oraz kalkulatorem oszczędności.
          </p>
        </section>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-glass-border bg-glass-white p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz iFirmę, jeśli...
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Znasz produkt latami i nie chcesz zmieniać nawyków menu</li>
              <li>• Korzystasz głównie z desktopu i maila jako kanału informacji</li>
              <li>• Potrzebujesz szerokiego zestawu funkcji biurowych w jednym koncie</li>
              <li>• Push i mobile-first nie są Twoim krytycznym KPI</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-foreground/20 bg-foreground/5 p-7 backdrop-blur-glass">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tighter-text">
              Wybierz KSeF SaaS, jeśli...
            </h3>
            <ul className="space-y-2 text-sm">
              <li>• Frustruje Cię czas znalezienia opcji w przeładowanym UI</li>
              <li>• Chcesz push o statusie KSeF zamiast odświeżania skrzynki</li>
              <li>• Pracujesz hybrydowo (telefon + laptop) i zależy Ci na spójnym dark mode</li>
              <li>• Szukasz prostszego onboarding dla nowego pracownika</li>
            </ul>
          </div>
        </div>

        <section className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-8 shadow-glass backdrop-blur-glass">
          <h2 className="mb-4 font-display text-2xl font-semibold tracking-tighter-text">
            Wymigracja z iFirma: checklista techniczna
          </h2>
          <ol className="list-decimal space-y-4 pl-5 text-muted-foreground leading-relaxed">
            <li>
              <strong className="text-foreground">Audyt danych:</strong> wypisz moduły iFirmy, z których korzystasz
              (sprzedaż, koszty, ZUS, księgowa) oraz integracje z bankiem.
            </li>
            <li>
              <strong className="text-foreground">Eksport:</strong> pobierz CSV/JPK/XML zgodnie z instrukcją eksportu;
              zrób drugą kopię na nośnik zewnętrzny.
            </li>
            <li>
              <strong className="text-foreground">Import KSeF:</strong> zsynchronizuj historię wysyłek FA, żeby
              uniknąć duplikatów referencyjnych numerów.
            </li>
            <li>
              <strong className="text-foreground">Test UX:</strong> przejdź 10 najczęstszych scenariuszy (faktura
              zaliczkowa, korekta, koszt OCR) i zmierz czas przed/po.
            </li>
            <li>
              <strong className="text-foreground">Push i uprawnienia:</strong> skonfiguruj powiadomienia przeglądarki
              oraz PWA na telefonie pracowników terenowych.
            </li>
            <li>
              <strong className="text-foreground">Hypercare:</strong> przez 14 dni monitoruj log błędów KSeF i
              zgłoszenia księgowej — po stabilizacji wyłącz rutynowe logowanie do starego panelu.
            </li>
          </ol>
        </section>

        <section className="mt-16 space-y-5 text-muted-foreground leading-relaxed">
          <h2 className="font-display text-2xl font-semibold tracking-tighter-text text-foreground">
            Treść pod SEO: topical authority wokół „iFirma vs …”
          </h2>
          <p>
            Strony porównawcze rankują lepiej, gdy łączą tabelę funkcji z narracją ekspercką: historia produktu,
            hosting, cennik, migracja, cytaty użytkowników i sekcję o ryzyku operacyjnym. Dzięki temu wyszukiwarka
            widzi nie tylko listę checkboxów, ale kontekst decyzyjny mikrofirmy — czyli dokładnie to, czego szuka
            użytkownik wpisując długie zapytanie z nazwą konkurenta.
          </p>
          <p>
            Powiąż lekturę z{' '}
            <Link href="/kalkulator-oszczednosci" className="text-foreground underline underline-offset-4 hover:text-primary">
              kalkulatorem oszczędności
            </Link>
            ,{' '}
            <Link href="/pricing" className="text-foreground underline underline-offset-4 hover:text-primary">
              cennikiem
            </Link>{' '}
            oraz{' '}
            <Link href="/kontakt" className="text-foreground underline underline-offset-4 hover:text-primary">
              kontaktem
            </Link>
            , żeby zbudować graf wewnętrznych powiązań tematycznych.
          </p>
          <p>
            Jeśli jesteś biurem rachunkowym i chcesz zaproponować klientom hybrydę (część na iFirma, część na KSeF
            SaaS), przygotujemy dla Ciebie szablon komunikatu RODO oraz harmonogram techniczny migracji paczkowej —
            napisz na support@ksef-saas.pl z informacją o liczbie podmiotów.
          </p>
        </section>

        <div className="mt-16 rounded-3xl border border-glass-border bg-glass-white p-10 text-center shadow-glass-lg backdrop-blur-glass">
          <h3 className="mb-4 font-display text-3xl font-semibold tracking-tighter-display">
            Nowy UI + push = mniej „sprawdzę później”
          </h3>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            Załóż konto, włącz PWA, przetestuj push przy pierwszej wysyłce FA(3) i zobacz, czy Twój dzień pracy
            staje się krótszy jeszcze przed pełnym importem historii.
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
