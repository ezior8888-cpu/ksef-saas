# 05 — Macierz wymagań (analiza luk)

| | |
|---|---|
| Etap | Analiza luk — macierz z pkt 7 zadania: ID wymagania → źródło → stan → dowód → luka → ryzyko → zmiana → test → zależność |
| Autor | agent MACIERZ (subagent koordynatora) |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza zawiera to scalenie; poza `docs/audyt/` brak różnic względem `3e5e00d` — `git diff --stat 3e5e00d HEAD` z wyłączeniem `docs/audyt` pusty, sprawdzone 13.10.2026) |
| Zakres | Każde wymaganie z katalogu `03-REJESTR-ZRODEL.md` § 3 (WYM-01 – WYM-75, WYM-SOC-1 – WYM-SOC-7) z oceną stanu na podstawie ustaleń raportów etapu badania; 3 wymagania dodatkowe WYM-X; pokrycie wszystkich 159 ustaleń; podsumowanie. Kolumnę „Etap planu” wypełnił agent PLAN 13.10.2026 z pól „Pokrywa” kart `07` (zgodność 85/85 — sprawdzone przez R5a) **[R5a]** |
| Źródła | `00-ZADANIE.md`; `01-STAN-I-GRANICE.md`; `02-INWENTARZ-I-PRZEPLYWY.md` (INW); `03-REJESTR-ZRODEL.md` (ZR, WYM, Q-ZR); `04-PROCESORZY-I-LOKALIZACJE.md` (PRC); `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` (MIN, ZGD); `A2-MECHANIZMY-PRAWA-RETENCJA.md` (PRA, RET, AI); `A3-DOWODY-I-TESTY.md` (DOW, L, T); `A4-TEST-COOKIES-I-SIECI.md` (RUN); `06-SOC2.md` (SOC); recenzje R1–R4 (scratchpad koordynatora); kontrolne odczyty kodu na `3e5e00d` (sekcja 14) |
| Ograniczenia | Brak dostępu do produkcji, paneli i umów dostawców. Fakty runtime z niescalonego PR #225 to pomiar lub deklaracja operatora, niezweryfikowane w tej sesji ([PR225]). Wszystkie przepisy i wytyczne — z pamięci modelu, niezweryfikowane online (egress zablokowany, WebSearch odrzucony przez właściciela) — oznaczenie [NZ] obowiązuje dla całej kolumny „Źródło”, poza ZR-80 (odczyt online). Macierz nie jest opinią prawną; okresy retencji, podstawy prawne i treść umów zależą od decyzji i końcowego review prawnego. Niezależna recenzja: R5a (13.10.2026) — „zatwierdzony z uwagami”; uwagi naniesione, zob. „Historia recenzji” na końcu **[R5a]** |

## 1. Jak czytać macierz

**Recenzje raportów wejściowych.** Wszystkie raporty mają naniesione
recenzje: `02` — R1 (11.10); `03`, `04` — R2 runda 1 i 2 (11.10, 13.10);
`A1`, `A2`, `A4` — R3 (13.10); `A3`, `06` — R4 (13.10); `01` — R1 i R4.
Pliki recenzji w scratchpadzie zawierają uwagi R1-U01–U24, R2-U01–U36,
R3-U01–U23, R4-U01–U32; historie recenzji raportów wymieniają je jako
przyjęte (R4-U07 i R4-U12 — częściowo, z uzasadnieniem w `A3`). Wyjątek
formalny: tabela historii `01` wymienia tylko R4, ale uwagi R1-U01–U10 do
`01` są w treści naniesione (sprawdzone 13.10 po frazach z poprawek:
„74 strony”, „132 pliki”, „Dryf wersji”, wiersz „Środowiska”, „27 cronów”,
`agent.yml:15`). Uwag nienaniesionych nie znalazłem, więc macierz opiera
się na raportach w obecnym brzmieniu.

**Kolumny.**

| Kolumna | Znaczenie |
|---|---|
| ID | identyfikator z katalogu `03` § 3; WYM-X-NN — wymaganie dodane w tej macierzy (sekcja 10) |
| Wymaganie (skrót) | skrót treści z katalogu; w nawiasie obszar dodatkowy, jeśli katalog podaje dwa |
| Klasa | **P** obowiązek prawny, **O** interpretacja organu, **S** kryterium SOC 2, **I** praktyka inżynierska; pierwsza litera główna (zasady `03` § 4) |
| Źródło | identyfikator z rejestru `03` § 2 (ZR-NN) i przepis albo punkt; wszystko [NZ] poza ZR-80 |
| Adresat | **FF-A** — FaktFlow jako administrator; **FF-P** — FaktFlow jako procesor klienta; **K** — klient (podatnik, administrator danych w swoich dokumentach) |
| Stan | wyłącznie: **potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy** (z uzasadnieniem). „Brak” przy dokumentach znaczy „nie znaleziono w repo”, chyba że dopisano inaczej — „nie znaleziono” ≠ „nie istnieje” (N-DOW-01) |
| Dowód | `ścieżka:linia` na `3e5e00d` i ID ustaleń z raportów; [PR225] — pomiar/deklaracja operatora z niescalonego PR #225 |
| Luka | czego brakuje względem wymagania |
| Ryzyko | skala z sekcji 1.1, w formacie „obecne: X; K1: Y — uzasadnienie” |
| Zmiana | propozycja (I) do planu — nie decyzja; tam, gdzie treść zależy od prawa, wpisana jest zależność, nie gotowe brzmienie |
| Test | jak sprawdzić po zmianie; T-NN — testy proponowane w `A3` § 5; „uprząż A4” — `narzedzia/uruchom-test-runtime.sh` (`A4` § 6) |
| Zależność | N-… — niewiadome z raportów (N-01 z `01` § 5; N-INW z `02`; N-ZR z `03`; N-PRC z `04`; NA1 z `A1`; N-A2 z `A2`; N-DOW z `A3`; NS z `06`); Q-ZR z `03` § 5.2; QA1 z `A1`; P-NN z `A3` § 9; „`02` pyt. n”, „`A2` pyt. n”, „`04` pyt. n”, „`A4` pyt. n”, „`06` pyt. n” — numerowane pytania do review w tych raportach; inne WYM |
| Etap planu | etapy z `07-PLAN-ETAPOW.md`, które pokrywają wymaganie (E-00 pominięty — to wejście, nie realizacja) **[R5a]** |

Skróty ścieżek: `polityka-prywatnosci/page.tsx`, `rodo/page.tsx`,
`regulamin/page.tsx` = `app/(marketing)/legal/<nazwa>/page.tsx`;
`00052…sql` itp. = `supabase/migrations/00052_….sql`.

Grupowanie: tabele według **pierwszego** obszaru z katalogu (`03` § 3,
kolumna „Obszar”): A, B, C, D, E, F, G i SOC.

### 1.1. Skala ryzyka

Ryzyko łączy trzy czynniki: **wpływ na osoby**, których dane dotyczą
(rodzaj danych, liczba osób, odwracalność skutku), **prawdopodobieństwo**
(czy luka działa przy normalnym użyciu, czy wymaga zdarzenia) oraz
**ekspozycję prawną lub umowną** (czy obowiązek jest wprost niespełniony,
czy publiczna deklaracja jest nieprawdziwa, czy luka blokuje sprzedaż B2B).

| Poziom | Kiedy |
|---|---|
| **W — wysokie** | skutek znaczący dla osób (ujawnienie identyfikatorów, danych finansowych lub poświadczeń; dane wracają albo zostają po usunięciu; utrata danych) i prawdopodobny przy normalnym działaniu; albo obowiązek prawny lub publiczna deklaracja wprost niespełnione, z realną ekspozycją (skarga, kontrola, roszczenie klienta, warunek umowy B2B) |
| **Ś — średnie** | skutek ograniczony (dane pseudonimowe, mała skala, wąska grupa) albo zależny od zdarzenia (incydent, pierwsza kampania, pierwszy termin retencji); albo obowiązek niespełniony częściowo, z prostą naprawą |
| **N — niskie** | dane publiczne lub techniczne, mechanizm uśpiony lub bez danych osobowych, mała ekspozycja |

Każde ryzyko ma dwie wartości:

- **obecne** — przy deklaracji z PR #225: produkcja bez prawdziwych
  klientów i z `KSEF_ENV=test`. To **deklaracja operatora,
  niezweryfikowana** (N-PRC-10); publiczne strony prawne i rejestracja
  działają niezależnie od niej. Jeśli deklaracja jest nieprawdziwa,
  obowiązuje wartość K1;
- **K1** — od pierwszego prawdziwego klienta (dane prawdziwych
  kontrahentów, faktury w KSeF PROD).

Raporty wejściowe stosowały różne punkty odniesienia (`02`, `A1`, `A2` —
stan obecny; `04` — stan po starcie sprzedaży; `A3`, `06` — osoby i usługa
oraz gotowość do badania SOC 2). Przy rozbieżności poziomów rozstrzygam
według tej skali i zapisuję to w sekcji 12.3.

## 2. Macierz — obszar A (inwentarz i klasyfikacja)

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-01 | Role ustalone osobno dla każdej operacji (FF-A, FF-P, MF jako odrębny administrator; Stripe, Google, biuro rachunkowe do oceny) | P, O | ZR-01 art. 4 pkt 7–8, art. 28 ust. 10; ZR-32 | FF-A | częściowe | mapa ról per operacja istnieje tylko jako materiał audytu (`02` § 4.1–4.3); polityka opisuje faktury i kontrahentów jak dane zbierane przez FF (`polityka-prywatnosci/page.tsx:34-42` — ZGD-02); otwarte role: wspólna pamięć rejestrów (INW-16), zaproszenia, czat, notatki operatora (QA1-02) | brak przyjętego dokumentu ról; publiczne teksty przypisują FF rolę administratora danych z dokumentów klientów | obecne: Ś; K1: W — od roli zależą umowa powierzenia, obowiązki informacyjne i obsługa praw | przyjąć mapę z `02` § 4 po review jako część rejestrów (`09` § 1–2, szkic); politykę podzielić na część FF-A i informację o roli FF-P | przegląd dokumentu: każda operacja z `02` § 4 ma rolę i datę decyzji; T-20 (strony prawne nie przypisują FF danych kontrahentów jako administratorowi) | N-01; Q-ZR-07; QA1-02; `02` pyt. 1, 3, 13 | E-59 |
| WYM-02 | Dane JDG (imię i nazwisko, NIP, adres) i osób kontaktowych traktowane jako dane osobowe | P, O | ZR-01 art. 4 pkt 1, motyw 14 | FF-A, FF-P | częściowe | inwentarz traktuje je jako dane osobowe (`02` § 1); mechanizmy nie: NIP i nazwa sprzedawcy w prompcie AI (`lib/categorization/ai-classifier.ts:42-50` — AI-01), nazwy organizacji ujawniane po NIP (`components/onboarding/actions.ts:94-117` — MIN-03), brak praw dla kontrahentów (PRA-09) | klasyfikacja nie przekłada się na minimalizację i prawa osób w danych klientów | obecne: N; K1: Ś — skutki opisane w WYM-05, WYM-06, WYM-44 | zapisać kwalifikację w rejestrach i umowie powierzenia; konsekwencje wdrożyć w wymaganiach zależnych | pokrywają testy wymagań zależnych (kontrakt promptu AI — WYM-42; MIN-03 — WYM-33) | Q-ZR-16 | E-59 |
| WYM-03 | Inwentarz: kategorie osób, danych i celów; źródło, przepływ, magazyny, odbiorcy, dostęp, retencja — per operacja | P (pośrednio), I | ZR-01 art. 30, art. 5 ust. 2 | FF-A, FF-P | częściowe | inwentarz z kodu: `02` § 2–5 (70 tabel `public`, magazyny poza bazą); niezbadane: schemat `auth.*` GoTrue (N-INW-01), logi `_supabase` (N-INW-15, N-A2-12), zawartość S3 (N-INW-05), magazyny historyczne (N-INW-16) | inwentarz jest artefaktem audytu, nie utrzymywanym rejestrem; luki w magazynach runtime | obecne: Ś; K1: Ś — bez inwentarza nie ma rejestrów ani harmonogramu retencji | utrzymywać inwentarz jako dane w repo, aktualizowane w PR zmieniającym schemat; uzupełnić niewiadome odczytem operatora | T-01 (każda kolumna wskazująca osobę jest w eksporcie albo na liście wyłączeń), T-08 (każda tabela z danymi osobowymi ma wpis retencji) — czerwone przy nowej kolumnie bez wpisu | N-INW-01, N-INW-05, N-INW-15, N-INW-16; WYM-48 | E-40, E-59, E-76 |
| WYM-16 | Art. 8–10: „nie dotyczy” z uzasadnieniem; ryzyko przypadkowych danych z art. 9 w treści faktur, OCR i czatu ujęte w ocenie ryzyka (obszar dodatkowy B) | P, I | ZR-01 art. 8–10, art. 32 | FF-A, FF-P | częściowe | art. 8: regulamin wymaga pełnoletności (`regulamin/page.tsx:56`, wg `03`); ryzyko art. 9 rozpoznane w screeningu (`A3` § 6.1, kryterium 4); DPA Anthropic deklaruje brak danych szczególnych (`04` § 7 pyt. 2, DOK-3 Schedule 1 B.3) | brak udokumentowanej oceny art. 8–10; sprzeczność między możliwymi danymi z art. 9 w OCR a deklaracją w DPA dostawcy | obecne: N; K1: Ś — dokumenty kosztowe (np. usługi medyczne) trafiają do modelu poza EOG | zapis „nie dotyczy” dla art. 8 i 10 z uzasadnieniem w rejestrze; postanowienie o możliwych danych szczególnych w umowie powierzenia; informacja przy OCR (WYM-62) | przegląd dokumentu; test UI informacji przy OCR (WYM-62) | Q-ZR-09; `04` pyt. 2; WYM-55 | E-12, E-59, E-60, E-62 |
| WYM-39 | Art. 26: ocena współadministrowania (klient–biuro w module księgowej; FF–dostawca analityki); wstępnie nie dotyczy | P, O | ZR-01 art. 26; ZR-32 | FF-A | niezweryfikowane | ocena nie została wykonana w żadnym raporcie; propozycje ról dla biura i Stripe/Google tylko jako pytania (`02` § 4.3, Q-ZR-07); moduł: `00010_accountant_access.sql`, `00011_accountant_access_token_optional.sql` | brak udokumentowanej oceny, więc nie można uznać „nie dotyczy” | obecne: N; K1: N — wstępnie brak wspólnego ustalania celów | jeden akapit oceny w rejestrze czynności (moduł księgowej, analityka) | przegląd dokumentu | Q-ZR-07; `02` pyt. 13 | E-59 |

