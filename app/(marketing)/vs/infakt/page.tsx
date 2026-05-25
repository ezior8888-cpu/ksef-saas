import type { Metadata } from 'next';
import Link from 'next/link';

import { ComparisonTable, type ComparisonRow } from '@/components/marketing/comparison-table';
import {
  VsHero,
  VsTldr,
  VsSectionHeader,
  VsChooseColumns,
  VsMigrationCta,
} from '@/components/marketing/vs-page-chrome';

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
    <article>
      <VsHero
        competitorName="inFakt"
        subtitle="24 wiersze tabeli plus przewodnik migracji i rozbicie cenowe — pod kątem mikrofirm, które żyją z paragonów i faktur brutto."
      />

      <VsTldr>
        <span className="font-editorial font-medium text-zinc-900">
          inFakt
        </span>{' '}
        to dojrzały program online z szeroką bazą użytkowników i sensowną
        integracją KSeF, ale w praktyce wielu przedsiębiorców odbija się od
        trzech ścian: braku wygodnego flow dla{' '}
        <strong className="font-semibold">faktur gross</strong> (kosztowych w
        cenach brutto), <strong className="font-semibold">ograniczeń AI-OCR</strong>{' '}
        na trudnych PDF-ach oraz{' '}
        <strong className="font-semibold">drogiego stacku</strong>, gdzie
        &bdquo;pełna moc&rdquo; siedzi w wyższych pakietach i dodatkach.{' '}
        <span className="font-editorial font-medium italic text-emerald-700">
          FaktFlow
        </span>{' '}
        stawia na jedną, przewidywalną stawkę, OCR inspirowany pracą w terenie
        i flow zaprojektowany pod KSeF 2.0 od pierwszego dnia — bez dopłat za
        &bdquo;inteligentne&rdquo; funkcje, które i tak są potrzebne przy KPiR.
      </VsTldr>

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <VsSectionHeader
          num="01"
          eyebrow="Historia"
          title="Krótka historia inFakt i model hostingu"
        />
        <section className="space-y-5 leading-relaxed text-zinc-600">
          <p>
            inFakt zbudował pozycję na polskim rynku SaaS księgowym jeszcze w erze, gdy KSeF był raczej obietnicą legislacyjną niż codziennym obowiązkiem. Produkt wyrosł z prostego fakturowania online, stopniowo rozszerzany o rozliczenia ZUS, magazyn czy współpracę z biurem rachunkowym. To doświadczenie widać po stronie stabilności biznesowej i rozpoznawalności marki — dla wielu księgowych &bdquo;inFakt&rdquo; to domyślny punkt odniesienia przy onboardingu klienta.
          </p>
          <p>
            Z perspektywy architektury, typowy hosting inFakt to polskie centra danych i ścisłe trzymanie się lokalnych standardów compliance, co jest plusem dla firm szukających &bdquo;100% PL&rdquo;. Jednocześnie przy KSeF 2.0 liczy się nie tylko lokalizacja serwera, ale przepływ danych: jak szybko system odróżnia fałszywie pozytywny status wysyłki od realnego UPO, jak radzi sobie z wielostronicowymi fakturami kosztowymi i czy pozwala pracować na fakturach gross bez obejść w arkuszu. Tu właśnie pojawiają się różnice kultury produktowej: inFakt ewoluował z klasycznego e-fakturowania, podczas gdy FaktFlow projektujemy od zera pod mikrofirmę, która skanuje dokumenty w aucie i chce zamknąć KPiR tego samego dnia.
          </p>
          <p>
            Warto też pamiętać, że &bdquo;historia produktu&rdquo; to nie tylko data założenia firmy, ale tempo wdrażania zmian ministerialnych. KSeF 2.0 wymusza krótsze SLA na poprawki, więcej telemetrii po stronie API MF oraz większą odporność na weekendowe maintenance. W takim środowisku liczy się, czy Twój dostawca traktuje OCR i walidację FA(3) jako rdzeń subskrypcji, czy jako moduł premium — i ile realnie zapłacisz, zanim &bdquo;zwykła&rdquo; faktura kosztowa przestanie być walką z formularzem.
          </p>
        </section>

        <VsSectionHeader
          num="02"
          eyebrow="Opinie publiczne"
          title="Co mówią użytkownicy (skróty z dyskusji)"
        />
        <div className="grid gap-10 md:grid-cols-3 md:gap-12">
          {[
            {
              q: 'Super do prostych faktur, ale jak wchodzi paragon z Biedronki i brutto, to znów Excel.',
              meta: 'Opinia z forum branżowego · 2025',
            },
            {
              q: 'AI OCR pomaga, ale na skanach wielostronicowych kończy się na ręcznym przepisywaniu pozycji.',
              meta: 'Komentarz z LinkedIn · 2025',
            },
            {
              q: 'Liczyłem na jeden pakiet, a żeby dogonić potrzeby biura, musiałem wejść znacznie wyżej w cennik.',
              meta: 'Wątek dyskusyjny · grupa FB · 2024',
            },
          ].map((o) => (
            <figure
              key={o.meta}
              className="border-t-2 border-emerald-500/40 pt-6"
            >
              <blockquote className="font-editorial text-lg italic leading-snug text-zinc-600">
                <span className="mr-1 font-editorial text-3xl leading-none text-emerald-700">
                  &bdquo;
                </span>
                {o.q}
                <span className="ml-0.5 font-editorial text-2xl leading-none text-emerald-700">
                  &rdquo;
                </span>
              </blockquote>
              <figcaption className="mt-4 text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                {o.meta}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-8 font-editorial text-sm italic leading-relaxed text-zinc-500">
          Powyższe cytaty są stylizowanymi skrótami typowych wątków z publicznych dyskusji — nie cytują konkretnej osoby ani nie są gwarancją aktualnego stanu produktu konkurenta. Zawsze zweryfikuj funkcje na własnym koncie trial przed decyzją migracyjną.
        </p>

        <VsSectionHeader
          num="03"
          eyebrow="Hard requirement"
          title="Dlaczego gross invoices i OCR to dziś nie opcja"
        />
        <section className="space-y-5 leading-relaxed text-zinc-600">
          <p>
            Gross invoices — czyli dokumenty kosztowe w cenach brutto, często z paragonów albo z importu zagranicznego — nie są ciekawostką dla jednej branży. To codzienność usług remontowych, transportu, gastronomii i freelancingu B2B, gdzie kontrahent wystawia brutto, a Ty musisz rozłożyć VAT i koszt bez błędu. Jeśli system nie prowadzi Cię przez ten flow jak przez checklistę KSeF, tracisz czas na korekty i podwójne wpisy w KPiR.
          </p>
          <p>
            AI-OCR z kolei nie może być &bdquo;ładną ikonką&rdquo; w cenniku. Musi radzić sobie z krzywym skanem, drugą stroną faktury z regulaminem na odwrocie i tabelą pozycji, gdzie każda linia ma inną stawkę VAT. Ograniczenia modelu — limit stron, brak confidence score, brak uczenia z poprawek — przekładają się bezpośrednio na godziny Twojej pracy albo koszt księgowej. Dlatego w tabeli porównawczej celowo eksponujemy wiersze, które bolą najczęściej w rozmowach z naszymi beta-użytkownikami.
          </p>
          <p>
            Trzeci filar to cena całkowita posiadania (TCO): nawet jeśli pakiet startowy wygląda atrakcyjnie, suma add-onów za OCR, dodatkowe firmy czy wyższe limity dokumentów bywa nieprzewidywalna. FaktFlow trzyma prostą zasadę: funkcje potrzebne do domknięcia KPiR i KSeF nie są zakładką &bdquo;Pro+&rdquo;, tylko rdzeniem produktu — stąd nacisk na jedną stawkę i money-back jako realny hedge ryzyka dla mikrofirmy.
          </p>
        </section>

        <div className="mb-6 mt-16 flex items-baseline gap-4 border-b border-zinc-200 pb-4">
          <span className="editorial-section-num text-3xl">04.</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            Tabela porównawcza
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <ComparisonTable competitorName="inFakt" rows={COMPARISON_ROWS} />
      </div>

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <VsSectionHeader
          num="05"
          eyebrow="Pricing breakdown"
          title="Co zwykle jest w bazie, a co „dopłata”"
        />
        <section className="space-y-5 leading-relaxed text-zinc-600">
          <p>
            Poniższy podział ma charakter edukacyjny i opiera się na typowym schemacie &bdquo;pakiet + moduły&rdquo;, który wielokrotnie widzimy u polskich SaaS księgowych — nie jest prawnym opisem cennika konkurenta. Zanim podejmiesz decyzję, pobierz aktualny cennik inFakt i porównaj limity (liczba firm, użytkowników, dokumentów, integracji) linia po linii.
          </p>
          <ul className="space-y-0 border-t border-zinc-100">
            {[
              { k: 'Baza (najczęściej reklamowana stawka)', v: 'proste faktury sprzedaży, podstawowe rozliczenia, często sensowny start dla jednoosobowej działalności bez dużej skrzynki kosztowej.' },
              { k: 'Wyższe pakiety', v: 'więcej dokumentów, wielofirmowość, rozbudowane uprawnienia dla biura — tu cena rośnie skokowo, bo łączy się z limitami API i raportowania.' },
              { k: 'AI / OCR / automatyzacje', v: 'często jako osobny moduł albo feature-gating — dokładnie te elementy, które w FaktFlow traktujemy jako standard przy mikrofirmie z dużą liczbą kosztów.' },
              { k: 'FaktFlow (referencja)', v: 'jedna stawka ok. 49 zł/mc, pełny OCR w pakiecie, Magiczny Import, Wkurzacz, Co-Pilot księgowego i 60 dni money-back — bez tajnych „upgrade’ów”, żeby domknąć miesiąc.' },
            ].map((item, i) => (
              <li
                key={item.k}
                className="grid grid-cols-12 gap-4 border-b border-zinc-100 py-4"
              >
                <span className="editorial-section-num col-span-1 text-xs">
                  {String(i + 1).padStart(2, '0')}.
                </span>
                <div className="col-span-11">
                  <p className="font-editorial text-base font-medium">{item.k}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {item.v}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p>
            Jeśli porównujesz oferty, policz nie tylko miesięczny abonament, ale też koszt godziny Twojej pracy przy ręcznym poprawianiu OCR i koszt błędów wysyłki do KSeF. Często okazuje się, że &bdquo;tańszy pakiet&rdquo; jest droższy o 10&ndash;20 godzin rocznie — dokładnie ten mechanizm modelujemy w kalkulatorze oszczędności na landing page.
          </p>
        </section>
      </div>

      <VsChooseColumns
        competitorName="inFakt"
        whenChooseCompetitor={[
          'Masz etatową księgową, która zna produkt „na pamięć” i pilnuje limitów',
          'Większość dokumentów to proste faktury netto B2B',
          'Potrzebujesz głębokiej integracji z ekosystemem, w którym inFakt jest już osadzony',
          'Akceptujesz dopłaty za moduły AI/OCR w zamian za markę „znaną z rynku”',
        ]}
        whenChooseUs={[
          'Masz gross invoices i paragony, które muszą wejść do KPiR bez obejść',
          'OCR na trudnych PDF-ach to Twój bottleneck, nie „nice to have”',
          'Chcesz przewidywalny rachunek: jedna stawka, pełne funkcje KSeF-first',
          'Pracujesz mobilnie i chcesz push + offline capture w jednym produkcie',
        ]}
      />

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <VsSectionHeader
          num="06"
          eyebrow="Migracja krok po kroku"
          title="Wyprowadzka z inFakt"
        />
        <ol className="space-y-0 border-t border-zinc-100">
          {[
            { k: 'Spisz checklistę', v: 'lista NIP-ów, użytkowników, integracji bankowych i okresów, które muszą wejść do nowego systemu bez luki w JPK.' },
            { k: 'Eksport z inFakt', v: 'pobierz CSV / JPK / ZIP zgodnie z dokumentacją eksportu — zachowaj kopie na dysku zewnętrznym (audyt RODO).' },
            { k: 'KSeF jako źródło prawdy', v: 'uruchom Magiczny Import: historia z KSeF (np. ostatnie 24 miesiące) + pliki z konkurencji — to skraca czas migracji z godzin do minut.' },
            { k: 'Walidacja brutto/netto', v: 'dla faktur gross przejdź próbkę 20 dokumentów i porównaj kwoty VAT z oryginałem — upewnij się, że nowy flow nie wymusza ręcznych korekt.' },
            { k: 'Cut-over', v: 'ustal dzień przełączenia wysyłki nowych FA(3) tylko z FaktFlow, wyłącz duplikaty webhooków i poinformuj kontrahentów o ewentualnej zmianie numeracji.' },
            { k: 'Hypercare', v: 'przez 2 tygodnie monitoruj kolejkę KSeF, statusy UPO i raporty błędów — po stabilizacji zaplanuj szkolenie księgowej z Co-Pilotem.' },
          ].map((step, i) => (
            <li
              key={step.k}
              className="grid grid-cols-12 gap-4 border-b border-zinc-100 py-4"
            >
              <span className="editorial-section-num col-span-1 text-xs">
                {String(i + 1).padStart(2, '0')}.
              </span>
              <div className="col-span-11">
                <p className="font-editorial text-base font-medium">{step.k}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {step.v}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 font-editorial text-sm italic leading-relaxed text-zinc-500">
          Jeśli potrzebujesz checklisty PDF lub wsparcia przy imporcie wielofirmowym, zostaw zgłoszenie na support@ksef-saas.pl — dopasujemy scenariusz do Twojej skali.
        </p>

        <VsSectionHeader
          num="07"
          eyebrow="SEO + E-E-A-T"
          title="Słowa kluczowe i intencja wyszukiwania"
        />
        <section className="space-y-5 leading-relaxed text-zinc-600">
          <p>
            Użytkownicy szukający &bdquo;inFakt vs &hellip;&rdquo;, &bdquo;inFakt KSeF 2.0&rdquo;, &bdquo;inFakt OCR cena&rdquo; mają wysoką intencję migracyjną — ale też wysokie oczekiwanie merytoryczne. Dlatego ta strona celowo miesza twardą tabelę funkcji z narracją o TCO, gross invoices i limitach OCR: to są sygnały jakościowe, które Google coraz częściej wiąże z E-E-A-T (doświadczenie, ekspertyza, autorytet, wiarygodność). Nie obiecujemy magii — pokazujemy, które decyzje produktowe realnie wpływają na Twój dzień pracy.
          </p>
          <p>
            Jeśli jesteś na etapie due diligence, zestaw tę stronę z naszym{' '}
            <Link
              href="/kalkulator-oszczednosci"
              className="font-editorial italic underline decoration-emerald-400 decoration-2 underline-offset-[4px] transition-all hover:decoration-[3px]"
            >
              kalkulatorem oszczędności
            </Link>
            ,{' '}
            <Link
              href="/pricing"
              className="font-editorial italic underline decoration-emerald-400 decoration-2 underline-offset-[4px] transition-all hover:decoration-[3px]"
            >
              cennikiem
            </Link>{' '}
            oraz regulaminem money-back. Dla biur rachunkowych przygotowujemy osobny scenariusz wielomiesięczny (tokeny księgowe, pakiet eksportów) —{' '}
            <Link
              href="/kontakt"
              className="font-editorial italic underline decoration-emerald-400 decoration-2 underline-offset-[4px] transition-all hover:decoration-[3px]"
            >
              napisz
            </Link>
            , ile firm planujesz przenieść w Q1/Q2, a zaproponujemy harmonogram techniczny.
          </p>
        </section>
      </div>

      <VsMigrationCta
        competitorName="inFakt"
        copy="Magiczny Import zaciąga historię z KSeF i pliki eksportu inFakt. Przez 30 dni trialu sprawdzisz, czy Twój najgorszy PDF przechodzi przez OCR bez Excela."
      />
    </article>
  );
}
