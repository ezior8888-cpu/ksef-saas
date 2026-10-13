# R6 — Weryfikacja naniesienia uwag końcowego review kompletności (R6a, R6b)

| | |
|---|---|
| Rola | niezależny weryfikator naniesienia; nie jestem autorem żadnego pliku audytu, krytykiem R6a/R6b ani redaktorem poprawek; plików audytu nie edytowałem |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (odczyty kodu w drzewie roboczym; poza `docs/audyt/` brak zmian) |
| Stan plików audytu | `README.md` i `10-REVIEW.md` — commit `741a680` (naniósł koordynator, autor tych plików); `02`, `03`, `05`–`09`, `A1`–`A4` — zmiany niezacommitowane redaktora R6 (`git diff HEAD`, 11 plików, +253/−158) |
| Punkt odniesienia | tekst „Wymagana zmiana” z `recenzje/R6a.md` § 3 (U01–U08) i `recenzje/R6b.md` § 6 (U01–U16); `00-ZADANIE.md`; `BRIEF.md` z ADDENDUM 1–3 |
| Metoda | (1) każda uwaga → każde wskazane miejsce → odczyt bieżącej treści z numerem linii; (2) grep po całym katalogu tez uznanych przez R6a/R6b za błędne; (3) kontrola wyrywkowa zmienionych miejsc względem kodu na `3e5e00d` (13 miejsc) |
| Ograniczenia | bez dostępu do produkcji, paneli i umów; bez WebSearch i bez sieci; nie oceniam merytorycznie przepisów — tylko zgodność naniesienia z tekstem uwag i z kodem |

Oznaczenie wyniku: **tak** — wymagana zmiana jest we wszystkich wskazanych miejscach; **częściowo** — brakuje części zmiany albo miejsca; **nie** — zmiany brak.

## 1. Tabela naniesienia

