# 08 — Rejestr niewiadomych i materiały do końcowego review prawnego

| | |
|---|---|
| Etap | Rejestr niewiadomych i materiałów do końcowego review prawnego (pkt 1 i pkt 7 zadania, ostatni punkt listy „Wymagany wynik”) |
| Autor | agent NIEWIADOME (synteza; subagent koordynatora) |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza @ `22a8ea5` różni się od `3e5e00d` wyłącznie plikami w `docs/audyt/` — `git diff --quiet 3e5e00d HEAD -- ':(top)' ':(top,exclude)docs/audyt'` = 0, sprawdzone 13.10.2026) |
| Zakres | (1) rejestr niewiadomych N-01 – N-41, zdeduplikowany ze wszystkich raportów i recenzji, z tym, co blokują, jakim dowodem i przez kogo je rozstrzygnąć, priorytetem i wpływem na start implementacji; (2) rejestr pytań do końcowego review prawnego Q-01 – Q-44 z roboczą interpretacją (założenie do potwierdzenia), podstawami i wpływem na plan; (3) materiały dla prawnika: pliki audytu, lista kontrolna wszystkich źródeł pierwotnych oznaczonych [NZ] z tezami, które od nich zależą, projekty z `09`; (4) czego niewiadome nie blokują; (5) ograniczenia dowodowe audytu |
| Źródła | `00-ZADANIE.md`; `01-STAN-I-GRANICE.md` § 4–7; `02-INWENTARZ-I-PRZEPLYWY.md` § 7–8; `03-REJESTR-ZRODEL.md` § 1–5; `04-PROCESORZY-I-LOKALIZACJE.md` § 2, 4–8; `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` (niewiadome NA1, pytania QA1, MIN-03, MIN-06); `A2-MECHANIZMY-PRAWA-RETENCJA.md` (N-A2, pytania 1–10, kolejność); `A3-DOWODY-I-TESTY.md` § 6–10 (N-DOW, P-NN); `A4-TEST-COOKIES-I-SIECI.md` § 1, 7–9; `06-SOC2.md` § 8.6–12 (NS, pytania 1–5); `05-MACIERZ-WYMAGAN.md` § 1, 10, 12–14 i kolumna „Zależność” (odczyt programowy); `09-MATERIALY-ROBOCZE.md` § 0, 4, 13–14; recenzje R1–R4 (`R1.md` § 7–8, `R2.md` § 8–9, `R3.md` § 8, `R4.md` § 9–10 — scratchpad sesji); **[R5b]** `R2-runda1.md` § 6–7 (dopisane przez redaktora poprawek po R5b-U01); `BRIEF.md` z ADDENDUM 1–3; kontrolne odczyty kodu na `3e5e00d` (§ 8) |
| Ograniczenia | Synteza raportów, nie nowe badanie. Brak dostępu do produkcji, paneli i umów dostawców. Przepisy, wytyczne i kryteria AICPA — z pamięci modelu [NZ]: „niezweryfikowane online 13.10.2026 (egress zablokowany) — treść wg wiedzy modelu, do potwierdzenia w końcowym review”. WebSearch nie był używany (decyzja właściciela z 7.10). **[R5b]** Powiązania z planem `07` (§ 2.8, § 3.11, § 5) autor oparł na wersji `07` z ok. 12:49 UTC; recenzent R5b sprawdził je na końcowej wersji `07` (13.10) — zgodne; redaktor poprawek uzupełnił § 2.8 o pozycję D-16 dodaną w `07` po recenzji R5a |
| Stan | po recenzji R5b („zatwierdzony z uwagami”) i naniesieniu jej uwag przez redaktora poprawek 13.10.2026 — zob. „Historia recenzji” **[R5b]**; autor nie zatwierdzał własnego etapu |

> **Ten plik nie jest opinią prawną.** Kolumna „Interpretacja robocza”
> zawiera **założenia do potwierdzenia** przez prawnika w końcowym review,
> nie ustalenia. Zgodnie z pkt 1 zadania postęp nie zależy od konsultacji
> prawnych: niewiadome i pytania blokują tylko wnioski i działania, które
> od nich zależą (§ 5).

## 1. Jak czytać rejestr

| Element | Znaczenie |
|---|---|
| **N-NN** | niewiadoma — brakujący **fakt** (stan produkcji, ustawienie panelu, treść umowy, decyzja organizacyjna, brzmienie źródła). Rozstrzyga ją dowód, nie interpretacja |
| **Q-NN** | pytanie do końcowego review prawnego — **interpretacja** przepisu albo kwalifikacja faktu. Rozstrzyga je prawnik |
| ID źródłowe | identyfikatory z raportów i recenzji: N-01 (`01` § 5), N-INW (`02` § 7), N-ZR i Q-ZR (`03` § 5), N-PRC (`04` § 6), „`04` pyt. n” (`04` § 7), NA1 i QA1 (`A1`), N-A2 i „`A2` pyt. n” (`A2`), N-DOW i P-NN (`A3` § 8–9), „`A4` § 7” i „`A4` pyt. n” (`A4`), NS i „`06` pyt. n” (`06` § 10–11), „`02` pyt. n” (`02` § 8), N-09-NN (`09` § 14), R1-N, N-R2, NR4, PR4 i wiersze R3 (pliki recenzji) |
| Co blokuje | wymagania z macierzy `05` (WYM-NN, WYM-X-NN, WYM-SOC-N), których kolumna „Zależność” wskazuje dane ID źródłowe (odczyt programowy, § 8) — uzupełnione ręcznie o wymagania wynikające z treści ustaleń; ustalenia z raportów (INW, PRC, MIN, ZGD, PRA, RET, AI, DOW, RUN, SOC) i sekcje `09`. Powiązanie z etapami planu `07` (E-NN, pozycje D-NN etapu E-00) — osobno w § 2.8 i § 3.11 |
| Kto dostarczy | **właściciel** — decyzje organizacyjne, konta dostawców, dokumenty spoza repo; **operator (SSH)** — odczyt produkcji skryptem w `scripts/ops/` (liczby, nazwy, konfiguracja; bez danych osobowych i bez wartości sekretów w wyniku); **dostawca** — dokumenty lub odpowiedzi dostawcy; **prawnik** — końcowe review; **zespół** — rozstrzygalne w repo albo na środowisku z danymi syntetycznymi (etap wykonawczy) |
| Priorytet | **P1 — przed pierwszym klientem** (przed przyjęciem danych prawdziwych osób albo przed publikacją dokumentu, który od tego zależy; przy stronach publicznych i funkcjach działających dziś — już teraz); **P2 — wkrótce** (w trakcie pierwszych etapów wykonawczych); **P3 — później** (przed włączeniem konkretnej funkcji, przed badaniem SOC 2 albo przy okazji) |
| Blokuje start implementacji | **nie** — zmiany można zacząć bez rozstrzygnięcia; **częściowo** — blokuje wskazaną część (zwykle treść dokumentu albo wartość parametru), a nie mechanizm; **tak** — nie stwierdzono takiej niewiadomej |
| Interpretacja robocza | **założenie do potwierdzenia**. Przy każdej podaję źródło propozycji: „wg Q-ZR-01” itp. albo „propozycja 08” (sformułowana w tym pliku na podstawie ustaleń raportów) |
| [NZ] | przepis, wytyczna lub fakt o dostawcy z pamięci modelu: „niezweryfikowane online 13.10.2026 (egress zablokowany) — treść wg wiedzy modelu, do potwierdzenia w końcowym review” |
| [PR225] | „PR #225 (niescalony), plik:sekcja — pomiar/deklaracja operatora, niezweryfikowane w tej sesji”; [PR225 @a72b567] — odczyt SSH i paneli z 10.10.2026 |
| Klasy | **P** obowiązek prawny, **O** interpretacja organu, **S** kryterium SOC 2, **I** praktyka inżynierska |

**Stan recenzji materiałów wejściowych (sprawdzone 13.10.2026).** Każdy
raport ma w „Historii recenzji” wpis o naniesieniu wszystkich uwag swojej
grupy: `02` — R1 (14/14); `03`, `04` — R2 runda 1 i 2; `A1`, `A2`, `A4` —
R3; `A3`, `06` — R4 (R4-U07, R4-U12 częściowo, z uzasadnieniem); `01` —
R4-U30 (uwagi R1 do `01` naniesione w treści — `05` § 1). Sekcje „Pytania
do końcowego review” recenzji porównałem z raportami:

| Recenzja | Pytania | Stan w raportach | Gdzie w tym rejestrze |
|---|---|---|---|
| R1 § 8 | 2 (usunięcie organizacji, logi Supabase) | naniesione do `02` § 8 | Q-19, Q-26 |
| R2 § 9 | 4 (testowy KSeF, nagrania PostHog, skróty i UUID u odbiorców, śledzenie otwarć Resend) | **nie przeniesione** do `04` § 7 (sprawdzone `grep` — tematy są w ustaleniach PRC-09, PRC-11, PRC-17, N-PRC-02, N-PRC-10, ale nie jako pytania) | **uwzględnione tutaj:** Q-37 (pkt 1–2), Q-30 (pkt 3), Q-04 (pkt 4) |
| **[R5b]** R2 runda 1 § 7 (`R2-runda1.md`) | 4 (testowy KSeF; C-40/17 — Google przy fontach i PostHog przy `/ingest`; odbiorcy z nazwy w odpowiedzi z art. 15; Data Act rozdz. VI) | pyt. 1, 3, 4 przeniesione (Q-37, Q-16, Q-44); pyt. 2 częściowo — wątek Google w Q-03 i Q-14; **wątek PostHog nie miał pytania do review** — w raportach tylko kolumna zastosowania `03` ZR-68 („PostHog przez `/ingest`”), bez pytania i bez ustalenia (sprawdzone `grep` „C-40/17”, „ZR-68”, „współadministr” w `02`–`09`, `A1`–`A4`) | Q-37, Q-16, Q-44; Q-03 (uzupełnione o PostHog), Q-14 |
| R3 § 8 | 2 (usuwanie wiersza faktury z KSeF, zamrożenie danych nabywcy) | naniesione do `A2` pyt. 1 (zd. ost.) i pyt. 10 | Q-21 |
| R4 § 10 | 3 (PR4-01 – PR4-03) | naniesione do `A3` jako P-10 – P-12 | Q-34, Q-18, Q-23 |

Niewiadome recenzentów (R1-N01 – R1-N05, N-R2-01 – N-R2-05, wiersze R3 § 8,
NR4-01 – NR4-05) są w § 2 albo w § 6 (ograniczenia), z odnośnikiem.
**[R5b]** Niewiadome rundy 1 R2 (`R2-runda1.md` § 6) mają te same ID
(N-R2-01 – N-R2-04) co niewiadome rundy 2, ale inną treść; odwzorowane
osobnym wierszem w § 2.7. Gdzie w tym pliku występuje samo „N-R2-NN”,
chodzi o rundę 2 (`R2.md` § 8), chyba że zaznaczono „runda 1”.

## 2. Rejestr niewiadomych (N-NN)

**Liczby.** 41 niewiadomych po deduplikacji ze 130 pozycji źródłowych
(raporty, `09`, 8 ograniczeń z `A4` § 7 i 21 pozycji z recenzji R1–R4). Priorytet: **P1 — 15** (N-01, N-02,
N-03, N-06, N-07, N-08, N-10, N-12, N-14, N-16, N-17, N-18, N-23, N-24,
N-26) oraz N-37 częściowo; **P2 — 17** oraz N-25 i N-39 częściowo;
**P3 — 6**. Główny dostarczyciel dowodu: operator z dostępem SSH lub do
paneli — 15, właściciel — 12, zespół (repo, dane syntetyczne) — 10,
prawnik — 3, właściciel albo prawnik — 1 (N-41). **Żadna niewiadoma nie
blokuje startu implementacji w całości;** pięć blokuje część działań
(N-01, N-06, N-07, N-14, N-37 — zwykle treść dokumentu, nie mechanizm).
**[R5b]** Liczba 130 nie obejmowała 4 niewiadomych rundy 1 R2
(`R2-runda1.md` § 6); po ich dopisaniu do indeksu (§ 2.7) pozycji
źródłowych jest 134, a liczba N-NN się nie zmienia — wszystkie cztery
mają odpowiedniki (N-37, N-08, N-17, N-16, N-10).

Pełne odwzorowanie ID źródłowych na N-NN — § 2.7.

### 2.1. Organizacja i decyzje właściciela

| ID | Niewiadoma | ID źródłowe | Co blokuje (WYM, ustalenia) | Dowód rozstrzygający | Kto | Prio | Blokuje start? |
|---|---|---|---|---|---|---|---|
| N-01 | **Podmiot prawny operatora** (administrator): nazwa, forma, siedziba, NIP; kto do czasu założenia spółki jest administratorem; kierownictwo (oświadczenie w badaniu SOC 2); liczba osób zatrudnionych (art. 30 ust. 5 [NZ]). Polityka i regulamin mają placeholder (`polityka-prywatnosci/page.tsx:20-21`, `regulamin/page.tsx:23`); `ai_todo.md` mówi o pracy „przed założeniem firmy” | `01` § 5 (N-01); N-INW-13; N-ZR-09; N-PRC-11; NA1-01; N-DOW-08; NS-01; `06` § 8.6; `09` § 14 | WYM-01, -04, -08, -10, -11, -18, -19, -30, -40, -41, -48, -49, -70, WYM-X-01, WYM-SOC-1, WYM-SOC-6; treść polityki, regulaminu, umowy powierzenia, rejestrów i listy dalszych procesorów (`09` §§ 1, 2, 6, 7, 9.3, 11); strona umów z dostawcami (N-07); każda ścieżka SOC 2 (`06` § 9.3 etap 0) | decyzja właściciela zapisana z datą (dane rejestrowe podmiotu albo data założenia i wskazanie administratora w okresie przejściowym) | właściciel | **P1** — polityka jest publiczna już dziś (WYM-18 ryzyko obecne W) | **częściowo** — blokuje publikację dokumentów i podpisanie umów; nie blokuje zmian technicznych |
| N-02 | **Czy na produkcji są dane prawdziwych osób** i czy do testowego KSeF wysłano prawdziwe dane. Deklaracja [PR225]: brak klientów, `KSEF_ENV=test`; czy rejestracja na produkcji jest otwarta (lokalny build pokazał zamkniętą — `A4` § 7) | N-PRC-10 (z dopiskiem R2); `05` § 1.1, § 13; `09` § 14 | wartość ryzyka „obecne” w całej macierzy `05` (przy „tak” obowiązuje K1); WYM-37, WYM-SOC-3; PRC-17; ocena zdarzeń z Q-37; pilność procedury naruszeń (`09` § 9) | odczyt licznikowy (organizacje i użytkownicy spoza zespołu, faktury z `submitted_to_ksef_at`, z datami; bez treści) + oświadczenie właściciela o rejestracjach z zewnątrz | operator (SSH), właściciel | **P1** — natychmiast | **nie** — zmienia kolejność: przy „tak” najpierw RUN-08, PRC-17, PRA-02/PRA-03 |
| N-03 | **Dokumenty i zapisy poza repo:** rejestry z art. 30, umowy powierzenia, TIA, rejestr naruszeń, przeglądy dostępów, upoważnienia, zobowiązania do poufności, szkolenia; dziennik napraw `docs/automation/` i rewizja z 03.10. „Brak” w obszarze G znaczy „nie znaleziono w repo” | N-DOW-01 (z dopiskiem R4); NS-12; `05` § 1, § 13 | ostateczny stan DOW-01, -03, -05, -20, -23; WYM-10, -30, -48 (także -49, -52, -55, -74); CC4.1, CC4.2 | lista dokumentów z datą, wersją i miejscem przechowywania (bez treści w publicznym repo) | właściciel | **P1** | **nie** — materiały `09` można rozwijać; jeśli dokumenty istnieją, scalić zamiast dublować |
| N-04 | **Skala docelowa:** liczba firm, kontrahentów, dokumentów OCR w horyzoncie 12–24 mies. | N-DOW-06; N-09-05 | kryterium „duża skala” WP248 (`A3` § 6.1 kryt. 5, `09` § 3 K5); WYM-55; ocena IOD (Q-39); progi ponownego screeningu DPIA | prognoza właściciela z datą | właściciel | P2 | **nie** |
| N-05 | **Czy klienci lub partnerzy oczekują raportu SOC 2** | NS-13 | decyzja `06` § 9.1; WYM-SOC-6; harmonogram Type I/II | decyzja biznesowa, zapytania klientów | właściciel | P3 | **nie** — kontrole z `06` § 8 wynikają z ryzyka usługi i warto je wdrażać niezależnie |
| N-06 | **Dyżur i godziny reakcji** na incydent: rola, zastępca, gwarantowane godziny. [PR225] F0-G08 PARTIAL, TEST-06 NOT RUN | N-09-04 | termin w procedurze naruszeń (`09` § 9.6) i w umowie powierzenia (Q-36); WYM-52, WYM-53; SOC-16 | decyzja właściciela o dyżurze + protokół ćwiczenia | właściciel | **P1** — przed umową powierzenia z klientem | **częściowo** — blokuje wpisanie terminu do umowy; nie blokuje alarmów i rejestru naruszeń |

### 2.2. Dostawcy, odbiorcy i dostęp zewnętrzny

| ID | Niewiadoma | ID źródłowe | Co blokuje (WYM, ustalenia) | Dowód rozstrzygający | Kto | Prio | Blokuje start? |
|---|---|---|---|---|---|---|---|
| N-07 | **Umowy z dostawcami i ich gwarancje:** dla Hetznera, Sentry, PostHog, Resend, Anthropic, Stripe, Cloudflare, Google, Slacka, Telegramu, AWS, GitHuba — strona umowy po obu stronach (osoba fizyczna czy spółka), plan, data i wersja zaakceptowanego DPA, mechanizm transferu (DPF/SCC), terminy powiadomień o naruszeniach, lista dalszych procesorów dostawcy, status certyfikatu DPF (lista DPF nieosiągalna — ZR-82), raporty atestacyjne; Hetzner — lokalizacja obrazów kopii i dostęp wsparcia. Odczytane dotąd tylko dokumenty publiczne (DOK-1 – DOK-12 w `04` § 8.2), które nie są umową FaktFlow | N-PRC-01; N-PRC-09; NA1-12; N-DOW-05; N-ZR-10 (częściowo zamknięte — DPA Anthropic odczytane jako DOK-3); NS-09; `09` § 14 | WYM-05, -19, -40, -43, -58, -59, -60, -61; PRC-02, PRC-04, PRC-05; TIA (`09` § 5); lista dalszych procesorów (`09` § 7); SOC-18 i metoda carve-out | kopie zaakceptowanych DPA z datą i wersją, zrzuty planu i ustawień transferu, datowany odczyt listy DPF, raporty atestacyjne ze stron zaufania | właściciel (konta), dostawcy | **P1** | **częściowo** — blokuje publikację listy dalszych procesorów, TIA i deklaracje o transferach; nie blokuje usunięcia zbędnych odbiorców (PRC-10, PRC-12, część PRC-15) |
| N-08 | **PostHog — ustawienia projektu i źródło 2 nagrań.** [PR225 @a72b567]: replay ON, console ON, network timings ON, retencja nagrań 30 dni; heatmaps ON (odczyt 06.10); **2 nagrania replay** w cyklu 17.09–17.10 o nieznanym środowisku i wersji kodu (płytka historia nie pozwala ustalić, czy kod miał wtedy nagrania — N-R2-05). **[R5b]** W kodzie `3e5e00d` ustawienie panelu nie włącza nagrań (SDK nie pobiera ustawień projektu — `advanced_disable_flags: true`, i ma `disable_session_recording: true` — `lib/analytics/init-posthog-browser.ts:37,49`; brak wywołania `startSessionRecording` w `app/`, `lib/`, `components/` — `git grep` 13.10; `A4` § 7), więc nagrania pochodzą z innej wersji kodu, innego środowiska albo innego klienta SDK — to kieruje ustalenie źródła (metadane nagrań: adres strony, wersja SDK); zawężenie hipotez, nie ustalenie (zachowania SDK nie uruchamiano). Nieodczytane: „Discard client IP data” (jedyny skuteczny mechanizm — opcja `ip: false` w SDK 1.374.3 nie działa), retencja zdarzeń w projekcie, włączone funkcje AI | NA1-02 (z dopiskiem R3); N-PRC-02 (część, z dopiskiem R2-r2); N-INW-08 (część); N-R2-02; N-R2-03 (część); N-R2-05; `09` § 14 | WYM-34 (brak), WYM-26, WYM-58, WYM-62; MIN-08, PRC-09; Q-37 (czy nagrania to naruszenie) | datowany odczyt panelu: ustawienia projektu, „Discard client IP data”, retencja, funkcje AI; metadane 2 nagrań (środowisko, adres strony, data) **bez odtwarzania treści**; zapis po wyłączeniu | operator (panel) | **P1** — natychmiast (możliwe naruszenie) | **nie** — wyłączenie replay, console, network i heatmaps oraz włączenie odrzucania IP w panelu można wykonać od razu |
| N-09 | **Sentry — region organizacji, retencja, IP, filtry po stronie Sentry.** [PR225 @a72b567]: plan Developer, retencja zdarzeń 30 dni wg dokumentacji, aktywny TTL nieodczytany; intake EU; konto i wsparcie w US [DOK-5] | NA1-03; N-PRC-02 (część); N-A2-09 (część); N-INW-08 (część) | WYM-34, -36, -26, -58, -71; LIA L-06 (`09` § 4); PRC-16 | datowany odczyt panelu: region organizacji, retencja, ustawienie przechowywania IP, filtry i scrubbing po stronie serwera | operator (panel) | P2 | **nie** — zmiany w kodzie (tunel bez nagłówków, sesje i ślady w przeglądarce wyłączone) są od tego niezależne |
| N-10 | **Resend i Anthropic — ustawienia kont.** Resend: region domeny wysyłkowej, przechowywanie treści i logów, śledzenie otwarć i kliknięć. Anthropic: obszar roboczy, domyślna geografia przetwarzania (kod nie ustawia `inference_geo` ani `baseURL` — `05` § 14), retencja (standard czy ZDR), plan komercyjny | N-PRC-02 (część, z dopiskiem R2-r2); N-R2-03 (część: śledzenie w Resend); N-A2-09 (część: retencja Resend); **[R5b]** N-R2-04 rundy 1 (`R2-runda1.md` § 6 — domyślna geografia obszaru roboczego Anthropic) | WYM-34, -36, -26, -58, -62, -71; PRC-06, PRC-11; TIA (`09` § 5); Q-04 (śledzenie otwarć) | datowany odczyt paneli | operator / właściciel | **P1** — Anthropic otrzymuje dziś dane faktur kosztowych i treść czatu | **nie** — przełącznik AI per organizacja i informacja w interfejsie są niezależne |
| N-11 | **Slack i Telegram:** retencja kanałów, kto ma dostęp, co faktycznie trafia (e-mail użytkownika przy prośbie o kontakt — `lib/support/support-actions.ts:76-83`; UUID organizacji, numery KSeF w alertach) | N-A2-14; N-INW-08 (część) | WYM-34, WYM-71; PRC-12; Q-30 | ustawienia przestrzeni Slack (retencja, członkowie kanałów), konfiguracja bota Telegram | operator | P2 | **nie** — rekomendacja „bez danych osobowych do Telegramu i Slacka” (PRC-12) jest niezależna |
| N-12 | **Cloudflare — DNS, Email Routing, skrzynka pomocy:** tryb proxy dla `faktflow.pl`, `www`, `db.`, `s3.` (wg `AGENTS.md` apex i `www` w trybie „DNS only” — deklaracja dokumentu, niezweryfikowana; `db.` i `s3.` nieznane); czy Email Routing jest włączony i do jakich dostawców i lokalizacji skrzynek `FORWARD_TO` przekazuje; czy `pomoc@` ma MX (runbook z 1.10: brak MX); czy worker `ops/poczta` (klasyfikacja żądań RODO) działa | N-PRC-04; N-INW-09; N-A2-08; N-DOW-09; NS-15; NR4-02; `09` § 14 | WYM-17; PRA-09, DOW-04, PRC-08, R-08; P8.1, SOC-33, SOC-36; Q-35 | zrzut trybu proxy rekordów (bez adresów), reguły Email Routing (bez adresów prywatnych w repo), e-mail testowy na `pomoc@` z potwierdzeniem doręczenia | właściciel (panel Cloudflare) | **P1** — polityka wskazuje ten kanał dla żądań RODO | **nie** — procedura DSAR i rejestr żądań (`09` § 8) są niezależne |
| N-13 | **Magazyny historyczne:** czy istnieją i co zawierają projekty Supabase Cloud (w tym baza deweloperska — lokalny `.env.local` celuje w inną bazę wg `AGENTS.md`), Inngest, Vercel, Cloudflare R2, Upstash; daty usunięcia; czy baza deweloperska ma wyłącznie dane syntetyczne | N-INW-16; N-PRC-06; `09` § 14 | WYM-03, WYM-37; PRC-15; zakres usuwania i wyszukiwania żądań (`09` § 8.3, RT-HIST) | lista projektów z datą usunięcia albo oświadczenie o zawartości, zrzuty paneli | właściciel | P2 | **nie** |
| N-14 | **Agenci AI z dostępem do produkcji:** kto ich uruchamia, na jakim planie (konsumencki, zespołowy, klucz API), czy trenowanie jest wyłączone, czy wyniki z produkcji trafiały do PR, issue lub plików. **[R5b]** Decyzja [PR225] z 10.10 (niewdrożona; `BRIEF.md` ADDENDUM 2): docelowo agent deweloperski z dostępem tylko do odczytu zredagowanej diagnostyki — zmienia kierunek RA-16 i RP-12 (`09`), zgodnie z `07` D-09 | N-PRC-07; `09` § 14 | WYM-05, -47, -58, -62, WYM-X-02; PRC-07; RA-16, RP-12, lista dalszych procesorów poz. 8 (`09`); Q-34 | zestawienie kont i planów z datą, stan ustawienia trenowania; przegląd historii PR i issue pod kątem danych z produkcji | właściciel, koordynator zespołu | **P1** | **częściowo** — blokuje decyzję o wpisie na listę procesorów; nie blokuje ograniczenia dostępu agentów |
| N-15 | **Kraj dostępu zdalnego** operatorów i agentów do serwerów (dostęp spoza EOG to transfer — ZR-39 [NZ]) | N-PRC-08 | WYM-58; `04` § 4.1 | oświadczenie zespołu z listą krajów (bez adresów) | właściciel / zespół | P2 | **nie** |

