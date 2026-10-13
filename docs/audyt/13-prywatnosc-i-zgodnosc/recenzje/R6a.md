# R6a — Krytyka kompletności (pokrycie zadania) audytu 13

| | |
|---|---|
| Recenzent | R6a — niezależny krytyk kompletności; nie jest autorem ani wcześniejszym recenzentem żadnego pliku |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza @ `ef24881`; `git diff --stat 3e5e00d HEAD -- . ':!docs/audyt'` pusty — poza audytem nic nie zmieniono) |
| Materiał | `docs/audyt/13-prywatnosc-i-zgodnosc/`: `README.md`, `01`–`09`, `10-REVIEW.md`, `A1`–`A4`, `narzedzia/`, `recenzje/` (R1, R2-runda1, R2, R3, R4, R5a, R5b, brief) |
| Punkt odniesienia | `00-ZADANIE.md` pkt 1–7; `BRIEF.md` z ADDENDUM 1–3 |
| Metoda | (1) wymaganie po wymaganiu z `00-ZADANIE.md` → miejsce w plikach, dowód albo ograniczenie, dalsza ścieżka (E-NN / N-NN / Q-NN); (2) skrypty kontrolne w scratchpadzie: mapa definicji 817 identyfikatorów, sprawdzenie wszystkich odwołań w `05`, `07`, `08`, `README.md`; przeliczenie stanów i ryzyk `05`; pola kart `07`; pokrycie ustaleń przez karty; indeks niewiadomych w `08`; (3) kontrole punktowe w kodzie i w plikach; (4) kontrola wierności naniesienia R1 do `01`/`02` (przekazana krytykom R6 przez `10-REVIEW.md` § 5) |
| Ograniczenia | jak w audycie: brak produkcji, paneli, umów; źródła prawa i AICPA zablokowane — nie oceniam merytorycznie treści przepisów, tylko czy audyt je jawnie oznaczył i dał im ścieżkę; nie zmieniam plików audytu |

Statusy w tabeli pokrycia: **pokryte** — jest ustalenie z dowodem albo jawne ograniczenie oraz dalsza ścieżka; **częściowo** — brakuje jednego z tych elementów albo spójności; **brak** — wymaganie nieobsłużone.

## 1. Tabela pokrycia

### 1.1. Pkt 1 — zasada dotycząca prawnika

| Wymaganie | Gdzie | Dowód / ograniczenie | Ścieżka | Status |
|---|---|---|---|---|
| Research bez prawnika; prawnik tylko końcowe review; postęp nie zależy od konsultacji | `07` § 0.3 (projekt → review → publikacja, prace wcześniejsze nie czekają), `08` § 5.1 (zmiany niezależne od niewiadomych), README § 6 | 08 § 5.1 wylicza etapy startujące bez review; `07` § 1.4 start E-00 równolegle z E-01–E-04 | E-01–E-16 „start: od razu”; E-58–E-67 z krokiem review | pokryte |
| Rejestrować niepewności, interpretacje, podstawy, pytania | `08` § 2 (N-01–N-41), § 3 (Q-01–Q-44 z kolumną „Interpretacja robocza”), § 4.2 (lista kontrolna źródeł [NZ]); pytania w każdym pliku (`02` § 8, `03` § 5.2, `04` § 7, `A1`–`A4`, `06` § 11) | indeks źródłowy → N/Q kompletny: wszystkie N-INW (16), N-PRC (11), NA1 (14), N-A2 (14), N-DOW (11), NS (15), N-ZR (14), Q-ZR (18), QA1 (16) występują w `08` (skrypt R6a) | `08` § 2.8, § 3.11 (N/Q → D-NN → E-NN) | pokryte |
| Robocze założenia nie jako zatwierdzone fakty | oznaczenia [NZ], [PR225], „propozycja”, „wstępna” w każdym pliku; `09` § 0 | wyjątek: README § 2 pkt 4 przedstawia RUN-08 jako wynik testu runtime, a `A4` ma stan „częściowe” (przekazanie na łączu nieobserwowane) — R6a-U03 | — | częściowo |

### 1.2. Pkt 2 — rozpoznanie projektu i dostępu

