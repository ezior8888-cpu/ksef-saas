# Cykl życia faktury wychodzącej w KSeF — maszyna stanów

Stan: projekt docelowy z 03.10.2026, napisany po rewizji napraw (`docs/automation/13_REWIZJA_2026-10-03.md`, ustalenia K3, W1–W3, W16, S1, S22). Plan wdrożenia: `docs/koordynacja/PR-CYKL-ZYCIA-FAKTURY.md`. Uzupełnia `docs/architecture/ksef-flow.md` (diagram wysyłki), nie zastępuje go.

Zakres: faktury `invoices.direction = 'outgoing'` (FA, KOR, ZAL, ROZ). Faktury przychodzące (`received`), UPO (`upo_receipts.status`) i płatności (`payment_status`) to osobne osie i mają własne, prostsze cykle; tu pojawiają się tylko tam, gdzie wiążą się z wysyłką.

## 1. Zasada nadrzędna

**Każda faktura jest zawsze w jednym ze zdefiniowanych stanów, każdy stan nieterminalny ma maksymalny czas przebywania i alarm, a każdy stan błędny ma co najmniej jedno wyjście wykonywane przez kod, nie przez ręczny SQL.**

Dziś łamią to trzy miejsca: `failed` bez wyjścia (K3), `queued` bez zadania (W2, W3) i `rejected` z otwartym wpisem historii (S1). Źródłem problemu jest to, że trzy warstwy mają własną definicję „dowodu, że KSeF mógł dostać fakturę”: wyzwalacze patrzą na `submitted_to_ksef_at` i `last_attempt_at`, runner na `ksef_submissions`, UI na `ksef_status`. Docelowo jest jedna definicja (sekcja 3).

## 2. Pola stanu (co znaczy które pole)

| Pole | Właściciel zapisu | Znaczenie docelowe |
|---|---|---|
| `invoices.ksef_status` | wyłącznie serwer (worker, RPC); klient nigdy | stan maszyny: `draft`, `queued`, `sending`, `accepted`, `rejected`, `failed`, `offline_queued` (`received` tylko dla przychodzących) |
| `invoices.submitted_to_ksef_at` | `claim_ksef_send` (00124) | **znacznik przejęcia bieżącej próby** i początek dzierżawy. NIE jest dowodem, że KSeF cokolwiek dostał. Czyszczony przy powrocie do `draft`. |
| `invoices.ksef_send_owner` | `claim_ksef_send` | `sendAttemptId` próby trzymającej wysyłkę; czyszczony przy `failed`, `rejected`, `draft` |
| `invoices.last_attempt_at`, `submission_attempts` | worker | diagnostyka, nie dowód; nie wpływa na zamrożenie treści |
| `invoices.last_error`, `last_error_code`, `last_error_field`, `last_error_suggestion` | worker, RPC | przyczyna ostatniego błędu; `last_error_code` z katalogu (sekcja 6) — od niego zależą dostępne wyjścia |
| `invoices.ksef_number`, `ksef_environment`, `ksef_accepted_at` | worker (`save-ksef-number`) | dowód przyjęcia; po zapisie stan jest terminalny (00117 blokuje zmianę) |
| `invoices.xml_storage_path`, `xml_generated_at` | worker | plik wysłany do KSeF (ten sam bajt w bajt — AUD-12, AUD-46) |
| `ksef_submissions` (wiersz per próba wysyłki) | worker (`recordKsefSubmissionIntent`, `recordKsefSubmissionSent`, `markKsefSubmission`) | **jedyny dowód kontaktu z KSeF**: `intent` = sesja otwarta, plik w drodze — wynik nieznany (A2, 00136); `sent` = plik przyjęty do przetwarzania, bez rozstrzygnięcia; `accepted`; `rejected`; `duplicate`; `abandoned` = KSeF potwierdził, że pliku z tej próby nie ma |
| zdarzenie `invoice/submit.requested` (`sendAttemptId`) | web (enqueue), cron ponowień | jedna próba = jeden `sendAttemptId`; ponowienie pg-boss tego samego joba zachowuje identyfikator |
| `global_feature_flags`: `killAllKsefSubmissions`, `KOR_HOLD` (z env), ROZ hold | operator | hamulce; faktura zatrzymana hamulcem dostaje kod HOLD i wraca do kolejki po zdjęciu hamulca |