### 2.3. Konfiguracja i stan produkcji

| ID | Niewiadoma | ID źródłowe | Co blokuje (WYM, ustalenia) | Dowód rozstrzygający | Kto | Prio | Blokuje start? |
|---|---|---|---|---|---|---|---|
| N-16 | **Zmienne środowiskowe produkcji (nazwy, bez wartości):** `STRIPE_*`, `AWS_*` (Glacier), `SLACK_WEBHOOK_*`, `TELEGRAM_*`, `OPS_HEARTBEAT_URL` (tylko dostawca), host `UPSTASH_REDIS_REST_URL` (lokalny czy zewnętrzny), `R2_ENDPOINT`, `R2_BACKUPS_BUCKET`, `TURNSTILE_*`, `ANTHROPIC_BASE_URL`, `EMAIL_UNSUBSCRIBE_SECRET`, `NEXT_PUBLIC_POSTHOG_KEY` (bez niego baner się nie pokazuje — `A4` § 7), region DSN Sentry, `KSEF_ENV` (deklaracja: `test`); czy job `cron.archive-old-invoices` kiedykolwiek przeszedł. **Sprawdzone w tej sesji:** (a) `ANTHROPIC_BASE_URL` nie występuje w kodzie aplikacji, ale SDK `@anthropic-ai/sdk` 0.95.0 czyta ją domyślnie (`node_modules/@anthropic-ai/sdk/client.js:67`) — ustawiona zmienna przekierowałaby ruch bez zmiany kodu; (b) bez `R2_BACKUPS_BUCKET` snapshot trafia do głównego bucketu z prefiksem `backups/` (`lib/backup/r2-backup-client.ts:21-28`), a [PR225 @a72b567] podaje 1 bucket w MinIO aplikacji — wniosek (do potwierdzenia): snapshot leży w buckecie plików aplikacji, co częściowo rozstrzyga N-INW-14 | N-PRC-03 (z dopiskami R2-r2); N-INW-04; N-INW-14; NA1-10; N-A2-03; N-R2-03 (część: `KSEF_ENV`, `ANTHROPIC_BASE_URL`); `A4` § 7; `09` § 14 | WYM-14, WYM-66 (nagłówek wypisu), WYM-68 (archiwum AWS); odbiorcy R-07, R-08, R-17 – R-20; PRC-15, PRC-17; INW-04, INW-18; RET-01 | lista nazw ustawionych zmiennych z Coolify (dla adresów — tylko nazwa hosta dostawcy) i wpisy przebiegów jobu archiwizacji | operator (Coolify) | **P1** | **nie** — przy aktywnym AWS rozszerza zakres usuwania i odbiorców |
| N-17 | **Proxy przed aplikacją i nagłówki do dostawców telemetrii.** **[R5b]** `A4` RUN-08 (stan „częściowe”): wejście nagłówków przeglądarki (w tym ciasteczek) do proxy `/ingest` i `/monitoring` potwierdzone w runtime na buildzie lokalnym, przekazanie dalej — w kodzie Next.js i `@sentry/nextjs`; na łączu nieobserwowane (ruch do dostawców zablokowany). Nieznane: czy odwrotne proxy (Traefik/Coolify) dopisuje `X-Forwarded-For` z IP klienta; czy PostHog i Sentry zapisują nagłówki `Cookie` i IP | N-INW-07 (częściowo rozstrzygnięte przez RUN-08); NA1-04 (z dopiskiem R3); N-R2-03 (część); wiersz R3 § 8 („zachowanie dostawców”); `A4` § 7 | WYM-36 (obecne W), WYM-09; INW-11, MIN-08, PRC-09; ocena RUN-08 jako możliwego naruszenia (Q-37) | konfiguracja nagłówków w Traefik; test na produkcji kontem syntetycznym z podglądem żądania wychodzącego; odpowiedzi dostawców o logowaniu nagłówków i retencji logów | operator (SSH), dostawcy | **P1** | **nie** — usunięcie nagłówków w proxy (rekomendacja RUN-08) jest niezależne |
| N-18 | **GoTrue — schemat `auth.*`, retencja i zakres `deleteUser`:** czy sesje, tokeny odświeżania i `auth.audit_log_entries` zapisują IP i user agent i jak długo; co kasuje `deleteUser` (sesje, tożsamości, wpisy audytu) | N-INW-01; N-A2-06; `09` § 14 | WYM-03, -21, -24; INW-01, INW-02 (część `auth`), PRA-01, PRA-02; RA-01, RT-AUTH, `09` § 8.3 | `\d auth.*` i wersja obrazu GoTrue (tylko schemat); usunięcie konta syntetycznego z liczeniem wierszy przed i po | operator (SSH) albo zespół na lokalnym Supabase z tą samą wersją GoTrue | **P1** | **nie** — zmiany w `lib/gdpr/deletion.ts` dla tabel `public` są niezależne |
| N-19 | **GoTrue — konfiguracja logowania i e-maili:** dostawca SMTP (w repo tylko dokumentacja wskazuje `smtp.resend.com` — `docs/migration/PRZEPROWADZKA-HETZNER.md:496`, `docs/runbooks/skrzynka-pomoc.md:75`; to dokument, nie konfiguracja produkcji); zakres danych z Google OAuth w `auth.identities` i `raw_user_meta_data`; algorytm haseł; czas życia tokenów odświeżania (ciasteczko do 400 dni to tylko górna granica przeglądarki); wymóg potwierdzenia e-maila; czy reset hasła działa dla kont założonych przez Google (droga do samodzielnego usunięcia konta) | N-INW-02; N-INW-03; NA1-05; N-A2-07 | WYM-24, WYM-06, WYM-32; MIN-02, ZGD-11, PRA-02; odbiorcy w `04` § 1; Q-13 (sesja 400 dni) | niesekretne parametry konfiguracji GoTrue (SMTP, czasy życia, autopotwierdzanie); odczyt jednego syntetycznego konta Google; test resetu hasła na koncie testowym | operator; zespół (konto testowe) | P2 | **nie** |
| N-20 | **Logi infrastruktury i baza `_supabase`:** rotacja logów Docker na hoście aplikacji ([PR225] `data-policy.md`: 7 dni, 10 MiB × 5 — przyjęte, niewdrożone); logi Traefik, Kong, GoTrue, PostgREST; druga baza `_supabase` (ok. 676 MB, Vector → Logflare) poza nocnym `pg_dump` (`scripts/hetzner/db-backup.sh:77`) — źródła, pola (IP, e-mail, parametry zapytań), retencja; trwałość Redisa | N-INW-06; N-INW-15 (R1); N-A2-12 (R3); N-A2-09 (część); R1-N02; `09` § 14 | WYM-03, -36, -71; D-25; INW-04; RET-09, RET-10; Q-26 | konfiguracja logowania kontenerów, konfiguracja Vector/Logflare (źródła, okres), liczniki tabel `_analytics` bez treści, konfiguracja zapisu Redisa | operator (SSH) | P2 | **nie** |
| N-21 | **Szyfrowanie w spoczynku i w transmisji wewnętrznej:** dyski u Hetznera, szyfrowanie po stronie MinIO (kod nie ustawia `ServerSideEncryption` — `02` § 3.1), TLS między aplikacją a bazą i MinIO na innym hoście; strona RODO deklaruje „AES-256 at-rest” (`rodo/page.tsx:23`) | NA1-08; NS-08 | WYM-50, WYM-SOC-4; ZGD-12, deklaracja na stronie RODO | odczyt konfiguracji hostów i MinIO (bez kluczy), parametry połączeń | operator (SSH) | P2 | **nie** — szyfrowanie lokalnych zrzutów (INW-04) i korekta deklaracji są niezależne |
| N-22 | **Kopie i narzędzia operacyjne na hostach:** czy cron `pg_dump` jest zainstalowany i działa, historia Healthchecks, strona statusu i zewnętrzny monitor; ustawienia instancji Coolify (`do_not_track`, `SENTRY_DSN`); wersje obu MinIO, Studio, Uptime Kuma (czy wysyła do Slacka); lokalizacja obrazów kopii Hetznera | NS-05 (część); N-PRC-05; N-PRC-09 (część) | WYM-50, WYM-51, WYM-SOC-2; SOC-10, SOC-21, SOC-24, SOC-26; PRC-13, PRC-14; R-02 | harmonogramy zadań (bez sekretów), eksport dat z Healthchecks, ustawienia instancji Coolify, wersje obrazów, konsola Hetznera | operator (SSH, konsola) | P2 | **nie** — kopie poza hostem mają decyzję z 07.10 [PR225] i można je wdrażać |
| N-23 | **Stan schematu produkcji względem migracji:** wyzwalacz `trg_audit_logs_prevent_update` i klucz `audit_logs.user_id … ON DELETE SET NULL` (efekt potwierdzony tylko na schemacie syntetycznym — R1, `A2`, R3); wyzwalacz `b_guard_invoice_pending_content` w postaci z `00132`; stan migracji `00068`, `00069`, `00072` (plan wydania: „wstrzymana”, dziennik operatora: „wykonana”), `00100`; uprawnienia i polityki po 08.09 | N-A2-01; N-A2-02; N-A2-13 (część); NA1-09; N-DOW-04; N-DOW-11 / NR4-01 (część: `00100`); wiersz R3 § 8; R1-N03 | WYM-24, -45, -73, WYM-SOC-1; PRA-02, PRA-03, RET-02, RET-03; zamknięcie SEC-C-04/05/06 w produkcji | `supabase_migrations.schema_migrations`, `pg_get_functiondef`, `\d public.audit_logs` (tylko odczyt); alternatywnie test w jobie CI „RLS isolation” na pełnym zestawie migracji | operator (SSH); zespół (CI) | **P1** | **nie** — naprawy PRA-03 i RET-02 i tak zaczynają od czerwonego testu na bazie (protokół napraw w `AGENTS.md`); produkcja rozstrzyga tylko pilność |
| N-24 | **Liczniki danych produkcji (retencja, usuwanie, profilowanie):** faktury z `scheduled_deletion_at`, starsze niż 2 lata (import historii), z `submitted_to_ksef_at` i `scheduled_deletion_at` jednocześnie; organizacje z `deleted_at` lub bez aktywnego członka; obiekty pod `exports/`, `imports/`, `tenants/*/expenses/`, `backups/`; wiersze `flo_proposals`, `flo_approvals`, `payment_imports`; wpisy `details_json` z niepustą notatką | N-A2-04; N-A2-05; N-A2-13 (część); N-INW-05; N-INW-10; N-INW-11; N-DOW-10 / NR4-04; wiersz R3 § 8 | WYM-03, -38, -45, -68; czy wady RET-01, RET-02 mogą się już ujawnić; skala INW-03, INW-10, INW-13 | zapytania licznikowe bez treści (skrypt w `scripts/ops/`) | operator (SSH) | **P1** — szczególnie `scheduled_deletion_at` przed pierwszym terminem retencji | **nie** |
| N-25 | **Dowody działania kontroli w czasie:** liczba wpisów `audit_logs`, przebiegi `cron.cleanup-audit-logs`, `gdpr-process-deletions`, `retention-delete`, wpisy `write_failed`; flaga `requireMfaForSensitive` i wyniki strażnika; historia kolejki wdrożeń Coolify (kto, kiedy, SHA) i wpisy `ops.deploy.*` z bramki `/wdroz`; rekordy poświadczeń KSeF w formacie v1 (stała sól, bez AAD) | N-DOW-02; NS-05 (część); NS-07 (z dopiskiem R4); NS-14 / NR4-03; N-DOW-11 / NR4-01 (część) | WYM-50, -51, -74, WYM-SOC-1, -2, -4; SOC-04, SOC-05, SOC-28; `A3` § 2 | odczyt operatora skryptem z `scripts/ops/` (liczby i daty, bez danych osobowych; poświadczenia — zliczenie po nagłówku formatu, bez odszyfrowania) | operator (SSH, Coolify) | P2 (poświadczenia v1); P3 (dowody dla SOC 2) | **nie** |
| N-26 | **Dostępy i MFA:** lista i historia `ADMIN_EMAILS`; konta z dostępem SSH (imienność kluczy), Coolify, konsola Hetznera; GitHub — członkowie, uprawnienia, wymuszone MFA, wyjątki rulesetu (`bypass_actors: null` w odczycie publicznym); konta dostawców (Stripe, Resend, Anthropic, Cloudflare) i MFA; wspólne konto dostawcy bez MFA (DOW-05) | NA1-11; N-DOW-03; NS-03; NS-04 | WYM-35, WYM-47, WYM-SOC-1; DOW-05, MIN-05, SOC-01, SOC-03, SOC-07 – SOC-09 | datowany przegląd dostępów (role, bez danych osobowych w repo), zrzut ustawień organizacji GitHub | właściciel (administrator repo i kont) | **P1** | **nie** — sam przegląd dostępów jest pierwszą zmianą |

### 2.4. Rozstrzygalne w repo albo na środowisku z danymi syntetycznymi

| ID | Niewiadoma | ID źródłowe | Co blokuje (WYM, ustalenia) | Dowód rozstrzygający | Kto | Prio | Blokuje start? |
|---|---|---|---|---|---|---|---|
| N-27 | **Dane osobowe w certyfikacie lub tokenie KSeF klienta** (pole subject) | N-INW-12 | klasyfikacja D-04 w inwentarzu; WYM-06, WYM-50; zakres wyszukiwania żądań | analiza syntetycznego certyfikatu z testowego KSeF | zespół | P2 | **nie** |
| N-28 | **Czy któryś z 10 NIP-ów z poprawną sumą kontrolną w testach publicznego repo należy do osoby fizycznej (JDG)** — rejestry zablokowane w tej sesji | NA1-07 | WYM-37, WYM-X-02; MIN-09 | sprawdzenie w rejestrze publicznym | zespół / operator | P2 | **nie** — zastąpienie NIP-ami fikcyjnymi (`AGENTS.md`: `1234567890`) można wykonać od razu |
| N-29 | **Historia polityki prywatności przed 2.10.2026** (klon płytki) — czy data „9 maja 2026” odpowiada treści | NA1-13 | WYM-19, WYM-X-01; ZGD-03, ZGD-04 | pełna historia gita pliku polityki | zespół | P3 | **nie** |
| N-30 | **Treść szablonów e-mail** (`lib/email/templates/*`) i e-maila paczki dla księgowej pod kątem informacji o przetwarzaniu — przejrzane tylko pośrednio | NA1-14 | WYM-20, WYM-67; ZGD-09 | przegląd szablonów w repo | zespół | P2 | **nie** |
| N-31 | **Skuteczność redakcji FLO** (`lib/flo/redact.ts`; SEC-D-03 oznaczone jako poprawione) — skrypt `scripts/security/audit-redaction.ts` nieuruchomiony | N-A2-11 | AI-04; warunek włączenia warstwy modelu FLO (WYM-62) | uruchomienie skryptu na danych syntetycznych | zespół | P3 — przed włączeniem FLO | **nie** |
| N-32 | **Czy organizacja z `deleted_at` blokuje logowanie i pracę członków w przeglądarce** (brak testu e2e) | N-A2-10 | WYM-45; PRA-04, RET-04 | test e2e na środowisku z danymi syntetycznymi | zespół | P2 | **nie** — filtr `deleted_at` w jobach (PRA-04) jest niezależny |
| N-33 | **Strony za logowaniem w przeglądarce (runtime):** ciasteczka sesji w działaniu, `ksef.active_org`, identyfikacja PostHog (`analytics-identify`), push, PWA w panelu, `/register` z otwartą rejestracją i Turnstile; przeglądarki inne niż Chromium. **[R5b]** Także zapis ramki Turnstile w domenie Cloudflare (ciasteczka, magazyn) — nieobserwowany, bo ruch do dostawców przerwano (`A4` § 7, RUN-09 „Luka”; `09` L-02) | `A4` § 7, § 9; NA1-06 (rozstrzygnięte przez `A4` dla stron publicznych); wiersz R3 § 8 („strony za logowaniem”) | WYM-63, WYM-64 (klasyfikacja w panelu); ZGD-11, RUN-10 (część po zalogowaniu); testy akceptacyjne specyfikacji zgody (`09` § 12); **[R5b]** Q-13 (klasyfikacja Turnstile jako ściśle niezbędnego) | uprząż `A4` (`narzedzia/`) z lokalnym Supabase i kontem syntetycznym; Firefox i WebKit | zespół | P2 | **nie** |
| N-34 | **Testy RLS na bazie dla `3e5e00d` (lokalnie) i e2e** — RLS tylko ze statusu CI, e2e nigdy nieuruchomione | N-DOW-07; `A3` § 4.3–4.4 | WYM-09, WYM-SOC-1 (dowód działania); DOW-12, DOW-14, DOW-15 | lokalny Supabase + `tests/rls-*`; przebieg e2e | zespół | P2 | **nie** |
| N-35 | **Czy blokada raportów JPK/KPiR/pulpitu liczących `accepted` bez środowiska** (`DZIENNIK-ODPORNOSCI-CYBER.md:680`) jest zamknięta w całości | NS-10 | WYM-SOC-3; SOC-25, PI1.4 | przegląd `lib/exports/*`, `lib/dashboard/*` | zespół | P2 — przed KSeF PROD | **nie** |
| N-36 | **Czy Renovate działa i czy automatyczne scalanie przechodzi przez ruleset** | NS-06 | WYM-SOC-1; SOC-19, CC8.1 | historia PR Renovate, ustawienia aplikacji | administrator repo | P3 | **nie** |

### 2.5. Źródła prawa, wytyczne i kryteria

| ID | Niewiadoma | ID źródłowe | Co blokuje (WYM, ustalenia) | Dowód rozstrzygający | Kto | Prio | Blokuje start? |
|---|---|---|---|---|---|---|---|
| N-37 | **Treść i status przepisów prawa UE i PL** — żadnego nie odczytano online (§ 6): RODO (polska wersja ze sprostowaniami), PKE art. 398–400 (oznaczenie Dz.U., data wejścia w życie, zgoda ustawieniami przeglądarki, organ), status art. 10 UŚUDE po PKE, ustawa o VAT (artykuł o 10-letnim przechowywaniu w KSeF — wg R2 art. 112ba [NZ]; ustępy art. 112a; harmonogram KSeF), OP art. 70, 70a, 86, ustawa o rachunkowości art. 74, rozporządzenie o KPiR, u.o.d.o., KC art. 117–118; oznaczenia publikatorów | N-ZR-01; N-ZR-03; N-ZR-04; N-ZR-05 (z dopiskiem R2); N-ZR-06 (z dopiskiem R2); N-09-02; N-R2-01; R1 § 7 (akapit o przepisach) | klasy P i kolumna „Źródło” w `05`; najsilniej WYM-63, -64, -66, -68, -69; brzmienie klauzul, okresów i podstaw w `09` | odczyt w EUR-Lex, ISAP, Dz.U. (lista kontrolna § 4.2) | prawnik | P1 dla PKE i okresów przechowywania faktur; P2 pozostałe | **częściowo** — blokuje brzmienie dokumentów i wartości okresów, nie mechanizmy |
| N-38 | **Wersje i status wytycznych EDPB oraz materiałów UODO:** wersja ostateczna Guidelines 2/2023, status Guidelines 1/2024 i 01/2025 (konsultacyjne), raport CEF 2025 (usuwanie), daty WP29; brzmienie wykazu Prezesa UODO z 2019 r. (operacje wymagające DPIA); poradniki UODO i decyzje (ClickQuickNow, Morele.net, Virgin Mobile, Bisnode, Fortum — sygnatury, prawomocność) | N-ZR-02; N-ZR-12 (z dopiskiem R2); N-09-01 | WYM-12, -52, -55, -72 (także -38, -63); screening DPIA (`09` § 3), LIA (`09` § 4) | rejestr dokumentów EDPB, Monitor Polski, strona UODO | prawnik | P2 | **nie** |
| N-39 | **Sprawy i akty w toku:** dalszy los T-553/23 (odwołanie do TSUE); terminy art. 50 AI Act po ewentualnym „Digital Omnibus” (wg wiedzy modelu art. 50 stosuje się od 2.08.2026 — jeśli bez zmian, obowiązek już działa); wycofanie wniosku o rozporządzenie ePrivacy (ZR-07); zakres Data Act rozdz. VI dla FaktFlow (ZR-08) | N-ZR-07; N-ZR-08; ZR-07; ZR-08 | WYM-59, WYM-62; Q-10, Q-33, Q-44 | curia.europa.eu, EUR-Lex | prawnik | P2 (AI Act); P3 (pozostałe) | **nie** |
| N-40 | **Tekst kryteriów AICPA:** TSC 2017 z rewizją punktów 2022, DC 200, przewodnik SOC 2, AT-C 105/205 — identyfikatory i tytuły w `03` § 2.6a i `06` to parafrazy | N-ZR-11; NS-02; NR4-05 | brzmienie WYM-SOC-1 – WYM-SOC-7 i mapowania w `06` (nie same kontrole) | licencjonowany dostęp do publikacji AICPA albo materiały firmy audytorskiej | właściciel / firma audytorska | P3 | **nie** |
| N-41 | **Przepisy sektorowe poza zakresem:** krajowe wdrożenie NIS2 (system cyberbezpieczeństwa), przepisy KSeF o uprawnieniach i tokenach | N-ZR-13 | żadnego obecnego wniosku (prawdopodobnie bez wpływu na prywatność — FaktFlow jako mikropodmiot, do potwierdzenia) | decyzja o rozszerzeniu zakresu; ocena prawnika | właściciel / prawnik | P3 | **nie** |