| Wymaganie | Gdzie | Dowód / ograniczenie | Ścieżka | Status |
|---|---|---|---|---|
| Instrukcje repo (`AGENTS.md`, `CLAUDE.md`), dokumentacja architektury | `01` § 3 akapit „Instrukcje i dokumentacja architektury” | `CLAUDE.md` = import `@AGENTS.md`; `system-overview.md:5` nieaktualny; pozostałe 5 plików `docs/architecture/` jawnie nieocenione | opis przepływów z kodu (`02`) | pokryte |
| Stos | `01` § 3 (Next.js 16.3.8, `proxy.ts`, Supabase self-hosted, pg-boss) | `package.json`, `proxy.ts` | — | pokryte |
| Struktura | `01` § 3 akapit „Struktura” | katalogi `app/*`, `lib/*`, `ops/`, `scripts/` | — | pokryte |
| Modele danych | `01` § 3 „Baza” (132 migracje, 70 tabel, RLS 70/70); `02` § 2 (D-01–D-31) + akapit tabel bez danych osobowych | schemat `auth.*` poza repo — N-INW-01 → `08` | E-22 (wyszukiwanie po magazynach), D-06 | pokryte |
| API | `01` § 3 „Rozmiar”, „Trasy istotne dla prywatności”; `A1` MIN-04 (zakres odpowiedzi) | 18 `route.ts`, 44 pliki `'use server'` | E-32 | pokryte |
| Frontend | `01` § 3 (PWA, grupy tras); `A4` (magazyny przeglądarki); `02` D-31 | runtime tylko strony publiczne (`A4` § 7) | N-08 / E-75 (uprząż A4 per wydanie) | pokryte |
| Zadania w tle | `01` § 3 (27 cronów, 52 kolejki [PR225]); `02` D-27 | `lib/jobs/queues.ts:88-128`, `node_modules/pg-boss/dist/plans.js:46-49` | E-48 | pokryte |
| Integracje | `01` § 3 „Integracje”; `04` § 1 (R-01 … R-27) | grep hostów, CSP | E-61 | pokryte |
| Konfiguracja środowisk | `01` § 3 „Środowiska” | staging nie istnieje [PR225]; `KSEF_ENV=test` | E-10, E-77 | pokryte |
| Infrastruktura | `01` § 4 (tabela korekt `AGENTS.md` z poziomem dowodu) | wyłącznie PR #225 — jawne ograniczenie | D-06, D-08 | pokryte |
| Testy | `01` § 3 „Testy”; `A3` § 4 (49 plików uruchomionych, RLS z CI) | E2E nieuruchamiane — ograniczenie `A3` § 4.4 | E-70, E-75, T-01–T-21 | pokryte |
| Wersja kodu i lokalne zmiany | `01` nagłówek, § 2 („Dryf wersji po zamrożeniu”) | `3e5e00d`; `face09c`, produkcja `43091e7` [PR225 @a72b567] | `07` § 12 (świeża gałąź i ponowny grep) | pokryte |
| Cykl życia: zebranie | `02` § 2 (kolumna „Źródło”), `A1` B.1 (konieczność pól) | `02` D-01–D-31 | E-29, E-30 | pokryte |
| — przesłanie | `02` § 5.1–5.6 (mapy), `04` § 1 | — | E-05, E-11, E-61 | pokryte |
| — przetworzenie | `02` kolumna „Cel”, `A2` § AI | — | E-17, E-59 | pokryte |
| — zapis | `02` kolumna „Magazyny”, § 3 | S3, DUMP, SNAP, HIMG, PGB, Redis | E-40 | pokryte |
| — udostępnienie | `A1` MIN-06 (linki, podpisane adresy), `02` INW-19, WYM-33 | — | E-43 | pokryte |
| — eksport | `A2` PRA-01, RET-11, `02` D-14 | — | E-23, E-25 | pokryte |
| — retencja | `A2` § E (E.1 z podstawą i początkiem biegu), `09` § 10 | — | E-40, E-44–E-51 | pokryte |
| — usuwanie | `A2` PRA-02–PRA-04, RET-02, RET-04 | — | E-02–E-04, E-19–E-21, E-50 | pokryte |
| — odtwarzanie | `02` § 5.7, `A2` RET-09, `06` § 4, `A3` DOW-22 | jedna próba (deklaracja) | E-53–E-55 | pokryte |
| Bazy | `02` § 2; baza `_supabase` (`02` § 3.1, N-INW-15) | — | E-41 | pokryte |
| Pliki | `02` § 3.1, D-08, D-11, D-14, D-15; MinIO Supabase 0 obiektów [PR225 @a72b567] | — | E-45 | pokryte |
| Cache | `02` D-26 (Redis), D-31 (Cache Storage SW), `validation_cache` | cache danych Next.js (`unstable_cache`, `'use cache'`) nieużywany — R6a sprawdził `git grep` na `3e5e00d` (0 trafień); audyt tego nie zapisał (bez wpływu) | E-33 | pokryte |
| Kolejki | `02` D-27, `ksef_offline_queue` | — | E-48 | pokryte |
| Logi | `02` D-25, § 3.1 (logi kontenerów, `_supabase`) | retencja logów Docker nieznana [PR225] | E-15, E-41 | pokryte |
| Tracing | `02` D-23 (transakcje Sentry 10 %), `A4` RUN-04 (sesje, transakcje, spany) | OpenTelemetry nieużywany (R6a: `git grep` bez trafień w kodzie) | E-06 | pokryte |
| Analityka | `02` D-24, `A1` MIN-08, ZGD-05, `A4` RUN-02 | panel PostHog [PR225 @a72b567] | E-09, E-18, E-27 | pokryte |
| Backupy | `02` § 3.1, § 5.7; `04` PRC-14; `06` SOC-21 | lokalny `pg_dump`, `_supabase` poza zrzutem | E-53–E-55 | pokryte |
| Support | `02` D-16, D-30; `04` PRC-08; `A2` AI-03 | skrzynki docelowe niezweryfikowane | D-10, E-46, E-66 | pokryte |
| AI/OCR | `A2` § AI (AI-01–AI-05), `04` PRC-06, PRC-07 | DPA Anthropic odczytane (DOK-3) | E-11, E-12, E-17, E-60 | pokryte |
| Wyszukiwarki, bazy wektorowe | `02` § 2 akapit „Wyszukiwarki i bazy wektorowe” | „nie znaleziono w repo”, poprawnie odróżnione od „nie istnieje”; R6a powtórzył grep: jedyne trafienia to komentarz `lib/support/knowledge-base.ts:12` i wyłączone `[storage.vector] enabled = false` w lokalnym `supabase/config.toml:141-142`; FTS tylko `00013_products_catalog.sql:40` | — (nie dotyczy) | pokryte |
| Kod, schematy, dane syntetyczne; bez danych klientów i sekretów | `A4` § 1 (`zmienne-syntetyczne.env`); `narzedzia/wynik-test-cookies.json` | R6a: brak tokenów JWT, jedyny adres IP `127.0.0.1`, bez wartości ciasteczek | — | pokryte |
| Brak dostępu = ograniczenie dowodowe | `01` § 5, `08` § 6, sekcje „czego nie sprawdziłem” w każdym pliku | — | N-NN P1 w `08` | pokryte |

### 1.3. Pkt 3 — workflow agentowy i niezależne review

| Wymaganie | Gdzie | Dowód / ograniczenie | Ścieżka | Status |
|---|---|---|---|---|
| Delegowanie: research źródeł, przepływy, mechanizmy, testy, dowody/SOC 2 | `01` § 7 (9 agentów-autorów), `10-REVIEW.md` § 2 | agenci ŹRÓDŁA, INWENTARZ, PROCESORZY, MECHANIZMY-A/B, RUNTIME, DOWODY, SOC2, MACIERZ, PLAN, NIEWIADOME, MATERIAŁY | — | pokryte |
| Review: rozpoznanie | R1 (`recenzje/R1.md`) | autor `01` = koordynator; R1 werdykt; naniesienie przez koordynatora (tekst recenzenta) | R6 — kontrola wierności: dla `01` R6a potwierdza (frazy R1-U01–U10 obecne), dla `02` — nie w pełni (R6a-U01) | częściowo |
| Review: research | R2 runda 1 i 2 | dwie rundy, runda 2 sprawdziła wierność | — | pokryte |
| Review: inwentarz | R1 | naniesienie R1-U15 i R1-U24 niepełne (R6a-U01) | R6a-U01 | częściowo |
| Review: analiza luk | R3 (`A1`, `A2`, `A4`), R4 (`A3`, `06`), R5a (`05`) | redaktorzy niezależni od autora i recenzenta | — | pokryte |
| Review: plan | R5a (`07`) | wymaga poprawek → naniesione | — | pokryte |
| Autor nie zatwierdza własnego etapu | `10-REVIEW.md` § 1 | wyjątek `01` (koordynator nanosi tekst R1) jawnie opisany w § 5 | — | pokryte |
| Nie udawać delegowania; brak review = bramka niespełniona | `10-REVIEW.md` § 2 (stan bramek), § 5 (odstępstwa) | — | — | pokryte |
| Review README i `10-REVIEW.md` | `10-REVIEW.md` § 4 „W toku” | R6a/R6b trwają; README nagłówek twierdzi „etap badawczy zakończony” (R6a-U04) | R6a-U04 | częściowo |

### 1.4. Pkt 4 — źródła pierwotne