## 3. Macierz — obszar B (minimalizacja i ustawienia domyślne)

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-05 | Ograniczenie celu: dane z dokumentów klienta tylko do usługi — nie do analityki treści, marketingu FF ani trenowania modeli; dalsze cele FF-A po teście zgodności | P | ZR-01 art. 5 ust. 1 lit. b, art. 6 ust. 4, art. 28 ust. 10 | FF-A, FF-P | częściowe | allowlista analityki odrzuca numer dokumentu przekazywany przez wywołanie (`lib/jobs/runners/submit-invoice.ts:1933-1940`, `lib/analytics/privacy.ts:28-123` — MIN-08); wspólna pamięć wyników rejestrów dla wszystkich klientów (`00022…sql:58-59` — INW-16); warunki handlowe Anthropic bez trenowania (ZR-80), ale nie wiadomo, czy konto je obejmuje (PRC-06); agenci AI z wyciągami z produkcji mogą działać na planach konsumenckich (PRC-07, DOK-9) | brak udokumentowanych granic celu; wspólna pamięć między klientami; warunki dostawców AI niepotwierdzone | obecne: Ś; K1: W — dane kontrahentów klientów mogłyby służyć celom FF lub dostawcy | lista celów w umowie powierzenia; odczyt `validation_cache` tylko przez serwer w kontekście organizacji albo LIA; potwierdzenie warunków komercyjnych dla Anthropic i agentów; wywołania `trackServer` bez pól dokumentu | T-12 (kanarki w telemetrii); test jednostkowy: wywołania `trackServer` nie przekazują pól dokumentu; test kontraktu promptu AI (WYM-42) | N-PRC-01, N-PRC-07; `02` pyt. 2, 3; QA1-02 | E-02, E-11, E-27, E-33, E-62 |
| WYM-06 | Minimalizacja: pola, odpowiedzi API, eksporty, logi i zdarzenia ograniczone do niezbędnych | P | ZR-01 art. 5 ust. 1 lit. c | FF-A, FF-P | częściowe | dobre wzorce: portal księgowej czyta tylko potrzebne kolumny (`lib/accountant/load-accountant-portal.ts:70`); luki: `select('*')` w 16 miejscach, m.in. `app/(dashboard)/settings/audit/page.tsx:34-38` (MIN-04); pole imienia wymagane w formularzu (`app/(auth)/register/page.tsx:110-119` — MIN-02); payloady pg-boss z pełnym obiektem faktury (`lib/jobs/events.ts:59-80` — INW-08); pełny obiekt faktury Stripe (`lib/stripe/event-mapping.ts:446` — INW-12); NIP w prompcie (`ai-classifier.ts:46-52` — AI-01); e-maile osób trzecich w `audit_logs.metadata` (`A3` L8, DOW-09) | brak zasady „tylko potrzebne kolumny i pola”; zbędne kopie danych w kolejce, audycie i payloadach | obecne: Ś; K1: Ś — pojedyncze nadmiary, dane w obrębie tej samej organizacji (PESEL osobno — WYM-X-03) | jawne listy kolumn dla komponentów klienckich; payloady jobów z identyfikatorami (po ocenie wpływu na idempotencję KSeF); przycinanie payloadu Stripe; identyfikatory zamiast e-maili w audycie; prompt bez NIP; pole imienia opcjonalne | reguła lint/test na `select('*')` w `app/**/page.tsx`; T-19 (audyt bez jawnych e-maili osób trzecich); T-12, T-13 | decyzja o payloadach jobów (INW-08); P-06 | E-11, E-15, E-30, E-32, E-34, E-39, E-48 |
| WYM-09 | Integralność i poufność: izolacja najemców, szyfrowanie, kopie, kontrola dostępu administracyjnego (obszar dodatkowy SOC) | P | ZR-01 art. 5 ust. 1 lit. f, art. 32 | FF-A, FF-P | częściowe | RLS na 70/70 tabel `public` (`01` § 3, ADR 0001); poświadczenia KSeF AES-256-GCM (`lib/ksef/credentials-crypto.ts:10-89` — MIN-10); luki: test RLS na bazie nie jest kontrolą wymaganą i nie obejmuje 14 tabel z danymi osobowymi (DOW-12, DOW-15, SOC-03); proxy telemetrii przekazuje dostawcom ciasteczka sesji (`next.config.ts:140-155,189` — RUN-08); lokalne zrzuty nieszyfrowane (INW-04, SOC-30) | ochrona techniczna aplikacji silna, ale bez wymuszenia testów izolacji, z wyciekiem poświadczeń do telemetrii i bez szyfrowania kopii | obecne: W — ciasteczka sesji u dostawców telemetrii (RUN-08), pozostałe elementy Ś; K1: W — szczegóły w WYM-36, WYM-50, WYM-51 | zob. WYM-36 (proxy), WYM-50 (szyfrowanie), WYM-51 (kopie), WYM-SOC-1 (wymagany test RLS) | T-14, T-15; uprząż A4 krok `e3` (brak nagłówka `cookie` w żądaniu do dostawcy) | WYM-36, WYM-50, WYM-51 | E-05, E-53, E-70 |
| WYM-31 | Art. 25 ust. 1: ochrona danych w projektowaniu; każda nowa funkcja przetwarzająca dane przechodzi listę kontrolną z dowodem | P, O | ZR-01 art. 25 ust. 1, motyw 78; ZR-30 | FF-A (FF-P pośrednio) | częściowe | szablon PR nie ma pola o wpływie na dane osobowe (`.github/pull_request_template.md:3-34` — sekcje bez takiego pola; sprawdzone 13.10.2026, zgodne z `A3` § 3.1); dobre wzorce: test-strażnik nieaktywnego modelu FLO (`tests/unit/flo-nieaktywne.test.ts:22-41` — AI-04), zielone testy prywatności (DOW-16); martwy kod z danymi osobowymi gotowy do włączenia (MIN-12), kolumny pod profilowanie bez oceny (INW-13) | brak stałej listy kontrolnej prywatności w procesie zmian; funkcje mogą zostać włączone bez oceny | obecne: Ś; K1: Ś — dotyczy przyszłych zmian, nie konkretnego przetwarzania dziś | sekcja „dane osobowe” w szablonie PR (cel, pola, odbiorca, retencja, informacja); testy-strażniki dla martwego kodu i kolumn profilujących albo ich usunięcie | test-strażnik wzorem `flo-nieaktywne.test.ts` dla kolumn z INW-13 i modułów z MIN-12; kontrola obecności sekcji w opisie PR (I) | WYM-55 | E-37, E-76 |
| WYM-32 | Art. 25 ust. 2: domyślnie tylko dane niezbędne — ilość, zakres, okres, dostępność (analityka do zgody, krótkie retencje, najmniejsze uprawnienia ról) | P, O | ZR-01 art. 25 ust. 2; ZR-30 | FF-A (FF-P pośrednio) | częściowe | zgodne: PostHog dopiero po zgodzie, pamięć `memory` (RUN-01, RUN-02, `lib/analytics/init-posthog-browser.ts:13-38`); niezgodne: PESEL domyślnie w formularzu (`components/invoices/invoice-form.tsx:437,774` — MIN-01, sprawdzone 13.10), link księgowej 90 dni (MIN-06), marketing w modelu wypisu (ZGD-06), funkcje FLO domyślnie włączone (`lib/flo/flags.ts:39-91` — INW-10), kategoryzacja AI bez wyboru (AI-01), service worker każdemu odwiedzającemu (RUN-06), sesja 400 dni (ZGD-11), dziennik z IP widoczny dla wszystkich członków (`A3` L9, INW-09), brak retencji większości danych (INW-01) | wiele ustawień domyślnych poszerza zbieranie, okres lub dostępność | obecne: Ś; K1: W — ustawienia domyślne obejmują każdego nowego klienta | zmiana wartości domyślnych: „bez identyfikatora”, krótszy domyślny termin linku (propozycja `A1`: 30 dni — I, do decyzji), marketing opt-in, AI i FLO wg decyzji review, SW tylko w panelu, krótszy `maxAge`, dziennik z IP tylko dla właściciela | test komponentu: domyślny typ identyfikatora = brak; testy domyślnych wartości ustawień (link, kategorie e-mail, flagi FLO/AI); uprząż A4 scenariusz `a` | QA1-01, QA1-04, QA1-07, QA1-15; `A2` pyt. 7 | E-08, E-17, E-27, E-29, E-32, E-42, E-43, E-65 |
| WYM-33 | Art. 25 ust. 2 zd. ostatnie: dane domyślnie niedostępne nieokreślonej liczbie osób (linki z tokenem, pliki, wyszukiwanie) | P, O | ZR-01 art. 25 ust. 2; ZR-30 | FF-A, FF-P | częściowe | publicznego linku do faktury nie znaleziono (`app/api/invoices/[id]/pdf/route.ts:5,27` — MIN-06); link-okaziciel księgowej 90 dni, do 365 (`components/settings/accountant-list.tsx:147-150` — MIN-06); paczki z linkami 7 dni do adresów CC (`lib/jobs/runners/co-pilot-monthly.ts:486-494,563-579` — INW-19, RET-07); wyszukanie NIP ujawnia nazwy organizacji każdemu zalogowanemu (`components/onboarding/actions.ts:94-117` — MIN-03); `validation_cache` czytelne dla wszystkich zalogowanych (`00022…sql:58-59` — INW-16); polityka bucketów MinIO na produkcji nieodczytana | dostęp przez sam link, długie terminy, ujawnianie relacji klient–FaktFlow | obecne: Ś; K1: W — linki i paczki niosą pełne dane faktur | krótszy domyślny termin linku (propozycja `A1`: 30 dni — I) z przypomnieniem i powiązaniem z e-mailem; paczki przez portal; wynik wyszukania NIP bez nazw; `validation_cache` tylko przez serwer | test akcji `lookupNipAction` (brak nazw w odpowiedzi); test domyślnej ważności linku; RLS: `authenticated` nie czyta `validation_cache` | QA1-14, QA1-15; `02` pyt. 3 | E-31, E-33, E-43 |
| WYM-34 | Ustawienia po stronie dostawców nie poszerzają przetwarzania ponad kod i deklaracje; retencja u dostawców minimalna (obszar dodatkowy F) | O, I | ZR-01 art. 25 ust. 2, art. 28 ust. 1; ZR-30 | FF-A | brak | [PR225 @a72b567] (odczyt panelu 10.10): w projekcie PostHog replay, konsola i czasy sieci włączone, retencja nagrań 30 dni, 2 nagrania w cyklu rozliczeniowym — kod wyłącza nagrania (`init-posthog-browser.ts:37`) (PRC-09, MIN-08); opcja `ip: false` (`:52`) bez działania w SDK 1.374.3 — o IP decyduje nieodczytane ustawienie projektu (PRC-09, R2); śledzenie otwarć w Resend nieodczytane (PRC-11); retencja Sentry nieodczytana (PRC-16) | panel PostHog przeczy kodowi; pozostałe panele nieodczytane; brak rejestru ustawień z datą | obecne: Ś — 2 nagrania o nieznanym źródle; K1: W — nagranie utrwala tekst strony (faktury, kontrahenci), maskowane są tylko pola formularzy | ustalić źródło 2 nagrań i usunąć, jeśli zawierają dane osobowe; wyłączyć replay, konsolę, sieć, heatmapy; włączyć odrzucanie IP; usunąć martwe `ip: false`; rejestr ustawień dostawców z datą odczytu; miesięczne porównanie z kodem (SOC-05) | T-10 (kontrakt konfiguracji SDK + skrypt w `scripts/ops/` porównujący ustawienia projektu z kodem) | NA1-02, NA1-03, N-PRC-02, N-INW-08 | E-09 |
| WYM-35 | Dostęp personelu i wsparcia: need-to-know, upoważnienia, rejestr dostępu administracyjnego, brak domyślnego wglądu w treść dokumentów | P, S, I | ZR-01 art. 25 ust. 2, art. 29, art. 32 ust. 4; ZR-70 CC6.1–CC6.3 | FF-A, FF-P | częściowe | panel: allowlista `ADMIN_EMAILS` + potwierdzony adres + TOTP, bez impersonacji (`lib/auth/admin-guard.ts:13-53` — MIN-05); odczyty w `/admin` nielogowane (`A3` L4 — DOW-08, SOC-11, INW-15); akcje operatora zapisywane jako „system” (`app/admin/users/actions.ts:6,49,80,199` — `A3` L5); widok cyklu faktury pokazuje NIP nabywcy i treść błędów (`lib/admin/ksef-lifecycle.ts:334-358`); notatki operatora bez retencji i eksportu (`00045_admin_panel.sql:16-40`); brak przeglądów dostępu (DOW-05, SOC-07) | brak śladu odczytów; deklaracja „kto i kiedy uzyskał dostęp” (`rodo/page.tsx:39-40`) nieprawdziwa; brak przeglądu listy operatorów | obecne: Ś; K1: W — dostęp do danych wszystkich klientów bez śladu | `logAuditAdmin` dla odczytów (bez kopiowania danych) i akcji z tożsamością operatora, IP i UA; kwartalny przegląd `ADMIN_EMAILS` z zapisem; retencja i eksport notatek | T-16, T-17; protokół kwartalnego przeglądu (dowód S) | N-DOW-03, NA1-11, NS-03; P-09; WYM-47 | E-36, E-69 |
| WYM-36 | Logi, błędy, telemetria bez danych osobowych albo z minimalizacją; retencja i ograniczony dostęp | P, I | ZR-01 art. 5 ust. 1 lit. c i e, art. 25, art. 32, motywy 30, 49 | FF-A, FF-P | częściowe | Sentry: wspólny filtr, `sendDefaultPii: false`, `user` → `id` (`lib/observability/scrub.ts:4-79` — MIN-07, SEC-D-07 zamknięte w kodzie); logger aplikacji bez redakcji (`lib/observability/logger.ts:21-27`); worker maskuje tylko po nazwie pola (`lib/jobs/logger.ts:24-36`); proxy `/ingest` i `/monitoring` przekazuje dostawcom nagłówki z `Cookie` (RUN-08, runtime + kod); e-mail użytkownika do Slacka (`lib/support/support-actions.ts:76-83` — INW-08, PRC-12); UUID organizacji w alertach Telegram (`lib/jobs/runners/cert-expiry-alert.ts:227-237` — PRC-12); retencja logów Docker niewdrożona (decyzja 7 dni [PR225] — RET-10) | poświadczenia sesji poza systemem; brak redakcji w loggerze aplikacji; filtr nie łapie PESEL/NIP w treści; brak wdrożonej retencji logów | obecne: W — przekazanie ciasteczek sesji działa niezależnie od zgody (Sentry); K1: W | trasy `/ingest` i `/monitoring` przekazujące tylko treść i `content-type`; redakcja w loggerze aplikacji; wzorce PESEL/NIP w `scrubTelemetryText`; identyfikatory zamiast e-maili w Slacku; rotacja logów Docker | uprząż A4 krok `e3` z lokalnym odbiornikiem: brak `cookie`, `authorization`, `x-forwarded-*`; T-12, T-13 | N-INW-06, N-INW-07, N-A2-09, N-A2-12, NA1-03, NA1-04; `A4` pyt. 4 | E-05, E-06, E-15, E-16, E-41 |
| WYM-37 | Dane testowe: bez danych produkcyjnych w testach i środowiskach deweloperskich; prawdziwe dane nie trafiają do testowego KSeF | I, P | ZR-01 art. 5 ust. 1 lit. b–c, art. 32 | FF-P | częściowe | zasada fikcyjnego NIP w `AGENTS.md`; w testach 10 NIP z poprawną sumą kontrolną, w tym co najmniej jedna rzeczywista spółka, e-maile w realnych domenach (MIN-09); produkcja z `KSEF_ENV=test` [PR225], domyślne `?? 'test'` (`lib/jobs/runners/submit-invoice.ts:628`, `lib/invoices/ksef-submit-enqueue.ts:127` — sprawdzone 13.10; PRC-17, SOC-25); pomoc zakazuje prawdziwych danych w środowisku testowym (`content/help/srodowisko-testowe-ksef.mdx:19`); baza deweloperska w Supabase Cloud — zawartość nieznana (PRC-15); brak stagingu (SOC-06) | brak blokady startu przy niezgodnym środowisku KSeF; zasada fikcyjnych danych nieegzekwowana | obecne: N — wg deklaracji brak prawdziwych danych; K1: W — faktury z danymi nabywców w środowisku do prób | blokada startu aplikacji i workera, gdy produkcja i `KSEF_ENV` ≠ `production` (albo jawny „tryb pokazowy”); test-strażnik odrzucający NIP z poprawną sumą spoza listy; e-maile tylko `*.test`/`*.invalid`; potwierdzenie, że baza deweloperska ma dane syntetyczne | test jednostkowy strażnika startu (produkcja + `test` → błąd); test-strażnik NIP i domen e-mail w `tests/`, `e2e/`, `lib/xml/` | N-PRC-10, N-PRC-06, NA1-07; WYM-SOC-3 | E-10, E-38, E-57, E-77 |
| WYM-38 | Pseudonimizacja ≠ anonimizacja; klucze i tabele powiązań oddzielone i chronione (obszar dodatkowy E) | P, O | ZR-01 art. 4 pkt 5, motyw 26; ZR-54; ZR-43 (konsultacyjny — kierunek); ZR-69a | FF-A, FF-P | częściowe | „anonimizacja” audytu zeruje `user_id`, IP, UA i `metadata`, zostawia `tenant_id`, `entity_id`, `details_json` i wpisy zapisane przez innych (`00052…sql:95-121` — MIN-11; `A3` L10); polityka obiecuje „zanonimizowanie” (`polityka-prywatnosci/page.tsx:186,222`, sprawdzone 13.10); skróty SHA-256 bez soli dla IP i e-maili (`lib/rate-limit/index.ts:130-135`, `app/(auth)/forgot-password/actions.ts:48` — MIN-10, INW-16); wszystkie sekrety w zmiennych tej samej aplikacji, bez KMS (MIN-10) | dane spseudonimizowane opisane jako zanonimizowane; skróty bez klucza; brak rozdzielenia kluczy | obecne: Ś; K1: Ś — przy JDG `tenant_id` + czas wskazują osobę | słowo „pseudonimizacja” w polityce albo pełniejsze czyszczenie (`details_json`, wzmianki w `metadata`); HMAC z osobnym kluczem zamiast gołego SHA-256; rejestr kluczy z właścicielem | test na bazie (`tests/rls-*`) sprawdzający wszystkie kolumny po `anonymize_user_audit_logs`; T-03 (część `details_json`) | QA1-13; `A2` pyt. 3; P-12; N-DOW-10 | E-20, E-35, E-63 |
| WYM-50 | Art. 32 ust. 1 lit. a–b i ust. 2: środki adekwatne do ryzyka, szyfrowanie w transmisji, w spoczynku i w kopiach, udokumentowana ocena ryzyka (obszar dodatkowy SOC) | P, S | ZR-01 art. 32 ust. 1–2, motyw 83; ZR-70 CC6, C1 | FF-A, FF-P | częściowe | szyfrowanie poświadczeń KSeF z rotacją przez `…_PREVIOUS` (MIN-10), ale rotacja planowa niewykonana i format v1 nadal czytany (`credentials-crypto.ts:24-25` — SOC-28); zrzuty i snapshot JSON bez szyfrowania (`scripts/hetzner/db-backup.sh:41,62-64` — INW-04, SOC-30); szyfrowanie dysków i MinIO niezweryfikowane, a strona RODO deklaruje „AES-256 (Supabase + R2)” (`rodo/page.tsx:23`); MinIO bez wsparcia producenta (PRC-13, DOK-12); brak rejestru ryzyk (SOC-15); MFA dla operacji wrażliwych za wyłączoną flagą (SOC-10); brak skanowania podatności (SOC-19); IP w dzienniku z nagłówka zależnego od klienta (INW-09); adres hosta bazy w publicznym pliku (DOW-19) | brak oceny ryzyka; kopie nieszyfrowane; deklaracja szyfrowania bez dowodu; komponent magazynu bez poprawek | obecne: Ś; K1: W — utrata lub ujawnienie kopii obejmuje wszystkie dane | szyfrowanie zrzutów i snapshotów; potwierdzenie szyfrowania w spoczynku z datą; rejestr ryzyk; rotacja klucza KSeF; decyzja o MinIO; wspólna funkcja IP; usunięcie pliku z DOW-19 z drzewa | odczyt konfiguracji z datą (dowód S); test skryptu kopii: wynik zaszyfrowany; T-15 | NA1-08, NS-08, NS-14, N-PRC-05; WYM-SOC-1, WYM-SOC-4 | E-35, E-38, E-53, E-56, E-74 |