Definicja **dowodu kontaktu** (używana przez wyzwalacze, RPC i strażnika): faktura ma dowód kontaktu, gdy `ksef_number IS NOT NULL` **albo** istnieje wiersz `ksef_submissions` o statusie `intent`, `sent`, `accepted` lub `duplicate`. Wiersze `rejected` i `abandoned` dowodem nie są (KSeF odrzucił treść albo potwierdził, że pliku nie dostał).

**Zamiar wysyłki (A2, 00136).** Worker zapisuje wpis `intent` z numerem sesji po jej otwarciu, a PRZED wysłaniem pliku; bez tego zapisu plik nie wychodzi. Po odpowiedzi KSeF wpis staje się `sent` (z numerem referencyjnym faktury), po odmowie przyjęcia pliku (HTTP 4xx poza 408) — `abandoned`. Zamiar, który został otwarty (timeout, padnięty worker, błąd zapisu), rozstrzyga następna próba: zamyka tamtą sesję i pyta KSeF o jej faktury (`GET /sessions/{ref}/invoices`) — plik jest → `sent` i zwykłe uzgodnienie po referencji; sesja pusta → `abandoned` i wysyłka od nowa; awaria KSeF → ponowienie uzgadniania, nigdy drugi POST. Wyjście z blokady powrotu do szkicu: „Wyślij ponownie”, cron ponowień albo operator „Tylko uzgodnij”. „Tylko uzgodnij”, które stwierdzi, że KSeF nie ma faktury (brak dowodu kontaktu po rozstrzygnięciu), kończy `failed NOT_IN_KSEF` — klient wysyła ponownie albo wraca do szkicu (A2b).

## 3. Stany

| Stan | Znaczenie | Terminalny | Treść zamrożona | Maks. czas | Wyjścia |
|---|---|---|---|---|---|
| `draft` | szkic, nie zlecono wysyłki | nie | nie | brak | edycja, usunięcie, `queued` |
| `queued` | zlecenie wysyłki istnieje w pg-boss (inwariant I1) | nie | tak | 15 min do przejęcia | `sending` (worker), `draft` (zwolnienie przez serwer, gdy zlecenie nie powstało) |
| `sending` | próba `ksef_send_owner` trzyma dzierżawę i rozmawia z KSeF | nie | tak | dzierżawa (`KSEF_SEND_LEASE_SECONDS`) + 15 min | `accepted`, `rejected`, `failed`; po wygaśnięciu dzierżawy inna próba może przejąć (00124) |
| `accepted` | KSeF nadał numer; dokument wystawiony | **tak** | tak, na zawsze | brak | tylko nowy dokument (KOR); UPO osobno |
| `rejected` | KSeF odrzucił **treść** (XSD, kod statusu ≥ 400 poza 440, HTTP 4xx poza 401/403/408/429) — dokument nie został wystawiony | dla tej treści tak | tak, do resetu | brak | `draft` przez `reset_ksef_send` (klient poprawia i wysyła pod tym samym numerem) |
| `failed` | wysyłka nie doszła do skutku albo wynik niepewny; przyczyna w `last_error_code` | **nie** | tak | zależy od kodu (sekcja 6) | `queued` przez `requeue_ksef_send` (po uzgodnieniu), `draft` przez `reset_ksef_send` (tylko bez dowodu kontaktu) |
| `offline_queued` | tryb Offline24; na produkcji wyłączony (AUD-14), na TEST sterowany przez `process-offline-queue` | nie | tak | termin ustawowy (`idempotency.ts`) | `sending`, `failed`; na PROD nieosiągalny |

Faktura z dowodem kontaktu nigdy nie wraca do `draft`. Faktura bez dowodu kontaktu może wrócić do `draft` z każdego stanu błędnego, bo prawnie nie została wystawiona, a numer pozostaje jej numerem.

## 4. Przejścia

Legenda wykonawcy: **K** = sesja klienta (`authenticated`, RLS), **S** = akcja serwerowa z kluczem serwisowym lub RPC `service_role`, **W** = worker pg-boss, **C** = cron strażnika, **O** = operator (panel `/admin`, ta sama RPC co S).

