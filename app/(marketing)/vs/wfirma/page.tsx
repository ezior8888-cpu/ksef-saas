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
    <article>
      <VsHero
        competitorName="wFirma"
        subtitle="23 punkty porównawcze, historia produktu, cennik warstwowy i migracja — z naciskiem na mobile oraz jakość OCR kosztów."
      />

      <VsTldr>
        <span className="font-editorial font-medium text-[var(--marketing-text)]">
          wFirma
        </span>{' '}
        to potężny kombajn dla biur i większych JDG: kadry, pełniejszy
        back-office i doświadczenie w polskim compliance. Jednocześnie
        mikrofirmy mobilne często słyszą dwa argumenty przeciw:{' '}
        <strong className="font-semibold">brak dedykowanej aplikacji mobilnej</strong>{' '}
        w stylu &bdquo;otwieram, skanuję, wysyłam do KSeF w windzie&rdquo; oraz{' '}
        <strong className="font-semibold">ograniczenia OCR</strong> na trudnych
        kosztach (wielostronicowe PDF-y, słabe zdjęcia, batch).{' '}
        <span className="font-editorial font-medium italic text-[var(--marketing-accent)]">
          FaktFlow
        </span>{' '}
        nie próbuje zastąpić całego ERP — koncentruje się na superscieżce: KSeF
        + OCR + KPiR + windykacja + księgowa, z PWA i pushami jako domyślny
        sposób pracy.
      </VsTldr>

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <VsSectionHeader
          num="01"
          eyebrow="Historia"
          title="Krótka historia wFirma i infrastruktura"
        />
        <section className="space-y-5 leading-relaxed text-[var(--marketing-muted)]">
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

        <VsSectionHeader
          num="02"
          eyebrow="Głosy użytkowników"
          title="Zsyntetyzowane wątki publiczne"
        />
        <div className="grid gap-10 md:grid-cols-3 md:gap-12">
          {[
            { q: 'Na biurku wFirma jest super, ale jak jestem na budowie, wolę zrobić zdjęcie i wrzucić później — szkoda, że nie ma normalnej apki.', meta: 'Dyskusja branżowa · 2025' },
            { q: 'OCR działa, ale jak dostaję 15-stronicowy cennik jako załącznik, to i tak robię ręcznie.', meta: 'Komentarz na grupie Facebook · 2024' },
            { q: 'Liczyłem, że telefon wystarczy do całego KPiR w podróży — okazało się, że to raczej desktop first.', meta: 'Forum przedsiębiorców · 2025' },
          ].map((o) => (
            <figure
              key={o.meta}
              className="border-t-2 border-emerald-500/40 pt-6"
            >
              <blockquote className="font-editorial text-lg italic leading-snug text-[var(--marketing-muted)]">
                <span className="mr-1 font-editorial text-3xl leading-none text-[var(--marketing-accent)]">&bdquo;</span>
                {o.q}
                <span className="ml-0.5 font-editorial text-2xl leading-none text-[var(--marketing-accent)]">&rdquo;</span>
              </blockquote>
              <figcaption className="mt-4 text-[10px] uppercase tracking-[0.22em] text-[var(--marketing-muted)]">
                {o.meta}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-8 font-editorial text-sm italic leading-relaxed text-[var(--marketing-muted)]">
          To nie są cytaty z konkretnych osób, lecz stylizowane streszczenia częstych obserwacji — zawsze potwierdź stan funkcji na świeżym koncie trial i swoim zestawie dokumentów.
        </p>

        <VsSectionHeader
          num="03"
          eyebrow="Mobile vs desktop"
          title="Mobile-first vs desktop-first w erze KSeF"
        />
        <section className="space-y-5 leading-relaxed text-[var(--marketing-muted)]">
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

        <div className="mb-6 mt-16 flex items-baseline gap-4 border-b border-white/10 pb-4">
          <span className="editorial-section-num text-3xl">04.</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--marketing-muted)]">
            Tabela porównawcza
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <ComparisonTable competitorName="wFirma" rows={COMPARISON_ROWS} />
      </div>

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <VsSectionHeader
          num="05"
          eyebrow="Pricing breakdown"
          title="Gdzie rośnie koszt przy większej skali"
        />
        <section className="space-y-5 leading-relaxed text-[var(--marketing-muted)]">
          <p>
            wFirma stosuje klasyczny model pakietów zależnych od liczby dokumentów, użytkowników i modułów kadrowych — to uczciwe przy biurze obsługującym wiele spółek, ale bywa mniej przewidywalne dla JDG, która eksploduje liczbą kosztów w jednym kwartale (remont, import sprzętu, delegacje). Przy porównaniu zawsze policz: ile kosztuje dopięcie modułu, którego potrzebujesz tylko przez 3 miesiące, oraz czy OCR jest limitowany licznikami.
          </p>
          <ul className="space-y-0 border-t border-zinc-100">
            {[
              { k: 'Warstwa podstawowa', v: 'rozliczenia, faktury, często sensowny start bez pełnej „maszyny mobilnej”.' },
              { k: 'Warstwa rozszerzeń', v: 'dodatkowe firmy, wyższe limity dokumentów, integracje — koszt skokowy przy wzroście skali.' },
              { k: 'Kadry i płace', v: 'mocna strona wFirma — jeśli tego potrzebujesz, może to uzasadniać wyższy abonament nawet przy słabszym mobile OCR.' },
              { k: 'FaktFlow', v: 'jedna stawka ok. 49 zł/mc, mobile + OCR + KSeF w jednym worku, money-back 60 dni — czyli przewidywalny TCO dla mikrofirmy bez działu IT.' },
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
                  <p className="mt-1 text-sm text-[var(--marketing-muted)]">
                    {item.v}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p>
            Nie traktuj tego rozdziału jako aktualnego cennika — to mapa mentalna przy negocjacjach z księgową i przy szacowaniu kosztu migracji. Zawsze pobierz oficjalny cennik i regulamin z dnia dzisiejszego.
          </p>
        </section>
      </div>

      <VsChooseColumns
        competitorName="wFirma"
        whenChooseCompetitor={[
          'Prowadzisz lub obsługujesz biuro z pełnym modułem kadrowym',
          'Pracujesz głównie na desktopie i zbieracie dokumenty centralnie',
          'Potrzebujesz głębokiej integracji z polskim stackiem bankowo-księgowym',
          'OCR mobilny nie jest Twoim głównym KPI (np. mało kosztów)',
        ]}
        whenChooseUs={[
          'Żyjesz z telefonu: budowy, dostawy, serwisy, taxi flota',
          'OCR i batch kosztów to Twój bottleneck operacyjny',
          'Chcesz push + offline queue bez obejść',
          'Szukasz prostszego TCO niż rosnące pakiety przy skoku dokumentów',
        ]}
      />

      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <VsSectionHeader
          num="06"
          eyebrow="Migracja krok po kroku"
          title="Wyprowadzka z wFirma"
        />
        <ol className="space-y-0 border-t border-zinc-100">
          {[
            { k: 'Inwentaryzacja modułów', v: 'zaznacz, które funkcje wFirma są krytyczne (np. kadry) i czy zostają równolegle na okres przejściowy.' },
            { k: 'Eksport danych', v: 'pobierz zestawienia faktur, kosztów i kontrahentów w formatach obsługiwanych przez Magiczny Import; zachowaj kopie offline.' },
            { k: 'Import z KSeF', v: 'zsynchronizuj historię wysyłek FA z Ministerstwem — to redukuje ryzyko duplikatów przy ponownej rejestracji tych samych numerów.' },
            { k: 'Test OCR', v: 'weź 30 najbrudniejszych skanów z ostatniego kwartału i sprawdź, ile z nich domyka się bez Excela w FaktFlow.' },
            { k: 'Cut-over komunikacji', v: 'poinformuj kontrahentów o ewentualnej zmianie danych do płatności i webhooków, jeśli integrujesz sklep online.' },
            { k: 'Okno stabilizacji', v: 'przez 14 dni monitoruj kolejkę KSeF, UPO i raporty błędów; dopiero potem wyłączaj stary rutynowy eksport z wFirmy.' },
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
                <p className="mt-1 text-sm text-[var(--marketing-muted)]">
                  {step.v}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <VsSectionHeader
          num="07"
          eyebrow="SEO + E-E-A-T"
          title="Długa fala wokół „wFirma vs …”"
        />
        <section className="space-y-5 leading-relaxed text-[var(--marketing-muted)]">
          <p>
            Zapytania porównawcze mają to do siebie, że użytkownik już zna oba brandy i szuka argumentów &bdquo;czy warto przesiadać się teraz, czy po lutym 2026&rdquo;. Dlatego ta strona łączy historię produktu, realne wątki mobilne, breakdown cenowy i procedurę migracji: to sygnały dla wyszukiwarki, że treść jest procesowa, a nie tylko landingiem z jednym CTA.
          </p>
          <p>
            Dodatkowo połącz tę analizę z{' '}
            <Link
              href="/kalkulator-oszczednosci"
              className="font-editorial italic underline decoration-emerald-400 decoration-2 underline-offset-[4px] transition-all hover:decoration-[3px]"
            >
              kalkulatorem oszczędności
            </Link>{' '}
            oraz{' '}
            <Link
              href="/pricing"
              className="font-editorial italic underline decoration-emerald-400 decoration-2 underline-offset-[4px] transition-all hover:decoration-[3px]"
            >
              stroną cennika
            </Link>
            , żeby zbudować topical authority wokół KSeF + OCR + mikrofirma. Masz pytania migracyjne?{' '}
            <Link
              href="/kontakt"
              className="font-editorial italic underline decoration-emerald-400 decoration-2 underline-offset-[4px] transition-all hover:decoration-[3px]"
            >
              Formularz kontaktowy
            </Link>{' '}
            zbiera też opis profilu dokumentów.
          </p>
          <p>
            Jeśli jesteś biurem rachunkowym i rozważasz hybrydę (część klientów na wFirma, część na FaktFlow), opisz nam profil dokumentów — przygotujemy szablon komunikacji do klientów końcowych i checklistę zgód RODO na przeniesienie eksportów.
          </p>
        </section>
      </div>

      <VsMigrationCta
        competitorName="wFirma"
        copy="Załóż konto, zsynchronizuj KSeF i przetestuj batch OCR na swoich najgorszych skanach — zobaczysz różnicę zanim wypowiesz umowę u obecnego dostawcy."
      />
    </article>
  );
}