## 4. Macierz — obszar C (podstawy, informacje, zgody, cookies)

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-04 | Zgodność z prawem, rzetelność, przejrzystość: każdy cel ma podstawę; brak przetwarzania nieopisanego w informacjach | P | ZR-01 art. 5 ust. 1 lit. a | FF-A | brak | brak mapy cel → podstawa (ZGD-01); przetwarzania nieopisane w polityce: profil w PostHog ze zdarzeń serwerowych (`lib/analytics/server.ts:7-38` — MIN-08), sesje i ślady Sentry w przeglądarce (RUN-04), Google Fonts (RUN-05), service worker (RUN-06), Slack i Telegram (PRC-12), FLO (INW-10), klasyfikacja AI i czat (ZGD-08, AI-05), agenci AI (PRC-07), przekierowanie odpowiedzi kontrahentów (INW-07) | część celów bez podstawy i bez informacji | obecne: Ś; K1: W — nierzetelność przetwarzania wobec wszystkich osób | mapa celów i podstaw (szkic `A1` „Tabela: cel → proponowana podstawa”) przyjęta po review; polityka opisująca każdy cel | T-20 (każdy cel i odbiorca z rejestru w kodzie jest opisany w polityce) | N-01; WYM-11, WYM-18 | E-59, E-63 |
| WYM-11 | Mapa cel → jedna podstawa z art. 6 ust. 1; zgoda tylko tam, gdzie wymaga jej prawo | P, O | ZR-01 art. 6 ust. 1, motyw 49; ZR-63; ZR-51 | FF-A | brak | polityka wymienia trzy podstawy bez przypisania do celów (`polityka-prywatnosci/page.tsx:58-72` — ZGD-01); lit. c dla faktur dotyczy obowiązku klienta, nie FF (ZGD-01, WYM-68); szkic 30 celów z proponowanymi podstawami — tylko w `A1` | brak przyjętej mapy; jedyna istniejąca wersja to propozycja audytu | obecne: Ś; K1: W — bez mapy nie da się napisać polityki, umowy ani obsłużyć sprzeciwu | przyjąć mapę po review (rejestr czynności `09` § 1); przenieść do polityki | przegląd dokumentu; T-20 | N-01; QA1-02, QA1-08; Q-ZR-06 | E-59 |
| WYM-12 | Dla celów na art. 6 ust. 1 lit. f — udokumentowany test (LIA), informacja o interesie, obsługa sprzeciwu (obszar dodatkowy G) | P, O | ZR-01 art. 6 ust. 1 lit. f, art. 13 ust. 1 lit. d, motyw 47; ZR-63; ZR-42 (konsultacyjny — kierunek) | FF-A | brak | 7 celów FF-A bez LIA (`A3` § 6.2 — DOW-20); polityka odsyła do „dokumentacji technicznej produktu” dla zdarzeń serwerowych (`polityka-prywatnosci/page.tsx:243-246`) — takiej LIA nie znaleziono (ZGD-01); sesje Sentry w przeglądarce bez uzasadnienia (RUN-04); analityka serwerowa bez sprzeciwu (MIN-08) | brak testów trzech kroków i mechanizmu sprzeciwu | obecne: Ś; K1: Ś — dotyczy danych pseudonimowych i bezpieczeństwa | LIA dla: bezpieczeństwa (IP/UA, limity), analityki serwerowej, Sentry, eskalacji do Slacka, wspólnej pamięci rejestrów, e-maili próbnych, wejść księgowej do portalu (szkice `09` § 4) | przegląd dokumentów; T-11, jeśli przyjęta podstawa wymaga honorowania odmowy | QA1-08; P-08; `A4` pyt. 1; N-ZR-02 | E-59 |
| WYM-13 | Dowód zgody: kto, kiedy, na jaką treść (wersja), jak, czy wycofał — newsletter i analityka | P, O | ZR-01 art. 7 ust. 1, motyw 42; ZR-31 | FF-A | brak | newsletter zapisuje e-mail, źródło i datę, bez wersji treści i potwierdzenia (`supabase/migrations/00059_newsletter_subscribers.sql:12-22`, `app/actions/newsletter.ts:65-71` — INW-14, ZGD-06); zgoda na analitykę tylko `granted`/`denied` w `localStorage`, bez daty i wersji (`lib/analytics/consent.ts:27-37` — ZGD-05, RUN-10 runtime) | nie da się wykazać, na jaką treść wyrażono zgodę, ani ponowić pytania po zmianie treści | obecne: N — newsletter uśpiony (formularze nieosadzone, MIN-12), analityka pseudonimowa; K1: Ś | zapis `{decyzja, wersja, data}` dla banera (opcjonalnie kopia na koncie); newsletter z wersją treści zgody i potwierdzeniem adresu | test jednostkowy formatu zapisu zgody; T-09 (zmiana wersji → baner wraca) | `A4` pyt. 6; QA1-04 | E-18, E-65 |
| WYM-14 | Wycofanie zgody w każdej chwili, tak łatwo jak udzielenie, ze skutkiem natychmiastowym (także u dostawcy wysyłki) | P, O | ZR-01 art. 7 ust. 3; ZR-31; ZR-21 (a) | FF-A | brak | brak kontrolki wycofania — baner widoczny tylko przy stanie `unset` (`components/analytics/consent-banner.tsx:28-40` — ZGD-05; potwierdzone runtime na 11 stronach — RUN-03); wycofanie nie wywołuje `posthog.reset()` (ZGD-05); `newsletter_subscribers.unsubscribed_at` nigdzie nie ustawiane (INW-14); wypis z kategorii e-mail działa (`app/api/email/unsubscribe/route.ts:130-177`), ale bez `EMAIL_UNSUBSCRIBE_SECRET` e-mail idzie bez nagłówka (`lib/email/send.ts:178-195` — ZGD-06) | jedyna droga wycofania analityki to czyszczenie danych witryny; newsletter bez wypisu | obecne: Ś; K1: Ś — wprost wymóg art. 7 ust. 3, prosta naprawa | link „Ustawienia prywatności” w stopce wszystkich układów i w `/settings`; przy wycofaniu `opt_out_capturing()` + `reset()`; wypis z newslettera; brak sekretu = brak wysyłki nietransakcyjnej | T-09 (zgoda → wycofanie kontrolką → zero żądań `/ingest`); uprząż A4 krok `d1` zastąpiony kliknięciem | NA1-10 | E-13, E-18 |
| WYM-15 | Zgoda dobrowolna, konkretna, świadoma, jednoznaczna; bez preselekcji; oddzielona od regulaminu; nie warunkuje usługi | P, O | ZR-01 art. 4 pkt 11, art. 7 ust. 2 i 4, motywy 32, 43; ZR-62; ZR-31 | FF-A | częściowe | baner: „Akceptuję” i „Tylko niezbędne” na pierwszej warstwie, „X” = odmowa, brak pól zaznaczonych (`consent-banner.tsx:60-84` — ZGD-05; RUN-01, RUN-02 runtime); treść bez okresu, bez informacji o powiązaniu z kontem i o wycofaniu (`consent-banner.tsx:47-57`); zgoda per przeglądarka obejmuje potem `identify` i grupę `tenant` (`components/analytics/analytics-identify.tsx:13-20`); marketing bez zgody — model wypisu (ZGD-06) | zgoda nie jest w pełni świadoma (zakres identyfikacji); marketing poza modelem zgody | obecne: N; K1: Ś | treść banera: okres, identyfikacja po zalogowaniu, sposób wycofania; marketing w modelu opt-in (WYM-66) | test treści banera (snapshot); T-09 | QA1-04; Q-ZR-05 | E-63, E-65 |
| WYM-17 | Art. 11, art. 12 ust. 1–2 i 6: forma informacji; ułatwianie praw (kanał w aplikacji i poza nią, także dla osób bez konta); proporcjonalna identyfikacja (obszar dodatkowy D) | P, O | ZR-01 art. 11, art. 12 ust. 1, 2, 6; ZR-47; ZR-33 | FF-A | częściowe | kanał e-mail w polityce (`polityka-prywatnosci/page.tsx:202`, sprawdzone 13.10); zaprojektowany kanał przyjęcia: worker poczty klasyfikuje wiadomości „RODO” i wysyła alarm bez treści (`ops/poczta/worker.mjs:15-16`, test `ops/poczta/worker.test.mjs` 6/6 — `A3` § 1.3, DOW-04); działanie na produkcji niezweryfikowane (N-DOW-09); poczta trafia do prywatnych skrzynek operatorów (`docs/runbooks/skrzynka-pomoc.md:16-17` — PRC-08); brak procedury identyfikacji i wyszukiwania (PRA-09) | kanał bez procedury, rejestru i kontroli dostępu; osoby bez konta bez ścieżki | obecne: Ś; K1: W — kontrahenci klientów to największa grupa osób (PRA-09) | skrzynka służbowa z umową powierzenia albo system zgłoszeń; procedura z identyfikacją proporcjonalną (szkic `09` § 8); formularz żądań w aplikacji | istniejący test workera + protokół próby procedury (żądanie syntetyczne od osoby bez konta, z datą) | N-DOW-09, N-A2-08, N-PRC-04, N-INW-09; P-11; `04` pyt. 11 | E-22, E-63, E-66 |
| WYM-18 | Art. 13: pełna informacja przy zbieraniu (tożsamość administratora, cele i podstawy, odbiorcy, transfery, okresy, prawa, wycofanie zgody, skarga) — rejestracja, logowanie Google, newsletter, kontakt, czat | P | ZR-01 art. 13 ust. 1–2; ZR-47 | FF-A | brak | administrator to placeholder (`polityka-prywatnosci/page.tsx:20-21`, `regulamin/page.tsx:23` — ZGD-03, DOW-02); odbiorcy nieaktualni i pominięci (PRC-01, INW-17); brak informacji przy zakładaniu konta Google z ekranu logowania (`app/(auth)/login/page.tsx:66,91` — ZGD-04); brak prawa wycofania zgody, sprzeciw pomylony z wycofaniem (`polityka-prywatnosci/page.tsx:199` — ZGD-03); czat i OCR bez informacji (ZGD-08) | osoby nie wiedzą, kto jest administratorem, kto dostaje dane i jak długo | obecne: W — publiczna polityka bez tożsamości administratora; K1: W | nowa polityka po ustaleniu podmiotu: cele i podstawy (WYM-11), odbiorcy z `04` § 3, okresy z decyzji retencji, prawa; informacja na ekranie logowania Google | T-20 (brak placeholderów, odbiorcy zgodni z rejestrem), T-21 (wersja i data) | N-01; WYM-11, WYM-71; Q-ZR-02 | E-63 |
| WYM-19 | Spójność deklaracji (polityka, strona RODO, regulamin, komunikaty UI) z faktycznym przetwarzaniem (obszar dodatkowy G) | P, O | ZR-01 art. 5 ust. 1 lit. a, art. 12–13; ZR-47 | FF-A | brak | sprawdzone 13.10: „Hetzner, Frankfurt” (`polityka-prywatnosci/page.tsx:76`), „Backup: AWS Glacier” (`:79`), Vercel (`:99`), Anthropic „nie są przechowywane” (`:106-108`), „zanonimizowane” (`:186,222`), „Faktury: 10 lat (art. 70 § 1 OP)” (`:230`), „Cookies sesji: do końca sesji” (`:232`), „Cookies preferencji: 1 rok” (`:233`); strona RODO: „Frankfurt (Hetzner, Vercel)” (`rodo/page.tsx:20`), „AES-256 (Supabase + R2)” (`:23`), „kto i kiedy uzyskał dostęp” (`:39`), „SCC z każdym” (`:43`), „Brak cookies analitycznych” (`:47`), „72 godzin (art. 33)” (`:64`); stan faktyczny: PRC-01–PRC-03, ZGD-11, ZGD-12, RUN-11, MIN-02, MIN-11, RET-13, PRA-01, PRA-04, DOW-18 | publiczne deklaracje sprzeczne z kodem i infrastrukturą, wszystkie oznaczone „✅” na stronie RODO | obecne: W — strony są publiczne i wprowadzają w błąd klientów wybierających procesora; K1: W | natychmiast: usunąć tezy absolutne i nieprawdziwe (stronę RODO zdjąć albo zastąpić faktami z datą weryfikacji); lista odbiorców z jednego źródła danych (PRC-01); docelowo nowa polityka (WYM-18) | T-20 (zakazane deklaracje dopuszczone tylko przy fladze potwierdzenia; okresy równe stałym w kodzie); uprząż A4 jako źródło tabeli technologii | N-01, N-PRC-01; QA1-11; `A2` pyt. 9 | E-01, E-63 |
| WYM-20 | Art. 14: informacja, gdy danych nie pozyskano od osoby — FF-A (zaproszeni, osoby kontaktowe); dla FF-P obowiązek klienta, FF ułatwia (wzór klauzuli) (obszar dodatkowy D) | P, O | ZR-01 art. 14 ust. 1–3, 5; ZR-47 | FF-A; K | brak | żadna wiadomość do osoby trzeciej nie wskazuje informacji o przetwarzaniu: faktura e-mailem — tylko „Wiadomość wysłana przez FaktFlow.” (`lib/email/send.ts:560-579`), przypomnienia (`lib/reminders/prepare-delivery.ts:97-110`), zaproszenia (`app/actions/organizations.ts:690-699`) — ZGD-09; brak wzoru klauzuli dla klientów | ani FF-A, ani wsparcie klienta jako administratora | obecne: N; K1: Ś — dotyczy nabywców, dłużników, zaproszonych i księgowych | stopka w wiadomościach do osób trzecich (nadawca = klient, FF na jego zlecenie, link do strony informacyjnej); wzór klauzuli art. 14 w centrum pomocy | test szablonów e-mail: stopka z linkiem w każdej wiadomości do osoby trzeciej | QA1-10; NA1-14 | E-64 |
| WYM-63 | Art. 5 ust. 3 dyr. 2002/58 / art. 399 PKE: zapis i odczyt w urządzeniu tylko za zgodą, poza ściśle niezbędnym; niezbędność uzasadniona per technologia | P, O | ZR-02 art. 5 ust. 3; ZR-11 art. 399; ZR-34; ZR-53; ZR-62 | FF-A | częściowe | potwierdzone runtime (build lokalny): 0 ciasteczek przed wyborem (RUN-01), PostHog dopiero po zgodzie (RUN-02); bez zgody: sesje, transakcje i błędy Sentry w przeglądarce (`instrumentation-client.ts:5-21` — RUN-04), arkusz Google Fonts na każdej pierwszej stronie (`app/layout.tsx:114-125`, sprawdzone 13.10 — RUN-05, PRC-10), service worker i Cache Storage każdemu odwiedzającemu (`next.config.ts:11-20`, `app/sw.ts:16-38` — RUN-06), Turnstile na logowaniu (RUN-09); ciasteczka sesji Supabase 400 dni (ZGD-11); możliwy piksel śledzący Resend (PRC-11); klasyfikacja technologii tylko jako szkic (`A1` „Tabela technologii”, `A4` § 4) | brak udokumentowanej klasyfikacji „ściśle niezbędne”; technologie analityczne i przekazanie IP do Google bez zgody | obecne: Ś; K1: Ś — dane pseudonimowe, ale przy każdej wizycie | samohostowanie Material Symbols i usunięcie hostów Google z CSP; SW rejestrowany tylko w panelu; sesje i `tracesSampleRate` Sentry w przeglądarce wyłączone przed zgodą albo całkiem; tabela technologii w polityce; wyłączone śledzenie w Resend | uprząż A4 scenariusz `a`: brak żądań do `fonts.googleapis.com`, brak rejestracji SW na stronach marketingowych, brak kopert `session` Sentry przed zgodą; T-09 | Q-ZR-04, Q-ZR-06; QA1-05, QA1-06, QA1-07, QA1-16; `A4` pyt. 1–3, 5; N-ZR-04 | E-06, E-07, E-08, E-42, E-63 |
| WYM-64 | Art. 400 PKE / art. 4 pkt 11 i art. 7 RODO: zgoda na zapis i odczyt w standardzie RODO, wycofywalna, wykazywalna | P | ZR-11 art. 400; ZR-01 art. 4 pkt 11, art. 7 | FF-A | częściowe | zgoda uprzednia i dobrowolna (RUN-01, RUN-02); bez wycofania (RUN-03) i bez dowodu (RUN-10) | dwa z trzech elementów zgody niespełnione | obecne: Ś; K1: Ś | jak WYM-13 i WYM-14 | T-09 | N-ZR-04; Q-ZR-04 | E-18 |
| WYM-65 | Interfejs zgody bez zwodniczych wzorców: równorzędna odmowa, brak preselekcji, brak zgody przez przeglądanie, łatwy powrót do ustawień, brak blokowania treści | O | ZR-40; ZR-35 (analogia); ZR-31 | FF-A | częściowe | spełnione: równorzędna odmowa, brak preselekcji, „X” = odmowa, brak blokowania treści (`consent-banner.tsx:60-84` — ZGD-05, RUN-01–RUN-03); niespełnione: powrót do ustawień (RUN-03); strona 404 bez linku do polityki (RUN-03); brak automatycznego testu banera w CI (DOW-14) | brak powrotu do ustawień; brak testu regresji | obecne: N; K1: Ś | kontrolka ustawień (WYM-14); test banera w CI | T-09 uruchamiany w CI na stronach publicznych | — | E-18 |
| WYM-66 | Marketing elektroniczny: uprzednia zgoda, rezygnacja w każdej wiadomości, oddzielenie wiadomości usługowych od marketingowych, dowód zgody; double opt-in (I) | P, O, I | ZR-02 art. 13; ZR-12 art. 10; ZR-11; ZR-01 art. 7, art. 21 ust. 2–3; ZR-21 (a) | FF-A | częściowe | model „brak wiersza = zapisany” także dla `marketing` (`lib/email/preferences.ts:3-8,40-56`); e-mail 8. dnia próby z treścią o cenie wysyłany każdemu jako `product_updates` (`lib/jobs/runners/email-sequence.ts:151-168`), bez linku wypisu w treści; nagłówek wypisu tylko przy ustawionym sekrecie (`lib/email/send.ts:178-195`) — ZGD-06; newsletter bez double opt-in i bez osadzonego formularza (INW-14, MIN-12); wysyłek w kategorii `marketing` nie znaleziono; działają: token HMAC, one-click, wypis po odbiciu (`app/api/email/unsubscribe/route.ts`, `app/api/email/resend-webhook/route.ts:171-230`) | brak uprzedniej zgody na treści handlowe; rezygnacja tylko w nagłówku | obecne: Ś — e-mail 8. dnia działa dziś; K1: Ś, rośnie do W przy pierwszej kampanii | `marketing` w modelu opt-in z zapisem wersji i daty; `canSendTo` bez wyjątku „brak userId” dla kategorii nietransakcyjnych; link wypisu w treści; brak sekretu = brak wysyłki; treść handlową z dnia 8 oddzielić albo objąć zgodą (decyzja review); newsletter z potwierdzeniem adresu | rozszerzony `maile-sekwencja-wypis.test.ts`; test `canSendTo('marketing')` bez wiersza zgody = odmowa | Q-ZR-05; QA1-03, QA1-04; P-08; N-ZR-05; NA1-10 | E-13, E-65 |
| WYM-67 | Wiadomości w imieniu klienta do jego kontrahentów: FF jako procesor; bez informacji handlowej FF | O, I | ZR-01 art. 28 ust. 10; ZR-12 art. 10 / ZR-11 | FF-P; K | częściowe | przypomnienia: wysyłka tylko z żetonem zatwierdzenia, Reply-To klienta (`lib/reminders/prepare-delivery.ts:85-94`, `lib/jobs/runners/send-reminder.ts:20-23` — ZGD-07); faktura e-mailem: Reply-To skrzynki FF (`lib/email/send.ts:197-200` — INW-07) i stopka „Wiadomość wysłana przez FaktFlow.” (ZGD-09); treści promocyjnych FF w szablonach nie znaleziono (szablony paczek księgowej niebadane — NA1-14) | odpowiedzi kontrahentów trafiają do FF zamiast do klienta; status stopki z nazwą FF do oceny | obecne: N; K1: Ś | Reply-To = adres klienta (jak w przypomnieniach) albo pole w ustawieniach organizacji; stopka o roli procesora (WYM-20) | test `sendInvoiceEmail`: `replyTo` = adres organizacji | Q-ZR-08; `02` pyt. 4; NA1-14 | E-14, E-64 |