| Z → Do | Wykonawca | Warunek | Co się zapisuje | Dziś | Docelowo |
|---|---|---|---|---|---|
| (brak) → `draft` | K | formularz | wiersz + pozycje | ✅ | bez zmian |
| `draft` → `draft` (edycja) | K | brak dowodu kontaktu, status `draft` | treść | ✅ | bez zmian |
| `draft` → usunięcie | K | jak wyżej | DELETE | ✅ (00119/00122) | bez zmian |
| `draft` → `queued` | **S** | hamulce zdjęte, MFA wg flagi, certyfikat zweryfikowany, data wystawienia = dziś w Polsce dla FA, ZAL, KOR i ROZ (`lib/invoices/issue-date.ts`, A1) | `queued`, nowy `sendAttemptId`, zdarzenie pg-boss **w tej samej transakcji** (`enqueue_ksef_send`) | ❌ klient pisze `queued` po `boss.send` bez warunku (`ksef-submit-enqueue.ts:274-277`, W16); szkic pisze `queued` przed enqueue (W2) | RPC + transakcja; wyjątek dla klienta w 00119/00122 usunięty |
| `queued` → `draft` | **S / C** | zlecenie nie powstało albo `queued` > 15 min bez joba (I1) i brak dowodu kontaktu | `draft`, `ksef_send_owner = NULL`, wpis audytu `invoice.enqueue_released` | ❌ cofnięcie blokuje 00119 (W2) | `release_ksef_enqueue` |
| `queued` → `sending` | W | `claim_ksef_send` (00124): wolna, ten sam owner albo wygasła dzierżawa | `sending`, `submitted_to_ksef_at`, `ksef_send_owner`, `last_attempt_at` | ✅ | bez zmian |
| `sending` → `sending` (uzgodnienie) | W | otwarty wpis `sent` albo zamiar `intent` w `ksef_submissions` | zamiar: zamknięcie sesji i lista jej faktur w KSeF (A2); potem status po numerze referencyjnym, nigdy ponowny POST | ✅ (AUD-01, A2) | + okno 48 h: starszy wpis `sent` zamykany jako `duplicate`/`rejected` po odpowiedzi KSeF „nieznana sesja” (S1) |
| `sending` → `accepted` | W | numer KSeF z odpowiedzi lub z uzgodnienia, lub własny duplikat 440 | `accepted`, numer, env, `ksef_accepted_at`, `xml_storage_path`, wpis `ksef_submissions.accepted`, zdarzenie UPO | ✅ | zapis warunkowy `ksef_status <> 'accepted'`; przy braku wiersza UPO cron `upo-retry-stale` (bez zmian) |
| `sending` → `rejected` | W | błąd klasy TERMINAL (sekcja 6) | `rejected`, kod, **zamknięcie wpisu `ksef_submissions` jako `rejected`**, `ksef_send_owner = NULL` | ⚠️ wpis zostaje otwarty (S1); kod zerowany (`markFailureUnlessAccepted`) | jak w kolumnie |
| `sending` → `failed` | W | wyczerpane ponowienia błędu TRANSIENT, hamulec HOLD, wynik RECONCILE, awaria infrastruktury przed POST | `failed`, kod z katalogu, `ksef_send_owner = NULL`; `submitted_to_ksef_at` zostaje | ⚠️ W1 mapuje błąd infrastruktury na `rejected`; W3 zostawia `queued` | jak w kolumnie; `handled:false` w `onExhausted` zawsze kończy `failed` z kodem `INVALID_EVENT`/`ENV_MISMATCH` |
| `failed` → `queued` („wyślij ponownie”) | **S / C / O** | kod dopuszcza ponowienie (sekcja 6); hamulec zdjęty; brak otwartego wpisu `sent` młodszego niż 48 h (inaczej najpierw uzgodnienie w jobie) | `queued`, nowy `sendAttemptId`, zdarzenie w tej samej transakcji, `submission_attempts` rośnie | ❌ `resendInvoiceAction` zawsze odmawia (K3) | `requeue_ksef_send`; cron ponawia TRANSIENT co 60 min przez 24 h i HOLD po zdjęciu hamulca |
| `failed`/`rejected` → `draft` („wróć do szkicu”) | **S / O** | **brak dowodu kontaktu** (sekcja 2), kod nie jest RECONCILE | `draft`; czyszczone: `submitted_to_ksef_at`, `ksef_send_owner`, `xml_storage_path`, `xml_generated_at`, `last_error*`, `last_attempt_at`, `submission_attempts`; poprzednie wartości do `audit_logs` (`invoice.send_reset`); obiekt XML w R2 usunięty albo kluczowany po `sendAttemptId` | ❌ niemożliwe (00119/00122/00124) | `reset_ksef_send` |
| `failed` (RECONCILE) → `accepted` / `rejected` / `draft` | **O** przez job uzgadniający | operator uruchamia `requeue` z flagą „tylko uzgodnij”; job pyta KSeF o status po referencji / numerze | wynik jak wyżej | ❌ brak narzędzia | ścieżka w `requeue_ksef_send(p_reconcile_only)` |
| `accepted` → cokolwiek | — | — | — | ✅ zablokowane (00117) | bez zmian |
| `*` → `offline_queued` | W | tylko gdy `isOffline24Enabled(env)` | jak dziś | ✅ na TEST, ❌ na PROD | bez zmian; stan zostaje w modelu, bo istnieją historyczne wiersze |