| Wymaganie | Gdzie | Dowód / ograniczenie | Ścieżka | Status |
|---|---|---|---|---|
| RODO w EUR-Lex: art. 25, zasady, podstawy, prawa, procesorzy, bezpieczeństwo, retencja, transfery | `03` ZR-01 + § 2.1a; WYM-01–WYM-62 | `03` § 1.1: próba `curl` 10.10 → 403; [NZ] z datą | `08` § 4.2 A (lista kontrolna), N-38 | pokryte (z ograniczeniem) |
| EDPB: PbD/default, zgody, role, dostęp, usuwanie, aktualne wytyczne | `03` § 2.4 (ZR-30–ZR-57, wersje, dokumenty konsultacyjne oznaczone) | [NZ]; ZR-42, ZR-43 jako „kierunek”, nie podstawa (WYM-12, WYM-38) | `08` § 4.2, N-38 | pokryte (z ograniczeniem) |
| UODO: PbD/default, zgody, role, dostęp, usuwanie | `03` § 2.3 (ZR-20 wykaz DPIA, ZR-21 trzy decyzje); zdanie „poradników nie rejestruję (do uzupełnienia w review)” | ograniczenie jawne, ale ścieżka w `08` § 4.2 E (wiersz „poradniki UODO”) dotyczy tylko procedury naruszeń (WYM-52) | brak ścieżki dla PbD, zgód, ról, dostępu, usuwania — R6a-U05 | częściowo |
| ePrivacy i krajowe; PKE art. 399–400 | `03` ZR-02, ZR-11, ZR-12; WYM-63–WYM-66 | numer Dz.U. „do potwierdzenia”; N-ZR-04, Q-ZR-04 → Q-12 | `08` § 4.2 | pokryte (z ograniczeniem) |
| AICPA: TSC i zasady raportowania | `03` ZR-70–ZR-74, § 2.6a (61 identyfikatorów, liczba sprawdzona przez R6a: 33+3+2+5+18) | [NZ]; `06` zastrzeżenie o identyfikatorach | NS-02, N-ZR-11 | pokryte (z ograniczeniem) |
| Dokumentacje dostawców, umowy, ustawienia | `04` § 8.2 (DOK-1–DOK-12, odczyt 10.10), § 8.3 (próby nieudane), [PR225] dla paneli | rejestr źródeł `03` ZR-81 mówi „niesprawdzane w tym pliku” i nie wymienia odczytanych DOK (R6a-U06); umowy — D-04 | D-03, D-04, E-61 | pokryte (drobna niespójność) |
| Advisera, Schneider Downs tylko jako wskazówki | `03` ZR-83, ZR-84 („niepobierane”, „nie jest podstawą żadnego WYM”) | — | `08` § 4.2 | pokryte |
| Potwierdzanie w źródłach pierwotnych | niewykonalne (egress, WebSearch odrzucony) | `03` § 1.1 z wynikami prób; `00` „Zmiany zakresu” | `08` § 4.2 (lista do potwierdzenia) | pokryte (z ograniczeniem) |
| Rozdzielenie P/O/S/I | `03` § 4; kolumna „Klasa” w `05`, w ustaleniach | drobne niespójności klas po R1-U24 (INW-16) — R6a-U01 | — | pokryte |
| Źródło, przepis, data sprawdzenia, zastosowanie dla każdego wniosku | `03` kolumny „Przepisy”, „Weryfikacja” (data), „Zastosowanie”; `05` kolumna „Źródło” | — | — | pokryte |
| Nie przypisywać obowiązywania projektom i konsultacjom | `03` § 4, ZR-07 (projekt ePrivacy — „brak mocy”), ZR-42/ZR-43 | — | — | pokryte |

### 1.5. Pkt 5 — obowiązkowy zakres audytu

| Wymaganie (zdanie) | Gdzie | Dowód / ograniczenie | Ścieżka | Status |
|---|---|---|---|---|
| **A.** Kategorie osób, danych i celów | `02` § 1 (O-01–O-17), § 2 (D-01–D-31, kolumna „Cel”) | `ścieżka:linia` w każdym wierszu | WYM-03 → E-40, E-59 | pokryte |
| A. Dane kont, osób bez konta, dokumentów, kontaktów, identyfikatorów, telemetrii | `02` D-01, O-02/O-03/O-05/O-09–O-11, D-08–D-11, D-07, D-09, D-23–D-24 | — | — | pokryte |
| A. Role stron osobno dla operacji | `02` § 4.1–4.3 (propozycje [NZ]); WYM-01 częściowe | role mieszane do review (Q-01–Q-04) | E-59 | pokryte |
| A. Dla każdej kategorii: źródło, przepływ, magazyny, odbiorcy, dostęp, retencja, dowody | `02` § 2 kolumny, § 3, § 5 | GoTrue `auth.*` i `_supabase` niezweryfikowane (N-INW-01, N-INW-15) | D-06 | pokryte |
| **B.** Konieczność pól | `A1` B.1, MIN-01, MIN-02 | — | E-29, E-30 | pokryte |
| B. Zakres odpowiedzi API | `A1` MIN-04 | — | E-32 | pokryte |
| B. Dostęp pracowników i użytkowników | `A1` MIN-05, `02` INW-15, `A3` DOW-05, DOW-08, `06` SOC-07–SOC-11 | — | E-36, E-69 | pokryte |
| B. Domyślne udostępnianie | `A1` MIN-06, MIN-03; WYM-33 | — | E-31, E-43 | pokryte |
| B. Logi, błędy | `A1` MIN-07; `02` D-25 | — | E-15, E-41 | pokryte |
| B. Analityka | `A1` MIN-08; `A4` RUN-02 | `ip: false` nieskuteczne — poprawione w `A1:138` (R3) | E-09, E-27 | pokryte |
| B. Dane testowe | `A1` MIN-09 | — | E-38 | pokryte |
| B. Pseudonimizacja, oddzielenie kluczy, identyfikowalność | `A1` MIN-10, MIN-11; `02` INW-16 (skróty bez soli) | — | E-35, E-49 | pokryte |
| B. Hash/UUID/maskowanie/szyfrowanie ≠ anonimizacja | `A1` MIN-11 („anonimizacja” dziennika to pseudonimizacja), MIN-10 | — | E-34, E-35 | pokryte |
| **C.** Cele → podstawy i obowiązki informacyjne | `A1` tabela „cel → proponowana podstawa → obowiązek informacyjny”; ZGD-01; `09` § 1 | podstawy jako propozycje | E-59, E-63 | pokryte |
| C. Nie przypisywać automatycznie zgody | `A1` tabela (różne podstawy); `09` § 4 (LIA) | — | — | pokryte |
| C. Oddzielnie: zgody produktowe, marketing, przeglądarka | `A1` ZGD-07, ZGD-06, ZGD-05/ZGD-10 | — | E-17, E-65, E-18 | pokryte |
| C. Wersjonowanie, udzielenie, odmowa, wycofanie | `A1` ZGD-04, ZGD-05; `A4` RUN-03, RUN-10 | — | E-18, E-58 | pokryte |
| C. Rzeczywiste żądania, cookies, magazyny — przed wyborem i po wycofaniu | `A4` (scenariusze a–d, d1/d2, e3; 11 stron) | strony po zalogowaniu i produkcja poza zasięgiem (`A4` § 7) | N-08; E-75 (uprząż per wydanie) | pokryte (z ograniczeniem) |
| C. Uzasadnić klasyfikację technologii niezbędnych | `A4` § 4, `A1` „Tabela technologii przeglądarkowych”, `09` § 12.3 | — | E-63 | pokryte |
| C. Baner ≠ dowód działania | `A4` RUN-01–RUN-03 | — | — | pokryte |
| **D.** Rozróżnić dostęp/kopię, przenoszenie, sprostowanie, usuwanie, ograniczenie, sprzeciw | `A2` D.1 (wiersz na każde prawo), PRA-01–PRA-08 | — | E-23, E-24, E-26, E-27 | pokryte |
| D. Identyfikacja osoby, zakres wyszukiwania, terminy | `A2` PRA-09, PRA-11; `09` § 8.2–8.4 | — | E-22, E-66 | pokryte |
| D. Bezpieczeństwo eksportu, dane innych osób | `A2` PRA-01 (dane innych osób w eksporcie — `A2:89,120,135`) | — | E-23 | pokryte |
| D. Osoby bez konta; obowiązki jako procesor | `A2` PRA-09, PRA-10; `09` § 8.6 | — | E-22, E-62, E-66 | pokryte |
| **E.** Reguły, podstawy, początek biegu | `A2` E.1 (kolumny „Podstawa”, „Początek biegu”) | podstawy jako propozycje | E-40, D-05 | pokryte |
| E. Usuwanie we wszystkich systemach | `A2` E.1, RET-09, RET-10; `02` § 3 | — | E-20, E-21, E-45 | pokryte |
| E. Usunięcie konta / logiczne ukrycie / faktyczne usunięcie / anonimizacja | `A2` E.1 (rodzaje TD, PS, SD, TTL), PRA-02, `A1` MIN-11 | — | — | pokryte |
| E. Wyjątki, obowiązki przechowywania dokumentów | `A2` RET-01; `05` § 12.3 poz. 17 (okres faktur nierozstrzygnięty) | [NZ] — Q-ZR-02 | E-51 (po review) | pokryte |
| E. Backupy, dostawcy, przywracanie | `A2` RET-09, RET-10; WYM-72 | — | E-55, E-21 | pokryte |
| E. Bez jednego okresu dla całej aplikacji | `09` § 10 (32 pozycje, w tym RT-KSEF) | — | D-05 | pokryte |
| **F.** Rzeczywiści odbiorcy, dalsi procesorzy, support, telemetria | `04` § 1 (R-01–R-27), § 3 | — | E-61 | pokryte |
| F. DPA, regiony, lokalizacje backupów, zdalny dostęp, retencja dostawców, transfery | `04` § 1 kolumny, § 4.1 (dostęp zdalny `04:354`, N-PRC-08), PRC-14, DOK-3 | umowy nieznane (D-04) | E-61 | pokryte |
| F. „Region UE” ≠ ocena łańcucha | `04` § 4.1 | — | E-61 (TIA) | pokryte |
| F. Nie zgadywać umów | `04` § 6, § 8.4 | — | D-04 | pokryte |
| **G.** Polityki, rejestry, procedury praw osób, incydentów, retencji; przeglądy dostępów; ślady audytowe; raporty/certyfikaty | `A3` § 1.1–1.6, § 2; DOW-01–DOW-23 | „brak” = „nie znaleziono w repo” (N-03 / N-DOW-01) | E-59, E-66, E-67, E-69, E-36 | pokryte |
| G. Potrzeba DPIA, LIA, TIA z faktów | `A3` § 6; `09` § 3–5 (screening oznaczony jako wstępny po R5b) | — | E-59, E-60, E-61 | pokryte |
| G. Materiały robocze | `09` (rejestry art. 30 FF-A/FF-P, screening DPIA, L-01–L-06, TIA, umowa powierzenia, lista dalszych procesorów, DSAR, naruszenia, retencja, polityka, zgoda) | — | E-59–E-67 | pokryte |
| G. Dokument ≠ wykonana kontrola | `06` (projekt vs działanie), `A3` DOW-03, DOW-22 | — | E-75 | pokryte |

