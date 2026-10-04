# Plan „zero zgubionych faktur” — ostatnia runda napraw wysyłki KSeF

Stan na 04.10.2026. Właściciel: Bartosz. Wykonawcy: sesje agenta (jedna
sesja = jeden blok albo jedna sesja z tego planu). Obowiązuje
**„Protokół naprawy błędu”** z `AGENTS.md` bez wyjątków: czerwony test
na prawdziwej ścieżce → naprawa → `pnpm run ci && pnpm build` → PR według
szablonu → raport i stop. Ten plan mówi *co* i *w jakiej kolejności*;
protokół mówi *jak*.

> Jak zacząć sesję z tego planu: „Kontynuuj plan zero zgubionych faktur,
> sesja N”. Sesja czyta ten plik, `docs/architecture/cykl-zycia-faktury-ksef.md`
> i raport rewizji `docs/automation/13_REWIZJA_2026-10-03.md` (plik poza
> gitem — jeśli go nie ma, poproś Bartosza), robi TYLKO swoją sesję, na
> końcu dopisuje w sekcji 9 wiersz „zrobione / co zostało” i numer PR.

---

## 1. Cel i definicja sukcesu

**Cel biznesowy:** klient FaktFlow nigdy nie dostaje kary ani odsetek
z powodu tego, co zrobiła (albo czego nie zrobiła) aplikacja.

**Co oznacza „faktura zgubiona po cichu”:** stan faktury w FaktFlow różni
się od stanu prawnego (KSeF, termin wystawienia, treść dokumentu), a przez
15 minut nikt — ani automat, ani klient, ani operator — nie dostał o tym
sygnału **z wyjściem** (co zrobić). Każdy taki przypadek to kandydat na karę:
faktura nie wystawiona w terminie (art. 106na), wystawiona dwa razy
(duplikat w KSeF), wystawiona z błędną treścią (korekta liczona od złego
stanu, zła stawka, zły nabywca), bez dowodu (UPO/XML) albo w złym
środowisku (TEST zamiast PROD).

**Definicja sukcesu (mierzalna, do odhaczenia w sekcji 8):**

1. Każdy stan końcowy faktury wychodzącej ma **wyjście**: automat (cron),
   klient (przycisk z komunikatem, co dalej) albo operator (`/admin/ksef`).
   Żaden kod błędu z katalogu `ksef_error_codes` nie jest ślepą uliczką.
2. Strażnik `ksef_lifecycle_violations()` zwraca **0 wierszy** przez 14
   kolejnych dni produkcji, a alarm „Strażnik cyklu życia” nie odezwał się
   ani razu bez znanej przyczyny.
3. Każda faktura `accepted` ma w ciągu 24 h numer KSeF, plik XML tej
   próby, wpis `xml_documents` i UPO (I3 = 0).
4. Każdy dokument, który wychodzi do KSeF, przeszedł **ten sam** zestaw
   kontroli treści, co formularz: granice XSD, data wystawienia, stawki,
   nabywca — nie ma pola, które formularz przepuszcza, a KSeF odrzuca.
5. Scenariusze z sekcji 7 (duplikat 440, odrzucenie 450, zabity worker
   w trakcie `sending`, awaria bazy w kolejkowaniu, reset + poprawa + ponowna
   wysyłka, druga korekta) są **zautomatyzowane na prawdziwym KSeF TEST**
   i przechodzą w CI co tydzień.
6. Przełączenie TEST → PROD ma runbook przećwiczony na kopii bazy.

Czego ten plan nie obiecuje: zera błędów w aplikacji. Obiecuje, że błąd
w wysyłce **nie zostaje niewidoczny** i **nie kończy się karą**, bo każda
ścieżka ma kontrolę przed wysyłką, uzgodnienie po wysyłce i alarm w środku.

---

## 2. Zasady tej rundy (uzupełnienie protokołu z AGENTS.md)

Lekcje z 03–04.10.2026, które kosztowały realny czas:

1. **Jeden PR od `origin/main`, bez stosów.** Stos PR na GitHubie nie
   przestawia bazy po scaleniu bazowego; dwa razy treść poszła do gałęzi
   zamiast do `main` (#206, #208). Kolejny PR dopiero po scaleniu
   poprzedniego, albo po `gh pr edit N --base main` zrobionym przez agenta.
2. **Plik `'use server'` eksportuje wyłącznie funkcje asynchroniczne.**
   Komunikaty, typy, czyste funkcje idą do `lib/**`. `pnpm typecheck`
   tego nie łapie, `pnpm build` tak — dlatego build jest obowiązkowy
   przy każdym dotknięciu akcji, nie tylko `app/`.
3. **Fixture zdarzenia = pełny, poprawny payload** (`sendAttemptId` jako
   UUID, faktura z `finalizeInvoice`). Niepoprawny payload w teście kończy
   się `INVALID_EVENT` i udaje inny błąd.
4. **Testy na bazie dla wszystkiego, co ma wyzwalacz, RPC albo RLS**
   (`tests/rls-*.test.ts`, job CI „RLS isolation”). DELETE z roli klienta
   może skończyć się „0 wierszy” przez RLS zanim dojdzie do wyzwalacza —
   asercja sprawdza skutek (wiersz zostaje), nie konkretny kod błędu.
5. **Test niestabilny pod pełnym biegiem to defekt testu** (S22 z
   `vi.resetModules`). Naprawia się go osobnym, małym PR od razu.
6. **Czyste moduły dla decyzji współdzielonych** (`lib/invoices/ksef-send-policy.ts`,
   `lib/admin/ksef-operator-policy.ts`, `lib/ksef/send-error-classes.ts`):
   przycisk i akcja podejmują tę samą decyzję z tej samej tabeli.
7. **Bez `vi.resetModules`/`vi.doMock` w locie** — stan testu steruje się
   hoisted wartością w jednej atrapie.
8. **Migracje:** numer z rejestru, nagłówek „przed/PO wdrożeniu”, zero
   `DROP TABLE/COLUMN`, `UPDATE` na danych tylko za zgodą; typy bazy po
   wgraniu generowane z produkcji (odstępstwo tylko jawne, z domknięciem
   w następnym PR — jak #215 → #217).
9. **Operator ma wyjście dla każdego kodu klasy reconcile.** Zanim
   dodasz nowy kod albo blokadę, dopisz go do tabeli w `/admin/ksef`
   (`lib/admin/ksef-operator-policy.ts`) i do `docs/runbooks/ksef-error-codes.md`.
10. **Produkcja czytana tylko skryptem** `scripts/ops/kontrola-faktur-ksef.sh`
    i procedurami z `AGENTS.md`; żadnych ręcznych odczytów danych klientów
    poza nimi.

---

## 3. Stan wyjścia (co już jest)

Zrobione i wdrożone 03–04.10.2026 (migracje 00131–00134 na db-1):

| Obszar | Co | PR |
|---|---|---|
| Katalog kodów i RPC przejść | `ksef_error_codes`, `enqueue/requeue/reset/release_ksef_send`, `ksef_has_contact_evidence`, strażnik I1–I5, I9 | #202 |
| Worker | klasyfikacja błędów jednym katalogiem; `rejected` tylko dla błędu treści; kody i zwolnienie przejęcia przy każdej porażce; zamykanie historii po 450/440; oczekiwanie bez zużycia próby | #204 |
| Kolejkowanie | `draft → queued` w jednej transakcji z zleceniem pg-boss; klient nie pisze `ksef_status` | #205 |
| Klient | „Wyślij ponownie” / „Wróć do szkicu” wg klasy kodu i roli; etykiety stanu | #206/#207 |
| Operator | `/admin/ksef`: naruszenia, `failed` per kod, karta faktury, „Wyślij ponownie / Tylko uzgodnij / Wróć do szkicu” | #208/#209 |
| Wyzwalacze | 00132: klient nigdy nie zmienia stanu; diagnostyka nie zamraża treści | #210 |
| Automat | cron co 15 min: I1, ponowienia klasy transient przez 24 h, wznowienie po hamulcu; raport dzienny; alarm strażnika; martwe kolejki usunięte | #211 |
| Korekty | 00133 + 00135: jedna korekta w toku; łańcuch korekt — „stan przed” po ostatniej przyjętej KOR (prawdziwe K4) | #212, #217 |
| Magazyn XML | klucz per próba (D5), wpis `sent` zna swój plik, retencja prób | #215 |
| Uzgodnienie | tryb „tylko uzgodnij” w runnerze; okno 48 h dla zalegających wpisów `sent` (STALE) | #216 |
| Wcześniej | K1 (faktura za abonament), K2 (skrzynka: kategoryzacja i XML), W1, W2, W3, W16, S1, S14, S22 | #199–#201, #213, #214 |

#216 i #217 scalone 04.10.2026; 00135 wgrana na db-1 04.10 (strażnik 0),
worker i aplikacja wdrożone na `2dbf13a` (razem z A1, #219). Hamulce nadal włączone na PROD: `KOR_HOLD` (korekty),
`ROZ_HOLD` (faktury rozliczające), Offline24 wyłączony (AUD-14).

Nienaprawione z rewizji (tematy tego planu): W4–W15, S2–S13, S15–S21, S23,
NISKIE.

---

## 4. Mapa źródeł kar — skąd realnie bierze się kara

| # | Mechanizm kary | Dziś chroni | Luka | Sesja |
|---|---|---|---|---|
| M1 | Faktura nie trafiła do KSeF w dniu wystawienia (art. 106na: datą wystawienia jest data przesłania; faktura „z wczoraj” wysłana dziś to dokument offline wymagający trybu i oznaczeń) | kontrola „dziś” w zwykłej fakturze i szkicu; automat ponawia przez 24 h | ZAL/KOR/ROZ bez kontroli „dziś” (W5); faktura `failed` przez noc wychodzi nazajutrz **z wczorajszą datą** bez trybu offline; brak decyzji, co robić po północy | A1, B1, B2 |
| M2 | Duplikat w KSeF (ta sama faktura dwa razy) | uzgodnienie po referencji przed POST, 440 → własny duplikat, `singletonKey`, przejęcie 00124 | okno POST → zapis referencji (awaria między) → 440 bez sesji w historii → `failed KSEF_DUPLICATE_RECONCILE` (wyjście operatora, nie automatu) | A2, H1 |
| M3 | Błędna treść dokumentu przyjęta przez KSeF (stawka, nabywca, kwoty korekty) | XSD lokalnie; AUD-03/21 sumy różnicy; łańcuch korekt (#217) | W4 (granice XSD w ZAL/KOR), W6 (`unit` > 20), W7 (`zw` w KOR), W8 (prefiks PL dla UE/np II), S6 (sprzedawca z przeglądarki w KOR), S7 (paszport = PL), S8 (VAT-UE) | C1–C4 |
| M4 | Faktura w złym środowisku (TEST na PROD lub odwrotnie) | `ksef_environment` na wierszu, ENV_MISMATCH, 00117 | go-live: przełączenie `KSEF_ENV` bez runbooku (W15, S13) | F1 |
| M5 | Brak dowodu (UPO/XML) przy kontroli | `xml_documents`, UPO job, I3 | W12 (UPO wiecznie ponawiane bez limitu / nigdy), D5 wdrożone ale bez kontroli skrótu w PDF dla starych plików | D1 |
| M6 | Awaria KSeF dłuższa niż doba | ponowienia 24 h → `TRANSIENT_EXHAUSTED` | brak trybu offline na PROD (AUD-14) = po dobie klient musi wiedzieć, że musi działać ręcznie; brak komunikatu w aplikacji o awarii | B2, B3 |
| M7 | Faktury przychodzące nie odebrane (VAT naliczony, terminy) | skrzynka co 15 min, backfill, alarm > 6 h | W10 (`isTruncated` na ostatniej stronie), S12 (legacy bez środowiska zatrzymuje skrzynkę) | E1 |
| M8 | JPK/KPiR z błędnych danych | sumy różnicy w KOR; XSD JPK | W9 (`P_12` surowe z importu wywala JPK), S18/S19 (eksport/pulpit padają na jednym dokumencie) | C5, F2 |
| M9 | Zabity worker / restart w trakcie wysyłki | heartbeat pg-boss, przejęcie 15 min, uzgodnienie po referencji | S4 (graceful 30 s vs SIGKILL 10 s → podwójne wykonanie jobów bez idempotencji poza wysyłką) | G1 |
| M10 | Operator nie wie, że coś stoi | alarmy krytyczne, raport dzienny | S2 (sonda zdrowia KSeF martwa bez Redisa), brak runbooku per kod | G2, I2 |

---

## 5. Sesje

Każda sesja: **1 PR** (wyjątkowo 2, gdy migracja musi iść osobno),
czerwony test najpierw, DoD z tabeli. „Dni” to orientacyjny czas sesji
agenta z weryfikacją Bartosza, nie obietnica.

### Blok A — domknięcie cyklu życia (wysyłka nie ginie)

**A1. Data wystawienia a dzień wysyłki — jedna reguła dla wszystkich dokumentów (M1, W5)**
- Problem: zwykła faktura i szkic wymagają `issueDate == dziś (Europe/Warsaw)`;
  ZAL, KOR, ROZ nie (`advance-actions.ts`, `correction-actions.ts`,
  `final-actions.ts`), a formularz zaliczki liczy datę w UTC.
- Czerwony test: `saveAndSendAdvanceAction` z `issueDate` wczorajszą
  przechodzi dziś → ma odmówić z tym samym komunikatem co `draft-actions.ts:77`.
  Test formularza (`tests/unit/daty-formularzy-warszawa.test.ts:59-63`
  utrwala błędne zachowanie — poprawić, nie dopisać).
- Zakres: wspólna funkcja `assertIssueDateIsToday(invoice)` w
  `lib/invoices/issue-date.ts`, użyta w 5 akcjach; formularze ZAL/KOR/ROZ
  z `todayInWarsaw`.
- DoD: wszystkie akcje tworzące i szkic odmawiają innej daty; raport
  w PR z listą miejsc.

**A2. Okno POST → zapis referencji (M2)**
- Problem: `recordKsefSubmissionSent` idzie po odpowiedzi na POST; awaria
  między POST a INSERT = wysłana faktura bez wpisu `sent` → kolejna próba
  wysyła drugi raz → 440 bez sesji w historii → `failed` dla operatora.
- Czerwony test: `submitInvoiceFullFlow` z `recordKsefSubmissionSent`
  rzucającym po udanym POST, potem druga próba → oczekiwane: druga próba
  **nie** robi POST, tylko uzgadnia (po zapisie „zamiaru” przed POST).
- Rozwiązanie: wpis `ksef_submissions` ze statusem `intent` (nowy, 00136)
  PRZED POST, z `sendAttemptId` i kluczem XML; po odpowiedzi `sent`
  z referencjami; runner traktuje `intent` starszy niż 15 min bez referencji
  jak „nie wiadomo, co KSeF dostał” → uzgodnienie po **numerze faktury
  sprzedawcy i NIP** (zapytanie o faktury sesji/listę) zanim wyśle.
  Jeśli API KSeF 2.0 nie daje wyszukania po numerze — zostaje 440 jako
  siatka, ale wpis `intent` zapewnia, że sesja z 440 jest „własna”.
- DoD: scenariusz „awaria po POST” kończy się `accepted` z numerem KSeF
  bez drugiego POST; test na KSeF TEST w H1.

**A3. Tryb „tylko uzgodnij” i STALE — domknięcie po #216**
- Po scaleniu #216: cron I5 (zalegające `sent`) może zlecać uzgodnienie
  automatycznie (`requeue_ksef_send(reconcile_only)`), bo runner nie wyśle
  od nowa; dopisać do `ksef-lifecycle-reconcile.ts` z limitem 1 próba /
  dobę / faktura i alarm po trzeciej.
- Czerwony test: runner cyklu życia z wierszem `failed RESULT_UNCERTAIN`
  + `sent` sprzed 3 dni → jedno zlecenie `reconcileOnly`.
- DoD: I5 znika z listy „tylko alarm”; `/admin/ksef` pokazuje wpisy STALE.

**A4. Kody bez wyjścia — przegląd katalogu**
- Dla każdego z 19 kodów: tabela (kod → kto ma wyjście → gdzie przycisk →
  test) w `docs/runbooks/ksef-error-codes.md`. Dziś bez pełnego wyjścia:
  `ENQUEUE_LOST`, `ENV_MISMATCH`, `INVALID_EVENT` (operator ma tylko
  „Tylko uzgodnij” / szkic); `KOR_HOLD`, `ROZ_HOLD_RECONCILE` (dokumenty
  specjalne bez odtwarzalnego zdarzenia).
- Zakres: `correction_data`/`advance_data`/`final_data` jsonb na wierszu
  faktury (00137) zapisywane przy tworzeniu dokumentu specjalnego → zdarzenie
  wysyłki da się odtworzyć → „Wyślij ponownie” i cron działają też dla KOR/ZAL/ROZ.
- Czerwony test: `decideResend` dla `failed KOR_HOLD` korekty po zdjęciu
  hamulca → dozwolone; runner odtwarza XML identyczny (skrót) z pierwszej próby.
- DoD: `operatorInvoiceButtons` i `failedInvoiceButtons` nie mają gałęzi
  „dokument specjalny: tylko szkic”.
- Podział (04.10.2026): **A4a** — katalog wyjść (tabela w runbooku,
  macierz `tests/unit/ksef-wyjscia-kodow.test.ts`, „Wyślij ponownie”
  operatora dla ENQUEUE_LOST / INVALID_EVENT / RESULT_UNCERTAIN, akcja
  = przycisk); **A4b** — dane specjalne na wierszu (00137) i ponowienie
  KOR/ZAL/ROZ; decyzje D-A4-1 (cudzy 440) i D-A4-2 (ENV_MISMATCH) w runbooku
  `ksef-error-codes.md`.

**A5. Ślad per próba — kontrakt danych dla centrum dowodzenia (M10)**
- Problem: porażka przed POST (poświadczenia, XML, upload, przejęcie) nie
  zostawia wiersza w `ksef_submissions`; na fakturze zostaje tylko ostatnia
  (`last_error*`), więc historia prób nie istnieje w bazie, a operator
  i centrum dowodzenia (osobny tor Masła/Codexa,
  `CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md`) nie widzą, ile razy i na czym
  faktura padła.
- Czerwony test: runner z `KsefCredentialsError` → oczekiwany wiersz
  `ksef_submissions` ze `status = failed`, `stage = credentials`,
  `send_attempt_id` zdarzenia; druga próba tej samej faktury nie traktuje
  go jako otwartej wysyłki.
- Zakres (po A2, bo A2 wprowadza wiersz `intent`): kolumny
  `send_attempt_id` (UNIQUE), `stage`, `error_class`, `job_id`,
  `worker_sha`, `sentry_event_id`, `ksef_http_status` (numer z rejestru,
  przed wdrożeniem); wiersz tworzony na początku próby i uzupełniany;
  `findOpenKsefSubmission` filtruje `status IN ('sent','intent')`; jedna
  linia JSON per etap w logu workera; `ops_alert_log` zapisywany
  w `markAlertDelivered` monitora alarmów (decyzja D7 briefu).
- DoD: każda próba (udana i nie) ma dokładnie jeden wiersz; test na bazie
  dla UNIQUE i filtra otwartej wysyłki; `/admin/ksef/[id]` pokazuje próby
  sprzed POST. Kontrakt kolumn uzgodniony w `CLAUDE-DO-CODEXA.md` (C-22)
  PRZED tą sesją.

### Blok B — awaria KSeF i tryb offline (M1, M6) — najgroźniejsze prawnie

**B1. Decyzja prawna i produktowa (Bartosz + prawnik, bez kodu)**
- Pytania do rozstrzygnięcia i zapisania w `docs/architecture/cykl-zycia-faktury-ksef.md`
  sekcja 9: (a) co robimy z fakturą, która nie wyszła w dniu wystawienia —
  tryb offline24 z kodem QR II i certyfikatem offline, czy nowy dokument
  z nową datą (klient decyduje?); (b) czy w ogóle oferujemy Offline24 na
  PROD; (c) jak komunikujemy klientowi awarię KSeF (baner, mail).
- Bez tej decyzji sesje B2–B3 nie startują.

**B2. Północ: co z fakturami `queued`/`failed`, które nie wyszły tego dnia**
- Dziś: automat ponawia do 24 h; faktura z datą wczorajszą wychodzi nazajutrz
  jako zwykła (KSeF przyjmie, ale prawnie to dokument offline bez oznaczeń).
- Zakres (wg B1): cron o 23:45 Europe/Warsaw oznacza niewysłane faktury
  z dzisiejszą datą: albo wstrzymuje je (`failed ISSUE_DATE_PASSED`, nowy
  kod klasy terminal — klient wraca do szkicu i wystawia z nową datą), albo
  przełącza w tryb offline (jeśli B1 = tak). Komunikat w aplikacji i mail.
- Czerwony test: faktura `failed INFRA` z `issue_date = wczoraj` nie jest
  ponawiana przez automat; klient widzi dlaczego i co zrobić.

**B3. Sonda zdrowia KSeF bez Redisa (S2) i baner awarii**
- Problem: `ksef-health-check` nic nie zapisuje bez Redisa; `isKsefHealthy`
  zawsze `true`; alarm „KSeF niedostępny” martwy.
- Zakres: zapis do `ksef_health_log` (tabela istnieje) przy każdym pingu;
  `isKsefHealthy` z bazy; baner na pulpicie „KSeF niedostępny od HH:MM —
  wysyłki ponawiamy automatycznie” z `lib/ksef/health-status.ts`.
- Czerwony test: `tests/unit/*health*` z atrapą bez Redisa → log w bazie,
  `isKsefHealthy === false` po 3 porażkach.

### Blok C — treść dokumentu (M3, M8)

**C1. Granice XSD w formularzach ZAL/KOR/ROZ (W4, W6)**
- `lib/validators/invoice-validators.ts` vs `lib/schemas/invoice-form.ts`:
  P_7/P_7Z 512, `PrzyczynaKorekty` 256, adres 512, znaki sterujące, `unit`
  ≤ 50 (baza VARCHAR(50)); dziś faktura pada w jobie jako `failed` z technicznym
  komunikatem.
- Czerwony test: generator FA(3) + XSD dla każdej granicy (golden files
  w `tests/xml/`); formularz odmawia tych samych wartości.
- DoD: jeden moduł granic (`lib/xml/fa3-limits.ts`) importowany przez
  schematy formularzy, walidatory i generatory.

**C2. Nabywca i sprzedawca — prawda w dokumencie (W8, S6, S7, S8)**
- W8: `Podmiot1/PrefiksPodatnika = PL` dla UE / np II w XML, JPK_FA `P_4A`, PDF.
- S6: sprzedawca w KOR z `requireTenantSeller` (jak ZAL/ROZ), nie z przeglądarki.
- S7: paszport nabywcy → `KodKraju` z formularza, nie `PL` na sztywno.
- S8: VAT-UE per kraj (`lib/invoices/vat-ue.ts`): wzorce krajowe, AT z „U”,
  bez spacji/prefiksu podwójnego.
- Czerwony test: po jednym na pozycję (XSD + golden); DoD: PDF, XML, JPK
  pokazują to samo.

**C3. `zw` w korektach i firmy zwolnione z VAT (W7)**
- Problem: firma z art. 113 nie wystawi żadnej korekty (`zw` w wierszach =
  „wymagane ręczne uzgodnienie”).
- Zakres: KOR ze stawką `zw` i podstawą zwolnienia (P_19/P_19A) w generatorze
  korekt; walidator dopuszcza `zw` z podstawą; komunikat fail-closed mówi
  o `zw`, dopóki generator nie przejdzie XSD.
- Czerwony test: korekta „przed/po” z `zw` → XML przechodzi XSD i ma P_19A.

**C4. Zdjęcie `KOR_HOLD` i `ROZ_HOLD` (po C1–C3 i #217)**
- Checklista przed zdjęciem: łańcuch korekt (#217) wdrożony; C1–C3 scalone;
  H1 przeszedł scenariusze korekt na KSeF TEST (pierwsza, druga, 440, 450);
  ROZ: 00125 (jedna ROZ na zaliczkę) + `assertSubmitReferences` + test TEST.
- Zdjęcie = PR zmieniający `isCorrectionHeldForEnv` / `roz-submission-hold.ts`
  + wpis w `docs/runbooks/hamulce-ksef.md`; cron I7 wznawia `KOR_HOLD`
  (po A4 także dla korekt).
- DoD: pierwsza korekta klienta na PROD przyjęta z UPO; strażnik 0.

**C5. Import historii i JPK (W9, S18, S19)**
- W9: normalizacja `P_12` w `lib/import/fa3-parser.ts` (np II, np I, 0 KR,
  0 WDT) + ewentualny `UPDATE` istniejących wierszy **za zgodą** (migracja
  z licznikiem `SELECT count(*)` w nagłówku).
- S18/S19: eksport i pulpit nie padają na jednym dokumencie — błąd per
  dokument z nazwą, reszta liczy się dalej.
- Czerwony test: JPK_V7M dla miesiąca z jedną zaimportowaną fakturą „np II”.

### Blok D — dowody (M5)

**D1. UPO dla każdej przyjętej faktury (W12, I3)**
- Problem: `upo-retry-stale` bez limitu prób, trwale nieudane wypychają nowe.
- Zakres: `download_attempts` z limitem i wykluczeniem kodów nieretryowalnych;
  po limicie `failed` UPO z kodem i wyjście operatora w `/admin/ksef` (karta
  faktury: „Pobierz UPO ponownie”); I3 w strażniku rozdzielone na „bez UPO
  < 24 h” (ostrzeżenie) i „> 24 h” (naruszenie).
- Czerwony test: 60 wpisów UPO: 50 trwale 4xx, 10 świeżych — świeże
  pobrane w jednym przebiegu.

**D2. Dowód treści: skrót XML w każdym PDF i w portalu**
- PDF z KOD I liczy skrót z pliku próby (D5); dla faktur sprzed D5 — z pliku
  historycznego; brak pliku = PDF bez kodu z wyraźnym komunikatem (B14 jest),
  plus alarm I3.
- Czerwony test: `generateInvoicePdf` dla faktury z `xml_storage_path` próby.

### Blok E — faktury przychodzące (M7)

**E1. Skrzynka bez luk (W10, S12, S9)**
- W10: `isTruncated` honorowany niezależnie od `hasMore` (`lib/ksef/inbox.ts:105-115`).
- S12: legacy wiersz bez `ksef_environment` w oknie kursora — uzgodnienie
  per firma w `/admin` zamiast zatrzymania skrzynki (fail-closed z wyjściem).
- S9: PDF faktury ze skrzynki nie rzuca 500 — podgląd z `fa3_data` albo
  komunikat „oryginał XML w KSeF”.
- Czerwony test: skrzynka z 10 001 faktur w oknie (atrapa) → 10 001 wierszy,
  HWM nie przeskakuje.

**E2. Magiczny import odporny na jedną złą fakturę (S11)**
- Jedna faktura w EUR / nakładka ze skrzynką nie wywala paczki; błąd per
  dokument w raporcie importu.

### Blok F — go-live (M4, M8)

**F1. Runbook przełączenia TEST → PROD (W15, S13)**
- Dziś przełączenie `KSEF_ENV` wyłączy KPiR, eksporty i stronę zaległości
  u firm z fakturami przyjętymi na TEST; zmiana `ksef_environment` tylko
  rolą `postgres`.
- Zakres: `docs/runbooks/go-live-ksef-prod.md` (kolejność: hamulce, flagi,
  env obu aplikacji, weryfikacja), oznaczenie faktur TEST per firma
  (kolumna/filtr), komunikaty zamiast wyjątków na pulpicie; przećwiczone
  na kopii bazy (I3).
- DoD: próbne przełączenie na kopii bez „Coś poszło nie tak”.
- Z D-A4-2 (04.10.2026): przed zmianą `KSEF_ENV` hamulec i pusta kolejka,
  a faktury `failed` z kodami przejściowymi i `KSEF_PAUSED` rozstrzygnięte
  (szkic albo wysyłka na TEST) — cron I6/I7 wznawia je nowym zdarzeniem
  z bieżącym środowiskiem, więc po przełączeniu wyszłyby same na PROD.
  Worker i aplikacja przełączane razem (zdarzenie z drugiego środowiska =
  `ENV_MISMATCH`, wyjście: szkic i decyzja klienta).

**F2. Firma z fakturami TEST po go-live**
- Widok „dokumenty testowe” oddzielony od księgowych; portal księgowej
  bez faktur TEST (S10); eksporty tylko PROD.

### Blok G — joby i odporność (M9, M10)

**G1. Zabity worker (S4)**
- `stopBoss({ timeout })` dopasowane do czasu łaski kontenera (Coolify
  10 s) + idempotencja jobów, które dziś dublują: sekwencja maili próbnych
  (W14, klucz `seq/<userId>/<stage>`), przypomnienia, eksporty.
- Czerwony test (chaos, H2): SIGKILL w trakcie `submit-invoice` po POST →
  po restarcie uzgodnienie, nie drugi POST.

**G2. Równoległość i kolejność (S3, S16)**
- `localConcurrency` zamiast `batchSize` tam, gdzie Inngest miało `concurrency.limit`;
  bramka `/wdroz` wdraża worker PRZED webem (jak AGENTS.md).

**G3. Retencja bez półśrodków (W13)**
- Referencje (FK) sprawdzane przed kasowaniem plików; DELETE per faktura;
  pliki prób (D5) w jednym przebiegu z wierszem.

### Blok H — prawdziwy KSeF TEST w CI (klucz całego planu)

Dotąd wszystko było dowodzone na atrapach. Bez tego bloku każda kolejna
rewizja znajdzie „~45 defektów przy zielonych testach”.

**H1. E2E na KSeF TEST (cotygodniowo, konto testowe FaktFlow)**
- Workflow `ksef-test-e2e.yml` (ręczny + harmonogram): środowisko TEST,
  firma testowa z certyfikatem/tokenem w sekretach GitHub, baza lokalna
  (jak „RLS isolation”) + worker w procesie.
- Scenariusze (każdy = test z asercjami na bazie i w KSeF): wysyłka VAT
  → `accepted` + UPO; duplikat 440 (ta sama faktura dwa razy) → własny
  duplikat; odrzucenie 450 (błąd semantyczny) → `rejected` + wpis zamknięty;
  reset → poprawa → ponowna wysyłka (nowy klucz XML); korekta „przed/po”
  → druga korekta (łańcuch) → sumy; uzgodnienie po referencji (POST bez
  odczytu statusu); „tylko uzgodnij”; nieznana sesja → **tu ustalamy
  prawdziwy kod odpowiedzi** i wpisujemy do `KSEF_SUBMISSION_STALE_*`.
- DoD: raport w CI z kodami odpowiedzi KSeF; każdy scenariusz zielony
  3 tygodnie z rzędu przed wydaniem.

**H2. Chaos na kopii bazy (game day)**
- Skrypt `scripts/ops/game-day.sh` (na kopii, nigdy na produkcji): zabij
  worker w `sending`; odetnij R2 w uploadzie; odetnij bazę w `enqueue`;
  wyłącz PostgREST na 2 min; zmień klucz szyfrowania bez `_PREVIOUS`.
  Po każdym: strażnik, `/admin/ksef`, alarmy — wszystko ma wskazać fakturę
  i wyjście.
- DoD: tabela „awaria → sygnał w ≤ 15 min → wyjście” bez pustych pól.

### Blok I — operacje

**I1. Rotacja kluczy (dług z Vercela)**
- `KSEF_CREDENTIALS_ENCRYPTION_KEY` z `_PREVIOUS` i skryptem reencrypt
  (AUD-52 ✅) — wykonać rotację naprawdę; `CREDENTIALS_UNAVAILABLE` ma test
  na prawdziwej rotacji (H2). Pozostałe klucze wg `docs/runbooks/key-rotation.md`.

**I2. Runbook operatora per kod + ćwiczenie**
- `docs/runbooks/ksef-error-codes.md`: dla każdego kodu — co widzi klient,
  co robi automat, co klika operator, kiedy dzwonić do klienta. Jedno
  ćwiczenie Bartosza na kopii bazy z fakturami w każdym stanie.

**I3. Backup i odtworzenie z weryfikacją faktur**
- `docs/runbooks/backup-restore.md` wykonany na kopii: po odtworzeniu
  `ksef_lifecycle_violations()` = 0, liczby faktur per stan zgodne,
  pliki XML prób dostępne.

### Blok J — pozostałe ustalenia rewizji (po A–I)

S5 (cron ponagleń proponuje ROZ/KOR z błędną kwotą), S15 (usunięcie
użytkownika omija RODO), S17 (AUD-58: MFA w `getOcrJobStatusAction`,
`upo-actions`, support chat), S20/S21 (env `RESEND_FROM_EMAIL`,
`STRIPE_PRICE_ANNUAL`), S23 (eksport RODO), NISKIE z raportu. Każde osobnym
PR według protokołu; nie dotyczą kar, więc po bramce z sekcji 8.

---

## 6. Kolejność i zależności

```
A1 ──┐
A2 ──┼──► H1 (E2E na KSeF TEST) ──► C4 (zdjęcie hamulców) ──► bramka (sekcja 8)
A3 ──┤        ▲
A4 ──┘        │
B1 (decyzja) ─► B2 ─► B3 ───────────┤
C1 ─► C2 ─► C3 ─────────────────────┘
D1, D2, E1, E2, F1, F2, G1–G3 — równolegle, każda osobno; I1–I3 w dowolnym momencie.
H2 (game day) po G1 i A2. Blok J po bramce.
```

A5 (ślad per próba) po A2, przed H2 — dostarcza dane centrum dowodzenia
(osobny tor Masła/Codexa, `CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md`);
centrum nie jest sesją tego planu.

Można prowadzić dwie sesje naraz tylko wtedy, gdy nie dotykają tych samych
plików: np. C1 (walidatory) i E1 (skrzynka), D1 (UPO) i G3 (retencja).
Bloki A i H prowadzi jedna linia sesji, bo zmieniają runner.

Orientacyjnie: 21 sesji roboczych (A: 5, B: 3, C: 5, D: 2, E: 2, F: 2, G: 3,
H: 2, I: 3 — część krótkich), plus decyzje Bartosza w B1 i C4.

---

## 7. Scenariusze, które muszą przechodzić na prawdziwym KSeF TEST

| # | Scenariusz | Oczekiwany stan końcowy | Dowód |
|---|---|---|---|
| 1 | Zwykła faktura VAT | `accepted`, numer KSeF, XML próby, `xml_documents`, UPO ≤ 24 h | `/admin/ksef` karta; strażnik 0 |
| 2 | Ta sama faktura wysłana dwa razy (dwa zdarzenia) | jedna wysyłka; druga → `singletonKey` albo 440 → własny duplikat | `ksef_submissions`: 1 wpis `accepted` |
| 3 | Odrzucenie semantyczne (450) | `rejected KSEF_REJECTED`, wpis `rejected`, przycisk „Wróć do szkicu” | brak wpisu `sent` |
| 4 | Reset → poprawa → ponowna wysyłka | `accepted`, nowy klucz XML, stary plik nietknięty | dwa pliki w folderze faktury |
| 5 | POST wysłany, worker zabity przed statusem | po restarcie uzgodnienie, `accepted`, **bez** drugiego POST | 1 wpis `sent → accepted` |
| 6 | KSeF niedostępny 2 h | `failed KSEF_UNAVAILABLE` → automat ponawia → `accepted` | audyt `send_requeued` z `user_id NULL` |
| 7 | KSeF niedostępny > 24 h | `TRANSIENT_EXHAUSTED` + alarm + decyzja z B1/B2 | raport dzienny |
| 8 | Korekta „przed/po”, potem druga | P_15 drugiej = różnica od stanu po pierwszej | XML golden |
| 9 | Nieznana / stara sesja przy uzgadnianiu | kod odpowiedzi KSeF zapisany; STALE tylko gdy uzasadnione | log CI |
| 10 | Brak certyfikatu / NIP niezweryfikowany | `failed NO_CERTIFICATE / NOT_VERIFIED`, link do ustawień | przycisk |
| 11 | Zdarzenie z innego środowiska | `failed ENV_MISMATCH`, alarm, operator | Sentry |
| 12 | Faktura przychodząca w KSeF TEST | wiersz `received`, koszt, XML, KOD I w PDF | skrzynka |

---

## 8. Bramka wydania „zero zgubionych faktur”

Wydanie na PROD dla klientów płacących dopiero, gdy **wszystkie** punkty
są odhaczone (z datą i numerem PR/raportu):

- [ ] Sesje A1–A4, B1–B3, C1–C4, D1, E1, F1, G1, H1, H2 scalone i wdrożone.
- [ ] 12 scenariuszy z sekcji 7 zielone na KSeF TEST w 3 kolejnych
      tygodniowych przebiegach.
- [ ] `ksef_lifecycle_violations()` = 0 przez 14 dni; raport dzienny bez
      `exhausted` i `i1Lost` niewyjaśnionych.
- [ ] Każdy kod z `ksef_error_codes` ma wiersz w runbooku z wyjściem
      i testem (A4, I2).
- [ ] Game day (H2): każda z 5 awarii → sygnał ≤ 15 min → wyjście.
- [ ] Rotacja kluczy wykonana (I1); odtworzenie z kopii wykonane (I3).
- [ ] Runbook go-live przećwiczony na kopii (F1).
- [ ] Hamulce: `KOR_HOLD`, `ROZ_HOLD` zdjęte świadomie (C4) **albo** decyzja,
      że korekty/ROZ nie są w pierwszym wydaniu — zapisana i widoczna
      w produkcie (komunikat, nie `failed`).
- [ ] Decyzja B1 zapisana w projekcie cyklu życia; Offline24 albo działa,
      albo jest jawnie poza produktem.
- [ ] `scripts/ops/kontrola-faktur-ksef.sh` uruchamiany codziennie przez
      14 dni bez „nieznanych” stanów.

Po bramce: tygodniowy przegląd (raport dzienny + strażnik + Sentry) przez
pierwszy kwartał; każdy nowy kod błędu lub blokada wchodzi tylko z wyjściem.

---

## 9. Dziennik sesji

| Data | Sesja | PR | Zrobione | Co zostało |
|---|---|---|---|---|
| 03–04.10.2026 | (runda cyklu życia, przed tym planem) | #199–#217 | sekcja 3 | — (wszystko scalone, 00131–00135 na db-1, wdrożone 04.10) |
| 04.10.2026 | A1 | #219 | `lib/invoices/issue-date.ts`: jedna reguła „data wystawienia = dziś w Polsce” w 5 akcjach wysyłki (FA, szkic, ZAL, KOR, ROZ — w ROZ przed hamulcem); formularz ZAL bez UTC; 11 przypadków czerwonych przed naprawą. Scalone i wdrożone 04.10 (worker, potem web; `2dbf13a`) | faktura, która nie wyszła przed północą (ponowienie, cron, `/admin/ksef`), to B1/B2 |
| 04.10.2026 | A2 | #221 | wpis `intent` z numerem sesji przed POST pliku (bez zapisu — bez wysyłki); ponowienie zamyka sesję zamiaru i pyta KSeF o jej faktury (`GET /sessions/{ref}/invoices`): plik → `sent` + uzgodnienie, pusto → `abandoned` + wysyłka od nowa; 00136: `intent` = dowód kontaktu, I5 widzi stary zamiar; „Tylko uzgodnij” działa przy zamiarze | scalone, 00136 wgrana na db-1 i wdrożone 04.10 (worker, potem web; `dcf48ba`; strażnik 0); test na KSeF TEST (H1, scenariusz 5); osobne ustalenie: status 440 przy uzgadnianiu po referencji (`reconcile-previous-submission`) kończy się ponowieniami zamiast ścieżką „własny duplikat”; dla A5/C-22: A2 dodało status `abandoned`, a otwarte zamiary rozstrzyga osobny krok (`findOpenKsefSubmissionIntents`) — `findOpenKsefSubmission` zostaje przy `sent`; punkt 3 kontraktu w sekcji 5 briefu do uzgodnienia przed A5 |
| 04.10.2026 | A2b | #222 | ustalenie z A2: „tylko uzgodnij”, które stwierdza brak faktury w KSeF (zamiar porzucony, wpis STALE) i brak dowodu kontaktu, kończy `failed NOT_IN_KSEF` (00141, transient, bez automatu) z „Wyślij ponownie” / „Wróć do szkicu” zamiast ślepej uliczki RESULT_UNCERTAIN; poprawione błędne zdanie runbooka A2 | scalone, 00141 wgrana na db-1 i wdrożone 04.10 (`ae87bdd`); osobne ustalenie: komunikat klienta dla klasy transient obiecuje „ponowimy automatycznie” także przy `TRANSIENT_EXHAUSTED` i `CREDENTIALS_UNAVAILABLE` (bez automatu); A3 po #222 |
| 04.10.2026 | A3 | #223 | cron cyklu życia: I5 (zalegający `sent` / zamiar `intent` > 48 h) przy fakturze `failed`/`rejected` → „tylko uzgodnij” z aktorem NULL; najwyżej raz na dobę (audyt `reconcile_only = true`), po 3 próbach w tygodniu `i5NeedsOperator` + Sentry; inne stany `i5Other` (tylko alarm); dokumenty specjalne pominięte (A4) | scalone i wdrożone 04.10 (`1f95c97`); I5 przy `accepted` z niezamkniętym wpisem — automat go nie zamyka (do rozważenia: zamknięcie wpisu, gdy numer KSeF się zgadza) |
| 04.10.2026 | A4a | #224 | macierz wyjść dla 20 kodów × rodzaj × dowód × otwarty wpis (test-strażnik z jawną listą ślepych uliczek); „Wyślij ponownie” operatora dla ENQUEUE_LOST, INVALID_EVENT, RESULT_UNCERTAIN; akcja operatora decyduje jak przycisk (zasada 6); tabela kod → wyjście w runbooku | scalone i wdrożone 04.10 (`4aa27ce`); A4b (00137, dokumenty specjalne); decyzje D-A4-1 (cudzy 440: porównanie treści z KSeF) i D-A4-2 (ENV_MISMATCH, z F1) |
| 04.10.2026 | D-A4-1a | #226 | cudzy 440 (decyzja D-A4-1): weryfikacja treści oryginału z KSeF w obu ścieżkach (wysyłka i uzgadnianie po referencji — wcześniej 440 przy uzgadnianiu krążył w ponowieniach); własny duplikat tylko przy tym samym skrócie pliku; `KSEF_NUMBER_TAKEN` (00142) dla oryginału z innego programu, wpisy → `number_taken`; ponowienie samej weryfikacji bez drugiej wysyłki; klasa `KsefSendVerdictError` przed klasami KSeF w klasyfikatorze; sesja oryginału z numerem KSeF w historii (UPO); kody z `problem+json`. Projekt sprawdzony adwersaryjnie (3 recenzentów) przed kodem, gotowy diff — drugi raz (4 soczewki + weryfikacja): znacznik 440 na otwartym wpisie (00142: `original_ksef_number`), żeby po 48 h nie powstało fałszywe NOT_IN_KSEF; alarmy operatora; błąd magazynu = ponowienie; akceptacja zamyka wpis po zapisie faktury; ta sama treść z innego programu = operator | scalone, 00142 wgrana na db-1 i wdrożone 04.10 (`e09d408`); D-A4-1b: ręczny werdykt operatora — **czeka na decyzje** (recenzja projektu: „numer zajęty” dla oryginału z FaktFlow o innej treści jest prawnie błędny — to wcześniejsza wersja tej faktury; przyjęcie „tej samej treści z innego programu” wymaga znacznika i ostrzeżenia w JPK; „inna sprzedaż czy ta sama” wie klient, nie operator); potwierdzić na KSeF TEST (H1), że skrót pobranego oryginału = `invoiceHash` wysyłki i że UPO z sesji spoza FaktFlow się pobiera; osobne ustalenia: `NOT_IN_KSEF` (transient) parkowany w Offline24 na TEST; limiter `invoiceDownload` (16/min) wspólny ze skrzynką |
| 04.10.2026 | D-A4-1a-data | #227 | ustalenie z recenzji D-A4-1b: numer przyjęty z duplikatu (własnego i zweryfikowanego) nie miał `ksef_accepted_at` — teraz data nadania numeru oryginałowi (status po referencji własnej sesji albo `POST /invoices/query/metadata` po numerze KSeF; brak → alarm); typy bazy z produkcji po 00142 | bez migracji; scalone 04.10 (`38c8512`), wdrożenie czeka na polecenie |
| 04.10.2026 | D-A4-2 | #228 | `ENV_MISMATCH` (decyzja D-A4-2): klasa reconcile → **terminal** (00143) — bez dowodu kontaktu faktura wraca do szkicu (klient sam albo operator), klient decyduje, czy wysłać ją w obecnym środowisku; `requeue_ksef_send` odmawia ponowienia (wcześniej przepuszczał — chronił tylko przycisk), „tylko uzgodnij” przy otwartym wpisie zostaje; komunikat z obu środowiskami w `last_error`, osobny przy workerze bez `KSEF_ENV`; przy dowodzie kontaktu „nie wystawiaj ponownie” zamiast „wróć do szkicu” (recenzja: wcześniejsza próba mogła dotrzeć do KSeF); etykieta „Inne środowisko KSeF” zamiast „Do uzgodnienia”; ślepa uliczka wykreślona z macierzy wyjść (także dla korekt bez dowodu) | 00143 przed wdrożeniem (0 faktur z kodem na produkcji 04.10); ustalenia dla F1/F2: cron I6/I7 wznawia `failed` nowym zdarzeniem z BIEŻĄCYM środowiskiem — po przełączeniu TEST → PROD faktury przejściowe i wstrzymane z czasu TEST wyszłyby same na PROD; `ksef_submissions` bez kolumny środowiska — próba z TEST to po przełączeniu „dowód kontaktu”; gałąź `ENV_MISMATCH` w `onExhausted` nie wysyła zdarzenia `invoice/submit.failed` (brak maila do klienta — dziś tylko interfejs i alarm operatora); z recenzji: `ENV_MISMATCH` z otwartym wpisem sprzed przełączenia środowiska — „tylko uzgodnij” (operator i cron I5, który nie patrzy na kod) uzgadnia w bieżącym środowisku, `requeue` czyści kod, a wynik (`NOT_IN_KSEF`/`NOT_VERIFIED`/`RESULT_UNCERTAIN`) zaprasza do wysyłki dokumentu z TEST na PROD — do F2 (środowisko na wpisie albo filtr I5), do tego czasu ostrzeżenie w runbooku i komunikacie operatora |
| 04.10.2026 | D-A4-1b-3 (A0) | #229 | decyzje D-A4-1b w runbooku; kolejność zmieniona (Bartosz): D-A4-1b-1 (automat przyjęcia treści) odłożony do B2 — projekt pokazał, że treść jednego wiersza nie zmienia się między próbami, a szkic z nieaktualną datą jest usuwany razem z historią prób; budujemy D-A4-1b-3 (przycisk klienta, ok. 7 PR). A0: „znany numer KSeF” liczy tylko faktury sprzedaży — zakupowa z tym numerem zatrzymywała porównanie treści (operator zamiast werdyktu) | bez migracji; ustalenie „`NOT_IN_KSEF` parkowane w Offline24 na TEST” nieaktualne — Offline24 wyłączony wszędzie od 02.10 (`offline24-policy.ts`), warunek do sesji, która go włączy (#122); osobne ustalenia z projektu D-A4-1b-3: podpowiedź numeru oddaje numer zajęty w KSeF po usunięciu szkicu (pętla 440 w wyjściu `KSEF_NUMBER_TAKEN`), szkic po „numer zajęty” da się wysłać ponownie (powtórne 440) |
| 04.10.2026 | D-A4-1b-3 (A) | #PR | dane oryginału przy nierozstrzygniętym 440 zapisane na otwartym wpisie próby (`original_check`, 00144) w każdej gałęzi bez werdyktu: powód (8 wartości), dane z faktury (numer, data, nabywca, kwota, program), data nadania numeru, skrót, „w historii tej faktury”, „treść jak nasza”; bajty oryginału w archiwum importu (`<firma>/ksef-import/<numer>.xml`), konflikt archiwum = werdykt dla operatora (nie pętla ponowień); klient widzi panel „W KSeF jest już faktura o tym numerze” (bez przycisku — ten w B), operator — sekcję na karcie `/admin/ksef`. Recenzja diffu (3 soczewki + sceptycy): nieudane ponowne sprawdzenie (I5 po 48 h, 403 po zmianie tokenu) zerowało zapisane dane — teraz `recheck` obok danych z udanego; „odśwież za kilka minut” nieprawdziwe (panel widać po wyczerpaniu ponowień) — „sprawdzimy ponownie automatycznie”; osobny powód `archive-pending`; panel nie wraca ze starymi danymi po zmianie stanu (realtime); data nadania w strefie Europe/Warsaw | 00144 przed wdrożeniem; #229 (A0) scalone 04.10, wdrożenie razem z tym PR |

---

## 10. Czego nie robić w tej rundzie

- Nie dodawać funkcji (nowe moduły FLO, eksporty, integracje) — każda
  sesja z tego planu zamyka ryzyko kary albo buduje dowód, nic więcej.
- Nie zdejmować hamulców „na próbę”.
- Nie naprawiać dwóch rzeczy w jednym PR, nawet gdy są obok siebie.
- Nie uznawać za naprawione niczego, czego nie widział test na prawdziwej
  ścieżce (baza z wyzwalaczami albo KSeF TEST).
- Nie pisać `ksef_status` nigdzie poza RPC z 00131 i workerem.
- Nie budować w sesjach planu statystyk, pulpitów ani osi czasu faktury —
  to centrum dowodzenia (tor Masła/Codexa, `CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md`);
  plan dostarcza dane (A5), nie widoki.
