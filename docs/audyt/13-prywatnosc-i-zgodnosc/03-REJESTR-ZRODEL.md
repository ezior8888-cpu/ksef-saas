# 03 — Rejestr źródeł i katalog wymagań

| | |
|---|---|
| Etap | Research w źródłach pierwotnych (pkt 4 zadania) |
| Autor | agent ŹRÓDŁA (subagent koordynatora) |
| Data | 10.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza zawiera to scalenie; poza materiałami audytu brak zmian względem `3e5e00d`, sprawdzone `git merge-base --is-ancestor` i `git diff --stat 3e5e00d HEAD`) |
| Zakres | Rejestr źródeł prawa UE i PL, stanowisk EROD/EDPB, WP29 i UODO, orzecznictwa, kryteriów AICPA SOC 2 oraz katalog wymagań (WYM) dla macierzy luk. Bez oceny stanu wymagań (to robią `05-MACIERZ-WYMAGAN.md` i pliki A1–A4). |
| Źródła danych | Wiedza modelu (stan do 06.2026) — dla treści prawa, wytycznych i AICPA; jeden odczyt online (`anthropic.com/legal/commercial-terms`); kod repo na `3e5e00d` — tylko do kolumny „zastosowanie” i „punkt zaczepienia”, z dowodem `ścieżka:linia`; `01-STAN-I-GRANICE.md`; brief koordynatora (ADDENDUM 1–2, fakty z niescalonego PR #225). |
| Ograniczenia | Źródła pierwotne prawa, EDPB, UODO i AICPA **nieodczytane** — egress zablokowany (sekcja 1). Bez WebSearch (decyzja właściciela). Każdy przepis i dokument w tym pliku jest identyfikowany i streszczany z pamięci modelu i wymaga potwierdzenia w końcowym review. Plik nie jest opinią prawną. |
| Recenzja | R2 (osobny agent) — patrz `10-REVIEW.md` |

## 1. Ograniczenia weryfikacji

### 1.1. Próba dostępu do źródeł pierwotnych (10.10.2026, 10:38 UTC)

Jedna próba na adres, bez ponowień, polecenie:
`curl -sS -o /dev/null -w %{http_code} --max-time 15 <URL>`.

| URL | Wynik | Znaczenie |
|---|---|---|
| `https://eur-lex.europa.eu/eli/reg/2016/679/oj` | `curl: (56) CONNECT tunnel failed, response 403`, kod `000` | proxy organizacji odmawia tunelu — polityka egress |
| `https://www.edpb.europa.eu` | jw. (403 na CONNECT, `000`) | jw. |
| `https://uodo.gov.pl` | jw. (403 na CONNECT, `000`) | jw. |
| `https://isap.sejm.gov.pl` | jw. (403 na CONNECT, `000`) | jw. |
| `https://api.sejm.gov.pl/eli/acts/DU/2024/1221` | jw. (403 na CONNECT, `000`) | jw. |
| `https://www.uke.gov.pl` | jw. (403 na CONNECT, `000`) | jw. |
| `https://www.aicpa-cima.com` | jw. (403 na CONNECT, `000`) | jw. |
| `https://www.anthropic.com/legal/commercial-terms` | `200` — pobrano i przeczytano tekst | jedyne źródło odczytane online (ZR-80) |

Kod `000` znaczy, że połączenie z serwerem docelowym w ogóle nie powstało;
odmowa padła na proxy (403 na `CONNECT`). Zgodnie z briefem nie
ponawiano prób, nie szukano kopii lustrzanych i nie używano WebSearch.

### 1.2. Jak czytać kolumnę „Weryfikacja”

| Oznaczenie | Pełne znaczenie |
|---|---|
| **NZ** | „niezweryfikowane online 2026-10-10 — egress zablokowany; identyfikacja i treść wg wiedzy modelu (stan do 06.2026), do potwierdzenia w końcowym review” |
| **NZ + „do potwierdzenia: …”** | jak NZ, a dodatkowo model nie jest pewny wskazanego elementu (numeru, daty, wersji, statusu) — nie wolno go przenosić do dokumentów klienta bez sprawdzenia |
| **ODCZYT** | „odczyt online 2026-10-10 (URL)” — tekst faktycznie pobrany i przeczytany w tej sesji |

Konsekwencje:

- Nazwy, numery i daty aktów podaję tylko wtedy, gdy model zna je
  z dużą pewnością; inaczej piszę „do potwierdzenia”, zamiast zgadywać.
- Streszczenia przepisów są parafrazami, nie cytatami. Do klauzul,
  polityki i umów trzeba wziąć brzmienie z Dziennika Urzędowego UE /
  Dziennika Ustaw.
- Wersje wytycznych EDPB podaję wg stanu znanego modelowi. Nowsze wersje
  lub nowe wytyczne z okresu 06–10.2026 mogły się ukazać i nie są tu
  uwzględnione.
- Dokumenty przyjęte do konsultacji publicznych oznaczam jako
  **dokument konsultacyjny** — nie są wersją ostateczną i nie tworzą
  samodzielnych wymagań w katalogu (sekcja 4).

## 2. Rejestr źródeł (ZR-NN)

Typy: akt UE / ustawa PL / rozporządzenie PL / wytyczne przyjęte EDPB /
dokument WP29 przyjęty przez EDPB / dokument konsultacyjny / raport EDPB /
orzeczenie TSUE lub Sądu UE / stanowisko organu PL / kryteria AICPA /
dokumentacja dostawcy / materiał pomocniczy.
Moc: **wiążący** / **interpretacja** (organ, EDPB; nie wiąże formalnie,
ale wyznacza sposób stosowania prawa) / **kryterium dobrowolne** /
**pomocniczy** / **brak** (projekt).

Skróty adresata w kolumnie „Zastosowanie”: **FF-A** — FaktFlow jako
administrator, **FF-P** — FaktFlow jako podmiot przetwarzający (procesor)
na rzecz klienta, **K** — klient (podatnik, administrator danych
w swoich dokumentach).

### 2.1. Prawo Unii Europejskiej

| ID | Tytuł | Wydawca | Oficjalny URL kanoniczny | Typ | Moc | Przepisy istotne | Weryfikacja | Zastosowanie do FaktFlow |
|---|---|---|---|---|---|---|---|---|
| ZR-01 | Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679 z 27 kwietnia 2016 r. w sprawie ochrony osób fizycznych w związku z przetwarzaniem danych osobowych i w sprawie swobodnego przepływu takich danych oraz uchylenia dyrektywy 95/46/WE (RODO) | PE i Rada UE; Dz.Urz. UE L 119 z 4.5.2016, s. 1 | https://eur-lex.europa.eu/eli/reg/2016/679/oj | akt UE (rozporządzenie) | wiążący, stosowany bezpośrednio od 25.05.2018 | szczegółowo w 2.1a | NZ (curl 403); do potwierdzenia: brzmienie polskiej wersji ze sprostowaniami | Główna podstawa. FF-A dla kont, billingu, marketingu, telemetrii i supportu; FF-P dla danych osób w dokumentach klientów (kontrahenci, wydatki, KPiR, KSeF). |
| ZR-02 | Dyrektywa 2002/58/WE Parlamentu Europejskiego i Rady z 12 lipca 2002 r. dotycząca przetwarzania danych osobowych i ochrony prywatności w sektorze łączności elektronicznej (dyrektywa o prywatności i łączności elektronicznej), zmieniona m.in. dyrektywą 2009/136/WE | PE i Rada UE | https://eur-lex.europa.eu/eli/dir/2002/58/oj | akt UE (dyrektywa) | wiążący dla państw członkowskich; wobec FF działa przez prawo krajowe (ZR-11, ZR-12), sama dyrektywa służy wykładni | art. 5 ust. 3 (zapis i odczyt informacji w urządzeniu końcowym: zgoda po jasnej i pełnej informacji; wyjątek dla zapisu/dostępu wyłącznie w celu transmisji albo ściśle niezbędnego do usługi wyraźnie żądanej przez użytkownika); art. 13 ust. 1 (poczta elektroniczna w celach marketingu bezpośredniego — uprzednia zgoda), art. 13 ust. 2 (tzw. soft opt-in: dane kontaktowe uzyskane przy sprzedaży, własne podobne produkty, możliwość sprzeciwu przy zbieraniu i w każdej wiadomości) | NZ | Cookies, `localStorage` i skrypty w przeglądarce (sesja Supabase, PostHog, zapis zgody, motyw, ewentualnie Sentry i Turnstile); newsletter i e-maile promocyjne FF-A. |
| ZR-03 | Decyzja wykonawcza Komisji (UE) 2023/1795 z 10 lipca 2023 r. stwierdzająca odpowiedni stopień ochrony danych osobowych zapewniany przez ramy ochrony danych UE–USA (EU-US Data Privacy Framework) | Komisja Europejska | https://eur-lex.europa.eu/eli/dec_impl/2023/1795/oj | akt UE (decyzja wykonawcza, art. 45 ust. 3 RODO) | wiążący | art. 1 (odpowiedni stopień ochrony dla organizacji wpisanych na listę DPF); załączniki (zasady DPF) | NZ | Podstawa transferów do odbiorców z USA, **o ile** dany odbiorca ma aktywną certyfikację DPF (dla Anthropic, Stripe, Resend, Google, spółek-matek Sentry/PostHog — niesprawdzone; zakres `04-PROCESORZY`). |
| ZR-04 | Decyzja wykonawcza Komisji (UE) 2021/914 z 4 czerwca 2021 r. w sprawie standardowych klauzul umownych dotyczących przekazywania danych osobowych do państw trzecich | Komisja Europejska | https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj | akt UE (decyzja wykonawcza, art. 46 ust. 2 lit. c RODO) | wiążący jako zatwierdzony wzór; użycie dobrowolne, treści klauzul nie wolno zmieniać | moduły: 1 (administrator→administrator), 2 (administrator→procesor), 3 (procesor→procesor), 4 (procesor→administrator); klauzula o ocenie prawa i praktyk państwa trzeciego (numer klauzuli do potwierdzenia) | NZ | FF-A → dostawca w USA: moduł 2; FF-P → dalszy procesor w USA: moduł 3. Polityka deklaruje SCC z dostawcami z USA (`app/(marketing)/legal/polityka-prywatnosci/page.tsx:91,102,106,111`) — umów nie ma w repo. |
| ZR-05 | Decyzja wykonawcza Komisji (UE) 2021/915 z 4 czerwca 2021 r. w sprawie standardowych klauzul umownych między administratorami a podmiotami przetwarzającymi na podstawie art. 28 ust. 7 RODO | Komisja Europejska | https://eur-lex.europa.eu/eli/dec_impl/2021/915/oj | akt UE (decyzja wykonawcza) | wiążący jako wzór; użycie dobrowolne (jeden ze sposobów spełnienia art. 28 ust. 3–4) | klauzule wewnątrz EOG, z załącznikami (opis przetwarzania, środki, lista dalszych procesorów) | NZ | Możliwa baza umowy powierzenia FF-P z klientem; dziś strona RODO oferuje DPA „na żądanie e-mailem” (`app/(marketing)/legal/rodo/page.tsx:54-58`). |
| ZR-06 | Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2024/1689 z 13 czerwca 2024 r. w sprawie sztucznej inteligencji (AI Act) | PE i Rada UE | https://eur-lex.europa.eu/eli/reg/2024/1689/oj | akt UE (rozporządzenie) | wiążący, stosowany etapami | art. 4 (kompetencje w zakresie AI, od 2.02.2025); art. 50 ust. 1 (informowanie osób, że wchodzą w interakcję z systemem AI, od 2.08.2026) | NZ; do potwierdzenia: czy pakiet „Digital Omnibus” (projekt KE z 11.2025) zmienił terminy lub zakres art. 50 | Poza minimum zadania — sygnał. Czat wsparcia oparty o LLM (`lib/support/chat.ts`), OCR (`lib/ocr/engine.ts:149`), kategoryzacja (`lib/categorization/ai-classifier.ts`). Kwalifikacja FF jako „dostawcy” albo „podmiotu stosującego” — do review. |
| ZR-07 | Wniosek: rozporządzenie w sprawie poszanowania życia prywatnego i ochrony danych osobowych w łączności elektronicznej (rozporządzenie ePrivacy), COM(2017) 10 | Komisja Europejska | https://eur-lex.europa.eu (numer procedury do potwierdzenia) | projekt (dokument legislacyjny) | **brak** — nie obowiązuje | — | NZ; do potwierdzenia: wycofanie przez KE (wg wiedzy modelu zapowiedziane w programie prac na 2025 r.) | Nie stosować jako źródła wymagań. Wpisany, żeby jawnie odróżnić projekt od obowiązującej dyrektywy ZR-02. |

### 2.1a. RODO (ZR-01) — przepisy istotne dla FaktFlow

Streszczenia wg wiedzy modelu — **NZ** dla całej tabeli. Kolumna „WYM”
wskazuje wymagania z sekcji 3.

| Przepis | Treść (parafraza) | Zastosowanie / ocena „nie dotyczy” | WYM |
|---|---|---|---|
| art. 4 pkt 1, 2, 5, 7–12 | Definicje: dane osobowe (także identyfikator internetowy), przetwarzanie, pseudonimizacja, administrator, podmiot przetwarzający, odbiorca, strona trzecia, zgoda, naruszenie ochrony danych | Kwalifikacja ról per operacja; dane przedsiębiorców będących osobami fizycznymi (JDG: imię i nazwisko, NIP, adres na fakturze) są danymi osobowymi; dane osób prawnych nie są (motyw 14), ale dane ich reprezentantów i osób kontaktowych są | WYM-01, WYM-02 |
| art. 5 ust. 1 lit. a–f, ust. 2 | Zasady: zgodność z prawem, rzetelność, przejrzystość; ograniczenie celu; minimalizacja; prawidłowość; ograniczenie przechowywania; integralność i poufność; rozliczalność | Każda zasada osobno w katalogu | WYM-04 – WYM-10 |
| art. 6 ust. 1 lit. a, b, c, f; ust. 4 | Podstawy przetwarzania; ocena zgodności celów przy dalszym przetwarzaniu | Mapa cel → podstawa dla FF-A; zgoda nie jest domyślną podstawą | WYM-11, WYM-12, WYM-05 |
| art. 7 ust. 1–4 | Warunki zgody: wykazanie, wyodrębnienie w oświadczeniu, wycofanie w każdej chwili i tak łatwo jak udzielenie, dobrowolność (brak uzależniania usługi) | Analityka przeglądarkowa, newsletter | WYM-13 – WYM-15 |
| art. 8 | Zgoda dziecka w usługach społeczeństwa informacyjnego oferowanych bezpośrednio dziecku | **Nie dotyczy**: usługa B2B dla przedsiębiorców; regulamin wymaga pełnoletności (`app/(marketing)/legal/regulamin/page.tsx:56`); newsletter bloga nie jest kierowany do dzieci | WYM-16 |
| art. 9 | Szczególne kategorie danych | **Nie dotyczy jako cel** FF. Ryzyko przypadkowe: opis pozycji faktury, wydatku, OCR paragonu albo wiadomość w czacie wsparcia może ujawniać dane o zdrowiu (np. faktura za usługę medyczną dla osoby fizycznej). FF-P nie ustala podstawy z art. 9 — robi to klient; FF uwzględnia ryzyko w art. 32 i w screeningu DPIA | WYM-16 |
| art. 10 | Dane dotyczące wyroków skazujących i czynów zabronionych | **Nie dotyczy**: nie znaleziono w repo funkcji ani pól przeznaczonych na takie dane (przegląd niewyczerpujący — lista tabel z briefu) | WYM-16 |
| art. 11 | Przetwarzanie niewymagające identyfikacji | Żądania dotyczące danych tylko pseudonimowych (np. identyfikator analityczny) — FF nie musi pozyskiwać dodatkowych danych tylko w celu realizacji praw | WYM-17 |
| art. 12 ust. 1–6 | Przejrzysta informacja i komunikacja; ułatwianie praw; termin 1 miesiąc, przedłużenie o 2 miesiące z informacją w ciągu 1 miesiąca; odmowa z pouczeniem w 1 miesiąc; bezpłatność, wyjątek dla żądań ewidentnie nieuzasadnionych lub nadmiernych; dodatkowe informacje przy uzasadnionych wątpliwościach co do tożsamości | Wszystkie kanały żądań (e-mail z polityki `polityka-prywatnosci/page.tsx:202`, funkcje w aplikacji), w tym osoby bez konta | WYM-17 (forma, identyfikacja), WYM-75 (terminy) |
| art. 13 ust. 1–2 | Informacja przy zbieraniu danych od osoby | Rejestracja, logowanie Google, newsletter, formularze kontaktowe, czat wsparcia | WYM-18, WYM-19 |
| art. 14 ust. 1–3, 5 | Informacja, gdy danych nie pozyskano od osoby; terminy; wyjątki | FF-A: osoby zapraszane do organizacji, osoby kontaktowe klientów; FF-P: obowiązek klienta (kontrahenci, faktury z KSeF) | WYM-20 |
| art. 15 ust. 1–4 | Prawo dostępu i kopii; kopia nie może niekorzystnie wpływać na prawa innych | Eksport (`app/api/gdpr/export/route.ts`), żądania osób bez konta | WYM-21, WYM-22 |
| art. 16 | Sprostowanie | Dane konta; dane w fakturach — tylko w trybie przepisów VAT (korekta), interpretacja | WYM-23 |
| art. 17 ust. 1, 3 lit. b i e | Usunięcie; wyjątki: obowiązek prawny, roszczenia | Usuwanie konta z okresem wycofania (`lib/gdpr/deletion.ts:6,107`); retencja faktur | WYM-24, WYM-73 |
| art. 18 | Ograniczenie przetwarzania | Mechanizm „wstrzymania” danych osoby — do ustalenia w A2 | WYM-25 |
| art. 19 | Powiadamianie odbiorców o sprostowaniu, usunięciu, ograniczeniu | PostHog, Resend, Stripe, Sentry | WYM-26 |
| art. 20 | Przenoszenie danych | Dane konta i dane dostarczone przez użytkownika; format do odczytu maszynowego | WYM-27 |
| art. 21 ust. 1–4 | Sprzeciw (uzasadniony interes; marketing bezpośredni — bezwzględny); informacja najpóźniej przy pierwszej komunikacji, wyraźnie i oddzielnie | Analityka serwerowa deklarowana na uzasadnionym interesie (`polityka-prywatnosci/page.tsx:243-246`); newsletter | WYM-28 |
| art. 22 | Decyzje wyłącznie zautomatyzowane o skutkach prawnych lub podobnie istotnych | Wstępnie **prawdopodobnie nie dotyczy** — niezweryfikowane w repo w tej sesji (automatyczne blokady konta, mechanizmy antyfraudowe, decyzje AI do sprawdzenia w A2) | WYM-29 |
| art. 24 ust. 1–2 | Odpowiedzialność administratora; polityki ochrony danych | Program zgodności FF-A | WYM-30 |
| art. 25 ust. 1 | Uwzględnianie ochrony danych w fazie projektowania — przy określaniu sposobów przetwarzania i w czasie przetwarzania | Proces wytwarzania funkcji (PR, przeglądy) | WYM-31 |
| art. 25 ust. 2 | Domyślna ochrona danych: tylko dane niezbędne dla każdego celu — ilość, zakres przetwarzania, okres przechowywania, dostępność; w szczególności domyślnie dane nie są udostępniane bez interwencji osoby nieokreślonej liczbie osób fizycznych | Ustawienia domyślne, linki z tokenem, pliki, telemetria | WYM-32 – WYM-34 |
| art. 26 | Współadministratorzy | Wstępnie **nie dotyczy** (do potwierdzenia dla relacji klient–biuro rachunkowe i dostawców analityki) | WYM-39 |
| art. 27 | Przedstawiciel administratora spoza UE | **Nie dotyczy**, o ile operator ma siedzibę w UE (podmiot prawny operatora to niewiadoma — polityka ma placeholder, `polityka-prywatnosci/page.tsx:20-21`) | — |
| art. 28 ust. 1–4, 9, 10 | Wymogi wobec procesora i umowy powierzenia; dalsi procesorzy; forma pisemna (także elektroniczna); procesor ustalający cele staje się administratorem | FF-P wobec klientów; FF-A wobec własnych procesorów | WYM-40 – WYM-46 |
| art. 29 | Przetwarzanie wyłącznie na polecenie administratora | Personel, wykonawcy, automaty z dostępem do danych | WYM-47 |
| art. 30 ust. 1–5 | Rejestr czynności (administrator) i rejestr kategorii czynności (procesor); wyjątek dla podmiotów < 250 osób, który nie ma zastosowania, gdy przetwarzanie może powodować ryzyko, nie ma charakteru sporadycznego albo obejmuje dane z art. 9–10 | Oba rejestry; wyjątek ust. 5 wg interpretacji nie ma zastosowania (przetwarzanie ciągłe) | WYM-48, WYM-49 |
| art. 32 ust. 1–4 | Bezpieczeństwo: pseudonimizacja i szyfrowanie; poufność, integralność, dostępność, odporność; przywracanie; regularne testowanie; ocena ryzyka; osoby działające z upoważnienia | Infrastruktura, kopie, RLS, dostęp administracyjny | WYM-50, WYM-51 |
| art. 33 ust. 1–5 | Zgłoszenie naruszenia organowi (72 h); procesor zawiadamia administratora bez zbędnej zwłoki; treść; dokumentowanie wszystkich naruszeń | Procedura incydentu FF-A i FF-P | WYM-52, WYM-53 |
| art. 34 ust. 1–4 | Zawiadomienie osób przy wysokim ryzyku; wyjątki | jw. | WYM-54 |
| art. 35 ust. 1, 3, 4, 7, 9, 11 | Ocena skutków (DPIA): kiedy, wykazy organu, minimalna treść, przegląd | Screening DPIA dla FF-A; materiały dla DPIA klientów (FF-P) | WYM-55 |
| art. 36 | Uprzednie konsultacje | Tylko gdy DPIA wskaże wysokie ryzyko szczątkowe | WYM-56 |
| art. 37–39 | Wyznaczenie IOD (także przez procesora), status, zadania | Udokumentowana ocena obowiązku | WYM-57 |
| art. 44 | Ogólna zasada transferów | Mapa transferów, w tym zdalny dostęp i dalsi procesorzy | WYM-58 |
| art. 45 | Decyzja stwierdzająca odpowiedni stopień ochrony | DPF (ZR-03) | WYM-59 |
| art. 46 | Odpowiednie zabezpieczenia (SCC) | ZR-04, ZR-38 | WYM-60 |
| art. 47 | Wiążące reguły korporacyjne | **Nie dotyczy** FF (nie jest grupą stosującą BCR); informacyjnie — mogą je stosować dostawcy | — |
| art. 48 | Żądania organów państw trzecich nieuznawane bez umowy międzynarodowej | Pośrednio — element oceny transferu (TIA) | WYM-60 |
| art. 49 | Wyjątki w szczególnych sytuacjach | Nie jako podstawa stałych transferów | WYM-61 |
| art. 82 ust. 2, art. 83 | Odpowiedzialność (procesor — za obowiązki procesora i działanie poza poleceniami); administracyjne kary pieniężne | Kontekst ryzyka w macierzy | — |
| motyw 14 | RODO nie dotyczy danych osób prawnych | Rozdzielenie danych firm od danych JDG i osób kontaktowych | WYM-02 |
| motyw 26 | Dane zanonimizowane poza RODO; dane spseudonimizowane nadal osobowe; kryterium rozsądnie prawdopodobnych sposobów identyfikacji | Ocena „anonimizacji” dzienników audytu (`polityka-prywatnosci/page.tsx:221-224`) i telemetrii | WYM-38 |
| motyw 30 | Identyfikatory internetowe (cookies, IP) mogą prowadzić do identyfikacji | Telemetria, logi, analityka | WYM-36, WYM-63 |
| motyw 32 | Zgoda — milczenie, pola zaznaczone domyślnie i brak działania nie są zgodą | Baner, formularze | WYM-15 |
| motyw 39 | Przejrzystość; okres przechowywania ograniczony do ścisłego minimum; terminy usunięcia lub okresowego przeglądu | Harmonogram retencji | WYM-08, WYM-71 |
| motywy 42–43 | Wykazanie zgody, jasna treść; zgoda nie jest dobrowolna przy nierównowadze lub uzależnieniu usługi | jw. | WYM-13, WYM-15 |
| motyw 47 | Uzasadniony interes; rozsądne oczekiwania osoby; zapobieganie oszustwom; marketing bezpośredni może być uzasadnionym interesem | Test uzasadnionego interesu | WYM-12 |
| motyw 49 | Bezpieczeństwo sieci i informacji jako uzasadniony interes (w zakresie ściśle niezbędnym i proporcjonalnym) | Logi bezpieczeństwa, limity zapytań, ochrona przed botami | WYM-11, WYM-36 |
| motyw 78 | Privacy by design/default: m.in. minimalizacja, jak najszybsza pseudonimizacja, przejrzystość, monitorowanie przez osobę; zachęta dla producentów | Proces wytwarzania; FF-P projektuje tak, by klienci mogli spełnić art. 25 | WYM-31, WYM-32 |
| motyw 81 | Administrator korzysta tylko z procesorów dających wystarczające gwarancje | Ocena dostawców | WYM-40 |
| motyw 83 | Środki bezpieczeństwa adekwatne do ryzyka | Ocena ryzyka | WYM-50 |

### 2.2. Prawo polskie

| ID | Tytuł | Wydawca | Oficjalny URL kanoniczny | Typ | Moc | Przepisy istotne | Weryfikacja | Zastosowanie do FaktFlow |
|---|---|---|---|---|---|---|---|---|
| ZR-10 | Ustawa z dnia 10 maja 2018 r. o ochronie danych osobowych | Sejm RP; Dz.U. 2018 poz. 1000 | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180001000 | ustawa PL | wiążący | przepis ustanawiający Prezesa UODO organem nadzorczym; obowiązek zawiadomienia Prezesa UODO o wyznaczeniu IOD w terminie 14 dni; przepis karny o przetwarzaniu niedopuszczalnym (wg wiedzy modelu art. 107) | NZ; do potwierdzenia: numery artykułów (organ, zawiadomienie o IOD) i aktualny tekst jednolity | Organ właściwy dla FF; procedura przy ewentualnym wyznaczeniu IOD (WYM-57). |
| ZR-11 | Ustawa z dnia 12 lipca 2024 r. — Prawo komunikacji elektronicznej (PKE) | Sejm RP; **Dz.U. 2024 poz. 1221 — do potwierdzenia** | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20240001221; ELI API: https://api.sejm.gov.pl/eli/acts/DU/2024/1221 (403) | ustawa PL | wiążący | **art. 399** — zapis informacji i dostęp do informacji w telekomunikacyjnym urządzeniu końcowym (wdrożenie art. 5 ust. 3 ZR-02; następca art. 173 Prawa telekomunikacyjnego); **art. 400** — wymogi dotyczące zgody abonenta/użytkownika końcowego (wg wiedzy modelu: odesłanie do zgody w rozumieniu RODO, możliwość wycofania; treść do potwierdzenia; następca art. 174 Pt); art. 398 — marketing bezpośredni z użyciem urządzeń końcowych i automatycznych systemów wywołujących (numer i zakres do potwierdzenia) | NZ; do potwierdzenia: oznaczenie Dz.U., data wejścia w życie (wg wiedzy modelu zasadniczo 10.11.2024), brzmienie art. 398–400, czy zachowano zgodę wyrażaną ustawieniami przeglądarki, organ właściwy (Prezes UKE; relacja do Prezesa UODO) | Cookies i `localStorage` na stronach publicznych i w aplikacji; zgoda na analitykę; marketing e-mail (jeśli zakaz przeniesiono do PKE). |
| ZR-12 | Ustawa z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną (UŚUDE) | Sejm RP; Dz.U. 2002 nr 144 poz. 1204 (tekst jednolity do potwierdzenia) | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20021441204 | ustawa PL | wiążący w zakresie przepisów obowiązujących | art. 8 (obowiązek regulaminu usługi, udostępnianego nieodpłatnie przed zawarciem umowy); art. 10 (zakaz przesyłania niezamówionej informacji handlowej drogą elektroniczną) — **status po wejściu PKE niepewny** | NZ; do potwierdzenia: czy art. 10 został uchylony/zmieniony przez PKE i jaki organ egzekwuje zakaz | Regulamin (`app/(marketing)/legal/regulamin/page.tsx`), newsletter, e-maile promocyjne do użytkowników. |
| ZR-13 | Ustawa z dnia 11 marca 2004 r. o podatku od towarów i usług (ustawa o VAT) | Sejm RP; Dz.U. 2004 nr 54 poz. 535 (tekst jednolity do potwierdzenia) | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20040540535 | ustawa PL | wiążący | art. 112 (przechowywanie ewidencji i dokumentów związanych z rozliczeniem podatku do upływu terminu przedawnienia zobowiązania); art. 112a (sposób i miejsce przechowywania faktur, w tym elektronicznie poza krajem — ustępy i warunki do potwierdzenia); przepisy o KSeF (wystawianie i otrzymywanie faktur ustrukturyzowanych; przechowywanie faktur w KSeF przez **10 lat od końca roku wystawienia** — okres wg wiedzy modelu, **artykuł do potwierdzenia**); terminy obowiązkowego KSeF w 2026–2027 (do potwierdzenia) | NZ; do potwierdzenia: numery ustępów art. 112a, artykuł o okresie przechowywania w KSeF | Obowiązek przechowywania ciąży na **podatniku** (K); FF-P przechowuje na polecenie klienta (interpretacja do review). FF-A jako podatnik — dla własnej sprzedaży subskrypcji. FF przechowuje kopie w Niemczech (Hetzner NBG1 wg `AGENTS.md`) — znaczenie dla art. 112a do review. |
| ZR-14 | Ustawa z dnia 29 sierpnia 1997 r. — Ordynacja podatkowa | Sejm RP; Dz.U. 1997 nr 137 poz. 926 (tekst jednolity do potwierdzenia) | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19971370926 | ustawa PL | wiążący | art. 70 § 1 (zobowiązanie podatkowe przedawnia się z upływem 5 lat od końca roku kalendarzowego, w którym upłynął termin płatności podatku); dalsze paragrafy art. 70 i art. 70a (zawieszenie, przerwanie biegu — zakres do potwierdzenia); art. 86 § 1 (podatnicy prowadzący księgi podatkowe przechowują księgi i dokumenty z nimi związane do upływu okresu przedawnienia, chyba że ustawy podatkowe stanowią inaczej) | NZ; do potwierdzenia: zakres przesłanek zawieszenia i przerwania | Wyznacza okres obowiązku **klienta** (K) i FF-A jako podatnika. Polityka podaje „Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)” (`polityka-prywatnosci/page.tsx:230`) — przepis wg wiedzy modelu daje 5 lat, nie 10 (WYM-68). |
| ZR-15 | Ustawa z dnia 29 września 1994 r. o rachunkowości | Sejm RP; Dz.U. 1994 nr 121 poz. 591 (tekst jednolity do potwierdzenia) | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19941210591 | ustawa PL | wiążący | art. 74 ust. 1 (zatwierdzone sprawozdania finansowe — przechowywanie trwałe); art. 74 ust. 2 (pozostałe zbiory — okresy minimalne, m.in. 5 lat dla ksiąg rachunkowych; pozostałe punkty do potwierdzenia); przepis o liczeniu okresów od początku roku następującego po roku obrotowym (ustęp do potwierdzenia) | NZ; do potwierdzenia: punkty art. 74 ust. 2 i ustęp o biegu okresu | Dotyczy klientów prowadzących księgi rachunkowe (K) i FF-A, jeśli operator je prowadzi. Docelowi mikroprzedsiębiorcy częściej prowadzą KPiR albo ewidencję ryczałtu. |
| ZR-16 | Rozporządzenie Ministra Finansów z dnia 23 grudnia 2019 r. w sprawie prowadzenia podatkowej księgi przychodów i rozchodów | Minister Finansów; **Dz.U. 2019 poz. 2544 — do potwierdzenia** | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20190002544 | rozporządzenie PL | wiążący | zasady prowadzenia KPiR (paragrafy o przechowywaniu — do potwierdzenia); okres przechowywania wynika z art. 86 § 1 OP (ZR-14) | NZ; do potwierdzenia: oznaczenie Dz.U. i aktualność (możliwe zmiany związane z księgami w formie elektronicznej / JPK) | Moduł KPiR (tabele `kpir_*` wg briefu) — FF-P prowadzi dane na polecenie klienta; obowiązek przechowywania ciąży na K. |
| ZR-17 | Ustawa z dnia 23 kwietnia 1964 r. — Kodeks cywilny | Sejm PRL; Dz.U. 1964 nr 16 poz. 93 (tekst jednolity do potwierdzenia) | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19640160093 | ustawa PL | wiążący | art. 117 (przedawnienie roszczeń majątkowych); art. 118 (6 lat ogólnie; 3 lata dla świadczeń okresowych i związanych z prowadzeniem działalności gospodarczej; koniec terminu przypada na ostatni dzień roku kalendarzowego, chyba że termin jest krótszy niż 2 lata) | NZ | FF-A: okres przechowywania danych umowy i rozliczeń w celu obrony roszczeń (art. 6 ust. 1 lit. f i art. 17 ust. 3 lit. e RODO) — nie dotyczy danych w dokumentach klientów. |