### 1.6. Pkt 6 — SOC 2

| Wymaganie | Gdzie | Dowód / ograniczenie | Ścieżka | Status |
|---|---|---|---|---|
| Pięć kategorii | `06` § 3–7 | — | `07` § 9.1 | pokryte |
| Common Criteria i kryteria dodatkowe | `06` § 3.1–3.9 (CC1–CC9), § 4 A1, § 5 PI1, § 6 C1, § 7 P1–P8 | — | — | pokryte |
| Mapowanie do zweryfikowanych ID; ograniczenie zamiast wymyślania | `06` zastrzeżenie o identyfikatorach; „(grupa)” przy niższej pewności (np. P6.x) | ID z wiedzy modelu [NZ] — jawne ograniczenie | NS-02, N-ZR-11 | pokryte (z ograniczeniem) |
| Per kategoria: znaczenie, kontrole, luki, wymagane dowody | `06` akapity „Znaczenie dla FaktFlow”, tabele „Kontrole i luki”, § 3.10, 4.4, 5.3, 6.2, 7.2 | — | — | pokryte |
| Dostęp, zmiany, odtwarzanie, poprawność i kompletność, poufność, cykl życia danych osobowych | CC6, CC8, A1 + § 4.2, PI1 § 5, C1 § 6, P3–P4 § 7.1 | — | E-69, E-72, E-53/E-54, E-10, E-56, E-40 | pokryte |
| Zakres przeglądu ≠ zakres badania | `06` § 1.1–1.3 | — | — | pokryte |
| Type I / Type II, gotowość, projekt vs działanie | `06` § 2.1–2.2, oznaczenia „Projekt”/„Działanie” | — | `06` § 9.3 | pokryte |
| Bez „certyfikacji”, bez fikcyjnego raportu, SOC 2 ≠ RODO | `06` ramki „Czym ten dokument nie jest”, § 7 „Granica z RODO”, § 9.4; README § 2 pkt 8 | WYM-SOC-7 (strażnik fraz w E-01) | E-79 | pokryte |

### 1.7. Pkt 7 — wymagany wynik

| Wymaganie | Gdzie | Dowód / ograniczenie | Ścieżka | Status |
|---|---|---|---|---|
| Jedno logiczne miejsce, konwencja repo | `docs/audyt/13-prywatnosc-i-zgodnosc/` (obok `docs/audyt/blok-1/`); README jako indeks | — | — | pokryte |
| Raport stanu i granic | `01` | — | — | pokryte |
| Inwentarz, mapa przepływów, role | `02` | — | — | pokryte |
| Rejestr źródeł oraz procesorów/lokalizacji | `03`, `04` | ZR-81 bez odsyłacza do DOK (R6a-U06) | — | pokryte |
| Macierz ID → źródło → stan → dowód → luka → ryzyko → zmiana → test → zależność | `05` §§ 2–10 | 85 wierszy × 13 kolumn (skrypt R6a: 85/85 ma 13 kolumn i etap planu); każdy z 82 WYM z `03` ma wiersz w `05` | `07` § 10 | pokryte |
| Mapowanie SOC 2 | `06`, `07` § 9 | — | — | pokryte |
| Plan: kryteria akceptacji, testy, migracje, wycofanie | `07` §§ 3–7 (E-00 + 79 kart) | skrypt R6a: każda karta E-01–E-79 ma „Akceptacja” lub „Dowód / akceptacja”, „Migracje”, „Wycofanie”, pole „Po …”; karty kodu — „Test czerwony”, organizacyjne — „Kroki” (zgodnie z § 0.5); E-00 zapowiada PR skryptu bez pól testu, migracji i wycofania (R6a-U07) | — | pokryte |
| Rejestr niewiadomych i materiałów do review | `08`, `09` | — | — | pokryte |
| Słownik stanów (5 wartości) | `05` (wyłącznie 5 wartości: 1/44/36/4/0 — przeliczone przez R6a) | w ustaleniach `02`, `A1`, `A2`, `A3`, `A4` pole „Stan” przyjmuje wartości spoza słownika („brak zgodności”, „do oceny”) albo „potwierdzone” dla potwierdzonej luki (R6a-U01, R6a-U02) | — | częściowo |
| „Nie znaleziono” ≠ „nie istnieje” | konwencje w każdym pliku; `05` § 1; README § 2 pkt 6 | — | N-03 | pokryte |
| Pliki, miejsca, wyniki sprawdzeń zamiast opinii | `ścieżka:linia` w ustaleniach; wyniki komend (`A3` § 4.2, `03` § 1.1) | — | — | pokryte |
| Niewiadome nie blokują zakończenia; blokują tylko zależne wnioski | `08` § 5.1–5.2, kolumna „Blokuje start?” | „żadna nie blokuje startu w całości; pięć częściowo” | — | pokryte |
| Implementacja bez ponawiania badania | `07` karty z plikami, testem czerwonym, zakresem; `07` § 12 (dryf wersji: świeża gałąź i ponowny grep) | — | — | pokryte |
| Zakończenie niezależnym review kompletności | `10-REVIEW.md` § 4 „W toku”; ten plik i R6b | wynik R6 jeszcze nie naniesiony; README już mówi „zakończony” (R6a-U04) | R6a-U04 | częściowo |
| Najważniejsze ryzyka i kolejność zmian | `05` § 12.2 (15 ryzyk), README § 3–4, `07` § 1, § 8 | liczby ryzyk przeliczone przez R6a: obecne W 8, K1 W 47 — zgodne z `05` § 12.1 | — | pokryte |
| Zatrzymanie na granicy etapu | README § 6, `07` § 0 | brak zmian poza `docs/audyt` (`git diff` pusty) | — | pokryte |