## 5. Macierz — obszar D (prawa osób)

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-07 | Prawidłowość: poprawianie danych konta i kontrahentów; dane z rejestrów publicznych datowane i odświeżalne; zmiany na wystawionych fakturach tylko przez korektę (obszar dodatkowy B) | P, I | ZR-01 art. 5 ust. 1 lit. d; ZR-13 | FF-A, FF-P | częściowe | dane firmy i kontrahentów edytowalne (`app/actions/contractors.ts:24` — PRA-05); imienia i e-maila konta nie da się zmienić (brak `updateUser({ email })` — PRA-05); wyniki rejestrów z `expires_at` 24 h i nocnym odświeżaniem (`00022…sql:45,110-121`, `lib/jobs/runners/nightly-validation-recheck.ts:20-24` — `A2` E.1); faktury po wysyłce do KSeF niezmienne — korekta (PRA-05) | brak poprawiania danych tożsamości konta | obecne: N; K1: Ś — e-mail to identyfikator logowania i adres powiadomień | zmiana imienia i e-maila w ustawieniach (z potwierdzeniem nowego adresu przez GoTrue) | test akcji zmiany profilu; e2e na danych syntetycznych | Q-ZR-17; `A2` pyt. 4 | E-24 |
| WYM-21 | Dostęp (art. 15 ust. 1–2): potwierdzenie, dostęp do danych i informacje (cele, kategorie, odbiorcy, okres, źródło, prawa, transfery); jako procesor — pomoc klientowi | P, O | ZR-01 art. 15 ust. 1–2; ZR-33; ZR-44 | FF-A | częściowe | eksport JSON dla posiadacza konta (`app/api/gdpr/export/route.ts:12-47`, `lib/gdpr/data-collector.ts:148-257` — PRA-01); w pliku brak informacji z art. 15 ust. 1 lit. a–h; brak IP/UA z dziennika (`data-collector.ts:174-175`), notatek operatora, wpisów audytu o osobie, danych GoTrue i dostawców; osoby bez konta — brak narzędzia i procedury (PRA-09) | niepełny zakres dla osób z kontem; brak ścieżki dla osób bez konta | obecne: Ś; K1: W — osoby bez konta to największa grupa (PRA-09) | sekcja informacyjna w eksporcie; skrypt wyszukiwania osoby po e-mailu/NIP przez magazyny (dla operatora); procedura (WYM-17) | T-01; T-02; protokół próby wyszukiwania osoby syntetycznej | N-A2-06; `A2` pyt. 5, 8 | E-22, E-23, E-66 |
| WYM-22 | Kopia (art. 15 ust. 3–4): wierna, bezpłatna, elektroniczna, bez naruszenia praw innych, bezpieczne dostarczenie | P, O | ZR-01 art. 15 ust. 3–4; ZR-64; ZR-33 | FF-A | częściowe | dostarczenie bezpieczne (sesja + MFA, przycisk `settings/account/_components/gdpr-section.tsx:62-63` — PRA-01); limit 1000 wierszy na sekcję bez stronicowania; braki zakresu jak w WYM-21 | kopia niepełna; brak raportu przekroczenia limitu dla osoby | obecne: N; K1: Ś | stronicowanie albo plik ZIP; liczniki `coverage` widoczne w pliku | T-02 (osoba A widzi tylko swoje wiersze, zero wierszy B, zero skrótów tokenów; przekroczenie limitu raportowane) | `A2` pyt. 5 | E-23 |
| WYM-23 | Sprostowanie (art. 16): edycja danych konta i profilu; faktury — korekta wg VAT; uzupełnienie danych | P, O | ZR-01 art. 16; ZR-13 | FF-A; FF-P (pomoc) | częściowe | jak WYM-07 (PRA-05): kontrahenci i firma — tak; imię tylko przy rejestracji (`app/(auth)/register/actions.ts:70`); e-mail — nie | brak sprostowania tożsamości konta; brak opisu ścieżki korekty w polityce | obecne: N; K1: Ś | jak WYM-07; opis w polityce, że sprostowanie danych na fakturze to korekta | jak WYM-07 | Q-ZR-17; `A2` pyt. 4 | E-24, E-63 |
| WYM-24 | Usunięcie (art. 17): przesłanki i wyjątki stosowane wąsko; usunięcie we wszystkich systemach (baza, pliki, kolejki, logi, dostawcy, kopie); jako procesor — na polecenie klienta (obszar dodatkowy E) | P, O | ZR-01 art. 17 ust. 1, 3; ZR-45 | FF-A; FF-P | częściowe | ścieżka użytkownika działa w rdzeniu: 14 dni, cron co godzinę, pseudonimizacja audytu, `deleteUser` (`lib/gdpr/deletion.ts:97-125,163-210` — PRA-02, testy zielone DOW-16); ścieżka operatora przerywa się na wyzwalaczu append-only `audit_logs` po częściowych skutkach (`app/admin/users/actions.ts:133-217`, `00052…sql:16-41` — PRA-03, INW-02; potwierdzone na schemacie syntetycznym przez R1 i `A2`); zostają: czat (`00054…sql:43` — AI-03), e-mail/IP/UA w rejestrze żądań (RET-12), newsletter, odbicia, zaproszenia, pliki w S3 (T-06 czerwony), dane u dostawców (RET-10, DOW-18), kopie (RET-09), magazyny historyczne (PRC-15); wykonanie poza `audit_logs` (DOW-06); konta tylko z Google bez ponownego uwierzytelnienia hasłem (PRA-02) | niekompletne usunięcie; nieczynna ścieżka operatora, którą realizuje się żądania e-mailowe | obecne: W — deklarowany skutek nie następuje; K1: W | jedna funkcja usuwania dla użytkownika i operatora; zakres rozszerzony o czat, listy e-mail, pliki, dostawców; wpis audytu `gdpr.deletion_executed` bez danych osobowych; ponowne uwierzytelnienie dla kont Google; najpierw czerwony test na bazie | T-03, T-06; nowy test na bazie: usunięcie przez operatora konta z wpisem audytu kończy się sukcesem | N-A2-01, N-A2-02, N-A2-06, N-A2-07; `A2` pyt. 2, 3; WYM-73 | E-03, E-04, E-19, E-20, E-21 |
| WYM-25 | Ograniczenie przetwarzania (art. 18): oznaczenie i wstrzymanie przetwarzania danych osoby z informacją przed zniesieniem | P | ZR-01 art. 18 | FF-A; FF-P | brak | brak statusu „ograniczone” dla konta, kontrahenta i faktury (grep `restrict`/`ogranicz` — PRA-06); polityka deklaruje prawo (`polityka-prywatnosci/page.tsx:197`, sprawdzone 13.10) | prawo deklarowane bez mechanizmu i procedury | obecne: N; K1: Ś — żądania rzadkie, ale bez ścieżki | minimum: procedura ręczna + flaga wykluczająca rekord z jobów (przypomnienia, AI, FLO); decyzja o zakresie | test na bazie: rekord z flagą pomijany przez joby przypomnień i kategoryzacji | decyzja właściciela o zakresie mechanizmu | E-26 |
| WYM-26 | Powiadamianie odbiorców (art. 19) po sprostowaniu, usunięciu, ograniczeniu; na żądanie — informacja o odbiorcach (obszar dodatkowy F) | P | ZR-01 art. 19 | FF-A | brak | usunięcie nie dociera do PostHog, Sentry, Resend, Stripe (RET-10); ADR 0006 zapowiada anonimizację e-maila w Stripe — w kodzie brak (`docs/adr/0006-gdpr-14d-cooling-off.md:30`, `lib/gdpr/deletion-blockers.ts:8,19` — DOW-18); lista odbiorców w polityce nieaktualna (PRC-01) | brak propagacji do odbiorców i rzetelnej listy | obecne: N; K1: Ś | w jobie usuwania wywołania API dostawców (usunięcie osoby w PostHog, aktualizacja/usunięcie klienta w Stripe, kontakt w Resend) albo udokumentowany krok ręczny | test jednostkowy z atrapami klientów dostawców: usunięcie wywołuje każdy z nich | P-07; N-PRC-02 | E-21 |
| WYM-27 | Przenoszenie (art. 20): dane dostarczone przez osobę w formacie ustrukturyzowanym (JSON, CSV, XML FA(3)), bez naruszania praw innych | P, O | ZR-01 art. 20; ZR-49 | FF-A | częściowe | JSON konta (`data-collector.ts:245-248`); eksporty księgowe JPK, KPiR, CSV (`app/actions/exports.ts:93-99`); brak pełnego eksportu organizacji: kontrahenci, produkty, załączniki, XML/UPO zbiorczo (PRA-01, RET-11); polityka obiecuje „JSON / CSV / JPK_FA” (`polityka-prywatnosci/page.tsx:198`, sprawdzone 13.10) | dane faktycznie dostarczone przez osobę leżą w organizacji i nie mają kompletnego eksportu | obecne: N; K1: Ś | pełny eksport organizacji (ZIP: JSON/CSV + XML FA(3) + UPO) — wspólny z WYM-45 | test integracyjny: eksport organizacji obejmuje listę tabel i plików | WYM-45 | E-25 |
| WYM-28 | Sprzeciw (art. 21): wobec lit. f — zaprzestanie; marketing — bezwzględnie; informacja wyraźna i oddzielna (obszar dodatkowy C) | P | ZR-01 art. 21 ust. 1–4 | FF-A | częściowe | marketing: wypis per kategoria, one-click, po odbiciu (PRA-07, ZGD-06); newsletter bez wypisu (INW-14); lit. f (analityka serwerowa, audyt) — brak mechanizmu (PRA-07, MIN-08); polityka myli sprzeciw z wycofaniem zgody (`polityka-prywatnosci/page.tsx:199` — ZGD-03) | brak obsługi sprzeciwu wobec lit. f; brak oddzielnej informacji | obecne: N; K1: Ś | mechanizm sprzeciwu dla analityki serwerowej (wykluczenie profilu) po decyzji o podstawie (WYM-12); oddzielna informacja w polityce | T-11 | WYM-12; QA1-08 | E-13, E-27, E-65 |
| WYM-29 | Art. 22: ustalić i udokumentować brak decyzji wyłącznie zautomatyzowanych o skutkach prawnych | P, O | ZR-01 art. 22; ZR-50 | FF-A | częściowe **[R5a]** | ustalone w audycie: decyzji wyłącznie zautomatyzowanych nie znaleziono (PRA-08); wymaganie obejmuje też udokumentowanie oceny, którego brak, więc stan „częściowe”, nie „nie dotyczy” (spójnie z WYM-39) **[R5a]** — wynik AI zawsze `is_reviewed = false` (`lib/jobs/runners/auto-categorize-inbox.ts:409`), ocena kontrahenta `payment.score` zablokowana z powodów prawnych (`lib/flo/flags.ts:41-49`), wysyłki wymagają działania użytkownika (`A3` § 6.1 kryt. 2) | brak zapisu oceny w dokumentach; dwie funkcje wymagają oceny przed zmianą (próg AI, `payment.score`) | obecne: N; K1: N — Ś przy włączeniu `payment.score` | zapis „nie dotyczy” z uzasadnieniem w rejestrze; ocena (DPIA) jako warunek włączenia `payment.score` | test-strażnik: `payment.score` wyłączone, wynik AI z `is_reviewed = false` | `A2` pyt. 7; `02` pyt. 2; WYM-55 | E-28, E-59 |
| WYM-44 | Art. 28 ust. 3 lit. e–f: pomoc klientowi w prawach osób (wyszukanie, eksport, sprostowanie, usunięcie danych kontrahenta) i w art. 32–36 (obszar dodatkowy F) | P | ZR-01 art. 28 ust. 3 lit. e–f | FF-P | częściowe | narzędzia klienta: edycja i usuwanie kontrahenta, eksporty księgowe (PRA-10); brak kanału przekazania żądania osoby do klienta (PRA-10, PRA-09); brak pakietu materiałów do DPIA klienta (`A3` § 6.1) i ścieżki powiadomienia klientów o naruszeniu (DOW-03) | brak procedury i postanowień umownych | obecne: N; K1: Ś | postanowienie w umowie powierzenia z terminem przekazania; runbook „żądanie dotyczy danych klienta”; pakiet dla DPIA klienta (`09`) | protokół próby: żądanie syntetycznego kontrahenta przekazane klientowi w terminie | `A2` pyt. 8; WYM-41 | E-22, E-62, E-66 |
| WYM-75 | Art. 12 ust. 3–5: odpowiedź do miesiąca (przedłużenie z uzasadnieniem), odmowa z pouczeniem, bezpłatność; ewidencja daty wpływu | P | ZR-01 art. 12 ust. 3–5; ZR-33 | FF-A | częściowe | usunięcie po 14 dniach i cronie co godzinę mieści się w miesiącu (`lib/gdpr/deletion.ts:6,107`), eksport natychmiast (PRA-11); worker poczty dopisuje „termin ustawowy: 1 miesiąc” (`A3` § 1.3); brak rejestru żądań e-mailowych z datą wpływu (DOW-04, PRA-11); wykonanie usunięcia poza audytem i ślad znika po 12 miesiącach (DOW-06, RET-03) | brak ewidencji terminów i dowodu odpowiedzi | obecne: Ś; K1: Ś | rejestr żądań (data wpływu, identyfikacja, termin, odpowiedź), potwierdzenie wykonania dla osoby | test jednostkowy rejestru (termin = wpływ + 1 miesiąc); T-03 (wpis audytu wykonania) | P-11; `A2` pyt. 3 | E-04, E-22, E-66 |

## 6. Macierz — obszar E (retencja i usuwanie)

Okresów retencji ta macierz **nie ustala**. Tam, gdzie wymaganie zależy od
okresu, kolumna „Zależność” wskazuje decyzję lub pytanie do review.

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-08 | Ograniczenie przechowywania: każda kategoria ma okres albo kryterium; po upływie — usunięcie albo skuteczna anonimizacja | P | ZR-01 art. 5 ust. 1 lit. e, motyw 39 | FF-A, FF-P | brak | cztery działające reguły z wykonawcą (audyt 12 mies., log przebiegów 3 mies., `validation_cache`, przycinanie zdarzeń Stripe — `A2` E.0); bez reguły m.in.: kontrahenci, koszty, OCR, czat, newsletter, odbicia, zaproszenia, eksporty, importy, `flo_*`, rejestr żądań RODO, notatki operatora (INW-01, RET-05, RET-06, RET-12); pliki w S3 poza fakturami (INW-03) | większość kategorii bez okresu i bez wykonawcy | obecne: Ś — mało danych; K1: W — dane osób bez relacji z FF i treści swobodne zostają bezterminowo | rejestr retencji per tabela i magazyn (dane w repo) + jeden cron retencji z testem na bazie | T-08 (każda tabela z danymi osobowymi ma wpis: okres, zdarzenie początkowe, wykonawca albo „bez limitu” z podstawą); T-07 | Q-ZR-01, Q-ZR-02; `02` pyt. 5, 11; `A2` pyt. 1; N-01; WYM-71 | E-40, E-44, E-45, E-46, E-57 |
| WYM-45 | Art. 28 ust. 3 lit. g: po zakończeniu umowy zwrot albo usunięcie wszystkich danych i kopii, chyba że prawo nakazuje przechowywanie **FF**; przechowywanie tylko na polecenie klienta (obszar dodatkowy F) | P, O | ZR-01 art. 28 ust. 3 lit. g; ZR-32 | FF-P | brak | „Usuń organizację” (właściciel) i usunięcie przez operatora ustawiają `hard_delete_at`, którego nic nie czyta — sprawdzone 13.10: zapis tylko w `components/settings/account-actions.ts:62` i `app/admin/users/actions.ts:173` (PRA-04, RET-04, DOW-17, INW-02); organizacja „usunięta” dalej przetwarzana (skrzynka KSeF, AI — PRA-04, AI-01); brak pełnego eksportu przed odejściem (RET-11); `DELETE` faktur wysłanych do KSeF blokowany wyzwalaczem dla każdej roli (`00132…sql:63-73`, sprawdzone 13.10 — RET-02); domyślne `retention_years = 10` nieużywane (INW-18) | deklarowany skutek (UI: „nieodwracalna po 30 dniach”) nie następuje; brak zwrotu danych | obecne: W — UI obiecuje usunięcie, którego kod nie wykonuje; K1: W | od razu: filtr `deleted_at` w jobach i sesji, tekst UI zgodny z kodem; potem wykonawca `hard_delete_at` z rozdziałem: faktury wg decyzji o przechowywaniu vs reszta; pełny eksport przed odejściem | T-04, T-05, T-06; e2e: organizacja oznaczona jako usunięta nie jest przetwarzana (N-A2-10) | Q-ZR-01; `A2` pyt. 2; `02` pytanie R1 o usunięcie organizacji; N-A2-05, N-A2-13 | E-02, E-25, E-50, E-62 |
| WYM-51 | Art. 32 ust. 1 lit. c–d: szybkie przywrócenie dostępności (kopie poza hostem źródłowym), regularne testy odtwarzania (obszar dodatkowy SOC) | P, S, O | ZR-01 art. 32 ust. 1 lit. c–d; ZR-70 A1.2–A1.3, CC7.5; ZR-21 (c) | FF-A, FF-P | częściowe | nocny `pg_dump` lokalnie na hoście bazy, obrazy hosta dla `db-1`; brak pełnej kopii obu baz i MinIO aplikacji poza hostem, baza `_supabase` poza zrzutem ([PR225], F0-G09 FAIL — PRC-14, SOC-21); jedna deklarowana próba odtworzenia (01.10.2026, sama baza) bez surowego logu (`docs/runbooks/backup-restore.md:171` — DOW-22, SOC-22); ADR 0009 „Proposed” (`docs/adr/0009-pg-dump-na-db-1-i-storage-box.md:3`) | brak kopii poza hostem i cyklu prób | obecne: W — utrata hosta bazy albo magazynu = utrata danych; K1: W | wykonać decyzję 07.10 [PR225] (szyfrowana kopia obu baz, obu MinIO i sekretów poza hostami, rotacja 7/4/12); miesięczna próba odtworzenia z protokołem | TEST-07 [PR225] / protokół próby (data, zakres, czas, wynik); listing kopii zdalnych z sumami kontrolnymi | NS-05; Q-ZR-13; WYM-72 | E-53, E-54 |
| WYM-68 | Obowiązek przechowywania faktur ciąży na kliencie; FF przechowuje na polecenie; produkt umożliwia wykonanie obowiązku (dostęp i eksport) | P (dla K), O, I (dla FF) | ZR-13 art. 112, 112a; ZR-14 art. 70 § 1, art. 86 § 1; ZR-15 art. 74; ZR-16 | K; FF-P | brak | polityka: „Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)” jako obowiązek FF (`polityka-prywatnosci/page.tsx:230`, sprawdzone 13.10); wg wiedzy modelu art. 70 § 1 daje 5 lat [NZ]; implementacja: 2 lata do archiwum + 8 lat od dnia joba, zależna od zmiennych AWS (`lib/jobs/runners/archive-old-invoices.ts:22,100` — RET-01, INW-18); bez powiązania z poleceniem klienta; model dostępu po końcu subskrypcji nieustalony | okres bez podstawy, liczony od dnia joba, przypisany FF zamiast klientowi | obecne: N — mechanizm uśpiony (brak faktur starszych niż 2 lata); K1: Ś, W od pierwszego terminu usunięcia (RET-02) | decyzja review o okresie i roli; data usunięcia liczona deterministycznie z daty faktury i reguły; postanowienie w umowie powierzenia; planowanie usunięcia niezależne od archiwizacji | T-05; test jednostkowy wyliczenia daty usunięcia dla kilku dat faktury | Q-ZR-01, Q-ZR-02; `A2` pyt. 1; `02` pyt. 5; N-ZR-06; N-A2-03, N-A2-04 | E-51, E-62 |
| WYM-69 | KSeF: ocena, czy i jak długo kopia faktury w FF jest niezbędna (MF przechowuje w KSeF); faktury spoza KSeF; warunki przechowywania poza Polską (art. 112a) | P, O | ZR-13 (przepisy KSeF, art. 112a); ZR-01 art. 5 ust. 1 lit. c i e | K; FF-P | brak | oceny nie wykonano w żadnym raporcie (pytania Q-ZR-02, Q-ZR-03); dane w Niemczech (NBG1, `AGENTS.md`; magazyn plików wg [PR225] na innym hoście tego regionu) | brak udokumentowanej oceny niezbędności kopii i skutków art. 112a | obecne: N; K1: Ś | decyzja po review: okres kopii w FF, rozdzielenie faktur KSeF i spoza KSeF, ewentualna informacja dla klienta o art. 112a | przegląd dokumentu | Q-ZR-02, Q-ZR-03; N-ZR-06 | E-51 |
| WYM-70 | FF jako administrator i podatnik: własne faktury i rozliczenia wg przepisów podatkowych; dane konta po umowie tylko do roszczeń lub obowiązku; reszta usuwana | P, O | ZR-13 art. 112; ZR-14 art. 70 § 1; ZR-17 art. 118; ZR-01 art. 6 ust. 1 lit. c i f, art. 17 ust. 3 lit. b i e | FF-A | brak | polityka: „Dane konta: do 30 dni po anulowaniu subskrypcji” (`polityka-prywatnosci/page.tsx:229`) i regulamin „30 dni, po czym są permanentnie usuwane” (`regulamin/page.tsx:94-95`, wg `A3` § 1.1) — brak kodu (RET-13); faktury sprzedaży FF (Stripe) mają tę samą regułę co faktury klientów (`00079_stripe_vat_invoice_atomicity.sql:73-84` — `A2` E.1); pełny payload faktury Stripe bez przycinania (INW-12) | deklaracja bez wykonawcy; brak odrębnej reguły dla dokumentów FF jako podatnika | obecne: N; K1: Ś | decyzja o retencji konta po anulowaniu; job albo korekta tekstu; osobna reguła dla faktur FF | test na bazie joba po anulowaniu subskrypcji (jeśli wdrożony) albo T-20 (tekst zgodny ze stanem) | `A2` pyt. 9; P-07; N-01 | E-51, E-52 |
| WYM-71 | Harmonogram retencji per kategoria i per system (baza, pliki, archiwum, pg-boss, `audit_logs`, logi, Sentry, PostHog, Resend, Stripe, kopie): okres, zdarzenie początkowe, podstawa, mechanizm, dowód działania | P, I | ZR-01 art. 5 ust. 1 lit. e, art. 13 ust. 2 lit. a, art. 30 ust. 1 lit. f, motyw 39 | FF-A, FF-P | brak | rejestru w repo nie ma (T-08 czerwony); szkic tabeli w `A2` E.1; audyt: jeden okres 12 mies. dla wszystkich klas, sprzeczny z komentarzem „10 lat” (`00001…sql:174`), ADR 0006 i polityką [PR225] (RET-03, DOW-07, INW-09); pg-boss — reguły z biblioteki, nieudokumentowane (RET-08); logi Docker bez konfiguracji, decyzja 7 dni niewdrożona (RET-10); `_supabase` nieznane (N-A2-12); dostawcy tylko w panelach (RET-10); czat, FLO, rejestr żądań, zaproszenia — bez reguły (RET-12, AI-03); pliki (RET-06); linki (RET-07) | brak harmonogramu i dowodu wykonania; sprzeczne deklaracje okresów | obecne: Ś; K1: W | rejestr retencji jako dane w kodzie (wejście dla polityki i joba); klasy retencji audytu; rotacja logów Docker; zapis ustawień retencji dostawców z datą | T-08, T-07; protokół miesięcznego przebiegu retencji (liczby, bez danych) | decyzje `09` § 10; N-A2-09, N-A2-12, N-A2-14, N-INW-06; [PR225] `data-policy.md` (przyjęta, niewdrożona) | E-09, E-39, E-40, E-41, E-45, E-47, E-48 |
| WYM-72 | Usunięcie a kopie: krótka określona rotacja, kopie bez innych celów, ograniczony dostęp, ponowne zastosowanie usunięć po odtworzeniu; opis w informacji i umowie | I (O — do potwierdzenia statusu ZR-45) | ZR-01 art. 5 ust. 1 lit. e, art. 17, art. 32 ust. 1 lit. c; ZR-45 (status nieznany) | FF-A, FF-P | brak | runbook odtworzenia bez kroku ponowienia usunięć (`docs/runbooks/backup-restore.md:89-124` — INW-04, RET-09); snapshot pomija `gdpr_deletion_requests` (`lib/backup/snapshot-tables.ts:15-20`); rotacja 14 zrzutów (`scripts/hetzner/db-backup.sh:17,41`), snapshot 30/56 dni (`lib/jobs/runners/cleanup-old-backups.ts:20-21`), obrazy 7 [PR225] — nieopisane dla osób; zrzuty lokalnie nieszyfrowane | po odtworzeniu usunięte dane wracają bez śladu | obecne: Ś; K1: W | dziennik wykonanych usunięć poza kopiowaną bazą (albo w każdej kopii z procedurą ponowienia); krok w runbooku; opis rotacji w polityce i umowie | próba odtworzenia obejmuje sprawdzenie: konta usunięte po dacie zrzutu nie istnieją po procedurze | Q-ZR-13; `A2` pyt. 6; `02` pyt. 8; N-ZR-02 | E-53, E-55, E-63 |
| WYM-73 | Rozróżnienie ścieżek: usunięcie konta, ukrycie logiczne, faktyczne usunięcie, anonimizacja — opisane, spójne z deklaracją, sprawdzalne testem | P, I | ZR-01 art. 17, art. 5 ust. 1 lit. e | FF-A, FF-P | częściowe | ścieżka użytkownika opisana (ADR 0006) i testowana (DOW-16); organizacja — tylko znacznik (PRA-04); ścieżka operatora nieczynna (PRA-03); „anonimizacja” to pseudonimizacja (MIN-11); usuwanie faktur: pliki przed wierszem, a wiersz blokowany wyzwalaczem (`lib/jobs/runners/retention-delete.ts:48-51,78-81`, `00132…sql:63-73` — RET-02, INW-18) | ścieżki niespójne; po pierwszym terminie retencji pliki znikną, a wiersze zostaną | obecne: W — trzy ścieżki dają trzy różne wyniki; K1: W | jeden moduł usuwania z udokumentowanymi stanami; usuwanie plików po udanym usunięciu wiersza; ścieżka serwisowa w wyzwalaczu albo zerowanie danych osobowych zamiast `DELETE` (decyzja) | T-03, T-04, T-05, T-06 | WYM-24, WYM-45; `A2` pyt. 1 (ostatnie zdanie), pyt. 10 | E-02, E-03, E-50, E-51 |