### 2.3. Stanowiska organów polskich

| ID | Tytuł | Wydawca | Oficjalny URL kanoniczny | Typ | Moc | Przepisy istotne | Weryfikacja | Zastosowanie do FaktFlow |
|---|---|---|---|---|---|---|---|---|
| ZR-20 | Komunikat Prezesa Urzędu Ochrony Danych Osobowych z dnia 17 czerwca 2019 r. w sprawie wykazu rodzajów operacji przetwarzania danych osobowych wymagających oceny skutków przetwarzania dla ich ochrony | Prezes UODO; **M.P. 2019 poz. 666 — do potwierdzenia** | https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WMP20190000666 (oraz uodo.gov.pl — 403) | stanowisko organu PL wydane w wykonaniu art. 35 ust. 4 RODO | wiążący w tym sensie, że operacje z wykazu wymagają DPIA (art. 35 ust. 4); kwalifikacja konkretnej operacji — interpretacja | wykaz kryteriów i przykładów operacji (treść punktów do potwierdzenia) | NZ; do potwierdzenia: oznaczenie M.P. i brzmienie punktów | Screening DPIA (WYM-55): czy operacje FF (dane finansowe, łączenie zbiorów, LLM) mieszczą się w wykazie. |
| ZR-21 | Decyzje Prezesa UODO w indywidualnych sprawach, których istnienie model zna z dużą pewnością: (a) 2019 — ClickQuickNow — utrudnianie wycofania zgody/wypisu (art. 7 ust. 3, art. 12 ust. 2); (b) 2019 — Morele.net — niewystarczające środki bezpieczeństwa (art. 32); (c) 2020 — Virgin Mobile Polska — brak regularnego testowania i oceny skuteczności środków (art. 32 ust. 1 lit. d) | Prezes UODO | https://uodo.gov.pl (403; sygnatury nieznane) | stanowisko organu PL (decyzje) | interpretacja (wiążą strony postępowań; dla FF wskazówka, jak organ stosuje przepisy) | jw. | NZ; do potwierdzenia: sygnatury, daty dzienne, kwoty, prawomocność | Wypis z newslettera i wycofanie zgody (WYM-14, WYM-66); testy odtwarzania i bezpieczeństwa (WYM-51). |