### 2.6. Niewiadome zamknięte lub częściowo rozstrzygnięte

| ID źródłowe | Stan niewiadomej **[R5b]** | Uzasadnienie |
|---|---|---|
| NS-11 | zamknięte | R4 i redaktor poprawek odczytali PR #225 @`c2ab6a8` (13.10): F0-G09 FAIL, TEST-07 NOT RUN — stan SOC-21/SOC-22 bez zmian (`06` § 10) |
| N-ZR-10 | częściowo | DPA Anthropic odczytane w `04` (DOK-3, „Effective February 24, 2025”); umowy pozostałych dostawców → N-07 |
| N-ZR-14 | częściowo | fakty PR #225 przyjęte w `03` ze streszczenia zostały odczytane z gałęzi przez `02`, `04`, `A3`, `06`; poziom dowodu pozostaje „deklaracja/pomiar operatora” (§ 6) |
| NA1-06 | częściowo | `A4` zbadał zapisy i żądania Sentry i Turnstile na stronach publicznych (RUN-04, RUN-09); część za logowaniem → N-33 |
| N-INW-07 | częściowo | **[R5b]** `A4` RUN-08: wejście nagłówków (w tym ciasteczek) do proxy potwierdzone w runtime na buildzie lokalnym, przekazanie dalej — w kodzie Next.js i `@sentry/nextjs`; na łączu nieobserwowane (ruch do dostawców zablokowany); `X-Forwarded-For` z odwrotnego proxy i zachowanie dostawców → N-17 |
| N-INW-14 | częściowo | kod i [PR225 @a72b567] wskazują na bucket plików aplikacji (sprawdzenie w N-16); do potwierdzenia nazwą zmiennej |
| N-09-03 | przeniesione | to pytanie interpretacyjne, nie fakt → Q-39 |
| N-R2-04 (runda 2) **[R5b]** | bez wpływu | dotyczy wersji plików w trakcie recenzji R2 runda 1; runda 2 objęła poprawione wersje. N-R2-04 rundy 1 (domyślna geografia obszaru roboczego Anthropic) jest merytoryczna → N-10 (§ 2.7) |
| R1-N01, R1-N04, R1-N05; wiersz R3 § 8 o telemetrii wtyczki Sentry przy budowaniu | ograniczenia | opisane w § 6 |

### 2.7. Indeks: ID źródłowe → N-NN

| Plik | Odwzorowanie |
|---|---|
| `01` | N-01 → N-01 |
| `02` § 7 | N-INW-01 → N-18; -02 → N-19; -03 → N-19; -04 → N-16; -05 → N-24; -06 → N-20; -07 → N-17; -08 → N-08, N-09, N-11; -09 → N-12; -10 → N-24; -11 → N-24; -12 → N-27; -13 → N-01; -14 → N-16; -15 → N-20; -16 → N-13 |
| `03` § 5.1 | N-ZR-01 → N-37; -02 → N-38; -03 → N-37; -04 → N-37; -05 → N-37; -06 → N-37; -07 → N-39; -08 → N-39; -09 → N-01; -10 → N-07 (§ 2.6); -11 → N-40; -12 → N-38; -13 → N-41; -14 → § 2.6, § 6 |
| `04` § 6 | N-PRC-01 → N-07; -02 → N-08, N-09, N-10; -03 → N-16; -04 → N-12; -05 → N-22; -06 → N-13; -07 → N-14; -08 → N-15; -09 → N-07, N-22; -10 → N-02; -11 → N-01 |
| `A1` | NA1-01 → N-01; -02 → N-08; -03 → N-09; -04 → N-17; -05 → N-19; -06 → N-33 (§ 2.6); -07 → N-28; -08 → N-21; -09 → N-23; -10 → N-16; -11 → N-26; -12 → N-07; -13 → N-29; -14 → N-30 |
| `A2` | N-A2-01 → N-23; -02 → N-23; -03 → N-16; -04 → N-24; -05 → N-24; -06 → N-18; -07 → N-19; -08 → N-12; -09 → N-09, N-10, N-20; -10 → N-32; -11 → N-31; -12 → N-20; -13 → N-23, N-24; -14 → N-11 |
| `A3` § 8 | N-DOW-01 → N-03; -02 → N-25; -03 → N-26; -04 → N-23; -05 → N-07; -06 → N-04; -07 → N-34; -08 → N-01; -09 → N-12; -10 → N-24; -11 → N-23, N-25 |
| `A4` § 7 | brak Supabase → N-33; build lokalny ≠ produkcja → N-17, § 6; konfiguracja PostHog/Sentry → N-08, N-09, N-16; sieć przerwana → N-17, § 6; `keepalive`, jedna przeglądarka, przepisy, budowanie bez blokady → § 6 (jedna przeglądarka także N-33) |
| `06` § 10 | NS-01 → N-01; -02 → N-40; -03 → N-26; -04 → N-26; -05 → N-22, N-25; -06 → N-36; -07 → N-25; -08 → N-21; -09 → N-07; -10 → N-35; -11 → zamknięte; -12 → N-03; -13 → N-05; -14 → N-25; -15 → N-12 |
| `09` § 14 | N-01/N-INW-13/N-PRC-11 → N-01; N-PRC-01 → N-07; N-PRC-02/NA1-02 → N-08, N-09, N-10; N-PRC-03/N-INW-04 → N-16; N-PRC-07 → N-14; N-PRC-10 → N-02; N-INW-01 → N-18; N-INW-06/N-INW-15/N-A2-12 → N-20; N-INW-16/N-PRC-06 → N-13; N-A2-08 → N-12; N-09-01 → N-38; N-09-02 → N-37; N-09-03 → Q-39; N-09-04 → N-06; N-09-05 → N-04 |
| R1 § 7 | R1-N01 → § 6; R1-N02 → N-20; R1-N03 → N-23; R1-N04 → § 6; R1-N05 → § 6 |
| **[R5b]** R2 runda 1 § 6 (`R2-runda1.md`) | N-R2-01 (brzmienie przepisów) → N-37; N-R2-02 (`X-Forwarded-For`, „Discard client IP data”) → N-08, N-17; N-R2-03 (`KSEF_ENV` na produkcji) → N-16; N-R2-04 (geografia obszaru roboczego Anthropic) → N-10. ID rundy 1 kolidują z ID rundy 2 (inna treść) — wiersz niżej dotyczy rundy 2 |
| R2 § 8 (runda 2) | N-R2-01 → N-37; N-R2-02 → N-08; N-R2-03 → N-08, N-10, N-16, N-17; N-R2-04 → § 2.6; N-R2-05 → N-08 |
| R3 § 8 | wyzwalacze na produkcji → N-23; `scheduled_deletion_at` → N-24; telemetria wtyczki Sentry → § 6; zachowanie dostawców wobec `Cookie`/`X-Forwarded-For` → N-17; przepisy → N-37; strony za logowaniem → N-33 |
| R4 § 9 | NR4-01 → N-23, N-25; NR4-02 → N-12; NR4-03 → N-25; NR4-04 → N-24; NR4-05 → N-40 |

### 2.8. Powiązanie z planem `07`: N-NN → pozycja E-00 (D-NN) → etapy

`07-PLAN-ETAPOW.md` powstał w trakcie pisania tego pliku; autor odczytał
jego § 0–3 w stanie z ok. 12:49 UTC. **[R5b]** Powiązania sprawdzone przez
R5b na końcowej wersji `07` (13.10; D-01 – D-15 i tytuły E-00 – E-79) —
zgodne. Redaktor poprawek R5b dopisał pozycję D-16 (ocena RUN-08), którą
`07` dodał po recenzji R5a, oraz przeniósł do `07` E-00 propozycje
z kolumny „Uwagi” (N-15 → D-08; N-17, N-19, N-21, N-22, N-24 → D-06 —
oznaczone **[R5b]** w `07`). `07` odwołuje się do niewiadomych po ID
źródłowych; poniższa tabela łączy je z N-NN.
„Etapy czekające” — etapy, które w `07` § 2 mają w kolumnie „Czeka na”
odpowiednią pozycję D-NN albo zależą od niej według karty E-00.

| N | Pozycja E-00 w `07` | Etapy czekające (wg `07` § 2–3) | Uwagi |
|---|---|---|---|
| N-01 | D-01 | E-59, E-62, E-63, E-67, E-74, E-79 | — |
| N-02 | D-02 | E-10; bramka `07` § 8 | — |
| N-03 | D-07 | E-59, E-61, E-67, E-68, E-69 | — |
| N-04 | D-14 | E-59, E-60 | — |
| N-05 | D-13 | E-79 | — |
| N-06 | D-15 | E-67, E-73, E-75 | — |
| N-07 | D-04 | E-60, E-61, E-62, E-63 | — |
| N-08 | D-03 (PostHog) | E-09, E-63 | E-09 „od razu” — odczyt panelu w ramach etapu |
| N-09 | D-03 (Sentry); D-12 (j) | E-21, E-61, E-63 | — |
| N-10 | D-03 (Resend, Anthropic); D-12 (i) | E-60, E-61, E-63 | — |
| N-11 | D-03 (Slack, Telegram) | E-63 | E-16 „od razu” nie czeka |
| N-12 | D-10 | E-22, E-66, E-63 | — |
| N-13 | D-11 | E-57 | — |
| N-14 | D-09 | E-61, E-62, E-68 | — |
| N-15 | D-08 **[R5b]** (wcześniej brak pozycji w E-00) | dotyczy E-61 (transfery) | dopisane do D-08 (kraje dostępu zdalnego operatorów i agentów) **[R5b]** |
| N-16 | D-06 (nazwy zmiennych) | E-41, E-50, E-51; E-10 (`KSEF_ENV`) | `EMAIL_UNSUBSCRIBE_SECRET` — E-13 „od razu” robi wysyłkę fail-closed niezależnie |
| N-17 | D-16 (ocena RUN-08, pytania do dostawców o logowanie nagłówków — dodane w `07` po R5a); D-06 (nagłówki odwrotnego proxy) **[R5b]** | E-05 „od razu” usuwa przyczynę; ocena okresu przeszłego — D-16, E-67 | nagłówki odwrotnego proxy dopisane do D-06 **[R5b]** |
| N-18 | D-06 (schemat `auth.*`) | E-20, E-63 | — |
| N-19 | D-06 (schemat `auth.*`; parametry GoTrue **[R5b]**) | E-19 „od razu”, E-42 | parametry GoTrue (SMTP, czasy życia tokenów, potwierdzenie e-maila) dopisane do D-06 **[R5b]** |
| N-20 | D-06 (logi `_supabase`, Docker) | E-41 (część `_supabase`) | — |
| N-21 | D-06 **[R5b]** (wcześniej brak pozycji w E-00) | E-53 „od razu” (szyfrowanie zrzutów), E-74 | dopisane do D-06 (NA1-08, NS-08) **[R5b]** |
| N-22 | D-06 (NS-05; N-PRC-05 i lokalizacja obrazów Hetznera **[R5b]**) | E-53, E-54 | N-PRC-05 dopisane do D-06 **[R5b]** |
| N-23 | D-06 (wyzwalacze, `00072`, `00100`) | E-03 (potwierdzenie), E-50, E-51, E-72 | — |
| N-24 | D-06 (liczniki) | E-50, E-51 | liczniki S3, FLO, `payment_imports` (N-INW-05, -10, -11) dopisane do D-06 **[R5b]** |
| N-25 | D-06 (crony, `/wdroz`, poświadczenia v1) | E-56, E-72, E-75 | — |
| N-26 | D-08 | E-69, E-72 | — |
| N-27 | **brak** | dotyczy E-22 (zakres wyszukiwania) | rozstrzygalne w etapie wykonawczym |
| N-28 | **brak** | E-38 „od razu” | — |
| N-29 | **brak** | dotyczy E-58 | — |
| N-30 | **brak** | dotyczy E-13, E-64 | — |
| N-31 | **brak** | brak etapu włączenia FLO w `07` § 2 | warunek przyszłego etapu |
| N-32 | **brak** | dotyczy E-02 (test e2e) | — |
| N-33 | **brak** | dotyczy E-18, E-42 | — |
| N-34 | **brak** | E-70 „od razu” | — |
| N-35 | **brak** | najbliżej E-10, E-75 (WYM-SOC-3) | — |
| N-36 | **brak** | najbliżej E-72 | — |
| N-37 | review prawne (krok 2 w `07` § 0.3) | E-59, E-62, E-63, E-65 | — |
| N-38 | review prawne | E-59, E-60 | — |
| N-39 | review prawne | E-60, E-61; E-12 „od razu” | — |
| N-40 | — | E-79 | — |
| N-41 | — | — | poza zakresem planu |

## 3. Pytania do końcowego review prawnego (Q-NN)

> **Kolumna „Interpretacja robocza” to ZAŁOŻENIA DO POTWIERDZENIA, nie
> ustalenia.** Wszystkie podstawy prawne w kolumnie „Podstawy” są [NZ],
> poza dokumentami dostawców oznaczonymi DOK-n (odczyt online 10.10.2026,
> ale to nie są umowy FaktFlow). „Art.” bez nazwy aktu = RODO (ZR-01).

**Liczby.** 44 pytania po deduplikacji z 99 pozycji źródłowych (`02` — 15,
`03` — 18 i sygnał ZR-08, `04` — 11, `A1` — 16, `A2` — 10, `A3` — 12,
`A4` — 6, `06` — 5, `09` — 1, R2 — 4; pytania R1, R3 i R4 są już
w raportach). Priorytet: **P1 — 22**, **P2 — 17**, **P3 — 5** (§ 4.4).
Interpretacja robocza pochodzi z raportów przy 28 pytaniach (część
uzupełniona „propozycją 08”), a w całości z tego pliku — przy 16
(oznaczenie „Propozycja 08” na początku komórki).
**[R5b]** Liczba 99 nie obejmowała 4 pytań rundy 1 R2 (`R2-runda1.md`
§ 7); po ich dopisaniu (§ 3.10) pozycji źródłowych jest 103, a liczba
Q-NN się nie zmienia — pytania 1, 3, 4 miały już odpowiedniki (Q-37,
Q-16, Q-44), a brakujący wątek pytania 2 (PostHog przy `/ingest`)
dopisano do Q-03. Liczba pytań z interpretacją z raportów (28) i „w całości
z tego pliku” (16) bez zmian — Q-03 już miało część „Propozycja 08”.

Pełne odwzorowanie pytań źródłowych na Q-NN — § 3.10.

### 3.1. Role stron i zakres polecenia

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-01 | Czy FaktFlow jest procesorem dla treści faktur, kontrahentów, kosztów, płatności, portalu księgowej i wysyłki do KSeF; czy funkcje uruchamiane bez działania użytkownika — odbiór skrzynki KSeF co 15 min, cykliczna weryfikacja kontrahentów w GUS/MF/VIES, **automatyczna kategoryzacja AI faktur kosztowych** (dane sprzedawców, w tym JDG) — mieszczą się w poleceniu klienta, czy wymagają wyraźnego zapisu w umowie powierzenia albo wyboru klienta (przełącznika)? | FF-P dla tych danych (`02` § 4.2). Funkcje automatyczne wpisać do umowy jako udokumentowane polecenia (`09` § 6 wiersz 3). Dla kategoryzacji AI dodatkowo przełącznik per organizacja; domyślny stan do decyzji — **propozycja 08:** wyłączony do czasu umowy i TIA dla Anthropic (wariant ostrożny) | art. 4 pkt 7–8, art. 28 ust. 3 lit. a, ust. 10, art. 29; ZR-32 (EDPB 07/2020) | WYM-01, WYM-42, WYM-62; PRC-06, AI-01. Odpowiedź „wymaga wyboru klienta” = zmiana w produkcie przed pierwszym klientem; treść umowy powierzenia | **P1** | `02` pyt. 1; `04` pyt. 1; `A2` pyt. 7 (cz. 1) |
| Q-02 | Jaka jest rola FaktFlow przy zaproszeniach do organizacji, wspólnej pamięci wyników rejestrów `validation_cache` (wspólnej dla wszystkich klientów), czacie pomocy o danych klienta i notatkach operatora (`admin_user_notes`)? | **Propozycja 08:** zaproszenia, czat pomocy i notatki operatora — FF-A (własne cele: obsługa konta, wsparcie, nadzór; `09` RA-06, RA-07, RA-11); `validation_cache` — FF-A, jeśli o wspólnej pamięci decyduje FaktFlow; LIA L-04 pozytywna pod warunkami (odczyt tylko przez serwer, usunięcie `raw_response`, utrzymanie TTL) | art. 4 pkt 7, art. 6 ust. 1 lit. b, f, motyw 47; ZR-32; ZR-42 (konsultacyjny) | WYM-01, WYM-11, WYM-12, WYM-33; rejestr FF-A (`09` § 1); polityka. Zmiana RLS `validation_cache` (`00022…sql:58-64`) nie zależy od odpowiedzi | P2 | QA1-02; `02` pyt. 3 |
| Q-03 | Role podmiotów zewnętrznych: Stripe (dane płatnicze), Google (logowanie OAuth, fonty), Cloudflare (Turnstile, Email Routing), biuro rachunkowe wobec klienta, MF (KSeF), Sentry wobec danych klientów, które mimo redakcji trafiają do komunikatów błędów; czy osadzenie zasobu strony trzeciej tworzy współadministrowanie — **[R5b]** także z PostHog przy zbieraniu zdarzeń przez proxy pierwszej strony `/ingest` (C-40/17; `R2-runda1` § 7 pyt. 2)? | Wg Q-ZR-07: Stripe i Google — co najmniej częściowo odrębni administratorzy; MF — odrębny administrator z mocy prawa (tylko KSeF produkcyjny; testowy — Q-37); biuro — według umowy klienta. **Propozycja 08:** Sentry — dalszy procesor (wpis na listę, `09` § 7 poz. 6); Cloudflare Turnstile — procesor operatora strony („on behalf of the website operator” [DOK-8]) z zastrzeżeniem własnych celów dostawcy; Google Fonts — ryzyko współadministrowania przy osadzeniu (C-40/17) usuwa samohostowanie (Q-14). **[R5b] Propozycja 08:** PostHog — procesor FaktFlow na podstawie DPA dostępnego dla każdego planu [DOK-6, DOK-7]; współadministrowanie mało prawdopodobne przy braku własnych celów dostawcy (do potwierdzenia; zależy też od tego, czy DPA zaakceptowano — N-07) | art. 4 pkt 7–8, art. 26, art. 28; ZR-32; ZR-68 (C-40/17); DOK-6, DOK-7, DOK-8 | WYM-01, WYM-39, WYM-43 (czy Sentry i Cloudflare na liście dalszych procesorów), WYM-19 | **P1** — lista dalszych procesorów przed pierwszym klientem | Q-ZR-07; `02` pyt. 13; `04` pyt. 4, 5, 6; **[R5b]** `R2-runda1` § 7 pyt. 2 |
| Q-04 | Wiadomości do kontrahentów klienta (faktura, przypomnienia, PDF wezwań): kto jest administratorem i nadawcą; czy oznaczenie FaktFlow w treści to informacja handlowa; czy klient jest zwolniony z art. 14 (ust. 5 lit. c) i czy FaktFlow ma dodawać stopkę informacyjną w imieniu klienta; jak kwalifikować odpowiedzi kontrahentów, które przez `Reply-To` trafiają do skrzynki FaktFlow, i co z już otrzymanymi; **kto odpowiada za śledzenie otwarć i kliknięć w tych e-mailach i czy wymaga ono zgody odbiorcy (art. 399 PKE)?** | Wg Q-ZR-08: klient — administrator i nadawca, FaktFlow — procesor, bez treści promocyjnych FaktFlow. **Propozycja 08:** `Reply-To` = adres klienta, jak w przypomnieniach (INW-07); śledzenie otwarć i kliknięć wyłączone w domenie wysyłkowej do czasu odpowiedzi (piksel = dostęp do urządzenia odbiorcy, ZR-34); stopka informacyjna jako opcja dla klienta, nie obowiązek FaktFlow | art. 4 pkt 7–8, art. 14 ust. 5 lit. c, art. 28 ust. 3 lit. a; ZR-02 art. 5 ust. 3; ZR-11 art. 399; ZR-34 (EDPB 2/2023) | WYM-67, WYM-20, WYM-63; INW-07, PRC-11, ZGD-09; ustawienia Resend (N-10) | **P1** | Q-ZR-08; `02` pyt. 4; QA1-10; R2 § 9 pkt 4 (nieprzeniesione do `04` — dodane tutaj) |
| Q-05 | Czy propozycje agenta FLO (reguły FaktFlow na danych klienta) i przyszła ocena terminowości płatności kontrahentów (`payment.score`, także JDG) zmieniają rolę FaktFlow (art. 28 ust. 10), wymagają DPIA lub LIA, wchodzą w zakres art. 22 albo systemów wysokiego ryzyka AI Act? | Dziś warstwa modelu FLO jest nieaktywna i strzeżona testem (`tests/unit/flo-nieaktywne.test.ts`), a `payment.score` zablokowane (`lib/flo/flags.ts:39-47`). Wg `A3` § 6.1: DPIA jako warunek włączenia. **Propozycja 08:** bramka „bez włączenia przed odpowiedzią” | art. 22, art. 28 ust. 10, art. 35; ZR-46 (WP248 kryt. 1), ZR-50 (WP251); ZR-06 (AI Act) | WYM-29 (dziś „nie dotyczy”), WYM-55, WYM-62; tylko etapy włączające FLO lub scoring | P3 | `02` pyt. 2; `A2` pyt. 7 (cz. 3) |

