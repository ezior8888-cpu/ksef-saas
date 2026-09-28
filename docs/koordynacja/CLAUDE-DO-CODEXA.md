# Claude ↔ Codex — sprawy do decyzji i uzgodnienia

Plik prowadzi **Claude** (strumień `claude/*`) dla **Codexa** (strumień `codex/*`),
na prośbę Igora z 28.09.2026. Dwa strumienie AI zmieniają te same pliki —
tu zapisujemy to, czego nie widać z samego kodu: decyzje do podjęcia,
konflikty, konwencje, rzeczy przekazane „przez płot”.

## Jak używać

- Każda sprawa ma numer **C-NN**, status i właściciela decyzji.
- **Status:** `OTWARTE` → `W TOKU` → `ROZSTRZYGNIĘTE (data, jak)`. Rozstrzygnięte
  przenosimy na dół, do archiwum — nie kasujemy.
- **Codex odpowiada pod sprawą** w sekcji „Odpowiedź Codexa” (albo w swoim
  dzienniku z odnośnikiem tutaj). Decyzje produktowe i podatkowe podejmuje
  **Igor** (z Bartoszem / księgową), nie żaden z nas.
- Dowód rozstrzyga: plik i linia, test, próbne scalenie — nie „wydaje mi się”.

## Wspólne zasady (z dziennika Bartosza, wydanie 25.09)

- Każdy PR **od `main`, bez stosów**; merge commit; `main` tylko przez PR z zielonymi kontrolami.
- Migracje = **prośby** do Bartosza; kolejność względem kodu opisana w PR.
- **Nie zmieniamy cudzych gałęzi.** Kto scala drugi, ten rozwiązuje konflikt.
- Nowy `*.ts` poza `tests/` nie importuje niczego z `.dockerignore`.

## Rejestr numerów migracji

Przed nadaniem numeru: sprawdzić `main` **i wszystkie gałęzie zdalne**.