Zasada dla klienta: **sesja użytkownika nie zmienia `ksef_status` nigdy**. Każde przejście z `draft` wykonuje serwer po własnych sprawdzeniach. Dzięki temu wyzwalacze 00119 i 00122 mogą stracić wyjątek „klient pisze `queued`” i stają się prostsze: klient edytuje i usuwa wyłącznie `draft` bez dowodu kontaktu, resztę blokują.

## 5. Inwarianty (sprawdzane przez strażnika co 15 min)

| # | Inwariant | Reakcja strażnika |
|---|---|---|
| I1 | `queued` ⇒ istnieje job `invoice.submit.requested` w stanie `created`/`retry`/`active` z tym `invoiceId` | brak joba i wiek > 15 min: `release_ksef_enqueue` (jeśli brak dowodu kontaktu) albo `failed` z kodem `ENQUEUE_LOST`; alarm |
| I2 | `sending` ⇒ `submitted_to_ksef_at` nie starsze niż dzierżawa + 15 min | alarm `stale_ksef_sending_invoices` (istnieje) |
| I3 | `accepted` ⇒ `ksef_number`, `ksef_environment`, `xml_storage_path` niepuste, wpis `ksef_submissions.accepted` lub `duplicate`, wiersz `upo_receipts` | brak UPO: `cron.upo-retry-stale` (istnieje, po naprawie W12); brak wpisu historii: alarm informacyjny |
| I4 | `failed`/`rejected` ⇒ `last_error_code` z katalogu, `ksef_send_owner IS NULL` | kod spoza katalogu: alarm i kod `UNKNOWN` |
| I5 | wpis `ksef_submissions.sent` albo zamiar `intent` (00136) starszy niż 48 h ⇒ faktura jest w `sending` z żywą dzierżawą albo w `failed` z kodem RECONCILE | inaczej: `requeue_ksef_send(p_reconcile_only = true)` — **cron co 15 min** dla `failed`/`rejected` (A3): najwyżej raz na dobę, po 3 próbach w tygodniu alarm i operator; inne stany — tylko alarm |
| I6 | `failed` z kodem TRANSIENT młodszy niż 24 h ⇒ zostanie ponowiony | cron ponawia co 60 min; po 24 h kod zmienia się na `TRANSIENT_EXHAUSTED` i idzie alarm do operatora |
| I7 | `failed` z kodem HOLD ⇒ hamulec nadal aktywny | hamulec zdjęty: `requeue_ksef_send` |
| I8 | numer faktury należy do dokładnie jednego wiersza firmy (indeks unikalny) i po resecie wraca do tego samego wiersza | bez zmian |
| I9 | wiersz `rejected`/`failed` nie ma `ksef_number` | naruszenie = błąd krytyczny (alarm, nic automatycznie) |

Raport dzienny strażnika na Telegram: liczba faktur per stan, naruszenia I1–I9, akcje automatyczne wykonane w ciągu doby. Cel na Closed Alpha: **siedem kolejnych dni z zerem naruszeń** na KSeF TEST z realnym ruchem testowym.

## 6. Katalog `last_error_code`