### 3.2. Podstawy, informacje i zgody produktowe

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-06 | Czy zdarzenia serwerowe PostHog ze stałym UUID użytkownika (logowanie, rejestracja z `$set: { plan }`) albo UUID organizacji (Stripe, przyjęcie faktury — `lib/stripe/webhook-handlers.ts:104,143,250,333`, `lib/jobs/runners/submit-invoice.ts:1934`; przy JDG identyfikuje osobę) **[R5b]** mogą opierać się na lit. f niezależnie od odmowy w banerze, czy odmowa ma je wyłączać; jak zrealizować sprzeciw (art. 21)? | Wg `09` L-03: LIA **negatywna w obecnym kształcie**; wariant pozytywny — zdarzenia bez profilu osoby albo agregaty, honorowanie odmowy zapisanej przy koncie, mechanizm sprzeciwu, krótsza retencja; alternatywa — ta sama zgoda co w przeglądarce. Wg Q-ZR-06: lit. f możliwa bez identyfikatorów z urządzenia i z udokumentowanym testem | art. 6 ust. 1 lit. f, art. 21, motyw 47; ZR-63 (C-252/21); ZR-42 (konsultacyjny) | WYM-11, WYM-12, WYM-28; MIN-08, INW-11; wybór wariantu technicznego (agregaty albo zgoda) należy do właściciela | P2 | QA1-08; `02` pyt. 10 (cz. 1); Q-ZR-06 (cz. ost.) |
| Q-07 | Czy e-maile sekwencji próbnej (szczególnie dzień 8 z treścią o cenie i opłacalności) i newsletter to marketing bezpośredni wymagający uprzedniej zgody — na podstawie art. 398 PKE czy art. 10 UŚUDE; czy w Polsce istnieje odpowiednik „soft opt-in” (art. 13 ust. 2 dyr. 2002/58); czy wymóg obejmuje adresy firmowe; czy model preferencji „brak wiersza = zapisany” dla kategorii `marketing` można utrzymać; jak wykazać zgodę przed pierwszą wysyłką newslettera? | Wg Q-ZR-05 i `09` L-05: uprzednia zgoda dla newslettera i każdego e-maila promocyjnego; bez soft opt-in do czasu potwierdzenia; porady w okresie próbnym — lit. f, pod warunkiem oddzielenia treści handlowej, linku wypisu w treści i wstrzymania wysyłki bez sekretu wypisu; kategoria `marketing` w modelu opt-in z zapisem wersji i daty | ZR-11 art. 398 (numer do potwierdzenia); ZR-12 art. 10 (status); ZR-02 art. 13; art. 6 ust. 1 lit. a, f, art. 7, art. 21 ust. 2–3; ZR-21 (ClickQuickNow) | WYM-13, WYM-15, WYM-66; ZGD-06; zmiana e-maila 8. dnia (działa dziś) i modelu preferencji | **P1** — e-mail 8. dnia jest wysyłany dziś | Q-ZR-05; QA1-03; QA1-04; P-08; `02` pyt. 12 |
| Q-08 | Czy akceptacja regulaminu wymaga aktywnego działania (pole wyboru) i zapisu wersji — także przy rejestracji przez Google; jak sformułować zdanie o polityce prywatności (informacja, nie akceptacja); jak informować o zmianach regulaminu? | **Propozycja 08** (na podstawie WYM-X-01): zapis akceptacji (kto, wersja, chwila, kanał) przy rejestracji e-mailem i przez Google; polityka jako informacja („zapoznaj się”), bez akceptacji; zmiany regulaminu z wyprzedzeniem i ponowną akceptacją przy zmianach istotnych | ZR-12 art. 8 UŚUDE; art. 7 ust. 2, art. 13; ZR-47 (WP260); ewentualne przepisy chroniące przedsiębiorców będących osobami fizycznymi — poza rejestrem ZR, do wskazania przez prawnika | WYM-X-01; ZGD-04; mechanizm zapisu wersji (migracja addytywna) | **P1** | QA1-09 |
| Q-09 | Czy nieprawdziwe deklaracje stron publicznych zdjąć lub poprawić przed wdrożeniem mechanizmów: strona „RODO i bezpieczeństwo” (lokalizacja „Frankfurt”, Vercel, „AES-256”, „SCC z każdym US-based subprocesorem”, DPA „na żądanie”, „72 h”), polityka („Backup: AWS Glacier”, R2, Inngest, „export pełnych danych w 30 dni”, „usunięcie organizacji najpóźniej w ciągu miesiąca”, „dane konta do 30 dni po anulowaniu”, „zanonimizowane”, „kto i kiedy uzyskał dostęp do Twoich danych”, Anthropic: zdjęcia „nie są przechowywane”)? Jak opisać transfery „częściowe” (Sentry: konto i wsparcie w US; PostHog: przechowywanie w UE, przetwarzanie także w US), żeby informacja z art. 13 ust. 1 lit. f była rzetelna? Jakie jest ryzyko wprowadzenia w błąd? | **Propozycja 08** (zgodna z rekomendacjami `A1` ZGD-12, `A2` RET-13, `04` § 5): zdania niezgodne z faktami usunąć lub skorygować od razu — to korekta faktów, nie interpretacja; deklaracje o mechanizmach przyszłych publikować dopiero po wdrożeniu; transfery opisywać per dostawca: miejsce przechowywania, kraje przetwarzania, mechanizm transferu | art. 5 ust. 1 lit. a, art. 12–14; ZR-47 (WP260); przepisy o zwalczaniu nieuczciwej konkurencji i nieuczciwych praktykach rynkowych — poza rejestrem ZR | WYM-18, WYM-19 (obecne W), WYM-58; DOW-02, ZGD-03, ZGD-12, PRC-01 – PRC-03, RUN-11, DOW-08 | **P1** — strony są publiczne | QA1-11; `A2` pyt. 9; P-09; `04` pyt. 10 |
| Q-10 | Czy czat pomocy wymaga informacji „rozmawiasz z systemem AI” (art. 50 ust. 1 AI Act — wg wiedzy modelu od 2.08.2026, z zastrzeżeniem zmian „Digital Omnibus”); czy FaktFlow jest „dostawcą” czy „podmiotem stosującym”; jaka podstawa i informacja o przekazaniu treści czatu do zewnętrznego modelu; jaka retencja rozmów; co z danymi osób trzecich wklejonymi do czatu; czy OCR i kategoryzacja wymagają informacji przy użyciu? | Wg Q-ZR-14: informacja w interfejsie czatu niezależnie od kwalifikacji (niski koszt). **Propozycja 08:** informacja przy OCR i kategoryzacji z nazwą dostawcy i krajem przetwarzania; czat — lit. b (pomoc w ramach usługi, `09` RA-07); okres przechowywania rozmów do decyzji (`09` § 10) | ZR-06 art. 3, art. 50 ust. 1; art. 6 ust. 1 lit. b, art. 13 ust. 1 lit. e–f; ZR-56 (tło) | WYM-62, WYM-18; ZGD-08, INW-06, AI-03, AI-05 | **P1** — jeśli art. 50 stosuje się bez zmian, obowiązek już działa | Q-ZR-14; QA1-12; `A2` pyt. 7 (cz. 2); `02` pyt. 9 |
| Q-11 | Czy dane JDG na fakturach (imię i nazwisko, NIP, adres) są zawsze danymi osobowymi (stanowisko UODO i sądów polskich)? Czy ujawnianie zalogowanym użytkownikom nazw organizacji korzystających z FaktFlow pod danym NIP (zapobieganie duplikatom, MIN-03) jest uzasadnionym interesem? | Wg Q-ZR-16: tak, gdy odnoszą się do zidentyfikowanej osoby fizycznej. Dla MIN-03 — wg rekomendacji `A1`: zwracać tylko fakt „ten NIP ma już organizację”, bez nazw; prośbę o dostęp kierować do właściciela organizacji | art. 4 pkt 1, motyw 14; art. 5 ust. 1 lit. f, art. 6 ust. 1 lit. f, art. 25 ust. 2 | WYM-02, WYM-33; MIN-03 | P2 | Q-ZR-16; QA1-14 |

### 3.3. Urządzenie końcowe, cookies i zgoda w przeglądarce

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-12 | Brzmienie art. 398–400 PKE: czy zgoda może być wyrażona ustawieniami przeglądarki; organ właściwy (Prezes UKE, relacja do Prezesa UODO) i sankcje; numer i zakres przepisu o marketingu bezpośrednim | Wg Q-ZR-04: zgoda aktywna w banerze niezależnie od ustawień przeglądarki (wariant ostrożny) | ZR-11 art. 398–400; ZR-02 art. 5 ust. 3; ZR-31 (EDPB 05/2020) | WYM-63, WYM-64, WYM-66; brzmienie banera i informacji o technologiach; `09` § 12 | **P1** | Q-ZR-04; Q-ZR-05 (cz.) |
| Q-13 | Które technologie w urządzeniu końcowym są „ściśle niezbędne”: sesja Supabase (ciasteczko do 400 dni, bez wyboru „zapamiętaj mnie”), zapis decyzji o zgodzie w `localStorage`, motyw, ciasteczko organizacji `ksef.active_org`, service worker z precache i Cache Storage zapisywany każdemu gościowi stron marketingowych, Turnstile na stronach logowania, SDK Sentry w przeglądarce (błędy vs sesje release health i 10 % transakcji; odczyt user agent i parametrów ekranu jako „dostęp”), push? Czy sesje i transakcje Sentry w przeglądarce można oprzeć na lit. f bez zgody? | Wg Q-ZR-06, `09` L-06 i tabeli technologii `A1`: sesja i zapis zgody — niezbędne; motyw — prawdopodobnie niezbędny (funkcja żądana); Turnstile — ściśle niezbędny do logowania (propozycja `A1`/`A4`); Sentry: błędy — LIA pozytywna pod warunkami, sesje i ślady w przeglądarce — LIA negatywna na lit. f → wyłączyć albo objąć zgodą. **Propozycja 08:** ciasteczko organizacji — niezbędne (funkcja żądana przez zalogowanego); service worker — rejestrować tylko w aplikacji, nie na stronach marketingowych; sesja 400 dni — skrócić albo dodać wybór „zapamiętaj mnie” | ZR-02 art. 5 ust. 3; ZR-11 art. 399; ZR-34 (EDPB 2/2023), ZR-53 (WP194), ZR-62 (Planet49); art. 6 ust. 1 lit. f | WYM-63, WYM-64, WYM-32; RUN-04, RUN-06, RUN-09, ZGD-10, ZGD-11; zakres specyfikacji zgody (`09` § 12) | **P1** | Q-ZR-06; QA1-05; QA1-06; QA1-07; `A4` pyt. 1, 2, 5; `02` pyt. 10 (cz. 2) |
| Q-14 | Czy dynamiczne ładowanie arkusza Material Symbols z serwerów Google przed jakimkolwiek wyborem wymaga zgody; jaka podstawa i mechanizm transferu IP odwiedzających do Google; czy samohostowanie zamyka sprawę, także dla oceny stanu historycznego? | Wg `A4` pyt. 3 i `04` PRC-10: samohostowanie jako środek techniczny — rekomendacja niezależna od odpowiedzi; ocena stanu historycznego do prawnika (LG München I, 20.01.2022, 3 O 17493/20 — sąd niemiecki, materiał pomocniczy) | art. 6, rozdz. V, art. 13; ZR-02 art. 5 ust. 3; ZR-11 art. 399; ZR-68 (C-40/17), ZR-69 (C-582/14); LG München I | WYM-63, WYM-58; RUN-05, PRC-10 — od odpowiedzi zależy tylko ocena okresu przeszłego | P2 | QA1-16; `A4` pyt. 3; `02` pyt. 10 (cz. 3) |
| Q-15 | Jaki minimalny zakres „dowodu zgody” (wersja treści, data, zapis po stronie serwera) jest wymagany dla analityki opartej na zgodzie — dla anonimowych odwiedzających i dla zalogowanych? | **Propozycja 08** (na podstawie WYM-13): zalogowani — zapis po stronie serwera (wersja, chwila, wybór, wycofanie); anonimowi — wersja i data w `localStorage` oraz wersjonowana treść banera w repo; bez zbierania dodatkowych identyfikatorów tylko po to, by wykazać zgodę (art. 11) | art. 7 ust. 1, art. 11, motyw 42; ZR-31 | WYM-13, WYM-14; RUN-10; `09` § 12 | P2 | `A4` pyt. 6 |

### 3.4. Prawa osób

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-16 | Czy notatki operatorów (`admin_user_notes`) i wpisy dziennika o osobie zapisane przez innych podlegają wydaniu w kopii z art. 15; czy kopia musi obejmować dane u procesorów (PostHog, Sentry), czy wystarczy informacja o nich; czy trzeba wskazać konkretnych odbiorców? | **Propozycja 08:** notatki i wpisy o osobie — tak, z ochroną danych innych osób (art. 15 ust. 4; C-579/21: informacje o konsultacjach danych — tak, tożsamość pracowników co do zasady nie); dane u procesorów — pozyskać za pośrednictwem procesora albo wydać w dostępnym zakresie; odbiorcy — konkretni, na żądanie (C-154/21) | art. 15 ust. 1 lit. c, ust. 3–4; ZR-33 (EDPB 01/2022), ZR-64 (C-487/21), ZR-65 (C-154/21), ZR-67 (C-579/21) | WYM-21, WYM-22; PRA-01; zakres eksportu (`lib/gdpr/data-collector.ts`) i procedury `09` § 8 | P2 | `A2` pyt. 5 |
| Q-17 | Relacja prawa do sprostowania (art. 16) do przepisów o korekcie faktur: czy faktura korygująca (bez edycji oryginału) wystarcza i jak to opisać w polityce? | Wg Q-ZR-17: dane na wystawionej fakturze — tylko przez korektę zgodną z ustawą o VAT; dane konta i kartoteki kontrahenta — bezpośrednio | art. 16; ZR-13 (przepisy o fakturach korygujących — artykuł do wskazania) | WYM-07, WYM-23; PRA-05; opis w polityce i w odpowiedzi na żądanie | P3 | Q-ZR-17; `A2` pyt. 4 |
| Q-18 | Które żądania osób bez konta FaktFlow obsługuje sam (FF-A: newsletter, odbicia, zaproszenia), a które przekazuje klientowi (FF-P: kontrahenci, adresaci faktur i przypomnień); jaki termin przekazania wpisać do umowy; jak weryfikować tożsamość proporcjonalnie przy żądaniach e-mailowych; czy automatyczna klasyfikacja poczty z alarmem „pilne” (bez rejestru) wystarcza jako ułatwienie wykonywania praw, czy potrzebna jest ewidencja z datą wpływu i odpowiedzi? | Wg `09` § 8: podział według roli; identyfikacja proporcjonalna (korespondencja zwrotna na adres, którego żądanie dotyczy; bez skanów dokumentów). **Propozycja 08:** przekazanie klientowi „bez zbędnej zwłoki”, z konkretnym terminem w dniach roboczych do decyzji; ewidencja z datą wpływu, terminem i odpowiedzią — potrzebna do rozliczalności, sama klasyfikacja nie wystarcza | art. 5 ust. 2, art. 12 ust. 2–3, 6, art. 28 ust. 3 lit. e; ZR-33 | WYM-17, WYM-21, WYM-44, WYM-75; PRA-09, PRA-11, DOW-04; termin w umowie powierzenia | **P1** | `A2` pyt. 8; P-11 |
| Q-19 | Koniec powierzenia: czy FaktFlow jako procesor może albo musi przechowywać faktury klienta po zakończeniu umowy — czy obowiązki podatnika to „prawo nakazujące przechowywanie” w rozumieniu art. 28 ust. 3 lit. g? Jakie dane usunąć lub zwrócić, gdy klient w UI usuwa organizację (UI zapowiada nieodwracalność po 30 dniach)? Kto jest administratorem danych firmy jednoosobowej po usunięciu konta jej jedynego właściciela? Jak ma brzmieć komunikat UI, żeby nie obiecywał więcej, niż robi kod? | Wg Q-ZR-01: nie — obowiązek ma podatnik; FaktFlow przechowuje tylko na polecenie klienta (np. archiwum w umowie), z wyborem zwrotu albo usunięcia i określonym końcem okresu. **Propozycja 08:** przed usunięciem organizacji pełny eksport w formacie do odczytu maszynowego i wybór klienta; komunikat UI dopasowany do faktycznego mechanizmu | art. 17 ust. 3 lit. b, art. 20, art. 28 ust. 3 lit. g; ZR-13 art. 112; ZR-14 art. 86 § 1; ZR-08 (Data Act — zastosowanie do review, Q-44) | WYM-45 (obecne W), WYM-27, WYM-24, WYM-73; PRA-04, RET-04, DOW-17, SOC-29; zakres danych zatrzymywanych przez wykonawcę `hard_delete_at` | **P1** | Q-ZR-01; `A2` pyt. 2; `02` pyt. R1 (usunięcie organizacji) |

### 3.5. Retencja i usuwanie

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-20 | Jaki okres i jaką podstawę wpisać w polityce zamiast „Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)” (`polityka-prywatnosci/page.tsx:230`)? Czy regułą jest „5 lat od końca roku, w którym upłynął termin płatności podatku” (art. 70 § 1 w zw. z art. 86 § 1 OP, art. 112 VAT), czy 10 lat wynika z innego przepisu (przechowywanie w KSeF przez MF — wg R2 art. 112ba; rachunkowość) i czy dotyczy podatnika, czy tylko MF? Kto ustala okres, gdy klient jest administratorem? Od jakiej daty liczyć bieg? Czy reguła obejmuje faktury kosztowe, zdjęcia paragonów i dane KPiR? Czy kopia w FaktFlow jest niezbędna, skoro MF przechowuje faktury w KSeF? | Wg Q-ZR-02: rozdzielić (a) okres obowiązku klienta (co do zasady 5 lat od końca roku płatności podatku, z możliwym wydłużeniem), (b) okres przechowywania przez FaktFlow na polecenie klienta, (c) KSeF jako odrębne repozytorium MF; nie powoływać art. 70 § 1 jako źródła 10 lat. **Propozycja 08:** bieg od daty dokumentu albo okresu rozliczeniowego, nie od dnia uruchomienia joba (RET-01); okres jako parametr ustalany w umowie | ZR-13 art. 112, 112a, przepisy o KSeF; ZR-14 art. 70, 70a, 86; ZR-15 art. 74; ZR-16; art. 5 ust. 1 lit. e, art. 28 ust. 3 lit. g | WYM-08, WYM-68, WYM-69, WYM-71; RET-01, RET-05, INW-18; wartość parametru retencji, treść polityki i umowy (mechanizm można budować bez odpowiedzi) | **P1** — polityka publiczna; mechanizm uśpiony do pierwszego terminu | Q-ZR-02; `02` pyt. 5; `A2` pyt. 1 (cz. 1); `06` pyt. 5 |
| Q-21 | Czy po upływie okresu FaktFlow ma usuwać wiersz faktury przesłanej do KSeF (dziś niemożliwe — wyzwalacz z `00132` blokuje `DELETE` także dla roli serwisowej), czy wystarczy usunięcie danych osobowych z kopii lokalnej, skoro oryginał pozostaje w KSeF? Czy zamrożenie danych nabywcy (w tym PESEL) na wysłanej fakturze także dla operatora mieści się w wyjątku art. 17 ust. 3 lit. b na cały okres przechowania i jak to opisać w odpowiedzi na żądanie usunięcia? | **Propozycja 08** (zgodna z `A2`, kolejność pkt 5): po upływie okresu — usunięcie danych osobowych z kopii lokalnej (wiersz zostaje jako ślad techniczny bez danych osobowych) albo ścieżka serwisowa w wyzwalaczu; w okresie przechowania — zamrożenie uzasadnione obowiązkiem podatnika, a w odpowiedzi na żądanie: wskazanie wyjątku i daty końca okresu | art. 5 ust. 1 lit. e, art. 17 ust. 1, ust. 3 lit. b; ZR-13 (KSeF) | WYM-73, WYM-24, WYM-68; RET-02, SOC-29; projekt migracji wyzwalacza (ścieżka serwisowa albo zerowanie) | **P1** — przed pierwszym terminem retencji | `A2` pyt. 1 (zd. ost.), pyt. 10; R3 § 8 pkt 1–2 (naniesione do `A2`); `06` pyt. 5 (cz.) |
| Q-22 | Czy przechowywanie przez FaktFlow elektronicznych kopii faktur w Niemczech nakłada na klienta obowiązki z art. 112a ustawy o VAT (zawiadomienie, dostęp online) i czy FaktFlow powinien o tym informować? | Wg Q-ZR-03: do ustalenia; jeśli tak — informacja w regulaminie i zapewnienie dostępu. **Propozycja 08:** niezależnie od odpowiedzi opisać w regulaminie lokalizację (Niemcy, Norymberga) i sposób dostępu | ZR-13 art. 112a (ustępy do potwierdzenia) | WYM-69; regulamin; ewentualna funkcja dostępu | P2 | Q-ZR-03 |
| Q-23 | Dziennik audytu: jaki okres przechowywania IP i user agent jest uzasadniony i dla jakich klas zdarzeń (dostęp, finanse, KSeF, płatności, RODO); czy członkowie organizacji mogą widzieć IP i user agent pozostałych; czy pseudonimizacja wpisów po usunięciu konta (zerowanie identyfikatora i IP przy zachowaniu `tenant_id` i treści `details_json`) wystarcza wobec art. 17 — także przy organizacji jednoosobowej; czy wpisy wysyłek do KSeF i operacji płatniczych mogą być usuwane po 12 miesiącach; czy anonimizacja może usuwać całe `metadata`; czy e-mail księgowej przy każdym wejściu do portalu i e-mail odbiorcy faktury mają w audycie podstawę; czy wolny tekst notatki decyzji klienta w `details_json` może zostać po usunięciu konta? | Wg `09` L-01: IP i user agent tylko dla zdarzeń bezpieczeństwa; niewidoczne dla ról niższych; retencja per klasa zdarzeń. **Propozycja 08:** wartości okresów do decyzji ([PR225] `data-policy.md` przyjął 13 mies. dla audytu dostępu i 10 lat dla audytu finansowego — decyzja niewdrożona); pseudonimizacja musi obejmować `details_json` i `metadata` z danymi osobowymi; przy JDG `tenant_id` pozwala zidentyfikować osobę — to pseudonimizacja, nie anonimizacja (MIN-11); identyfikator zamiast e-maila osoby trzeciej | art. 5 ust. 1 lit. c, e, art. 6 ust. 1 lit. f, art. 17, art. 32, motywy 26, 49; ZR-43 (konsultacyjny), ZR-54 (WP216) | WYM-36, WYM-38, WYM-71; INW-09, MIN-11, DOW-07, DOW-09, RET-03; migracja klas retencji i funkcji anonimizacji | P2 | `02` pyt. 7; QA1-13; `A2` pyt. 3 (cz. 1–2); P-05; P-06; P-12 |
| Q-24 | Jak długo przechowywać `gdpr_deletion_requests.user_email`, IP i user agent oraz rejestr wykonanych żądań po wykonaniu usunięcia (rozliczalność a minimalizacja)? | **Propozycja 08:** minimalny zapis dowodowy (identyfikator żądania, data, rodzaj, wynik, skrót adresu z kluczem) przez okres do decyzji — np. przedawnienia roszczeń związanych z żądaniem (KC art. 117–118, ZR-17) [NZ] **[R5b]**; IP i user agent usunąć po wykonaniu | art. 5 ust. 1 lit. c, e, ust. 2, art. 17 ust. 3 lit. e; ZR-17 art. 117–118 **[R5b]** | WYM-71, WYM-74, WYM-75; PRA-11, INW-01; rejestr żądań (`09` § 8.5) | P2 | `02` pyt. 11; `A2` pyt. 3 (cz. 3) |
| Q-25 | Czy dopuszczalne jest wygasanie danych usuniętych wraz z rotacją kopii (dziś 14 dni lokalnie; po decyzji o Storage Box do ok. 12 miesięcy) przy procedurze ponownego usunięcia po odtworzeniu; jaki maksymalny okres rotacji; jak to opisać osobom? | Wg Q-ZR-13: tak, przy krótkiej, opisanej rotacji i ponownym zastosowaniu usunięć po odtworzeniu. **Propozycja 08:** 12 miesięcy kopii miesięcznych z pełnymi danymi osobowymi wymaga osobnego uzasadnienia albo skrócenia | art. 5 ust. 1 lit. e, art. 17, art. 32 ust. 1 lit. c; ZR-45 (CEF 2025 — status nieznany); WYM-72 klasa I (O do potwierdzenia) | WYM-72, WYM-51; INW-04, RET-09; parametry rotacji (7/4/12) i procedura odtworzenia | **P1** — przed wdrożeniem kopii poza hostem | Q-ZR-13; `02` pyt. 8; `A2` pyt. 6 |
| Q-26 | Jaki okres przechowywania logów dostępu z adresami IP (Kong, GoTrue, PostgREST, baza `_supabase`, odwrotne proxy, Docker) jest uzasadniony dla bezpieczeństwa; czy logi muszą być objęte usuwaniem konta, czy wystarczy krótka retencja techniczna? | **Propozycja 08** (zgodna z [PR225] `data-policy.md`: logi lokalne do 7 dni — przyjęte, niewdrożone): krótka retencja techniczna bez usuwania per osoba; opis w polityce | art. 5 ust. 1 lit. e, art. 6 ust. 1 lit. f, art. 17, motyw 49 | WYM-36, WYM-71; RET-09, RET-10; zależy od faktów N-20 | P2 | `02` pyt. R1 (logi Supabase) |
| Q-27 | Czy dane klienta w Stripe po usunięciu konta anonimizować (ADR 0006 to deklaruje, kod tego nie robi), czy zachować z powodu obowiązków rachunkowych i podatkowych FaktFlow; jaki okres dla własnych faktur za subskrypcje? | **Propozycja 08:** dane rozliczeniowe przechowywać przez okres obowiązku podatkowego FaktFlow i przedawnienia roszczeń, potem usunąć albo zanonimizować; ADR 0006 poprawić do stanu faktycznego | art. 6 ust. 1 lit. c, art. 17 ust. 3 lit. b, e; ZR-13, ZR-14, ZR-15, ZR-17 | WYM-70, WYM-26; DOW-18 | P2 | P-07 |