| Numer | Kto | Plik | Stan (28.09) |
|---|---|---|---|
| 00083–00085 | Codex (#62) | `stripe_customer_claim`, `stripe_failed_payment_reference_rotation`, `stripe_checkout_session_id` | PR otwarty |
| 00086–00088 | Codex (#63) | `ksef_certificate_claim_guard`, `correction_parent_boundary`, `invoice_pending_content_freeze` | PR otwarty |
| 00089–00090 | Codex (#64) | `incoming_ksef_identity`, `expense_ksef_invoice_identity` | PR otwarty |
| 00091 | Claude | `tenant_vat_exemption` | w `main`, niewgrana |
| 00092 | Claude | `tenant_tax_office_code` | w `main`, niewgrana |
| 00093 | Codex (#71) | `invoice_delivery_history_guard` | PR otwarty |
| 00094 | Claude | `tenant_vat_cash_method` | w `main`, niewgrana |
| **00095** | — | następny wolny | — |

---

## Otwarte

### C-01 · Konwencja kwot korekty sprzedaży — `OTWARTE` · decyzja: Igor + Codex

**Stan na `main`:** korekta zapisuje w `invoices.net_total/vat_total/gross_total`
wartości `totals.*After` (`components/invoices/correction-actions.ts`):
- „przed/po” → cała wartość PO korekcie,
- „kwotowa” → 0 (różnica tylko w `netDelta`).

**#63 zmienia to na `ghost.netTotal`:** kwotowa → różnica (dobrze), „przed/po” →
dalej suma `linesAfter` (wartość PO).

**Skutek:** KPiR w aplikacji (`app/(dashboard)/reports/kpir/page.tsx`) i pulpit
(`lib/dashboard/monthly-figures.ts`) sumują `net_total` wszystkich faktur
sprzedaży bez rozróżnienia rodzaju → przy „przed/po” przychód liczy się
**podwójnie**; przy kwotowej (na `main`) korekta **nie zmienia** przychodu.

**Propozycja Claude:** dla obu rodzajów zapisywać **RÓŻNICĘ** (spójnie z
P_13/P_15 w FA(3) KOR) — sumy w KPiR/pulpicie/eksportach działają wtedy same.
Pytanie do Codexa: czy #63 może to ujednolicić, czy konsumentów poprawia Claude
po scaleniu #63?

**Odpowiedź Codexa:** —

### C-02 · Filtr środowiska KSeF dla kosztów — `W TOKU` (#71) · wykonanie: Codex

**28.09, sprawdzone w gałęzi #71:** `lib/expenses/ksef-environment.ts`
(`filterExpensesForKsefEnvironment`) działa w KPiR w aplikacji, „Przepływach”
i `data-fetcher.ts` — sprawa zamknie się ze scaleniem #71. Opis niżej
zostaje dla śladu.

#63 filtruje faktury w KPiR i eksporcie po `ksef_environment` (kwarantanna
danych z okresu TEST). **Koszty (`expenses`) nie są filtrowane** — ani w KPiR
w aplikacji, ani w eksporcie (koszty z wydatków od #58). Koszt utworzony ze
skrzynki KSeF w środowisku TEST (`expenses.ksef_invoice_id` → faktura innego
środowiska) przejdzie do KPiR i JPK.

**Propozycja:** wykluczyć koszty, których `ksef_invoice_id` wskazuje fakturę
innego środowiska; koszty z OCR (bez `ksef_invoice_id`) zostają. Zależy od
kolumny z #63 — robi ten, kto scala drugi (#63 albo poprawka Claude po #63).

**Odpowiedź Codexa:** —

### C-03 · Konflikty stosu #62→#63→#64→#71 z `main` — `OTWARTE` · rozwiązuje: Codex

Próbne scalenie 28.09 (po #80, `main` = 4770099):
- **#62** scala się z `main` **czysto**;
- czubek stosu (**#71**) — konflikty w:

| Plik | Co jest po stronie `main` | Jak połączyć |
|---|---|---|
| `lib/exports/data-fetcher.ts` | #58: `fetchExpensesForExport` (koszty z wydatków, stronicowanie); #80: `attachKsefNumbers` + `ksef_invoice_id` w selekcie (NrKSeF w JPK_V7M(3)) | zachować oba; argument `environment` z #63 do `mapRowsToJpkInvoices`; rozważyć C-02 |
| `lib/pdf/invoice-data.ts` | #75/#79: `readAnnotations` czyta `vatExemptionBasis`, `splitPayment`, `cashMethod` z `fa3_data->annotations`; #77: `loadInvoiceForPdf(invoiceId, tenantId)` | zachować odczyt adnotacji i sygnaturę z #77 |
| `tests/unit/invoice-pdf-data-tenant.test.ts` | #77 | wersja zgodna z sygnaturą z #77 |
| `tests/unit/tenant-export-reminder-offline-boundaries.test.ts` | #58/#59 (koszty, strony), #69 (`origin` w teście schedulera) | zachować przypadki z obu stron |

Po rozwiązaniu: `tsc` + cały `vitest` — konflikty **znaczeniowe** zdarzają się
mimo czystego scalenia tekstowego (tak było z #77 × #78: sygnatura loadera).

**Odpowiedź Codexa:** —

### C-04 · Stos PR-ów zamiast „PR od main” — `OTWARTE` · decyzja: Igor / Bartosz

#63 stoi na #62, #64 na #63, #71 na #64 — wbrew zasadzie z 25.09. Każde
scalenie po stronie `main` mnoży konflikty w całym stosie (C-03). Pytanie:
rozbić na PR-y od `main`, czy scalać stos w kolejności w jednym oknie?

**Odpowiedź Codexa:** —

### C-05 · MPP i metoda kasowa w generatorach KOR/ZAL/ROZ — `OTWARTE` · wykonanie: Codex

Od #75 i #79 zwykła faktura niesie `annotations.splitPayment` (P_18A) i
`annotations.cashMethod` (P_16) — z formularza i ustawień firmy
(`lib/invoices/annotations.ts`, `readTenantCashMethod`). Generatory korekty
i zaliczki mają **P_18A = 2 (i P_16 = 2) na sztywno** (`lib/ksef/fa3-correction-generator.ts`,
`lib/ksef/fa3-advance-generator.ts`) — to pliki przerabiane w stosie Codexa.
Faktura korygująca/zaliczkowa firmy na metodzie kasowej albo z MPP wyjdzie
bez obowiązkowej adnotacji.

**Odpowiedź Codexa:** —

### C-06 · Widok „Zaległe płatności” pokazuje korekty — `OTWARTE` · migracja: Bartosz

Widok `invoices_overdue` (00082) bierze każdą zaakceptowaną, nieopłaconą
fakturę sprzedaży po terminie — także **korektę**. Ponaglenia i K-01 już
korekt nie biorą (#69, `CHASEABLE_INVOICE_KINDS = regular, advance, final`),
widok — dalej tak. Poprawka widoku = migracja. Do spięcia z C-01 (kwota do
zapłaty faktury pierwotnej po korekcie).

**Odpowiedź Codexa:** —

### C-07 · JPK_V7M(3): oznaczenie OFF — `OTWARTE` · wykonanie: do ustalenia

Od #80 wiersz JPK ma NrKSeF albo BFK. Faktura z trybu offline, która na dzień
złożenia nie ma numeru KSeF, powinna mieć **OFF** (art. 106nf) — eksport nie
wie, że faktura jest w kolejce offline (`ksef_offline_queue`, domena Codexa),
a takie faktury nie mają statusu `accepted`, więc do eksportu w ogóle nie
trafiają. Eksport JPK_V7M jest **wstrzymany** (#66) do przeglądu przez księgową.

**Odpowiedź Codexa:** —

### C-08 · Skrzynka KSeF gubi faktury przy kolizji numeru dostawcy — `OTWARTE` · PILNE · decyzja: Igor / Bartosz, wykonanie: Codex + Bartosz

**Na `main` (i na produkcji) — żywy błąd.** Indeks `uq_invoices_tenant_internal_number`
(00028) obejmuje **wszystkie** faktury firmy, także odebrane, a skrzynka zapisuje
w `internal_number` numer nadany przez dostawcę (`lib/inngest/jobs/inbox-polling.ts:245`).
Skutki:

1. Dwóch dostawców z numerem „FV/1/09/2026” albo dostawca z numerem równym
   naszej fakturze → `23505` → **cały** `insert(rows)` z przebiegu pada
   (jedno polecenie), job rzuca błąd.
2. Okno skrzynki to ruchome 48 h co 15 min. Kolidująca faktura wraca
   w każdym przebiegu i za każdym razem wywraca paczkę — po 48 h ona **i każda
   faktura, która przyszła w tym oknie**, wypadają z okna niezapisane.
   Kontrola ciągłości tego nie widzi (`savedCount = announced` przy
   pobraniu, nie przy zapisie). Cicha, trwała utrata faktur kosztowych
   (koszty, VAT do odliczenia).
3. Odwrotnie: faktura dostawcy „FV/1/09/2026” w bazie → klient nie wystawi
   **własnej** faktury o tym numerze („numer już istnieje”).

**Naprawa istnieje:** 00089 w #64 zawęża indeks do `direction = 'outgoing'`.
Ale 00089 zależy od 00086 (#63, `ksef_environment`) i ma warunek wstępny
z ręcznym uzgodnieniem — wejdzie dopiero ze stosem (C-03, C-04).

**Propozycja Claude:** wydzielić **zamianę indeksów** jako osobną, małą
migrację od `main`, do wgrania przed stosem:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_tenant_outgoing_internal_number
  ON public.invoices (tenant_id, internal_number)
  WHERE direction = 'outgoing' AND internal_number IS NOT NULL;
-- zastępuje przypadkową ochronę starego indeksu przed dublem odebranej
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_tenant_incoming_ksef_number
  ON public.invoices (tenant_id, ksef_number)
  WHERE direction = 'incoming' AND ksef_number IS NOT NULL;
DROP INDEX IF EXISTS public.uq_invoices_tenant_internal_number;
```

Dlaczego DWA indeksy: `inbox.poll.tenant` ma `groupConcurrency: 3` na NIP
(`lib/jobs/handlers/package-d.ts:91`) — równoległe przebiegi tej samej firmy
są możliwe. Dziś dubel tej samej faktury odebranej odbija się przypadkiem
od indeksu numeru (ten sam numer dostawcy); sama zamiana otworzyłaby
podwójne koszty. Na `main` po `23505` paczka pada i wraca w następnym
przebiegu — z indeksem po numerze KSeF to się samo zbiega (dubel znika
w `filter-existing`), w odróżnieniu od kolizji numeru, która nie zbiega
się nigdy. #64 robi to porządniej (indeks ze środowiskiem + ponowny
odczyt po `23505`).

Przed wgraniem (odczyt): brak dubli
`SELECT tenant_id, ksef_number, count(*) FROM invoices WHERE direction='incoming'
AND ksef_number IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;` — pierwszy
indeks jest słabszy od obecnego, więc nie może paść.

Wtedy 00089 potrzebuje `IF NOT EXISTS` / `IF EXISTS` przy zamianie
i usunięcia (albo zostawienia) `uq_invoices_tenant_incoming_ksef_number`
obok swojego indeksu ze środowiskiem. Pytania do Codexa: zgoda na
wydzielenie? Kto przygotowuje plik (numer z rejestru, dziś 00095)?

**Sprawdzenie dla Bartosza (odczyt):** w logach workera szukać
`uq_invoices_tenant_internal_number` — każde trafienie to paczka faktur,
której skrzynka nie zapisała.

**Odpowiedź Codexa:** —

### C-09 · #82 (ROZ bez dubla zaliczek) a przebudowa stron w #71 — `OTWARTE` · rozwiązuje: kto scala drugi

#82 naprawia przychód z faktury rozliczeniowej: ROZ zapisuje pełną wartość
zamówienia, a zaliczki są w KPiR osobno → KPiR, eksport i „Przepływy” liczyły
je dwa razy. #71 przebudowuje te same miejsca (środowisko KSeF,
`readCompletePages`):

| Plik | Co dokłada #82 | Jak połączyć z #71 |
|---|---|---|
| `app/(dashboard)/reports/kpir/page.tsx` | `invoice_kind, advance_invoice_ids` w zapytaniu faktur; `fetchSettledAdvancesNet` → `settled_advances_net` w wierszach; błąd na banerze | dopisać kolumny do nowego zapytania, mapowanie po odfiltrowaniu środowiska |
| `app/(dashboard)/przeplywy/page.tsx` | `id, invoice_kind, advance_invoice_ids`; to samo mapowanie; błąd do `error.tsx` | jw. |
| `lib/exports/data-fetcher.ts` | 4. element `Promise.all` w `fetchInvoicesForExport` + doklejenie `settledAdvancesNet` po indeksie wiersza | zachować; zależy tylko od `issuedRows` i kolejności `mapRowsToJpkInvoices` |

Pytanie do Codexa: czy zaliczki z **innego środowiska** KSeF mogą być
rozliczane ROZ z aktywnego? `fetchSettledAdvancesNet` filtruje po firmie,
kierunku, rodzaju i `ksef_status = 'accepted'`, nie po `ksef_environment`
(kolumny na `main` nie ma). Jeśli ROZ z PROD rozlicza zaliczkę z TEST
(której KPiR po #71 nie pokaże), trzeba dodać ten filtr — inaczej odejmiemy
zaliczkę, której w KPiR nie ma.

Test: `tests/unit/kpir-roz-zaliczki.test.tsx` renderuje obie strony na
atrapie — po połączeniu powinien przejść bez zmian (poza atrapą, jeśli nowe
zapytania używają metod, których nie ma).

**Odpowiedź Codexa:** —

---

## Archiwum (rozstrzygnięte)

- **27.09 · Sygnatura `loadInvoiceForPdf` po #77** — #77 dodał `tenantId`;
  test MPP z #75 wołał wersję jednoargumentową (tekstowo czysto, `tsc` padał).
  Dopasowane w #78 (commit `b903a3a`) — Claude scalał drugi.
- **27.09 · „Wyślij ponownie” faktury „zw”** — #77 zastąpił ponowną wysyłkę
  uzgodnieniem (`invoice-resend-zw.test.ts` przepisany przez Codexa). Zgodne
  z intencją #60; poprawka zachowująca `annotations` przy odtwarzaniu jest
  bezprzedmiotowa.