UODO publikuje też poradniki i formularz elektronicznego zgłaszania
naruszeń; ich tytułów i wersji model nie jest pewny, więc nie
rejestruję ich jako osobnych źródeł (do uzupełnienia w review).

### 2.4. EROD/EDPB i Grupa Robocza Art. 29

| ID | Tytuł | Wydawca | Oficjalny URL kanoniczny | Typ | Moc | Przepisy / punkty istotne | Weryfikacja | Zastosowanie do FaktFlow |
|---|---|---|---|---|---|---|---|---|
| ZR-30 | Guidelines 4/2019 on Article 25 Data Protection by Design and by Default, **v2.0, przyjęte 20.10.2020** | EDPB | https://www.edpb.europa.eu (strona dokumentu — URL do potwierdzenia) | wytyczne przyjęte EDPB | interpretacja | elementy skuteczności (środki, zabezpieczenia, KPI); kluczowe elementy projektowe dla każdej zasady art. 5; ustawienia domyślne (ilość, zakres, okres, dostępność) | NZ | Lista kontrolna DPbDD dla nowych funkcji (WYM-31 – WYM-34). |
| ZR-31 | Guidelines 05/2020 on consent under Regulation 2016/679, **v1.1, przyjęte 4.05.2020** | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | dobrowolność, konkretność, świadomość, jednoznaczność; „cookie walls” i przewijanie nie są zgodą; dowód i wycofanie | NZ | Baner zgody, newsletter (WYM-13 – WYM-15, WYM-65). |
| ZR-32 | Guidelines 07/2020 on the concepts of controller and processor in the GDPR, **v2.0, przyjęte 7.07.2021** | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | kryteria kwalifikacji ról; treść umowy art. 28; dalsi procesorzy; współadministrowanie | NZ | Role per operacja (WYM-01), umowa powierzenia (WYM-41 – WYM-46), art. 26 (WYM-39). |
| ZR-33 | Guidelines 01/2022 on data subject rights — Right of access, **v2.0, przyjęte 28.03.2023** | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | zakres dostępu i kopii, identyfikacja proporcjonalna, terminy, prawa innych osób, formaty | NZ | Eksport danych i żądania osób bez konta (WYM-17, WYM-21, WYM-22). |
| ZR-34 | Guidelines 2/2023 on Technical Scope of Art. 5(3) of ePrivacy Directive | EDPB | jw. | wytyczne przyjęte EDPB (wersja ostateczna) — wcześniej dokument konsultacyjny | interpretacja | szeroki zakres „informacji” i „dostępu”: cookies, `localStorage`, piksele i śledzenie przez URL, identyfikatory generowane lokalnie, IoT | NZ; do potwierdzenia: wersja ostateczna (wg wiedzy modelu v2.0 z 7.10.2024; wersja do konsultacji z 11.2023) | Klasyfikacja `localStorage`, skryptów PostHog/Sentry/Turnstile (WYM-63). |
| ZR-35 | Guidelines 03/2022 on deceptive design patterns in social media platform interfaces: how to recognise and avoid them, **v2.0, przyjęte 14.02.2023** | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja; **zakres: platformy społecznościowe — dla FF tylko przez analogię** | kategorie wzorców zwodniczych (np. przeładowanie, pomijanie, utrudnianie, niespójność) w rejestracji, zgodach, ustawieniach, prawach osób, usuwaniu konta | NZ | Interfejs zgody, wypisu i usuwania konta (WYM-65). |
| ZR-36 | Guidelines 9/2022 on personal data breach notification under GDPR, **v2.0, przyjęte 28.03.2023** (aktualizacja WP250) | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | „stwierdzenie” naruszenia, 72 h, zgłoszenia etapami, rola procesora, dokumentowanie | NZ | Procedura incydentu (WYM-52 – WYM-54). |
| ZR-37 | Guidelines 01/2021 on Examples regarding Personal Data Breach Notification, **v2.0, przyjęte 14.12.2021** | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | przykłady: ransomware, wyciek danych, błędna wysyłka, utrata nośnika — z oceną konieczności zgłoszenia | NZ; do potwierdzenia: data przyjęcia v2.0 | Scenariusze ćwiczeń incydentowych (WYM-52). |
| ZR-38 | Recommendations 01/2020 on measures that supplement transfer tools to ensure compliance with the EU level of protection of personal data, **v2.0, przyjęte 18.06.2021** | EDPB | jw. | wytyczne przyjęte EDPB (rekomendacje) | interpretacja | sześć kroków: mapa transferów, narzędzie, ocena prawa i praktyk, środki uzupełniające, kroki proceduralne, ponowna ocena | NZ | Ocena transferów (TIA) dla dostawców spoza EOG przy SCC (WYM-60). |
| ZR-39 | Guidelines 05/2021 on the Interplay between the application of Article 3 and the provisions on international transfers as per Chapter V of the GDPR, **v2.0, przyjęte 14.02.2023** | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | trzy kryteria transferu (eksporter podlegający RODO, ujawnienie/udostępnienie importerowi, importer w państwie trzecim) | NZ | Kwalifikacja zdalnego dostępu i dalszych procesorów (WYM-58). |
| ZR-40 | Report of the work undertaken by the Cookie Banner Taskforce, przyjęty 17.01.2023 | EDPB | jw. | raport EDPB | interpretacja (słabsza niż wytyczne — wspólne minimum organów w sprawach skarg; nie przesądza o ocenie w każdej sprawie) | brak opcji odrzucenia na pierwszej warstwie, pola zaznaczone domyślnie, zwodnicze kolory i kontrast, uzasadniony interes zamiast zgody, błędna klasyfikacja „niezbędnych”, utrudnione wycofanie | NZ; do potwierdzenia: data przyjęcia | Baner zgody (`components/analytics/consent-banner.tsx` — ocena w A4) (WYM-65). |
| ZR-41 | Opinion 22/2024 on certain obligations following from the reliance on processor(s) and sub-processor(s), przyjęta 7.10.2024 (art. 64 ust. 2 RODO) | EDPB | jw. | opinia EDPB (art. 64 ust. 2) | interpretacja | administrator powinien mieć informacje o tożsamości wszystkich procesorów w łańcuchu; weryfikacja gwarancji w całym łańcuchu proporcjonalnie do ryzyka; dokumentacja | NZ; do potwierdzenia: data | FF-A wobec dostawców; FF-P — lista dalszych procesorów dla klientów (WYM-40, WYM-43). |
| ZR-42 | Guidelines 1/2024 on processing of personal data based on Article 6(1)(f) GDPR, **v1.0 przyjęte 8.10.2024 do konsultacji publicznych** | EDPB | jw. | **dokument konsultacyjny** (dopóki nie ma wersji ostatecznej) | kierunek interpretacji, **nie wersja ostateczna** | test trzech kroków: uzasadniony interes, niezbędność, wyważenie (z rozsądnymi oczekiwaniami) | NZ; do potwierdzenia: czy przyjęto wersję ostateczną (model nie wie) | Wsparcie dla WYM-12; samodzielnym źródłem testu jest ZR-63. |
| ZR-43 | Guidelines 01/2025 on Pseudonymisation, **v1.0 przyjęte 16.01.2025 do konsultacji publicznych** | EDPB | jw. | **dokument konsultacyjny** | kierunek interpretacji, **nie wersja ostateczna** | „domena pseudonimizacji”, oddzielenie dodatkowych informacji, pseudonimizacja jako środek, nie anonimizacja | NZ; do potwierdzenia: status wersji ostatecznej | Ocena pseudonimizacji telemetrii i audytu (WYM-38). |
| ZR-44 | Raport z Coordinated Enforcement Framework 2024 — prawo dostępu (art. 15) | EDPB | jw. | raport EDPB | pomocniczy / interpretacja | typowe uchybienia w realizacji prawa dostępu | NZ; do potwierdzenia: data przyjęcia (wg wiedzy modelu 01.2025) | Lista kontrolna dla procedury dostępu (WYM-21, WYM-22). |
| ZR-45 | Coordinated Enforcement Framework 2025 — prawo do usunięcia (art. 17) | EDPB | jw. | działanie CEF; raport — status nieznany | pomocniczy | — | NZ; do potwierdzenia: czy i kiedy przyjęto raport (model nie wie) | Usuwanie, w tym kopie zapasowe (WYM-24, WYM-72). |
| ZR-46 | WP29, Guidelines on Data Protection Impact Assessment (DPIA) and determining whether processing is "likely to result in a high risk", WP248 rev.01 (przyjęte 4.04.2017, zmienione 4.10.2017) | Grupa Robocza Art. 29; zatwierdzone przez EDPB 25.05.2018 (Endorsement 1/2018) | jw. | dokument WP29 przyjęty przez EDPB | interpretacja | dziewięć kryteriów wysokiego ryzyka (ocena/scoring; zautomatyzowane decyzje; systematyczne monitorowanie; dane wrażliwe lub o charakterze wysoce osobistym; duża skala; łączenie zbiorów; osoby szczególnie wrażliwe; innowacyjne technologie; uniemożliwienie korzystania z prawa lub usługi); zwykle ≥ 2 kryteria → DPIA | NZ | Screening DPIA (WYM-55). |
| ZR-47 | WP29, Guidelines on transparency under Regulation 2016/679, WP260 rev.01 (przyjęte 29.11.2017, zmienione 11.04.2018) | WP29; zatwierdzone przez EDPB 25.05.2018 | jw. | dokument WP29 przyjęty przez EDPB | interpretacja | podejście warstwowe, jasny język, informacja o zmianach, art. 14 — terminy i wyjątki | NZ | Polityka prywatności, komunikaty w aplikacji (WYM-17 – WYM-20). |
| ZR-48 | WP29, Guidelines on Data Protection Officers, WP243 rev.01 | WP29; zatwierdzone przez EDPB 25.05.2018 | jw. | dokument WP29 przyjęty przez EDPB | interpretacja | „główna działalność”, „duża skala”, „regularne i systematyczne monitorowanie”; zalecenie dokumentowania analizy | NZ; do potwierdzenia: daty przyjęcia i zmiany | Ocena obowiązku IOD (WYM-57). |
| ZR-49 | WP29, Guidelines on the right to data portability, WP242 rev.01 | WP29; zatwierdzone przez EDPB 25.05.2018 | jw. | dokument WP29 przyjęty przez EDPB | interpretacja | dane „dostarczone” (w tym obserwowane), formaty, prawa osób trzecich | NZ; do potwierdzenia: daty | Eksport (WYM-27). |
| ZR-50 | WP29, Guidelines on Automated individual decision-making and Profiling, WP251 rev.01 | WP29; zatwierdzone przez EDPB 25.05.2018 | jw. | dokument WP29 przyjęty przez EDPB | interpretacja | „wyłącznie zautomatyzowane”, „podobnie istotny wpływ” | NZ; do potwierdzenia: daty | Ocena art. 22 (WYM-29). |
| ZR-51 | Guidelines 2/2019 on the processing of personal data under Article 6(1)(b) GDPR in the context of the provision of online services to data subjects, **v2.0, przyjęte 8.10.2019** | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | „niezbędność do wykonania umowy” rozumiana wąsko; ulepszanie usługi, marketing, analityka co do zasady nie mieszczą się w lit. b | NZ | Mapa podstaw FF-A (WYM-11). |
| ZR-52 | Guidelines 2/2018 on derogations of Article 49 under Regulation 2016/679, przyjęte 25.05.2018 | EDPB | jw. | wytyczne przyjęte EDPB | interpretacja | wyjątki interpretowane ściśle; nie do transferów systematycznych | NZ | WYM-61. |
| ZR-53 | WP29, Opinion 04/2012 on Cookie Consent Exemption (WP194) | WP29 | jw. (archiwum WP29 — URL do potwierdzenia) | dokument WP29 sprzed RODO | interpretacja historyczna, pomocnicza; status wobec EDPB do potwierdzenia (wg wiedzy modelu nie objęty Endorsement 1/2018) | zwolnione m.in. cookies wejścia użytkownika, sesyjne uwierzytelniania, bezpieczeństwa, zapamiętania wyboru zgody; analityka co do zasady niezwolniona | NZ | Uzasadnienie klasyfikacji „niezbędnych” (WYM-63). |
| ZR-54 | WP29, Opinion 05/2014 on Anonymisation Techniques (WP216) | WP29 | jw. | dokument WP29 sprzed RODO | interpretacja pomocnicza | wyodrębnienie, powiązywalność, wnioskowanie; pseudonimizacja ≠ anonimizacja | NZ; do potwierdzenia: czy EDPB wydało nowsze wytyczne o anonimizacji | WYM-38. |
| ZR-55 | WP29, Position Paper on the derogations from the obligation to maintain records of processing activities pursuant to Article 30(5) GDPR (04.2018) | WP29 | jw. | dokument WP29 | interpretacja; status zatwierdzenia przez EDPB do potwierdzenia | wyjątek ust. 5 nie obejmuje przetwarzania niesporadycznego; rejestr może obejmować tylko czynności niesporadyczne | NZ; do potwierdzenia: data i status | WYM-48, WYM-49. |
| ZR-56 | Opinion 28/2024 on certain data protection aspects related to the processing of personal data in the context of AI models, przyjęta 17.12.2024 | EDPB | jw. | opinia EDPB (art. 64 ust. 2) | interpretacja; dla FF zastosowanie ograniczone (FF nie trenuje modeli) | anonimowość modeli, uzasadniony interes przy rozwoju i wdrażaniu modeli | NZ | Tło dla WYM-62; nie tworzy samodzielnego wymagania. |
| ZR-57 | Raport z Coordinated Enforcement Framework 2023 — wyznaczenie i pozycja IOD | EDPB | jw. | raport EDPB | pomocniczy | — | NZ; do potwierdzenia: data (wg wiedzy modelu 01.2024) | WYM-57. |

### 2.5. Orzecznictwo TSUE i Sądu UE

