# Plan agenta Claude — szukanie i naprawa błędów przed launchem

> **Polecenie „kontynuuj plan z agentem”** (albo podobne) znaczy:
> 1. przeczytaj ten plik do końca,
> 2. zrób checklistę z sekcji 1,
> 3. pracuj od sekcji **„5. Następny krok”**,
> 4. po każdym zakończonym etapie zaktualizuj sekcję 4 (stan) i sekcję 5 (następny krok)
>    w tym pliku — w tym samym PR co poprawka albo w osobnym, małym PR.
>
> Plik prowadzi Claude na zlecenie Igora. Codex ma swój kanał:
> [`CLAUDE-DO-CODEXA.md`](CLAUDE-DO-CODEXA.md) (sprawy C-01…C-16).

---

## 0. Po co ten plan

FaktFlow trzyma prawdziwe faktury VAT, więc błąd w kwocie, eksporcie albo
wysyłce do KSeF to realna szkoda dla klienta (podatek, kara, zła KPiR).
Agent przechodzi po ścieżkach krytycznych, znajduje błędy, naprawia je
w kodzie z testami i zgłasza to, czego sam zrobić nie może (migracje,
wdrożenia, decyzje księgowe).

## 1. Start każdej sesji — checklista

| # | Co | Jak |
|---|---|---|
| 1 | Świeży stan repo | `git fetch origin`; nowa gałąź `git checkout -b claude/<temat> origin/main`. **Nigdy `git checkout main`** (lokalny main bywa nieaktualny). |
| 2 | Otwarte PR-y | `gh pr list --state open` — porównaj z tabelą w sekcji 4. Scalony/zamknięty PR → popraw tabelę. |
| 3 | Kanał z Codexem | [`CLAUDE-DO-CODEXA.md`](CLAUDE-DO-CODEXA.md) — nowe odpowiedzi Codexa, rejestr numerów migracji. |
| 4 | Cudze pliki | Zanim ruszysz plik: `git diff --quiet origin/main...origin/<gałąź-codexa> -- <plik>` dla otwartych gałęzi `codex/*` i `ops/*`. Plik w cudzym stosie → wpis C-xx zamiast zmiany. |
| 5 | Środowisko | `pnpm install` w worktree (bez `node_modules` testy nie ruszą); testy XSD potrzebują systemowego `xmllint`. |

## 2. Zasady — twarde

1. **Bez wdrożeń.** Żadnego deployu, restartu, zmian zmiennych w Coolify,
   `docker …`. Wdrożenie aplikacji (id=1) i workera (id=2) robi Bartosz.
2. **Bez migracji.** Nie tworzymy plików w `supabase/migrations/`. Potrzebna
   zmiana schematu → prośba do Bartosza w opisie PR (gotowy SQL + co
   sprawdzić przed) i wpis w sekcji 4.3.
3. **Scalanie:** od 01.10.2026 Claude scala **swoje** PR-y (`claude/*`) sam,
   po zielonym CI i lokalnym `pnpm run ci` (zgoda Igora). Merge commit,
   nigdy `--admin`. Cudzych PR-ów (Codex, Bartosz) nie scala bez wyraźnego
   polecenia. Scalenie to nie wdrożenie — zasada 1 obowiązuje dalej.
4. **PR od `origin/main`, bez stosów.** Kilka gotowych PR-ów naraz → gałąź
   „wydanie” łącząca je, jedno CI, jedno scalenie.
5. **Każda poprawka:** test, który bez poprawki pada; testy mutacyjne
   (celowe psucie kodu — każda mutacja ma zostać złapana); `pnpm run ci`
   lokalnie przed pushem. Uwaga na CRLF w plikach przy skryptach mutacji.
6. **Rozmowa z Igorem po polsku.** Bez materiałów do nauki w repo.
7. Repo jest **publiczne** — żadnych adresów serwerów, kluczy ani danych klientów
   w tym pliku i w PR-ach.

## 3. Etapy

Status: ✅ zrobione · 🔄 w toku · ⏳ czeka na kogoś · ⬜ do zrobienia