## 7. Macierz — obszar F (procesorzy, lokalizacje, transfery)

Treści umów z dostawcami nie znamy (N-PRC-01). Stan „brak” znaczy tu
„nie znaleziono w repo ani w odczytanych dokumentach” — nie „nie istnieje”.

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-40 | Art. 28 ust. 1: tylko dostawcy z wystarczającymi gwarancjami; udokumentowana ocena (umowa, lokalizacje, retencja, dalsi procesorzy, certyfikaty) całego łańcucha | P, O | ZR-01 art. 28 ust. 1, motyw 81; ZR-41 | FF-A, FF-P | brak | brak rejestru umów i dostawców w repo; stan poza repo nieznany (PRC-04, SOC-18); raportów SOC 2/ISO dostawców nie zebrano (DOW-21); MinIO bez wsparcia producenta (PRC-13); skrzynki pomocy na kontach prywatnych (PRC-08); konta dostawców możliwe na osobę fizyczną (PRC-04, N-01) | nie wiadomo, z kim i na jakich warunkach zawarto umowy | obecne: Ś; K1: W — bez rejestru nie powstanie lista dalszych procesorów ani TIA | prywatny rejestr dostawców (podmiot umowy, plan, region, wersja i data DPA, mechanizm transferu, dalsi procesorzy, retencja, właściciel, data przeglądu) — start z `04` § 1 i § 3; przegląd roczny | protokół przeglądu rejestru; test porównujący publiczną listę z rejestrem (WYM-43) | N-PRC-01, N-PRC-09, N-PRC-11, NS-09, N-DOW-05; N-01 | E-61 |
| WYM-41 | Art. 28 ust. 3: umowa powierzenia z każdym klientem przy rejestracji (np. jako część regulaminu), z elementami lit. a–h (obszar dodatkowy G) | P, O | ZR-01 art. 28 ust. 3, 9; ZR-32; ZR-05 (wzór) | FF-P | brak | regulamin bez postanowień o powierzeniu (`regulamin/page.tsx:88-100`, grep „powierz” — 0 — ZGD-02, PRC-05); DPA „na życzenie” e-mailem (`rodo/page.tsx:54-58`); wzoru umowy brak w repo (`A3` § 1.1) | brak instrumentu prawnego wobec klientów | obecne: Ś — brak klientów; K1: W — każdy klient jest administratorem danych kontrahentów | umowa powierzenia jako załącznik regulaminu (szkielet `09` § 6, klauzule ZR-05), akceptacja z wersją (WYM-X-01) | T-20/T-21 (strona umowy istnieje, ma wersję); test zapisu akceptacji wersji | N-01; Q-ZR-01, Q-ZR-12; `04` pyt. 3 | E-62 |
| WYM-42 | Art. 28 ust. 3 lit. a i ust. 10: tylko na udokumentowane polecenie klienta (także transfery); własne cele FF wymagają odrębnej podstawy (obszar dodatkowy B) | P | ZR-01 art. 28 ust. 3 lit. a, ust. 10 | FF-P | częściowe | zgodne: przypomnienia tylko z żetonem zatwierdzenia klienta (`lib/jobs/runners/send-reminder.ts:20-23` — ZGD-07); niezgodne: automatyczna klasyfikacja AI faktur kosztowych bez wyboru organizacji (`lib/categorization/index.ts:69-76` — AI-01, PRC-06, INW-06); odpowiedzi kontrahentów do skrzynki FF (`lib/email/send.ts:197-200` — INW-07); funkcje FLO domyślnie włączone (INW-10); wspólna pamięć rejestrów (INW-16) | przetwarzania nieobjęte poleceniem klienta ani umową | obecne: Ś; K1: W — dane kontrahentów do dostawcy z USA bez wiedzy klienta | przełącznik organizacji „kategoryzacja AI” (domyślna wartość z review); Reply-To klienta; w umowie lista przetwarzań wykonywanych na polecenie (weryfikacja w rejestrach, FLO, AI) | test: przy wyłączonym przełączniku kategoryzacja nie woła modelu; test `replyTo`; test kontraktu promptu (bez NIP) | `04` pyt. 1; `02` pyt. 1, 2, 4; QA1-02 | E-14, E-17, E-62 |
| WYM-43 | Art. 28 ust. 2 i 4: dalsi procesorzy — zgoda klienta, informowanie o zmianach z prawem sprzeciwu, aktualna lista, te same obowiązki w umowach | P, O | ZR-01 art. 28 ust. 2, 4; ZR-41 | FF-P | brak | brak listy dla klientów i mechanizmu powiadomień (PRC-05); lista w polityce to informacja FF-A i jest nieaktualna (`polityka-prywatnosci/page.tsx:81-120` — PRC-01); projekt listy w `04` § 3 | brak zgody klientów na dalszych procesorów | obecne: Ś; K1: W — warunek sprzedaży B2B | strona `/legal/podprocesorzy` z jednego źródła danych; ogólna zgoda w umowie z okresem sprzeciwu krótszym niż u dostawców; e-mail do właścicieli organizacji przy zmianie | test porównujący listę z hostami w CSP i SDK w `package.json` (PRC-01) | N-PRC-01; `04` pyt. 3–6 | E-62 |
| WYM-58 | Art. 44: mapa transferów poza EOG (siedziba dostawcy, zdalny dostęp, wsparcie, narzędzia deweloperskie); „region UE” nie zamyka oceny | P, O | ZR-01 art. 44; ZR-39 | FF-A, FF-P | częściowe | mapa odbiorców i łańcucha w `04` § 1 i § 4; ustalone transfery lub ich ryzyko: Anthropic — USA (PRC-06), PostHog — przetwarzanie także w USA mimo EU Cloud (PRC-09, DOK-7), Sentry — konto i wsparcie w USA (PRC-16, DOK-5), Google Fonts (PRC-10, RUN-05), Resend — region nieznany (PRC-11), agenci AI (PRC-07), Telegram/Slack (PRC-12); kraj dostępu zdalnego nieznany (N-PRC-08) | mapa kompletna tylko jako materiał audytu; nieznane regiony i dostęp zdalny | obecne: Ś; K1: W | rejestr transferów per dostawca (w rejestrze dostawców); usunięcie zbędnych transferów (fonty, dane osobowe w Telegramie) | przegląd rejestru; uprząż A4 (brak żądań do Google) | N-PRC-01, N-PRC-02, N-PRC-07, N-PRC-08; `04` pyt. 10 | E-07, E-16, E-57, E-61 |
| WYM-59 | Art. 45 — DPF: aktywna certyfikacja odbiorców z USA i jej zakres; monitorowanie decyzji 2023/1795 | P | ZR-01 art. 45; ZR-03; ZR-61; ZR-82 | FF-A, FF-P | niezweryfikowane | listy DPF nie odczytano (egress zablokowany); umowy nieznane; dla PostHog i Sentry podstawą może być DPF, nie SCC (PRC-02) | brak zapisu weryfikacji | obecne: N; K1: Ś | zapis weryfikacji wpisu DPF z datą dla każdego dostawcy z USA | przegląd rejestru (data weryfikacji ≤ 12 mies.) | N-ZR-07; N-PRC-01; `04` pyt. 9 | E-61 |
| WYM-60 | Art. 46 — SCC: właściwy moduł, TIA i środki uzupełniające; dowód zawarcia | P, O | ZR-01 art. 46, art. 48; ZR-04; ZR-38; ZR-60 | FF-A, FF-P | brak | żadnej TIA ani umowy z SCC w repo (`A3` § 6.3 — DOW-20, PRC-02); polityka deklaruje SCC (`polityka-prywatnosci/page.tsx:106` i dalej); DPA Anthropic przewiduje SCC moduł 2/3 i informacje do TIA (DOK-3), ale nie wiadomo, czy konto je obejmuje (PRC-06) | brak TIA i dowodu zawarcia SCC | obecne: Ś; K1: W | potwierdzić warunki komercyjne i DPA (Anthropic, Resend, inni); TIA wg listy kontrolnej (`09` § 5) | przegląd dokumentów z datą | N-PRC-01; N-DOW-05; WYM-59 | E-61 |
| WYM-61 | Art. 49: wyjątki (zgoda, umowa) nie są podstawą stałych transferów | P, O | ZR-01 art. 49; ZR-52 | FF-A | niezweryfikowane | w odczytanych dokumentach nie znaleziono powołania art. 49 (polityka deklaruje SCC); faktyczne mechanizmy transferu nieznane (N-PRC-01) | nie wiadomo, na czym opierają się obecne transfery | obecne: N; K1: Ś | w rejestrze transferów jawnie wykluczyć art. 49 dla transferów stałych | przegląd rejestru | N-PRC-01 | E-61 |
| WYM-62 | Modele AI dostawcy (wsparcie, OCR, kategoryzacja, FLO): dalszy procesor zaakceptowany, podstawa transferu, brak trenowania, retencja i lokalizacja, informacja dla osób; AI Act art. 50 ust. 1 (czat); art. 4 (kompetencje) (obszar dodatkowy C) | P, O, I | ZR-01 art. 13, 28, 44–46; ZR-80 (ODCZYT); ZR-06; ZR-56 | FF-A, FF-P | częściowe | warunki handlowe Anthropic: brak trenowania na treściach klienta (ZR-80, odczyt 10.10); DPA odczytane (DOK-3); ale: wywołania bez wyboru regionu, `inference_geo` udokumentowane tylko `us`/`global` (`lib/anthropic/client.ts:19` — PRC-06, DOK-4); klasyfikacja automatyczna bez wyboru klienta (AI-01); brak informacji przy czacie i OCR (`components/support/support-widget.tsx:295,334-335` — ZGD-08, AI-05); brak rejestru funkcji AI (AI-05); czat bez retencji (AI-03); plik OCR bez końca życia (AI-02); polityka opisuje tylko OCR i „nie są przechowywane” (`polityka-prywatnosci/page.tsx:106-108`); agenci AI na planach możliwie konsumenckich (PRC-07, DOK-9); FLO z modelem nieaktywne i strzeżone testem (AI-04) | brak informacji, wyboru klienta i potwierdzonej podstawy transferu | obecne: Ś; K1: W — pełne dokumenty kosztowe i dane kontrahentów do USA | zdanie informacyjne przy czacie i OCR; rejestr funkcji AI (tabela `A2` AI.0 jako żywy dokument); przełącznik organizacji (WYM-42); potwierdzenie DPA na koncie organizacji; zapis `usage.inference_geo` jako dowód; opcja Vertex AI EU — decyzja produktowa | test UI (tekst informacji przy czacie i OCR); test kontraktu promptu; test przełącznika | Q-ZR-14; N-ZR-08; QA1-12; `A2` pyt. 7; `04` pyt. 1, 2, 7; N-PRC-02, N-PRC-07 | E-11, E-12, E-17, E-60, E-61 |

## 8. Macierz — obszar G (dokumenty i dowody)

Dla dokumentów stan „brak” znaczy „nie znaleziono w repo” (wyszukiwania
w `A3` § 1). Dokumenty poza repo mogą istnieć (N-DOW-01). Istnienie
dokumentu nie dowodzi wykonania procedury.

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-10 | Rozliczalność: zdolność wykazania zgodności — rejestry, LIA, screening DPIA, TIA, polityki, dowody działania kontroli | P | ZR-01 art. 5 ust. 2, art. 24 ust. 1 | FF-A | brak | brak rejestrów (DOW-01), LIA, DPIA i TIA (DOW-20), polityk (SOC-12), niezależnej oceny kontroli (SOC-14); jedyny dowód działania to zielone testy logiki prywatności (DOW-16: 49/49 plików, 638/638 testów, 13.10) | brak dokumentacji zgodności i dowodów w czasie | obecne: Ś; K1: W | zob. WYM-48, WYM-49, WYM-12, WYM-55, WYM-60, WYM-74 | zestawienie dowodów z datami (WYM-74) | N-01, N-DOW-01 | E-59, E-60, E-61, E-75 |
| WYM-30 | Art. 24: środki techniczne i organizacyjne, polityki proporcjonalne do przetwarzania, przegląd i aktualizacja | P | ZR-01 art. 24 ust. 1–2 | FF-A | brak | brak zatwierdzonych polityk (bezpieczeństwo, dostęp, zmiany, incydenty, kopie, dostawcy, klasyfikacja, retencja — SOC-12); runbooki `key-rotation.md`, `disaster-recovery.md` oznaczone jako nieaktualne (`docs/runbooks/key-rotation.md:3-10` — `A3` § 1.3); brak rejestru ryzyk (SOC-15) | brak polityk z datą zatwierdzenia i właścicielem | obecne: Ś; K1: W | krótkie polityki z datą i właścicielem; przegląd roczny; wycofanie lub aktualizacja nieaktualnych runbooków | protokół przeglądu rocznego (dowód S) | N-01, N-DOW-01 | E-74 |
| WYM-46 | Art. 28 ust. 3 lit. h: informacje dla klienta potrzebne do wykazania zgodności; umożliwienie audytów; SOC 2 nie zastępuje RODO (obszar dodatkowy F) | P | ZR-01 art. 28 ust. 3 lit. h | FF-P | brak | brak umowy powierzenia (ZGD-02); strona RODO deklaruje stan bez pokrycia (ZGD-12); brak raportów i certyfikatów (DOW-21) | klient nie ma materiałów do wykazania zgodności | obecne: N; K1: Ś | klauzula audytowa w umowie; pakiet zgodności dla klientów (opis środków, lista dalszych procesorów, wyniki testów) | przegląd pakietu przy każdej zmianie listy procesorów | WYM-41; `06` pyt. 3 | E-62, E-75 |
| WYM-47 | Art. 29, art. 28 ust. 3 lit. b, art. 32 ust. 4: osoby i automaty z dostępem do danych działają na polecenie, są zobowiązane do poufności; upoważnienia i ich przegląd (obszar dodatkowy B) | P, S | ZR-01 art. 29, art. 28 ust. 3 lit. b, art. 32 ust. 4; ZR-70 CC6.2–CC6.3, CC1.4 | FF-A, FF-P | brak | brak upoważnień, zobowiązań do poufności i szkoleń (DOW-23, SOC-13); brak przeglądów dostępu (DOW-05, SOC-07); dostęp do serwerów jako `root`, imienność kluczy nieznana (SOC-08); konto Sentry współdzielone bez MFA ([PR225 @a72b567] `ownership.md` — SOC-09); agenci AI z dostępem do produkcji, skrypt zwraca dane faktur (`scripts/ops/kontrola-faktur-ksef.sh:186-209` — PRC-07) | brak podstaw organizacyjnych dostępu ludzi i agentów | obecne: Ś; K1: W — dostęp do danych wszystkich klientów bez rozliczalności | imienne upoważnienia i zobowiązania do poufności (także współpracownicy); zasady dla agentów AI (plan z umową komercyjną, odczyt tylko zredagowanej diagnostyki); konta imienne z MFA; kwartalny przegląd | protokół przeglądu dostępów z listą kont i decyzjami; zrzut ustawień MFA (dowód S) | N-DOW-03, NS-03, NS-04, N-PRC-07; P-10; `04` pyt. 7, 8; `06` pyt. 4 | E-36, E-68, E-69 |
| WYM-48 | Art. 30 ust. 1: rejestr czynności FF-A; wyjątek z ust. 5 wg interpretacji nie ma zastosowania | P, O | ZR-01 art. 30 ust. 1, 3–5; ZR-55 | FF-A | brak | rejestru nie znaleziono (`A3` § 1.2 — DOW-01); jedyna wzmianka: zadanie w `docs/security/PLAN-ODPORNOSCI-CYBER.md:113`; szkic w budowie: `09` § 1 | brak rejestru | obecne: Ś; K1: W | przyjąć rejestr ze szkicu `09` § 1 po decyzjach (role, podstawy, retencja) | przegląd dokumentu; data przeglądu ≤ 12 mies. | N-01, N-DOW-01; Q-ZR-15; P-01 | E-59 |
| WYM-49 | Art. 30 ust. 2: rejestr kategorii czynności FF-P dla każdego klienta-administratora | P | ZR-01 art. 30 ust. 2–5; ZR-55 | FF-P | brak | nie znaleziono (DOW-01); szkic w budowie: `09` § 2 | brak rejestru | obecne: N — brak klientów; K1: W | szkic `09` § 2; część generowana z danych organizacji (I) | skrypt generujący listę administratorów-klientów z kategoriami; przegląd | N-01; Q-ZR-15 | E-59 |
| WYM-52 | Art. 33 (FF-A): zgłoszenie naruszenia do Prezesa UODO bez zbędnej zwłoki (do 72 h); minimalna treść; rejestr **wszystkich** naruszeń | P, O | ZR-01 art. 33 ust. 1, 3–5; ZR-36; ZR-37 | FF-A | częściowe | fragmenty procedury tylko w runbookach oznaczonych jako nieaktualne (`docs/runbooks/key-rotation.md:183-190`, `docs/runbooks/disaster-recovery.md:117-120` — DOW-03); rejestru naruszeń i post-mortem brak (`A3` § 1.2); odwołania do „DPO”, którego nie wyznaczono (`A3` § 1.3); brak procedury incydentów i ćwiczeń (SOC-16); RUN-08 może wymagać oceny jako naruszenie po potwierdzeniu na produkcji (`A4` pyt. 4) | brak aktualnej procedury, kryteriów oceny, wzoru zgłoszenia i rejestru | obecne: Ś; K1: W — ryzyko przekroczenia 72 h | jedna procedura (szkic `09` § 9) z kryteriami, wzorem i rejestrem; ocena RUN-08 po potwierdzeniu | ćwiczenie co 6 mies. z protokołem (SOC-16) | N-ZR-12; `A4` pyt. 4; P-04 | E-67 |
| WYM-53 | Art. 33 ust. 2 (FF-P): zawiadomienie klienta bez zbędnej zwłoki; termin i treść w umowie | P, O | ZR-01 art. 33 ust. 2; ZR-36 | FF-P | brak | brak umowy powierzenia (ZGD-02); strona RODO obiecuje „72 godzin (zgodnie z art. 33 RODO)” (`rodo/page.tsx:64`, sprawdzone 13.10) — termin organu, nie klienta (ZGD-12); brak ścieżki powiadomienia klientów (DOW-03) | brak terminu umownego i procedury | obecne: N; K1: W — klient nie zdąży z własnymi 72 h | postanowienie w umowie (termin krótszy niż 72 h — decyzja review); krok w procedurze naruszeń; korekta strony RODO | ćwiczenie z powiadomieniem syntetycznego klienta (protokół z czasem) | Q-ZR-12; P-03 | E-62, E-67 |
| WYM-54 | Art. 34: zawiadomienie osób przy wysokim ryzyku; jako procesor — pomoc klientowi | P, O | ZR-01 art. 34; ZR-36 | FF-A; FF-P (pomoc) | brak | brak kryteriów i wzoru zawiadomienia (DOW-03) | brak procedury | obecne: N; K1: Ś | kryteria i wzór w procedurze naruszeń | ćwiczenie (protokół) | WYM-52 | E-67 |
| WYM-55 | Art. 35: udokumentowany screening potrzeby DPIA (także z wynikiem negatywnym); DPIA, gdy wymagana; materiały dla DPIA klienta | P, O | ZR-01 art. 35 ust. 1, 3, 4, 7, 11; ZR-20; ZR-46 | FF-A; FF-P (pomoc) | brak | DPIA ani screeningu nie znaleziono (`A3` § 6 — DOW-20); propozycja screeningu: spełnione kryteria WP248 4 (dane finansowe, PESEL) i 8 (modele językowe), prawdopodobnie 6 (łączenie zbiorów) → DPIA dla funkcji z LLM; DPIA jako warunek `payment.score` i FLO z modelem (`A3` § 6.1, AI-04, INW-13) | brak udokumentowanego screeningu i DPIA | obecne: Ś; K1: W | screening (szkic `09` § 3); dobrowolna DPIA dla OCR, kategoryzacji i czatu; pakiet dla klientów | przegląd dokumentu; test-strażnik: `payment.score` i FLO z modelem wyłączone do czasu DPIA (WYM-29, AI-04) | Q-ZR-11; P-02; N-DOW-06; N-ZR-02 | E-59, E-60 |
| WYM-56 | Art. 36: uprzednie konsultacje z Prezesem UODO przy wysokim ryzyku szczątkowym po DPIA | P | ZR-01 art. 36 | FF-A | niezweryfikowane | nie da się ocenić bez DPIA (WYM-55) | zależne od wyniku DPIA | obecne: N; K1: N | decyzja po DPIA | — (po DPIA) | WYM-55 | E-60 |
| WYM-57 | Art. 37–39: udokumentowana ocena obowiązku wyznaczenia IOD; nie nazywać „IOD” osoby niewyznaczonej | P, O | ZR-01 art. 37–39; ZR-48; ZR-57; ZR-10 | FF-A, FF-P | brak | brak oceny; runbooki odwołują się do „DPO”, którego wyznaczenia nie znaleziono (`A3` § 1.3, `git grep` „IOD”/„Inspektor Ochrony Danych” — 0 poza tymi runbookami) | brak oceny; mylące odwołania | obecne: N; K1: N | jednostronicowa ocena; usunąć odwołania do „DPO” albo wyznaczyć | grep-test: brak „DPO”/„IOD” w dokumentach, dopóki nie ma wyznaczenia (I) | Q-ZR-10, Q-ZR-18; P-04 | E-59 |
| WYM-74 | Dokumenty z dowodem działania: rejestry, procedury praw osób z ewidencją, procedura naruszeń z rejestrem, harmonogram retencji z dowodem, przeglądy dostępów, ślady audytowe, LIA, screening DPIA, TIA | P, S | ZR-01 art. 5 ust. 2, art. 24; ZR-70 CC2.2, CC4.1, CC5.3 | FF-A, FF-P | brak | DOW-01, DOW-03, DOW-04, DOW-05, DOW-20, DOW-21, DOW-22; ślad audytowy jako projekt istnieje, działanie na produkcji niezweryfikowane (N-DOW-02); wykonanie usunięcia poza audytem (DOW-06); utrata wpisu audytu bez alarmu (DOW-11); testy TEST-01…07 [PR225] — NOT RUN; wyniki kontroli PI nie są archiwizowane (SOC-26) | brak dowodów działania w czasie | obecne: Ś; K1: W | kalendarz dowodów (przegląd dostępów, próba odtworzenia, przebiegi retencji, rejestr żądań, rejestr naruszeń); skrypty `scripts/ops/` zapisujące wyniki bez danych osobowych | lista kontrolna dowodów co miesiąc; T-18 (alarm przy utracie wpisu audytu) | N-DOW-02; WYM-SOC-7 | E-04, E-22, E-47, E-54, E-67, E-69, E-72, E-73, E-75 |