| ID | Tytuł | Wydawca | Oficjalny URL kanoniczny | Typ | Moc | Teza istotna | Weryfikacja | Zastosowanie do FaktFlow |
|---|---|---|---|---|---|---|---|---|
| ZR-60 | Wyrok TSUE z 16.07.2020, C-311/18, Data Protection Commissioner v Facebook Ireland i Schrems („Schrems II”) | TSUE | https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:62018CJ0311 | orzeczenie TSUE | wiążąca wykładnia prawa UE | unieważnienie decyzji Privacy Shield; SCC ważne, ale eksporter ocenia ochronę w państwie trzecim i stosuje środki uzupełniające | NZ | Podstawa obowiązku TIA przy SCC (WYM-60). |
| ZR-61 | Wyrok Sądu UE w sprawie T-553/23 Latombe v Komisja (skarga na decyzję 2023/1795) | Sąd (UE) | https://curia.europa.eu (URL do potwierdzenia) | orzeczenie Sądu UE | wiążące w sprawie; utrzymanie decyzji DPF | wg wiedzy modelu: wyrok z 3.09.2025 oddalający skargę | NZ; do potwierdzenia: data, wynik, czy wniesiono odwołanie do TSUE i jego stan | Ryzyko zmiany podstawy transferów do USA (WYM-59). |
| ZR-62 | Wyrok TSUE z 1.10.2019, C-673/17, Planet49 | TSUE | https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:62017CJ0673 | orzeczenie TSUE | wiążąca wykładnia | zgoda na cookies nie może wynikać z pola zaznaczonego domyślnie; art. 5 ust. 3 dotyczy informacji niezależnie od tego, czy są danymi osobowymi; informacja o czasie działania cookies i dostępie stron trzecich | NZ | WYM-15, WYM-63. |
| ZR-63 | Wyrok TSUE z 4.07.2023, C-252/21, Meta Platforms i in. v Bundeskartellamt | TSUE | https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:62021CJ0252 | orzeczenie TSUE | wiążąca wykładnia | art. 6 ust. 1 lit. b — tylko przetwarzanie obiektywnie niezbędne do celu umowy; lit. f — trzy kumulatywne przesłanki (uzasadniony interes, niezbędność, brak przewagi interesów osoby, z uwzględnieniem rozsądnych oczekiwań) | NZ | WYM-11, WYM-12. |
| ZR-64 | Wyrok TSUE z 4.05.2023, C-487/21, F.F. v Österreichische Datenschutzbehörde | TSUE | https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:62021CJ0487 | orzeczenie TSUE | wiążąca wykładnia | „kopia” z art. 15 ust. 3 = wierna i zrozumiała reprodukcja danych; może obejmować wyciągi z dokumentów, gdy to niezbędne do zrozumienia | NZ | Zakres eksportu (WYM-22). |

### 2.6. AICPA — SOC 2

| ID | Tytuł | Wydawca | Oficjalny URL kanoniczny | Typ | Moc | Przepisy / punkty istotne | Weryfikacja | Zastosowanie do FaktFlow |
|---|---|---|---|---|---|---|---|---|
| ZR-70 | 2017 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy (**with Revised Points of Focus — 2022**) | AICPA, Assurance Services Executive Committee (ASEC) | https://www.aicpa-cima.com (strona dokumentu — URL do potwierdzenia; 403) | kryteria AICPA | kryterium dobrowolne (stają się „odpowiednimi kryteriami” dopiero w badaniu SOC 2 albo gdy wymaga ich umowa z klientem) | identyfikatory w 2.6a; „points of focus” są ilustracyjne, nie są wymaganiami | NZ | Mapowanie pięciu kategorii w `06-SOC2.md` (WYM-SOC-1 – WYM-SOC-5). |
| ZR-71 | DC section 200, 2018 Description Criteria for a Description of a Service Organization's System in a SOC 2® Report (**with Revised Implementation Guidance — 2022**) | AICPA (ASEC) | jw. | kryteria AICPA | kryterium dobrowolne | elementy opisu systemu: usługi, zobowiązania i wymagania systemowe, komponenty, incydenty, kontrole komplementarne u klientów (CUEC) i u podprocesorów (CSOC) | NZ | Opis systemu FF (WYM-SOC-6). |
| ZR-72 | AICPA Guide: SOC 2® Reporting on an Examination of Controls at a Service Organization Relevant to Security, Availability, Processing Integrity, Confidentiality, or Privacy | AICPA | jw. | kryteria AICPA (przewodnik dla biegłych) | pomocniczy dla FF; wiąże praktykę biegłych | definicje raportów Type 1 / Type 2, metoda wyłączenia i włączenia podprocesorów (carve-out / inclusive) | NZ; do potwierdzenia: aktualna edycja (wg wiedzy modelu 2022) | WYM-SOC-6, WYM-SOC-7. |
| ZR-73 | Statements on Standards for Attestation Engagements: AT-C section 105 (Concepts Common to All Attestation Engagements) i AT-C section 205 (Assertion-Based Examination Engagements) | AICPA, Auditing Standards Board | jw. | standardy atestacyjne AICPA | wiążą biegłego (CPA), nie FF | badanie oparte na oświadczeniu kierownictwa; niezależność; raport biegłego | NZ; do potwierdzenia: tytuł AT-C 205 po SSAE 21 | FF nie może sam wydać raportu SOC 2 — tylko niezależny CPA (WYM-SOC-7). |
| ZR-74 | Definicje raportów SOC 2 Type 1 i Type 2 (w ZR-72) | AICPA | jw. | kryteria AICPA | kryterium dobrowolne | **Type 1** — rzetelność opisu systemu i odpowiedniość zaprojektowania kontroli **na określony dzień**; **Type 2** — dodatkowo skuteczność działania kontroli **w okresie** (długość okresu wybiera organizacja z biegłym; typowo kilka do kilkunastu miesięcy — praktyka rynkowa, do potwierdzenia) | NZ | Gotowość ≠ raport; brak „certyfikacji SOC 2” (WYM-SOC-7). |

### 2.6a. Identyfikatory kryteriów TSC 2017 (ZR-70)

Krótkie tytuły to **parafrazy po polsku** wg wiedzy modelu, nie
cytaty; NZ dla całej tabeli. Liczba kryteriów wg wiedzy modelu:
33 wspólne (CC) + 3 A + 2 C + 5 PI + 18 P = 61.

| ID | Krótki tytuł (parafraza) |
|---|---|
| CC1.1 | Zaangażowanie w uczciwość i wartości etyczne |
| CC1.2 | Niezależny nadzór organu zarządzającego nad kontrolą wewnętrzną |
| CC1.3 | Struktury, linie raportowania, uprawnienia i odpowiedzialności |
| CC1.4 | Pozyskiwanie, rozwój i utrzymanie kompetentnych osób |
| CC1.5 | Rozliczanie osób z odpowiedzialności za kontrolę wewnętrzną |
| CC2.1 | Pozyskiwanie i wykorzystywanie rzetelnych informacji |
| CC2.2 | Komunikacja wewnętrzna (cele, odpowiedzialności) |
| CC2.3 | Komunikacja z podmiotami zewnętrznymi |
| CC3.1 | Określenie celów pozwalające identyfikować ryzyka |
| CC3.2 | Identyfikacja i analiza ryzyk |
| CC3.3 | Uwzględnienie ryzyka nadużyć (fraud) |
| CC3.4 | Identyfikacja i ocena zmian wpływających na kontrolę |
| CC4.1 | Bieżące lub odrębne oceny działania kontroli |
| CC4.2 | Ocena i komunikowanie słabości kontroli |
| CC5.1 | Dobór i rozwój działań kontrolnych ograniczających ryzyko |
| CC5.2 | Ogólne kontrole nad technologią |
| CC5.3 | Wdrażanie kontroli przez polityki i procedury |
| CC6.1 | Zabezpieczenia dostępu logicznego (oprogramowanie, infrastruktura, architektura) |
| CC6.2 | Rejestracja i autoryzacja nowych użytkowników przed nadaniem poświadczeń |
| CC6.3 | Nadawanie, zmiana i odbieranie dostępu wg ról, najmniejsze uprawnienia, rozdział obowiązków |
| CC6.4 | Ograniczenie dostępu fizycznego |
| CC6.5 | Zabezpieczenie danych przy wycofaniu nośników i zasobów (usuwanie) |
| CC6.6 | Ochrona przed zagrożeniami spoza granic systemu |
| CC6.7 | Ograniczenie przesyłania i przenoszenia informacji; ochrona w transmisji |
| CC6.8 | Zapobieganie i wykrywanie nieautoryzowanego lub złośliwego oprogramowania |
| CC7.1 | Wykrywanie zmian konfiguracji i nowych podatności |
| CC7.2 | Monitorowanie komponentów pod kątem anomalii |
| CC7.3 | Ocena zdarzeń bezpieczeństwa (czy to incydent) |
| CC7.4 | Reakcja na incydenty |
| CC7.5 | Odtwarzanie po incydentach |
| CC8.1 | Zarządzanie zmianami (autoryzacja, projekt, testy, zatwierdzenie, wdrożenie) |
| CC9.1 | Ograniczanie ryzyka zakłóceń działalności |
| CC9.2 | Zarządzanie ryzykiem dostawców i partnerów |
| A1.1 | Utrzymanie i monitorowanie pojemności |
| A1.2 | Ochrona środowiskowa, kopie zapasowe i infrastruktura odtwarzania |
| A1.3 | Testowanie procedur planu odtwarzania |
| C1.1 | Identyfikacja i ochrona informacji poufnych |
| C1.2 | Usuwanie informacji poufnych |
| PI1.1 | Informacje o celach przetwarzania (definicje danych, specyfikacje) |
| PI1.2 | Kontrole wejścia |
| PI1.3 | Kontrole przetwarzania |
| PI1.4 | Kontrole wyjścia (udostępnianie i dostarczanie wyników) |
| PI1.5 | Przechowywanie wejść, danych w toku i wyjść (kompletnie, poprawnie, terminowo) |
| P1.1 | Informacja o praktykach prywatności (notice) |
| P2.1 | Wybór i zgoda |
| P3.1 | Zbieranie zgodne z celami |
| P3.2 | Wyraźna zgoda tam, gdzie wymagana |
| P4.1 | Ograniczenie wykorzystania |
| P4.2 | Retencja |
| P4.3 | Bezpieczne usuwanie |
| P5.1 | Dostęp osoby do jej danych (po identyfikacji i uwierzytelnieniu) |
| P5.2 | Korekta danych |
| P6.1 | Ujawnianie stronom trzecim za zgodą / zgodnie z celami |
| P6.2 | Rejestr autoryzowanych ujawnień |
| P6.3 | Rejestr nieautoryzowanych ujawnień (w tym naruszeń) |
| P6.4 | Zobowiązania prywatności od dostawców |
| P6.5 | Zobowiązanie dostawców do zgłaszania nieautoryzowanych ujawnień |
| P6.6 | Powiadamianie o naruszeniach i incydentach |
| P6.7 | Zestawienie danych i ujawnień na żądanie osoby |
| P7.1 | Jakość danych (dokładność, kompletność, aktualność) |
| P8.1 | Monitorowanie i egzekwowanie (zapytania, skargi, spory) |

Ograniczenie: pełnego tekstu kryteriów ani „points of focus” nie
odczytano. Do raportu dla klientów i do mapowania w `06-SOC2.md`
identyfikatory trzeba zweryfikować w oryginale AICPA.

### 2.7. Dokumentacja dostawców i materiały pomocnicze

| ID | Tytuł | Wydawca | Oficjalny URL kanoniczny | Typ | Moc | Przepisy / punkty istotne | Weryfikacja | Zastosowanie do FaktFlow |
|---|---|---|---|---|---|---|---|---|
| ZR-80 | Anthropic — Commercial Terms of Service, wersja „Effective June 17, 2025” (na stronie link do wersji poprzedniej) | Anthropic | https://www.anthropic.com/legal/commercial-terms | dokumentacja dostawcy (warunki umowne) | umowny — wiąże strony, jeśli FF je zaakceptował (czy i kiedy — nieznane) | sekcja B: Anthropic nie może trenować modeli na treściach klienta (Customer Content) z usług; klient zachowuje prawa do wejść i jest właścicielem wyników; sekcja C „Data Privacy”: dane przekazane przez usługi są przetwarzane zgodnie z Anthropic Data Processing Addendum, włączonym przez odesłanie (link `/legal/data-processing-addendum` — **nie pobierano**); warunki zmieniane z 30-dniowym wyprzedzeniem | **ODCZYT** — „odczyt online 2026-10-10 (https://www.anthropic.com/legal/commercial-terms)” | Dalszy procesor FF dla supportu, OCR, kategoryzacji i FLO. Retencja, lokalizacja, mechanizm transferu i dalsi procesorzy wynikają z DPA — odesłanie do `04-PROCESORZY-I-LOKALIZACJE.md`. Uwaga: polityka twierdzi, że zdjęcia „nie są przechowywane przez Anthropic” (`polityka-prywatnosci/page.tsx:106-108`) — warunki handlowe tego nie rozstrzygają. |
| ZR-81 | Dokumentacja i umowy pozostałych dostawców (Hetzner, Sentry, PostHog, Resend, Stripe, Google, Cloudflare, GitHub; MinIO i Supabase jako oprogramowanie self-hosted) | dostawcy | — | dokumentacja dostawcy | umowny / pomocniczy | — | niesprawdzane w tym pliku (domeny 403 wg briefu) | **Odesłanie do `04-PROCESORZY-I-LOKALIZACJE.md`.** |
| ZR-82 | Data Privacy Framework List | Departament Handlu USA | https://www.dataprivacyframework.gov | rejestr urzędowy USA (dowód faktyczny dla art. 45) | pomocniczy (dowód certyfikacji) | aktywność i zakres certyfikacji odbiorcy | niesprawdzane w tej sesji (zakres `04-PROCESORZY`) | WYM-59. |
| ZR-83 | Advisera — materiały o RODO, ISO 27001, SOC 2 | Advisera | — | materiał pomocniczy | **brak mocy** | wyłącznie lista zagadnień do sprawdzenia | **niepobierane** | Nie jest podstawą żadnego WYM. |
| ZR-84 | Schneider Downs — materiały o SOC 2 | Schneider Downs | — | materiał pomocniczy | **brak mocy** | wyłącznie lista zagadnień do sprawdzenia | **niepobierane** | Nie jest podstawą żadnego WYM. |

## 3. Katalog wymagań (WYM-NN)

Katalog jest podstawą macierzy w `05-MACIERZ-WYMAGAN.md`. **Nie ocenia
stanu** — kolumna „Punkt zaczepienia” wskazuje tylko miejsca w kodzie,
które sprawdziłem 10.10.2026 i od których macierz powinna zacząć. Brak
wskazania nie znaczy, że w repo nic nie ma.

Legenda:
- **Klasa:** P — obowiązek prawny; O — interpretacja organu/EDPB/WP29
  (w tym raport albo decyzja); S — kryterium SOC 2; I — proponowana
  praktyka inżynierska. Kilka liter = pierwsza jest główna (zasady
  w sekcji 4).
- **Adresat:** FF-A — FaktFlow jako administrator; FF-P — FaktFlow jako
  procesor klienta; K — klient (podatnik, administrator danych
  w swoich dokumentach).
- **Obszar:** A inwentarz i klasyfikacja; B minimalizacja i ustawienia
  domyślne; C podstawy, informacje, zgody, cookies; D prawa osób;
  E retencja i usuwanie; F procesorzy, lokalizacje, transfery;
  G dokumenty i dowody; SOC — kategorie SOC 2.
- Wszystkie odwołania do przepisów — **NZ** (sekcja 1.2), chyba że
  zaznaczono inaczej.

### 3.1. Role i inwentarz (A)

| ID | Wymaganie (dla SaaS fakturowego) | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-01 | Role ustalone **osobno dla każdej operacji**, nie jedna rola dla aplikacji. FF-A: konta i uwierzytelnianie, subskrypcje i rozliczenia, newsletter i marketing, analityka produktowa, bezpieczeństwo i logi, wsparcie. FF-P: dane osób w dokumentach klienta (kontrahenci-JDG i osoby kontaktowe na fakturach, wydatki i OCR, KPiR, płatności, przypomnienia do kontrahentów, faktury odebrane z KSeF). Minister Finansów (KSeF) — odrębny administrator. Do oceny: Stripe, Google (logowanie), biuro rachunkowe w module dostępu księgowego. | P, O | ZR-01 art. 4 pkt 7–8, art. 28 ust. 10; ZR-32 | FF-A | A | Wynik w `02-INWENTARZ-I-PRZEPLYWY.md`. |
| WYM-02 | Dane przedsiębiorców będących osobami fizycznymi (JDG: imię i nazwisko, NIP, adres na fakturze) traktowane jako dane osobowe; dane osób prawnych — nie, ale dane ich reprezentantów i osób kontaktowych — tak. Ma to wpływ na zakres praw osób i retencji w danych klientów. | P, O | ZR-01 art. 4 pkt 1, motyw 14 | FF-A, FF-P | A | — |
| WYM-03 | Inwentarz: kategorie osób, danych i celów; źródło, przepływ, magazyny, odbiorcy, dostęp, retencja — per operacja. Jest wejściem do rejestrów z art. 30 i informacji z art. 13–14. | P (pośrednio), I | ZR-01 art. 30, art. 5 ust. 2 | FF-A, FF-P | A | `02-INWENTARZ-I-PRZEPLYWY.md`. |