| Klasa | Kod | Źródło | Wyjścia dozwolone | Komunikat dla klienta |
|---|---|---|---|---|
| TERMINAL (treść) | `XSD_INVALID` | `InvoiceXmlSchemaError` | `draft` | „Faktura nie przeszła walidacji schematu FA(3): … Popraw dane i wyślij ponownie.” |
| TERMINAL | `KSEF_REJECTED_<kod>` | status faktury ≥ 400 (poza 440), HTTP 4xx poza 401/403/408/429 | `draft` | „KSeF odrzucił fakturę: …” |
| TERMINAL | `INVALID_DOCUMENT` | `validateInvoice`, `assertSubmitReferences`, `manual reconciliation` strażników treści | `draft` (po poprawie referencji) | „Dokument wymaga poprawy: …” |
| TRANSIENT | `KSEF_UNAVAILABLE` | 5xx, 503, timeout, `ECONNRESET`, 408 | `queued` (auto co 60 min / 24 h) | „KSeF nie odpowiada. Ponowimy wysyłkę automatycznie.” |
| TRANSIENT | `KSEF_RATE_LIMIT` | 429 z `Retry-After` | `queued` (auto) | jak wyżej |
| TRANSIENT | `KSEF_SESSION` | 401, 21184 | `queued` (auto) | jak wyżej |
| TRANSIENT | `INFRA` | błąd bazy / PostgREST / R2 **przed POST** do KSeF (dziś mylnie `rejected`, W1) | `queued` (auto) | „Chwilowy błąd po naszej stronie. Ponowimy wysyłkę.” |
| TRANSIENT | `CREDENTIALS_UNAVAILABLE` | brak klucza po rotacji, błąd deszyfrowania | `queued` po naprawie konfiguracji; alarm operatora natychmiast | „Wysyłka wstrzymana po naszej stronie. Pracujemy nad tym.” |
| TRANSIENT | `TRANSIENT_EXHAUSTED` | 24 h automatycznych ponowień bez skutku | `queued` ręcznie (O/S) | „Wysyłka nie powiodła się przez dobę. Zajmujemy się tym.” |
| TRANSIENT | `NOT_IN_KSEF` | „tylko uzgodnij” bez otwartej wysyłki i bez dowodu kontaktu (zamiar porzucony, wpis STALE) — A2b, 00141 | `queued` ręcznie (klient/O), `draft`; **bez** automatu (data wystawienia, B1/B2) | „KSeF nie ma tej faktury — poprzednia wysyłka do niego nie dotarła. Wyślij ją ponownie albo wróć do szkicu.” |
| HOLD | `KSEF_PAUSED` | `killAllKsefSubmissions` | `queued` automatycznie po zdjęciu | „Wysyłka wstrzymana przez operatora. Faktura wyjdzie automatycznie po przywróceniu.” (dziś tekst obiecuje „wyślij ponownie” — do zmiany) |
| HOLD | `KOR_HOLD`, `ROZ_HOLD_RECONCILE` | blokady KOR/ROZ | `queued` po zdjęciu; `draft` | „Wysyłka korekt jest tymczasowo wstrzymana …” |
| RECONCILE | `KSEF_DUPLICATE_RECONCILE` | 440 bez własnej sesji | tylko operator (uzgodnienie) | „Faktura wymaga uzgodnienia z KSeF. Skontaktujemy się.” |
| RECONCILE | `RESULT_UNCERTAIN` | otwarty wpis `sent`, KSeF nie odpowiada na status; „tylko uzgodnij” bez otwartej wysyłki, gdy dowód kontaktu zostaje | job uzgadniający | jak wyżej |
| RECONCILE | `ENV_MISMATCH`, `INVALID_EVENT`, `ENQUEUE_LOST` | `onExhausted handled:false`, strażnik I1 | operator | jak wyżej |
| — | `NO_CERTIFICATE`, `NOT_VERIFIED` | brak/niezweryfikowany certyfikat | `draft` (klient uzupełnia certyfikat) | „Najpierw wgraj i zweryfikuj certyfikat KSeF.” |

Zasada klasyfikacji (W1): na `TERMINAL` mapuje się wyłącznie błąd, którego przyczyną jest **treść dokumentu** albo **decyzja KSeF o treści**. Każdy błąd, który może zniknąć bez zmiany dokumentu, jest `TRANSIENT`. Brak pewności = `RECONCILE`, nigdy `rejected`.

## 7. Co widzi użytkownik