## 9. Macierz — SOC 2

Klasa **S** dla całej tabeli: kryteria wiążą dopiero w badaniu albo gdy
wymaga ich umowa. Identyfikatory kryteriów — wg wiedzy modelu (NS-02).
Szczegółowe luki i kontrole: `06-SOC2.md` § 8. Ryzyko „obecne” dotyczy
osób i usługi; gotowość do badania ocenia `06` § 2.2 (dziś: nie, w żadnej
kategorii).

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-SOC-1 | Security — kryteria wspólne CC1–CC9 (środowisko kontroli, komunikacja, ryzyko, monitorowanie, działania kontrolne, dostęp, operacje, zmiany, dostawcy) | S | ZR-70 CC1–CC9 | FF (organizacja usługowa) | częściowe | mocne kontrole techniczne: RLS 70/70, MFA operatorów, szyfrowanie poświadczeń KSeF, wymagane kontrole CI, append-only `audit_logs` (`06` § 2.2); luki SOC-01–SOC-20, m.in.: 0/40 PR z akceptacją drugiej osoby (SOC-01, DOW-13), test RLS niewymagany (SOC-03, DOW-12), brak zapisu wdrożeń i migracji (SOC-04), brak stagingu (SOC-06), brak przeglądów dostępu i kont imiennych z MFA (SOC-07–SOC-09), odczyty operatora bez śladu (SOC-11), brak polityk i rejestru ryzyk (SOC-12, SOC-15), brak procedury incydentów (SOC-16), brak zarządzania dostawcami (SOC-18); niezmienność audytu tylko wyzwalaczem (DOW-10); adres hosta w publicznym pliku (DOW-19) | kontrole organizacyjne słabe lub nieobecne; brak populacji dowodów | obecne: Ś; K1: W — dla osób Ś; dla gotowości do badania SOC 2 W już dziś (SOC-01 – SOC-20) **[R5a]** | etap „Fundamenty” z `06` § 9.3 (polityki, ryzyko, dostęp, zmiany, incydenty, logi, dostawcy) | dowody per kontrola wg `06` § 8.1 (eksport rulesetu, protokół przeglądu dostępów, rejestr incydentów, dziennik wdrożeń) | N-01 / NS-01; NS-03, NS-04, NS-06, NS-07; N-DOW-11 | E-36, E-61, E-67, E-68, E-69, E-70, E-71, E-72, E-73, E-74, E-75, E-77, E-78 |
| WYM-SOC-2 | Availability — A1.1–A1.3: pojemność, kopie i infrastruktura odtwarzania, testy planu odtwarzania | S | ZR-70 A1 | FF | częściowe | nocny `pg_dump`, alarmy świeżości, heartbeat, `/api/health` (`06` § 4); brak kopii poza hostem (SOC-21), jedna próba odtworzenia (SOC-22, DOW-22), RTO/RPO sprzed przeprowadzki (`docs/security/rto-rpo.md:20-50` — SOC-23), regulamin deklaruje 99,9 % dostępności bez pomiaru (`regulamin/page.tsx:76-77` — SOC-24) | brak kopii poza hostem, cyklu prób i pomiaru dostępności | obecne: Ś; K1: W | SOC-21–SOC-24 (wspólne z WYM-51) | miesięczny protokół próby odtworzenia; miesięczny raport z zewnętrznego monitora | NS-05; `06` pyt. 1; WYM-51 | E-53, E-54, E-74 |
| WYM-SOC-3 | Processing Integrity — PI1.1–PI1.5: specyfikacje, kontrola wejścia, przetwarzania, wyjścia i przechowywania (faktury, FA(3), KSeF, UPO, ponowienia bez duplikatów) | S | ZR-70 PI1 | FF | częściowe | projekt w kodzie: walidacja XSD, idempotencja kolejki, strażnik cyklu życia, uzgadnianie (`06` § 5); produkcja z `KSEF_ENV=test` i domyślne `test` (`submit-invoice.ts:628`, `ksef-submit-enqueue.ts:127`, sprawdzone 13.10 — SOC-25, PRC-17); bramka „zero zgubionych faktur” niezaliczona (SOC-25); wyniki kontroli niearchiwizowane (SOC-26); brak stagingu (SOC-06) | środowisko KSeF nie jest fail-closed; brak populacji transakcji produkcyjnych i archiwum wyników | obecne: N — brak klientów; K1: W — „przyjęte przez KSeF” bez skutku prawnego | odmowa startu przy brakującej lub niezgodnej zmiennej KSeF; dokończenie bramki wydania; archiwizacja dziennych wyników strażnika | test strażnika startu (WYM-37); tygodniowe scenariusze na KSeF TEST w CI | NS-10; N-PRC-10; WYM-37 | E-10, E-75 |
| WYM-SOC-4 | Confidentiality — C1.1–C1.2: identyfikacja i ochrona informacji poufnych oraz ich usuwanie (dokumenty klientów, poświadczenia KSeF, klucze) | S | ZR-70 C1 | FF | częściowe | szyfrowanie poświadczeń KSeF z mechanizmem rotacji, RLS, podpisane URL (`06` § 6); brak polityki klasyfikacji (SOC-27); rotacja klucza niewykonana, format v1 czytany (`lib/ksef/credentials-crypto.ts:24-25` — SOC-28); usuwanie niepełne (SOC-29: PRA-04, RET-02, RET-04, RET-06, RET-09); zrzuty nieszyfrowane, linki-okaziciele (SOC-30) | brak klasyfikacji, rotacji i pełnego usuwania | obecne: Ś; K1: W | polityka klasyfikacji; rotacja klucza wg skryptu przeszyfrowania; wykonawcy usuwania (WYM-45, WYM-73); szyfrowanie zrzutów (WYM-50) | protokół rotacji (data, odciski kluczy, liczba rekordów); T-04, T-06 | NS-08, NS-14 | E-50, E-51, E-53, E-56, E-74 |
| WYM-SOC-5 | Privacy — P1–P8: informacja, wybór i zgoda, zbieranie, wykorzystanie, retencja i usuwanie, dostęp i korekta, ujawnianie i powiadamianie, jakość, monitorowanie i skargi | S | ZR-70 P1–P8 | FF | częściowe | istnieją: eksport, usuwanie z 14-dniowym okresem, zgoda analityczna przed startem SDK (`06` § 7); luki SOC-31–SOC-36 (polityka z placeholderem i bez wersji, zgody bez wycofania, prawa osób niedomknięte, retencja, umowy powierzenia, kanał skarg w prywatnych skrzynkach) | jak w obszarach C, D, E, F | obecne: Ś; K1: W | `06` § 9.2 nie rekomenduje Privacy do pierwszego badania; luki zamykają wymagania RODO z tej macierzy | jak w WYM-11 – WYM-29, WYM-71 | `06` pyt. 3 | E-40, E-63, E-66, E-79 |
| WYM-SOC-6 | Opis systemu wg DC 200 i decyzja o zakresie (kategorie, systemy, podprocesorzy carve-out/inclusive, kontrole komplementarne) | S | ZR-71; ZR-72 | FF | brak | opisu systemu i decyzji o zakresie nie ma (`06` § 9.1, § 9.3 etap 2); nie znaleziono w repo umowy ani zapytania klienta wymagającego raportu (NS-13) | brak decyzji, czy i kiedy badanie | obecne: N; K1: N — istotne tylko przy decyzji o badaniu | decyzja właściciela; opis systemu równolegle z etapem „Fundamenty” | zatwierdzony opis (data, podpis kierownictwa) | N-01 / NS-01; NS-13 | E-79 |
| WYM-SOC-7 | Type 1 a Type 2; raport tylko od niezależnego CPA; gotowość ≠ raport; brak „certyfikacji SOC 2” | S | ZR-72; ZR-73; ZR-74 | FF | potwierdzone | w kodzie publicznym nie ma deklaracji SOC 2 ani certyfikatów (grep `soc ?2` w `app`, `components`, `content`, `lib` — 0 trafień, 13.10.2026); wzmianki w `docs/` to cele, nie raporty (`A3` § 1.6 — DOW-21); `06` rozróżnia Type I/II i nie ogłasza zgodności (`06` § 2, § 9.4) | brak luki w zakresie wymagania; raportu brak i jest to zgodne z obecnym etapem | obecne: N; K1: N | utrzymać zasadę: bez „zgodny z SOC 2” / „SOC 2 ready” przed raportem | grep-test w CI na publicznych stronach (I) | `06` pyt. 2 | E-01, E-79 |

## 10. Wymagania dodatkowe (WYM-X)

Dodane, bo istotny element ustaleń nie ma odpowiednika w katalogu `03` § 3
(sekcja 11 wskazuje, które ustalenia). Klasy i źródła jak w katalogu —
przepisy [NZ].

| ID | Wymaganie (skrót) | Klasa | Źródło (ZR + przepis/punkt) | Adresat | Stan | Dowód (plik:linia + ID ustaleń) | Luka | Ryzyko | Zmiana (proponowana) | Test (jak sprawdzić po zmianie) | Zależność | Etap planu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WYM-X-01 | Dokumenty prawne (regulamin, polityka, strona RODO, przyszła umowa powierzenia) wersjonowane; akceptacja regulaminu i umowy zapisana (kto, wersja, chwila, kanał), także przy rejestracji przez Google; informacja o polityce jako informacja, nie „akceptacja”; procedura zmian | P, S, I | ZR-12 art. 8 (udostępnienie regulaminu przed zawarciem umowy — status po PKE do potwierdzenia, N-ZR-05); ZR-01 art. 13, art. 28 ust. 9; ZR-70 CC2.3 / P1.1 | FF-A | brak | zdanie „Rejestrując się akceptujesz…” bez pola i bez zapisu (`app/(auth)/register/page.tsx:164-173`, `register/actions.ts:22-123` — ZGD-04); brak kolumn `terms_*`/`policy_version` w migracjach; konto Google z ekranu logowania bez informacji (`app/(auth)/login/page.tsx:66,91`); regulamin zmieniony 1.10.2026, data „1 maja 2026” (`regulamin/page.tsx:18`); strona RODO bez daty (ZGD-04, SOC-31) | nie da się wykazać, którą wersję zaakceptował klient, ani poinformować o zmianach | obecne: Ś; K1: W — od wersji regulaminu i umowy powierzenia zależy relacja z każdym klientem | tabela akceptacji (użytkownik, dokument, wersja, skrót treści, chwila, kanał); ekran potwierdzenia przy pierwszym logowaniu Google; numer wersji i data na stronach; procedura powiadamiania o zmianach | T-21 (zmiana treści bez nowej wersji = czerwony); test zapisu akceptacji przy rejestracji e-mail i Google | QA1-09; N-01; WYM-41 | E-58, E-62 |
| WYM-X-02 | Repozytorium publiczne i artefakty pracy (testy, PR, issue, pliki audytów, wyniki skryptów, kontekst agentów AI) bez danych osobowych, danych z produkcji i szczegółów infrastruktury | I (wspiera P: art. 5 ust. 1 lit. f, art. 32) | ZR-01 art. 5 ust. 1 lit. f, art. 32 | FF-A, FF-P | częściowe | istnieje konfiguracja skanu sekretów (`.github/gitleaks.toml`); `AGENTS.md` usunął adresy serwerów z pliku; ale: publiczny plik audytu z adresem hosta bazy i ścieżką klucza (`docs/security/audyt/wynik-00-adres-bazy.txt:1` — DOW-19); NIP z poprawną sumą, w tym rzeczywistej spółki, i e-maile w realnych domenach w testach (MIN-09); skrypty operacyjne zwracają identyfikatory organizacji i numery KSeF (z NIP) do kontekstu agentów (PRC-07) | brak egzekwowanej zasady i kontroli dla danych innych niż sekrety | obecne: Ś; K1: W — wyciągi z produkcji w publicznym repo albo u dostawcy agenta byłyby nieodwracalne | usunąć plik z DOW-19 z drzewa (historia zostaje — ocena osobno); test-strażnik NIP i domen e-mail (WYM-37); zasada w `AGENTS.md`: bez wyników z produkcji w PR, issue i plikach; skrypty `scripts/ops/` domyślnie zwracają agregaty | test-strażnik danych w `tests/`, `e2e/`, `docs/`; skan zmian w PR (wzorce NIP z poprawną sumą, PESEL, IPv4) | N-PRC-07; NA1-07; `04` pyt. 8 | E-38 |
| WYM-X-03 | Krajowy numer identyfikacyjny (PESEL) i numery dokumentów tożsamości nabywców: zbierane tylko, gdy potrzebne (domyślnie bez identyfikatora), w jednym miejscu, z ograniczoną widocznością i zabezpieczeniem | P, I | ZR-01 art. 87 (warunki przetwarzania krajowego numeru identyfikacyjnego — przepisy krajowe do ustalenia), art. 5 ust. 1 lit. c, art. 25 ust. 2, art. 32 | FF-P; K | brak | interfejs domyślnie wybiera PESEL dla osoby prywatnej i wymaga poprawnej sumy (`components/invoices/invoice-form.tsx:437,774`, `lib/schemas/invoice-form.ts:263-273` — MIN-01; sprawdzone 13.10); serwer przyjmuje `no_id` tylko jako wartość zapasową (`components/invoices/actions.ts:413`); PESEL jawnie w kolumnie, `fa3_data`, `buyer_data`, XML w S3, payloadzie pg-boss i kopiach; widoczny dla każdego członka organizacji (`00012…sql:66-68` — INW-05); PDF go nie drukuje (INW-05) | zbieranie domyślne zamiast z potrzeby; trzy kopie w wierszu; brak szyfrowania i ograniczenia widoczności | obecne: Ś; K1: W — identyfikatory konsumentów w wielu magazynach | domyślnie „bez identyfikatora” z podpowiedzią, kiedy jest potrzebny; jedno miejsce przechowania albo szyfrowanie kolumnowe; maskowanie w listach | test komponentu: domyślny typ = `no_id`; test na bazie: PESEL tylko w jednej kolumnie lub zaszyfrowany | QA1-01; `02` pyt. 6 | E-29, E-49 |

## 11. Pokrycie ustaleń

Każde ustalenie z raportów `02`, `04`, `A1`, `A2`, `A3`, `A4`, `06`
ma przypisane co najmniej jedno wymaganie. Pierwsze WYM w kolumnie jest
główne. Nie są ustaleniami i nie są tu liczone: DOK-1 – DOK-12 (dokumenty
dostawców odczytane w `04`), niewiadome (N-…), pytania do review (Q-…,
QA1-…, P-…), luki śladu audytowego L1 – L10 i testy T-01 – T-21 z `A3`
(L to składniki ustaleń DOW: L1 → DOW-06; L2, L3 → DOW-07; L4, L5 →
DOW-08; L6 → DOW-11; L7 → DOW-10; L8, L9 → DOW-09; L10 → MIN-11
i WYM-38), pozycje D-01 – D-11 deklaracji strony RODO (składnik ZGD-12).

### 11.1. `02-INWENTARZ-I-PRZEPLYWY.md` (INW — 19)

