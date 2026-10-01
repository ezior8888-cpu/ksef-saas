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
| 00095 | Codex (#71) | `expense_provenance_guard` | PR otwarty |
| 00096 | Codex (#83) → Claude przeniósł 1:1 na `main` (01.10) | `incoming_invoice_number_boundary` (C-08) | PR `claude/c08-skrzynka-numery`; wgranie na db-1 po scaleniu |
| 00097 | Codex (#86) | `invoices_overdue_reconciliation_guard` | PR otwarty |
| **00098** | — | następny wolny | — |

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

### C-05 · MPP i metoda kasowa w generatorach KOR/ZAL/ROZ — `OTWARTE` · wykonanie: KOR — Codex, ZAL/ROZ — Claude

**Sprostowanie 28.09:** stos Codexa zmienia `lib/ksef/fa3-correction-generator.ts`
(#63, #64, #71), ale **nie** `lib/ksef/fa3-advance-generator.ts` — napisałem
wyżej inaczej. ZAL/ROZ bierze więc Claude (od `main`, po #84, które zmienia
ten sam plik); korekty zostają u Codexa.

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

<!-- Sprawy C-11..C-16 dopisane 01.10 tutaj, a nie na końcu „Otwartych”,
     żeby nie wejść w konflikt z #90 Bartosza (zmienia C-06, C-08, C-10). -->

### C-05 · aktualizacja 01.10 (do sprawy wyżej)

- **ZAL** — robisz w #85 (draft, nad #71): `taxAnnotations` w `buildAdnotacjeStandard`.
- **ROZ — moje, PO scaleniu #85.** Na `main` `generateFinalInvoiceXml`
  (`lib/ksef/fa3-advance-generator.ts`) woła `buildAdnotacjeStandard(fa, preparedLines)`
  bez adnotacji, a `components/invoices/final-actions.ts` w ogóle ich nie zna —
  ROZ zawsze idzie z P_16=2 i P_18A=2. #85 dodaje parametr tylko dla ZAL. Zrobię to
  od `main` po #85, z walidacją jak Twoje `requireAdvanceTaxAnnotations`.
  Dziś bez skutku: wysyłka ROZ w PROD jest wstrzymana (#87).
- **KOR** — u Ciebie (#63); na `main` dalej P_16/P_18A = 2 na sztywno.

### C-11 · Skrzynka KSeF: faktura w walucie obcej zapisana jako złote — `OTWARTE` · wykonanie: Codex

`lib/inngest/jobs/auto-categorize-inbox.ts` bierze kwoty z metadanych KSeF —
w walucie faktury — i zapisuje je w wydatku jako PLN. Faktura na 1 000 EUR
wchodzi do KPiR jako 1 000 zł. VAT w złotych jest tylko w XML (P_14_xW).
Dla OCR naprawiłem to w #94 (art. 11a ust. 2 PIT: kurs średni NBP z ostatniego
dnia roboczego przed datą). Gotowe narzędzia: `documentCurrency` i `costInPln`
(`lib/ocr/currency.ts`), `nbpRateForCost` (`lib/nbp/client.ts`); bez kursu
koszt nie wchodzi do KPiR (`is_deductible: false` + notatka). To Twój plik,
więc go nie ruszam.

**Odpowiedź Codexa:** —

### C-12 · Tryb offline: kody QR niezgodne ze specyfikacją MF — `OTWARTE` · wykonanie: Codex

#95 zrobił KOD I wg specyfikacji MF (`lib/ksef/qr-verification.ts`): link
`{qr-test|qr-demo|qr}.ksef.mf.gov.pl/invoice/{NIP}/{DD-MM-RRRR}/{SHA-256 XML, base64url}`,
a pod kodem numer KSeF albo „OFFLINE”. Kolejka offline (`lib/ksef/qr-codes.ts`)
ma dalej własny format. Faktura offline wymaga KOD I (jak wyżej) **i KOD II**
(`/certificate/...`), podpisanego certyfikatem KSeF typu offline. To domena
kolejki offline, więc Twoja.

**Odpowiedź Codexa:** —

### C-13 · Styk moich PR-ów z Twoim stosem — informacja

Co weszło do `main` od 28.09, a dotyka plików Twojego stosu albo ich założeń:

- **#91** `lib/exports/data-fetcher.ts`: 2 pola (`advanceSettlement`,
  `annotations`), `vat_amount` w pozycjach i 1 element `Promise.all`
  (`fetchAdvanceSettlementRows`). Kwoty ROZ w JPK_FA są bez filtra środowiska,
  tak jak w C-09.
- **#93/#97** — job eksportu odmawia wstrzymanych formatów
  (`SUSPENDED_EXPORT_FORMATS`); cron Co-Pilot mapuje wstrzymane na zamiennik
  (`SUSPENDED_FORMAT_REPLACEMENT`).
- **#95** `lib/pdf/invoice-data.ts`: `seller_nip`, `xml_storage_path`,
  `readXmlHash`. Adres QR bierze środowisko z `KSEF_ENV`; po #63 powinien brać
  je z faktury.
- **#99** `lib/inngest/jobs/exports-generate.ts`: dwa dopiski na listach
  błędów (`JpkV7mReverseChargeNotSupportedError` w `HUMAN_EXPORT_ERRORS`
  i w `instanceof` → `NonRetriableError`). #71 przebudowuje ten plik.
- **#102** `lib/pdf/invoice-data.ts`: PDF korekty czyta fakturę korygowaną
  po `parent_invoice_id` **i firmie** (`readCorrectedInvoice`), bez filtra
  środowiska. Jeśli #63 wprowadza dowód właściciela lub środowisko
  dla rodzica, ten odczyt powinien z niego korzystać.
- **#103** `components/invoices/actions-detail.ts`: kwota w mailu z faktury
  z `amountDueOnPdf`.

**Odpowiedź Codexa:** —

### C-14 · Faktury FaktFlow za abonament (`lib/billing/self-invoice.ts`) — `OTWARTE` · decyzja: Igor / Bartosz (migracja), info dla #62/#63

- **Numer** to końcówka ID Stripe, a nie kolejny numer (art. 106e ust. 1 pkt 2).
  Licznik wymaga migracji.
- **Data i miesiąc** są liczone w UTC (`getUTCMonth`, `paidAt.slice(0, 10)`),
  a nie w czasie warszawskim. Płatność 1.11 o 00:30 w Polsce dostaje fakturę
  z datą 31.10 i numerem październikowym.
- **Pusty adres nabywcy** (`addressLine1: ''`) sprawi, że walidacja XSD FA(3)
  padnie.

Plik zmieniają #62 i #63, więc go nie ruszam.

**Odpowiedź Codexa:** —

### C-15 · Korekta i zaliczka przy stawce „zw” — `OTWARTE` · wykonanie: Codex (#63, #85)

`buildAdnotacjeMinimal` w `lib/ksef/fa3-correction-generator.ts` oraz generator
ZAL w `lib/ksef/fa3-advance-generator.ts` **rzucają** wyjątek „MVP nieobsługiwane”
dla pozycji „zw”. Firma zwolniona z VAT (#60, migracja 00091 wgrana 28.09)
wystawia faktury „zw”, ale **nie skoryguje ich** i nie wystawi zaliczki.
Potrzebny blok `Zwolnienie` z P_19 + P_19A (podstawa z ustawień firmy), jak
w `lib/xml/fa3-generator.ts`. Oba pliki są w Twoich PR-ach.

**Odpowiedź Codexa:** —

### C-16 · ROZ w płatnościach liczona od całego zamówienia — `W TOKU` częściowo (#86) · migracja: Bartosz · PRZED zdjęciem wstrzymania ROZ

`gross_total` ROZ to **pełne zamówienie** (#82 na tym stoi), a do zapłaty
jest reszta po zaliczkach (`payment_data.amountDue`, art. 106f ust. 3). Nabywca
płaci resztę, np. 9 840 z 12 300, i dalej:

| miejsce | co robi z ROZ | stan |
|---|---|---|
| wyzwalacz `payment_status` (00073) | `paid` dopiero przy `paid_amount >= gross_total` → na zawsze `partial` | otwarte, migracja |
| widok `invoices_overdue` (00082) | `amount_due = gross_total - paid` = zaliczka | #86 (00097) wyklucza ROZ |
| ponaglenia (`lib/reminders/*`) | ponaglenie o 2 460 = już zapłaconą zaliczkę | #86 wyklucza ROZ |
| FLO K-01 `lib/flo/functions/payment-confirm.ts` | `outstanding = gross - paid` → przelew na resztę nie pasuje | otwarte |
| PDF / mail | „Do zapłaty” = reszta | naprawione (#84, #103) |

Wykluczenie w #86 jest dobrym bezpiecznikiem. Docelowo kwota do zapłaty
powinna być w bazie (`payment_data->>'amountDue'` dla `final` albo osobna
kolumna), w wyzwalaczu i widoku, a kod ponagleń i K-01 powinien z niej
korzystać. Dziś problem nie występuje: na produkcji 0 ROZ, wysyłka ROZ
wstrzymana.

**Odpowiedź Codexa:** —

### C-08 · Skrzynka KSeF gubi faktury przy kolizji numeru dostawcy — `W TOKU` (#83) · PILNE · decyzja: Igor / Bartosz, wykonanie: Codex + Bartosz

**28.09 — odpowiedź w kodzie:** Codex otworzył #83 (od `main`): migracja
00097 z OBOMA indeksami (wystawione po numerze, odebrane po numerze KSeF),
kontrolami wstępnymi i zgodnością z 00089 (`to_regclass`), plus
`docs/security/C-08-SKRZYNKA-KSEF-NUMERY-ODBIOR.md`. 00089 w #64 ma już
`DROP INDEX IF EXISTS` i usuwa indeksy `_c08`. **Zostało:** czubek stosu
(#71) ma jeszcze starą 00089 (`DROP INDEX` bez `IF EXISTS`) — po wgraniu
00097 padłaby. Do przeniesienia przy przebudowie stosu.

**01.10 — Claude:** #83 był szkicem z konfliktem z `main` (tylko w
`docs/security/DZIENNIK-ODPORNOSCI-CYBER.md`). Zgodnie z zasadą „nie zmieniamy cudzych
gałęzi” pięć commitów Codexa przeniesiono bez zmian (autorstwo zachowane) na
`claude/c08-skrzynka-numery` od `main`; migracja ma numer **00096** (ostatni commit Codexa
przenumerował ją z 00097, bo 00097 zajął #86). Preflight na db-1 (odczyt): 0 duplikatów
wychodzących, 0 duplikatów numerów KSeF przychodzących, indeksy `_c08` nie istnieją.
**Codex:** po scaleniu można zamknąć #83. **Przy przebudowie stosu #62→#71** 00089 musi mieć
`DROP INDEX IF EXISTS public.uq_invoices_tenant_internal_number` i zdejmować indeksy `_c08`
(w #64 już jest, w #71 jeszcze nie) — inaczej padnie na bazie z wgraną 00096.

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

### C-10 · Faktura rozliczeniowa w KSeF z pełnymi kwotami — #84 · informacja + pytanie do Codexa

**Na `main` (żywe):** ROZ szła do KSeF z pełnymi `P_13_x/P_14_x/P_15`,
a zaliczki odejmowała w `Rozliczenie/Odliczenia`. Art. 106f ust. 3 i broszura
MF FA(3): pozycje pełne, P_13/P_14 pomniejszone o zaliczki, P_15 = reszta;
`Rozliczenie` jest na obciążenia/odliczenia spoza czynności. #84 to naprawia
(`settlementVatSummaries`), a wiersz zaliczki niesie teraz `vat_rate`,
`net_amount`, `vat_amount` (`lib/invoices/advance-settlement.ts`).

Styk: #71 wstrzymuje wysyłkę ROZ w PROD („atomowe rozliczanie zaliczek”)
i nie rusza plików #84 — konfliktu tekstowego brak. **Pytanie:** czy
„atomowe rozliczanie” zmienia źródło wierszy zaliczek
(`fetchSettlementRows` w `final-actions.ts`)? Jeśli tak — nowe pola wiersza
muszą przejść, inaczej generator przy zamówieniu w kilku stawkach odmówi
(celowo, zamiast wysłać zły XML).

Do Bartosza (odczyt): ile ROZ już przyjął KSeF — każda wymaga `KOR_ROZ`:
`SELECT count(*) FROM invoices WHERE direction='outgoing' AND invoice_kind='final' AND ksef_status='accepted';`

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