| Stan + kod | Etykieta | Przyciski |
|---|---|---|
| `draft` | Szkic | Edytuj, Wyślij do KSeF, Usuń |
| `queued` | W kolejce | brak (po 15 min bez postępu: informacja „sprawdzamy”) |
| `sending` | Wysyłanie | brak |
| `accepted` | Zaakceptowana · nr KSeF | PDF, XML, UPO (gdy pobrane), Wystaw korektę |
| `rejected` | Odrzucona przez KSeF · powód | Wróć do szkicu i popraw |
| `failed` TRANSIENT | Wysyłka ponawiana · następna próba o HH:MM | brak; po `TRANSIENT_EXHAUSTED`: Wyślij ponownie |
| `failed` HOLD | Wstrzymana przez operatora | brak (automatyczne wznowienie) |
| `failed` RECONCILE | Wymaga uzgodnienia | brak; informacja, że operator się tym zajmuje |
| `failed` INFRA / `NO_CERTIFICATE` | Błąd po naszej stronie / Brak certyfikatu | Wyślij ponownie / Przejdź do ustawień KSeF, Wróć do szkicu |

Operator w `/admin/ksef`: lista naruszeń I1–I9, lista `failed` per kod, przyciski „Wyślij ponownie”, „Tylko uzgodnij”, „Wróć do szkicu” (te same RPC z `p_actor`), historia `ksef_submissions` faktury.

## 8. Różnice między stanem dzisiejszym a docelowym

| Obszar | Dziś | Docelowo | Ustalenie |
|---|---|---|---|
| kto pisze `queued` | klient po `boss.send`, bez warunku | serwer, w transakcji ze zdarzeniem | W16, W2 |
| `failed` po ponowieniach / hamulcu | zamrożone, bez wyjścia | `requeue` / `reset` + strażnik | K3, S22 |
| błąd infrastruktury przed POST | `rejected` | `failed INFRA`, ponowienie | W1 |
| `onExhausted handled:false` | `queued` na zawsze, bez Sentry | `failed` z kodem, `captureMessage`, alarm I1 | W3 |
| odrzucenie 450 / cudze 440 | wpis `sent` zostaje otwarty | zamknięcie wpisu; okno 48 h | S1 |
| dowód kontaktu w wyzwalaczach | `submitted_to_ksef_at`, `last_attempt_at` | `ksef_submissions` + `ksef_number` | 00119, 00122 |
| komunikat `KSEF_PAUSED_MESSAGE` | „wyślij ponownie” | „wyjdzie automatycznie” | K3 |
| strażnik | tylko `sending` > 15 min | I1–I9 co 15 min + raport dzienny | W3, K3 |
| narzędzia operatora | brak (`scripts/trigger-submit.ts` usunięty) | `/admin/ksef` + RPC | K3 |

## 9. Decyzje do podjęcia przez Bartosza

| # | Pytanie | Rekomendacja |
|---|---|---|
| D1 | Czy `failed TRANSIENT` ponawiać automatycznie (co 60 min przez 24 h), czy tylko ręcznie? | automatycznie; to realizuje decyzję z 02.10 „przy awarii KSeF job ponawia”, której dzisiejsze 82 minuty nie spełniają |
| D2 | Czy `rejected` może wrócić do `draft` i wyjść pod tym samym numerem? | tak; dokument odrzucony przez KSeF nie został wystawiony, a dziura w numeracji jest gorsza |
| D3 | Czy po resecie klient edytuje treść (jak szkic), czy tylko ponawia? | edytuje; bez tego W4 (za długi opis) nie ma naprawy po stronie klienta |
| D4 | Kto klika „Wyślij ponownie” / „Wróć do szkicu”: każdy członek czy owner/admin? | owner/admin (jak dane firmy), member tylko podgląd |
| D5 | Co z plikiem XML w R2 po resecie: usunąć czy kluczować po `sendAttemptId`? | kluczować po `sendAttemptId` (ścieżka `tenant/invoice/attempt.xml`), stare obiekty czyści retencja; zero ryzyka nadpisania pliku, który poszedł do KSeF |
| D6 | Czy `offline_queued` zostaje w CHECK i wyzwalaczach? | zostaje; usunięcie to osobna decyzja po rozstrzygnięciu Offline24 z prawnikiem |