| Ustalenie | Skrót | WYM |
|---|---|---|
| INW-01 | większość kategorii bez reguły retencji | WYM-08, WYM-71, WYM-24 |
| INW-02 | usunięcie organizacji bez skutku; ścieżka operatora przerywana wyzwalaczem | WYM-24, WYM-45, WYM-73 |
| INW-03 | pliki S3 poza fakturami bez retencji | WYM-71, WYM-08, WYM-45 |
| INW-04 | kopie z pełnym PII, bez szyfrowania lokalnego i bez ponownego usunięcia | WYM-72, WYM-51, WYM-50 |
| INW-05 | PESEL i numery dokumentów nabywców B2C | WYM-X-03, WYM-06, WYM-32 |
| INW-06 | dane kontrahentów i treść czatu do Anthropic | WYM-62, WYM-42, WYM-71 |
| INW-07 | odpowiedzi kontrahentów trafiają do FF | WYM-42, WYM-67 |
| INW-08 | e-maile i obiekty faktur poza bazą (Slack, audyt, pg-boss, logi) | WYM-36, WYM-06 |
| INW-09 | `audit_logs`: źródło IP, widoczność, sprzeczne deklaracje retencji | WYM-36, WYM-71, WYM-35, WYM-50 |
| INW-10 | FLO aktywny; `flo_approvals` bez retencji | WYM-71, WYM-42, WYM-31 |
| INW-11 | telemetria poza bramką zgody | WYM-63, WYM-04, WYM-12 |
| INW-12 | pełny obiekt faktury Stripe | WYM-06, WYM-71 |
| INW-13 | pola pod profilowanie bez zasilania | WYM-31, WYM-55 |
| INW-14 | newsletter bez potwierdzenia, wypisu, retencji | WYM-13, WYM-66, WYM-14 |
| INW-15 | dostęp operatora bez audytu odczytów | WYM-35 |
| INW-16 | wspólne dane rejestrowe, skróty bez soli | WYM-33, WYM-38, WYM-01 |
| INW-17 | polityka opisuje innych odbiorców niż kod | WYM-18, WYM-19 |
| INW-18 | retencja faktur: bieg od archiwizacji, wyzwalacz blokuje `DELETE` | WYM-68, WYM-73, WYM-45 |
| INW-19 | paczki księgowe: załączniki i linki-okaziciele | WYM-33, WYM-50 |

### 11.2. `04-PROCESORZY-I-LOKALIZACJE.md` (PRC — 17)

| Ustalenie | Skrót | WYM |
|---|---|---|
| PRC-01 | lista procesorów w polityce niezgodna z rzeczywistością | WYM-18, WYM-19, WYM-43 |
| PRC-02 | „Dane w UE” i „SCC z każdym” bez pokrycia | WYM-19, WYM-58, WYM-59, WYM-60 |
| PRC-03 | „Frankfurt” i „Backup: AWS Glacier” | WYM-19 |
| PRC-04 | brak rejestru umów powierzenia | WYM-40, WYM-74 |
| PRC-05 | brak listy dalszych procesorów i procedury zmian | WYM-43, WYM-41 |
| PRC-06 | Anthropic: transfer do USA, klasyfikacja bez wyboru klienta | WYM-62, WYM-42, WYM-60 |
| PRC-07 | agenci AI z dostępem do produkcji poza listą | WYM-47, WYM-58, WYM-X-02 |
| PRC-08 | poczta pomocy do prywatnych skrzynek | WYM-17, WYM-40 |
| PRC-09 | PostHog: łańcuch poza UE, panel sprzeczny z kodem | WYM-34, WYM-58 |
| PRC-10 | Google Fonts na każdej stronie | WYM-63, WYM-58 |
| PRC-11 | Resend: region i śledzenie nieznane | WYM-58, WYM-63 |
| PRC-12 | Telegram i Slack: identyfikatory i e-maile | WYM-36, WYM-58 |
| PRC-13 | MinIO bez wsparcia producenta | WYM-50, WYM-SOC-1 |
| PRC-14 | kopie u jednego dostawcy, brak off-host | WYM-51, WYM-72 |
| PRC-15 | dostawcy historyczni i zapasowe ścieżki kodu | WYM-24, WYM-71, WYM-40 |
| PRC-16 | Sentry: konto i wsparcie w USA, retencja nieodczytana | WYM-58, WYM-34 |
| PRC-17 | produkcja wysyła do testowego KSeF | WYM-37, WYM-SOC-3 |

### 11.3. `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` (MIN — 12, ZGD — 12)

| Ustalenie | Skrót | WYM |
|---|---|---|
| MIN-01 | PESEL domyślnie dla osoby prywatnej | WYM-X-03, WYM-32 |
| MIN-02 | imię wymagane w formularzu, „opcjonalne” w polityce | WYM-06, WYM-19 |
| MIN-03 | wyszukanie NIP ujawnia organizacje | WYM-33, WYM-06 |
| MIN-04 | `select('*')`, IP współpracowników, surowe błędy | WYM-06, WYM-50 |
| MIN-05 | dostęp operatorów bez śladu odczytu | WYM-35 |
| MIN-06 | domyślne udostępnianie: link 90 dni, linki 7 dni | WYM-33 |
| MIN-07 | logger bez redakcji; Sentry z filtrem | WYM-36 |
| MIN-08 | PostHog: zdarzenia serwerowe z profilem; panel niespójny | WYM-34, WYM-12, WYM-28, WYM-63 |
| MIN-09 | NIP z poprawną sumą i realne domeny w testach | WYM-37, WYM-X-02 |
| MIN-10 | szyfrowanie i skróty bez soli | WYM-38, WYM-50 |
| MIN-11 | „anonimizacja” audytu to pseudonimizacja | WYM-38, WYM-24, WYM-19 |
| MIN-12 | martwy kod z danymi osobowymi | WYM-31 |
| ZGD-01 | brak mapy cel → podstawa i LIA | WYM-11, WYM-12, WYM-04 |
| ZGD-02 | rola procesora bez umowy powierzenia | WYM-41, WYM-01 |
| ZGD-03 | polityka nie opisuje faktycznego przetwarzania | WYM-18, WYM-19 |
| ZGD-04 | akceptacja regulaminu bez zapisu i wersji | WYM-X-01, WYM-18 |
| ZGD-05 | zgoda analityczna: brak wycofania, dowodu, wersji | WYM-14, WYM-13, WYM-15, WYM-64, WYM-65 |
| ZGD-06 | marketing w modelu wypisu; e-mail 8. dnia | WYM-66, WYM-13, WYM-28 |
| ZGD-07 | zgody produktowe; brak przełącznika AI | WYM-42, WYM-67 |
| ZGD-08 | funkcje AI bez informacji | WYM-62, WYM-18 |
| ZGD-09 | osoby bez konta — brak informacji w wiadomościach | WYM-20, WYM-67 |
| ZGD-10 | technologie przeglądarkowe bez zgody | WYM-63, WYM-58 |
| ZGD-11 | ciasteczka sesji 400 dni, dostępne dla skryptu | WYM-19, WYM-63, WYM-32 |
| ZGD-12 | strona „RODO i bezpieczeństwo” bez pokrycia | WYM-19, WYM-53 |

### 11.4. `A2-MECHANIZMY-PRAWA-RETENCJA.md` (PRA — 11, RET — 13, AI — 5)

| Ustalenie | Skrót | WYM |
|---|---|---|
| PRA-01 | eksport konta niepełny | WYM-21, WYM-22, WYM-27 |
| PRA-02 | usunięcie przez użytkownika: zakres niedomknięty | WYM-24, WYM-73 |
| PRA-03 | usunięcie przez operatora przerywa się na wyzwalaczu | WYM-24, WYM-73 |
| PRA-04 | „Usuń organizację” bez wykonawcy | WYM-45, WYM-73 |
| PRA-05 | sprostowanie tożsamości konta niemożliwe | WYM-23, WYM-07 |
| PRA-06 | ograniczenie przetwarzania — brak | WYM-25 |
| PRA-07 | sprzeciw: marketing częściowo, lit. f brak | WYM-28 |
| PRA-08 | art. 22 — nie znaleziono decyzji | WYM-29 |
| PRA-09 | osoby bez konta bez procedury i wyszukiwania | WYM-17, WYM-21, WYM-44 |
| PRA-10 | brak kanału przekazania żądań klientowi | WYM-44 |
| PRA-11 | ewidencja i terminy | WYM-75 |
| RET-01 | „10 lat” jako 2 + 8 od dnia joba | WYM-68, WYM-45 |
| RET-02 | pliki znikają przed wierszem; `DELETE` blokowany | WYM-73, WYM-68, WYM-SOC-4 |
| RET-03 | audyt: jeden okres; wyzwalacz blokuje usuwanie | WYM-71, WYM-24 |
| RET-04 | organizacje „usunięte” bez skutku | WYM-45 |
| RET-05 | dane księgowe bez reguły | WYM-71, WYM-08 |
| RET-06 | pliki S3 poza fakturami | WYM-71, WYM-08 |
| RET-07 | linki do pobrania i TTL eksportów | WYM-33, WYM-71 |
| RET-08 | pg-boss: reguły z biblioteki, nieudokumentowane | WYM-71 |
| RET-09 | kopie: brak propagacji usunięć | WYM-72, WYM-51 |
| RET-10 | telemetria i dostawcy: retencja w panelach, brak usuwania na żądanie | WYM-71, WYM-26, WYM-34 |
| RET-11 | brak pełnego eksportu organizacji | WYM-45, WYM-27 |
| RET-12 | rejestry i dane osób bez relacji bez okresu | WYM-71, WYM-08 |
| RET-13 | „30 dni po anulowaniu” bez kodu | WYM-70, WYM-19 |
| AI-01 | automatyczna klasyfikacja bez wyboru organizacji | WYM-42, WYM-62, WYM-06 |
| AI-02 | OCR: pełny dokument, bez informacji i końca życia pliku | WYM-62, WYM-71 |
| AI-03 | czat bez retencji i bez usunięcia z kontem | WYM-71, WYM-24 |
| AI-04 | FLO: model nieaktywny, część regułowa aktywna | WYM-31, WYM-55 |
| AI-05 | brak informacji i rejestru systemów AI | WYM-62 |

### 11.5. `A3-DOWODY-I-TESTY.md` (DOW — 23)

| Ustalenie | Skrót | WYM |
|---|---|---|
| DOW-01 | brak rejestrów czynności | WYM-48, WYM-49 |
| DOW-02 | strony prawne niezgodne z kodem | WYM-18, WYM-19 |
| DOW-03 | procedura naruszeń niepełna | WYM-52, WYM-53, WYM-54 |
| DOW-04 | żądania poza samoobsługą bez procedury i ewidencji | WYM-17, WYM-75 |
| DOW-05 | brak przeglądów dostępów; konto współdzielone | WYM-47, WYM-35, WYM-SOC-1 |
| DOW-06 | wykonanie usunięcia poza audytem | WYM-74, WYM-24 |
| DOW-07 | jednolita retencja audytu | WYM-71 |
| DOW-08 | odczyty operatora nielogowane | WYM-35, WYM-SOC-1 |
| DOW-09 | dane osób trzecich i IP w dzienniku firmy | WYM-06, WYM-35 |
| DOW-10 | niezmienność audytu tylko wyzwalaczem | WYM-SOC-1, WYM-74 |
| DOW-11 | utrata wpisu audytu bez alarmu | WYM-SOC-1, WYM-74 |
| DOW-12 | test RLS nie jest kontrolą wymaganą | WYM-SOC-1, WYM-09 |
| DOW-13 | brak niezależnego przeglądu zmian | WYM-SOC-1 |
| DOW-14 | E2E bez przebiegów; brak testu zgody | WYM-74, WYM-65, WYM-SOC-1 |
| DOW-15 | testy RLS bez 14 tabel z danymi osobowymi | WYM-09, WYM-SOC-1 |
| DOW-16 | testy prywatności zielone (dowód projektu) | WYM-74, WYM-31 |
| DOW-17 | usunięcie organizacji i plików bez wykonawcy | WYM-45, WYM-73 |
| DOW-18 | anonimizacja w Stripe zadeklarowana, brak w kodzie | WYM-26, WYM-19 |
| DOW-19 | publiczny plik z adresem hosta bazy | WYM-X-02, WYM-50 |
| DOW-20 | brak DPIA, LIA, TIA | WYM-55, WYM-12, WYM-60 |
| DOW-21 | brak raportów i certyfikatów | WYM-40, WYM-SOC-7 |
| DOW-22 | jedna próba odtworzenia, brak off-host | WYM-51, WYM-SOC-2 |
| DOW-23 | brak upoważnień, poufności, szkoleń | WYM-47, WYM-62 (kompetencje AI) |

### 11.6. `A4-TEST-COOKIES-I-SIECI.md` (RUN — 11)

| Ustalenie | Skrót | WYM |
|---|---|---|
| RUN-01 | brak ciasteczek przed wyborem (potwierdzenie) | WYM-63 |
| RUN-02 | PostHog zero żądań przed wyborem i po odmowie (potwierdzenie) | WYM-63, WYM-64 |
| RUN-03 | brak wycofania w UI | WYM-14, WYM-65 |
| RUN-04 | Sentry w przeglądarce niezależnie od decyzji | WYM-63, WYM-12, WYM-18 |
| RUN-05 | Google Fonts przed wyborem | WYM-63, WYM-58 |
| RUN-06 | service worker i Cache Storage każdemu | WYM-63 |
| RUN-07 | CSP w SW blokuje arkusz fontu (defekt funkcjonalny, I) | WYM-63 (rozwiązanie razem z RUN-05) |
| RUN-08 | proxy przekazują dostawcom ciasteczka | WYM-36, WYM-09, WYM-50 |
| RUN-09 | Turnstile na logowaniu | WYM-63 |
| RUN-10 | decyzja bez wersji i daty | WYM-13, WYM-64 |
| RUN-11 | polityka i strona RODO vs obserwacja | WYM-19 |

### 11.7. `06-SOC2.md` (SOC — 36)

| Ustalenie | Skrót | WYM |
|---|---|---|
| SOC-01 | brak niezależnego zatwierdzenia zmian | WYM-SOC-1 |
| SOC-02 | `agent-guard` nie obejmuje gałęzi `claude/*`, `codex/*` | WYM-SOC-1 |
| SOC-03 | RLS isolation niewymagane; 9 zamiast 11 kontroli | WYM-SOC-1, WYM-09 |
| SOC-04 | brak zapisu wdrożeń i migracji | WYM-SOC-1 |
| SOC-05 | zmiany konfiguracji poza PR; dryf paneli | WYM-SOC-1, WYM-34 |
| SOC-06 | brak stagingu; produkcja na KSeF TEST | WYM-SOC-1, WYM-SOC-3, WYM-37 |
| SOC-07 | brak procedury i przeglądów dostępu | WYM-SOC-1, WYM-47 |
| SOC-08 | `root` pełnym kluczem; agenci na produkcji | WYM-SOC-1, WYM-47 |
| SOC-09 | MFA dostawców; konto Sentry współdzielone | WYM-SOC-1, WYM-47 |
| SOC-10 | MFA operacji wrażliwych za wyłączoną flagą | WYM-SOC-1, WYM-50 |
| SOC-11 | odczyty operatora bez śladu | WYM-SOC-1, WYM-35 |
| SOC-12 | brak zatwierdzonych polityk | WYM-SOC-1, WYM-30 |
| SOC-13 | brak kodeksu, szkoleń, potwierdzeń | WYM-SOC-1, WYM-47 |
| SOC-14 | brak niezależnej oceny kontroli | WYM-SOC-1, WYM-10 |
| SOC-15 | brak rejestru ryzyk | WYM-SOC-1, WYM-50 |
| SOC-16 | brak procedury i rejestru incydentów | WYM-SOC-1, WYM-52 |
| SOC-17 | brak centralnych logów i retencji; audyt 12 mies. | WYM-SOC-1, WYM-71 |
| SOC-18 | brak zarządzania dostawcami | WYM-SOC-1, WYM-40 |
| SOC-19 | brak skanowania podatności; MinIO; Renovate | WYM-SOC-1, WYM-50 |
| SOC-20 | brak kanału zgłaszania podatności | WYM-SOC-1 |
| SOC-21 | brak pełnej kopii poza hostem | WYM-SOC-2, WYM-51 |
| SOC-22 | odtwarzanie sprawdzone raz | WYM-SOC-2, WYM-51 |
| SOC-23 | RTO/RPO nieaktualne; brak BIA | WYM-SOC-2 |
| SOC-24 | 99,9 % w regulaminie bez pomiaru | WYM-SOC-2 |
| SOC-25 | bramka wydania niezaliczona; KSeF nie fail-closed | WYM-SOC-3, WYM-37 |
| SOC-26 | wyniki kontroli PI niearchiwizowane | WYM-SOC-3, WYM-74 |
| SOC-27 | brak polityki klasyfikacji | WYM-SOC-4 |
| SOC-28 | rotacja klucza KSeF niewykonana | WYM-SOC-4, WYM-50 |
| SOC-29 | usuwanie niepełne | WYM-SOC-4, WYM-73, WYM-45 |
| SOC-30 | zrzuty nieszyfrowane; linki-okaziciele | WYM-SOC-4, WYM-50 |
| SOC-31 | polityka z placeholderem, akceptacja bez wersji | WYM-SOC-5, WYM-18, WYM-X-01 |
| SOC-32 | zgody przeglądarkowe niedomknięte | WYM-SOC-5, WYM-14, WYM-63 |
| SOC-33 | prawa osób niedomknięte | WYM-SOC-5, WYM-21, WYM-23, WYM-25, WYM-28, WYM-75 |
| SOC-34 | retencja bez reguł | WYM-SOC-5, WYM-71 |
| SOC-35 | brak umów powierzenia, listy procesorów; transfer; naruszenia | WYM-SOC-5, WYM-41, WYM-43, WYM-60, WYM-52 |
| SOC-36 | kanał skarg do prywatnych skrzynek | WYM-SOC-5, WYM-17 |

### 11.8. Ustalenia, dla których dodano WYM-X

| WYM-X | Ustalenia | Dlaczego katalog nie wystarczał |
|---|---|---|
| WYM-X-01 | ZGD-04, SOC-31 (część) | katalog nie zawiera wymagania udostępnienia i wykazania akceptacji regulaminu ani wersjonowania dokumentów prawnych; WYM-18 obejmuje tylko informację z art. 13 |
| WYM-X-02 | DOW-19, MIN-09 (część), PRC-07 (część) | publikacja danych infrastruktury i danych z produkcji w publicznym repo oraz w kontekście agentów to odrębna praktyka; WYM-37 dotyczy środowisk testowych, WYM-50 jest ogólne |
| WYM-X-03 | INW-05, MIN-01 | katalog nie obejmuje art. 87 RODO (krajowy numer identyfikacyjny), na który powołują się oba ustalenia; WYM-06 i WYM-32 nie oddają szczególnego charakteru PESEL |

### 11.9. Liczby

| Raport | Ustalenia | Przypisane do WYM |
|---|---|---|
| `02` (INW) | 19 | 19 |
| `04` (PRC) | 17 | 17 |
| `A1` (MIN, ZGD) | 24 | 24 |
| `A2` (PRA, RET, AI) | 29 | 29 |
| `A3` (DOW) | 23 | 23 |
| `A4` (RUN) | 11 | 11 |
| `06` (SOC) | 36 | 36 |
| **Razem** | **159** | **159** |

Ustaleń: **159**. Przypisanych do co najmniej jednego WYM: **159**.
Nowych wymagań WYM-X: **3** (WYM-X-01 – WYM-X-03; powstały dla 7 ustaleń,
z których każde ma też co najmniej jedno WYM z katalogu dla pozostałych
aspektów). Ustaleń bez żadnego WYM: **0**.

## 12. Podsumowanie

### 12.1. Liczba wymagań wg stanu i obszaru

| Obszar | potwierdzone | częściowe | brak | niezweryfikowane | nie dotyczy | Razem |
|---|---|---|---|---|---|---|
| A — inwentarz i klasyfikacja | 0 | 4 | 0 | 1 | 0 | 5 |
| B — minimalizacja i ustawienia domyślne | 0 | 11 | 1 | 0 | 0 | 12 |
| C — podstawy, informacje, zgody, cookies | 0 | 7 | 8 | 0 | 0 | 15 |
| D — prawa osób **[R5a]** | 0 | 10 | 2 | 0 | 0 | 12 |
| E — retencja i usuwanie | 0 | 2 | 7 | 0 | 0 | 9 |
| F — procesorzy, lokalizacje, transfery | 0 | 3 | 4 | 2 | 0 | 9 |
| G — dokumenty i dowody | 0 | 1 | 11 | 1 | 0 | 13 |
| SOC — kategorie SOC 2 | 1 | 5 | 1 | 0 | 0 | 7 |
| WYM-X — dodatkowe | 0 | 1 | 2 | 0 | 0 | 3 |
| **Razem** **[R5a]** | **1** | **44** | **36** | **4** | **0** | **85** |