### 3.6. Minimalizacja i udostępnianie

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-28 | Czy na fakturze dla konsumenta wysyłanej do KSeF identyfikator nabywcy (PESEL, numer dokumentu) jest wymagany, dozwolony czy zbędny; czy domyślne „bez identyfikatora” jest właściwe; czy przechowywanie poza samym dokumentem (osobne kolumny) jest dopuszczalne; jakie wymogi stawia art. 87 RODO i przepisy krajowe? | **Propozycja 08** (na podstawie `A1` MIN-01 i WYM-X-03): domyślnie bez identyfikatora; PESEL tylko na wyraźny wybór; jedno miejsce przechowywania, ograniczona widoczność | art. 5 ust. 1 lit. c, art. 25 ust. 2, art. 87; ZR-13 (elementy faktury — przepis do wskazania); schemat FA(3) (pole identyfikatora nabywcy) | WYM-X-03, WYM-32; MIN-01, INW-05; zmiana domyślnej wartości (`components/invoices/invoice-form.tsx:437,774`) — wariant ostrożny nie zależy od odpowiedzi | **P1** — domyślny PESEL działa dziś w UI | `02` pyt. 6; QA1-01 |
| Q-29 | Czy domyślna ważność linku dla księgowej (90 dni, link-okaziciel) jest zgodna z art. 25 ust. 2 i art. 32? | Wg rekomendacji `A1` MIN-06 i `02` INW-19: domyślnie 30 dni z przypomnieniem; powiązanie linku z adresem księgowej (kod jednorazowy); paczki przez portal zamiast linków 7-dniowych; potwierdzenie adresów CC | art. 25 ust. 2, art. 32; ZR-30 (EDPB 4/2019) | WYM-33; MIN-06, INW-19 | P2 | QA1-15 |
| Q-30 | Czy UUID organizacji (dla JDG), numer KSeF zawierający NIP osoby fizycznej i skróty SHA-256 IP i e-maila w kluczach limitów są danymi osobowymi dla odbiorców (Telegram, Slack, ewentualny zewnętrzny Redis, skrypty operacyjne) w świetle C-413/23 P i C-582/14; czy wpływa to na potrzebę umowy i mechanizmu transferu? | **Propozycja 08:** dla FaktFlow — dane osobowe (ma środki identyfikacji); dla odbiorcy — zależnie od jego środków (C-413/23 P, pewność średnia); wariant ostrożny: nie wysyłać tych identyfikatorów do Telegramu i Slacka (PRC-12) i stosować HMAC w kluczach limitów (`09` L-02) | art. 4 pkt 1, 5, motyw 26; ZR-69 (C-582/14), ZR-69a (C-413/23 P), ZR-43 | WYM-38, WYM-58, WYM-X-02; PRC-07, PRC-12; zmiana techniczna nie zależy od odpowiedzi | P2 | `04` pyt. 8; R2 § 9 pkt 3 (nieprzeniesione do `04` — dodane tutaj) |

### 3.7. Procesorzy, transfery i dostęp

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-31 | Jaki okres sprzeciwu i jaka forma powiadomienia o zmianie dalszego procesora są właściwe w umowie z mikroprzedsiębiorcami i biurami rachunkowymi, skoro Anthropic daje FaktFlow 15 dni [DOK-3]; zgoda ogólna czy szczegółowa? | **Propozycja 08:** ogólna pisemna zgoda z publikowaną listą i powiadomieniem e-mailem; termin sprzeciwu klienta krótszy niż 15 dni (np. 10 dni), żeby FaktFlow zdążył zgłosić sprzeciw u dostawcy; prawo wypowiedzenia przy sprzeciwie | art. 28 ust. 2, 4; ZR-05 (SCC 2021/915); ZR-41 (Opinion 22/2024); DOK-3 C.3 | WYM-43, WYM-41; `09` § 6 i § 7 | **P1** | `04` pyt. 3 |
| Q-32 | Czy przypadkowe dane z art. 9 w treści faktur, wydatków i OCR (np. usługi medyczne) wymagają szczególnych postanowień w umowie powierzenia; jak to pogodzić z DPA Anthropic deklarującym „Special categories of personal data: None” (Schedule 1 B.3 [DOK-3])? | Wg Q-ZR-09: ogólne postanowienie w umowie o możliwych danych szczególnych kategorii i środkach, bez osobnego produktu. **Propozycja 08:** przełącznik AI per organizacja pozwala klientom z sektora zdrowia wyłączyć wysyłkę do modelu; uzgodnić z Anthropic zakres opisu | art. 9, art. 28 ust. 3, art. 32; DOK-3 | WYM-16, WYM-62; PRC-06; treść umowy powierzenia | P2 | `04` pyt. 2; Q-ZR-09 |
| Q-33 | Czy przy DPF wystarczy datowana weryfikacja certyfikatu, czy rekomendowana jest pełna TIA także dla dostawców z DPF (przyszłość decyzji 2023/1795, sprawa T-553/23)? | Wg `04` § 4.2: przy aktywnym DPF TIA w rozumieniu klauzuli 14 SCC nie jest wymagana (transfer na art. 45); przy SCC — jest wymagana. **Propozycja 08:** zapis weryfikacji DPF z datą i plan awaryjny (SCC) na wypadek unieważnienia | art. 44–46; ZR-03, ZR-04 (kl. 14–15), ZR-38, ZR-60 (Schrems II), ZR-61 (T-553/23), ZR-82 | WYM-59, WYM-60; zakres TIA (`09` § 5) | P2 | `04` pyt. 9 |
| Q-34 | Czy sesje agentów AI (dostawców modeli) z dostępem do danych produkcyjnych wymagają umowy powierzenia, wpisu do rejestru i na listę dalszych procesorów; czy dopuszczalne jest przetwarzanie wyciągów z produkcji na planach konsumenckich (warunki bez DPA, możliwe trenowanie [DOK-9]); czy potrzebne są pisemne zobowiązania do poufności także od współpracowników spoza zatrudnienia (art. 28 ust. 3 lit. b); jakie minimum umowne? | **Propozycja 08** (zgodna z `04` PRC-07 i `A3` DOW-23): agent z dostępem do danych = dalszy procesor → tylko plan komercyjny z DPA i wpis na listę; plany konsumenckie — bez dostępu do danych produkcyjnych; upoważnienie i zobowiązanie do poufności dla każdej osoby z dostępem | art. 28 ust. 2–4, ust. 3 lit. b, art. 29, art. 32 ust. 4, art. 44; DOK-1, DOK-3, DOK-9 | WYM-47, WYM-62, WYM-X-02, WYM-43; PRC-07, DOW-23; zakres dostępu agentów | **P1** | `04` pyt. 7; `06` pyt. 4; P-10 |
| Q-35 | Czy przed założeniem spółki dopuszczalne jest prowadzenie kanału żądań RODO (`pomoc@` → Cloudflare Email Routing → prywatne skrzynki operatorów) na kontach osób fizycznych i na jakich warunkach? | **Propozycja 08:** przejściowo — tylko z upoważnieniem, zobowiązaniem do poufności, rejestrem żądań i usuwaniem wiadomości po obsłudze; docelowo skrzynka podmiotu z umową z dostawcą poczty | art. 12 ust. 2, art. 28, art. 29, art. 32 ust. 4 | WYM-17, WYM-47; PRC-08, DOW-04; zależy od N-01 i N-12 | **P1** | `04` pyt. 11 |

### 3.8. Bezpieczeństwo, naruszenia, DPIA, IOD, rejestry

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-36 | Jaki termin i treść zawiadomienia klienta-administratora o naruszeniu wpisać w umowie powierzenia (art. 33 ust. 2), skoro strona RODO obiecuje „72 godzin” (`rodo/page.tsx:64`)? | Wg Q-ZR-12: termin krótszy niż 72 h (praktyka rynkowa 24–48 h od stwierdzenia — klasa I) i informacja przyrostowa; poprawić deklarację na stronie (72 h dotyczy administratora wobec organu) | art. 33 ust. 1–2, 4; ZR-36 (EDPB 9/2022) | WYM-53, WYM-52; DOW-03; umowa powierzenia; wymaga N-06 (dyżur) | **P1** | Q-ZR-12; P-03 |
| Q-37 | Kwalifikacja zdarzeń jako możliwych naruszeń: (a) przekazywanie ciasteczek sesji pierwszej strony i nagłówków przeglądarki do PostHog i Sentry przez `/ingest` i `/monitoring` (RUN-08), jeśli potwierdzi się na produkcji — czy to naruszenie wymagające oceny z art. 33 i jakie pytania zadać dostawcom; (b) jeśli 2 nagrania replay w PostHog pochodzą z produkcji i zawierają dane klientów — czy to naruszenie (art. 4 pkt 12) z oceną z art. 33 i wpisem do rejestru; (c) czy wysłanie faktur z danymi prawdziwych nabywców do testowego KSeF byłoby udostępnieniem bez podstawy i naruszeniem art. 32? | **Propozycja 08:** każde z trzech zdarzeń, jeśli fakty się potwierdzą (N-02, N-08, N-17), traktować jako incydent do oceny ryzyka według EDPB 9/2022 i wpisać do wewnętrznego rejestru naruszeń (art. 33 ust. 5) niezależnie od decyzji o zgłoszeniu; zgłoszenie do organu i zawiadomienie osób — według wyniku oceny; najpierw zatrzymać przepływ | art. 4 pkt 12, art. 32, art. 33 ust. 1, 5, art. 34; ZR-36, ZR-37 (EDPB 01/2021) | WYM-52, WYM-36, WYM-34, WYM-37; RUN-08, PRC-09, PRC-17; kolejność napraw | **P1** — natychmiast po ustaleniu faktów | `A4` pyt. 4; R2 § 9 pkt 1–2 (nieprzeniesione do `04` — dodane tutaj) |
| Q-38 | Czy przetwarzanie z użyciem modeli językowych (OCR, kategoryzacja, czat) na danych finansowych spełnia ≥ 2 kryteria WP248 albo mieści się w wykazie Prezesa UODO; czy DPIA ciąży na kliencie, a FaktFlow powinien przeprowadzić dobrowolną DPIA funkcji AI? | Wg Q-ZR-11 i `A3` § 6.1: DPIA dla przetwarzania z modelami językowymi (dobrowolna po stronie FaktFlow, bo to FaktFlow wybiera dostawcę i zakres danych); pakiet materiałów dla DPIA klientów; udokumentowany screening pozostałych operacji; DPIA jako warunek włączenia `payment.score` i FLO | art. 28 ust. 3 lit. f, art. 35 ust. 1, 3, 4, 7; ZR-20 (wykaz UODO), ZR-46 (WP248) | WYM-55, WYM-56, WYM-31; DOW-20; `09` § 3; zależy od N-04 | **P1** dla funkcji AI działających dziś; P2 pozostałe | Q-ZR-11; P-02 |
| Q-39 | Czy FaktFlow musi wyznaczyć inspektora ochrony danych (art. 37 ust. 1 lit. b lub c — także jako procesor), skoro runbooki odwołują się do „DPO”; jaki przepis u.o.d.o. określa zawiadomienie Prezesa UODO i w jakim terminie? | Wg Q-ZR-10 i Q-ZR-18: nie — główna działalność to przetwarzanie dokumentów, nie regularne i systematyczne monitorowanie na dużą skalę; udokumentować analizę; zawiadomienie — art. 10 ust. 1 u.o.d.o., 14 dni (wg R2, pewność wysoka). **Propozycja 08:** w runbookach zastąpić „DPO” rolą osoby odpowiedzialnej | art. 37–39; ZR-10; ZR-48 (WP243), ZR-57 | WYM-57; DOW-03; ocena IOD nieprzygotowana (`09` § 13); zależy od N-04 | P2 | Q-ZR-10; Q-ZR-18; P-04; N-09-03 |
| Q-40 | Czy wyjątek z art. 30 ust. 5 na pewno nie ma zastosowania i FaktFlow musi prowadzić oba rejestry mimo małej skali? | Wg Q-ZR-15: wyjątek nie ma zastosowania — przetwarzanie nie jest sporadyczne; oba rejestry (`09` §§ 1–2) | art. 30 ust. 1, 2, 5; ZR-55 | WYM-48, WYM-49; DOW-01 | **P1** | Q-ZR-15; P-01 |

### 3.9. SOC 2, umowa z klientem i inne

| ID | Pytanie | Interpretacja robocza — założenie do potwierdzenia | Podstawy [NZ] | Wpływ odpowiedzi na plan | Prio | Źródła |
|---|---|---|---|---|---|---|
| Q-41 | Regulamin mówi „99.9% czasu” i „SLA dostępność liczona miesięcznie” (`regulamin/page.tsx:76-77`), bez pomiaru i skutków. Czy to zobowiązanie umowne i czy przed startem zmienić brzmienie? | **Propozycja 08:** dopóki brak pomiaru (SOC-24) — zobowiązanie starannego działania bez liczby albo liczba z pomiarem i określonymi skutkami | ZR-12 art. 8 UŚUDE (regulamin); przepisy KC o zobowiązaniach umownych — poza rejestrem szczegółowym; kryterium A1 (ZR-70) | WYM-SOC-2; SOC-24; regulamin | P2 | `06` pyt. 1 |
| Q-42 | Czy materiały sprzedażowe lub strona RODO mogą wspominać SOC 2 przed raportem? | Wg `06` § 11: nie używać „zgodny z SOC 2”, „certyfikat SOC 2” ani „SOC 2 ready” bez raportu niezależnego audytora; dziś takich deklaracji w `app`, `components`, `content`, `lib` nie ma (`05` § 14) | ZR-72, ZR-73; przepisy o nieuczciwych praktykach rynkowych i reklamie wprowadzającej w błąd — poza rejestrem ZR | WYM-SOC-7; reguła na przyszłość, bez zmian w kodzie | P3 | `06` pyt. 2 |
| Q-43 | Czy raport SOC 2 (dowolna kategoria) może służyć jako element wykazania środków w ramach rozliczalności (art. 5 ust. 2, art. 24), skoro nie jest testem zgodności z RODO? | Wg `06` § 9.4: może być elementem wykazania środków (art. 24, art. 32), ale nie zastępuje rejestrów, DPIA, LIA ani oceny zgodności; nie jest certyfikacją z art. 42 | art. 5 ust. 2, art. 24, art. 32 ust. 1 lit. d, art. 42; ZR-70 | WYM-SOC-5, WYM-10, WYM-30; decyzja o kategorii Privacy w badaniu | P3 | `06` pyt. 3 |
| Q-44 | Czy rozdział VI Data Act (zmiana dostawcy usług przetwarzania danych: umowa, eksport, opłaty; stosowanie od 12.09.2025) obejmuje FaktFlow jako dostawcę SaaS dla mikroprzedsiębiorców i czy przysługują wyłączenia? | Wg `03` ZR-08 — sygnał „do review”, bez wymagania. **Propozycja 08:** eksport pełnych danych organizacji w formacie do odczytu maszynowego wdrażać niezależnie od odpowiedzi, bo wynika także z art. 20 i art. 28 ust. 3 lit. g RODO | ZR-08 rozdz. VI | WYM-27, WYM-45; regulamin (zmiana dostawcy, terminy, opłaty) | P3 | `03` ZR-08 (brak pytania w `03` § 5.2 — dodane tutaj) |

### 3.10. Indeks: pytania źródłowe → Q-NN

| Plik | Odwzorowanie |
|---|---|
| `02` § 8 | pyt. 1 → Q-01; 2 → Q-05; 3 → Q-02; 4 → Q-04; 5 → Q-20; 6 → Q-28; 7 → Q-23; 8 → Q-25; 9 → Q-10; 10 → Q-06, Q-13, Q-14; 11 → Q-24; 12 → Q-07; 13 → Q-03; R1 „usunięcie organizacji” → Q-19; R1 „logi Supabase” → Q-26 |
| `03` § 5.2 | Q-ZR-01 → Q-19; 02 → Q-20; 03 → Q-22; 04 → Q-12; 05 → Q-07, Q-12; 06 → Q-13, Q-06; 07 → Q-03; 08 → Q-04; 09 → Q-32; 10 → Q-39; 11 → Q-38; 12 → Q-36; 13 → Q-25; 14 → Q-10; 15 → Q-40; 16 → Q-11; 17 → Q-17; 18 → Q-39; ZR-08 → Q-44 |
| `04` § 7 | pyt. 1 → Q-01; 2 → Q-32; 3 → Q-31; 4 → Q-03; 5 → Q-03; 6 → Q-03; 7 → Q-34; 8 → Q-30; 9 → Q-33; 10 → Q-09; 11 → Q-35 |
| `A1` | QA1-01 → Q-28; 02 → Q-02; 03 → Q-07; 04 → Q-07; 05 → Q-13; 06 → Q-13; 07 → Q-13; 08 → Q-06; 09 → Q-08; 10 → Q-04; 11 → Q-09; 12 → Q-10; 13 → Q-23; 14 → Q-11; 15 → Q-29; 16 → Q-14 |
| `A2` | pyt. 1 → Q-20, Q-21; 2 → Q-19; 3 → Q-23, Q-24; 4 → Q-17; 5 → Q-16; 6 → Q-25; 7 → Q-01, Q-10, Q-05; 8 → Q-18; 9 → Q-09; 10 → Q-21 |
| `A3` § 9 | P-01 → Q-40; P-02 → Q-38; P-03 → Q-36; P-04 → Q-39; P-05 → Q-23; P-06 → Q-23; P-07 → Q-27; P-08 → Q-07; P-09 → Q-09; P-10 → Q-34; P-11 → Q-18; P-12 → Q-23 |
| `A4` § 8 | pyt. 1 → Q-13; 2 → Q-13; 3 → Q-14; 4 → Q-37; 5 → Q-13 (opis w polityce — Q-09); 6 → Q-15 |
| `06` § 11 | pyt. 1 → Q-41; 2 → Q-42; 3 → Q-43; 4 → Q-34; 5 → Q-20, Q-21 |
| `09` § 14 | N-09-03 → Q-39 |
| R1 § 8 | 1 → Q-19; 2 → Q-26 |
| **[R5b]** R2 runda 1 § 7 (`R2-runda1.md`) | 1 → Q-37; 2 → Q-03, Q-14; 3 → Q-16; 4 → Q-44 |
| R2 § 9 (runda 2) | 1 → Q-37; 2 → Q-37; 3 → Q-30; 4 → Q-04 |
| R3 § 8 | 1 → Q-21; 2 → Q-21 |
| R4 § 10 | PR4-01 → Q-34; PR4-02 → Q-18; PR4-03 → Q-23 |

### 3.11. Powiązanie z planem `07`: Q-NN → etapy

Stan `07` jak w § 2.8. „Czeka” — etap ma w `07` § 2 warunek wskazujący
pytanie źródłowe z tego wiersza; „treść” — od odpowiedzi zależy brzmienie
albo wartość w etapie; „od razu” — etap startuje bez odpowiedzi (wariant
ostrożny), a odpowiedź może go najwyżej rozszerzyć.