| Etap | Zakres | Status | Gdzie |
|---|---|---|---|
| E1 | Eksporty: KPiR (koszty z wydatków, strony, odliczenie VAT), JPK_FA(4) wg XSD, JPK_V7M(3), CSV, eksporty programowe | ✅ / ⏳ | #58–#61, #91, #93, #97, #98, #99; wstrzymania #66, #93 |
| E2 | Faktury: adnotacje FA(3) (MPP, metoda kasowa, „odwrotne obciążenie”), ROZ po zaliczkach, PDF korekty, kod QR, mail z kwotą do zapłaty | ✅ / ⏳ C-05 | #75, #76, #79, #84, #95, #102, #103 |
| E3 | OCR i waluty: koszt w walucie obcej po kursie NBP | ✅ | #94 |
| E4 | Joby pg-boss: ponowienie wykonuje CAŁY job od nowa (brak pamięci kroków) — każdy zapis musi być odporny na powtórkę | ✅ | #109 (OCR), #112/#116 (Co-Pilot), #114 (Sentry w workerze), #118 (maile triala), #119 (zapis przebiegów); lista w 3.1 |
| E5 | RODO / konto: usunięcie konta a subskrypcja i klucze obce | ✅ kod / ⏳ migracja B3 | #108 |
| E6 | Konfiguracja produkcji bez cichych zastępstw (GUS sandbox, brak kluczy) | ✅ / ⏳ B2 | #107 |
| E7 | Retencja 10 lat: joby `retention-delete`, `archive-old-invoices` — czy nic nie kasuje faktur przed terminem | ✅ sprawdzone 01.10 | uwagi w 3.2 |
| E8 | Pozostałe obszary: import (Magiczny Import), portal księgowej, walidatory formularzy, powiadomienia | ✅ przegląd 01.10 | portal: token jako hash, wygaśnięcie, odwołanie, firma i ścieżka XML sprawdzane; push tylko do aktywnych członków; walidator ZAL bez „zw” = C-15; import: silnik w stosie Codexa, parsery FA(3)/JPK_FA ignorowały walutę — #130. Uwaga dla Codexa: Magiczny Import łapie błąd parsera tylko w logu (`magic-import-ksef.ts`), użytkownik nie widzi powodu pominięcia |
| E9 | Flo — funkcje zapisujące dane (`payment.confirm`, `expense.review`, `expense.rule`, `payment.chase`) | ✅ przegląd 01.10 | `expense.*` bez skutków wstecz; `payment.confirm` — uwaga o dacie wpłaty w 4.4; `payment.chase` = ponaglenia (stos Codexa) |
| E10 | Formularze faktur VAT/KOR/ZAL/ROZ — przypadki brzegowe dat i kwot (art. 106i, 106e) | ✅ przegląd 01.10 | błędów danych brak; ograniczenia produktowe w 4.4 (data sprzedaży po wystawieniu, brak ostrzeżenia o spóźnionej fakturze); pliki formularzy w stosie Codexa |
| E11 | Ustawienia firmy i KSeF — zmiana NIP, danych sprzedawcy, certyfikatu; co dzieje się z wystawionymi fakturami | ✅ przegląd 01.10 | PDF bierze sprzedawcę z migawki faktury (`seller_data`); NIP firmy ustawia się tylko w szkicu; ponowna wysyłka wstrzymana do ręcznego uzgodnienia |
| E12 | Koszty samochodu osobowego (50% VAT, 75% PIT) — aplikacja odlicza 100% VAT i nie stosuje limitu | ⏳ decyzja | 4.4 |

### 3.1. Audyt jobów pod ponowienia (E4)

Pytanie dla każdego joba: *co się stanie, gdy job padnie PO zapisie i wykona
się od nowa?*