| Uwaga | Pliki | Naniesiona | Dowód (plik:linia) |
|---|---|---|---|
| R6a-U01 | `02`, `10-REVIEW` | **częściowo** (drobne) | stany przepisane z tabeli § 6: `02:527` (INW-07), `:551` (INW-10), `:559` (INW-11), `:572` (INW-13), `:595` (INW-16, też „Klasa: I, P”), `:602` (INW-17), `:620` (INW-19) — zgodne z `02:463-475`; § 5.1 węzeł `SLOG` z krawędzią od `DB` `02:260`, nota `:263-267`; § 5.7 etykieta „pg_dump bazy postgres + role (bez _supabase), domyślnie 14 zrzutów (KEEP)” `02:437`, węzeł `_supabase` „brak kopii” `:438`, nota `:447`; Historia `02:705` (z datą); `10-REVIEW.md:39` — wpis bez daty (wymagano „(data)”) — B-04 |
| R6a-U02 | `A1`–`A4`, README § 1 | **tak** | (a) „brak zgodności” → „brak”: `A1:226,234,235,255,354,362,384,407`; (b) konwencja: `A1:15-20`, `A2:18-20`, `A3:16-18`, `A4:293-297`; (c) `A4:325,333,341` (RUN-04–06), `:349` (RUN-07), `:366` (RUN-09), `:382` (RUN-11); `A1:36,84` (MIN-03), `:44,183` (MIN-11); `A3:559,806` (DOW-18), `:560,824` (DOW-19 — redaktor słusznie poprawił też ID: cytat R6a dotyczył DOW-19); `A2:853` (RET-08), `:1080` (AI-04); README `:35-41`. Uwaga: README rozciąga konwencję na `04` i `06`, gdzie jej nie wdrożono — nowy problem N-01 |
| R6a-U03 | README, `05` | **tak** | README pkt 4 `:66-77` (wejście runtime, przekazanie z kodu, „stan częściowe”; PostHog „[PR225 @a72b567]”); pkt 1 `:52-53` („potwierdzone na schemacie syntetycznym; wyzwalacze produkcji — odczyt `07` D-06”); § 3 #3 `:116`, #13 `:126`; `05:103` WYM-36 „RUN-08 — wejście: runtime, przekazanie: kod; na łączu nieobserwowane”; `05:504` (§ 12.2 #3) |
| R6a-U04 | README, `10-REVIEW` | **częściowo** | zrobione: README „Stan” `:5` („synteza gotowa; poprawki po końcowym review kompletności (R6a, R6b) w toku”); `recenzje/R6a.md`, `R6b.md` istnieją; wpisy R6 w „Historii recenzji” 11 plików (`02:705`, `03:632`, `05:644`, `06:784`, `07:3266`, `08:830`, `09:991`, `A1:631`, `A2:1287`, `A3:993`, `A4:520`). Brak: `10-REVIEW.md:83` § 4 nadal „W toku” (bez tabeli) — B-01; „kto naniósł” dla README/`10-REVIEW` to autor (`10-REVIEW.md:51` „koordynator”), wbrew „osoba inna niż autor” — B-02; README i `10-REVIEW` bez „Historii recenzji”, choć `10-REVIEW.md:24` twierdzi, że ma ją każdy poprawiony plik — B-03 |
| R6a-U05 | `03`, `08` | **tak** | `08:528` wiersz w § 4.2 E (pod nagłówkiem `08:519`) z tematami, WYM-30, -13, -11, -01, -41, -20, -24, -71 i Q-NN; N-38 rozszerzone `08:137`; `03:167-170` odesłanie zamiast „do uzupełnienia w review” |
| R6a-U06 | `03` | **tak** | `03:310` ZR-81 „częściowo ODCZYT 10.10.2026 — DOK-1–DOK-12 … nieodczytane: Stripe, Resend, Hetzner, Google…”; drobna nieścisłość co do DOK-4 — N-03 |
| R6a-U07 | `07` | **tak** | `07:298-303` (Migracje: brak; test czerwony `tests/unit/ops-odczyty-format.test.ts`; Wycofanie: revert; „Po scaleniu”) |
| R6a-U08 | README, `07`, `08`, `09`, `A1` | **tak** (wariant minimalny) | README `:38-41`, `:138` („`07` D-16”); `07:313`, `:2959`, `:2968-2983` („`07` D-NN” w § 8.1); `08:188` i § 2.8 `08:194-219`; wariant docelowy (DEC-NN) odłożony jawnie w Historii `07:3266`, `08:830` |
| R6b-U01 | README, `05`, `06`, `07` | **tak** | README pkt 7 `:88-94`, § 3 #10 `:123`; `05:104` (WYM-37: pliki fail-closed, `?? 'test'` jako decyzje poboczne), `:213` (WYM-SOC-3), `:511` (§ 12.2 #10); `06:424` (PI1.4), `:576` (SOC-25); `07:139` (§ 1.1), `:206` (§ 2), `:735-808` (E-10: tytuł, cel, zakres, zmiany, test czerwony „produkcja + `KSEF_ENV=test` bez trybu pokazowego”, pusta zmienna jako test-strażnik zielony przed i po, akceptacja), `:2968` (A5), `:3220` (§ 13). Kod potwierdza (§ 4 niżej) |
| R6b-U02 | README, `10-REVIEW` | **częściowo** | jak R6a-U04: README `:5` zmienione; `10-REVIEW.md:83` § 4 „W toku” — B-01 |
| R6b-U03 | README | **tak** | `README.md:66-73` — treść zgodna z wymaganą (`next.config.ts:140-155,189`; `proxy-request.js:29-41`; wyjście nieobserwowane; ciasteczka sesji — wniosek z kodu) |
| R6b-U04 | README, `05` | **tak** | README `:73-77` (PostHog [PR225 @a72b567]; „poza EOG (USA lub „global” — geografia nieodczytana)”), `:124` (#11), `:126` (#13), `:128` (#15); `05:512` (#11), `:514` (#13), `:516` (#15). Pozostałości w innych plikach — § 3 (R-04, R-06) |
| R6b-U05 | `02` | **tak** | `02:74` D-23 „bez identyfikatora użytkownika (helpery `sentry-context.ts:23-63` bez wywołań — R3-U12 …); `tenantId` w tagach/`extra`”. Ta sama teza została w `04:46` R-03 — § 3 (R-01) |
| R6b-U06 | `06` | **tak** | `06:459` — zakres zrzutu (`db-backup.sh:77`) i snapshotu bez 4 tabel (`snapshot-tables.ts:15-20`); bez MinIO, `_supabase`, sekretów |
| R6b-U07 | `05`, `08` | **tak** | `05:124` WYM-65 („odmowa na tym samym poziomie, tej samej wielkości i jednym kliknięciem”; kontrast do oceny, `08` Q-45); `08:291` Q-45, `08:9`, `:256-258`, § 3.10–4.4. Pozostałości: `A1:228`, `09:806` — § 3 (R-05) |
| R6b-U08 | `09` | **tak** | `09:232` (DS-04), `:233` (DS-05 + art. 87, `08` Q-28 — Q-28 zawiera art. 87, `08:319`), `:234` (DS-06), `:237` (DS-09) — „wg wstępnej oceny — do potwierdzenia (`08` Q-05, Q-38)” |
| R6b-U09 | `03`, `05` | **tak** | `03:10`, `03:30`; `05:11` |
| R6b-U10 | `A2` | **tak** | `A2:554-556` („oznaczonego w kodzie jako odroczony (`scripts/check-env.ts:132-134`; … N-A2-03)”) |
| R6b-U11 | `02`, `A3` | **tak** | `02:53` D-02 („pseudonimizacja … — nie anonimizacja”); `A3:423` T-03; dodatkowo `A3:112` (ADR 0006). Pozostałe użycia „anonimizacji” — § 3 (R-02) |
| R6b-U12 | `06`, `05` | **tak** | `06:230`, `06:550`, `05:190` — uogólnione; propagacja: `A3:83`, `A3:645`, `07:2676`, `09:598`. Ale `09:598` umieszcza zdanie w wierszu „Sentry”, a `recenzje/R4.md:106` i `recenzje/R6b.md:127` zachowują szczegóły per konto — N-04 |
| R6b-U13 | `10-REVIEW` | **tak** | legenda `10-REVIEW.md:32-34`; `01` → 20 (8) `:38`, `02` → 25 (3) `:39` |
| R6b-U14 | `narzedzia/*`, `A4` | **tak** | ostrzeżenie `A4:411-420` w § 6 (pkill `uruchom-test-runtime.sh:65`, `OUT` `test-cookies-i-sieci.mjs:54`, ścieżki lokalne); skrypty bez zmian — zgodnie z uwagą („etap wykonawczy, nie teraz”) |
| R6b-U15 | `10-REVIEW` | **częściowo** | `10-REVIEW.md:92-93` — zakres sprawdzenia i odstępstwo dopisane, ale: błędne ID „R6a-U05” zamiast „R6b-U05” (R6a-U05 dotyczy materiałów UODO, nie propagacji) i zdanie „końcowy weryfikator R6 sprawdził naniesienie wszystkich uwag R6 (§ 4)” zapisane przed weryfikacją, przy pustym § 4 — B-05; niewyjaśniona sprzeczność R6b („U13, U20 naniesione”) z R6a-U01 („U13, U20 częściowo”) w `:92` — B-06 |
| R6b-U16 | `05`, `09` | **tak** | `05:10`, `09:14` (`recenzje/R1.md` … `R4.md`). Ta sama wzmianka została w `07:10`, `08:10`, `08:779` — N-02 |

**Wynik:** 24 uwagi — 20 naniesionych (**tak**), 4 częściowo (R6a-U01, R6a-U04, R6b-U02, R6b-U15), 0 nienaniesionych. Wszystkie braki dotyczą plików koordynatora (`README.md`, `10-REVIEW.md`); zmiany redaktora R6 w `02`, `03`, `05`–`09`, `A1`–`A4` są kompletne względem tekstu uwag.

## 2. Braki w naniesieniu — gotowe poprawki

| ID | Plik:linia | Brak | Gotowa poprawka |
|---|---|---|---|
| B-01 | `10-REVIEW.md:81-83` (§ 4); README `:5`, `:9` | R6a-U04 / R6b-U02: § 4 „W toku” — brak wyniku R6 i jego naniesienia; README nie może jeszcze mówić „zakończony” | Zastąpić § 4 tabelą (format jak § 3): <br>`\| Recenzja \| Pliki \| Werdykt \| Kontrole (nieudane) \| Uwagi (istotne / drobne) \| Naniesione / odrzucone \|` <br>`\| R6a \| całość (pkt 1–7 zadania) \| kompletny z uwagami \| 18 kontroli spójności (2 niezgodne: K17, K18; K9 z zastrzeżeniem) + 119 wierszy pokrycia (7 częściowo) \| 8 (5 / 3) \| 8 / 0 — redaktor R6 (02, 03, 07, 08, A1–A4) i koordynator (README, 10-REVIEW); U08 w wariancie minimalnym \|` <br>`\| R6b \| całość (dowody, spójność, higiena, narzędzia) \| kompletny z uwagami \| 42 tezy (6: 5 częściowych, 1 obalona — KSEF_ENV) \| 16 (2 / 14) \| 16 / 0 — redaktor R6 (02, 03, 05–09, A2–A4) i koordynator (README, 10-REVIEW); U14 — tylko ostrzeżenie w A4 § 6, poprawki skryptów odroczone zgodnie z uwagą \|` <br>`\| Weryfikacja naniesienia \| 24 uwagi \| — \| 24 \| — \| 20 tak, 4 częściowo (B-01–B-06 w recenzje/R6-weryfikacja.md); po poprawkach B-01–B-06: wszystkie \|` <br>Po naniesieniu B-01–B-06: README `:5` „etap badawczy zakończony (review kompletności R6a/R6b i weryfikacja naniesienia — `10-REVIEW.md` § 4)”, README `:9` „… całość po review kompletności R6a/R6b i weryfikacji naniesienia (`recenzje/R6-weryfikacja.md`)”. Liczb stanów w README § 2 nie trzeba zmieniać — przeliczone 1/44/36/4/0 (85 wierszy `05`) |
| B-02 | `10-REVIEW.md:51`; § 5 | R6a-U04: „kto naniósł — osoba inna niż autor README/`10-REVIEW`”; naniósł autor (koordynator) | `:51` kolumna „Kto naniósł”: „koordynator (autor plików — odstępstwo od R6a-U04); wierność sprawdził niezależny weryfikator (`recenzje/R6-weryfikacja.md`)”. W § 5 dopisać wiersz: „Koordynator naniósł R6 do własnych plików (README, 10-REVIEW) \| autor poprawia własny tekst \| teksty uwag naniesione dosłownie; niezależna weryfikacja naniesienia — `recenzje/R6-weryfikacja.md`” |
| B-03 | `README.md` (koniec), `10-REVIEW.md:24` | R6a-U04: „wpisy R6 w Historii recenzji poprawionych plików”; README i `10-REVIEW` jej nie mają, a `:24` mówi, że ma ją każdy poprawiony plik | Dopisać w README sekcję „Historia recenzji”: `\| R6a/R6b \| 13.10.2026 \| kompletny z uwagami \| R6a-U02 (§ 1 — stany), R6a-U03 (§ 2 pkt 1, 4; § 3 #3, #13), R6a-U04 / R6b-U02 („Stan”), R6a-U08 („07 D-16”), R6b-U01 (§ 2 pkt 7; § 3 #10), R6b-U03, R6b-U04 (§ 2 pkt 4; § 3 #11, #13, #15) \| naniósł koordynator (autor) \| weryfikacja: recenzje/R6-weryfikacja.md \|`; w `10-REVIEW.md:24` dopisać „(`README.md` i ten plik — zmiany opisane w § 4)” |
| B-04 | `10-REVIEW.md:39` | R6a-U01 (5): „uzupełnione po R6a (data)” — brak daty | „… uzupełnione po R6a-U01 13.10.2026” |
| B-05 | `10-REVIEW.md:93` | R6b-U15: błędne ID; zdanie o weryfikacji zapisane, zanim się odbyła | „R6b-U01 (teza o `KSEF_ENV` poprawiona w `04`, ale nie w `05`/`06`/`07`/README) i R6b-U05 (Sentry bez użytkownika poprawione w `A2`, nie w `02`) pokazały takie przypadki — poprawione po R6; naniesienie 24 uwag R6 sprawdził niezależny weryfikator (`recenzje/R6-weryfikacja.md`: 20 tak, 4 częściowo, uzupełnione …)” |
| B-06 | `10-REVIEW.md:92` | R6b-U15: wynik R6b („R1-U13, U20 naniesione”) stoi obok R6a-U01 („U13, U20 częściowo”) bez wyjaśnienia | „R6b sprawdził wyrywkowo R1-U01, U02, U09, U13, U14, U20, U22 — obecne w treści (`01:54,57,58,64`; `02:119,152,494,531-540`); R6b nie sprawdzał map § 5.1 i § 5.7, w których R6a-U01 wykazał braki U13 i U20” |

## 3. Tezy uznane za błędne — pozostałe wystąpienia (grep po całym katalogu)

Wystąpienia w `recenzje/*` to cytaty recenzentów i nie są liczone, z wyjątkiem higieny (N-04).

| Teza (uwaga) | Wynik grep | Pozostałe wystąpienia i poprawka |
|---|---|---|
| „przy pustej zmiennej kod wybiera środowisko testowe”, „domyślnie wybiera `test`” (R6b-U01) | 0 w plikach syntezy | `04:64` R-11a i `04:306` PRC-17 mówią o kliencie HTTP („`test` przy pustej zmiennej” — `client.ts:49,246`) przy jednoczesnym „uwierzytelnienie i poświadczenia wymagają jawnej wartości” — zgodne z kodem i z rozstrzygnięciem R6b (S1); bez poprawki |
| „nie jest fail-closed” (R6b-U01) | 0 | — |
| „`user.id`” / UUID użytkownika w Sentry (R6b-U05) | 1 | **R-01** `04:46` R-03: „UUID użytkownika (`user` zredukowany do `id`)” → „bez identyfikatora użytkownika (helpery `lib/observability/sentry-context.ts:23-63` bez wywołań — R3-U12; filtr przycina `user` do `id`, gdyby go ustawiono), tag `tenantId`, …”. `09:63` sam wskazuje tę sprzeczność; `05:103` opisuje tylko działanie filtra — poprawne |
| „anonimizacja” wpisów audytu (R6b-U11) | 9 miejsc | **R-02** `02:418` („bez anonimizacji audytu”), `02:458` (INW-02 „audyt bez anonimizacji”), `02:488` („najpierw anonimizuje wpisy”), `A3:183` (L3), `A3:188` (L8), `A3:190` (L10), `A3:677` („wpis, który cron albo anonimizacja usuwa” — funkcja wpisu nie usuwa, tylko nadpisuje `metadata`), `A3:923` (P-05), `08:309` (Q-23) → „pseudonimizacja (funkcja `anonymize_user_audit_logs`)”; w `A3:677` „… zależy od `metadata` wpisu, które cron usuwa razem z wpisem, a pseudonimizacja nadpisuje”. Cudzysłowy „anonimizacja” przy deklaracjach polityki i ADR (`05:105,120`, `03:134,399`, `08:279`) — poprawne |
| „brak zgodności” jako stan (R6a-U02) | 1 | `04:160` PRC-03 „**brak** zgodności” — w ramach N-01 |
| „test runtime wykazał … przekazywanie” (R6a-U03, R6b-U03) | 0 | bez zastrzeżenia poziomu dowodu zostały wnioski z kodu: `05:97` (WYM-09 „proxy telemetrii przekazuje dostawcom ciasteczka sesji”), `05:103` kolumna ryzyka („przekazanie ciasteczek sesji działa niezależnie od zgody”), `06:465` (C1.1) — **R-08**: dopisać „(kod; na łączu nieobserwowane — RUN-08 „częściowe”)” |
| „jedyne źródło odczytane online” (R6b-U09) | 0 bez kwalifikatora | `03:10,30` z kwalifikatorem „prawa i warunków umownych … w tym pliku”; `05:34`, `08:419,705` „[NZ] poza ZR-80” dotyczą źródeł prawa — poprawne |
| „model w USA” (R6b-U04) | 1 | **R-04** `07:2974` (A11) „do USA bez wyboru” → „poza EOG (USA lub „global” — geografia nieodczytana, PRC-06) bez wyboru” |
| „równorzędna odmowa” jako fakt (R6b-U07) | 2 | **R-05** `A1:228` (ZGD-05 „równorzędna odmowa — tak”), `09:806` („Działa: … równorzędna odmowa na pierwszej warstwie”) → „odmowa na tym samym poziomie i tej samej wielkości; słabszy kontrast — do oceny (`08` Q-45)” |
| „kanał e-mailowy trafia do prywatnych skrzynek” (R6b-U04) | 3 | **R-06** `06:597` (SOC-36), `05:277`, `05:434` → „według runbooka do prywatnych skrzynek (konfiguracja niezweryfikowana — PRC-08)” |
| „DPIA niewymagana” bez dopisku (R6b-U08) | 0 | — |
| „niewdrożony Glacier” (R6b-U10), „pełna kopia wszystkich” (R6b-U06) | 0 | — |
| recenzje „w scratchpadzie” (R6b-U16) | 3 | w ramach N-02 |

## 4. Kontrola wyrywkowa zmian redaktora i koordynatora względem kodu (`3e5e00d`)

| # | Miejsce | Teza | Kod | Wynik |
|---|---|---|---|---|
| 1 | `02:447` | zrzut tylko bazy `postgres`; `KEEP` domyślnie 14 | `scripts/hetzner/db-backup.sh:74-77` (`pg_dump … -d postgres`), `:17`, `:41` (`KEEP=${KEEP:-14}`) | zgodne |
| 2 | `02:74` | Sentry bez użytkownika; filtr przycina `user` do `id`; `tenantId` w `extra` | `sentry-context.ts:23,54-58` — tylko definicje (`git grep` bez wywołań); `scrub.ts:48-50`; `inbox-polling.ts:393-396` | zgodne |
| 3 | `02:53`, `A3:423` | pseudonimizacja: zostają `tenant_id`, `entity_id`, `details_json` | `00052_audit_logs_immutable_trigger.sql:95-121` — `UPDATE` tylko `user_id`, `ip_address`, `user_agent`, `metadata` | zgodne |
| 4 | `05:104`, `06:424`, `07:735-746` | główna ścieżka fail-closed przy pustej/błędnej wartości | `claim-environment.ts:6-21` (`null` dla wartości spoza listy), `submit-invoice-full.ts:86`, `session-cache.ts:146`, `ksef-submit-enqueue.ts:200`, `submit-invoice.ts:543-578` (`ENV_MISMATCH`) | zgodne |
| 5 | `07:750-763` | lista `?? 'test'` (decyzje poboczne) | `submit-invoice.ts:628`, `ksef-submit-enqueue.ts:127`, `client.ts:49,246`, `ksef-health-banner.tsx:7`, `api/ksef/health/route.ts:22`, `api/status/components/route.ts:80`, `platform-metrics.ts:37`, `ksef-health-check.ts:24`, `invoice-pdf.ts:197` | zgodne (wszystkie linie trafne) |
| 6 | `05:124`, `08:291` | „Akceptuję” wypełniony (`:73`), „Tylko niezbędne” obramowany (`:80`) | `components/analytics/consent-banner.tsx:73` (`bg-foreground`), `:80` (`border`) | zgodne |
| 7 | `06:459` | snapshot bez 4 tabel | `lib/backup/snapshot-tables.ts:15-20` | zgodne |
| 8 | `A2:554-556` | Glacier „deferred” | `scripts/check-env.ts:132-134` | zgodne |
| 9 | `A4:411-420` | `pkill` i domyślne `OUT` | `narzedzia/uruchom-test-runtime.sh:65`, `narzedzia/test-cookies-i-sieci.mjs:54` | zgodne |
| 10 | README `:66-73` | proxy przekazuje nagłówki | `next.config.ts:140-155` (rewrites `/ingest`), `:189` (`tunnelRoute`); Next.js `proxy-request.js:29-41` | zgodne |
| 11 | `02:263-267` | `DB` = baza `postgres` (public, auth, storage, pgboss) | komentarz `db-backup.sh:74-75` | zgodne |
| 12 | `09:233` | Q-28 obejmuje art. 87 | `08:319` | zgodne |
| 13 | `03:310` | DOK-1–DOK-12 jako „ODCZYT 10.10.2026” | `04:454`: DOK-4 „nie odczyt online, nie umowa” (dokumentacja SDK z narzędzia sesji) | **nieścisłe** — N-03 |

Wynik: 12 z 13 zgodnych z kodem lub źródłem; jedna nieścisłość redakcyjna bez wpływu na wnioski.

## 5. Nowe problemy

| ID | Plik:linia | Problem | Poprawka |
|---|---|---|---|
| N-01 | README `:35-38` (koordynator); `04:160,234,265` | README twierdzi, że konwencja stanów obowiązuje w `02`, `04`, `A1`–`A4`, `06`. W `04` jej nie wdrożono: PRC-03 „**brak** zgodności”, PRC-10 „**potwierdzone** w kodzie” (luka: fonty Google na każdej stronie), PRC-13 „**potwierdzone** w dokumentacji producenta” (luka: MinIO bez wsparcia). `06` nie ma pola „Stan” w ustaleniach SOC | albo README: „(`02`, `A1`–`A4`)”, albo `04`: PRC-03 „**brak**”, PRC-10 „**brak** (pewność: kod)”, PRC-13 „**brak** (pewność: dokumentacja producenta)” i `06` usunąć z listy |
| N-02 | README `:43-45` (koordynator); `07:10`, `08:10`, `08:779` | README mówi, że wzmianki o „scratchpadzie” dotyczą plików roboczych, a „same recenzje są w `recenzje/`”; trzy miejsca nadal wskazują recenzje R1–R4 jako „scratchpad koordynatora/sesji” (propagacja R6b-U16 tylko do `05`, `09`) | `07:10`, `08:10`: „recenzje R1–R4 (`recenzje/R1.md` … `R4.md`)”; `08:779`: „Recenzje (`recenzje/`)” |
| N-03 | `03:310` | ZR-81 liczy DOK-4 do „ODCZYT 10.10.2026”, a `04:454` mówi „nie odczyt online, nie umowa” | „częściowo ODCZYT online 10.10.2026 — DOK-1–DOK-3, DOK-5–DOK-12; DOK-4 — dokumentacja SDK z narzędzia sesji (odczyt lokalny, nie online) (`04` § 8.2)” |
| N-04 | `09:598`; `recenzje/R4.md:106`; `recenzje/R6b.md:127` | Higiena (R6b-U12): w `09` uogólnione zdanie stoi w wierszu „Sentry”, więc znów wskazuje konto; w recenzjach zostały szczegóły per konto (który dostawca, jaki brak MFA). Źródło (PR #225) jest publiczne — ryzyko niskie | `09:598`: „dostęp do panelu: zob. `06` SOC-09” (bez zdania o MFA i współdzieleniu w tym wierszu); decyzja właściciela, czy w kopiach recenzji zastąpić te fragmenty dopiskiem „[szczegóły kont pominięte — R6b-U12]” |
| N-05 | `10-REVIEW.md:93` | zdanie o wyniku weryfikacji zapisane przed weryfikacją (koordynator ogłasza wynik bramki z góry) | jak B-05 — wpisać rzeczywisty wynik po tej weryfikacji |
| N-06 | `02`, `A3`, `08`, `04`, `07`, `A1`, `09`, `06`, `05` | pozostałe wystąpienia tez uznanych za błędne poza miejscami wskazanymi w uwagach: R-01, R-02, R-04, R-05, R-06, R-08 (§ 3) — błąd propagacji tego samego typu, który R6b-U15 opisał dla redaktorów R3–R5b | nanieść poprawki z § 3; drobne, nie zmieniają wniosków ani liczb |

## 6. Ocena

**Naniesione z brakami.** Merytoryczne poprawki obu krytyków są w plikach: teza o `KSEF_ENV` poprawiona we wszystkich plikach syntezy, z kartą E-10 i testem czerwonym zgodnymi z kodem; słownik stanów w `02`, `A1`–`A4`; poziom dowodu RUN-08 i PostHog w README; ścieżka UODO, Q-45, karta skrócona E-00. 12 z 13 sprawdzonych miejsc zgadza się z kodem.

Braki dotyczą wyłącznie plików koordynatora i zamknięcia bramki: pusty `10-REVIEW` § 4 (B-01), naniesienie przez autora bez odnotowanego odstępstwa (B-02), brak „Historii recenzji” README (B-03), błędne ID i przedwczesna deklaracja wyniku w § 5 (B-05, B-06), nadmierna deklaracja konwencji stanów i scratchpadu w README § 1 (N-01, N-02). Po naniesieniu B-01–B-06 i N-01–N-05 README może podać „zakończony”; pozostałości z § 3 (N-06) są drobne i mogą przejść do pierwszego etapu wykonawczego, ale wtedy trzeba je wpisać w `10-REVIEW` § 4 jako przeniesione.

## 7. Co sprawdziłem / czego nie mogłem sprawdzić

Sprawdziłem: wszystkie 24 uwagi R6a/R6b wobec bieżącej treści każdego wskazanego pliku (z numerami linii); `git show 741a680` (README, `10-REVIEW`) i `git diff HEAD` (11 plików redaktora, w tym `--word-diff`); grep po całym katalogu dla 13 grup tez; 13 miejsc wobec kodu na `3e5e00d` i `node_modules` (Next.js 16.3.8); przeliczenie stanów w `05` (85 wierszy: 1/44/36/4/0); istnienie Q-28, Q-45, N-38, `07` D-06, D-16; obecność wpisów R6 w „Historii recenzji” 11 plików.

Nie sprawdzałem: treści przepisów i źródeł zablokowanych; produkcji (wyzwalacze, zmienne, panele); kompletności całego audytu ponad tekst uwag R6 (to zrobiły R6a i R6b); spójności liczb uwag R1–R5b w `10-REVIEW` § 2–3 (zrobiła to R6b). Plików audytu nie edytowałem; nie commitowałem ani nie pushowałem.
