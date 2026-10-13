# 10 — Dziennik niezależnych recenzji i kontroli kompletności

| | |
|---|---|
| Autor | koordynator (zestawienie; nie ocenia merytorycznie) |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` |
| Pełne recenzje | `recenzje/` (R1, R2-runda1, R2, R3, R4, R5a, R5b, R6a, R6b) oraz brief agentów `recenzje/00-BRIEF-AGENTOW.md` |

## 1. Zasady (pkt 3 zadania)

- Każdy etap — rozpoznanie, research, inwentarz, analiza luk, plan — przeszedł
  recenzję agenta, który **nie** był jego autorem. Recenzent dostawał
  pierwotne wymagania (`00-ZADANIE.md`), brief z granicami
  (`recenzje/00-BRIEF-AGENTOW.md`) i materiały źródłowe; sprawdzał tezy
  w kodzie (kontrole punktowe `plik:linia`), luki i sprzeczności.
- Recenzent nie edytował recenzowanych plików. Poprawki nanosił ktoś trzeci:
  dla R1 i R2 koordynator (który nie był autorem tych etapów — wyjątek: `01`,
  gdzie koordynator jest autorem, a zatwierdzenie należy do R1), dla R3, R4,
  R5a i R5b osobne agenty-redaktorzy. Redaktor najpierw weryfikował uwagę
  w kodzie i mógł ją odrzucić z uzasadnieniem.
- Autor nie zatwierdzał własnego etapu. Koordynator nie zatwierdza żadnej
  bramki — stan bramki wynika z werdyktu recenzenta i z naniesienia uwag.
- Każdy poprawiony plik ma na końcu sekcję „Historia recenzji” (`README.md` i ten plik — zmiany opisane w § 4).

## 2. Bramki etapów

Legenda stanu bramki: **przeszła** — werdykt recenzenta „zatwierdzony” albo
„zatwierdzony z uwagami” po naniesieniu uwag; **przeszła po poprawkach** —
werdykt „wymaga poprawek”, wszystkie uwagi naniesione albo odrzucone
z uzasadnieniem, bez uwag blokujących; ponowna recenzja całości nie była
wymagana przez recenzenta. **Kontrole (nieudane)**: liczba kontroli punktowych
recenzenta; „nieudane” = częściowe + obalone + nieaktualne (definicja
ujednolicona po R6b-U13).

| Etap | Plik | Autor | Recenzent | Werdykt | Kontrole (nieudane) | Uwagi (istotne / drobne) | Naniesione / odrzucone | Kto naniósł | Bramka |
|---|---|---|---|---|---|---|---|---|---|
| Rozpoznanie | `01` | koordynator | R1 | wymaga poprawek | 20 (8) | 10 (6 / 4) | 10 / 0 | koordynator (tekst recenzenta) | przeszła po poprawkach |
| Inwentarz, przepływy, role | `02` | agent INWENTARZ | R1 | wymaga poprawek | 25 (3) | 14 (6 / 8) | 14 / 0 — w tym R1-U13, U15, U20, U24 naniesione przez koordynatora niepełnie i uzupełnione po R6a-U01 13.10.2026 | koordynator; uzupełnienie: redaktor R6 | przeszła po poprawkach (po R6) |
| Research źródeł, katalog WYM | `03` | agent ŹRÓDŁA | R2 (runda 1 i 2) | z uwagami → z uwagami | 21 (2) → 22 (1) | 11 (1 / 10) → 6 (0 / 6) | 17 / 0 | koordynator | przeszła |
| Procesorzy i lokalizacje | `04` | agent PROCESORZY | R2 (runda 1 i 2) | wymaga poprawek → z uwagami | 27 (5) → 28 (3) | 9 (3 / 6) → 10 (1 / 9) | 19 / 0 | koordynator | przeszła |
| Minimalizacja, zgody, cookies (kod) | `A1` | agent MECHANIZMY-A | R3 | z uwagami | 27 (3) | 11 (wg R3) | 11 / 0 | redaktor R3 | przeszła |
| Prawa osób, retencja, AI | `A2` | agent MECHANIZMY-B | R3 | wymaga poprawek | 27 (4) | 10 (wg R3) | 10 / 0 | redaktor R3 | przeszła po poprawkach |
| Test runtime cookies i sieci | `A4` + `narzedzia/` | agent RUNTIME | R3 | z uwagami | 22 (1) + powtórzony skrót testu | 5 (wg R3) | 5 / 0 | redaktor R3 | przeszła |
| Dowody, testy, ślady audytowe | `A3` | agent DOWODY | R4 | z uwagami | 32 (5) + powtórzony przebieg 49 plików testów | 15 (wg R4) | 15 / 0 (1 częściowo) | redaktor R4 | przeszła |
| SOC 2 | `06` | agent SOC2 | R4 | wymaga poprawek | 38 (8) | 19 (wg R4) | 19 / 0 (1 częściowo) | redaktor R4 | przeszła po poprawkach |
| Analiza luk (macierz) | `05` | agent MACIERZ | R5a | z uwagami | 32 (3, łącznie z `07`) | zob. § 3 | wszystkie | redaktor R5a | przeszła |
| Plan etapów | `07` | agent PLAN | R5a | wymaga poprawek | (łącznie z `05`) | zob. § 3 | wszystkie | redaktor R5a (+ R5b dla propozycji E-00) | przeszła po poprawkach |
| Niewiadome i review prawne | `08` | agent NIEWIADOME | R5b | z uwagami | 42 (7, łącznie z `09`) | zob. § 3 | wszystkie | redaktor R5b | przeszła |
| Materiały robocze | `09` | agent MATERIAŁY | R5b | wymaga poprawek | (łącznie z `08`) | zob. § 3 | wszystkie | redaktor R5b | przeszła po poprawkach |
| Podsumowanie i dziennik | `README.md`, `10-REVIEW.md` | koordynator | R6a, R6b | kompletny z uwagami | zob. § 4 | zob. § 4 | wszystkie | koordynator (autor plików — odstępstwo od R6a-U04); wierność sprawdził niezależny weryfikator (`recenzje/R6-weryfikacja.md`), braki uzupełnione | przeszła po poprawkach (z odstępstwem) |

Liczby uwag w grupach R1–R4 (wszystkie pliki grupy): R1 — 24 (12 istotnych,
12 drobnych), R2 runda 1 — 20 (4 / 16), R2 runda 2 — 16 (1 / 15), R3 — 23
(10 / 13), R4 — 32 (6 / 26). Uwag blokujących nie zgłosił żaden recenzent.

## 3. Recenzja syntezy (R5a, R5b)

| Recenzja | Pliki | Werdykt | Kontrole (nieudane) | Uwagi (istotne / drobne) | Naniesione / odrzucone |
|---|---|---|---|---|---|
| R5a | `05`, `07` | `05` z uwagami; `07` wymaga poprawek | 32 (3) | 11 (4 / 7) | 11 / 0 — redaktor R5a, 13.10.2026 |
| R5b | `08`, `09` | `08` z uwagami; `09` wymaga poprawek | 42 (7) | 20 (4 / 16) | 20 / 0 — redaktor R5b, 13.10.2026 (U17 trafna częściowo: część miejsc już poprawna) |

Najważniejsze uwagi R5a: niekompletna bramka „przed pierwszym klientem”
(pominięte wymagania o wysokim ryzyku od pierwszego klienta), dwa ustalenia
(DOW-10, SOC-34) bez karty etapu, ocena RUN-08 (ciasteczka sesji
u dostawców telemetrii) zamknięta w etapie czekającym na inne decyzje,
stan WYM-29. Najważniejsze uwagi R5b: wątek współadministrowania z PostHog
przez `/ingest` pominięty w `08`; w `09` stany spoza pięciu wartości, brak
pozycji retencji poświadczeń i sesji KSeF, wstępna ocena DPIA przedstawiona
jak ustalenie.

Skutki poprawek: bramka A w `07` § 8 objęła wszystkie wymagania z ryzykiem
„wysokie od pierwszego klienta” (47) — każde ma etap albo uzasadnienie;
pokrycie kart planu: 159/159 ustaleń i 85/85 wymagań (skrypt redaktora);
nowa decyzja D-16 w E-00 (ocena, czy przekazywanie ciasteczek sesji
dostawcom telemetrii — RUN-08 — jest naruszeniem); WYM-29 „częściowe”;
w `09` stany ujednolicone, dodana pozycja retencji RT-KSEF, ocena DPIA
oznaczona jako wstępna (do review: Q-05, Q-38).

## 4. Końcowe review kompletności (R6a, R6b)

| Kontrola | Zakres | Werdykt | Kontrole (nieudane) | Uwagi (istotne / drobne) | Naniesione / odrzucone | Kto naniósł |
|---|---|---|---|---|---|---|
| R6a — pokrycie zadania | całość: każdy punkt `00-ZADANIE.md` (pkt 1–7) → miejsce, dowód lub ograniczenie, dalsza ścieżka; spójność ID | kompletny z uwagami | 36 (8); tabela pokrycia 119 wierszy, 7 „częściowo” | 8 (5 / 3) | 8 / 0 (U08 w wariancie minimalnym: kwalifikacja „`07` D-NN” zamiast zmiany prefiksów) | redaktor R6; w `README`/`10-REVIEW` — koordynator |
| R6b — adwersaryjna kontrola dowodów | całość: 42 tezy sprawdzone w kodzie (w tym wszystkie o ryzyku wysokim), sprzeczności, nadinterpretacje, higiena repo, narzędzia, brak zmian kodu | kompletny z uwagami | 42 (6: 5 częściowych, 1 obalona — teza o domyślnym `KSEF_ENV=test`) | 16 (2 / 14) | 16 / 0 (U14: w tym etapie tylko ostrzeżenie w `A4` § 6; poprawka skryptów — etap wykonawczy) | redaktor R6; U02, U03, U13, U15 — koordynator |
| Weryfikacja naniesienia R6 | wszystkie 24 uwagi R6 we wszystkich plikach, grep pozostałości błędnych tez, 13 zmienionych miejsc porównanych z kodem | naniesione z brakami: 20 w całości, 4 częściowo (wszystkie 4 w plikach koordynatora); 8 pozostałości tez w plikach zależnych; 5 nowych drobnych problemów | 12 z 13 miejsc zgodnych z kodem | — | wszystkie braki, pozostałości i nowe problemy uzupełnione 13.10.2026 (miejsca **[R6-wer]**) | koordynator — bez ponownej weryfikacji przez kolejnego agenta (ograniczenie, § 5) |

Wynik końcowy: obaj krytycy ocenili całość jako **kompletną z uwagami**;
uwag blokujących nie było. Każdy obszar wskazany w zadaniu ma ustalenie
z dowodem albo jawne ograniczenie i dalszą ścieżkę (etap planu albo
niewiadomą) — tabela pokrycia w `recenzje/R6a.md`. Liczby stanów w macierzy
po poprawkach: 1 / 44 / 36 / 4 / 0 (bez zmian po R6).

Najważniejsze ryzyka według krytyków są zgodne z `05` § 12.2; R6a ocenia
ryzyko jawnego `KSEF_ENV=test` na produkcji wyżej niż macierz (pozycja 3
zamiast 10) — różnica w ocenie, nie w faktach; kolejność w `README` § 3
pozostaje za `05`.

## 5. Odstępstwa od planu workflow i ich skutki

| Odstępstwo | Skutek | Jak ograniczono |
|---|---|---|
| Limit użycia API przerwał agentów 7.10 i dwukrotnie 10.10, a także 11.10 | Przerwani agenci startowali od nowa (z dostępem do własnych szkiców); część pracy powtórzono | Od 10.10 agenci po dwóch naraz, zapisy przyrostowe, commity po każdej fazie |
| Recenzent R2 uruchomił się ponownie po naniesieniu rundy 1 | Powstała runda 2: kontrola wierności poprawek koordynatora i 16 nowych uwag | Runda 1 zachowana (`recenzje/R2-runda1.md`); obie rundy naniesione |
| Recenzje grupowe zamiast osobnych dla każdego pliku (R1–R4) | Recenzent oceniał 2–3 pliki naraz | Werdykt i kontrole punktowe osobno dla każdego pliku |
| Koordynator naniósł poprawki R1 i R2 | Koordynator jest autorem `01` | Naniesiony tekst recenzenta bez własnych wniosków; wierność sprawdziła runda 2 R2 dla `03`/`04`, a dla `01`/`02` — krytycy R6. **Wynik:** R6a-U01 wykazał, że w `02` uwagi R1-U13, U15, U20 i U24 naniesiono tylko częściowo (stany w sekcjach szczegółowych, klasa INW-16, mapy § 5.1 i § 5.7); uzupełnił je redaktor R6 13.10.2026. R6b sprawdził wyrywkowo R1-U01, U02, U09, U13, U14, U20, U22 — obecne w treści (`01`:54,57,58,64; `02`:119,152,494,531-540); R6b nie sprawdzał map § 5.1 i § 5.7, w których R6a-U01 wykazał braki U13 i U20 |
| Wierność poprawek redaktorów R3–R5b nie była ponownie recenzowana | Redaktor mógł nanieść poprawkę w jednym pliku bez przeniesienia jej do plików zależnych | Sprawdzone tylko wyrywkowo przez R6b; R6b-U01 (`KSEF_ENV` poprawione w `04`, nie w `05`/`06`/`07`/`README`) i R6b-U05 (Sentry bez identyfikatora użytkownika poprawione w `A2`, nie w `02`) pokazały takie przypadki — poprawione po R6; naniesienie 24 uwag R6 sprawdził niezależny weryfikator (`recenzje/R6-weryfikacja.md`: 20 w całości, 4 częściowo — uzupełnione) |
| Poprawki do `README.md` i `10-REVIEW.md` naniósł ich autor (koordynator) | Odstępstwo od R6a-U04, który wymagał naniesienia przez kogoś innego niż autor | Naniesiony tekst krytyków; wierność sprawdził niezależny weryfikator R6, a jego uwagi B-01–B-06 koordynator uzupełnił — bez kolejnej weryfikacji |
| Pozostałości wskazane przez weryfikatora R6 uzupełnił koordynator | Koordynator nie jest autorem tych plików (poza `README`/`10-REVIEW`), ale po tych zmianach nie było kolejnej niezależnej kontroli | Zmiany ograniczone do tekstu podanego przez weryfikatora, oznaczone **[R6-wer]**; do sprawdzenia przy pierwszym etapie wykonawczym albo przez prawnika |
| Właściciel odrzucił WebSearch; egress do źródeł prawa i AICPA zablokowany | Źródła pierwotne nieodczytane | Wszystkie takie pozycje oznaczone [NZ]; lista do potwierdzenia w `08` |