## 2. Spójność identyfikatorów

| # | Kontrola | Metoda | Wynik |
|---|---|---|---|
| K1 | Każde WYM z `03` ma wiersz w `05` | skrypt: pierwsze komórki wierszy tabel | 82/82 (WYM-01–WYM-75, WYM-SOC-1–7) + 3 WYM-X tylko w `05` — **zgodne** |
| K2 | Wiersze `05` mają 13 kolumn i wypełniony „Etap planu” | parsowanie tabel | 85/85 — **zgodne** |
| K3 | Liczby stanów `05` § 12.1 | przeliczenie kolumny „Stan” | potwierdzone 1, częściowe 44, brak 36, niezweryfikowane 4, nie dotyczy 0 — **zgodne** z `05` i README |
| K4 | Rozkład ryzyka `05` § 12.1 | przeliczenie „obecne / K1” | W→W 8, Ś→W 35, Ś→Ś 10, N→W 4, N→Ś 22, N→N 6; obecne W: WYM-09, -18, -19, -24, -36, -45, -51, -73 — **zgodne** |
| K5 | Odwołania w `05` istnieją w plikach źródłowych | mapa 817 definicji (nagłówki i pierwsze komórki tabel) | 511 unikalnych ID, 0 brakujących, 0 w złym pliku — **zgodne** |
| K6 | Odwołania w `07` | jw. | 447 unikalnych, 0 brakujących — **zgodne** |
| K7 | Odwołania w `08` | jw. | 567 unikalnych, 1 „brakujące” = sygnatura T-553/23 (wyrok, nie ID) — **zgodne** |
| K8 | Odwołania w README | jw. | 59 unikalnych, 0 brakujących — **zgodne** |
| K9 | Próba semantyczna: ID przy ryzykach wysokich (`05` § 12.2 poz. 1–15 i 8 wierszy „obecne W”) | tytuł ustalenia w pliku źródłowym vs teza cytująca | 62 ID (PRA-02, PRA-03, PRA-04, PRA-09, PRA-11, INW-01–04, INW-06, INW-17, INW-18, AI-01, AI-03, AI-05, DOW-02, -04, -05, -06, -08, -17, -20, -22, -23, RET-01, -02, -04, -05, -06, -09, -11, -12, RUN-08, RUN-11, SOC-06, -07, -09, -11, -21, -22, -25, -29, -35, PRC-01, -02, -03, -05, -06, -07, -08, -09, -14, -17, ZGD-01, -02, -03, -08, -12, MIN-05, MIN-08) — treść zgodna z tezą; zastrzeżenie co do poziomu dowodu RUN-08 (R6a-U03) |
| K10 | Kody dowodowe ryzyk wysokich w kodzie `3e5e00d` | `git show 3e5e00d:<plik>` | `components/settings/account-actions.ts:58-65` (hard_delete_at), `00132…sql:63-73` (blokada DELETE), `00052…sql:16-41` (append-only), `next.config.ts:140-155,189` (rewrites, tunel), `polityka-prywatnosci/page.tsx:20-21` (placeholder), `submit-invoice.ts:628` i `ksef-submit-enqueue.ts:127` (`?? 'test'`), `ai-classifier.ts:42-50` (NIP w prompcie), `db-backup.sh:77` (`-d postgres`), `instrumentation-client.ts:5-8` (Sentry bez bramki, 0.1), `app/admin/users/actions.ts:132,194` — 11/11 **zgodne** |
| K11 | Karty `07`: akceptacja, test, migracje/„brak”, wycofanie, „Po …” | skrypt po 79 kartach | 79/79 mają pola; karty organizacyjne i prawne zastępują test polem „Kroki”/„Dowód / akceptacja”/„Migracje / test: przegląd” zgodnie z § 0.5; karty z migracją podają kierunek przed/PO i wpływ na wiersze — **zgodne**; E-00 — R6a-U07 |
| K12 | Każde ustalenie (159) w polu „Pokrywa” karty | skrypt (z rozwijaniem zakresów „SOC-07 – SOC-09”) | 159/159 — **zgodne** z `10-REVIEW.md` § 3 |
| K13 | Bramka A obejmuje 47 wymagań „K1 W” | etapy z § 8.1 → pola „Pokrywa” | 47/47 przez co najmniej jeden etap bramki; 21 nie jest nazwanych w § 8.1 wprost (np. WYM-01, -04, -05, -11, -30, -72, WYM-SOC-1–5) — WYM-30 ma jawne uzasadnienie w § 8.3 — **zgodne** |
| K14 | Każda niewiadoma źródłowa w `08` | N-INW (16), N-PRC (11), NA1 (14), N-A2 (14), N-DOW (11), NS (15), N-ZR (14), Q-ZR (18), QA1 (16) | wszystkie obecne — **zgodne** |
| K15 | N-01–N-41 i Q-01–Q-44 mają ścieżkę do etapu | `08` § 2.8 i § 3.11 | 41/41, 44/44 — **zgodne** |
| K16 | Wymagania „niezweryfikowane” mają ścieżkę | `05` | WYM-39 → E-59, WYM-56 → E-60, WYM-59 i WYM-61 → E-61 — **zgodne** |
| K17 | Przestrzenie nazw ID | przegląd definicji | kolizje D-NN (3 znaczenia), P-NN (2), R-NN (2) — **niezgodne** (R6a-U08) |
| K18 | Słownik stanów w ustaleniach | grep pola „Stan” we wszystkich plikach | wartości spoza słownika i „potwierdzone” dla luk w `02`, `A1`, `A2`, `A3`, `A4` — **niezgodne** (R6a-U01, R6a-U02) |