| Q | Etapy `07` | Q | Etapy `07` |
|---|---|---|---|
| Q-01 | E-17 czeka (`04` pyt. 1, D-12 a); E-62 treść | Q-23 | E-47 czeka (P-05); E-32, E-34 od razu; E-20 czeka (P-12) |
| Q-02 | E-33 od razu; E-59 treść | Q-24 | E-20 czeka (RT-DSAR); E-22 od razu |
| Q-03 | E-61, E-62 treść | Q-25 | E-53 od razu (parametr rotacji); E-55 czeka |
| Q-04 | E-14 od razu; E-64 treść | Q-26 | E-41 od razu (część `_supabase` czeka D-06) |
| Q-05 | E-28 od razu (strażnik); E-60 treść | Q-27 | E-21 czeka (P-07); E-52 treść |
| Q-06 | E-27 czeka (L-03, D-12 g) | Q-28 | E-29 od razu; E-49 czeka (`02` pyt. 6) |
| Q-07 | E-13 od razu; E-65 czeka (P-08, Q-ZR-05) | Q-29 | E-43 czeka (D-12 f) |
| Q-08 | E-58 od razu; E-62, E-63 treść | Q-30 | E-16, E-35 od razu |
| Q-09 | E-01 od razu; E-63 treść | Q-31 | E-62 treść |
| Q-10 | E-12 od razu; E-60, E-63 treść | Q-32 | E-62 treść; E-17 |
| Q-11 | E-31 od razu | Q-33 | E-61 treść |
| Q-12 | E-18 od razu; E-63 treść | Q-34 | E-68 czeka (P-10); E-61, E-62 treść |
| Q-13 | E-06, E-08 od razu; E-42 czeka (RT-SESJA); E-63 treść | Q-35 | E-66 czeka (D-10) |
| Q-14 | E-07 od razu | Q-36 | E-62, E-67 treść |
| Q-15 | E-18 od razu | Q-37 | E-05, E-09, E-10 od razu (zatrzymanie przepływu); E-67 (rejestr naruszeń) |
| Q-16 | E-23 częściowo czeka (`A2` pyt. 5) | Q-38 | E-59, E-60 treść |
| Q-17 | E-24 od razu | Q-39 | E-59 treść (ocena IOD) |
| Q-18 | E-22 od razu; E-66 treść | Q-40 | E-59 treść |
| Q-19 | E-50 czeka (Q-ZR-01, `A2` pyt. 2); E-02, E-25 od razu | Q-41 | E-62 treść (regulamin); E-74 |
| Q-20 | E-51 czeka (Q-ZR-02, `A2` pyt. 1); E-40 od razu; E-63 treść | Q-42 | E-01 od razu; E-79 |
| Q-21 | E-51 czeka (`A2` pyt. 10) | Q-43 | E-79 |
| Q-22 | E-62, E-63 treść | Q-44 | E-25 od razu; E-62 treść |

## 4. Materiały do końcowego review prawnego

Zgodnie z pkt 1 zadania prawnik wykonuje wyłącznie końcowe review
przygotowanego rezultatu. Ta sekcja mówi, co i w jakiej kolejności ocenić.

### 4.1. Pliki audytu i zakres oceny

Wszystkie pliki leżą w `docs/audyt/13-prywatnosc-i-zgodnosc/`.

| Plik | Zawartość | Co prawnik ma ocenić | Stan recenzji |
|---|---|---|---|
| `00-ZADANIE.md` | pierwotne wymagania właściciela | nic — kontekst (pkt 1: prawnik robi tylko końcowe review) | — |
| `01-STAN-I-GRANICE.md` | wersja kodu, stos, infrastruktura, ograniczenia dowodowe, workflow agentów | czy ograniczenia (§ 5–6) nie podważają wniosków, które ma zatwierdzić; poziom dowodu faktów z PR #225 | R1, R4 (naniesione) |
| `02-INWENTARZ-I-PRZEPLYWY.md` | kategorie osób (O-NN) i danych (D-NN), magazyny, mapy przepływów, **role per operacja** (§ 4), INW-01 – INW-19 | kwalifikację ról FF-A / FF-P / odrębni administratorzy (§ 4.1–4.3); kategorie danych szczególnych i PESEL (INW-05); pytania § 8 | R1 (naniesione) |
| `03-REJESTR-ZRODEL.md` | rejestr źródeł ZR-01 – ZR-84, parafrazy przepisów RODO (§ 2.1a), katalog 82 wymagań WYM, zasady P/O/S/I (§ 4) | **identyfikację i parafrazy wszystkich źródeł** (wszystko [NZ] poza ZR-80); klasy P i O przypisane wymaganiom; status dokumentów konsultacyjnych (ZR-42, ZR-43) i niepewnych (ZR-45, ZR-61, ZR-69a); pytania Q-ZR | R2 runda 1 i 2 (naniesione) |
| `04-PROCESORZY-I-LOKALIZACJE.md` | rejestr odbiorców R-NN, PRC-01 – PRC-17, projekt listy dalszych procesorów (§ 3), ocena łańcucha i potrzeby TIA (§ 4), deklaracje stron a stan faktyczny (§ 5), odczytane dokumenty dostawców DOK-1 – DOK-12 (§ 8.2) | kwalifikację odbiorców (procesor, dalszy procesor, odrębny administrator); proponowaną interpretację DPF a TIA (§ 4.2); wnioski z DPA Anthropic (SCC moduł 2/3, sprzeciw 15 dni, usunięcie 30 dni po umowie, przechowywanie przez czas umowy) | R2 runda 1 i 2 (naniesione) |
| `05-MACIERZ-WYMAGAN.md` | macierz WYM → źródło → stan → dowód → luka → ryzyko → zmiana → test → zależność; 15 najważniejszych ryzyk (§ 12.2); sprzeczności (§ 12.3) | czy stany „brak / częściowe” są prawnie trafne dla wymagań klasy P; skalę ryzyka „obecne / K1” (§ 1.1) dla wymagań wysokiego ryzyka | **[R5b]** R5a (naniesione 13.10) |
| `06-SOC2.md` | mapowanie pięciu kategorii TSC, SOC-NN, rekomendacja ścieżki | tylko § 11 (pytania) i komunikację o SOC 2 (Q-41 – Q-43); kryteria AICPA są dobrowolne | R4 (naniesione) |
| `07-PLAN-ETAPOW.md` | plan 80 etapów E-00 – E-79 z kartami, E-00 — decyzje i odczyty D-01 – D-15, tor treści prawnych „projekt → review → publikacja” (`07` § 0.3) | kolejność etapów zależnych od pytań P1 (§ 3.11, § 4.4); karty etapów z treścią prawną (E-59 – E-68) | **[R5b]** kompletny (13.10, E-00 – E-79); R5a (naniesione); powiązania z tym plikiem sprawdzone przez R5b — zgodne |
| `08-NIEWIADOME-I-REVIEW-PRAWNE.md` | ten plik | **rozstrzygnąć Q-01 – Q-44**; potwierdzić źródła z § 4.2; wskazać pytania pominięte | **[R5b]** R5b (naniesione) |
| `09-MATERIALY-ROBOCZE.md` | projekty: rejestry, screening DPIA, LIA, TIA, szkielet umowy powierzenia, lista dalszych procesorów, procedury żądań i naruszeń, harmonogram retencji, wymagania treści polityki, specyfikacja zgody | każdy projekt według § 4.3 | **[R5b]** R5b (naniesione) |
| `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` | MIN-01 – MIN-12, ZGD-01 – ZGD-12, tabela „cel → proponowana podstawa → obowiązek informacyjny”, tabela technologii przeglądarkowych, deklaracje stron prawnych | proponowane podstawy przetwarzania per cel; klasyfikację technologii jako niezbędnych; ocenę deklaracji stron prawnych | R3 (naniesione) |
| `A2-MECHANIZMY-PRAWA-RETENCJA.md` | PRA-01 – PRA-11 (tabela praw D.1), RET-01 – RET-13 (tabela retencji E.1), AI-01 – AI-05 | zakres realizacji każdego prawa; proponowane wyjątki z art. 17 ust. 3; okresy i początek biegu w tabeli retencji | R3 (naniesione) |
| `A3-DOWODY-I-TESTY.md` | inwentarz dokumentów, ślad audytowy, CI, testy, DOW-01 – DOW-23, potrzeba DPIA, LIA, TIA (§ 6) | screening DPIA (§ 6.1), listę celów wymagających LIA (§ 6.2) i TIA (§ 6.3); DOW-23 (upoważnienia, poufność) | R4 (naniesione) |
| `A4-TEST-COOKIES-I-SIECI.md` + `narzedzia/` | test przeglądarkowy stron publicznych, RUN-01 – RUN-11 | klasyfikację technologii (§ 4); RUN-08 jako możliwe naruszenie (Q-37); RUN-04 (Sentry bez zgody) | R3 (naniesione) |
| `10-REVIEW.md` (jeśli powstanie) | wyniki recenzji i stan bramek | czy niezależne recenzje objęły wszystkie etapy | — |

### 4.2. Lista kontrolna źródeł pierwotnych [NZ]

Żadne źródło prawa, wytycznych ani kryteriów AICPA nie zostało odczytane
online w tej sesji (próby 403 — `03` § 1.1; WebSearch odrzucony przez
właściciela). Każda pozycja niżej wymaga potwierdzenia brzmienia,
numeru, daty i statusu, zanim teza trafi do dokumentu klienta. Kolumna
„Tezy zależne” mówi, co upada albo się zmienia, jeśli źródło brzmi inaczej.

**A. RODO (ZR-01)** — sprawdzić polską wersję ze sprostowaniami.

| Przepis | Teza audytu zależna od brzmienia | WYM / Q |
|---|---|---|
| art. 4 pkt 1, 5, 7–12; motywy 14, 26, 30 | dane JDG są osobowe, dane osób prawnych nie; pseudonimizacja ≠ anonimizacja (audyt po usunięciu konta, telemetria); IP i identyfikatory internetowe jako dane osobowe; role per operacja | WYM-01, -02, -36, -38; Q-03, Q-11, Q-23, Q-30 |
| art. 5 ust. 1 lit. a–f, ust. 2; motyw 39 | każda zasada jako osobne wymaganie; rozliczalność wymaga dokumentów z dowodem działania | WYM-04 – WYM-10, WYM-74 |
| art. 6 ust. 1 lit. a, b, c, f; ust. 4; motywy 47, 49 | mapa cel → podstawa; lit. b wąsko; lit. f z testem trzech kroków; bezpieczeństwo sieci jako uzasadniony interes | WYM-11, WYM-12; Q-02, Q-06, Q-07, Q-13, Q-23 |
| art. 7; motywy 32, 42–43 | dowód zgody, wycofanie tak łatwe jak udzielenie, brak pól domyślnie zaznaczonych | WYM-13 – WYM-15; Q-07, Q-15 |
| art. 8, 9, 10 | „nie dotyczy” jako cel; ryzyko przypadkowych danych o zdrowiu w dokumentach | WYM-16; Q-32 |
| art. 11, art. 12 ust. 1–6 | identyfikacja proporcjonalna; terminy 1 + 2 miesiące; bezpłatność | WYM-17, WYM-75; Q-15, Q-18 |
| art. 13, art. 14 (ust. 5 lit. c) | pełna informacja przy zbieraniu; zwolnienie klienta wobec nabywców | WYM-18 – WYM-20; Q-04, Q-09, Q-10 |
| art. 15 – 21 | zakres dostępu i kopii; sprostowanie; usunięcie z wyjątkami ust. 3 lit. b, e; ograniczenie; powiadamianie odbiorców; przenoszenie; sprzeciw (bezwzględny wobec marketingu) | WYM-21 – WYM-28; Q-06, Q-16, Q-17, Q-19, Q-21, Q-24 |
| art. 22 | brak decyzji wyłącznie zautomatyzowanych dziś; `payment.score` po włączeniu | WYM-29; Q-05 |
| art. 24, art. 25 ust. 1–2; motyw 78 | privacy by design i by default; domyślnie bez udostępniania nieokreślonej liczbie osób | WYM-30 – WYM-34; Q-28, Q-29 |
| art. 26, art. 27 | brak współadministrowania (wstępnie); art. 27 nie dotyczy, o ile siedziba operatora w UE (zależy od N-01) | WYM-39; Q-03 |
| art. 28 ust. 1–4, 9, 10; art. 29; motyw 81 | umowa powierzenia z każdym klientem; dalsi procesorzy za zgodą; zwrot lub usunięcie po umowie; procesor ustalający cele staje się administratorem | WYM-40 – WYM-47; Q-01, Q-19, Q-31, Q-34, Q-35 |
| art. 30 ust. 1, 2, 5 | oba rejestry; wyjątek ust. 5 nie ma zastosowania | WYM-48, WYM-49; Q-40 |
| art. 32; motyw 83 | środki adekwatne do ryzyka; regularne testowanie; przywracanie dostępności; osoby z upoważnienia | WYM-50, WYM-51; Q-37 |
| art. 33, art. 34 | 72 h wobec organu; procesor „bez zbędnej zwłoki”; rejestr wszystkich naruszeń | WYM-52 – WYM-54; Q-36, Q-37 |
| art. 35, art. 36 | screening DPIA; DPIA funkcji AI; pakiet dla klientów | WYM-55, WYM-56; Q-38 |
| art. 37 – 39 | brak obowiązku IOD (do udokumentowania) | WYM-57; Q-39 |
| art. 42 | SOC 2 nie jest certyfikacją RODO | Q-43 |
| art. 44 – 49 | mapa transferów, w tym zdalny dostęp; DPF; SCC i TIA; art. 49 nie dla transferów stałych | WYM-58 – WYM-61; Q-33 |
| art. 82, art. 83 | kontekst ryzyka w macierzy | — |
| art. 87 | krajowy numer identyfikacyjny (PESEL) | WYM-X-03; Q-28 |

**B. Dyrektywa ePrivacy, Prawo komunikacji elektronicznej, UŚUDE**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-02 dyr. 2002/58/WE, art. 5 ust. 3, art. 13 ust. 1–2 | brzmienie wyjątku „ściśle niezbędne”; soft opt-in | klasyfikacja technologii; e-maile promocyjne do użytkowników | WYM-63, WYM-66; Q-04, Q-07, Q-13, Q-14 |
| ZR-11 PKE (Dz.U. 2024 poz. 1221 — do potwierdzenia), art. 398, 399, 400 | oznaczenie publikatora, data wejścia w życie (wg modelu 10.11.2024), zgoda ustawieniami przeglądarki, organ (Prezes UKE) i sankcje, numer przepisu o marketingu bezpośrednim | wymóg zgody na technologie niebędące niezbędnymi; wymóg uprzedniej zgody na marketing e-mail | WYM-63 – WYM-66; Q-04, Q-07, Q-12, Q-13 |
| Prawo telekomunikacyjne art. 173–174 (poprzednik art. 399–400 PKE wg `03` ZR-11) | tylko jeśli prawnik ocenia stan sprzed wejścia PKE | ocena historyczna (np. fonty Google) | Q-14 |
| ZR-12 UŚUDE, art. 8, art. 10 | tekst jednolity; status art. 10 po PKE (wg R2: uchylony — średnia pewność) | obowiązek regulaminu; podstawa wymogu zgody na marketing | WYM-66, WYM-X-01; Q-07, Q-08, Q-41 |
| ZR-07 wniosek rozporządzenia ePrivacy (COM(2017) 10) | wycofanie przez KE | brak mocy — nie stosować | — |

**C. VAT, Ordynacja podatkowa, rachunkowość, prawo cywilne**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-13 ustawa o VAT | tekst jednolity; art. 112; ustępy art. 112a (przechowywanie poza krajem); artykuł o przechowywaniu faktur w KSeF przez 10 lat (wg R2 art. 112ba); harmonogram obowiązkowego KSeF; przepisy o fakturach korygujących i o identyfikatorze nabywcy | obowiązek przechowywania ciąży na podatniku; 10 lat dotyczy KSeF (MF), nie kopii FaktFlow; sprostowanie przez korektę; PESEL na fakturze B2C | WYM-68, WYM-69; Q-17, Q-20, Q-21, Q-22, Q-28 |
| ZR-14 Ordynacja podatkowa, art. 70 § 1 i dalsze, art. 70a, art. 86 § 1 | zakres zawieszenia i przerwania biegu | polityka podaje „10 lat (art. 70 § 1)” — wg modelu przepis daje 5 lat od końca roku płatności podatku | WYM-68, WYM-70; Q-20, Q-27 |
| ZR-15 ustawa o rachunkowości, art. 74 ust. 1–2 | punkty art. 74 ust. 2, ustęp o biegu okresu | okresy dla klientów z księgami rachunkowymi i dla FaktFlow jako podatnika | WYM-68, WYM-70; Q-20, Q-27 |
| ZR-16 rozporządzenie MF w sprawie KPiR (Dz.U. 2019 poz. 2544 — do potwierdzenia) | oznaczenie i aktualność | moduł KPiR — obowiązek klienta | WYM-68; Q-20 |
| ZR-17 Kodeks cywilny, art. 117–118 | — | okres obrony roszczeń FaktFlow jako administratora | WYM-70; Q-24, Q-27, Q-41 |

**D. Wytyczne EROD/EDPB i dokumenty WP29**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-30 Guidelines 4/2019 (art. 25), v2.0 | URL, wersja | lista kontrolna privacy by design i domyślności | WYM-31 – WYM-34; Q-29 |
| ZR-31 Guidelines 05/2020 (zgoda), v1.1 | — | baner, newsletter, wycofanie | WYM-13 – WYM-15, WYM-65; Q-12, Q-15 |
| ZR-32 Guidelines 07/2020 (administrator i procesor), v2.0 | — | role per operacja, treść umowy powierzenia, współadministrowanie | WYM-01, WYM-39, WYM-41 – WYM-46; Q-01 – Q-03 |
| ZR-33 Guidelines 01/2022 (prawo dostępu), v2.0 | — | zakres kopii, identyfikacja, osoby bez konta | WYM-17, WYM-21, WYM-22; Q-16, Q-18 |
| ZR-34 Guidelines 2/2023 (zakres art. 5 ust. 3) | **wersja ostateczna** (wg modelu v2.0 z 7.10.2024) | `localStorage`, skrypty, piksele śledzące jako „dostęp” | WYM-63; Q-04, Q-13 |
| ZR-35 Guidelines 03/2022 (wzorce zwodnicze) | zakres — platformy społecznościowe, dla FaktFlow analogia | interfejs zgody i usuwania konta | WYM-65 |
| ZR-36 Guidelines 9/2022 (zgłaszanie naruszeń), v2.0 | — | „stwierdzenie”, 72 h, rola procesora | WYM-52 – WYM-54; Q-36, Q-37 |
| ZR-37 Guidelines 01/2021 (przykłady naruszeń), v2.0 | data przyjęcia | scenariusze ćwiczeń | WYM-52; Q-37 |
| ZR-38 Recommendations 01/2020 (środki uzupełniające), v2.0 | — | kroki TIA | WYM-60; Q-33 |
| ZR-39 Guidelines 05/2021 (art. 3 a rozdz. V) | — | zdalny dostęp jako transfer | WYM-58; N-15 |
| ZR-40 raport Cookie Banner Taskforce | data przyjęcia | opcja odrzucenia na pierwszej warstwie, klasyfikacja „niezbędnych” | WYM-65 |
| ZR-41 Opinion 22/2024 (procesorzy i dalsi procesorzy) | data | wiedza o całym łańcuchu procesorów | WYM-40, WYM-43; Q-31 |
| ZR-42 Guidelines 1/2024 (art. 6 ust. 1 lit. f) | **status: konsultacyjny** — czy przyjęto wersję ostateczną | test trzech kroków w LIA (`09` § 4) — samodzielnym źródłem jest ZR-63 | WYM-12; Q-02, Q-06 |
| ZR-43 Guidelines 01/2025 (pseudonimizacja) | **status: konsultacyjny** | ocena pseudonimizacji audytu i telemetrii | WYM-38; Q-23, Q-30 |
| ZR-44 raport CEF 2024 (prawo dostępu) | data | lista kontrolna procedury dostępu | WYM-21, WYM-22 |
| ZR-45 CEF 2025 (prawo do usunięcia) | **czy raport przyjęto** | usuwanie a kopie zapasowe | WYM-24, WYM-72; Q-25 |
| ZR-46 WP248 rev.01 (DPIA) | — | ≥ 2 kryteria → DPIA (dane finansowe, innowacyjne technologie, łączenie zbiorów) | WYM-55; Q-05, Q-38 |
| ZR-47 WP260 rev.01 (przejrzystość) | — | podejście warstwowe, informowanie o zmianach | WYM-17 – WYM-20; Q-08, Q-09 |
| ZR-48 WP243 rev.01 (IOD) | daty | „główna działalność”, „duża skala” | WYM-57; Q-39 |
| ZR-49 WP242 rev.01 (przenoszenie) | daty | zakres danych „dostarczonych” | WYM-27 |
| ZR-50 WP251 rev.01 (decyzje zautomatyzowane) | daty | `payment.score` | WYM-29; Q-05 |
| ZR-51 Guidelines 2/2019 (lit. b) | — | wąskie rozumienie niezbędności do umowy | WYM-11 |
| ZR-52 Guidelines 2/2018 (art. 49) | — | brak wyjątków dla transferów stałych | WYM-61 |
| ZR-53 WP194 (wyjątki od zgody na cookies) | status wobec EDPB | sesja, bezpieczeństwo, zapis zgody jako zwolnione | WYM-63; Q-13 |
| ZR-54 WP216 (anonimizacja) | czy są nowsze wytyczne | pseudonimizacja ≠ anonimizacja | WYM-38; Q-23 |
| ZR-55 stanowisko WP29 o art. 30 ust. 5 | data i status | wyjątek nie obejmuje przetwarzania niesporadycznego | WYM-48, WYM-49; Q-40 |
| ZR-56 Opinion 28/2024 (modele AI) | — | tło, FaktFlow nie trenuje modeli | WYM-62; Q-10 |
| ZR-57 raport CEF 2023 (IOD) | data | tło oceny IOD | WYM-57; Q-39 |

**E. UODO i ustawa o ochronie danych osobowych**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-10 ustawa z 10.05.2018 o ochronie danych osobowych | numery: art. 10 ust. 1 (zawiadomienie o IOD, 14 dni), art. 34 ust. 1 (organ), art. 107 (przepis karny) — wg R2 | procedura przy ewentualnym wyznaczeniu IOD | WYM-57; Q-39 |
| ZR-20 komunikat Prezesa UODO z 17.06.2019 — wykaz operacji wymagających DPIA (M.P. 2019 poz. 666 — do potwierdzenia) | brzmienie punktów (wg modelu m.in. ocena lub scoring sytuacji ekonomicznej, innowacyjne technologie) | screening DPIA (`09` § 3, kolumna „Typy UODO”) | WYM-55; Q-38 |
| ZR-21 decyzje Prezesa UODO: ClickQuickNow (2019), Morele.net (2019), Virgin Mobile Polska (2020) | sygnatury, daty, prawomocność | utrudnianie wycofania zgody; środki z art. 32; regularne testowanie | WYM-14, WYM-51, WYM-66; Q-07 |
| decyzje wskazane przez R2 (`03` N-ZR-12): Bisnode Polska (2019, art. 14 przy danych z rejestrów publicznych), Fortum Marketing and Sales Polska (2022, weryfikacja procesora, art. 25, 28, 32) | istnienie, tezy, prawomocność — **nie cytować bez odczytu** | obowiązek informacyjny wobec JDG z rejestrów; nadzór nad procesorami | WYM-20, WYM-07, WYM-40, WYM-31 |
| poradniki UODO, formularz zgłaszania naruszeń | tytuły i wersje (model ich nie zna pewnie) | procedura naruszeń | WYM-52 |