### 3.2. Zasady art. 5 (każda osobno)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-04 | **Zgodność z prawem, rzetelność, przejrzystość:** każdy cel ma podstawę; brak przetwarzania nieopisanego w informacjach (np. analityka po stronie serwera, telemetria błędów w przeglądarce). | P | ZR-01 art. 5 ust. 1 lit. a | FF-A | C | Analityka serwerowa deklarowana w `polityka-prywatnosci/page.tsx:243-246`; klient PostHog po stronie serwera: `lib/analytics/posthog-node-client.ts`. |
| WYM-05 | **Ograniczenie celu:** dane z dokumentów klienta służą tylko świadczeniu usługi na jego polecenie — nie analityce produktowej treści, marketingowi FF ani trenowaniu modeli. Dalsze przetwarzanie przez FF-A tylko po teście zgodności celów (art. 6 ust. 4). | P | ZR-01 art. 5 ust. 1 lit. b, art. 6 ust. 4, art. 28 ust. 10 | FF-A, FF-P | B | Sanityzacja adresów w analityce do obszaru aplikacji: `lib/analytics/privacy.ts:6-26` (ocena w A1). |
| WYM-06 | **Minimalizacja:** pola formularzy, zakres odpowiedzi API, eksporty, logi i zdarzenia ograniczone do niezbędnych dla celu. | P | ZR-01 art. 5 ust. 1 lit. c | FF-A, FF-P | B | Ocena w A1. |
| WYM-07 | **Prawidłowość:** możliwość poprawienia danych konta i kontrahentów; dane z rejestrów publicznych (GUS, VIES, biała lista VAT) oznaczone datą pobrania i odświeżalne; zmiany danych na wystawionych fakturach tylko w trybie przepisów VAT (korekta), nie przez nadpisanie. | P, I | ZR-01 art. 5 ust. 1 lit. d; ZR-13 | FF-A, FF-P | D, B | — |
| WYM-08 | **Ograniczenie przechowywania:** każda kategoria danych ma okres albo kryterium ustalenia okresu; po jego upływie dane są usuwane albo skutecznie anonimizowane. | P | ZR-01 art. 5 ust. 1 lit. e, motyw 39 | FF-A, FF-P | E | Szczegóły w WYM-68 – WYM-73. |
| WYM-09 | **Integralność i poufność:** ochrona przed nieuprawnionym dostępem, utratą i zniszczeniem (izolacja najemców przez RLS, szyfrowanie, kopie, kontrola dostępu administracyjnego). | P | ZR-01 art. 5 ust. 1 lit. f, art. 32 | FF-A, FF-P | B, SOC | Szczegóły w WYM-50, WYM-51. |
| WYM-10 | **Rozliczalność:** FF potrafi wykazać zgodność — rejestry, testy uzasadnionego interesu, screening DPIA, ocena transferów, polityki i dowody działania kontroli (nie samo istnienie dokumentu). | P | ZR-01 art. 5 ust. 2, art. 24 ust. 1 | FF-A | G | Szczegóły w WYM-74. |

### 3.3. Podstawy przetwarzania, zgody, informacje (C)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-11 | Mapa **cel → jedna podstawa** z art. 6 ust. 1 dla każdego celu FF-A: lit. b — konto i świadczenie usługi (wąsko: tylko to, co obiektywnie niezbędne); lit. c — obowiązki FF jako podatnika i przedsiębiorcy; lit. f — bezpieczeństwo (motyw 49), dochodzenie i obrona roszczeń, ewentualnie analityka serwerowa; lit. a — tam, gdzie zgody wymaga prawo (urządzenie końcowe, marketing elektroniczny). Zgody nie przypisuje się automatycznie każdemu przetwarzaniu. | P, O | ZR-01 art. 6 ust. 1, motyw 49; ZR-63; ZR-51 | FF-A | C | — |
| WYM-12 | Dla każdego celu z art. 6 ust. 1 lit. f — udokumentowany test: uzasadniony interes, niezbędność, wyważenie z rozsądnymi oczekiwaniami osoby; informacja o interesie w polityce; obsługa sprzeciwu. | P, O | ZR-01 art. 6 ust. 1 lit. f, art. 13 ust. 1 lit. d, motyw 47; ZR-63; ZR-42 (dokument konsultacyjny — tylko kierunek) | FF-A | C, G | Polityka deklaruje zdarzenia serwerowe „w modelu uzasadnionego interesu … z pseudonimizacją” — `polityka-prywatnosci/page.tsx:243-246`; testu w repo nie szukałem (zakres A1/A3). |
| WYM-13 | **Dowód zgody:** zapis kto, kiedy, na jaką treść (wersja klauzuli), w jaki sposób i czy wycofał — dla newslettera i, w zakresie wykonalnym, dla zgody na analitykę. | P, O | ZR-01 art. 7 ust. 1, motyw 42; ZR-31 | FF-A | C | Newsletter zapisuje e-mail, źródło i czas: `supabase/migrations/00059_newsletter_subscribers.sql:12-22`, `app/actions/newsletter.ts:66-71` (bez wersji treści). Zgoda na analitykę tylko w `localStorage`: `lib/analytics/consent.ts:2,27-36`. |
| WYM-14 | **Wycofanie zgody** w każdej chwili, tak łatwo jak jej udzielenie, z informacją o tym przed udzieleniem; skutek natychmiastowy (zatrzymanie analityki; wypis z newslettera także u dostawcy wysyłki). | P, O | ZR-01 art. 7 ust. 3; ZR-31; ZR-21 (a) | FF-A | C | Kolumna `unsubscribed_at`: `00059_newsletter_subscribers.sql:19-21`; wypis z kategorii e-mail: `lib/email/preferences.ts:88-101`. Ścieżki wycofania — ocena w A1/A4. |
| WYM-15 | Zgoda **dobrowolna, konkretna, świadoma, jednoznaczna:** bez pól zaznaczonych domyślnie; oddzielona od akceptacji regulaminu; nie warunkuje usługi. | P, O | ZR-01 art. 4 pkt 11, art. 7 ust. 2 i 4, motywy 32, 43; ZR-62; ZR-31 | FF-A | C | Baner: `components/analytics/consent-banner.tsx` (ocena runtime w A4). |
| WYM-16 | **Art. 8–10 — ocena „nie dotyczy” z uzasadnieniem:** art. 8 nie dotyczy (usługa B2B, regulamin wymaga pełnoletności); art. 9 — nie jest celem, ale ryzyko przypadkowych danych szczególnych kategorii w treści faktur, wydatków, OCR i czatu wsparcia uwzględnia się w ocenie ryzyka (art. 32) i w screeningu DPIA; art. 10 nie dotyczy. | P, I | ZR-01 art. 8–10, art. 32 | FF-A, FF-P | A, B | `app/(marketing)/legal/regulamin/page.tsx:56` (pełnoletność). |
| WYM-17 | **Art. 12 ust. 1–2 i 6, art. 11 — forma i identyfikacja:** informacje zwięzłe, przejrzyste, zrozumiałe, łatwo dostępne, jasnym językiem, warstwowo; ułatwianie wykonywania praw (kanał w aplikacji i poza nią, także dla osób bez konta); przy uzasadnionych wątpliwościach co do tożsamości — dodatkowe informacje, ale proporcjonalnie (bez żądania dokumentów tożsamości, gdy wystarczy kontrola konta lub adresu); dane wyłącznie pseudonimowe nie wymagają dodatkowej identyfikacji. | P, O | ZR-01 art. 11, art. 12 ust. 1, 2, 6; ZR-47; ZR-33 | FF-A | C, D | Kanał: `polityka-prywatnosci/page.tsx:202` (e-mail). |
| WYM-75 | **Art. 12 ust. 3–5 — terminy i koszty:** odpowiedź bez zbędnej zwłoki, najpóźniej w ciągu miesiąca od otrzymania żądania; przedłużenie o kolejne dwa miesiące tylko ze względu na złożoność lub liczbę żądań, z informacją i uzasadnieniem w ciągu pierwszego miesiąca; odmowa — w ciągu miesiąca z pouczeniem o skardze i środku prawnym; żądanie elektroniczne — odpowiedź elektroniczna, jeśli możliwe; bezpłatnie, poza żądaniami ewidentnie nieuzasadnionymi lub nadmiernymi. Wymaga ewidencji daty wpływu żądania. | P | ZR-01 art. 12 ust. 3–5; ZR-33 | FF-A | D | Polityka: usunięcie „najpóźniej w ciągu miesiąca” — `polityka-prywatnosci/page.tsx:170-174`; okres wycofania 14 dni — `lib/gdpr/deletion.ts:6,107` (zgodność obu terminów — ocena w A2). |
| WYM-18 | **Art. 13 — pełna informacja przy zbieraniu:** tożsamość i dane kontaktowe administratora; IOD, jeśli wyznaczony; cele i podstawy; uzasadnione interesy; odbiorcy lub ich kategorie; transfery i zabezpieczenia oraz sposób uzyskania ich kopii; okresy przechowywania; prawa; prawo wycofania zgody; skarga do Prezesa UODO; czy podanie danych jest wymogiem; zautomatyzowane decyzje. Dotyczy rejestracji, logowania Google, newslettera, kontaktu, czatu wsparcia. | P | ZR-01 art. 13 ust. 1–2; ZR-47 | FF-A | C | Administrator jako **placeholder** „[nazwa firmy], NIP [TWÓJ_NIP]”: `polityka-prywatnosci/page.tsx:20-21`, `regulamin/page.tsx:23`. |
| WYM-19 | **Spójność deklaracji z faktycznym przetwarzaniem:** polityka, strona RODO, regulamin i komunikaty opisują to, co aplikacja i dostawcy faktycznie robią (lokalizacje, dostawcy, cookies, okresy, podstawy prawne okresów). | P, O | ZR-01 art. 5 ust. 1 lit. a, art. 12–13; ZR-47 | FF-A | C, G | Sprawdzone niespójności: `rodo/page.tsx:20` „Frankfurt am Main (Hetzner, Vercel)” wobec Hetzner NBG1 (Norymberga) wg `AGENTS.md:22,89`; `rodo/page.tsx:47` „Brak cookies analitycznych” wobec `polityka-prywatnosci/page.tsx:236-240` (PostHog po zgodzie); lista dostawców wymienia Supabase Cloud, Cloudflare R2, Vercel i Inngest (`polityka-prywatnosci/page.tsx:85,88,99,114`), a `AGENTS.md` opisuje Supabase self-hosted, MinIO, Hetzner i odpięcie Inngest; PostHog nie występuje na tej liście; 10 lat dla faktur z powołaniem art. 70 § 1 OP (`polityka-prywatnosci/page.tsx:230`) — zob. WYM-68. |
| WYM-20 | **Art. 14 — informacja, gdy danych nie pozyskano od osoby:** FF-A — np. osoby zapraszane do organizacji przez innego użytkownika, osoby kontaktowe klientów; w rozsądnym terminie, najpóźniej w ciągu miesiąca, przy pierwszej komunikacji albo pierwszym ujawnieniu; wyjątki z ust. 5 udokumentowane. Gdy FF jest procesorem (kontrahenci w fakturach, faktury z KSeF) — obowiązek ma klient; FF może go ułatwić (wzór klauzuli). | P, O | ZR-01 art. 14 ust. 1–3, 5; ZR-47 | FF-A; K | C, D | Zaproszenia: migracja `00036_memberships_invitations.sql` (treść komunikatu — ocena w A1). |

### 3.4. Prawa osób (D) — każde prawo osobno

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-21 | **Dostęp (art. 15 ust. 1–2):** potwierdzenie, czy dane są przetwarzane, dostęp do nich i informacje (cele, kategorie, odbiorcy, okres, źródło, prawa, transfery). Jako procesor — pomoc klientowi (WYM-44). | P, O | ZR-01 art. 15 ust. 1–2; ZR-33; ZR-44 | FF-A | D | — |
| WYM-22 | **Kopia (art. 15 ust. 3–4):** wierna i zrozumiała reprodukcja danych; pierwsza bezpłatna; elektronicznie przy żądaniu elektronicznym; bez niekorzystnego wpływu na prawa innych (eksport konta nie ujawnia danych innych członków organizacji ani kontrahentów ponad uprawnienia osoby żądającej); bezpieczne dostarczenie. | P, O | ZR-01 art. 15 ust. 3–4; ZR-64; ZR-33 | FF-A | D | Eksport: `app/api/gdpr/export/route.ts`, zbieranie danych: `lib/gdpr/data-collector.ts` (ocena w A2). |
| WYM-23 | **Sprostowanie (art. 16):** edycja danych konta i profilu; dane na wystawionych fakturach — korekta w trybie przepisów VAT, bez naruszenia obowiązku podatkowego klienta (interpretacja do review); uzupełnienie danych niekompletnych. | P, O | ZR-01 art. 16; ZR-13 | FF-A; FF-P (pomoc) | D | — |
| WYM-24 | **Usunięcie (art. 17):** przesłanki z ust. 1; wyjątki z ust. 3 lit. b (obowiązek prawny — ustalić, **czyj**) i lit. e (roszczenia) stosowane wąsko i udokumentowane; usunięcie we wszystkich systemach (baza, magazyn plików i archiwum, kolejki, logi, Sentry, PostHog, Resend, Stripe w zakresie FF-A, kopie — WYM-72); termin z art. 12 ust. 3. Jako procesor — na polecenie klienta. | P, O | ZR-01 art. 17 ust. 1, 3; ZR-45 | FF-A; FF-P | D, E | Okres wycofania 14 dni: `lib/gdpr/deletion.ts:6,107`; ADR `docs/adr/0006-gdpr-14d-cooling-off.md`; blokady usunięcia: `lib/gdpr/deletion-blockers.ts` (ocena w A2). |
| WYM-25 | **Ograniczenie przetwarzania (art. 18):** możliwość oznaczenia i wstrzymania przetwarzania danych osoby (spór o prawidłowość, sprzeciw w toku, dane potrzebne do roszczeń mimo braku celu) z informacją przed zniesieniem ograniczenia. | P | ZR-01 art. 18 | FF-A; FF-P | D | Mechanizmu nie szukałem — do ustalenia w A2. |
| WYM-26 | **Powiadamianie odbiorców (art. 19):** po sprostowaniu, usunięciu lub ograniczeniu — informacja do odbiorców (np. usunięcie osoby w PostHog, kontaktu w Resend, klienta w Stripe), chyba że niemożliwe lub wymaga niewspółmiernego wysiłku; na żądanie — informacja o odbiorcach. | P | ZR-01 art. 19 | FF-A | D, F | — |
| WYM-27 | **Przenoszenie (art. 20):** dane dostarczone przez osobę, przetwarzane na podstawie zgody lub umowy w sposób zautomatyzowany — w formacie ustrukturyzowanym, powszechnie używanym, do odczytu maszynowego (np. JSON, CSV; faktury w XML FA(3)); bezpośrednie przesłanie, gdy technicznie możliwe; bez naruszania praw innych. | P, O | ZR-01 art. 20; ZR-49 | FF-A | D | jw. eksport (ocena formatu w A2). |
| WYM-28 | **Sprzeciw (art. 21):** ust. 1 — wobec przetwarzania na podstawie uzasadnionego interesu (np. analityka serwerowa) — zaprzestanie, chyba że ważne prawnie uzasadnione podstawy; ust. 2–3 — marketing bezpośredni: bezwzględny i natychmiastowy; ust. 4 — informacja o prawie sprzeciwu wyraźnie i oddzielnie, najpóźniej przy pierwszej komunikacji. | P | ZR-01 art. 21 ust. 1–4 | FF-A | D, C | `polityka-prywatnosci/page.tsx:243-246` (uzasadniony interes). |
| WYM-29 | **Art. 22:** ustalić i udokumentować, że aplikacja nie podejmuje decyzji wyłącznie zautomatyzowanych o skutkach prawnych lub podobnie istotnych (automatyczne blokady konta, odmowy rejestracji przez mechanizmy antyfraudowe, decyzje modeli AI); jeśli takie są — zabezpieczenia z ust. 3 i informacja z art. 13 ust. 2 lit. f. | P, O | ZR-01 art. 22; ZR-50 | FF-A | D | Niezweryfikowane w repo w tej sesji. |