Razem kontrole R6a: 36 (K1–K18 oraz 18 wierszy tabeli pokrycia sprawdzonych dodatkowo w kodzie lub w plikach: wierność R1 w `01` i `02`, `git diff` poza audytem, skan `narzedzia/`, OpenTelemetry, cache Next.js, bazy wektorowe, `ip: false` w `A1:138`, liczba kryteriów TSC, zgodność README z `07` § 1.4 i `05` § 12, dokumenty konsultacyjne jako podstawa, przechowywanie faktur w KSeF — WYM-69, ZR-81 vs `04` § 8.2, ścieżka UODO, pola E-00, status zamknięcia R6, poziom dowodu RUN-08). Nieudane: 8 (wierność R1 w `02`, słownik stanów, poziom dowodu w README, status zamknięcia, ścieżka UODO, ZR-81, pola E-00, kolizje ID).

## 3. Braki (R6a-Uxx)

### R6a-U01 — `02` (+ `10-REVIEW.md`) — istotna — niepełne naniesienie R1 przez koordynatora

- **Miejsce:** `02` § 6 sekcje szczegółowe: INW-07 (`:517`), INW-10 (`:541`), INW-11 (`:549`), INW-13 (`:562`), INW-16 (`:585`), INW-17 (`:592`), INW-19 (`:610`); § 5.1 mapa ogólna (`:225-260`); § 5.7 mapa kopii (`:426-436`); `10-REVIEW.md` § 2, wiersz `02` („14 / 0”).
- **Problem:** `10-REVIEW.md` § 5 przekazał krytykom R6 sprawdzenie wierności naniesienia R1 do `01`/`02`. W `01` wszystkie R1-U01–U10 są w treści. W `02` cztery uwagi naniesiono częściowo: **R1-U15** — tylko w tabeli zbiorczej § 6; w sekcjach szczegółowych dalej „potwierdzone (kod)” dla potwierdzonej luki (INW-07, -10, -13, -16, -19), „brak zgodności” (INW-17), „do oceny w `A1-…` i `A4-…`” (INW-11) — ten sam plik podaje dla jednego ustalenia dwa różne stany; **R1-U24** — INW-16 ma „Klasa: I”, tabela „I, P”; **R1-U13** — brak węzła „Logi usług Supabase (`_supabase`)” w § 5.1 i adnotacji „poza `pg_dump`” w § 5.7; **R1-U20** — § 5.7 nadal „pg_dump całej bazy + role, 14 zrzutów” i węzeł „Postgres: public, auth, pgboss”. Historia recenzji `02` i `10-REVIEW.md` deklarują 14/14 naniesionych.
- **Wymagana zmiana:** (1) w sekcjach INW-07, -10, -11, -13, -16, -17, -19 przepisać pole „Stan” dosłownie z tabeli § 6 (np. INW-07 „brak (pewność: kod; skrzynki docelowe niezweryfikowane)”, INW-11 „niezweryfikowane (ocena podstawy w `A1`, zachowania sieci w `A4`)”, INW-17 „brak”); (2) INW-16 „Klasa: I, P”; (3) § 5.1: węzeł `SLOG[("Logi usług Supabase — baza _supabase (poza pg_dump)")]` z krawędzią od `DB`/usług Supabase; (4) § 5.7: etykieta „pg_dump bazy `postgres` + role (bez `_supabase`), domyślnie 14 zrzutów (`KEEP`)” i węzeł `_supabase` z krawędzią „brak kopii”; (5) `10-REVIEW.md` § 2 i Historia recenzji `02`: „14 przyjętych; U13, U15, U20, U24 uzupełnione po R6a (data)”.

### R6a-U02 — `A1`, `A2`, `A3`, `A4` (+ README § 1) — istotna — słownik stanów w ustaleniach

- **Miejsce:** `A1` ZGD-03 (`:248` „brak zgodności”), ZGD-11 (`:347` „brak zgodności z polityką”), ZGD-12 (`:355`), MIN-03 (`:77` „potwierdzone (kod)”), MIN-11 (`:185`); `A2` RET-08 (`:849`), AI-04 (`:1076`); `A3` DOW-18 (`:821` „potwierdzone (luka)”); `A4` RUN-04–RUN-07 (`:319-343`), RUN-09 (`:360`), RUN-11 (`:376`).
- **Problem:** pkt 7 zadania wymaga stanów „potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy”. W ustaleniach pole „Stan” raz oznacza stan wymagania, raz pewność luki; „RUN-04: Stan: potwierdzone” znaczy „luka potwierdzona”, a czytelnik odczyta „wymaganie spełnione”. R1-U15 wskazał ten błąd w `02`; reguły nie rozciągnięto na pozostałe pliki ustaleń, a R3/R4 go nie zgłosiły. Macierz `05` jest poprawna, więc skutek dotyczy czytelności ustaleń, nie liczb.
- **Wymagana zmiana:** (a) „brak zgodności” i „brak zgodności z polityką” → „brak”; (b) w sekcji konwencji `A1`–`A4` dopisać: „Pole „Stan” w ustaleniu opisuje stan wymagania, którego dotyczy; pewność ustalenia (kod / runtime / pomiar operatora) — w nawiasie”; (c) przepisać stany ustaleń-luk: RUN-04, RUN-05, RUN-06 → „brak (pewność: runtime)”, RUN-07 → „brak (runtime; defekt funkcjonalny)”, RUN-09 → „częściowe (runtime dla `/login`, `/forgot-password`; `/register` niezweryfikowane)”, RUN-11 → „brak (runtime + kod)”, MIN-03 → „brak (kod)”, MIN-11 → „częściowe (kod)”, DOW-18 → „brak (kod)”, RET-08 i AI-04 → „częściowe (kod)”; RUN-01, RUN-02, RUN-10 (zachowanie zgodne) mogą pozostać „potwierdzone (runtime)”. Wariant minimalny, jeśli redakcja całości jest zbyt duża: tylko (a) i (b) oraz zdanie w README § 1, że stan wymagania wiąże wyłącznie w `05`.

### R6a-U03 — README (+ `05`) — istotna — poziom dowodu w streszczeniu zawyżony