Z katalogu (82 wymagania): potwierdzone 1, częściowe 43, brak 34,
niezweryfikowane 4, nie dotyczy 0 **[R5a]**. Jedyne „potwierdzone” (WYM-SOC-7)
dotyczy braku nieuprawnionych deklaracji SOC 2, nie wdrożonej kontroli.
Żadne wymaganie nie ma stanu „nie dotyczy” — dla art. 8, 10, 22 i 26 brak
zapisanej oceny (WYM-16, WYM-29, WYM-39); WYM-29 zmieniony z „nie dotyczy”
na „częściowe” po recenzji R5a (R5a-U03) **[R5a]**.

Obraz ogólny: mechanizmy techniczne istnieją w obszarach B i D (stan
„częściowe”), a obszary E (retencja) i G (dokumenty, dowody) są w większości
puste. Obszar C łączy działający baner zgody (potwierdzony runtime) z
brakiem podstaw dokumentacyjnych (administrator, mapa celów, polityka).

**Rozkład ryzyka (85 wymagań, „obecne → K1”):** W → W: 8; Ś → W: 35;
Ś → Ś: 10; N → W: 4; N → Ś: 22; N → N: 6. Ryzyko obecne „wysokie” mają:
WYM-09, WYM-18, WYM-19, WYM-24, WYM-36, WYM-45, WYM-51, WYM-73.

### 12.2. 15 najważniejszych ryzyk

Kolejność: najpierw ryzyka wysokie już dziś, potem wysokie od pierwszego
klienta, w obrębie grupy — według skali skutku dla osób.

| # | Wymagania | Ustalenia | Ryzyko (jedno zdanie) |
|---|---|---|---|
| 1 | WYM-24, WYM-73 | PRA-02, PRA-03, INW-02, AI-03, DOW-06 | Usunięcie konta jest niekompletne (czat, listy e-mail, pliki, dostawcy, kopie), a ścieżka operatora — jedyna dla żądań e-mailowych — przerywa się na wyzwalaczu dziennika audytu po częściowych skutkach. |
| 2 | WYM-45 | PRA-04, RET-04, RET-11, DOW-17, SOC-29 | „Usuń organizację” obiecuje nieodwracalne usunięcie po 30 dniach, ale `hard_delete_at` nie ma wykonawcy, organizacja dalej jest przetwarzana (skrzynka KSeF, AI), a klient nie ma pełnego eksportu przed odejściem. |
| 3 | WYM-36, WYM-09 | RUN-08 | Proxy `/ingest` i `/monitoring` przekazują dostawcom telemetrii nagłówki przeglądarki z ciasteczkami sesji pierwszej strony (Sentry niezależnie od zgody). |
| 4 | WYM-51, WYM-SOC-2 | SOC-21, SOC-22, DOW-22, PRC-14 | Nie ma pełnej kopii obu baz i magazynu plików poza hostem źródłowym, a odtworzenie sprawdzono raz, tylko dla bazy. |
| 5 | WYM-19, WYM-18 | ZGD-03, ZGD-12, PRC-01, PRC-02, PRC-03, INW-17, RUN-11, DOW-02 | Publiczna polityka nie wskazuje administratora (placeholder), a polityka i strona RODO deklarują lokalizacje, dostawców, SCC, szyfrowanie, audyt dostępu i okresy, których kod i infrastruktura nie potwierdzają. |
| 6 | WYM-08, WYM-71 | INW-01, INW-03, RET-05, RET-06, RET-12, AI-03 | Większość kategorii danych (koszty, czat, zdjęcia dokumentów, eksporty, importy, newsletter, rejestr żądań) nie ma okresu ani wykonawcy usunięcia. |
| 7 | WYM-72 | INW-04, RET-09 | Odtworzenie z kopii przywraca dane usunięte po dacie kopii, bo procedura nie ponawia usunięć, a lokalne zrzuty są nieszyfrowane. |
| 8 | WYM-41, WYM-43 | ZGD-02, PRC-05, SOC-35 | FaktFlow przetwarza dane kontrahentów klientów bez umowy powierzenia i bez listy dalszych procesorów zaakceptowanej przez klientów. |
| 9 | WYM-11, WYM-12, WYM-55 | ZGD-01, DOW-20 | Brak mapy cel → podstawa, testów uzasadnionego interesu i screeningu DPIA, choć przetwarzanie obejmuje dane finansowe i modele językowe. |
| 10 | WYM-37, WYM-SOC-3 | PRC-17, SOC-25, SOC-06 | Produkcja działa z `KSEF_ENV=test`, a kod domyślnie wybiera `test`; pierwsze prawdziwe faktury trafiłyby do środowiska testowego KSeF. |
| 11 | WYM-62, WYM-42, WYM-60 | PRC-06, AI-01, INW-06, ZGD-08, AI-05 | Dane sprzedawców (w tym JDG) i dokumenty kosztowe trafiają automatycznie do modelu w USA bez wyboru klienta, bez TIA i bez informacji w interfejsie. |
| 12 | WYM-35, WYM-47 | DOW-08, SOC-11, MIN-05, DOW-05, DOW-23, SOC-07 – SOC-09, PRC-07 | Odczyty danych klientów przez operatorów nie zostawiają śladu, dostępy nie są przeglądane, konto dostawcy jest współdzielone, a agenci AI mają dostęp do produkcji bez ujęcia w liście procesorów. |
| 13 | WYM-34 | PRC-09, MIN-08 | Projekt PostHog ma włączone nagrania, konsolę i czasy sieci wbrew kodowi (2 nagrania o nieznanym źródle), a odrzucanie IP zależy od nieodczytanego ustawienia. |
| 14 | WYM-68, WYM-73 | RET-01, RET-02, INW-18 | Retencja faktur „10 lat” to założenie bez podstawy, liczone od dnia joba, a przy pierwszym terminie pliki znikną, zanim wyzwalacz zablokuje usunięcie wiersza. |
| 15 | WYM-17, WYM-21, WYM-75 | PRA-09, PRA-11, DOW-04, PRC-08 | Osoby bez konta (największa grupa) nie mają procedury, wyszukiwania ani rejestru żądań, a kanał e-mailowy trafia do prywatnych skrzynek. |

Poza listą, bezpośrednio za nią: PESEL domyślnie w formularzu i w wielu
magazynach (WYM-X-03 — MIN-01, INW-05); brak wycofania zgody analitycznej
w interfejsie (WYM-14 — RUN-03, ZGD-05); marketing w modelu wypisu
(WYM-66 — ZGD-06).

### 12.3. Sprzeczności między raportami i rozstrzygnięcia

| # | Sprzeczność | Rozstrzygnięcie | Podstawa |
|---|---|---|---|
| 1 | INW-05: „Domyślny typ to brak ID (`actions.ts:413`)”; MIN-01: interfejs domyślnie wybiera PESEL | rację ma MIN-01 dla interfejsu; `no_id` to tylko wartość zapasowa serwera. WYM-X-03 = brak | kod 13.10: `components/invoices/invoice-form.tsx:437` (`'pesel'` przy wyborze osoby prywatnej), `:774` (`?? 'pesel'`), `components/invoices/actions.ts:413` (`?? 'no_id'`) |
| 2 | INW-11: fonty **i obrazy** Google przy każdej wizycie; MIN-12: obrazy nie są ładowane | rację ma MIN-12: ładowany jest tylko arkusz Material Symbols | grep 13.10: brak importerów `ff-assets` / `FF_DASHBOARD_` poza plikiem definicji; arkusz w `app/layout.tsx:114-125` |
| 3 | INW-02: skutek wyzwalacza „prawdopodobny”; PRA-03: „potwierdzone mechanizmem” | ten sam wniosek o różnej pewności; potwierdzony na schemacie syntetycznym (R1, `A2`), produkcja niezweryfikowana. WYM-24 częściowe z nieczynną ścieżką operatora | `00052…sql:16-41`; N-A2-01 |
| 4 | Dostęp operatorów: INW-15, MIN-05 — ryzyko średnie; DOW-08, SOC-11 — wysokie (po R4) | różne punkty odniesienia (`02`/`A1` — stan obecny; `A3`/`06` — także gotowość i usługa). Macierz: WYM-35 obecne Ś, K1 W | sekcja 1.1 |
| 5 | Przeglądy dostępów i upoważnienia: DOW-05, SOC-07 – SOC-09 — wysokie; DOW-23 — średnie | WYM-47: obecne Ś, K1 W — przy deklarowanym braku klientów skutek dla osób jest mniejszy; dla gotowości SOC 2 wysokie (WYM-SOC-1) | sekcja 1.1 |
| 6 | Kopie: PRC-14 — średnie (prywatność neutralna); INW-04, RET-09 — wysokie; SOC-21, DOW-22 — wysokie | rozdzielone na dwa wymagania: WYM-51 (dostępność, art. 32 ust. 1 lit. c) obecne W; WYM-72 (powrót usuniętych danych) obecne Ś, K1 W | PRC-14 ocenia lokalizację, INW-04 — skutek odtworzenia |
| 7 | Osoby bez konta: PRA-09 — „brak”, wysokie; DOW-04 — „częściowe”, średnie (kanał przyjęcia z klasyfikacją istnieje) | oba prawdziwe dla innego zakresu: kanał przyjęcia zaprojektowany (`ops/poczta/worker.mjs:15-16`, test 6/6), działanie niezweryfikowane (N-DOW-09); procedury i wyszukiwania brak. WYM-17, WYM-21 częściowe; ryzyko obecne Ś, K1 W | `A3` § 1.3 |
| 8 | Newsletter: INW-14 — niskie; ZGD-06 — średnie | ZGD-06 obejmuje też e-mail 8. dnia próby z treścią handlową, który działa dziś. WYM-66 obecne Ś | `lib/jobs/runners/email-sequence.ts:151-168` |
| 9 | Anthropic: INW-06 — średnie; PRC-06 — wysokie | `04` ocenia stan po starcie sprzedaży. WYM-62 obecne Ś, K1 W | `04` § 2 (zastrzeżenie o skali) |
| 10 | Polityka: INW-17 — średnie; ZGD-03, PRC-01 — wysokie | WYM-18 obecne W — publiczna polityka bez tożsamości administratora działa niezależnie od liczby klientów | `polityka-prywatnosci/page.tsx:20` |
| 11 | Retencja faktur: INW-18 „częściowe”; RET-02 „brak” | różna ziarnistość: reguła istnieje (INW-18), mechanizm usuwania wysłanych faktur nie zadziała (RET-02). WYM-68 brak (podstawa okresu), WYM-73 częściowe | `00132…sql:63-73` (odczyt 13.10: blokada `DELETE` przy `submitted_to_ksef_at` lub `offline_idempotency_key`, bez wyjątku dla roli serwisowej) |
| 12 | FLO: INW-06 „model FLO nieaktywny”; INW-10 „FLO aktywny”; `docs/audyt/blok-1/KONTEKST-REPO.md` „niewdrożony” | bez sprzeczności merytorycznej: część regułowa aktywna (crony), część z modelem nieaktywna i strzeżona testem (AI-04); dokument bloku 1 nieaktualny | `lib/jobs/queues.ts:100,104`; `tests/unit/flo-nieaktywne.test.ts:22-41` |
| 13 | SEC-D-01 „zamknięte w kodzie” (MIN-08); PRC-09 — replay włączony | kod i panel to dwa różne miejsca: kod wyłącza nagrania, panel je włącza. WYM-34 brak (poziom dowodu: odczyt operatora [PR225 @a72b567]) | `init-posthog-browser.ts:37`; `01` § 4 |
| 14 | Strona RODO „Brak cookies analitycznych”: ZGD-12 — sprzeczne; RUN-11 — „formalnie prawda” (PostHog w pamięci) | deklaracja myląca: analityka działa po zgodzie, a sesje Sentry bez zgody. WYM-19 brak | `rodo/page.tsx:47`; RUN-04 |
| 15 | Numery linii: RUN-11 podaje „Cookies sesji” w `polityka-prywatnosci/page.tsx:231`; A1, WYM-19 — `:232`. WYM-53 cytuje `rodo/page.tsx:61-65`, P-03 — `:63-64` | poprawne: `:232` (sesja), `:231` (logi audytu), `rodo/page.tsx:64` (72 godzin); macierz używa linii sprawdzonych 13.10 | grep 13.10 |
| 16 | Wymagane kontrole CI: `AGENTS.md` — 11; ruleset — 9 (DOW-12, SOC-03) | to niezgodność dokumentu ze stanem, nie raportów; macierz przyjmuje odczyt API z `A3`/`06` (9) | `A3` § 3.2 |
| 17 | Okres faktur: `AGENTS.md` i polityka — 10 lat (art. 70 § 1 OP); wg wiedzy modelu przepis daje 5 lat | nierozstrzygnięte prawnie — macierz nie ustala okresu; WYM-68 brak, zależność Q-ZR-02 | N-ZR-06 |
| 18 | Retencja audytu: kod 12 mies.; komentarz tabeli 10 lat; ADR 0006 „muszą zostać”; [PR225] 13 mies./10 lat | sprzeczność wewnątrz projektu, nie raportów; WYM-71 brak, decyzja o klasach retencji | `00001…sql:174`; `cleanup-audit-logs.ts:19` |

## 13. Niewiadome i ograniczenia

Niewiadome z raportów, które najmocniej wpływają na stany i ryzyka w tej
macierzy (pełne listy: `02` § 7, `03` § 5.1, `04` § 6, `A1`, `A2`,
`A3` § 8, `06` § 10):

| ID | Niewiadoma | Wpływ na macierz |
|---|---|---|
| N-01 | podmiot prawny operatora (administrator) | wszystkie wymagania z adresatem FF-A; treść polityki, umowy powierzenia i rejestrów (WYM-01, WYM-18, WYM-41, WYM-48) |
| N-PRC-10 | czy na produkcji są dane prawdziwych osób; czy coś trafiło do testowego KSeF | wartość ryzyka „obecne” w całej macierzy; przy odpowiedzi „tak” obowiązuje K1 |
| N-PRC-01, N-DOW-05 | umowy z dostawcami (DPA, SCC, DPF) | WYM-40, WYM-43, WYM-59 – WYM-62 — stan „brak” lub „niezweryfikowane” może się zmienić |
| N-PRC-02, NA1-02, NA1-03 | ustawienia paneli PostHog, Sentry, Resend, Anthropic | WYM-34, WYM-36, WYM-63 |
| N-DOW-01 | dokumenty poza repo (rejestry, umowy, przeglądy, rejestr naruszeń) | obszar G — „brak” znaczy „nie znaleziono w repo” |
| N-A2-01, N-A2-13 | czy wyzwalacze na produkcji mają postać z migracji | WYM-24, WYM-45, WYM-73 (test na schemacie syntetycznym) |
| N-INW-01, N-A2-06 | schemat i retencja `auth.*` GoTrue | WYM-03, WYM-21, WYM-24 |
| N-A2-12, N-INW-15 | zawartość i retencja logów w bazie `_supabase` | WYM-36, WYM-71 |
| N-DOW-09 | czy działa routing poczty i klasyfikacja żądań | WYM-17 |
| NA1-08, NS-08 | szyfrowanie dysków i MinIO | WYM-50, WYM-SOC-4 |
| N-ZR-01 – N-ZR-06 | brzmienie przepisów (RODO, PKE, UŚUDE, VAT, OP), status wytycznych EDPB | klasy P/O i treść zmian w obszarach C, E; okresy retencji |

Ograniczenia tej macierzy:

- Stany wynikają z ustaleń raportów (po recenzjach) i z kontrolnych
  odczytów kodu na `3e5e00d`. Produkcja działa według [PR225 @a72b567]
  na nowszym kodzie (`43091e7`, przebudowa importu) — odwołania
  `ścieżka:linia` w `lib/import/*` mogą nie pasować (`01` § 2).
- Brak dostępu do produkcji, paneli i umów; fakty runtime z PR #225 to
  deklaracja lub pomiar operatora. Test przeglądarkowy (`A4`) opisuje build
  lokalny, nie produkcję, i nie obejmuje stron po zalogowaniu.
- Przepisy, wytyczne i kryteria AICPA — z pamięci modelu [NZ]. Klasy P/O
  oraz kolumna „Źródło” wymagają potwierdzenia w końcowym review.
- Skala ryzyka jest oceną ekspercką audytu, nie oceną skutków w rozumieniu
  art. 35 RODO.
- „Zmiana” i „Test” to propozycje do planu, nie decyzje; tam, gdzie
  zależą od okresu retencji, podstawy prawnej lub treści umowy, wskazano
  zależność zamiast brzmienia.
- Niezależna recenzja: R5a (13.10.2026), werdykt dla tego pliku
  „zatwierdzony z uwagami”; uwagi naniesione przez redaktora poprawek —
  zob. „Historia recenzji” na końcu pliku. Autor nie zatwierdzał własnego
  etapu **[R5a]**.
- Recenzja R5a sprawdziła stany ustaleń w raportach źródłowych na próbce
  (16 ustaleń) i 15 wierszy macierzy, nie wszystkie 159 ustaleń
  i 85 wierszy słowo po słowie; pozostałe stany przyjęto z raportów po
  recenzjach R1–R4 **[R5a]**.

## 14. Co sprawdziłem / czego nie

**Sprawdziłem (13.10.2026):**

- `BRIEF.md` z ADDENDUM 1–3 i `00-ZADANIE.md` — w całości.
- Katalog `03` § 3 (82 wymagania), § 4–5 — w całości; raporty `02`, `04`,
  `A1`, `A2`, `A3`, `A4`, `06` — tabele ustaleń, szczegóły ustaleń,
  niewiadome, pytania do review i historie recenzji; `01` § 2, § 5.
- Historie recenzji wszystkich raportów: uwagi R1–R4 są oznaczone jako
  naniesione; nie stwierdziłem uwag pominiętych.
- Programowo: 159 ID ustaleń w raportach = 159 ID w sekcji 11 (bez
  braków i nadmiarów); 82 WYM z katalogu = 82 wiersze macierzy (+3 WYM-X);
  liczby stanów w sekcji 12.1 policzone z tabel.
- W kodzie (`3e5e00d`), dla rozstrzygnięcia sprzeczności i potwierdzenia
  dowodów: domyślny typ identyfikatora nabywcy
  (`components/invoices/invoice-form.tsx:430-440,770-776`,
  `components/invoices/actions.ts:410-415`); linie deklaracji w
  `polityka-prywatnosci/page.tsx` (20, 76, 79, 85, 99, 106-108, 118, 186,
  192-202, 215, 222, 229-233) i `rodo/page.tsx` (20, 23, 39, 43, 47, 54,
  56, 64); brak importerów `ff-assets`; arkusz fontu w `app/layout.tsx:112-126`;
  zapisy `hard_delete_at` (tylko dwa, bez czytelnika);
  wyzwalacz `00132_ksef_lifecycle_guard_tighten.sql:60-75`; domyślne
  `KSEF_ENV` w `submit-invoice.ts:628` i `ksef-submit-enqueue.ts:127`;
  brak `baseURL`/`inference_geo` w `lib/anthropic/client.ts`; szablon PR
  (`.github/pull_request_template.md`, 36 linii, sekcje bez pola
  o danych osobowych); brak deklaracji „SOC 2” w `app`, `components`,
  `content`, `lib`; istnienie pliku z DOW-19 (bez odczytu treści) i zdania
  o akceptacji regulaminu w `app/(auth)/register/page.tsx:164-173`; brak
  słów „regulamin”/„polityk” w `app/(auth)/login/page.tsx`.

**Nie sprawdziłem / nie mogłem sprawdzić:**

- Produkcji (baza, MinIO, logi, Coolify), paneli dostawców i umów — brak
  dostępu; plików gałęzi PR #225 nie czytałem samodzielnie (fakty z raportów
  i briefu).
- Źródeł prawa, wytycznych EDPB/UODO i AICPA — egress zablokowany; bez
  WebSearch.
- Testów: nie uruchamiałem testów repo ani uprzęży `A4` (wyniki przyjęte
  z `A3` § 4 i `A4` § 3 po recenzjach R3, R4).
- Każdego `ścieżka:linia` z raportów — powtórzyłem tylko odczyty wymienione
  wyżej; pozostałe przyjąłem z raportów zrecenzowanych przez R1–R4.
- Pliku `09-MATERIALY-ROBOCZE.md` (szkic w budowie) — przywołuję tylko
  numery jego sekcji jako miejsce zmian.

Poza tym plikiem nie zmieniałem niczego w repo; nie commitowałem i nie
pushowałem.