### 3.5. Odpowiedzialność, privacy by design/default, minimalizacja (B, G)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-30 | **Art. 24:** odpowiednie środki techniczne i organizacyjne oraz zdolność wykazania zgodności; polityki ochrony danych proporcjonalne do przetwarzania; przegląd i aktualizacja. | P | ZR-01 art. 24 ust. 1–2 | FF-A | G | — |
| WYM-31 | **Art. 25 ust. 1 — projektowanie:** ochrona danych uwzględniana przy określaniu sposobów przetwarzania i w trakcie przetwarzania; każda nowa funkcja przetwarzająca dane (AI i OCR, eksport, telemetria, integracje) przechodzi listę kontrolną zasad art. 5 z dowodem (np. sekcja w szablonie PR); środki dobrane do stanu wiedzy, kosztu i ryzyka. Art. 25 adresuje administratora; jako procesor FF projektuje tak, by klienci mogli spełnić art. 25 (motyw 78, art. 28 ust. 1). | P, O | ZR-01 art. 25 ust. 1, motyw 78; ZR-30 | FF-A (FF-P pośrednio) | B | Szablon PR: `.github/pull_request_template.md` (wg `AGENTS.md`; treść — ocena w A3). |
| WYM-32 | **Art. 25 ust. 2 — domyślność:** domyślnie przetwarzane tylko dane niezbędne dla każdego celu — w zakresie **ilości** zbieranych danych, **zakresu** przetwarzania, **okresu** przechowywania i **dostępności**: analityka wyłączona do zgody, krótkie domyślne retencje, najmniejsze uprawnienia ról w organizacji. | P, O | ZR-01 art. 25 ust. 2; ZR-30 | FF-A (FF-P pośrednio) | B | PostHog: `persistence: 'memory'`, `opt_out_capturing_by_default`, `autocapture: false`, `disable_session_recording: true` — `lib/analytics/init-posthog-browser.ts:29-37` (zachowanie po zgodzie — ocena w A1/A4). |
| WYM-33 | **Art. 25 ust. 2 zd. ostatnie — domyślnie niedostępne dla nieokreślonej liczby osób:** dane nie mogą być domyślnie udostępniane bez interwencji osoby nieokreślonej liczbie osób fizycznych. Dotyczy linków z tokenem (portal biura rachunkowego, udostępnione PDF i podglądy faktur), plików w magazynie (bez publicznych bucketów i adresów bez wygasania), indeksowania przez wyszukiwarki — wyłącznie z aktywnej decyzji użytkownika, ograniczone w czasie, odwoływalne. | P, O | ZR-01 art. 25 ust. 2; ZR-30 | FF-A, FF-P | B | Portal: sprawdzanie `expires_at` i `revoked_at` — `app/api/portal/exports/generate/route.ts:49-64`; `lib/accountant/load-accountant-portal.ts:51` (ocena domyślnego czasu ważności w A1). |
| WYM-34 | **Ustawienia po stronie dostawców** nie poszerzają przetwarzania ponad konfigurację w kodzie i deklaracje; retencja u dostawców ustawiona na minimum potrzebne do celu. | O, I | ZR-01 art. 25 ust. 2, art. 28 ust. 1; ZR-30 | FF-A | B, F | Wg niescalonego PR #225 (deklaracja/pomiar operatora, niezweryfikowane w tej sesji) projekt PostHog ma włączone nagrania sesji (opt-in) i heatmapy, choć kod je wyłącza. |
| WYM-35 | **Dostęp personelu i wsparcia** do danych klientów: zasada need-to-know, upoważnienia, rejestrowanie dostępu administracyjnego (`audit_logs`), brak domyślnego wglądu w treść dokumentów. | P, S, I | ZR-01 art. 25 ust. 2, art. 29, art. 32 ust. 4; ZR-70 CC6.1–CC6.3 | FF-A, FF-P | B | Ocena w A1. |
| WYM-36 | **Logi, błędy, telemetria:** bez danych osobowych albo z minimalizacją i usuwaniem (scrubbing) — logi aplikacji, Sentry, ładunki zadań pg-boss; zdefiniowana retencja i ograniczony dostęp. | P, I | ZR-01 art. 5 ust. 1 lit. c i e, art. 25, art. 32, motywy 30, 49 | FF-A, FF-P | B | `lib/observability/scrub.ts` (ocena w A1); polityka retencji telemetrii z PR #225 — przyjęta, niewdrożona (wg briefu). |
| WYM-37 | **Dane testowe:** bez danych produkcyjnych w testach i środowiskach deweloperskich; dane syntetyczne. | I, P | ZR-01 art. 5 ust. 1 lit. b–c, art. 32 | FF-P | B | Konwencja fikcyjnego NIP: `AGENTS.md:75`. |
| WYM-38 | **Pseudonimizacja i anonimizacja:** pseudonimizacja jako środek, ale dane spseudonimizowane pozostają osobowe; anonimizacja tylko przy braku rozsądnie prawdopodobnej identyfikacji; hash, UUID, maskowanie i szyfrowanie nie są dowodem anonimizacji. | P, O | ZR-01 art. 4 pkt 5, motyw 26; ZR-54; ZR-43 (dokument konsultacyjny — kierunek) | FF-A, FF-P | B, E | Polityka zapowiada „zanonimizowanie” wpisów audytu — `polityka-prywatnosci/page.tsx:221-224` (ocena w A2). |

### 3.6. Współadministrowanie i procesorzy (F)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-39 | **Art. 26:** ocenić, czy gdziekolwiek występuje wspólne ustalanie celów i sposobów (klient–biuro rachunkowe w module dostępu księgowego; FF–dostawca analityki); jeśli tak — uzgodnienie i udostępnienie jego zasadniczej treści. Wstępnie nie dotyczy (do potwierdzenia). | P, O | ZR-01 art. 26; ZR-32 | FF-A | A | Moduł: migracje `00010_accountant_access.sql`, `00011_accountant_access_token_optional.sql`. |
| WYM-40 | **Art. 28 ust. 1:** FF-A (wobec swoich procesorów) i FF-P (wobec dalszych procesorów) korzysta tylko z podmiotów dających wystarczające gwarancje; udokumentowana ocena dostawcy (umowa powierzenia, lokalizacje, retencja, dalsi procesorzy, certyfikaty), proporcjonalna do ryzyka i obejmująca cały łańcuch. | P, O | ZR-01 art. 28 ust. 1, motyw 81; ZR-41 | FF-A, FF-P | F | `04-PROCESORZY-I-LOKALIZACJE.md`. |
| WYM-41 | **Art. 28 ust. 3 — umowa z klientem:** FF-P zawiera z każdym klientem umowę powierzenia (albo inny instrument prawny) w formie pisemnej, także elektronicznej, z przedmiotem, czasem, charakterem i celem, rodzajem danych, kategoriami osób, obowiązkami i prawami administratora oraz elementami lit. a–h; zawierana przy rejestracji (np. jako część regulaminu), a nie „na żądanie”. | P, O | ZR-01 art. 28 ust. 3, 9; ZR-32; ZR-05 (wzór) | FF-P | F, G | DPA oferowane „na życzenie” e-mailem: `app/(marketing)/legal/rodo/page.tsx:54-58`. |
| WYM-42 | **Art. 28 ust. 3 lit. a i ust. 10:** przetwarzanie wyłącznie na udokumentowane polecenie klienta, także co do transferów; użycie danych klienta do celów własnych FF (analityka treści, ulepszanie lub trenowanie AI, marketing) czyni FF administratorem i wymaga odrębnej podstawy; procesor informuje klienta, jeśli polecenie narusza prawo. | P | ZR-01 art. 28 ust. 3 lit. a, ust. 10 | FF-P | F, B | — |
| WYM-43 | **Art. 28 ust. 2 i 4 — dalsi procesorzy:** uprzednia szczegółowa albo ogólna pisemna zgoda klienta; przy ogólnej — informowanie o zamierzonych zmianach i możliwość sprzeciwu; aktualna lista dalszych procesorów z identyfikacją łańcucha; umowy z dalszymi procesorami nakładające te same obowiązki; pełna odpowiedzialność FF wobec klienta. | P, O | ZR-01 art. 28 ust. 2, 4; ZR-41 | FF-P | F | Lista w polityce (`polityka-prywatnosci/page.tsx:84-120`) jest informacją FF-A dla użytkowników, a nie mechanizmem zgody klienta-administratora. |
| WYM-44 | **Art. 28 ust. 3 lit. e–f:** pomoc klientowi w realizacji praw osób (wyszukanie, eksport, sprostowanie i usunięcie danych kontrahenta-osoby fizycznej w danych klienta, z zachowaniem jego obowiązku podatkowego) oraz w obowiązkach z art. 32–36 (opis środków, zgłaszanie naruszeń, materiały do DPIA klienta). | P | ZR-01 art. 28 ust. 3 lit. e–f | FF-P | D, F | — |
| WYM-45 | **Art. 28 ust. 3 lit. g — koniec umowy:** wg decyzji klienta usunięcie albo zwrot wszystkich danych i usunięcie kopii, chyba że prawo UE lub PL nakazuje **FF** ich przechowywanie. Interpretacja do review: obowiązki przechowywania faktur (ZR-13 – ZR-16) ciążą na kliencie, nie na FF; dalsze przechowywanie przez FF — tylko na polecenie klienta (np. płatne archiwum) i z określonym końcem. | P, O | ZR-01 art. 28 ust. 3 lit. g; ZR-32 | FF-P | E, F | Domyślne `retention_years = 10`: `supabase/migrations/00009_retention.sql:8-9`; usuwanie po retencji: `lib/jobs/runners/retention-delete.ts:14,59`; konwencja „RODO — retencja 10 lat dla danych fakturowych” — `AGENTS.md:87` (RODO nie ustala takiego okresu). |
| WYM-46 | **Art. 28 ust. 3 lit. h:** udostępnianie klientowi informacji potrzebnych do wykazania zgodności i umożliwienie audytów; raport SOC 2 może być jednym z dowodów, ale nie zastępuje obowiązków z RODO. | P | ZR-01 art. 28 ust. 3 lit. h | FF-P | G, F | — |
| WYM-47 | **Art. 29, art. 28 ust. 3 lit. b, art. 32 ust. 4:** osoby z dostępem do danych (operatorzy, wykonawcy, automaty i agenci z dostępem do produkcji lub danych) działają wyłącznie na polecenie i są zobowiązane do poufności; upoważnienia i ich okresowy przegląd. | P, S | ZR-01 art. 29, art. 28 ust. 3 lit. b, art. 32 ust. 4; ZR-70 CC6.2–CC6.3, CC1.4 | FF-A, FF-P | G, B | Workflow `.github/workflows/agent.yml` przekazuje treść zgłoszeń do zewnętrznego dostawcy (`01-STAN-I-GRANICE.md` §3) — zakres danych w zgłoszeniach do kontroli. |

### 3.7. Rejestry, bezpieczeństwo, naruszenia, DPIA, IOD (G)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-48 | **Art. 30 ust. 1 — rejestr czynności FF-A:** cele, kategorie osób i danych, odbiorcy, transfery, planowane terminy usunięcia, ogólny opis środków. **Wyjątek z ust. 5** (podmioty < 250 osób) wg interpretacji nie ma zastosowania: przetwarzanie nie jest sporadyczne (ciągła usługa) i może powodować ryzyko (dane finansowe). | P, O | ZR-01 art. 30 ust. 1, 3–5; ZR-55 | FF-A | G | Nie znaleziono rejestru w repo przy tym przeglądzie (przegląd niewyczerpujący — ocena w A3). |
| WYM-49 | **Art. 30 ust. 2 — rejestr kategorii czynności FF-P:** dla każdego administratora-klienta — nazwa i dane kontaktowe, kategorie przetwarzania, transfery, ogólny opis środków; forma elektroniczna; udostępnienie organowi na żądanie. Wniosek co do ust. 5 jak w WYM-48. | P | ZR-01 art. 30 ust. 2–5; ZR-55 | FF-P | G | Pomysł (I): część rejestru generowana z danych o organizacjach-klientach — do oceny w planie. |
| WYM-50 | **Art. 32 ust. 1 lit. a–b i ust. 2:** środki adekwatne do ryzyka — pseudonimizacja i szyfrowanie (w transmisji, w spoczynku, w kopiach), zdolność zapewnienia poufności, integralności, dostępności i odporności; udokumentowana ocena ryzyka. | P, S | ZR-01 art. 32 ust. 1–2, motyw 83; ZR-70 CC6, C1 | FF-A, FF-P | B, SOC | Deklaracje strony RODO o szyfrowaniu (`rodo/page.tsx:22-28`) wymagają potwierdzenia w konfiguracji (A3). |
| WYM-51 | **Art. 32 ust. 1 lit. c–d:** zdolność szybkiego przywrócenia dostępności danych po incydencie (kopie poza hostem źródłowym) oraz regularne testowanie, mierzenie i ocena skuteczności środków (test odtwarzania). | P, S, O | ZR-01 art. 32 ust. 1 lit. c–d; ZR-70 A1.2–A1.3, CC7.5; ZR-21 (c) | FF-A, FF-P | E, SOC | Wg niescalonego PR #225 (pomiar operatora 4.10, niezweryfikowany): brak pełnej kopii bazy i magazynu plików poza hostem źródłowym, brak testu odtwarzania. |
| WYM-52 | **Art. 33 (FF-A):** zgłoszenie naruszenia Prezesowi UODO bez zbędnej zwłoki, w miarę możliwości do 72 h od stwierdzenia, chyba że naruszenie prawdopodobnie nie skutkuje ryzykiem; minimalna treść; zgłaszanie etapami; dokumentowanie **wszystkich** naruszeń (rejestr). | P, O | ZR-01 art. 33 ust. 1, 3–5; ZR-36; ZR-37 | FF-A | G | Procedura i rejestr — ocena w A3. |
| WYM-53 | **Art. 33 ust. 2 (FF-P):** zawiadomienie klienta bez zbędnej zwłoki po stwierdzeniu naruszenia; termin i treść w umowie powierzenia; przekazanie informacji potrzebnych do zgłoszenia klienta. | P, O | ZR-01 art. 33 ust. 2; ZR-36 | FF-P | G | Strona RODO obiecuje powiadomienie klienta „w ciągu 72 godzin” (`rodo/page.tsx:61-65`) — wg interpretacji to termin administratora wobec organu; klient potrzebuje informacji szybciej, by dotrzymać własnych 72 h. |
| WYM-54 | **Art. 34:** zawiadomienie osób, których dane dotyczą, bez zbędnej zwłoki przy wysokim ryzyku, jasnym językiem; wyjątki z ust. 3; jako procesor — pomoc klientowi. | P, O | ZR-01 art. 34; ZR-36 | FF-A; FF-P (pomoc) | G | — |
| WYM-55 | **Art. 35 — wstępna ocena (screening) potrzeby DPIA**, udokumentowana także przy wyniku negatywnym: kryteria WP248 (zwykle ≥ 2 → DPIA) i wykaz Prezesa UODO. Kandydaci dla FF: dane o charakterze wysoce osobistym (finansowe), duża skala (do ustalenia), łączenie zbiorów (KSeF, rejestry publiczne, importy płatności), innowacyjne technologie (modele językowe w OCR, kategoryzacji i wsparciu). Gdy DPIA wymagana — treść z ust. 7, konsultacja z IOD (jeśli jest), przegląd przy zmianie ryzyka (ust. 11). Jako procesor — materiały dla DPIA klienta. | P, O | ZR-01 art. 35 ust. 1, 3, 4, 7, 11; ZR-20; ZR-46 | FF-A; FF-P (pomoc) | G | — |
| WYM-56 | **Art. 36:** uprzednie konsultacje z Prezesem UODO, gdy DPIA wskaże wysokie ryzyko szczątkowe. | P | ZR-01 art. 36 | FF-A | G | Zależne od WYM-55. |
| WYM-57 | **Art. 37–39 — IOD:** udokumentowana ocena obowiązku (art. 37 ust. 1 lit. b: główna działalność polega na regularnym i systematycznym monitorowaniu osób na dużą skalę; lit. c: dane z art. 9–10 na dużą skalę) — obowiązek dotyczy także procesora; wstępnie raczej nie zachodzi (do potwierdzenia). Przy dobrowolnym wyznaczeniu — pełne art. 38–39, publikacja danych kontaktowych i zawiadomienie Prezesa UODO (ZR-10). Nie nazywać „IOD” osoby niewyznaczonej formalnie. | P, O | ZR-01 art. 37–39; ZR-48; ZR-57; ZR-10 | FF-A, FF-P | G | — |