**F. Orzecznictwo TSUE, Sądu UE i sądów krajowych**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-60 C-311/18 Schrems II (16.07.2020) | — | TIA przy SCC | WYM-60; Q-33 |
| ZR-61 T-553/23 Latombe (wg modelu 3.09.2025, skarga oddalona) | data, wynik, odwołanie do TSUE i jego stan | stabilność DPF | WYM-59; Q-33; N-39 |
| ZR-62 C-673/17 Planet49 | — | zgoda bez pól zaznaczonych domyślnie; art. 5 ust. 3 niezależnie od danych osobowych | WYM-15, WYM-63; Q-13 |
| ZR-63 C-252/21 Meta v Bundeskartellamt | — | lit. b wąsko; trzy przesłanki lit. f | WYM-11, WYM-12; Q-06 |
| ZR-64 C-487/21 F.F. | — | „kopia” = wierna, zrozumiała reprodukcja | WYM-22; Q-16 |
| ZR-65 C-154/21 Österreichische Post | data i teza | konkretni odbiorcy na żądanie | WYM-21, WYM-26; Q-16 |
| ZR-66 C-307/22 FT | data i teza | pierwsza kopia bezpłatna niezależnie od celu | WYM-22, WYM-75 |
| ZR-67 C-579/21 Pankki S | data i teza | informacje z logów o konsultacjach danych | WYM-21, WYM-35; Q-16 |
| ZR-68 C-40/17 Fashion ID | data i teza | współadministrowanie przy osadzaniu zasobów stron trzecich | WYM-39, WYM-63; Q-03, Q-14 |
| ZR-69 C-582/14 Breyer | data i teza | dynamiczne IP jako dana osobowa | WYM-36, WYM-63; Q-14, Q-30 |
| ZR-69a C-413/23 P EIOD przeciwko SRB (wg R2 4.09.2025, pewność średnia) | data i tezy | względność danych spseudonimizowanych z perspektywy odbiorcy | WYM-38, WYM-18; Q-30 |
| LG München I, 20.01.2022, 3 O 17493/20 (sąd niemiecki) | sygnatura, teza — **materiał pomocniczy, nie P ani O** | fonty Google bez zgody | Q-14 |

**G. Transfery**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-03 decyzja wykonawcza KE 2023/1795 (DPF) | — | transfer do certyfikowanych odbiorców w USA na art. 45 | WYM-59; Q-33 |
| ZR-04 decyzja wykonawcza KE 2021/914 (SCC), moduły 1–4, klauzule 14–15 | — | moduł 2 (FF-A → procesor), moduł 3 (FF-P → dalszy procesor); ocena prawa państwa trzeciego | WYM-60; Q-33 |
| ZR-05 decyzja wykonawcza KE 2021/915 (klauzule z art. 28 ust. 7) | — | możliwa baza umowy powierzenia | WYM-41; Q-31 |
| ZR-82 lista Data Privacy Framework (Departament Handlu USA) | **certyfikacja każdego dostawcy z USA** (domena nieosiągalna w sesji) | uproszczona ocena transferu przy DPF | WYM-59; N-07 |
| ZR-38, ZR-39, ZR-52, ZR-60, ZR-61 | jak w D i F | — | — |

**H. AI Act i Data Act**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-06 rozporządzenie 2024/1689 (AI Act): art. 3, art. 4 (od 2.02.2025), art. 50 ust. 1 (od 2.08.2026) | czy pakiet „Digital Omnibus” zmienił terminy lub zakres art. 50; kwalifikacja FaktFlow (dostawca / podmiot stosujący) | informacja „rozmawiasz z systemem AI” w czacie; ocena `payment.score` | WYM-62; Q-05, Q-10; N-39 |
| ZR-08 rozporządzenie 2023/2854 (Data Act), rozdz. VI (od 12.09.2025) | zastosowanie do FaktFlow i ewentualne wyłączenia | obowiązki przy zmianie dostawcy (umowa, eksport, opłaty) | WYM-27, WYM-45; Q-44 |

**I. AICPA (SOC 2)**

| Źródło | Do potwierdzenia | Tezy zależne | WYM / Q |
|---|---|---|---|
| ZR-70 TSC 2017 z rewizją punktów 2022 | **61 identyfikatorów i tytułów** w `03` § 2.6a (parafrazy), liczba kryteriów (33 CC + 3 A + 2 C + 5 PI + 18 P) | całe mapowanie `06` | WYM-SOC-1 – WYM-SOC-5; N-40 |
| ZR-71 DC 200 (2018, z wytycznymi 2022) | — | opis systemu, CUEC, CSOC | WYM-SOC-6 |
| ZR-72 przewodnik AICPA SOC 2 | aktualna edycja | Type 1 / Type 2, carve-out / inclusive | WYM-SOC-6, WYM-SOC-7; Q-42 |
| ZR-73 AT-C 105, AT-C 205 | tytuł AT-C 205 po SSAE 21 | raport może wydać tylko niezależny CPA | WYM-SOC-7; Q-42 |
| ZR-74 definicje Type 1 i Type 2 | długość okresu (praktyka rynkowa) | gotowość ≠ raport; brak „certyfikacji SOC 2” | WYM-SOC-7 |

**J. Poza rejestrem ZR (wskazane w raportach, do zidentyfikowania przez prawnika)**

| Obszar | Gdzie wskazany | Q / N |
|---|---|---|
| przepisy o zwalczaniu nieuczciwej konkurencji i przeciwdziałaniu nieuczciwym praktykom rynkowym (deklaracje bez pokrycia, komunikacja o SOC 2) | `A1` QA1-11, `06` § 11 pkt 2 | Q-09, Q-42 |
| ewentualna ochrona przedsiębiorców będących osobami fizycznymi w umowach (regulamin) | propozycja 08 | Q-08 |
| przepisy wykonawcze o strukturze faktury ustrukturyzowanej (schemat FA(3), identyfikator nabywcy) | `02` INW-05, `A1` MIN-01 | Q-28 |
| krajowe wdrożenie NIS2, przepisy KSeF o uprawnieniach i tokenach | `03` N-ZR-13 | N-41 |

**[R5b]** ZR-83 (Advisera) i ZR-84 (Schneider Downs) — materiały pomocnicze
bez mocy, niepobierane; nie są podstawą żadnej tezy (`03` tabela ZR) —
dlatego poza listą.

**K. Dokumenty dostawców — odczytane online 10.10.2026, ale nie są umowami FaktFlow** (`04` § 8.2)

| ID | Dokument | Teza audytu z niego wynikająca | Do oceny |
|---|---|---|---|
| ZR-80 / DOK-1 | Anthropic Commercial Terms („Effective June 17, 2025”) | brak trenowania na treściach klienta; DPA włączone przez odesłanie; podmiot w EOG — Anthropic Ireland | czy FaktFlow te warunki zaakceptował i kiedy (N-07) |
| DOK-2 | Anthropic Privacy Policy („Effective September 10, 2026”) | nie obejmuje treści klientów biznesowych | — |
| DOK-3 | Anthropic Data Processing Addendum („Effective February 24, 2025”) | SCC moduł 2/3; sprzeciw wobec dalszego procesora w 15 dni; usunięcie w 30 dni po umowie; przechowywanie przez czas umowy; „Special categories: None” | Q-31, Q-32; teza polityki „nie są przechowywane” do sprostowania |
| DOK-4 | dokumentacja SDK Anthropic dołączona do narzędzia sesji (odczyt lokalny, **nie online i nie umowa**) | `inference_geo` dla Messages API: przykład `us`; region `eu` udokumentowany dla Vertex AI | N-10 |
| DOK-5, DOK-5a | dokumentacja Sentry (repo GitHub) | region EU obejmuje zdarzenia; dane ze zgłoszeń wsparcia w US; SDK domyślnie wysyła IP (dla wersji z `dataCollection`) | Q-03, Q-09 |
| DOK-6, DOK-7 | dokumentacja i podgląd DPA PostHog (repo GitHub) | DPA dla każdego planu; IP wyłączone domyślnie dla nowych projektów EU; przetwarzanie także w US; Cloudflare globalnie | Q-09, Q-33 |
| DOK-8 | dokumentacja Cloudflare Turnstile (repo GitHub) | „on behalf of the website operator” | Q-03, Q-13 |
| DOK-9 | Anthropic Consumer Terms („Effective October 8, 2025”) | możliwe trenowanie na planach konsumenckich bez wyłączenia | Q-34 |
| DOK-10 – DOK-12 | compose Supabase, Coolify, README MinIO | brak telemetrii w compose Supabase; `do_not_track` w Coolify; MinIO community bez wsparcia | `04` PRC-13 (bez pytania prawnego) |
| ZR-81 **[R5b]** | dokumentacja i umowy Hetznera, Sentry, PostHog, Resend, Stripe, Google, Cloudflare, GitHub (nieodczytane poza DOK-5 – DOK-12) | podstawa list odbiorców i TIA | N-07 |

### 4.3. Projekty robocze z `09` do oceny

`09` jest w całości **projektem roboczym**, nie dokumentem przyjętym;
**[R5b]** przeszedł recenzję R5b („wymaga poprawek”, bez uwag
blokujących), uwagi naniesione 13.10.2026.

| § `09` | Projekt | Co prawnik ma ocenić | Decyzje lub fakty potrzebne wcześniej | Q / N |
|---|---|---|---|---|
| § 1 | rejestr czynności FaktFlow jako administratora (RA-01 – RA-16) | proponowane podstawy (kolumna „do review”), odbiorcy, transfery, terminy usunięcia | podmiot (N-01), umowy (N-07), decyzje retencyjne | Q-02, Q-06, Q-10, Q-23 – Q-27, Q-40 |
| § 2 | rejestr kategorii czynności FaktFlow jako procesora (RP-01 – RP-12) | kategorie czynności, polecenia automatyczne | podmiot (N-01), lista klientów | Q-01, Q-40 |
| § 3 | screening DPIA (9 operacji, DS-NN), szkielet DPIA funkcji AI (§ 3.3), pakiet dla DPIA klientów (§ 3.4) | kryteria WP248 i punkty wykazu UODO; czy DPIA funkcji AI jest wymagana czy dobrowolna | skala (N-04), brzmienie wykazu (N-38) | Q-05, Q-38 |
| § 4 | LIA L-01 – L-06 (4 pozytywne pod warunkami, 1 negatywna w obecnym kształcie — analityka serwerowa, 1 mieszana — Sentry) i 5 celów bez LIA | każdy krok testu; czy warunki wystarczą; relacja do zgody z PKE | wybór wariantu analityki (właściciel) | Q-02, Q-06, Q-07, Q-13, Q-23 |
| § 5 | lista kontrolna TIA (10 dostawców) | kroki oceny, mechanizmy, czy przy DPF wystarczy weryfikacja | umowy i panele (N-07, N-10) | Q-33, Q-34 |
| § 6 | szkielet umowy powierzenia (14 elementów; element 14 — postanowienia handlowe — poza zakresem audytu) | treść każdego elementu; polecenia dla funkcji automatycznych; terminy (naruszenia, sprzeciw, przekazanie żądań); koniec umowy | podmiot (N-01), dyżur (N-06), umowy z dostawcami (N-07) | Q-01, Q-18, Q-19, Q-31, Q-32, Q-36 |
| § 7 | lista dalszych procesorów (8 pozycji, w tym 4 zależne od decyzji) i lista podmiotów niebędących dalszymi procesorami (§ 7.2) | kwalifikację każdej pozycji | umowy (N-07), agenci AI (N-14), skrzynka pomocy (N-12) | Q-03, Q-34 |
| § 8 | procedura żądań osób: kanały, przebieg, zakres wyszukiwania (21 magazynów), terminy, pola rejestru, ścieżka FF-P | podział FF-A / FF-P, identyfikację, terminy, zakres kopii | kanał e-mail (N-12) | Q-16, Q-18, Q-24 |
| § 9 | procedura naruszeń: źródła wykrycia, triage, tory FF-A i FF-P, pola rejestru | progi oceny ryzyka, termin zawiadomienia klienta | dyżur (N-06), podmiot (N-01) | Q-36, Q-37 |
| § 10 | harmonogram retencji — 32 pozycje (**[R5b]** dodana RT-KSEF — poświadczenia i sesje KSeF), wszystkie „do podjęcia” | okres, początek biegu i podstawa dla każdej pozycji | fakty N-16, N-18, N-20, N-24 | Q-19 – Q-27 |
| § 11 | wymagania treści polityki (20 pozycji W-NN, 1 spełniona), strony RODO (11 pozycji), informacji w punktach zbierania (9) | kompletność wobec art. 13–14; brzmienie | podmiot (N-01) i decyzje z §§ 1, 4, 10, 12 | Q-08, Q-09, Q-10 |
| § 12 | specyfikacja zgody na technologie w przeglądarce (13 wymagań z kryteriami akceptacji) i proponowana klasyfikacja technologii (§ 12.3) | klasyfikację „niezbędnych”, zachowanie przy braku zgody, dowód zgody | — | Q-12 – Q-15 |
| § 13 | nieprzygotowane: ocena obowiązku IOD, upoważnienia, zobowiązania do poufności i szkolenia, rejestr umów z dostawcami, pełna DPIA funkcji AI | czy są potrzebne i w jakiej formie | N-03 (czy istnieją poza repo) | Q-34, Q-38, Q-39 |

### 4.4. Proponowana kolejność review

Najpierw pytania P1 (22), bo od nich zależą dokumenty publiczne, umowa
z klientem i decyzje przed pierwszym klientem: Q-09, Q-19, Q-20, Q-21,
Q-37 (ryzyko obecne wysokie albo możliwe naruszenie); następnie Q-01,
Q-03, Q-04, Q-07, Q-08, Q-10, Q-12, Q-13, Q-18, Q-25, Q-28, Q-31, Q-34,
Q-35, Q-36, Q-38, Q-40. Potem P2 (17): Q-02, Q-06, Q-11, Q-14, Q-15,
Q-16, Q-22, Q-23, Q-24, Q-26, Q-27, Q-29, Q-30, Q-32, Q-33, Q-39, Q-41.
Na końcu P3 (5): Q-05, Q-17, Q-42, Q-43, Q-44. Równolegle — potwierdzenie
źródeł z § 4.2, zaczynając od grup B (PKE) i C (okresy przechowywania).

## 5. Czego niewiadome NIE blokują

Zasada z pkt 7 zadania: ujawnione niewiadome nie blokują zakończenia
audytu, tylko wnioski i działania od nich zależne. Poniższe zmiany można
zacząć od razu po prompcie wykonawczym — każda jest ochronna (zmniejsza
przetwarzanie albo naprawia mechanizm, który nie działa zgodnie z
deklaracją), a jej kierunek nie zależy od żadnej N ani Q. Od niewiadomych
zależy najwyżej wartość parametru albo brzmienie tekstu (kolumna „Co
czeka”). Kolejność i podział na etapy należą do `07`; kolumna „#” podaje odpowiadający etap `07` (stan jak w § 2.8).
**[R5b]** Lista obejmuje zmiany o największym wpływie, nie wszystkie;
`07` ma więcej etapów niezależnych od N i Q (np. E-11, E-15, E-19, E-24,
E-30, E-37, E-39) — pełny podział „od razu / czeka” — `07` § 2.

### 5.1. Zmiany niezależne od niewiadomych

| # · etap `07` | Zmiana (klasa) | Ustalenia | WYM | Dlaczego nie czeka | Co czeka (N / Q) |
|---|---|---|---|---|---|
| 1 · E-05 | Proxy `/ingest` i `/monitoring` bez nagłówków `cookie`, `authorization`, `x-forwarded-*` (I) | RUN-08 | WYM-36, WYM-09 | przekazanie ciasteczek sesji dostawcom nie jest potrzebne do żadnego celu (`09` L-06) | ocena okresu przeszłego — Q-37, N-17 |
| 2 · E-09 | PostHog w panelu: wyłączyć replay, console, network timings, heatmaps; włączyć odrzucanie IP; usunąć martwą opcję `ip: false` (I) | PRC-09, MIN-08 | WYM-34 | ustawienia panelu przeczą kodowi i deklaracjom | źródło 2 nagrań i ewentualna ocena — N-08, Q-37 |
| 3 · E-06 | Sentry w przeglądarce: wyłączyć sesje i ślady wydajności (albo objąć je zgodą); `telemetry: false` w `withSentryConfig` (I) | RUN-04, `A4` § 1 | WYM-63, WYM-36 | wariant ostrożny; błędy zostają | czy sesje mogą wrócić bez zgody — Q-13 |
| 4 · E-07 | Samohostowanie arkusza Material Symbols (I) | RUN-05, PRC-10 | WYM-63, WYM-58 | rekomendacja techniczna niezależna od odpowiedzi (`A4` pyt. 3) | ocena historyczna — Q-14 |
| 5 · E-18 | Wycofanie i zmiana decyzji o zgodzie w interfejsie (P) | RUN-03, ZGD-05 | WYM-14 | art. 7 ust. 3 wprost [NZ] | dowód zgody — Q-15 |
| 6 · E-08 | Service worker tylko w aplikacji, nie na stronach marketingowych (I) | RUN-06 | WYM-63 | wariant ostrożny | Q-13 |
| 7 · E-02 | Filtr `deleted_at` w jobach (skrzynka KSeF, AI) i komunikat UI usuwania organizacji zgodny z mechanizmem (P, I) | PRA-04, RET-04 | WYM-45 | dziś „usunięta” firma jest dalej przetwarzana; zmiana mała, bez migracji (`A2` kolejność 1) | zakres danych zatrzymywanych po usunięciu — Q-19 |
| 8 · E-03 | Ścieżka operatora usuwania konta → wspólna funkcja; rozwiązanie konfliktu wyzwalacza `audit_logs` z kluczem `ON DELETE SET NULL`; czerwony test na bazie (P, I) | PRA-03, RET-03 | WYM-24 | jedyna droga dla żądań e-mailowych nie działa (`A2` kolejność 2) | pilność potwierdza N-23 |
| 9 · E-04 | Wpis audytu o wykonaniu usunięcia konta; kompletność usunięcia (czat, listy e-mail, pliki, dostawcy) jako kierunek (P, S) | PRA-02, AI-03, RET-12, DOW-06 | WYM-24, WYM-73 | deklarowany skutek nie następuje | pełny zakres w bazie i u dostawców — w `07` E-20, E-21 czekają na decyzje retencyjne właściciela D-05 (a) oraz P-12, P-07 (Q-23, Q-27); okres rejestru żądań — Q-24; zakres `auth.*` — N-18 |
| 10 · E-10 | Blokada startu przy środowisku produkcyjnym z `KSEF_ENV≠production` albo widoczny tryb „tylko dane fikcyjne” (I) | PRC-17, SOC-25 | WYM-37, WYM-SOC-3 | zapobiega wysyłce prawdziwych danych do środowiska testowego | czy to już nastąpiło — N-02, Q-37 |
| 11 · E-29 | Faktura B2C domyślnie bez identyfikatora nabywcy (I) | MIN-01, INW-05 | WYM-X-03, WYM-32 | wariant ostrożny Q-28 | czy PESEL w ogóle dopuszczalny — Q-28 |
| 12 · E-16, E-35 | Bez danych osobowych i identyfikatorów organizacji w Telegramie i Slacku; HMAC w kluczach limitów (I) | PRC-12, `09` L-02 | WYM-38, WYM-X-02 | wariant ostrożny Q-30 | Q-30 |
| 13 · E-14 | `Reply-To` e-maila z fakturą na adres klienta (I) | INW-07 | WYM-67 | dziś korespondencja kontrahentów trafia do FaktFlow bez polecenia klienta | wiadomości już otrzymane — Q-04 |
| 14 · E-01 | Usunięcie ze stron publicznych zdań niezgodnych z faktami (lokalizacja „Frankfurt”, Vercel, R2, Inngest, „Backup: AWS Glacier”, „AES-256”, „SCC z każdym”, „72 h”, „kto i kiedy uzyskał dostęp”) (P) | ZGD-03, ZGD-12, PRC-01 – PRC-03, RUN-11 | WYM-19 | to korekta faktów, nie interpretacja | nowe brzmienie dokumentów — N-01, Q-09 |
| 15 · E-36 | Rejestrowanie odczytów operatora i identyfikacja operatora w akcjach (S, P) | DOW-08, SOC-11 | WYM-35 | kontrola bez wariantów prawnych | — |
| 16 · E-69 | Przegląd dostępów, MFA na kontach dostawców, rozdzielenie wspólnego konta (S) | DOW-05, SOC-07 – SOC-09 | WYM-47, WYM-SOC-1 | sam przegląd rozstrzyga N-26 | — |
| 17 · E-53 | Kopie poza hostem z szyfrowaniem (decyzja z 07.10 [PR225]), szyfrowanie lokalnych zrzutów, próba odtworzenia, procedura ponownego stosowania usunięć po odtworzeniu (P, S) | SOC-21, SOC-22, INW-04, RET-09, DOW-22 | WYM-51, WYM-72 | dostępność i integralność wymagane niezależnie od okresu | długość rotacji — Q-25 |
| 18 · E-40 | Rejestr retencji w kodzie z **parametryzowanymi** okresami (jedno miejsce dla wartości z decyzji) (I) | RET-01, RET-02, RET-05, RET-11 | WYM-68, WYM-71, WYM-73 | wartości można wpisać później; kierunek naprawy wykonawców (bieg od daty dokumentu, kolejność plik/wiersz, ścieżka dla faktur wysłanych do KSeF) też nie zależy od odpowiedzi | wartości okresów i zakres — Q-19 – Q-21, N-24; w `07` same wykonawcy usuwania (E-50, E-51) czekają na te pytania i na odczyty D-06 |
| 19 · E-22 | Rejestr żądań osób i skrypt wyszukiwania we wszystkich magazynach (`09` § 8.3) (P) | PRA-09, PRA-11, DOW-04 | WYM-17, WYM-21, WYM-75 | potrzebny przy każdej interpretacji | terminy przekazania klientowi — Q-18 |
| 20 · E-12 | Informacja „odpowiada system AI” w czacie i informacja przy OCR i kategoryzacji; przełącznik AI per organizacja (mechanizm) (P, I) | ZGD-08, AI-01, AI-05, PRC-06 | WYM-62 | niski koszt; wariant ostrożny Q-10 | domyślny stan przełącznika — Q-01; w `07` przełącznik to E-17, który czeka na decyzję produktową D-12 (a) |
| 21 · E-33, E-31 | `validation_cache` tylko przez serwer, usunięcie `raw_response`; wyszukanie NIP bez nazw organizacji (I) | INW-16, `09` L-04, MIN-03 | WYM-33 | warunki LIA niezależne od roli | rola — Q-02 |
| 22 · E-43 | Krótszy domyślny czas ważności linku dla księgowej (I) | MIN-06, INW-19 | WYM-33 | wariant ostrożny Q-29 | Q-29; w `07` E-43 czeka na decyzję produktową D-12 (f) — to decyzja, nie niewiadoma |
| 23 · E-58 | Zapis akceptacji regulaminu z wersją (mechanizm) (P, S) | ZGD-04 | WYM-X-01 | mechanizm potrzebny przy każdym brzmieniu | brzmienie — Q-08, N-01 |
| 24 · E-13 | E-mail 8. dnia: oddzielenie treści handlowej od porad, link wypisu w treści, brak sekretu wypisu = brak wysyłki (P) | ZGD-06, `09` L-05 | WYM-66, WYM-14 | warunki LIA L-05; wariant ostrożny Q-07 | czy treść handlowa wymaga zgody — Q-07 |
| 25 · E-38 | Zastąpienie NIP-ów testowych z poprawną sumą kontrolną fikcyjnymi (I) | MIN-09 | WYM-37, WYM-X-02 | konwencja `AGENTS.md` | N-28 |
| 26 · E-70 | Testy: RLS dla 14 tabel z danymi osobowymi, test RLS na bazie jako kontrola wymagana, automatyczny test zgody na uprzęży `A4` (S, I) | DOW-12, DOW-14, DOW-15 | WYM-09, WYM-SOC-1 | dowód działania kontroli | N-34 |

