# KSeF API Error Codes (Faza 35)

Lookup dla błędów zwracanych przez API KSeF 2.0. Pełne, aktualne tłumaczenia
trzymamy w bazie (`error_translations` table) i przekładamy w UI.

> ⚠️ **Źródło prawdy:** tabela `error_translations` w DB + dokumentacja MF
> (https://ksef.mf.gov.pl). Lista niżej jest **przewodnikiem operacyjnym**
> (najczęściej widywane kody + co z nimi zrobić), nie kompletnym katalogiem.
> MF aktualizuje kody; po większych release'ach KSeF warto zsynchronizować
> `error_translations`.

## Klasyfikacja (jak ich używamy)

Każdy kod KSeF mapujemy na jedną z 4 kategorii w `lib/ksef/error-classifier.ts`:

| Klasa | Co znaczy | Reakcja Inngest |
|---|---|---|
| **CLIENT_INPUT** | Błąd po stronie user-a (zły NIP, duplikat, walidacja) | `NonRetriableError` — nie retry'ujemy |
| **AUTH** | Token wygasł, bad credentials | Refresh tokenu + 1 retry |
| **KSEF_DOWN** | KSeF zwrócił 5xx / timeout | Pełen retry schedule (30s → 1h) |
| **MAINTENANCE** | Zapowiedziana przerwa | Offline24 od razu |

## Katalog kodów wysyłki FaktFlow — kto ma wyjście (A4)

Kody `invoices.last_error_code` z katalogu `ksef_error_codes` (00131, 00141).
Zasada: każdy stan ma **wyjście** — automat (cron `ksef-lifecycle-reconcile`),
klient (przycisk na fakturze) albo operator (`/admin/ksef/<id>`). Strażnikiem
tej tabeli jest test `tests/unit/ksef-wyjscia-kodow.test.ts` (macierz kod ×
rodzaj dokumentu (FA/KOR/ZAL/ROZ) × dane do ponowienia × środowisko × data
wystawienia (dziś/wcześniej) × dowód kontaktu × otwarty wpis); ślepe uliczki
z kolumny „Luka” są w nim wypisane jawnie.

| Kod | Klasa | Skąd | Klient | Automat | Operator | Luka |
|---|---|---|---|---|---|---|
| `XSD_INVALID` | terminal | XML niezgodny z XSD | Wróć do szkicu | — | Wróć do szkicu | przy dowodzie kontaktu bez otwartego wpisu (po cudzym 440) → D-A4-1 |
| `KSEF_REJECTED` | terminal | KSeF odrzucił treść (status ≥ 400, HTTP 4xx) | Wróć do szkicu | — | Wróć do szkicu; „Tylko uzgodnij” przy otwartym wpisie | jak wyżej |
| `INVALID_DOCUMENT` | terminal | walidacja dokumentu, odwołania (`assertSubmitReferences`) | Wróć do szkicu | — | Wróć do szkicu | jak wyżej |
| `KSEF_NUMBER_TAKEN` | terminal | cudzy 440, oryginał z innego programu (treść sprawdzona, D-A4-1a) | Wróć do szkicu → usuń → wystaw z nowym numerem (albo nie wystawiaj, jeśli to ta sama sprzedaż) | — | Wróć do szkicu | — (wpisy `number_taken` nie są dowodem kontaktu) |
| `ENV_MISMATCH` | terminal (D-A4-2, 00143) | zdarzenie z innego środowiska KSeF niż skonfigurowane w workerze (zlecone na TEST, worker na PROD; albo worker bez poprawnego `KSEF_ENV`) — runner nie dotknął KSeF | Wróć do szkicu → zdecyduj, czy wysłać w obecnym środowisku (dokument specjalny: usuń szkic i wystaw od nowa z dzisiejszą datą); szkic zablokowany → pomoc FaktFlow (sprawdzamy w KSeF) | — | Wróć do szkicu (bez dowodu); „Tylko uzgodnij” tylko dla otwartego wpisu z OBECNEGO środowiska; **nigdy** „Wyślij ponownie” (baza odmawia) | przy dowodzie kontaktu bez otwartego wpisu — jak wyżej; otwarty wpis sprzed przełączenia środowiska — bez bezpiecznego wyjścia do F2 (niżej) |
| `ISSUE_DATE_PASSED` | terminal (decyzja 06.10.2026, 00147) | dokument specjalny (KOR, ZAL, ROZ) z datą wystawienia sprzed dzisiaj — worker odmówił przed wysyłką (runner) albo tuż przed plikiem (hak otwarcia sesji, po uwierzytelnieniu); ponowienie, oczekiwanie albo samo uwierzytelnienie przeniosło wysyłkę za północ, a w KSeF dokument wystawia się w dniu wysyłki. Zostaje okno samego żądania z plikiem (poniżej sekundy) | Wróć do szkicu → usuń szkic i wystaw dokument od nowa z dzisiejszą datą (szkicu dokumentu specjalnego się nie wysyła); szkic zablokowany → pomoc FaktFlow (sprawdzamy w KSeF) | — | Wróć do szkicu (bez dowodu); **nigdy** „Wyślij ponownie” (baza odmawia); kod powstaje bez otwartego wpisu (worker odmawia po uzgodnieniu, przed plikiem i zamiarem), więc nie ma czego uzgadniać | z dowodem kontaktu — brak wyjścia w panelu do B2: sprawdź dokument w KSeF i zgłoś Bartoszowi |
| `KSEF_UNAVAILABLE` | transient | 5xx, timeout | Wyślij ponownie / Wróć do szkicu (KOR/ZAL¹ tylko w dniu wystawienia; po dacie, bez danych albo przy wstrzymanym rodzaju — tylko Wróć do szkicu z powodem) | I6: co godzinę przez 24 h; KOR/ZAL¹ tylko w dniu wystawienia | Wyślij ponownie / szkic (KOR/ZAL¹ w dniu wystawienia) | — |
| `KSEF_RATE_LIMIT` | transient | 429 | jak wyżej | I6 (KOR/ZAL¹ jak wyżej) | jak wyżej | — |
| `KSEF_SESSION` | transient | 401/403, 21184 | jak wyżej | I6 (KOR/ZAL¹ jak wyżej) | jak wyżej | — |
| `INFRA` | transient | baza / PostgREST / R2 przed POST | jak wyżej | I6 (KOR/ZAL¹ jak wyżej) | jak wyżej | — |
| `CREDENTIALS_UNAVAILABLE` | transient | klucz po rotacji, deszyfrowanie | Wyślij ponownie / szkic (KOR/ZAL¹ tylko w dniu wystawienia; po dacie, bez danych albo przy wstrzymanym rodzaju — tylko Wróć do szkicu z powodem); komunikat: bez automatu | — (alarm) | napraw klucz → Wyślij ponownie (KOR/ZAL¹ w dniu wystawienia) | — |
| `TRANSIENT_EXHAUSTED` | transient | 24 h ponowień bez skutku | jak wyżej | — | Wyślij ponownie / szkic (KOR/ZAL¹ w dniu wystawienia) | — |
| `NOT_IN_KSEF` | transient | „tylko uzgodnij”: KSeF nie ma faktury (A2b) | Wyślij ponownie / Wróć do szkicu (KOR/ZAL¹ tylko w dniu wystawienia; po dacie, bez danych albo przy wstrzymanym rodzaju — tylko Wróć do szkicu z powodem) | — (decyzja o dacie: B1/B2) | Wyślij ponownie / szkic (KOR/ZAL¹ w dniu wystawienia) | — |
| `KSEF_PAUSED` | hold | wyłącznik operatora | czeka, bez przycisków (zwykła — automat po zdjęciu; KOR/ZAL¹ tylko dziś); bez danych (także zwykła), dokument specjalny po dacie albo wstrzymany rodzaj — Wróć do szkicu z powodem | I7: po zdjęciu hamulca (KOR/ZAL¹ tylko w dniu wystawienia) | Wyślij ponownie / szkic | — |
| `KOR_HOLD` | hold | hamulec korekt | brak przycisków (decyzja a); komunikat: sami nie wyślemy, napisz do pomocy FaktFlow | — (I7 wznawia tylko `KSEF_PAUSED`) | TEST: „Wyślij ponownie”¹; PROD: Wróć do szkicu (bez dowodu) | PROD z dowodem kontaktu — C4 |
| `ROZ_HOLD_RECONCILE` | hold | hamulec ROZ | brak przycisków (decyzja a); komunikat: sami nie wyślemy, napisz do pomocy FaktFlow | — (jak wyżej) | Wróć do szkicu (bez dowodu) | z dowodem kontaktu — C4 |
| `KSEF_DUPLICATE_RECONCILE` | reconcile | 440, którego automat nie rozstrzygnął: oryginał z FaktFlow o innym pliku, numer KSeF w innej fakturze firmy, oryginału nie da się pobrać (403 — token bez `InvoiceRead`; po ponowieniach 5xx/429/21164/21165) | „zajmujemy się” + dane oryginału z KSeF na karcie faktury (D-A4-1b-3, 00144) | I5 przy otwartym wpisie > 48 h (weryfikacja od nowa) | „Tylko uzgodnij” przy otwartym wpisie (powtarza weryfikację); karta `/admin/ksef/[id]`: `original_check` (powód, dane, skrót, archiwum) | bez otwartego wpisu: **ślepa uliczka** → ręczny werdykt D-A4-1b |
| `RESULT_UNCERTAIN` | reconcile | niepewny wynik, KSeF nie odpowiada | „nie wystawiaj ponownie” | I5 (A3): „tylko uzgodnij” raz na dobę, także KOR/ZAL¹ bez względu na datę | „Tylko uzgodnij” (KOR/ZAL¹ każdego dnia) / **Wyślij ponownie** (A4; KOR/ZAL¹ tylko w dniu wystawienia) | dokument specjalny po dacie wystawienia bez otwartego wpisu — do B2 |
| `INVALID_EVENT` | reconcile | zły payload zdarzenia | „zajmujemy się” | — | **Wyślij ponownie** (A4) — zdarzenie odtworzone z wiersza (KOR/ZAL¹ tylko w dniu wystawienia) | dokument specjalny po dacie wystawienia bez otwartego wpisu — do B2 |
| `ENQUEUE_LOST` | reconcile | `queued` bez zlecenia, z dowodem kontaktu (I1) | „zajmujemy się” | I5 przy otwartym wpisie > 48 h (także KOR/ZAL¹ bez względu na datę) | **Wyślij ponownie** (A4; KOR/ZAL¹ tylko w dniu wystawienia) / „Tylko uzgodnij” | dokument specjalny po dacie wystawienia bez otwartego wpisu — do B2 |
| `NO_CERTIFICATE` | setup | brak certyfikatu | Ustawienia → Wyślij ponownie (KOR/ZAL¹ tylko w dniu wystawienia; po dacie, bez danych albo przy wstrzymanym rodzaju — tylko Wróć do szkicu z powodem) | — | Wyślij ponownie | — |
| `NOT_VERIFIED` | setup | NIP niezweryfikowany | jak wyżej | — | Wyślij ponownie | — |

¹ Dokument specjalny z zapisanymi danymi, rodzaj niewstrzymany w tym
środowisku (KOR nie na PROD, ROZ nigdy — C4). I6 czeka godzinę po każdym
błędzie, więc błąd KOR/ZAL po ok. 23:00 nie zostanie ponowiony automatycznie;
ponowienie, które dojdzie do KSeF po północy, kończy się `ISSUE_DATE_PASSED`.
To samo w kolumnie „Klient” (A4b PR2b): „Wyślij ponownie” z kopii tylko
w dniu wystawienia; inaczej tylko „Wróć do szkicu” z powodem, a szkic
dokumentu specjalnego klient usuwa i wystawia dokument od nowa z dzisiejszą
datą (szkicu specjalnego się nie wysyła).

Pola raportu crona (log workera „Cykl życia: przebieg zakończony”):
`skippedNoData` — brak danych do ponowienia (zwykła bez pozycji albo stary
dokument specjalny); `skippedHeld` — rodzaj wstrzymany (w praktyce I5: KOR na
PROD, ROZ); `skippedIssueDate` — północ między odczytem a zleceniem;
`skippedConflict` — odrzucona korekta czeka na inną korektę tej samej faktury
pierwotnej (00135); utrzymujące się > 0 = sprawdź tamtą korektę.

**Dlaczego „Wyślij ponownie” operatora przy klasie reconcile jest bezpieczne**
(ENQUEUE_LOST, INVALID_EVENT, RESULT_UNCERTAIN): runner najpierw rozstrzyga
zamiar i uzgadnia otwarty wpis (A2), treść faktury z dowodem kontaktu jest
zamrożona (00132), a KSeF nie przyjmie drugiej faktury o tym samym numerze
(440 — sesja z naszej historii oznacza własny duplikat i `accepted`).
Duplikat mógłby powstać tylko po zmianie numeru, czyli po powrocie do szkicu.

**Dokumenty specjalne (KOR, ZAL, ROZ) — cron i operator od A4b PR2a, klient
od PR2b:** zdarzenie odtwarzamy z kopii na wierszu — ZAL
z `fa3_data.advanceEnvelope`, KOR/ROZ ze `special_data` (00137); te same fakty
i ten sam builder (`lib/invoices/ksef-requeue-event.ts`). Warunki (cron, panel
operatora, klient): dane zapisane; rodzaj niewstrzymany (KOR na PROD —
KOR_HOLD, ROZ wszędzie — C4); pełna wysyłka tylko w dniu wystawienia
(decyzja b, 06.10.2026); uzgodnienie (I5, „Tylko uzgodnij”) bez względu na
datę, bo nie wysyła. Ponowienie, które dojdzie do KSeF po północy, worker
zamienia w `ISSUE_DATE_PASSED` (00147). Brak danych → „Stary dokument
specjalny” niżej. Bez wyjścia do B2: dokument po dacie wystawienia bez
otwartego wpisu, z dowodem kontaktu albo kodem reconcile — sprawdź w KSeF
i zgłoś Bartoszowi.

**Klient (A4b PR2b, `lib/invoices/ksef-send-policy.ts`):**
- KOR/ZAL z kopią, rodzaj niewstrzymany, dziś data wystawienia → „Wyślij
  ponownie” jak przy zwykłej fakturze (komunikat: tylko do północy).
  Inaczej tylko „Wróć do szkicu” z powodem. Kolejność powodów: rodzaj
  wstrzymany → brak kopii → data (inna niż u operatora celowo: stary ROZ
  albo KOR na PROD nie dostaje „wystaw od nowa”, bo kolejkowanie odmówiłoby
  też nowemu dokumentowi). Szkicu dokumentu specjalnego się nie wysyła —
  klient usuwa szkic i wystawia dokument od nowa (przy wstrzymanym rodzaju
  po zdjęciu blokady).
- `KOR_HOLD`, `ROZ_HOLD_RECONCILE`: bez przycisków (decyzja a); klient
  i `last_error` workera mówią „sami jej nie wyślemy, napisz do pomocy
  FaktFlow (pomoc@faktflow.pl)” — procedura niżej.
- „Ponowimy automatycznie” w tekście nad przyciskami i znaczek „Błąd —
  ponawiamy” tylko wtedy, gdy cron naprawdę ponowi
  (`automaticResendExpected`): kod `KSEF_UNAVAILABLE`, `KSEF_RATE_LIMIT`,
  `KSEF_SESSION`, `INFRA` albo `KSEF_PAUSED`, dane zapisane, rodzaj
  niewstrzymany, KOR/ZAL tylko w dniu wystawienia. Inaczej tekst bez
  automatu, a przy kodach transient znaczek „Błąd wysyłki” (np.
  `CREDENTIALS_UNAVAILABLE`, `TRANSIENT_EXHAUSTED`, `NOT_IN_KSEF`).
- Aplikacja (id=1) bez poprawnego `KSEF_ENV`: przy kodach transient, hold
  i setup jeden komunikat „Nie możemy teraz potwierdzić środowiska KSeF…”,
  bez przycisków — napraw zmienną w Coolify.
- Odmowa „Wyślij ponownie” przy kolejkowaniu (wyłącznik, brak certyfikatu)
  zostawia fakturę z błędem wysyłki, nie szkic; strona odświeża się po
  odmowie (strona otwarta przez północ traci przycisk).
- Gdzie panel nie ma wyjścia (szkic zablokowany przy `ISSUE_DATE_PASSED`,
  `ENV_MISMATCH` albo braku kopii), klient dostaje „nie wystawiaj ponownie
  i napisz do pomocy FaktFlow — sprawdzimy w KSeF”.

### Klient pisze do pomocy FaktFlow (pomoc@faktflow.pl)

- **`KOR_HOLD` / `ROZ_HOLD_RECONCILE`:** bez dowodu kontaktu — „Wróć do
  szkicu” w `/admin/ksef/<id>` (klient usuwa szkic i po zdjęciu blokady
  wystawia dokument od nowa); z dowodem — dokument czeka na C4, odpisz
  klientowi, że nie wystawia go ponownie.
- **Szkic dokumentu specjalnego zablokowany** (`ISSUE_DATE_PASSED`, brak kopii,
  wstrzymany rodzaj z dowodem kontaktu): sprawdź dokument w KSeF i zgłoś
  Bartoszowi (B2 / C4 / D-A4-1b).
- **`ENV_MISMATCH` z zablokowanym szkicem:** sprawdź fakturę w KSeF tamtego
  środowiska i zgłoś Bartoszowi (F2, D-A4-2 niżej).

### Stary dokument specjalny (bez danych do ponowienia)

KOR/ROZ sprzed 00137 (bez `special_data`) albo ZAL sprzed 02.10.2026 (bez
`fa3_data.advanceEnvelope`). Na produkcji 05.10.2026: 0 takich dokumentów
(sekcja 9 `kontrola-faktur-ksef.sh`).

1. Tylko przy dowodzie kontaktu albo kodzie klasy reconcile; w pozostałych
   przypadkach operator klika „Wróć do szkicu”.
2. KOR/ROZ: uruchom skrypt — najpierw bez opcji (tylko sprawdza i pokazuje
   faktura + PIERWSZE zlecenie wysyłki tej faktury z pg-boss, które trzyma joby
   7 dni):
   ```bash
   ./scripts/ops/dopisz-dane-specjalne.sh <id-faktury>
   ```
   Wszystkie kolumny warunków muszą być `t`: faktura KOR/ROZ bez
   `special_data`; job tej faktury (`invoiceId`) i tej samej firmy
   (`tenantId`); środowisko joba = `KSEF_ENV` workera; treść joba = `fa3_data`;
   job niesie dane tego rodzaju. Inaczej STOP (inne środowisko — F2;
   po 7 dniach źródła nie ma — ślepa uliczka, decyzja Bartosza).
3. Zapis (NIEODWRACALNY — 00137 zapisuje `special_data` raz):
   ```bash
   ./scripts/ops/dopisz-dane-specjalne.sh <id-faktury> --wykonaj
   ```
   Jedna transakcja: te same warunki w jednym zapytaniu, zapis tylko przy
   DOKŁADNIE jednym trafionym wierszu (inaczej ROLLBACK) i wpis `audit_logs`
   `invoice.special_data_backfilled` z id joba. Wyzwalacz 00137 dopuszcza
   NULL → wartość tylko serwerowi; kształt pilnuje CHECK.
4. ZAL: tylko gdy `submitted_to_ksef_at IS NULL` i za zgodą Bartosza dla tej
   faktury (dopisanie `fa3_data.advanceEnvelope` z `data->'advanceData'`). Po
   przejęciu wysyłki (00124) `fa3_data` jest zamrożone dla każdej roli (00132)
   — 42501 = STOP, zgłoś Bartoszowi.
5. Po zapisie wiersz ma dane: I5 i „Tylko uzgodnij” przy otwartym wpisie
   sent/intent każdego dnia, I6/I7 i „Wyślij ponownie” tylko w dniu
   wystawienia; poza tym brak wyjścia do B2 (zgłoś Bartoszowi). ROZ i KOR na
   PROD czekają na C4.
6. Sekcję 9 `kontrola-faktur-ksef.sh` uruchom ponownie po wdrożeniu PR2a.

**Decyzje do podjęcia (Bartosz):**
- **D-A4-1 — cudzy 440 — PRZYJĘTA (Bartosz, 04.10.2026).** Automat (D-A4-1a)
  przy każdym 440 — w nowej wysyłce i przy uzgadnianiu po referencji:
  1. sesja oryginału w historii tej faktury **i ten sam skrót pliku** →
     nasza faktura, `accepted` z numerem oryginału (bez skrótu albo z innym
     skrótem → dalej, bo po powrocie do szkicu treść mogła się zmienić);
  2. numer KSeF oryginału ma inna faktura firmy w FaktFlow → operator;
  3. pobranie oryginału (`GET /invoices/ksef/{ksefNumber}`, `InvoiceRead`):
     bieżący plik bajt w bajt (albo wcześniejsza próba o tej samej treści)
     → `accepted`; oryginał z FaktFlow (`SystemInfo = KSeF SaaS v1.0`) o innym
     pliku → operator; oryginał z innego programu → `KSEF_NUMBER_TAKEN`
     (wszystkie wpisy duplikatu → `number_taken`, klient wraca do szkicu);
  4. pobranie się nie udało: chwilowo (5xx, 429, 401, 21164, 21165, błąd
     odczytu naszego pliku z magazynu) — ponowienie samej weryfikacji, bez
     drugiej wysyłki; trwale (403, inne 4xx) — operator.
  Wpis próby dostaje **znacznik 440** (`original_ksef_number`,
  `original_session_reference_number`, 00142) i zostaje **otwarty** (`sent`,
  dowód kontaktu) przy każdym werdykcie „do operatora” — każde kolejne
  uzgodnienie (cron I5, „Tylko uzgodnij”) weryfikuje treść od nowa i nigdy nie
  kończy się STALE / NOT_IN_KSEF. Zamyka go tylko werdykt: `number_taken` albo
  zapis akceptacji. Przy przyjęciu numeru z duplikatu `ksef_accepted_at` =
  data nadania numeru **oryginałowi** (art. 106na — wystawienie i otrzymanie):
  własna sesja — status po referencji, inaczej metadane po numerze KSeF;
  brak daty → numer przyjęty, alarm `ksef-duplicate-no-date` (operator
  uzupełnia datę z KSeF). Kierunek bezpieczny: „numer zajęty” nigdy dla oryginału
  z FaktFlow, przy tej samej treści z innego programu (ta sama sprzedaż) ani
  bez naszego pliku do porównania.
  Każdy nierozstrzygnięty werdykt zapisuje **dane oryginału** na otwartym
  wpisie próby (`ksef_submissions.original_check`, 00144): powód
  (`known-number`, `download-refused`, `download-pending`, `storage-pending`,
  `archive-pending`, `faktflow-original`, `same-content-other-program`,
  `no-own-file`, `archive-conflict`), numer, datę, nabywcę, kwotę, program, datę nadania
  numeru, skrót i — gdy oryginał pobrano, a werdykt nie zapadł — bajty
  oryginału w archiwum `<firma>/ksef-import/<numer KSeF>.xml` (ten sam klucz
  co Magiczny import). Klient widzi je na karcie faktury, operator na karcie
  w `/admin/ksef`. Ponowne sprawdzenie (cron I5, „Tylko uzgodnij”), które
  nie pobrało oryginału (503, 403), nie kasuje danych z udanego — wynik
  próby trafia do `recheck`. `archive-conflict` = w archiwum jest inny plik
  pod tym numerem KSeF: operator porównuje oba pliki, zanim cokolwiek
  zdecyduje.
  „Znany numer” (numer KSeF oryginału ma już inna faktura firmy) liczy
  tylko faktury sprzedaży — zakupowa z tym numerem nie zatrzymuje
  porównania treści (D-A4-1b-3, A0).
- **D-A4-1b — przypadki nierozstrzygnięte przez automat** (decyzje Bartosza
  04.10.2026):
  1. wcześniejsza wersja tej faktury w KSeF → przyjąć oryginał (numer
     i treść), zmiany korektą — **odłożone** do B2 (data poprawiana w tym
     samym szkicu): dziś szkic z nieaktualną datą jest usuwany i wystawiany
     od nowa, a usunięcie kasuje historię prób, więc automat nie ma dowodu;
  2. ta sama treść z innego programu → numer + trwały znacznik, baner, mail,
     ostrzeżenie w JPK (D-A4-1b-2);
  3. pozostałe → decyduje **klient** przyciskiem z danymi oryginału („ta
     sama sprzedaż” / „inna sprzedaż → nowy numer”), operator tylko zapisuje
     decyzję klienta (D-A4-1b-3, w budowie: A0 → A dane oryginału na wpisie
     → wierny import (C5a stawki P_12, C5b P_6 i adnotacje) → B decyzja → C zapis oryginału z FaktFlow → D
     „Sprawdź ponownie”). Do tego czasu operator sprawdza fakturę w KSeF
     i zgłasza ją Bartoszowi.
- **D-A4-2 — `ENV_MISMATCH`** (decyzja Bartosza 04.10.2026, przyjęta
  w 00143). Ponowienie tworzy nowe zdarzenie z BIEŻĄCYM środowiskiem, więc
  wysłałoby fakturę zleconą na TEST jako prawdziwą fakturę na PROD. Dlatego
  kod jest klasy **terminal**: faktura bez dowodu kontaktu wraca do szkicu
  (klient sam albo operator), a klient decyduje — wysyła ją w obecnym
  środowisku albo jej nie wystawia (usuwa szkic). `requeue_ksef_send` odmawia
  ponowienia (przepuszcza tylko „tylko uzgodnij”), więc ochrona nie zależy
  od przycisku. Z otwartym wpisem z wcześniejszej próby faktura mogła
  dotrzeć do KSeF: klient dostaje „nie wystawiaj ponownie”, szkic jest
  zablokowany. **Uwaga:** „Tylko uzgodnij” (i cron I5 po 48 h) uzgadnia
  w BIEŻĄCYM środowisku, a wpis `ksef_submissions` nie zna swojego (F2).
  Wpis sprzed przełączenia środowiska nic tam nie znajdzie, a `requeue`
  czyści kod — wynik (`NOT_IN_KSEF`, `NOT_VERIFIED`, `RESULT_UNCERTAIN`)
  zaprasza do ponownej wysyłki, czyli wysłania dokumentu z TEST na PROD.
  Operator nie uzgadnia tak wpisu z drugiego środowiska: sprawdza fakturę
  w KSeF tamtego środowiska i zgłasza ją Bartoszowi (wyjście — F2). Gdy worker nie ma poprawnego `KSEF_ENV`, każda wysyłka kończy
  się `ENV_MISMATCH` z komunikatem „zajmujemy się tym”: najpierw napraw
  zmienną w Coolify (worker `id=2`), potem klienci wracają do szkicu
  i wysyłają ponownie. Operator: lista w `/admin/ksef` po kodzie, alarm
  Sentry „KSeF submit event environment mismatch”.
  Przełączenie TEST → PROD (F1) musi to uwzględnić: przed zmianą `KSEF_ENV`
  hamulec i pusta kolejka, bo cron (I6, I7) wznawia `failed` z kodami
  przejściowymi i `KSEF_PAUSED` nowym zdarzeniem z bieżącym środowiskiem —
  faktury z czasu TEST wyszłyby same na PROD; wpisy `ksef_submissions` nie
  mają kolumny środowiska, więc próba z TEST wygląda po przełączeniu jak
  dowód kontaktu (F2).

## Najczęstsze kody — co znaczą, co robić

### Authentication / Authorization (21100-21199)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21100 | Invalid signature / nieprawidłowy podpis | AUTH | Sprawdź `KSEF_CREDENTIALS_ENCRYPTION_KEY`, rotated? |
| 21101 | Token expired | AUTH | `lib/ksef/auth.ts` auto-refresh; jeśli pętla — bug |
| 21102 | Invalid token format | AUTH | Patrz `ksef_sessions` — zła kolumna? |
| 21103 | Unauthorized access | AUTH | Tenant nie ma uprawnień KSeF dla tego NIP |
| 21105 | Subject context required | AUTH | Brakuje context `tenant_nip` w request — bug |

### Submit / Validation (21200-21299)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21200 | Invalid XML format | CLIENT_INPUT | Sprawdź `lib/xml/validator.ts` — walidacja XSD lokalna powinna złapać |
| 21202 | Schema validation failed | CLIENT_INPUT | XSD niezgodny — sprawdź wersję FA(3) |
| 21270 | Duplicate invoice number | CLIENT_INPUT | User próbuje wystawić tę samą fakturę 2× (unikalny `internal_number`) |
| 21280 | Invalid invoice type | CLIENT_INPUT | Generator XML wybrał zły szablon (advance/correction/final) |

### Status / UPO (21300-21399)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21301 | Invoice not found | CLIENT_INPUT | Race condition — pytamy o status faktury, której KSeF jeszcze nie przetworzył |
| 21320 | UPO not ready | (poll) | Normalne; cron `upoRetryStaleJob` próbuje co 24h |

### Infrastruktura KSeF (21900-21999)

| Kod | Znaczenie | Klasa | Akcja |
|---|---|---|---|
| 21900 | Service unavailable | KSEF_DOWN | Retry schedule; alert `#urgent` gdy > 1 h |
| 21950 | Planned maintenance | MAINTENANCE | Offline24 od razu; user dostaje QR |
| 21999 | Internal server error | KSEF_DOWN | Retry; reportuj do MF jeśli persistent |

---

## Procedura debugowania błędu KSeF

User zgłosił "moja faktura ma błąd" (`/invoices/[id]` pokazuje czerwoną banner).

### Krok 1 — Zlokalizuj invoice w DB

```sql
SELECT id, internal_number, ksef_status, ksef_error_code,
       ksef_error_message, created_at
FROM invoices
WHERE id = '<uuid z URL>'
   OR internal_number = '<numer>';
```

### Krok 2 — Sprawdź historię prób

```sql
SELECT attempt_number, status, error_code, error_message,
       request_payload, response_body, created_at
FROM ksef_submissions
WHERE invoice_id = '<uuid>'
ORDER BY created_at;
```

Pokazuje wszystkie próby: pierwsza, retry'e, finalna. Każda ma raw response
z KSeF (`response_body`).

### Krok 3 — Sprawdź czy KSeF w ogóle żył

```sql
SELECT checked_at, status, response_time_ms
FROM ksef_health_log
WHERE checked_at > now() - interval '1 hour'
ORDER BY checked_at DESC;
```

Jeśli health był OK ale faktura padła — błąd po naszej stronie (CLIENT_INPUT).
Jeśli health był DOWN — KSEF_DOWN, retry powinien już zadziałać.

### Krok 4 — Polskie tłumaczenie kodu

```sql
SELECT code, pl_message, action_hint
FROM error_translations
WHERE code = '<kod z ksef_submissions.error_code>';
```

`action_hint` to wskazówka dla user-a (np. "Sprawdź NIP nabywcy"). Jeśli brak
mapowania → dodać do `error_translations` (migracja).

### Krok 5 — Decyzja

| Wynik dochodzenia | Akcja |
|---|---|
| Bug walidacji po naszej stronie (np. zły XML) | Fix XML generator + retest na test env |
| Bad input user-a (zły NIP, duplikat) | Pokaż user-owi `action_hint`, "skoryguj i wystaw ponownie" |
| KSeF down — retry działał | Powiedz user-owi "spróbuj za chwilę", jutro powinno pójść |
| Po retries → Offline24 | User ma już QR; przypomnij że ma 24h na ręczne złożenie |

---

## Specjalne przypadki

### "Faktura w stanie processing" > 30 min

UPO normalnie przychodzi w sekundach do minut. > 30 min = albo KSeF zatkany,
albo job `downloadUpo` padł. Patrz:
```sql
SELECT * FROM upo_receipts WHERE invoice_id = '<uuid>';
SELECT * FROM inngest_run_log WHERE function_id = 'download-upo' ORDER BY created_at DESC LIMIT 10;
```

### "Wszystkie faktury z dziś mają błąd 21100"

Globalny problem auth → najprawdopodobniej rotated `KSEF_CREDENTIALS_ENCRYPTION_KEY`
bez re-encrypt sesji w `ksef_sessions`. Patrz [key-rotation.md](./key-rotation.md).

### "Faktura zaakceptowana, ale nie mam UPO"

UPO retry cron (`upoRetryStaleJob`) powinien dorzucić w ciągu 24h. Manual
trigger: `pnpm trigger:submit` (skrypt).

### "W historii wysyłek wisi zamiar `intent`" (A2, 00136)

Wpis `intent` w `ksef_submissions` powstaje po otwarciu sesji KSeF, PRZED
wysłaniem pliku. Jeśli został otwarty, odpowiedź na wysyłkę nie dotarła
(timeout, restart workera, błąd zapisu) i nie wiadomo, czy KSeF ma plik.

- **Co widzi klient:** faktura `failed` z kodem z katalogu; „Wróć do szkicu”
  jest zablokowane (zamiar to dowód kontaktu — treści nie wolno zmienić,
  dopóki nie wiadomo, co ma KSeF).
- **Co robi automat:** każda następna próba wysyłki (przycisk „Wyślij
  ponownie”, cron ponowień) najpierw zamyka tamtą sesję i pyta KSeF o jej
  faktury (`GET /sessions/{ref}/invoices`): plik jest → wpis `sent`
  i uzgodnienie po numerze referencyjnym; sesja pusta → `abandoned`
  (`error_code = NOT_IN_SESSION`) i wysyłka od nowa. Nigdy drugi POST.
- **Co klika operator:** `/admin/ksef/<id>` → „Tylko uzgodnij” (działa przy
  `sent` i przy `intent`). Po rozstrzygnięciu faktura jest `accepted`, albo —
  gdy KSeF jej nie ma i nie zostaje żaden dowód kontaktu — `failed
  NOT_IN_KSEF` (A2b, 00141): klient i operator mogą „Wyślij ponownie” albo
  „Wróć do szkicu”. Gdy inny dowód kontaktu zostaje (np. wpis `duplicate`),
  wynik to `RESULT_UNCERTAIN` dla operatora.
- **`NOT_IN_KSEF`** (klasa transient, bez automatu): KSeF potwierdził, że
  nie ma faktury z poprzedniej wysyłki. Cron NIE wysyła jej sam — ponowna
  wysyłka po kilku dniach to decyzja o dacie wystawienia (B1/B2 planu).
  Klient widzi: „KSeF nie ma tej faktury — poprzednia wysyłka do niego nie
  dotarła. Wyślij ją ponownie albo wróć do szkicu.”
- **Strażnik:** zamiar (albo wpis `sent`) starszy niż 48 h przy fakturze
  poza `sending` to I5. KSeF odpowiadający na pytanie o sesję kodem 21173
  („Brak sesji”) po 48 h zamyka zamiar jako `abandoned` z kodem `STALE`.
- **Cron (A3):** przy I5 i fakturze `failed`/`rejected` cron cyklu życia sam
  zleca „Tylko uzgodnij” (aktor NULL w audycie, `reconcile_only = true`),
  najwyżej raz na dobę. Po trzech próbach w tygodniu przestaje
  (`i5NeedsOperator` w logu crona, ostrzeżenie w Sentry) — wtedy operator:
  karta faktury, historia wysyłek i ślad audytu pokazują, co KSeF odpowiadał.
  I5 przy fakturze w innym stanie (np. `accepted` z niezamkniętym wpisem)
  cron tylko liczy (`i5Other`) — to sprawa dla operatora.

---

## Aktualizacja `error_translations`

Po większym release KSeF (zwykle co kwartał MF publikuje nowe kody):

1. Pobierz aktualną listę z dokumentacji MF.
2. Diff z `error_translations` w DB.
3. Nowa migracja `00XXX_ksef_error_codes_<data>.sql` z INSERT-ami /
   UPDATE-ami.
4. Migracja na produkcję ręcznie wg `AGENTS.md`, „Wgrywanie migracji na produkcję” (`pnpm db:push:prod` NIE działa), potem wdrożenie web i worker.

## Powiązane

- [sentry-error-codes.md](./sentry-error-codes.md) — szerszy patron error-handling
- [docs/architecture/ksef-flow.md](../architecture/ksef-flow.md) — pełny flow
- [ADR-0004](../adr/0004-ksef-retry-i-offline24.md) — retry schedule
- `lib/ksef/error-classifier.ts` — klasyfikator kodów
- Tabele: `ksef_submissions`, `error_translations`, `ksef_health_log`