### 3.8. Transfery i dostawcy AI (F)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-58 | **Art. 44 — mapa transferów** poza EOG: dostawcy z siedzibą w państwie trzecim, zdalny dostęp z państw trzecich (wsparcie i dalsi procesorzy dostawców działających w „regionie UE”), narzędzia deweloperskie przetwarzające dane. Deklaracja „region UE” nie zamyka oceny łańcucha. | P, O | ZR-01 art. 44; ZR-39 | FF-A, FF-P | F | `04-PROCESORZY-I-LOKALIZACJE.md`. |
| WYM-59 | **Art. 45 — DPF:** dla odbiorcy z USA potwierdzona aktywna certyfikacja i jej zakres; monitorowanie ważności decyzji 2023/1795 (spór T-553/23). | P | ZR-01 art. 45; ZR-03; ZR-61; ZR-82 | FF-A, FF-P | F | — |
| WYM-60 | **Art. 46 — SCC:** właściwy moduł (2 — FF-A do procesora; 3 — FF-P do dalszego procesora), ocena skutków transferu (TIA) i środki uzupełniające; dowód zawarcia umów. | P, O | ZR-01 art. 46, art. 48; ZR-04; ZR-38; ZR-60 | FF-A, FF-P | F | Polityka deklaruje SCC: `polityka-prywatnosci/page.tsx:91,102,106,111` — umów brak w repo (ograniczenie dowodowe). |
| WYM-61 | **Art. 49:** wyjątki (zgoda, umowa) nie są podstawą stałych, powtarzalnych transferów do dostawców. | P, O | ZR-01 art. 49; ZR-52 | FF-A | F | — |
| WYM-62 | **Modele AI dostawcy** (wsparcie, OCR, kategoryzacja, FLO): dalszy procesor zaakceptowany przez klienta (WYM-43); podstawa transferu (WYM-59/60); brak trenowania na danych klienta (warunki handlowe — ODCZYT, ZR-80); retencja i lokalizacja u dostawcy z DPA (nieodczytane); informacja dla użytkowników (art. 13); od 2.08.2026 informacja o interakcji z systemem AI w czacie wsparcia (AI Act art. 50 ust. 1 — termin do potwierdzenia). | P, O, I | ZR-01 art. 13, 28, 44–46; ZR-80; ZR-06; ZR-56 | FF-A, FF-P | F, C | Użycie: `lib/support/chat.ts`, `lib/ocr/engine.ts:149`, `lib/categorization/ai-classifier.ts`, `lib/flo/llm.ts` (konsumenci `lib/anthropic/client.ts`). Polityka: „nie są przechowywane przez Anthropic” — `polityka-prywatnosci/page.tsx:106-108` (do potwierdzenia w DPA). |

### 3.9. Urządzenie końcowe i marketing elektroniczny (C)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-63 | **Art. 5 ust. 3 dyr. 2002/58 / art. 399 PKE:** zapis informacji lub dostęp do informacji w urządzeniu końcowym (cookies, `localStorage`, `sessionStorage`, IndexedDB, identyfikatory w skryptach i pikselach) wymaga uprzedniej jasnej informacji i zgody, poza zapisem lub dostępem niezbędnym do transmisji albo do usługi wyraźnie żądanej przez użytkownika. Dotyczy informacji niezależnie od tego, czy są danymi osobowymi. „Niezbędność” uzasadniona **per technologia**: ciasteczka sesji logowania (niezbędne); zapis decyzji o zgodzie w `localStorage` (zwolnienie dla zapamiętania wyboru — interpretacja wg ZR-53); preferencja motywu (interpretacja); PostHog (zgoda); SDK Sentry w przeglądarce i Turnstile — klasyfikacja do review. | P, O | ZR-02 art. 5 ust. 3; ZR-11 art. 399; ZR-34; ZR-53; ZR-62 | FF-A | C | Klucz zgody `ff_analytics_consent`: `lib/analytics/consent.ts:2,20,31`; PostHog przed zgodą w pamięci i wyłączony: `lib/analytics/init-posthog-browser.ts:29-31`; Turnstile w akcjach: `app/(auth)/register/actions.ts:14` (import `verifyTurnstile`), `app/(auth)/forgot-password/actions.ts`. Pomiar w przeglądarce — A4. |
| WYM-64 | **Art. 400 PKE / art. 4 pkt 11 i art. 7 RODO — wymogi zgody** na zapis i odczyt w urządzeniu: zgoda w rozumieniu RODO (treść art. 400 do potwierdzenia), możliwość wycofania w każdej chwili, wykazanie. | P | ZR-11 art. 400; ZR-01 art. 4 pkt 11, art. 7 | FF-A | C | jw. |
| WYM-65 | **Interfejs zgody bez zwodniczych wzorców:** równorzędna opcja odmowy na pierwszej warstwie, brak preselekcji, brak „zgody przez dalsze przeglądanie”, łatwy powrót do ustawień i wycofanie, brak blokowania treści za zgodą na analitykę. | O | ZR-40; ZR-35 (analogia); ZR-31 | FF-A | C | `components/analytics/consent-banner.tsx` (A4). |
| WYM-66 | **Marketing elektroniczny** (newsletter, e-maile promocyjne do użytkowników, treści promocyjne w wiadomościach usługowych): uprzednia zgoda adresata (art. 13 ust. 1 dyr. 2002/58; w PL art. 10 UŚUDE albo odpowiedni przepis PKE — **status do potwierdzenia**); wyjątek soft opt-in (art. 13 ust. 2 dyr.) — w PL niepewny; w każdej wiadomości prosta rezygnacja; oddzielenie wiadomości usługowych (KSeF, faktury, płatności, bezpieczeństwo) od marketingowych; dowód zgody (WYM-13). Potwierdzenie zapisu dwuetapowe (double opt-in) — praktyka (I). | P, O, I | ZR-02 art. 13; ZR-12 art. 10; ZR-11; ZR-01 art. 7, art. 21 ust. 2–3; ZR-21 (a) | FF-A | C | Zapis do newslettera bez potwierdzenia i bez wersji treści zgody: `app/actions/newsletter.ts:34-71`; preferencje i wypis: `lib/email/preferences.ts:88-101`. |
| WYM-67 | **Wiadomości wysyłane w imieniu klienta** do jego kontrahentów (wysyłka faktur, przypomnienia o płatności): FF działa jako procesor; treść nie powinna zawierać informacji handlowej FF bez podstawy (np. stopki promocyjnej) — interpretacja do review. | O, I | ZR-01 art. 28 ust. 10; ZR-12 art. 10 / ZR-11 | FF-P; K | C | Treści szablonów przypomnień nie sprawdzałem (zakres A1/A2). |

### 3.10. Retencja i usuwanie (E)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-68 | **Obowiązek przechowywania faktur i dokumentów podatkowych ciąży na kliencie (podatniku):** ustawa o VAT art. 112 i 112a; Ordynacja art. 70 § 1 i art. 86 § 1 (co do zasady 5 lat od końca roku, w którym upłynął termin płatności podatku; możliwe wydłużenie przez zawieszenie lub przerwanie biegu); ustawa o rachunkowości art. 74 (dla prowadzących księgi rachunkowe); KPiR. FF jako procesor przechowuje na polecenie klienta (interpretacja do review); produkt umożliwia klientowi wykonanie obowiązku (dostęp i eksport przez okres obowiązku, także po zakończeniu subskrypcji — model do decyzji). | P (dla K), O, I (dla FF) | ZR-13 art. 112, 112a; ZR-14 art. 70 § 1, art. 86 § 1; ZR-15 art. 74; ZR-16 | K; FF-P | E | Polityka: „Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)” — `polityka-prywatnosci/page.tsx:230`; wg wiedzy modelu art. 70 § 1 daje 5 lat, a 10 lat odpowiada okresowi przechowywania faktur w KSeF przez MF (WYM-69), który nie jest obowiązkiem FF. |
| WYM-69 | **KSeF:** faktury ustrukturyzowane przechowuje MF w KSeF (wg wiedzy modelu 10 lat od końca roku wystawienia; artykuł do potwierdzenia). Ocenić, czy i jak długo kopia w FF jest niezbędna do celu klienta (minimalizacja, ograniczenie przechowywania); osobno faktury nieprzesłane do KSeF (tryby awaryjne, środowisko testowe, dokumenty spoza KSeF). Przechowywanie faktur w formie elektronicznej poza Polską — warunki z art. 112a ustawy o VAT (ustępy do potwierdzenia); FF przechowuje dane w Niemczech. | P, O | ZR-13 (przepisy KSeF, art. 112a); ZR-01 art. 5 ust. 1 lit. c i e | K; FF-P | E | Lokalizacja: `AGENTS.md:22,89` (NBG1); wg PR #225 magazyn plików aplikacji na innym hoście tego samego regionu (deklaracja operatora). |
| WYM-70 | **FF jako administrator i podatnik:** własne faktury za subskrypcje i dowody rozliczeń — przechowywanie wg ustawy o VAT i Ordynacji (FF jako podatnik); dane konta i umowy po jej zakończeniu — tylko w zakresie i czasie potrzebnym do obrony roszczeń (KC art. 118) albo wykonania obowiązku prawnego; reszta usuwana. | P, O | ZR-13 art. 112; ZR-14 art. 70 § 1; ZR-17 art. 118; ZR-01 art. 6 ust. 1 lit. c i f, art. 17 ust. 3 lit. b i e | FF-A | E | Polityka: „Dane konta: do 30 dni po anulowaniu subskrypcji” — `polityka-prywatnosci/page.tsx:229`. |
| WYM-71 | **Harmonogram retencji per kategoria danych i per system** (baza, magazyn plików i archiwum, kolejki pg-boss, `audit_logs`, logi kontenerów, Sentry, PostHog, Resend, Stripe, kopie): okres, zdarzenie rozpoczynające bieg, podstawa, mechanizm usunięcia i dowód działania. Nie jeden okres dla całej aplikacji. | P, I | ZR-01 art. 5 ust. 1 lit. e, art. 13 ust. 2 lit. a, art. 30 ust. 1 lit. f, motyw 39 | FF-A, FF-P | E | Usuwanie plików faktur w magazynach: `lib/retention/invoice-files.ts:9-16`; logi audytu 12 miesięcy: `polityka-prywatnosci/page.tsx:215-218,231`. |
| WYM-72 | **Usunięcie a kopie zapasowe** (interpretacja, brak wiążącego źródła wprost): dane usunięte z systemów produkcyjnych mogą pozostać w kopiach do ich wygaśnięcia przez rotację, jeśli okres rotacji jest określony i krótki, kopie nie służą innym celom, dostęp jest ograniczony, a po odtworzeniu z kopii usunięcia są stosowane ponownie (lista usunięć); opisane w informacji dla osób i w umowie powierzenia. | O, I | ZR-01 art. 5 ust. 1 lit. e, art. 17, art. 32 ust. 1 lit. c; ZR-45 (status nieznany) | FF-A, FF-P | E | Wg PR #225: nocny `pg_dump` lokalnie, obrazy hosta 7 dni dla hosta bazy, planowana rotacja 7/4/12 (decyzja niewdrożona) — deklaracje operatora. |
| WYM-73 | **Rozróżnienie ścieżek:** usunięcie konta, ukrycie logiczne (soft delete), faktyczne usunięcie i anonimizacja — każda opisana, spójna z deklaracją i sprawdzalna testem. | P, I | ZR-01 art. 17, art. 5 ust. 1 lit. e | FF-A, FF-P | E | `lib/gdpr/deletion.ts`, `lib/gdpr/deletion-blockers.ts` (ocena w A2). |

### 3.11. Dokumentacja i dowody (G)

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Punkt zaczepienia / uwagi |
|---|---|---|---|---|---|---|
| WYM-74 | **Dokumenty z dowodem działania:** rejestry (WYM-48/49), procedury praw osób z ewidencją żądań i terminów, procedura naruszeń z rejestrem, harmonogram retencji z dowodem wykonania, przeglądy dostępów, ślady audytowe, testy uzasadnionego interesu, screening DPIA, ocena transferów. Istnienie dokumentu nie dowodzi wykonania procedury ani szkolenia. | P, S | ZR-01 art. 5 ust. 2, art. 24; ZR-70 CC2.2, CC4.1, CC5.3 | FF-A, FF-P | G | Ocena w A3. |

### 3.12. SOC 2 — wymagania na poziomie kategorii

Klasa **S** dla całej tabeli. Zakres badania SOC 2 wybiera organizacja
z biegłym; tu opisuję, co każda kategoria oznacza dla FF. Spełnienie
kryteriów nie jest automatycznym potwierdzeniem zgodności z RODO.

| ID | Wymaganie | Klasa | Źródło | Adresat | Obszar | Uwagi |
|---|---|---|---|---|---|---|
| WYM-SOC-1 | **Security** — kryteria wspólne CC1.1–CC9.2, obowiązkowe w każdym badaniu SOC 2: środowisko kontroli, komunikacja, ocena ryzyka, monitorowanie, działania kontrolne, dostęp logiczny i fizyczny, operacje (wykrywanie, incydenty, odtwarzanie), zarządzanie zmianami, ryzyko dostawców. Dla FF m.in. izolacja najemców, dostęp administracyjny do serwerów, CI i ochrona gałęzi `main`, sekrety. | S | ZR-70 CC1–CC9 | FF (organizacja usługowa) | SOC | `06-SOC2.md`. |
| WYM-SOC-2 | **Availability** — A1.1–A1.3: pojemność, ochrona środowiskowa, kopie i infrastruktura odtwarzania, testy planu odtwarzania. Dla FF: wysyłka KSeF w terminach, kopie poza hostem, test odtwarzania. | S | ZR-70 A1 | FF | SOC | Związek z WYM-51. |
| WYM-SOC-3 | **Processing Integrity** — PI1.1–PI1.5: specyfikacje danych, kontrola wejścia, przetwarzania, wyjścia i przechowywania. Dla FF: poprawność i kompletność wystawiania faktur, walidacja FA(3), wysyłka do KSeF, UPO, ponowienia bez duplikatów. | S | ZR-70 PI1 | FF | SOC | — |
| WYM-SOC-4 | **Confidentiality** — C1.1–C1.2: identyfikacja i ochrona informacji poufnych oraz ich usuwanie. Dla FF: dokumenty klientów, poświadczenia KSeF, klucze szyfrujące. | S | ZR-70 C1 | FF | SOC | Związek z WYM-71 – WYM-73. |
| WYM-SOC-5 | **Privacy** — P1.1–P8.1: informacja, wybór i zgoda, zbieranie, wykorzystanie, retencja i usuwanie, dostęp i korekta, ujawnianie i powiadamianie, jakość, monitorowanie i skargi. Logika kryteriów AICPA (zobowiązania organizacji) różni się od RODO (podstawy prawne, prawa osób). | S | ZR-70 P1–P8 | FF | SOC | Mapowanie na WYM-11 – WYM-29 w `06-SOC2.md`. |
| WYM-SOC-6 | **Opis systemu** wg DC 200 i decyzja o zakresie: które kategorie, które systemy, podprocesorzy włączeni czy wyłączeni (inclusive / carve-out), kontrole komplementarne po stronie klientów. Zakres naszego przeglądu (pięć kategorii) ≠ zakres ewentualnego badania. | S | ZR-71; ZR-72 | FF | SOC | — |
| WYM-SOC-7 | **Type 1 a Type 2:** Type 1 — projekt kontroli na dzień; Type 2 — skuteczność działania w okresie (dowody z całego okresu: przeglądy dostępów, zmiany, testy odtwarzania, obsługa incydentów). Raport wydaje niezależny CPA (AT-C 105/205); gotowość do badania nie jest raportem; brak „certyfikacji SOC 2”. | S | ZR-72; ZR-73; ZR-74 | FF | SOC | — |

Razem: 75 wymagań WYM-01 – WYM-75 i 7 wymagań WYM-SOC-1 – WYM-SOC-7.

## 4. Rozróżnienie P/O/S/I — zasady stosowania

| Klasa | Co to jest | Typowe źródła w rejestrze | Jak zapisywać w macierzy | Czego nie robić |
|---|---|---|---|---|
| **P** — obowiązek prawny | Obowiązek wynikający wprost z obowiązującego aktu, z wykładnią TSUE | ZR-01, ZR-03 – ZR-06, ZR-10 – ZR-17, ZR-20 (w zakresie art. 35 ust. 4), ZR-60 – ZR-64 | przepis + adresat („P dla K” albo „P dla FF”) | Nie przypisywać FF obowiązku, który ciąży na kliencie (np. przechowywanie faktur); nie traktować dyrektywy jako bezpośredniego źródła obowiązku FF — obowiązek wynika z ustawy krajowej |
| **O** — interpretacja organu | Sposób stosowania prawa przyjęty przez EROD/EDPB, WP29 (dokumenty zatwierdzone przez EDPB) albo Prezesa UODO | ZR-30 – ZR-57, ZR-21 | dokument + punkt; siła malejąco: wytyczne w wersji ostatecznej i dokumenty WP29 przyjęte przez EDPB → opinie z art. 64 → raporty (taskforce, CEF) → decyzje w indywidualnych sprawach | Nie podnosić O do rangi P; nie budować wymagań wyłącznie na dokumencie konsultacyjnym |
| **S** — kryterium SOC 2 | Kryterium AICPA, wiążące dopiero w badaniu SOC 2 albo gdy wymaga go umowa | ZR-70 – ZR-74 | identyfikator kryterium (np. CC6.3) | Nie traktować „points of focus” jako wymagań; nie twierdzić, że spełnienie S potwierdza RODO; nie ogłaszać „certyfikacji SOC 2” |
| **I** — praktyka inżynierska | Propozycja audytu, jak spełnić P/O/S w tej aplikacji | — (uzasadnienie w macierzy) | opis praktyki + do którego P/O/S prowadzi | Nie przedstawiać I jako obowiązku; dopuszczać równoważne alternatywy |

Zasady szczegółowe:

1. **Pierwsza litera jest główna.** „P, O” znaczy: obowiązek z przepisu,
   a interpretacja wskazuje sposób wykonania. „O, I” znaczy: brak
   przepisu wprost — wymaganie opiera się na interpretacji i praktyce.