- **Miejsce:** README § 2 pkt 1 i pkt 4, § 3 wiersze 3 i 13; `05` WYM-36 kolumna „Dowód” („RUN-08, runtime + kod”), § 12.2 poz. 3.
- **Problem:** (1) README pkt 4: „Test runtime wykazał … przekazywanie nagłówków przeglądarki z ciasteczkami przez proxy telemetrii”. `A4` RUN-08 ma stan „częściowe”: wejście syntetycznego ciasteczka do `/ingest` i `/monitoring` potwierdzone w runtime, przekazanie dostawcy tylko z kodu Next.js i `@sentry/nextjs`, na łączu nieobserwowane (sinkhole zapisuje tylko host i metodę — `narzedzia/sinkhole-proxy.mjs:5-7`; strony za logowaniem nietestowane). To ustalenie jest podstawą decyzji D-16 (czy zgłaszać naruszenie) i bramki A14, więc poziom dowodu ma znaczenie. (2) README pkt 4 i ryzyko #13 podają stan panelu PostHog („włączone nagrania”, „2 nagrania”) bez oznaczenia [PR225 @a72b567], choć README § 5 deklaruje takie oznaczanie. (3) README pkt 1 i ryzyko #1: „ścieżka operatora przerywa się na wyzwalaczu” — mechanizm potwierdzony na schemacie syntetycznym; stan wyzwalaczy produkcji niezweryfikowany (`05` § 12.3 poz. 3, N-A2-01, D-06).
- **Wymagana zmiana:** README pkt 4: „Test runtime wykazał sesje Sentry i fonty Google przed decyzją oraz to, że ciasteczka przeglądarki trafiają do proxy telemetrii; z kodu Next.js wynika, że proxy przekazuje je dalej dostawcom (na łączu nieobserwowane — `A4` RUN-08, stan częściowe)”; „Panel PostHog ma włączone nagrania … [PR225 @a72b567]”; pkt 1: dopisać „(potwierdzone na schemacie syntetycznym; wyzwalacze produkcji — odczyt D-06)”; `05` WYM-36 „Dowód”: „RUN-08 — wejście: runtime, przekazanie: kod”.

### R6a-U04 — README, `10-REVIEW.md` — istotna — zamknięcie ogłoszone przed review kompletności

- **Miejsce:** README tabela nagłówkowa („Stan: etap badawczy zakończony”, „Kontrola: … całość po review kompletności R6a/R6b”), § 1 wiersz `recenzje/` („pełne recenzje R1–R6”); `10-REVIEW.md` nagłówek („R6a, R6b” w `recenzje/`), § 4 („W toku”).
- **Problem:** pkt 7 wymaga zakończenia niezależnym review kompletności. § 4 jest pusty, plików R6a/R6b nie ma w `recenzje/`, a README już ogłasza zakończenie etapu.
- **Wymagana zmiana:** do czasu naniesienia R6: README „Stan: etap badawczy — w końcowym review kompletności (R6a, R6b)”. Po naniesieniu: `10-REVIEW.md` § 4 — tabela jak w § 3 (recenzja, pliki, werdykt, kontrole/nieudane, uwagi istotne/drobne, naniesione/odrzucone, kto naniósł — osoba inna niż autor README/`10-REVIEW`), kopie `R6a.md`, `R6b.md` w `recenzje/`, wpisy R6 w „Historii recenzji” poprawionych plików; dopiero wtedy README „zakończony”. Jeśli poprawki zmienią liczby w README § 2 (stany 1/44/36/4), przeliczyć.

### R6a-U05 — `03`, `08` — istotna — materiały UODO bez dalszej ścieżki

- **Miejsce:** `03` § 2.3 (zdanie „UODO publikuje też poradniki … do uzupełnienia w review”); `08` § 4.2 część E (wiersz „poradniki UODO, formularz zgłaszania naruszeń” — tylko WYM-52); N-38.
- **Problem:** pkt 4 wymienia wprost materiały **UODO** dot. privacy by design/default, zgód, ról stron, dostępu i usuwania. Rejestr ma tylko wykaz operacji wymagających DPIA (ZR-20) i trzy decyzje (ZR-21). Ograniczenie jest jawne, ale ścieżka do końcowego review obejmuje wyłącznie procedurę naruszeń — prawnik nie dostaje listy tematów UODO do sprawdzenia.
- **Wymagana zmiana:** w `08` § 4.2 E dodać wiersz: „Poradniki i stanowiska Prezesa UODO: privacy by design/default; zgoda; administrator a podmiot przetwarzający i umowa powierzenia; prawo dostępu; usuwanie i okresy przechowywania | tytuły, daty, wersje — odszukać i odczytać | WYM-30, WYM-13, WYM-11, WYM-01, WYM-41, WYM-20, WYM-24, WYM-71 | odpowiednie Q-NN”; rozszerzyć N-38 o te tematy; w `03` § 2.3 zastąpić „do uzupełnienia w review” odesłaniem do tego wiersza.

### R6a-U06 — `03` — drobna — rejestr źródeł nie wymienia odczytanych dokumentacji dostawców

- **Miejsce:** `03` ZR-81 (`:307`), kolumna „Weryfikacja” („niesprawdzane w tym pliku”).
- **Problem:** 10.10 odczytano DOK-1–DOK-12 (`04` § 8.2: DPA, Commercial Terms i Privacy Policy Anthropic, dokumentacja Sentry i PostHog, DPA PostHog, Turnstile, compose Supabase, Coolify, MinIO); rejestr źródeł (produkt z pkt 7) tego nie pokazuje.
- **Wymagana zmiana:** ZR-81 „Weryfikacja”: „częściowo ODCZYT 10.10.2026 — DOK-1–DOK-12 (`04` § 8.2); nieodczytane: Stripe, Resend, Hetzner, Google (Fonts, OAuth), Slack, Telegram, Cloudflare Email Routing, Healthchecks, HIBP, lista DPF (`04` § 8.3)”.

### R6a-U07 — `07` — drobna — E-00 zapowiada PR kodu bez pól karty

- **Miejsce:** `07` § 3, E-00, „Zasady zapisu” („Sam skrypt odczytów to mały PR kodu (S) wykonywany na początku E-00”).
- **Problem:** jedyny PR kodu w planie bez „Test czerwony”, „Migracje”, „Wycofanie”, „Po wdrożeniu” (§ 0.5; pkt 7 zadania).
- **Wymagana zmiana:** dopisać w E-00: „Migracje: brak. Test czerwony: `tests/unit/ops-odczyty-format.test.ts` — wynik skryptu zawiera tylko liczby i stany, bez wzorców e-mail/NIP/PESEL/IP — przed: czerwony (brak skryptu). Wycofanie: revert PR; zapisy decyzji zostają. Po scaleniu: pierwszy przebieg skryptu przez sesję lokalną, z datą”.

### R6a-U08 — README, `07`, `08`, `09`, `A1` — drobna — kolizje przestrzeni nazw ID

- **Miejsce:** README § 4 pkt 1 („(D-16)”); `07` § 3 (D-01–D-16), § 8.1 A14; `08` § 2.8 (D-01–D-16 obok D-25); `09` § 8.3 (D-NN z `02`) i § 11.2 (D-NN z `A1`); `A1` tabele deklaracji (D-, P-, R-).
- **Problem:** „D-NN” ma trzy znaczenia: kategorie danych `02` (D-01–D-31), deklaracje strony RODO `A1`/`09` (D-01–D-12), decyzje E-00 `07` (D-01–D-16). README „(D-16)” wskazuje decyzję o RUN-08, a w `02` D-16 to „Rozmowy z supportem AI”. Podobnie P-NN (`A1` deklaracje polityki vs `A3` § 9 pytania) i R-NN (`A1` regulamin vs `04` odbiorcy). Odwołania w plikach są poprawne w kontekście, ale ID nie jest jednoznaczne poza plikiem.
- **Wymagana zmiana:** minimalnie — w README i w `07` § 8.1 pisać „`07` D-16”; docelowo nadać decyzjom E-00 prefiks „DEC-NN” (zmiana w `07`, `08` § 2.8, § 3.11, README) i oznaczyć deklaracje w `A1`/`09` § 11 jako „RODO-NN”, „POL-NN”, „REG-NN”.