| Job | Wynik |
|---|---|
| `process-ocr` | ❌→✅ dubel wydatku w KPiR — #109 |
| `co-pilot-monthly` (cron) | ❌→✅ rezerwacja okresu przed wysłaniem zdarzenia; ponowienie pomijało firmy → paczka za miesiąc nie wychodziła — #112 |
| `co-pilot-monthly` (paczka) | ❌→✅ ponowienie po wysłanym mailu tworzyło nowe eksporty i wysyłało mail drugi raz; `emailed_at` nikt nie zapisywał — #116; nieudana paczka → Sentry od #114 |
| `auto-categorize-inbox` | ✅ sprawdza istniejący wydatek po `ksef_invoice_id` |
| `download-upo` | ✅ odczyt/aktualizacja istniejącego rekordu |
| `dunning-payment-failed`, `trial-countdown-emails` | ✅ claim w `billing_notifications` |
| `retention-delete`, `archive-old-invoices` | ✅ ponowienie bezpieczne (aktualizacje idempotentne) — reszta w 3.2 |
| `exports-generate` | ✅ nazwa pliku deterministyczna, HEAD przed wgraniem do R2, upsert `export_files`. Drobiazg: JPK ma znacznik czasu, więc po ponowieniu `file_hash`/`size_bytes` mogą nie pasować do pliku w R2 — nikt ich nie weryfikuje |
| `email-sequence` | ❌→✅ TREŚĆ: maile dnia 12 i 14 („2 dni do końca trialu”, „trial zakończony, read-only, dane usuwane po 30 dniach”) przeczyły regulaminowi (trial 30 dni), retencji i aplikacji; dzień 14 szedł do płacących — wstrzymane (#118). Ponowienia: powitalny mail może pójść drugi raz, gdy padnie planowanie dnia 1 — drobne |
| `daily-summary-email` | ✅ raport dla operatora, bez skutku dla klientów. ALE: wskaźnik „błędy jobów” czytał `inngest_run_log`, do której NIKT nie pisał (także panel `/admin/system`) — zawsze 0; naprawione w #119 (worker zapisuje każdy przebieg) |
| `magic-import-ksef` | stos Codexa (#63–#86) — tylko czytać |
| `reminder-scheduler` | ✅ propozycje deduplikowane po `topic_key` (wyścig: 23505) |
| `send-reminder` | ✅ mail z `idempotencyKey: 'reminder/' + approvalId` |
| `bulk-import` | ✅ deduplikacja po numerze i numerze KSeF + UNIQUE `(tenant_id, internal_number)`; kolizje numerów faktur odebranych to C-08 (#117) |
| `nightly-validation-recheck`, `bulk-validate-contractors` | ❌→✅ awaria API Białej Listy/VIES (timeout, limit zapytań) zapisywała kontrahentowi „nieznany” i pustą listę rachunków na 7 dni i truła cache na 24 h — #123 |
| `cert-expiry-alert` | ✅ data wygaśnięcia zapisywana przy wgraniu certyfikatu; progi 30/14/7 w oknach jednodniowych |
| `cleanup-old-backups` | ❌→✅ retencja samą datą kasowała ostatnie DOBRE kopie, gdy nowe od miesiąca się nie udawały — zostaje zawsze 7 najnowszych udanych (#124) |
| `submit-invoice`, `inbox-polling`, `self-invoice-payment`, `process-offline-queue` | Codex (stos #62–#86) — tylko czytać, uwagi przez C-xx |

### 3.2. Retencja (E7) — wynik przeglądu 01.10.2026

Nic nie kasuje faktur przed terminem: archiwum (Glacier) bierze faktury
starsze niż 2 lata od daty wystawienia i planuje usunięcie za 8 lat, czyli
najwcześniej 10 lat od wystawienia (ustawowo wystarczy 5 lat od końca roku
terminu płatności podatku). Bez konfiguracji AWS archiwum rzuca błąd, nic
nie oznacza. Uwagi, bez pilności:

| Uwaga | Kiedy zaboli |
|---|---|
| `retention-delete` kasuje paczką 100 faktur; korekta (`parent_invoice_id … ON DELETE RESTRICT`) albo wydatek (`expenses.ksef_invoice_id`) blokuje całą paczkę i job staje codziennie na tych samych wierszach | ~2034 |
| `archive-old-invoices`: jedna faktura z brakującym XML w R2 zatrzymuje archiwizację wszystkich (te same 500 kandydatów co dzień) | gdy pierwszy XML zginie |
| Faktury bez XML (import CSV) nigdy nie dostają terminu usunięcia | RODO, po 10 latach |

## 4. Stan — aktualizuj po każdym etapie

**Ostatnia aktualizacja:** 01.10.2026 — Claude (sesja z Igorem).

### 4.1. Scalone do `main`, NIEWDROŻONE

Main od `b25c126` czeka na wdrożenie (aplikacja + worker, bez migracji):
#91–#97, #100, #101, #105 (= #98, #99, #102, #103), wydanie #111 (`7a9f49a`)
z #106–#110, oraz:

| PR | Co |
|---|---|
| #106 | Koordynacja: C-05 (aktualizacja), C-11…C-16 |
| #107 | JPK_FA: bez `GUS_API_KEY` w produkcji odmowa zamiast adresu z testowej bazy GUS |
| #108 | RODO: usunięcie konta nie zostawia płatnej subskrypcji bez opiekuna |
| #109 | OCR: ponowienie joba nie dubluje wydatku w KPiR |
| #110 | Ten plan + wskaźnik w `AGENTS.md` |
| #112 | Co-Pilot (cron): ponowienie nie gubi miesięcznej paczki dla księgowej |
| #114 | Worker pg-boss inicjalizuje Sentry — alerty z jobów wcześniej nie wychodziły wcale |
| #116 | Co-Pilot (paczka): ponowienie nie wysyła księgowej drugiego maila; zapis `emailed_at` |
| #118 | Wstrzymane maile triala z dnia 12 i 14 (sprzeczne z regulaminem i retencją) |
| #119 | Worker zapisuje przebiegi jobów do `inngest_run_log` — panel i raport „błędy jobów” przestają pokazywać zawsze 0 |
| #121 | C-17 w kanale z Codexem (tylko dokumentacja) |
| #123 | Awaria API Białej Listy/VIES nie kasuje statusu VAT i rachunków kontrahenta ani nie truje cache |
| #124 | Retencja kopii bazy zostawia zawsze 7 najnowszych udanych |
| #127 | Plan: E10/E11 przejrzane, E12 samochód do decyzji (scalony razem z #129) |
| #129 | Kafelek „Szac. podatek” na przepływach liczy od 1 stycznia (był: ostatnie 6 miesięcy, także z zeszłego roku) + C-18 |

### 4.2. Otwarte PR-y Claude

| PR | Co | Stan |
|---|---|---|
| #130 | Import FA(3)/JPK_FA odmawia faktury w walucie obcej (kwoty szły jak złote do KPiR) | w tym PR |

Na `main` od innych od 01.10: Bartosz #113 (health-check KSeF), #117 (C-08,
migracja `00096`), #120 (alerty Telegram + heartbeat workera), #126
(uzgadnianie niepewnego wyniku KSeF, migracja `00099`) — wgranie migracji po
stronie Bartosza.

Cudze otwarte: Codex #62, #63, #64, #71, #83, #85, #86, #104, #122 (PDF bez
poprawnych kodów QR); Bartosz #90.

### 4.3. Prośby do Bartosza (migracje, produkcja)

| # | Prośba | Skąd |
|---|---|---|
| B1 | Wdrożyć `main` (aplikacja + worker) | 4.1 |
| B2 | Sprawdzić/ustawić `GUS_API_KEY` na produkcji | #107 |
| B3 | Migracja: klucze obce `expenses.created_by`, `ocr_jobs.created_by`, `accountant_access.created_by_user_id` → `ON DELETE SET NULL` (dziś blokują usunięcie konta RODO) | #108 |
| B4 | Odczyt: czy na produkcji są zdublowane wydatki z OCR (SQL w #109); potem `UNIQUE (tenant_id, ocr_job_id)` | #109 |
| B5 | C-16: płatności/ponaglenia ROZ liczone od pełnej kwoty — migracja przed zdjęciem wstrzymania ROZ | `CLAUDE-DO-CODEXA.md` |
| B6 | Po wdrożeniu workera: w logach startu ma być „Sentry: alerty z jobów włączone”; jeśli „WYŁĄCZONE” — dodać `SENTRY_DSN` do zmiennych workera (Coolify id=2) | #114 |
| B7 | Decyzja: czy kontom BEZ karty (trial bez danych płatniczych, regulamin §3) potrzebny mail o końcu trialu — nowa treść pod 30 dni, bez obietnic usuwania danych. Kolejki `email.trial-day-12/14` usunąć ~14 dni po wdrożeniu | #118 |

### 4.4. Czeka na decyzję / kogoś innego

| Sprawa | Kto |
|---|---|
| C-05: adnotacje P_16/P_18A dla ROZ | Claude, po scaleniu #85 (Codex) |
| C-17: faktura zaliczkowa bez daty otrzymania zapłaty (`P_6`, art. 106e ust. 1 pkt 6) — formularz, generator i JPK | Codex (#85 — pliki ZAL w jego stosie) |
| C-18: strona przepływów ma ładować dane od 1 stycznia i przekazać `dataFrom` — wtedy szacunek podatku obejmie cały rok | Codex (`przeplywy/page.tsx` w jego stosie) |
| Szacunek podatku zakłada 19% liniowy dla każdego (podpisane na kafelku); skala 12/32% i ryczałt dałyby inne kwoty, brak też odliczenia składki zdrowotnej — Flo ma profil podatkowy (`taxGateOpen`), z którego można by brać formę | decyzja produktowa (Bartosz — właściciel strony) |
| JPK_V7M: pole dla „oo” (odwrotne obciążenie) i okres według daty sprzedaży | księgowa |
| JPK_FA: korekty (C-01, konwencja kwot) | Igor + Codex |
| Ochrona przed brakiem `KSEF_ENV` (`claim-environment`) | Codex (stos #63/#64) |
| Autouzupełnianie kontrahentów z testowej bazy GUS bez klucza | zgłoszone, decyzja produktowa |
| Pulpit `monthly-figures` i FLO sumują `gross_total` ROZ | Bartosz |
| Flo `payment.confirm` zapisuje `payment_date` = dzień KLIKNIĘCIA, nie wpływu pieniędzy (karta pyta dobę po terminie, zbiorczo). Dziś czytają to tylko zabezpieczenia ponagleń — ale zanim VAT metodą kasową (#76) zacznie liczyć okres z wpłat, karta musi pytać o datę wpływu | przyszłość, decyzja przy JPK_V7M dla metody kasowej |
| **E12 — samochód osobowy.** Paliwo i inne wydatki na auto idą z odliczeniem 100% VAT (OCR, skrzynka KSeF), a użytkownik nie ma jak ustawić 50%. W typowej mikrofirmie (użytek mieszany): VAT tylko 50% (art. 86a ust. 1), nieodliczona połowa do kosztu, koszt PIT max 75% (art. 23 ust. 1 pkt 46a); leasing ma osobne limity (pkt 47a). Dziś KPiR zaniża koszt o połowę VAT i nie stosuje limitu 75% (JPK_V7M zawyżyłby odliczenie, ale jest wstrzymany). Propozycja: ustawienie firmy „samochód: brak / mieszany / 100% firmowy (VAT-26)”, rozpoznanie wydatków samochodowych (paliwo, serwis, ubezpieczenie) i proporcja odliczenia przy zapisie wydatku | Igor + księgowa (decyzja, co liczyć), potem Claude |
| Formularz faktury nie pozwala na datę sprzedaży PO dacie wystawienia (art. 106i ust. 7 dopuszcza fakturę do 60 dni przed dostawą) i nie ostrzega o spóźnionym wystawieniu (po 15. dniu następnego miesiąca, art. 106i ust. 1) — ograniczenie, nie błąd danych | decyzja produktowa |

## 5. Następny krok

1. E13: przepływy naprawione (#129, C-18). Funkcje
   podatkowe Flo (grupa T: `tax.setaside`, `tax.limit`, `tax.deadline`,
   `tax.relief`, `tax.simulate`) są WYŁĄCZONE bramką
   (`lib/flo/tax-params.ts`: `PARAMS_VERIFIED = false`) — przegląd ROZ,
   korekt, „zw”, waluty i paragonów zrobić PRZED ich włączeniem, razem
   z weryfikacją tabeli parametrów przez księgowa.
2. Po decyzji Igora/księgowej: E12 (samochód 50%/75%).
3. Po scaleniu #85 (Codex): C-05 — adnotacje P_16/P_18A dla ROZ.
4. Po scaleniu #90 (Bartosz): przegląd snapshotu i weryfikacji kopii (dziś
   przeczytane: alert przy awarii jest — Sentry + kanał „urgent”).

Sprawdzone 01.10 bez zmian: `daily-db-snapshot`, `verify-backup` (suma
kontrolna, rozpakowanie, liczby wierszy), `cleanup-audit-logs` (logi > 12 mies.,
`inngest_run_log` > 3 mies.), `refresh-materialized-views`,
`weekly-business-review`, `daily-analytics-digest`. Analityka PostHog:
lista dozwolonych zdarzeń i właściwości, identyfikatory tylko UUID, host UE,
zgoda — bez uwag.