2. **Obowiązek innego podmiotu.** Gdy obowiązek prawny ciąży na
   kliencie (np. przechowywanie faktur — WYM-68), dla FF jest to
   **O/I** — FF umożliwia klientowi wykonanie obowiązku przez umowę
   powierzenia i funkcje produktu. W macierzy zapisujemy „P (dla K)”.
3. **TSUE** to wiążąca wykładnia przepisu — liczy się do P, z podaniem
   sygnatury. **Komunikat Prezesa UODO z wykazem DPIA** wykonuje art. 35
   ust. 4 RODO, więc wymóg DPIA dla operacji z wykazu to P; ocena, czy
   konkretna operacja FF się w nim mieści, to O.
4. **Dokumenty konsultacyjne i projekty** (ZR-07, ZR-42, ZR-43, a do
   potwierdzenia statusu także ZR-45) nie tworzą samodzielnych wymagań.
   Mogą wspierać wymaganie wynikające z innego źródła i wtedy są
   oznaczone jako „kierunek”.
5. **Zobowiązania własne FF** (polityka prywatności, strona RODO,
   regulamin, przyszła umowa powierzenia) — nawet jeśli sama obietnica
   nie była wymagana prawem (np. „72 godziny” dla klienta), rozbieżność
   z praktyką narusza przejrzystość i rzetelność informacji (art. 5
   ust. 1 lit. a, art. 13) — klasa P (WYM-19).
6. **Weryfikacja NZ nie zmienia klasy, zmienia pewność.** Zmiany
   techniczne niezależne od brzmienia przepisu (kopia poza hostem,
   wyłączenie analityki do zgody, rejestr żądań) można zaczynać przed
   końcowym review. Treści prawne (klauzule, okresy retencji
   z podstawą, numery przepisów w polityce) — dopiero po potwierdzeniu
   brzmienia źródła.
7. **Konflikt źródeł:** P > O > S > I. Przy konflikcie interpretacji
   organu z praktyką rynkową (np. wzorce banerów) wybieramy O.
8. **Klasa to nie priorytet.** Ryzyko i kolejność ocenia macierz
   (`05-MACIERZ-WYMAGAN.md`), nie ten katalog.
9. **Stan wymagania** (potwierdzone / częściowe / brak /
   niezweryfikowane / nie dotyczy z uzasadnieniem) nadaje macierz na
   podstawie dowodów z kodu i konfiguracji; „nie znaleziono w repo” nie
   znaczy „nie istnieje”.

## 5. Niepewności i pytania do końcowego review prawnego

### 5.1. Niewiadome i ograniczenia

| ID | Niewiadoma | Skutek dla wniosków | Co odblokowuje |
|---|---|---|---|
| N-ZR-01 | Żadne źródło prawne, EDPB, UODO ani AICPA nie zostało odczytane online (sekcja 1.1) | Treść i numeracja przepisów pochodzą z pamięci modelu; nie wolno ich kopiować do polityki, regulaminu ani umowy bez sprawdzenia | Odczyt źródeł w końcowym review (lista w sekcji 2) |
| N-ZR-02 | Wersje i status wytycznych EDPB po 06.2026: wersja ostateczna Guidelines 2/2023 (data), status Guidelines 1/2024 i 01/2025, raport CEF 2025 (usuwanie) | Wymagania WYM-12, WYM-38, WYM-72 opierają się na źródłach o niepewnym statusie | Sprawdzenie rejestru dokumentów EDPB |
| N-ZR-03 | Oznaczenia publikatorów: PKE (Dz.U. 2024 poz. 1221), komunikat UODO (M.P. 2019 poz. 666), rozporządzenie o KPiR (Dz.U. 2019 poz. 2544), teksty jednolite ustaw | Cytowanie w dokumentach klienta | ISAP / Dziennik Ustaw |
| N-ZR-04 | Brzmienie art. 398–400 PKE, data wejścia w życie, zgoda przez ustawienia przeglądarki, organ właściwy (Prezes UKE; relacja do Prezesa UODO) | WYM-63 – WYM-66: brzmienie klauzuli zgody i ocena ryzyka sankcji | Odczyt PKE |
| N-ZR-05 | Status art. 10 UŚUDE po wejściu PKE (obowiązuje, zmieniony, uchylony) i organ egzekwujący zakaz niezamówionej informacji handlowej | WYM-66: podstawa wymogu zgody na marketing e-mail | Odczyt UŚUDE w ISAP (stan na 10.2026) |
| N-ZR-06 | Artykuł ustawy o VAT o 10-letnim przechowywaniu faktur w KSeF; ustępy art. 112a (przechowywanie poza krajem); harmonogram obowiązkowego KSeF | WYM-68, WYM-69: argumentacja okresu retencji i lokalizacji | Odczyt ustawy o VAT (tekst jednolity) |
| N-ZR-07 | Dalszy los sprawy T-553/23 (odwołanie do TSUE) | WYM-59: stabilność DPF jako podstawy transferów | curia.europa.eu |
| N-ZR-08 | Terminy AI Act (art. 50) po ewentualnych zmianach z pakietu „Digital Omnibus” | WYM-62: termin obowiązku informacyjnego w czacie | EUR-Lex |
| N-ZR-09 | Podmiot prawny operatora nieustalony — polityka i regulamin mają placeholder (`polityka-prywatnosci/page.tsx:20-21`, `regulamin/page.tsx:23`) | Wszystkie wymagania z adresatem FF-A zakładają istnienie administratora; liczba osób zatrudnionych (art. 30 ust. 5) nieznana | Decyzja właściciela (niewiadoma N-01 w `08-NIEWIADOME-I-REVIEW-PRAWNE.md`) |
| N-ZR-10 | Umowy z dostawcami: DPA Anthropic nieodczytane (link w ZR-80), pozostałe niedostępne | WYM-40, WYM-43, WYM-60, WYM-62 | `04-PROCESORZY-I-LOKALIZACJE.md`, panele dostawców |
| N-ZR-11 | Pełny tekst TSC 2017 (z points of focus 2022), DC 200, przewodnika SOC 2 i AT-C nieodczytany | Krótkie tytuły kryteriów (2.6a) to parafrazy; mapowanie w `06-SOC2.md` wymaga sprawdzenia identyfikatorów w oryginale | Licencjonowany dostęp do publikacji AICPA |
| N-ZR-12 | Materiały UODO poza ZR-20 i ZR-21 (poradniki, formularze) — model nie zna pewnie tytułów i wersji | Możliwe pominięcie krajowych wskazówek (np. o zgłaszaniu naruszeń) | Przegląd strony UODO w review |
| N-ZR-13 | Nie analizowano przepisów sektorowych spoza zadania (np. krajowe wdrożenie NIS2, przepisy KSeF o uprawnieniach i tokenach) | Prawdopodobnie bez wpływu na prywatność (FF jako mikropodmiot — do potwierdzenia) | Decyzja koordynatora, czy rozszerzać zakres |
| N-ZR-14 | Fakty z niescalonego PR #225 przyjęto ze streszczenia w briefie koordynatora, bez odczytu plików gałęzi i bez dostępu do produkcji | Punkty zaczepienia w WYM-34, WYM-51, WYM-72 mają poziom „deklaracja operatora” | Weryfikacja w `02`/`04`/A3 albo pomiar na produkcji |

### 5.2. Pytania do końcowego review prawnego

Proponowane interpretacje są **robocze** — nie są zatwierdzonymi
faktami.

| ID | Pytanie | Proponowana interpretacja (robocza) | WYM |
|---|---|---|---|
| Q-ZR-01 | Czy FF jako procesor może, albo musi, przechowywać faktury klienta po zakończeniu umowy? Czy obowiązki podatnika (ustawa o VAT art. 112, Ordynacja art. 86) to „prawo nakazujące przechowywanie” w rozumieniu art. 28 ust. 3 lit. g? | Nie — obowiązek ma podatnik. FF przechowuje tylko na polecenie klienta (np. archiwum w umowie), z prawem wyboru zwrotu albo usunięcia i z określonym końcem okresu. | WYM-45, WYM-68 |
| Q-ZR-02 | Jaki okres i jaką podstawę wpisać w polityce zamiast „Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)” (`polityka-prywatnosci/page.tsx:230`)? Czy kopia w FF jest niezbędna, skoro MF przechowuje faktury w KSeF? | Rozdzielić: (a) okres obowiązku klienta (co do zasady 5 lat od końca roku płatności podatku, z możliwym wydłużeniem); (b) okres przechowywania przez FF na polecenie klienta; (c) KSeF jako odrębne repozytorium MF. Nie powoływać art. 70 § 1 jako źródła 10 lat. | WYM-19, WYM-68, WYM-69 |
| Q-ZR-03 | Czy przechowywanie przez FF elektronicznych kopii faktur w Niemczech nakłada na klienta obowiązki z art. 112a ustawy o VAT (zawiadomienie, dostęp online) i czy FF powinien o tym informować? | Do ustalenia; jeśli tak — informacja w regulaminie i zapewnienie dostępu. | WYM-69 |
| Q-ZR-04 | Brzmienie art. 399–400 PKE: czy zgoda może być wyrażona ustawieniami przeglądarki; organ i sankcje. | Stosować zgodę aktywną w banerze niezależnie od ustawień przeglądarki (ostrożnie). | WYM-63, WYM-64 |
| Q-ZR-05 | Marketing e-mail po PKE: art. 10 UŚUDE czy przepis PKE; czy w PL istnieje odpowiednik soft opt-in; czy wymóg zgody obejmuje adresy firmowe osób prawnych. | Zgoda uprzednia dla każdego newslettera i e-maila promocyjnego; bez soft opt-in do czasu potwierdzenia. | WYM-66 |
| Q-ZR-06 | Które technologie są „niezbędne”: preferencja motywu, zapis decyzji o zgodzie w `localStorage`, SDK Sentry w przeglądarce, Turnstile? Czy analityka serwerowa bez odczytu z urządzenia końcowego może opierać się na art. 6 ust. 1 lit. f bez zgody z PKE? | Sesja i zapis zgody — niezbędne; motyw — prawdopodobnie niezbędny (funkcja żądana przez użytkownika); Sentry w przeglądarce i Turnstile — do oceny; analityka serwerowa — możliwa na lit. f, jeśli nie korzysta z identyfikatorów z urządzenia i ma test uzasadnionego interesu. | WYM-12, WYM-63 |
| Q-ZR-07 | Role: Stripe (administrator czy procesor dla danych płatniczych), Google (logowanie OAuth), biuro rachunkowe wobec klienta (czy FF jest procesorem obu), MF (KSeF). | Stripe i Google — co najmniej częściowo odrębni administratorzy; MF — odrębny administrator; biuro — do oceny per umowa klienta. | WYM-01, WYM-39 |
| Q-ZR-08 | Wiadomości do kontrahentów klienta (faktury, przypomnienia): kto jest administratorem i nadawcą; czy oznaczenie FF w treści to informacja handlowa. | Klient — administrator i nadawca; FF — procesor; bez treści promocyjnych FF. | WYM-67 |
| Q-ZR-09 | Przypadkowe dane z art. 9 w treści faktur (np. usługi medyczne): czy umowa powierzenia dla klientów z sektora zdrowia wymaga szczególnych postanowień? | Ogólne postanowienie w DPA o możliwych danych szczególnych kategorii i środkach; bez osobnego produktu. | WYM-16 |
| Q-ZR-10 | Czy działalność FF może być uznana za „regularne i systematyczne monitorowanie na dużą skalę” (obowiązek IOD)? | Nie — główna działalność to przetwarzanie dokumentów, nie monitorowanie zachowań; udokumentować analizę. | WYM-57 |
| Q-ZR-11 | Czy przetwarzanie z użyciem modeli językowych (OCR, kategoryzacja, wsparcie) na danych finansowych spełnia ≥ 2 kryteria WP248 lub mieści się w wykazie UODO? | Ostrożnie: przeprowadzić DPIA dla przetwarzania z użyciem LLM; dla pozostałych operacji udokumentowany screening. | WYM-55 |
| Q-ZR-12 | Jaki termin zawiadomienia klienta o naruszeniu wpisać w umowie powierzenia (art. 33 ust. 2)? Czy obietnica „72 godzin” (`rodo/page.tsx:61-65`) jest wystarczająca? | Krótszy termin niż 72 h (praktyka rynkowa: 24–48 h od stwierdzenia — klasa I) i informacja przyrostowa. | WYM-53 |
| Q-ZR-13 | Czy usuwanie danych z kopii zapasowych przez rotację (bez edycji kopii) jest akceptowalne i jaki maksymalny okres rotacji? | Tak, przy krótkiej, opisanej rotacji i ponownym zastosowaniu usunięć po odtworzeniu. | WYM-72 |
| Q-ZR-14 | AI Act: czy FF jest „dostawcą” systemu AI (czat wsparcia na modelu dostawcy) czy „podmiotem stosującym”; zakres i termin art. 50 ust. 1. | Informacja w interfejsie czatu, że odpowiada system AI — niezależnie od kwalifikacji (niski koszt). | WYM-62 |
| Q-ZR-15 | Czy wyjątek z art. 30 ust. 5 RODO na pewno nie ma zastosowania do FF? | Nie ma — przetwarzanie ciągłe. | WYM-48, WYM-49 |
| Q-ZR-16 | Czy dane JDG na fakturach (imię i nazwisko, NIP, adres) są zawsze danymi osobowymi — stanowisko UODO i sądów polskich? | Tak, gdy odnoszą się do zidentyfikowanej osoby fizycznej. | WYM-02 |
| Q-ZR-17 | Relacja prawa do sprostowania (art. 16) do przepisów o korekcie faktur. | Sprostowanie danych na wystawionej fakturze — tylko przez korektę zgodną z ustawą o VAT; dane konta i kartoteki kontrahenta — bezpośrednio. | WYM-23 |
| Q-ZR-18 | Numer przepisu ustawy o ochronie danych osobowych o zawiadomieniu Prezesa UODO o IOD i termin. | Wg wiedzy modelu 14 dni — do potwierdzenia. | WYM-57 |

## 6. Co sprawdziłem / czego nie

**Sprawdziłem (10.10.2026):**

- Brief koordynatora (z ADDENDUM 1 i 2), `00-ZADANIE.md`,
  `01-STAN-I-GRANICE.md` — w całości.
- Dostęp do źródeł pierwotnych: 7 prób zakończonych 403 na proxy,
  1 udana (sekcja 1.1).
- Treść `https://www.anthropic.com/legal/commercial-terms` (wersja
  „Effective June 17, 2025”): sekcje B (brak trenowania na treściach
  klienta) i C (DPA włączone przez odesłanie) — ZR-80.
- Wersję kodu: `3e5e00d` jest przodkiem `HEAD`, a różnica obejmuje
  tylko pliki audytu (`git merge-base --is-ancestor`,
  `git diff --stat 3e5e00d HEAD`).
- Wszystkie miejsca w kodzie cytowane w kolumnach „Zastosowanie”
  i „Punkt zaczepienia” — odczytane w tej sesji (m.in.
  `app/(marketing)/legal/{polityka-prywatnosci,regulamin,rodo}/page.tsx`,
  `lib/analytics/{consent,privacy,init-posthog-browser}.ts`,
  `app/actions/newsletter.ts`, `00059_newsletter_subscribers.sql`,
  `00009_retention.sql`, `lib/retention/invoice-files.ts`,
  `lib/jobs/runners/retention-delete.ts`, `lib/gdpr/deletion.ts`,
  `lib/email/preferences.ts`, `app/api/portal/exports/generate/route.ts`,
  konsumentów `lib/anthropic/client.ts`).

**Nie sprawdziłem / nie mogłem sprawdzić:**

- Treści żadnego aktu prawnego, wytycznych EDPB/WP29, materiałów UODO,
  orzeczeń ani publikacji AICPA — egress zablokowany; bez WebSearch.
- Anthropic Data Processing Addendum (link w ZR-80) — poza zakresem
  tego pliku (`04-PROCESORZY`); listy DPF; dokumentacji pozostałych
  dostawców.
- Plików niescalonego PR #225 — fakty z niego przyjąłem ze streszczenia
  koordynatora (N-ZR-14).
- **Stanu** wymagań — katalog go nie ocenia; ocena należy do macierzy
  i plików A1–A4. W szczególności nie sprawdzałem: mechanizmu
  ograniczenia przetwarzania (art. 18), decyzji zautomatyzowanych
  (art. 22), treści szablonów wiadomości do kontrahentów, zachowania
  banera i sieci w przeglądarce, rejestrów i procedur poza repo.
- Produkcji, paneli dostawców i umów — brak dostępu.
- Niezależnej recenzji tego pliku — wykonuje ją R2 (autor nie
  zatwierdza własnego etapu).

Poza tym plikiem nie zmieniałem niczego w repo; nie commitowałem i nie
pushowałem.