### 5.2. Co pozostaje zablokowane do rozstrzygnięcia

| Działanie | Blokujące N | Blokujące Q |
|---|---|---|
| ostateczna treść polityki prywatności, regulaminu i strony RODO (`07` E-62, E-63) | N-01, N-07, N-37 | Q-08, Q-09, Q-10, Q-20, Q-26 |
| umowa powierzenia dla klientów i publikacja listy dalszych procesorów (E-62) | N-01, N-06, N-07, N-14 | Q-01, Q-03, Q-18, Q-19, Q-31, Q-32, Q-34, Q-36 |
| wartości okresów retencji i zakres danych zatrzymywanych po usunięciu (E-20, E-44 – E-47, E-50 – E-52) | N-24 | Q-19 – Q-27 |
| rejestry z art. 30 w wersji końcowej (E-59) | N-01, N-03, N-07 | Q-40 |
| TIA i deklaracje o transferach (E-61) | N-07, N-10, N-15 | Q-33, Q-34 |
| decyzja o zgłoszeniu naruszenia (organ, osoby) (E-67) | N-02, N-08, N-17 | Q-37 |
| włączenie FLO z modelem i `payment.score` (brak etapu w `07` § 2) | N-31 | Q-05, Q-38 |
| marketing na uzasadnionym interesie i wariant analityki serwerowej (E-27, E-65) | — | Q-06, Q-07, Q-12 |
| formalne badanie SOC 2 (E-79) | N-01, N-05, N-40 | Q-41 – Q-43 |

## 6. Ograniczenia dowodowe audytu

| # | Ograniczenie | Skutek dla wniosków | Gdzie opisane | Jak usunąć |
|---|---|---|---|---|
| 1 | **Brak dostępu do produkcji** (SSH, Coolify, baza, oba MinIO, Redis, logi, kopie) — sesja w chmurze bez `.agents/infra.env` i klucza SSH | stany wymagań opisują projekt w kodzie, nie działanie; skutki wyzwalaczy potwierdzone tylko na schemacie syntetycznym | `01` § 5; wszystkie raporty | N-16 – N-25 (operator, skrypty w `scripts/ops/`) |
| 2 | **Fakty o produkcji tylko z niescalonego PR #225** — pomiar lub deklaracja operatora (04.10, 06–07.10, odczyt SSH i paneli 10.10 @`a72b567`); gałąź przesuwała się (`65c3978` → `686a465` → `a72b567` → `c2ab6a8`) | poziom dowodu „deklaracja operatora”; ryzyko „obecne” w `05` zależy od deklaracji braku klientów (N-02) | `01` § 4; `BRIEF.md` ADDENDUM 1–3; R1-N01; `03` N-ZR-14 | N-02, pomiar przez osobę niezależną od autora deklaracji |
| 3 | **Produkcja działa na nowszym kodzie** niż audytowany (`43091e7` wg [PR225 @a72b567]; `main` 10.10 = `face09c` z przebudową importu) | odwołania `ścieżka:linia`, zwłaszcza w `lib/import/*`, mogą nie pasować do produkcji | `01` § 2; `05` § 13; R1-N04 | ponowny odczyt kodu na wersji produkcyjnej w etapie wykonawczym |
| 4 | **Brak dostępu do paneli dostawców** (Sentry, PostHog, Stripe, Resend, Anthropic, Hetzner, Google, Cloudflare, Slack, Telegram) | nieznane retencje, regiony dodatkowych funkcji, ustawienia IP i śledzenia; odczyty paneli tylko z [PR225] | `01` § 5; `04` § 6, § 8.4 | N-08 – N-12 |
| 5 | **Brak umów** (DPA, SCC, akceptacje warunków); odczytane tylko publiczne dokumenty dostawców (DOK-1 – DOK-12), które nie są umowami FaktFlow | stan WYM-40, -43, -59 – -61 „brak” albo „niezweryfikowane”; treści umów nie zgadujemy | `04` § 8.2–8.4 | N-07 |
| 6 | **Egress filtrowany polityką organizacji (403)**: EUR-Lex, EDPB, UODO, ISAP, API Sejmu, ELI, UKE, gov.pl, KE, AICPA, strony dostawców, lista DPF; bez prób obejścia i bez kopii lustrzanych | żadnego źródła prawa nie odczytano; dokumentacja dostawców tylko przez publiczne repozytoria GitHub i `anthropic.com/legal/*` | `03` § 1.1; `04` § 8.3 | odczyt w końcowym review (§ 4.2) |
| 7 | **Właściciel odrzucił WebSearch** (7.10, w trakcie sesji) | brak wyszukiwania nowszych wersji wytycznych, orzeczeń, dokumentów dostawców po 06.2026 | `00` „Zmiany zakresu”; `01` § 5 | końcowe review (N-37 – N-39) |
| 8 | **Przepisy z pamięci modelu (stan do 06.2026)** — wszystkie [NZ] poza ZR-80; część numerów i dat z oznaczeniem „do potwierdzenia”; część tez dodanych przez recenzentów z ich wiedzy (oznaczenia [R2], [R2-r2], NZ) | klasy P i O, kolumna „Źródło” w `05`, brzmienie w `09` wymagają potwierdzenia | `03` § 1.2; § 4.2 tego pliku | N-37 – N-40 |
| 9 | **Brak rozwiązywania DNS w środowisku** (nie obchodzono przez DNS-over-HTTPS) | tryb proxy Cloudflare i rekordy MX nieustalone | `04` § 8.3 | N-12 |
| 10 | **GitHub: lista współpracowników, ustawienia organizacji, MFA — 403; GraphQL — 403**; próba 40 PR z odczytu REST 11.10 | przegląd dostępów i niezależność zmian oceniane częściowo | `A3` § 10; `06` § 12 | N-26, N-36 |
| 11 | **Test przeglądarkowy (`A4`) na lokalnym buildzie** ze zmiennymi syntetycznymi: bez Supabase (strony za logowaniem niedostępne, `/register` zamknięta, Turnstile na rejestracji nieobserwowany), bez odwrotnego proxy i HTTPS, ruch do dostawców celowo przerwany (nie wiadomo, co dostawcy zapisują), jedna przeglądarka (Chromium headless), przybliżone przypisanie żądań `keepalive`, budowanie bez blokady egress (wynik próby telemetrii wtyczki Sentry nieznany — bez danych osobowych) | wyniki RUN opisują kod `3e5e00d` na stronach publicznych, nie produkcję | `A4` § 1, § 7, § 9; R3 § 8 | N-17, N-33 |
| 12 | **Testy:** 49 plików testów prywatności uruchomionych lokalnie (638/638) — dowód logiki, nie produkcji; testy RLS na bazie tylko ze statusu CI; e2e nigdy nieuruchomione; test mechanizmu wyzwalaczy na syntetycznym schemacie PostgreSQL 16 (R1, `A2`, R3), nie na pełnym zestawie migracji | „potwierdzone” dla mechanizmów bazy znaczy „potwierdzone dla definicji z migracji” | `A3` § 4; `A2` PRA-03; R1-N03 | N-23, N-34 |
| 13 | **Płytki klon repo** (historia części plików od 02.10); liczby historii z pełnego klonu bez plików | nie ustalono, czy kod w cyklu 17.09–17.10 miał włączone nagrania PostHog; historia polityki przed 02.10 nieznana | `A1` NA1-13; N-R2-05; `A3` § 3.3 | N-08, N-29 |
| 14 | **Dokumenty spoza repo niedostępne** (`docs/automation/`, `.agents/`, dysk właściciela) — zgodnie z briefem nieczytane | „nie znaleziono w repo” ≠ „nie istnieje” w całym obszarze G | `01` § 5; `A3` § 8 | N-03 |
| 15 | **Brak prawdziwych danych** — analiza na kodzie, schematach, konfiguracji i danych syntetycznych; skala nieznana | kryteria skali (WP248, IOD) nierozstrzygnięte | `01` § 5; `A3` § 6.1 | N-04, N-24 |
| 16 | **Rejestry publiczne zablokowane** (CEIDG, biała lista) | nie ustalono, czy NIP-y w testach należą do osób fizycznych | `A1` NA1-07 | N-28 |
| 17 | **Niezależność oceny ograniczona:** wszystkie etapy i recenzje wykonały agenty AI tego samego dostawcy modelu, który pisze większość kodu; prawnik nie uczestniczył (zgodnie z pkt 1 zadania); recenzje dotyczą konkretnych wersji plików (N-R2-04) | recenzje R1–R4 nie zastępują niezależnej oceny człowieka ani audytora | `06` § 10; `01` § 7 | końcowe review prawne; ewentualna ocena gotowości SOC 2 przez firmę audytorską |
| 18 | **Część dokumentacji repo nieaktualna** (`docs/architecture/system-overview.md` — Vercel, Inngest, R2, Supabase Cloud; pięć innych plików `docs/architecture/*` nieocenionych) | fakty przyjmowano tylko po potwierdzeniu w kodzie | `BRIEF.md`; R1-N05 | aktualizacja dokumentacji w etapie wykonawczym |
| 19 | **Pliki syntezy a recenzja R5:** **[R5b]** `05` i `07` przeszły R5a, `08` i `09` — R5b (uwagi naniesione 13.10.2026); `07` powstał w trakcie pisania tego pliku | **[R5b]** powiązania z etapami (§ 2.8, § 3.11, § 5) autor oparł na stanie `07` z ok. 12:49 UTC; R5b sprawdził je na końcowej wersji `07` (13.10) — zgodne; D-16 (dodane po R5a) dopisane w § 2.8 | § 7 | **[R5b]** przy zmianie numeracji etapów albo pozycji D-NN w `07` — ponowić powiązanie; `10-REVIEW.md` |

## 7. Niewiadome i ograniczenia tego pliku

- **Synteza, nie nowe badanie.** Fakty o kodzie i produkcji pochodzą
  z raportów po recenzjach R1–R4; samodzielnie sprawdziłem tylko pozycje
  z § 8. Błąd w raporcie źródłowym przenosi się tutaj.
- **Powiązanie z wymaganiami** (kolumna „Co blokuje”) powstało
  programowo z kolumny „Zależność” macierzy `05` i zostało uzupełnione
  ręcznie. **[R5b]** `05` przeszedł recenzję R5a; R5b ponowił
  odwzorowanie skryptem (0 braków, K16). Jeśli późniejsze zmiany `05`
  dotkną kolumny „Zależność”, trzeba ponowić odwzorowanie (skrypt: § 8).
- **Powiązanie z `07`.** **[R5b]** Autor oparł powiązania z etapami
  (§ 2.8, § 3.11, § 5.1) na § 0–3 `07` w stanie z ok. 12:49 UTC; kart
  etapów w § 4–7 `07` nie czytał. Powiązania sprawdzone przez R5b na
  końcowej wersji `07` (13.10) — zgodne. Propozycje z § 2.8 dla
  niewiadomych bez pozycji w E-00 (N-15, N-17, N-19 częściowo, N-21,
  N-22 częściowo, N-24 częściowo) redaktor poprawek R5b przeniósł do
  `07` E-00 (D-06, D-08); N-27 – N-36 nadal nie mają pozycji w E-00 —
  są rozstrzygalne przez zespół w etapach wykonawczych, nie przez
  właściciela. Jeśli `07` zmieni numerację albo warunki „czeka”, trzeba
  ponowić powiązanie.
- **Interpretacje oznaczone „propozycja 08”** sformułowałem w tym pliku
  na podstawie ustaleń raportów; nie mają źródła w żadnym raporcie i —
  jak wszystkie interpretacje tu — są założeniami do potwierdzenia.
  Wybierałem warianty ostrożne (mniej danych, mniej odbiorców, krótsze
  okresy), co nie znaczy, że są prawnie wymagane.
- **Priorytety** to ocena autora według skali z § 1, nie decyzje
  właściciela.
- **Deduplikacja** łączy pytania o tym samym przedmiocie; tam, gdzie
  pytanie źródłowe ma kilka wątków, rozdzieliłem je między kilka Q
  (indeks § 3.10). Nie usunąłem żadnego wątku — jeśli recenzent R5 znajdzie
  pytanie źródłowe bez odpowiednika, to błąd tego pliku. **[R5b]** R5b
  znalazł taki błąd: autor pominął rundę 1 recenzji R2 (`R2-runda1.md`
  § 6–7), w tym wątek współadministrowania z PostHog przy `/ingest`;
  redaktor poprawek dopisał go do Q-03 i uzupełnił indeksy § 2.7, § 3.10.
- Przepisy, wytyczne, orzeczenia i kryteria AICPA — [NZ] (§ 6 poz. 6–8).
- **[R5b]** Plik przeszedł niezależną recenzję R5b („zatwierdzony
  z uwagami”); uwagi naniesione przez redaktora poprawek 13.10.2026
  (zob. „Historia recenzji”). Autor nie zatwierdzał własnego etapu.
- **[R5b]** Uwagi R5b dotyczące zachowania SDK PostHog wobec ustawień
  projektu (N-08) opierają się na `A4` § 7 i opcjach w kodzie, bez
  uruchomienia SDK z prawdziwym projektem — to zawężenie hipotez, nie
  ustalenie; rozstrzyga odczyt metadanych 2 nagrań (N-08, operator).

## 8. Co sprawdziłem / czego nie

**Przeczytałem (13.10.2026):**

- `BRIEF.md` z ADDENDUM 1–3 i `00-ZADANIE.md` — w całości.
- `01` § 4–8 i „Historia recenzji”; `02` § 7–9, INW-07 i „Historia
  recenzji”; `03` § 1–2 (cały rejestr ZR, w tym § 2.1a i § 2.6a), lista
  WYM z § 3, § 5–6 i „Historia recenzji”; `04` PRC-09, PRC-17, § 4–8
  i „Historia recenzji”; `A1` MIN-03, MIN-06, „Niewiadome”, „Pytania”,
  „Co sprawdziłem” i „Historia recenzji”; `A2` „Najważniejsze ryzyka”,
  „Niewiadome”, „Pytania”, „Co sprawdziłem” i „Historia recenzji”; `A3`
  § 6, tabela DOW z § 7, § 8–10 i „Historia recenzji”; `A4` § 1, § 7–9
  i „Historia recenzji”; `06` § 8.6–12 i „Historia recenzji”; `05` § 1,
  § 10, § 12.2–12.3, § 13–14 oraz kolumna „Zależność” wszystkich wierszy
  WYM (odczyt programowy, 85 wierszy z oceną stanu); `09` § 0, § 4,
  § 13–14 oraz wyszukanie „do review” w całym pliku; `07` § 0–3
  (linie 1–300: zasady, fale, zależności, przegląd etapów E-00 – E-79,
  karta E-00 z D-01 – D-15) — stan z ok. 12:49 UTC.
- Recenzje (scratchpad): nagłówki wszystkich czterech plików; `R1.md`
  § 7–8, `R2.md` § 8–9, `R3.md` § 8, `R4.md` § 9–10.

**Sprawdziłem w repo (kod `3e5e00d`, 13.10.2026):**

| Sprawdzenie | Wynik |
|---|---|
| `git diff --quiet 3e5e00d HEAD -- ':(top)' ':(top,exclude)docs/audyt'` | 0 — kod gałęzi roboczej (`22a8ea5`) = `3e5e00d` |
| czy pytania R2 § 9 (testowy KSeF, nagrania PostHog, skróty i UUID, śledzenie otwarć) są w raportach jako pytania do review (`grep` tematów w `02`–`09`, `A1`–`A4`) | tematy są w ustaleniach (PRC-09, PRC-11, PRC-17, N-PRC-02, N-PRC-10), ale nie w `04` § 7 → dodane jako Q-04, Q-30, Q-37 |
| `git grep "GOTRUE_SMTP\|SMTP_HOST\|smtp.resend"` | tylko dokumentacja: `docs/migration/PRZEPROWADZKA-HETZNER.md:496`, `docs/runbooks/skrzynka-pomoc.md:75` (N-19) |
| `git grep R2_BACKUPS_BUCKET` i `lib/backup/r2-backup-client.ts:18-28` | bez zmiennej snapshot idzie do głównego bucketu z prefiksem `backups/` (N-16, N-INW-14 częściowo) |
| `git grep "ANTHROPIC_BASE_URL\|baseURL" -- lib` i `node_modules/@anthropic-ai/sdk/client.js:58,67` (`package.json`: 0.95.0) | brak w kodzie aplikacji; SDK czyta zmienną domyślnie (N-16) |
| wyszukanie źródeł spoza rejestru ZR w raportach (art. 87, LG München I, nieuczciwa konkurencja, NIS2, Omnibus, art. 112ba, Prawo telekomunikacyjne) | ujęte w § 4.2 (grupy A, B, C, F, H, J) |
| skrypt odwzorowania zależności `05` → N-NN (scratchpad `n08-map.py`, `n08-wym-zal.txt`) i kontrola liczności (41 N, 44 Q, bez duplikatów i luk w numeracji; priorytety policzone z tabel) | wyniki wpisane w § 2 i § 3 |

**Nie sprawdziłem / nie mogłem sprawdzić:**

- Produkcji, paneli i umów dostawców — brak dostępu; plików gałęzi PR #225
  nie czytałem (fakty z raportów i briefu).
- Źródeł prawa, wytycznych, orzeczeń i kryteriów AICPA — egress
  zablokowany; WebSearch nie był używany (decyzja właściciela).
- Raportów w całości poza sekcjami wymienionymi wyżej; poprawności
  każdego `ścieżka:linia` cytowanego z raportów (przyjęte po recenzjach
  R1–R4).
- Nie uruchamiałem aplikacji ani testów. Nie czytałem `docs/automation/`
  ani `.agents/`.

Poza tym plikiem nie zmieniałem niczego w repo (pliki pomocnicze tylko
w scratchpadzie sesji); nie commitowałem i nie pushowałem.

**[R5b] Sprawdzenia redaktora poprawek po recenzji R5b (13.10.2026)** —
każdą uwagę zweryfikowałem przed naniesieniem:

| Uwaga | Sprawdzenie | Wynik |
|---|---|---|
| R5b-U01 | `R2-runda1.md` § 6–7; `grep` „C-40/17”, „ZR-68”, „współadministr” w `02`–`09`, `A1`–`A4`; Q-03, Q-14, Q-16, Q-37, Q-44; `04` § 8.2 (DOK-6: „All PostHog Cloud customers can get a DPA, on any plan”) | potwierdzone: wątek PostHog przy `/ingest` tylko w kolumnie zastosowania `03` ZR-68, bez pytania; pozostałe pytania i niewiadome rundy 1 mają odpowiedniki |
| R5b-U02 | `git grep distinctId 3e5e00d` w `lib/stripe/webhook-handlers.ts`, `lib/jobs/runners/submit-invoice.ts`, `app/(auth)/{login,register}/actions.ts`; `lib/analytics/server.ts:31-32` (`$set`) | potwierdzone: Stripe `:104,143,250,333` i przyjęcie faktury `:1934` — `tenantId`; logowanie i rejestracja — UUID użytkownika |
| R5b-U03 | `lib/analytics/init-posthog-browser.ts:37,49` na `3e5e00d`; `git grep startSessionRecording` w `app/`, `lib/`, `components/` (0); `A4` § 7 | potwierdzone (zawężenie hipotez, SDK nieuruchamiany) |
| R5b-U04 | `A4` RUN-08 „Stan” | potwierdzone: „wejście potwierdzone w runtime, przekazanie dalej potwierdzone w kodzie, nieobserwowane na łączu” |
| R5b-U05 | `03` ZR-17 (art. 117 i 118); Q-24; `09` RT-DSAR | potwierdzone: różne artykuły w dwóch plikach |
| R5b-U06 | `03` ZR-81 – ZR-84 vs § 4.2 | potwierdzone: brak ZR-81; ZR-83, ZR-84 „brak mocy”, „niepobierane” |
| R5b-U07 | `BRIEF.md` ADDENDUM 2 (agent deweloperski); `07` D-09; `A4` § 7 i RUN-09 „Luka” (ramka Turnstile) | potwierdzone |
| R5b-U08 | `07` § 3 (E-00) w stanie z 13.10 ok. 13:27 UTC: D-01 – D-16 | potwierdzone; dodatkowo `07` po R5a ma D-16 (ocena RUN-08) — dopisane w § 2.8 przy N-17 |
| R5b-U09 | § 2.6 — wartości „zamknięte / częściowo / przeniesione / bez wpływu / ograniczenia” | potwierdzone |
| R5b-U10 | `07` § 4: E-11, E-15, E-19, E-24, E-30, E-37, E-39 w sekcji „od razu”, nieobecne w § 5.1 | potwierdzone |

## Historia recenzji

| Recenzent | Data | Werdykt | Uwagi | Przyjęte | Odrzucone | Plik recenzji |
|---|---|---|---|---|---|---|
| R5b — niezależny agent-recenzent (grupa: `08` + `09`) | 13.10.2026 | zatwierdzony z uwagami (42 kontrole punktowe dla `08` i `09`: 35 potwierdzonych, 6 częściowych, 1 obalona co do trybu; żaden wniosek główny nie upadł) | 10 uwag do tego pliku: R5b-U01 (istotna), R5b-U02 – U10 (drobne; U05 wspólna z `09`); plus konsekwencja R5b-U12 (§ 4.3 — liczba pozycji `09` § 10) | wszystkie 10 — R5b-U01, U02, U03, U04, U05, U06, U07, U08, U09, U10 oraz konsekwencja U12; naniesione przez redaktora poprawek 13.10.2026 (miejsca oznaczone **[R5b]**). Doprecyzowania redaktora: U01 — wątek PostHog był w `03` ZR-68 jako zastosowanie, ale bez pytania; liczniki pozycji źródłowych przeliczone (134 N, 103 Q) bez zmiany liczby N i Q; U08 pkt (2) — propozycje przeniesione bezpośrednio do `07` E-00 (D-06, D-08), a § 2.8 uzupełniony o D-16 z `07` | — | `recenzje/R5b.md` (streszczenie w `10-REVIEW.md`) |