## 4. Ocena końcowa

**Werdykt: kompletny z uwagami.** Każdy element `00-ZADANIE.md` (pkt 1–7, w tym każde zdanie pkt 5.A–5.G i wszystkie wymogi pkt 6) ma w audycie ustalenie z dowodem albo jawne ograniczenie oraz dalszą ścieżkę (etap E-NN, decyzję D-NN, niewiadomą N-NN albo pytanie Q-NN). Na 119 wierszy tabeli pokrycia 112 ma status „pokryte” (część z jawnym ograniczeniem), 7 — „częściowo”, żaden — „brak”.

Mocne strony, sprawdzone liczbowo: pełna spójność odwołań (ok. 1580 unikalnych odwołań w `05`, `07`, `08`, README — 0 martwych), pokrycie 159/159 ustaleń kartami planu i 85/85 wymagań macierzą, bramka A obejmująca 47/47 wymagań z ryzykiem „K1 W”, kompletny indeks niewiadomych (41 N, 44 Q, każde ze ścieżką do etapu), karty planu z akceptacją, migracją, wycofaniem i czerwonym testem albo dowodem organizacyjnym, rzetelne oznaczanie poziomu dowodu ([NZ], [PR225]) w raportach szczegółowych, kod dowodów ryzyk wysokich zgodny z `3e5e00d` (11/11).

Braki nie podważają wniosków ani kolejności zmian. Dotyczą: wierności naniesienia jednej recenzji (R6a-U01), słownika stanów w plikach ustaleń (U02), poziomu dowodu w streszczeniu (U03), formalnego zamknięcia bramki kompletności (U04) i ścieżki dla materiałów UODO (U05). Uwag blokujących brak. Po naniesieniu U01–U05 (U06–U08 opcjonalnie) i wypełnieniu `10-REVIEW.md` § 4 bramka kompletności może zostać uznana za przeszłą bez ponownej recenzji całości. Wystarczy kontrola, że teksty z sekcji 3 trafiły we wskazane miejsca.

## 5. 10 najważniejszych ryzyk według R6a

Kolejność R6a: skutek dla osób i dla wiarygodności usługi, przy założeniu, że pierwszy klient może pojawić się przed zamknięciem niewiadomych.

| # | Ryzyko | ID | Dlaczego w tym miejscu (różnice wobec `05` § 12.2) |
|---|---|---|---|
| 1 | Usunięcie konta niekompletne; ścieżka operatora przerywa się na wyzwalaczu audytu po częściowych skutkach | WYM-24, WYM-73; PRA-02, PRA-03, DOW-06 | jak w `05` — jedyna ścieżka dla żądań e-mailowych |
| 2 | Ciasteczka sesji pierwszej strony przekazywane przez proxy do Sentry (zawsze) i PostHog (po zgodzie) | WYM-36, WYM-09; RUN-08 | poświadczenia sesji u osób trzecich i możliwy obowiązek oceny naruszenia (D-16); dowód: kod + wejście w runtime |
| 3 | `KSEF_ENV=test` na produkcji i domyślne `test` w kodzie | WYM-37, WYM-SOC-3; PRC-17, SOC-25 | R6a wyżej niż `05` (poz. 10): pierwsza prawdziwa faktura trafiłaby do środowiska bez skutku prawnego, z danymi nabywców w testowym KSeF — skutek nieodwracalny i natychmiastowy przy starcie |
| 4 | „Usuń organizację” bez wykonawcy; firma dalej przetwarzana (skrzynka KSeF, AI); brak pełnego eksportu | WYM-45; PRA-04, RET-04, RET-11, SOC-29 | obietnica w UI wprost niewykonana |
| 5 | Brak pełnej kopii obu baz i MinIO poza hostem; jedna próba odtworzenia | WYM-51, WYM-SOC-2; SOC-21, SOC-22, DOW-22 | utrata hosta = utrata danych wszystkich klientów |
| 6 | Brak umowy powierzenia i listy dalszych procesorów | WYM-41, WYM-43; ZGD-02, PRC-05 | warunek legalnej sprzedaży B2B od pierwszego klienta |
| 7 | Polityka bez administratora i z nieprawdziwymi deklaracjami (lokalizacje, SCC, audyt dostępu, cookies) | WYM-18, WYM-19; ZGD-03, ZGD-12, PRC-01–PRC-03 | publiczne, działa dziś niezależnie od liczby klientów |
| 8 | Automatyczne wysyłanie danych sprzedawców (w tym NIP JDG) i dokumentów do modelu w USA bez wyboru klienta, informacji i TIA | WYM-62, WYM-42, WYM-60; AI-01, PRC-06, ZGD-08 | dane osób trzecich poza EOG bez działania użytkownika |
| 9 | Agenci AI z dostępem do produkcji poza listą procesorów; odczyty operatora bez śladu; brak przeglądów dostępów | WYM-47, WYM-35, WYM-X-02; PRC-07, DOW-08, DOW-05, SOC-07–SOC-09 | R6a wyżej niż `05` (poz. 12): przy publicznym repo i sesjach agentów z kluczem SSH dane produkcyjne mogą trafić do kontekstu agenta albo do repo — nieodwracalnie (bramka A22) |
| 10 | Brak okresów i wykonawców retencji dla większości danych; po odtworzeniu z kopii wracają dane usunięte | WYM-08, WYM-71, WYM-72; INW-01, RET-05, RET-06, RET-12, RET-09 | rośnie z każdym dniem działania; WYM-72 zależny od zdarzenia (odtworzenie) |

Tuż za listą: PostHog z nagraniami włączonymi w panelu wbrew kodowi (WYM-34, PRC-09), brak mapy cel → podstawa, LIA i screeningu DPIA (WYM-11, WYM-12, WYM-55), osoby bez konta bez procedury i rejestru żądań (WYM-17, WYM-21, WYM-75), PESEL domyślnie w formularzu (WYM-X-03, MIN-01).

## 6. Co sprawdziłem / czego nie mogłem sprawdzić

**Sprawdziłem:** całe `00-ZADANIE.md`, `BRIEF.md` z ADDENDUM 1–3, README, `01`, `10-REVIEW.md` w całości; `02`–`09`, `A1`–`A4` — nagłówki, sekcje odpowiadające wymaganiom zadania i wszystkie miejsca wskazane w uwagach; `recenzje/R1.md` (uwagi do `01`/`02`); skrypty kontrolne opisane w § 2 (w scratchpadzie R6a, poza repo); kod `3e5e00d` w 11 miejscach (K10) oraz grep: OpenTelemetry, cache Next.js, bazy wektorowe; plik wynikowy testu w `narzedzia/` pod kątem tokenów i adresów.

**Nie sprawdziłem:** produkcji, paneli i umów dostawców; treści przepisów, wytycznych EDPB/UODO i kryteriów AICPA (egress zablokowany, WebSearch odrzucony) — oceniałem tylko oznaczenie [NZ] i ścieżkę do review; recenzji R2–R5b w całości (nie oceniam ich ponownie, tylko skutki w plikach); pełnej treści wszystkich wierszy `05`, `07`, `08`, `09` poza próbkami i kontrolami skryptowymi; wierności naniesienia R2–R5b (sprawdzały ją runda 2 R2 i redaktorzy).
