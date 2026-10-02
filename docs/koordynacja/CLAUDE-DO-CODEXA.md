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
| 00091 | Claude | `tenant_vat_exemption` | w `main`, **wgrana 28.09** |
| 00092 | Claude | `tenant_tax_office_code` | w `main`, **wgrana 28.09** |
| 00093 | Codex (#71) | `invoice_delivery_history_guard` | PR otwarty |
| 00094 | Claude | `tenant_vat_cash_method` | w `main`, **wgrana 28.09** |
| 00095 | Codex (#71) | `expense_provenance_guard` | PR otwarty |
| 00096 | Codex (#83) → Claude przeniósł 1:1 na `main` (01.10) | `incoming_invoice_number_boundary` (C-08) | w `main` (#117), **wgrana na db-1 01.10** |
| 00097 | Codex (#86) | `invoices_overdue_reconciliation_guard` | PR otwarty |
| 00098 | Bartosz (#90) | `backup_read_stripe_service_tables` | w `main` (#90, 02.10), **wgrana na db-1 28.09** |
| 00099 | Claude | `ksef_submission_references` (C-18) | PR `claude/ksef-niepewny-wynik`; wgranie PRZED wdrożeniem kodu |
| 00100 | Claude | `ops_gate` (bramka Telegram: rola `ops_actor`, schemat `ops`) | PR `claude/bramka-telegram`; wgranie PRZED uruchomieniem bramki |
| 00100–00101 | Codex (#128, szkic) | `ksef_expense_provenance_guard`, `ksef_expense_full_update_guard` | PR otwarty — **00100 koliduje z `00100_ops_gate` na `main`**, do przenumerowania (od 00103) |
| 00102 | Claude | `signup_gate_hook` (AUD-63) | w `main`, **wgrana na db-1**; zmienne `GOTRUE_HOOK_BEFORE_USER_CREATED_*` ustawione 02.10 |
| 00103 | Claude | `org_role_guards` (AUD-29: owner nadaje/odbiera tylko owner) | w `main` (#156), **wgrana na db-1 02.10** |
| 00104 | Claude | `service_function_grants` (AUD-30, AUD-64: EXECUTE tylko service_role) | w `main` (#156), **wgrana na db-1 02.10** |
| 00105 | Claude | `flo_usage_increment` (AUD-116: atomowy zapis zużycia AI) | w `main` (#156), **wgrana na db-1 02.10** |
| 00106 | Claude | `org_rpc_public_revoke` (dopełnienie 00103: EXECUTE bez PUBLIC) | w `main` (#156), **wgrana na db-1 02.10** |
| 00107 | Claude | `invoice_xml_generated_at` (AUD-46: stała DataWytworzeniaFa) | w `main` (#156), **wgrana na db-1 02.10** |
| 00108 | Claude | `flag_require_mfa_sensitive` (AUD-65: wiersz flagi, wyłączony) | w `main` (#156), **wgrana na db-1 02.10** |
| 00109 | Claude | `stripe_webhook_retention` (AUD-79: porównanie `data`; AUD-81: retencja payloadów 90 dni) | w `main` (#156), **wgrana na db-1 02.10** |
| 00110 | Claude | `billing_invoice_numbering` (AUD-69: kolejny numer, data PL, status paid) | w `main` (#156), **wgrana na db-1 02.10** |
| 00111 | Claude | `tenant_ksef_credentials_flag` (AUD-103: kolumna generowana `has_ksef_credentials`) | w `main` (#156), **wgrana na db-1 02.10** |
| 00112 | Claude | `tenant_credentials_column_privileges` (AUD-103: bez SELECT blobu KSeF dla ról klienckich) | w `main` (#156), **wgrana na db-1 02.10 po wdrożeniu**; nowe kolumny `tenants` wymagają odtąd jawnego GRANT SELECT |
| 00113 | Claude | `user_deletion_foreign_keys` (AUD-41: autor wydatku, OCR i dostępu księgowej → `ON DELETE SET NULL`; `gdpr_user_deletion_blockers` przed anonimizacją; AUD-81: stare `email_bounces.raw_payload`) | w `main` (#156), **wgrana na db-1 02.10** |
| 00200 | Claude (audyt bloku 1, #166) | `correction_negative_total_paid_check` (F-004: CHECK `check_paid_amount_valid` dopuszcza ujemne brutto korekty, wpłata 0) | w `main` (#166), **wgrana na db-1 02.10**; numer spoza kolejności — kolejne migracje dalej od 00114 |
| 00114 | Codex (#62) → Claude (C-20) | `stripe_customer_claim` (dawniej 00083: trwały claim tworzenia Customer) | PR `claude/codex-62-stripe`; przed wdrożeniem, razem z 00115–00116 |
| 00115 | Codex (#62) → Claude (C-20) | `stripe_failed_payment_reference_rotation` (dawniej 00084: dowód pary PI–Charge przed skutkami finansowymi) | PR `claude/codex-62-stripe`; przed wdrożeniem |
| 00116 | Codex (#62) → Claude (C-20) | `stripe_checkout_session_id` (dawniej 00085: realne ID `cs_*`, CAS odzysku `uncertain`) | PR `claude/codex-62-stripe`; przed wdrożeniem |
| 00117 | Codex (#63) → Claude (C-20) | `ksef_certificate_claim_guard` (dawniej 00086: proweniencja środowiska KSeF dla firm, faktur, UPO, kolejki Offline24; atomowy claim certyfikatu) | PR `claude/codex-63-ksef-wlasciciel`; przed wdrożeniem, razem z 00118–00119 |
| 00118 | Codex (#63) → Claude (C-20) | `correction_parent_boundary` (dawniej 00087: rodzic korekty z tej samej firmy i przyjęty w KSeF) | PR `claude/codex-63-ksef-wlasciciel`; przed wdrożeniem |
| 00119 | Codex (#63) → Claude (C-20) | `invoice_pending_content_freeze` (dawniej 00088: treść dokumentu niezmienna od wysyłki) | PR `claude/codex-63-ksef-wlasciciel`; przed wdrożeniem |
| 00120 | Codex (#64) → Claude (C-20) | `incoming_ksef_identity` (dawniej 00089: tożsamość faktury przychodzącej (firma, środowisko, numer KSeF); unikalność numeru własnego tylko dla wychodzących) | PR `claude/codex-64-skrzynka`; przed wdrożeniem, razem z 00121 |
| 00121 | Codex (#64) → Claude (C-20) | `expense_ksef_invoice_identity` (dawniej 00090: jeden koszt na fakturę KSeF, złożony FK tej samej firmy) | PR `claude/codex-64-skrzynka`; przed wdrożeniem |
| **00122** | — | następny wolny (00200 zajęte) | — |

---

## Otwarte

### C-20 · Claude przejmuje szkice Codexa — `W TOKU` · decyzja: Bartosz (02.10.2026), wykonanie: Claude

**Codex, to do Ciebie.** Bartosz polecił 02.10.2026, żebym przejął pracę z Twoich
szkiców. Robię to zgodnie ze wspólnymi zasadami: **Twoich gałęzi `codex/*`
nie zmieniam**. Każdy szkic przenoszę na nową gałąź `claude/codex-*` od
aktualnego `main` (Twoje commity zostają z autorstwem, scalam je commitem
scalającym), rozwiązuję konflikty z `main`, sprawdzam treść względem
dzisiejszego kodu i otwieram osobny PR. Po scaleniu takiego PR GitHub oznaczy
Twój szkic jako scalony.

| Szkic | Co z nim | Kolejność |
|---|---|---|
| #83 (C-08, 00096) | treść już w `main` (#117, plik identyczny) — do zamknięcia | — |
| #115 (00098) | treść już w `main` (#90: 00098 i `snapshot-tables.ts` identyczne) — do zamknięcia | — |
| #104 (raport audytu HTTP) | przenoszę | 1 |
| #122 (C-12, kody QR offline) | przenoszę | 2 |
| #62 (Stripe, C-19) | przenoszę; migracje 00083–00085 → nowe numery od 00114 | 3 |
| #63 (C-15, dowód właściciela) | przenoszę po #62; 00086–00088 → kolejne numery | 4 |
| #64 (skrzynka) | po #63; 00089–00090 → kolejne numery | 5 |
| #71 (C-02, C-18: claim wysyłki) | po #64; 00093, 00095 → kolejne numery | 6 |
| #85 (C-05 ZAL, C-17) | po #71 | 7 |
| #86 (C-06, C-16) | po #71; 00097 → kolejny numer | 8 |
| #128 (C-11, waluta) | po stosie; 00100–00101 → kolejne numery (00100 koliduje z `ops_gate`) | 9 |

**Migracje** przenumerowuję od następnego wolnego numeru z rejestru, bo Twoje
00083–00097 pisane były na schemat sprzed 00091–00113 i w kolejności plików
weszłyby przed nimi. Przy każdej sprawdzam, czy `CREATE OR REPLACE` nie cofa
późniejszych poprawek z `main` (np. 00103, 00104, 00109, 00110, 00113).

**Prośba:** nie rozwijaj dalej tych gałęzi, żebyśmy nie pracowali dwa razy nad
tym samym. Uwagi i sprzeciwy — pod tą sprawą („Odpowiedź Codexa”) albo
w komentarzu do PR-a z przeniesieniem. Sprawy przypisane dotąd Tobie (C-02,
C-03, C-05 KOR, C-11, C-12, C-15, C-17, C-19 i przebudowa stosu) prowadzę
w ramach tych przeniesień. Partia 15 audytu (ROZ: AUD-23, 67, 71, 95) — po
scaleniu przeniesionego #85.

**Odpowiedź Codexa:** —


### C-01 · Konwencja kwot korekty sprzedaży — `ROZSTRZYGNIĘTE (02.10.2026, I1: różnica; #146)` · decyzja: Igor + Codex

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

**Rozstrzygnięcie (02.10.2026, Igor/Bartosz — decyzja I1):** dla obu rodzajów
korekty `invoices.*_total` = **różnica**. Wdrożone w Claude #146
(`correction-actions.ts`: `totals.*Delta`; generator KOR: P_13/P_14/P_15 =
różnica, wiersze `StanPrzed`). #63 przy rebase przyjmuje tę konwencję — nie
przywraca `ghost.netTotal` = wartości po korekcie. Status: `ROZSTRZYGNIĘTE`.

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

### C-06 · Widok „Zaległe płatności” pokazuje korekty — `W TOKU` (#86, migracja 00097) · migracja: Bartosz

**28.09 (Bartosz):** Codex robi to w #86 (`00097_invoices_overdue_reconciliation_guard`: tylko faktury ścigalne, bez korekt i bez ROZ do czasu C-01). Osobnej migracji Bartosza nie będzie — wgrywam 00097 po scaleniu #86.

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

### C-18 · Niepewny wynik wysyłki KSeF i UPO — #71 a mały PR Claude — `W TOKU` · decyzja: Bartosz (01.10), wykonanie: Claude + Codex

**01.10 — decyzja Bartosza:** stos #62→#63→#64→#71 (~14 tys. linii, szkice z 28.09,
podstawa #62 w konflikcie z `main`) nie wchodzi teraz w całości. Claude robi na `main`
mały PR z tym, czego #71 nie robi; **Codex przebudowuje stos na aktualny `main`**.

**PR Claude `claude/ksef-niepewny-wynik` (migracja 00099):**
- `ksef_submissions` dostaje `session_reference_number` / `invoice_reference_number`;
  zapis zaraz po przyjęciu pliku (`submitInvoice` → hook `onInvoiceSent`);
- job wysyłki: krok `reconcile-previous-submission` — gdy jest otwarta wysyłka,
  status po numerze referencyjnym zamiast ponownego POST (AUD-01);
- 440 z numerem sesji z NASZEJ historii → akceptacja z `originalKsefNumber`;
  440 spoza historii → neutralny `KSEF_DUPLICATE_RECONCILE` (jak `ROZ_HOLD_RECONCILE`,
  `manualReconciliationRequired: true`, bez „odrzucona”);
- 408 do ponowienia, 401 → unieważnienie sesji i ponowienie;
- UPO ze ścieżki `/sessions/{ref}/invoices/ksef/{numer}/upo` (AUD-17 — stara ścieżka
  nie istnieje w API); numer sesji w zdarzeniu `invoice/upo.requested` albo z historii.

**Dla Codexa przy przebudowie stosu:** `submit-invoice.ts` zmieni się w obu miejscach —
konflikt rozwiązuje ten, kto scala drugi. `claimInvoiceForKsefSend` z #71 i krok
uzgadniania z tego PR się uzupełniają: claim chroni przed dwoma jobami naraz, uzgadnianie —
przed ponowną wysyłką po niepewnym wyniku. Przy konflikcie zachować oba. Atomowe
przejęcie wysyłki (AUD-10) zostaje po stronie #71.

**Odpowiedź Codexa:** —

### C-19 · Jeden plan 29,99 zł brutto — plan roczny wycofany — `OTWARTE` · decyzja: Bartosz (01.10), wykonanie: Codex (Stripe w #62)

Decyzja Bartosza z 1 października 2026: **jeden plan miesięczny, 29,99 zł
brutto**, 30 dni triala z kartą przy starcie, bez planu rocznego i bez
„money-back”. Cena żyje w `lib/billing/pricing.ts` (Claude, PR
`claude/jedna-cena`): treści, panel i maile biorą ją stamtąd, a
`startCheckoutAction` odrzuca plan `annual`.

Rdzenia Stripe nie ruszałem, bo zmienia go Twój #62:
- `getConfiguredStripePriceIds()` (`lib/stripe/event-mapping.ts`) nadal wymaga
  `STRIPE_PRICE_ANNUAL` i rzuca bez niego. Prośba: niech roczny będzie
  opcjonalny (mapowanie istniejących subskrypcji rocznych zostaje, nowych nie
  ma). Do tego czasu Bartosz musi ustawić dowolny osobny Price ID roczny.
- `self-invoice.ts` traktuje kwotę ze Stripe jako brutto — zgodne z ceną
  brutto, więc tu bez zmian (C-14 dalej otwarte).

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

### C-17 · Faktura zaliczkowa bez daty otrzymania zapłaty (P_6) — `OTWARTE` · wykonanie: Codex (#85)

Art. 106e ust. 1 pkt 6: faktura zawiera datę otrzymania zapłaty (art. 106b
ust. 1 pkt 4), **jeśli różni się od daty wystawienia**. Zaliczkę wolno
zafakturować do 15. dnia następnego miesiąca (art. 106i ust. 2), więc różnica
to częsty przypadek: wpłata 28.09, faktura 3.10. Obowiązek VAT powstaje
w dniu wpłaty (art. 19a ust. 8), czyli we wrześniu.

Dziś:

| miejsce | stan |
|---|---|
| formularz ZAL (`components/invoices/advance-form.tsx`, `advanceInvoiceSchema`) | brak pola „data otrzymania zaliczki”; jest tylko `expectedDeliveryDate` |
| generator (`lib/ksef/fa3-advance-generator.ts`) | nie wystawia `P_6`; `expectedDeliveryDate` idzie poprawnie do `DodatkowyOpis` |
| JPK_V7M (`DataSprzedazy`) | dla ZAL bierze `saleDate`, którego ZAL nie ma — okres po dacie wystawienia (eksport i tak wstrzymany, #66) |

Propozycja: opcjonalne pole „data otrzymania zaliczki” (domyślnie data
wystawienia, nie później niż ona), zapis w danych faktury, `P_6` w XML, gdy
różna od `P_1`, ten sam wiersz na PDF i `saleDate` dla JPK. Pliki formularza,
akcji i generatora są w Twoim #85 — dlatego zgłaszam, a nie zmieniam.

**Odpowiedź Codexa:** —

### C-18 · Przepływy: dane od 1 stycznia dla szacunku podatku — `OTWARTE` · wykonanie: Codex (`app/(dashboard)/przeplywy/page.tsx` w Twoim stosie)

Kafelek „Szac. podatek YTD” liczył zysk z okna wykresu (6 miesięcy) — w
październiku gubił styczeń–kwiecień, w lutym doliczał zeszły rok. Claude
naprawił liczenie w `components/expenses/cash-flow-dashboard.tsx`
(`lib/dashboard/tax-estimate.ts`): tylko bieżący rok, a gdy dane zaczynają
się później niż 1 stycznia, etykieta mówi „od 1 maja · bez wcześniejszych
miesięcy roku”.

Pełny rok wymaga, żeby strona ładowała faktury i wydatki od
`min(sześć miesięcy wstecz, 1 stycznia)` — dziś zapytania biorą
`gte('issue_date', sixMonthsAgo)`. Plik przepisujesz w #63+ (środowisko KSeF,
`readCompletePages`), więc zmiana zakresu powinna wejść tam, razem
z przekazaniem faktycznego początku danych: `<CashFlowDashboard dataFrom=…>`
(prop już jest; bez niego komponent przyjmuje początek okna wykresu).
Wykres zostaje na sześciu miesiącach.

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

**Odpowiedź Bartosza (odczyt 28.09):** w logach workera od wdrożenia 25.09 — **0** trafień `uq_invoices_tenant_internal_number`. Żadna z 2 firm na produkcji nie ma poświadczeń KSeF, więc skrzynka nic nie pobiera i dziś nic nie ginie. Dublety `(tenant_id, ksef_number)` odebranych: **0**, `(tenant_id, internal_number)` wystawionych: **0**. Próba 00096 z #83 w transakcji z `ROLLBACK` na produkcyjnym schemacie — bez błędów. Wydzielenie z #83 (od `main`) wystarcza; wgrywam po scaleniu.

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

**Odpowiedź Bartosza (odczyt 28.09):** ROZ przyjętych przez KSeF: **0**, ROZ w ogóle: **0**, zaliczek: **0**. `KOR_ROZ` nie jest potrzebny. Produkcja od 28.09 stoi na `b25c126` (z #82/#84, bez #87) — bezpieczne wyłącznie dlatego, że żadna firma nie ma poświadczeń KSeF; **#87 musi wejść przed pierwszą firmą z KSeF**.

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
