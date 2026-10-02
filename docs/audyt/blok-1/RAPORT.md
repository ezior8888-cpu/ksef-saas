# Raport — audyt bloku 1: funkcjonalność i logika domenowa

Stan kodu: `audyt/blok-1` @ `c989309` (= `origin/main@19821ea` + dokumenty zadania), 2 października 2026.
Wzorce: ISO/IEC 25010 (functional suitability) i SOC 2 (processing integrity).

## Podsumowanie

Ścieżka podstawowa działa: zwykła faktura VAT w PLN dla krajowej firmy lub konsumenta zostanie wystawiona, przeliczona spójnie (formularz, baza, XML i PDF używają jednego kalkulatora), zwalidowana lokalnie względem aktualnego XSD FA(3) 1-0E (plik w repo jest bajt w bajt zgodny z oficjalnym), wysłana do KSeF i dostanie numer KSeF oraz UPO. Dane sprzedawcy i nabywcy są zamrażane na fakturze, a wysyłka ma przemyślane zabezpieczenia przed nadpisaniem stanu „przyjęta”.

Problem w tym, że produkt urywa się zaraz za tą ścieżką. Największe ryzyka:

1. **Każda ścieżka poza „wystaw i wyślij od razu” kończy się ślepą uliczką.** Szkic, faktura odrzucona przez KSeF i faktura wstrzymana nie dają się wysłać, poprawić ani usunąć, a ich numer zostaje zajęty (F-001, F-002).
2. **Korekty praktycznie nie działają.** Generator wpisuje element, którego nie ma w schemacie, więc każda korekta faktury z numerem KSeF odpada na walidacji (F-049). Korekta zmniejszająca kwotę nie zapisze się w bazie (F-004). Na produkcji korekty i tak są wstrzymane, a faktury końcowe (ROZ) wstrzymane wszędzie (F-003).
3. **PDF dla klienta jest wadliwy.**
   - Nagłówek tabeli rozjeżdża się na każdej fakturze, a powyżej ok. 22 pozycji dokument rozpada się na dziesiątki stron (F-054).
   - Brakuje kodu QR, który od lutego 2026 musi być na każdej fakturze przekazywanej poza KSeF (F-045; naprawiane w PR #147).
   - PDF korekty pokazuje kwoty niezgodne z XML (F-055).
4. **Obieg kosztów ma luki prowadzące do błędnej KPiR i JPK.**
   - Import z KSeF psuje numery rachunków i numery faktur (F-079).
   - Koszt z KSeF może po cichu nie powstać (F-038).
   - Po przerwie dłuższej niż 90 dni skrzynka pomija miesiące faktur (F-039).
   - VAT od hoteli i restauracji jest odliczany w całości (F-077).
5. **Brakuje rzeczy, które u konkurencji są oczywiste:** numeracji automatycznej (F-015), wyszukiwania faktur (lista pokazuje 100 ostatnich, F-086), oznaczania zapłaty (F-006) i sprzedaży walutowej oraz zagranicznej (F-007).
6. **Daty w formularzach liczone są w UTC.** Przycisk „14 dni” ustawia termin 13 dni po dacie wystawienia (F-013).

Sporą część błędów w obiegu KSeF (Offline24, kody QR, `xml_documents`, ponowienia, waluta kosztów) poprawiają już otwarte PR (#63, #64, #71, #85, #86, #122, #128, #134, #147, #151, #158, #159, #161). Te znaleziska są tu odnotowane z numerem PR i nie są naprawiane drugi raz.

## Jak czytać

- **Typ:** BŁĄD (istniejąca funkcja działa źle), NIEDOKOŃCZONE (funkcja jest częściowo), BRAK (funkcji nie ma).
- **Waga:**
  - K1 — błędny dokument lub kwota, niezgodność z prawem, utrata danych, dubel w KSeF;
  - K2 — użytkownik nie dokończy podstawowej sprawy;
  - K3 — przypadek brzegowy z obejściem;
  - K4 — drobiazg.
- **Pewność:** POTWIERDZONE (odtworzone testem lub uruchomieniem kodu) albo Z ODCZYTU (wynika z lektury, nieuruchomione). Skrypty potwierdzające leżą lokalnie w `.audyt-tmp/` (poza gitem); każdy przypadek POTWIERDZONE, który przechodzi do planu, dostaje test w repo.
- **PR:**
  - „naprawiane w PR #N” — otwarty PR usuwa błąd;
  - „kod zmieniany w PR #N” — PR przerabia ten sam fragment kodu, ale tego błędu nie usuwa. Zgodnie z ustaleniem z Bartkiem z 2.10 nie naprawiam takich miejsc, żeby nie kolidować z PR scalanymi w nocy.
  - Mapa „plik → PR” powstała z `git diff --name-only <merge-base> <gałąź PR>` dla 28 otwartych PR (lista w `STAN.md`), a przy każdym znalezisku K1/K2 sprawdziłem hunki diffu.
- Ustaleń audytu bezpieczeństwa (`AUD-NN`) nie powtarzam. Tam, gdzie znalezisko domenowe pokrywa się z nimi, podaję numer.

## Mapa systemu (skrót)

- **Ekrany (App Router):**
  - `/invoices` (lista), `/invoices/new` z wariantami `regular`, `correction`, `advance`, `final`, `/invoices/[id]` (szczegół);
  - `/contractors`, `/inbox` (koszty z KSeF), `/expenses` i `/expenses/[id]`;
  - `/payments/overdue`, `/reports` z `/reports/exports` i `/reports/kpir`, `/przeplywy`;
  - `/settings/*` (`ksef`, `accountant`, `reminders`, `team`, …), `/onboarding/*` (w tym magiczny import), `/accountant/[token]` (portal księgowej).
- **Akcje serwerowe** (40 plików `'use server'`):
  - faktury: `components/invoices/{actions,actions-detail,correction-actions,advance-actions,final-actions}.ts`;
  - pozostałe: `app/actions/*` (wydatki, eksporty, przypomnienia, metoda kasowa, zwolnienie z VAT);
  - API: PDF (`app/api/invoices/[id]/pdf`), paczka PDF (`batch-pdf`), eksport z portalu, webhooki.
- **Zadania w tle:** pg-boss (`lib/jobs/`) z ciałami w `lib/inngest/jobs/`. Ważne kolejki:
  - wysyłka i UPO: `invoice.submit.requested`, `invoice.upo.requested`, `cron.upo-retry-stale`;
  - skrzynka i koszty: `cron.inbox-polling`, `inbox.poll.tenant`, `inbox.invoice-received` (autokategoryzacja), `ocr.process-photo`;
  - Offline24: `cron.process-offline-queue`;
  - pozostałe: `exports.generate.requested`, `cron.reminder-scheduler`, `cron.co-pilot-monthly`, `import.*`.
- **Tabele i statusy:**
  - `invoices.ksef_status` przyjmuje wartości `draft`, `queued`, `sending`, `accepted`, `rejected`, `received`, `failed`, `offline_queued`; jest tylko CHECK, bez reguł przejść.
  - `invoice_kind` przyjmuje `regular`, `correction`, `advance`, `final`; `invoice_type` to VAT/KOR/ZAL/ROZ.
  - `payment_status` (`unpaid`, `partial`, `paid`, `overdue`) liczony triggerem z `paid_amount`.
  - Pozostałe: `invoice_line_items`, `contractors`, `expenses`, `ksef_submissions`, `ksef_offline_queue`, `upo_receipts`, `xml_documents`, `audit_logs`.

## Przypadki użycia

| # | Przypadek | Status | Znaleziska |
|---|---|---|---|
| 1 | Założenie firmy (NIP → GUS) i jej dane | CZĘŚCIOWO — tylko z GUS, danych nie da się poprawić | F-008 |
| 2 | Połączenie z KSeF (certyfikat) | CZĘŚCIOWO — tylko klucz RSA PKCS#8 bez hasła | F-009 |
| 3 | Kontrahent (baza nabywców) | CZĘŚCIOWO — tylko podręczna pamięć wyszukiwań GUS | F-011 |
| 4 | Wystawienie faktury VAT krajowej w PLN | CZĘŚCIOWO — działa, ale numer ręczny, termin z przycisków o dzień krótszy, formularz przepuszcza dane odrzucane później | F-013, F-015, F-040, F-041, F-092 |
| 5 | Wysyłka do KSeF, numer KSeF | DZIAŁA na ścieżce szczęśliwej; awarie patrz 9–11 | F-028–F-036 |
| 6 | UPO | DZIAŁA (przypadki brzegowe) | F-037 |
| 7 | PDF faktury dla klienta | CZĘŚCIOWO — rozjechana tabela, brak KOD I | F-054, F-045, F-069 |
| 8 | Wysłanie faktury klientowi e-mailem | DZIAŁA (także dla szkicu, bez ostrzeżenia) | F-057 |
| 9 | Szkic → późniejsza wysyłka | NIE DZIAŁA | F-001 |
| 10 | Odrzucenie przez KSeF → poprawa i ponowna wysyłka | NIE DZIAŁA | F-002, F-031 |
| 11 | Niedostępność KSeF → Offline24 → dosłanie | CZĘŚCIOWO — QR niezgodne, terminy błędne (w PR) | F-045–F-048 |
| 12 | Oznaczenie zapłaty | BRAK (tylko karta FLO w canary) | F-006 |
| 13 | Przypomnienia o płatności | CZĘŚCIOWO — ignorują korekty, część ustawień martwa | F-073, F-074 |
| 14 | Faktura korygująca | NIE DZIAŁA | F-003, F-004, F-049, F-016 |
| 15 | Faktura zaliczkowa | CZĘŚCIOWO — brak wymaganych elementów | F-020, F-022 |
| 16 | Faktura końcowa (ROZ) | NIE DZIAŁA (wstrzymana) | F-003, F-024, F-025 |
| 17 | Przekazanie danych księgowej (JPK_FA, KPiR, CSV, portal) | CZĘŚCIOWO | F-058–F-063 |
| 18 | Odbiór faktur kosztowych z KSeF | CZĘŚCIOWO | F-038, F-039, F-076–F-083 |
| 19 | OCR paragonów i faktur | DZIAŁA (waluta przez NBP, deduplikacja ponowień) | F-077, F-081 |
| 20 | Sprzedaż walutowa, UE, eksport | BRAK | F-007 |
| 21 | Wyszukiwanie i filtrowanie faktur | BRAK | F-086 |
| 22 | Import historii (KSeF, CSV konkurencji) | CZĘŚCIOWO | F-078–F-080, F-085, F-089 |

## Obszary

### 1. Pokrycie przypadków użycia

**Działa:**
- Wystawienie i natychmiastowa wysyłka zwykłej faktury.
- Pobranie numeru KSeF i UPO (`app/(dashboard)/invoices/[id]/upo-actions.ts`).
- PDF i e-mail z PDF.
- Skrzynka KSeF z paginacją i HWM.
- OCR z przeliczeniem walut przez NBP.
- KPiR w układzie 17 kolumn.
- JPK_FA(4) zgodny z XSD.

**Błędne lub niedokończone:**
- Brak dalszego życia szkicu i faktury odrzuconej (F-001, F-002).
- Korekty, zaliczki i ROZ (F-003, F-004, F-005, F-020).
- Oznaczanie płatności (F-006).
- Dane firmy (F-008), certyfikat KSeF (F-009), import kosztów historycznych (F-010), kontrahenci (F-011).

**Brakuje:** sprzedaży walutowej i zagranicznej (F-007).

### 2. Reguły biznesowe i obliczenia

**Działa:**
- Jeden kalkulator (`lib/xml/invoice-calculator.ts`), z którego korzystają formularz, akcja, XML i PDF. Kwoty pozycji zaokrąglane `roundToCents` z poprawką epsilon; w bazie `NUMERIC(…,2)`.
- Sumy per stawka i P_15 zgodne do grosza.
- Adnotacje faktury zwykłej: `zw` → P_19 + P_19A; `oo` → P_18=1 + P_13_10; MPP → P_18A=1; metoda kasowa → P_16=1.
- Zaliczka liczy VAT od brutto bezbłędnie (przegląd 0,01–3000 zł).
- Korekta przed/po liczy różnice z pełnych stanów (POTWIERDZONE przez subagenta skryptem).

**Błędne:**
- Daty w formularzach (F-013, F-014).
- Kolejne korekty (F-016), korekty kwotowe (F-017), stawki zwolnione w korektach (F-018), parowanie wierszy (F-019).
- Adnotacje w KOR/ZAL/ROZ (F-022, F-023).
- Kwoty ROZ (F-024, F-025).

**Do decyzji:** metoda liczenia VAT (F-012).

**Brakuje:** numeracji (F-015).

### 3. Model domeny i cykle życia

**Działa:**
- Snapshot sprzedawcy, nabywcy i pozycji na fakturze (`seller_data`, `buyer_data`, `fa3_data`); późniejsza edycja kontrahenta nie zmienia historii.
- Job nigdy nie nadpisuje stanu `accepted` (`lib/inngest/jobs/submit-invoice.ts:649`).
- Po przekroczeniu czasu albo błędzie 5xx następuje uzgodnienie po numerze referencyjnym, a nie ponowna wysyłka.
- 440 przypinany tylko dla własnej sesji.
- Trigger `guard_invoice_payment_evidence` (migracja 00073) chroni kluczowe kolumny faktury przyjętej przed rolą klienta.

**Błędne:**
- Statusy bez reguł przejść; niezmienność częściowa (F-027).
- Pętle i zawieszenia w jobach (F-028–F-037).
- Skrzynka (F-038, F-039).

### 4. Walidacja i przypadki brzegowe

**Działa:**
- Ten sam schemat Zod w formularzu i w akcji „Wystaw i wyślij”.
- NIP i PESEL z sumą kontrolną; daty nieistniejące (2026-02-31) odrzucane.
- Podwójne kliknięcie: blokada w formularzu i unikalny numer w bazie z czytelnym komunikatem.

**Błędne:**
- Formularz przepuszcza dane, które odrzuca dopiero job albo XSD (F-040, F-041).
- Szkic bez walidacji serwerowej (F-042).
- Edycja wydatku (F-043).

### 5. Zgodność z przepisami

Wymagania ustalone ze źródeł pierwotnych (repozytorium MF `CIRFMF/ksef-docs` ze schematami XSD i `open-api.json`; strony `*.gov.pl` były zablokowane przez proxy sesji i są cytowane z indeksu wyszukiwarki, oznaczone niżej):

| Wymaganie | Źródło | Stan | Kod |
|---|---|---|---|
| R-01 Obowiązek KSeF: od 1.02.2026 (sprzedaż powyżej 200 mln zł), od 1.04.2026 pozostali, od 1.01.2027 mikro ≤10 tys. zł/mies.; odbiór przez KSeF od 1.02.2026 | ksef.podatki.gov.pl — tylko indeks | zweryfikowane pośrednio | — |
| R-03 Kary od 1.01.2027; MF zapowiedział 16.09.2026 przesunięcie do 31.12.2027 (projekt ustawy) | gov.pl/web/finanse — tylko indeks | NIEZWERYFIKOWANE (stan legislacji) | — |
| R-04 Schemat FA(3), przestrzeń `http://crd.gov.pl/wzor/2025/06/25/13775/`, wersja `1-0E`; brak nowszej wersji FA(3) na 22.09.2026 | CIRFMF XSD + `open-api.json` | ZWERYFIKOWANE | zgodne: `lib/xml/schemas/fa3/schemat.xsd` identyczny (sha256) |
| R-05 Elementy obowiązkowe art. 106e ust. 1 → pola FA(3) (P_1, P_2, Podmiot1/2, P_6, P_7–P_12, P_13_x, P_14_x, P_15, P_16–P_23, PMarzy) | adnotacje XSD | ZWERYFIKOWANE (mapowanie) | zgodne dla faktury krajowej; brak P_10 (rabat), marży, P_22, PodmiotUpowazniony (F-051) |
| R-08 MPP (P_18A) gdy należność **przekracza** 15 000 zł, zał. 15, nabywca podatnikiem | adnotacja XSD | ZWERYFIKOWANE | podpowiedź `>=` (F-053) |
| R-09 Zwolnienie: P_19 + dokładnie jedno z P_19A/B/C | XSD | ZWERYFIKOWANE | tylko P_19A; korekty z `zw` niemożliwe (F-018) |
| R-11 Korekta: `RodzajFaktury` KOR; `DaneFaKorygowanej` z `NrKSeFFaKorygowanej` albo `NrKSeFN`; P_13/P_14/P_15 jako różnica; przyczyna opcjonalna | XSD, art. 106j | XSD ZWERYFIKOWANE, ustawa NIEZWERYFIKOWANA w źródle pierwotnym | błąd nazwy elementu (F-049) |
| R-12 Terminy: offline24 — następny dzień roboczy po dacie P_1; niedostępność — następny dzień roboczy po jej końcu; awaria — 7 dni roboczych po jej końcu; awaria całkowita — bez wysyłki | CIRFMF `tryby-offline.md` | ZWERYFIKOWANE | błędne (F-047, w PR #147) |
| R-13 Faktura offline wysyłana z `offlineMode: true` | CIRFMF `open-api.json` | ZWERYFIKOWANE | brak (F-048) |
| R-14 KOD I: `{qr[-test\|-demo].ksef.mf.gov.pl}/invoice/{NIP}/{DD-MM-RRRR}/{SHA-256 XML, Base64URL}`, pod kodem numer KSeF albo „OFFLINE” | CIRFMF `kody-qr.md` | ZWERYFIKOWANE | `lib/ksef/qr-verification.ts` zgodny; `qr-codes.ts` niezgodny (F-046) |
| R-15 KOD II (offline): link `/certificate/…` podpisany RSASSA-PSS lub ECDSA certyfikatem KSeF typu Offline, napis „CERTYFIKAT” | CIRFMF `kody-qr.md` | ZWERYFIKOWANE | niezgodny (F-046, w PR #122) |
| R-16 Wizualizacja przekazana poza KSeF od 1.02.2026 musi mieć KOD I z numerem KSeF; offline — dwa kody | rozp. MFiG z 12.12.2025 (Dz.U. 2025 poz. 1815); ksef.podatki.gov.pl — tylko indeks | zweryfikowane pośrednio | KOD I nie trafia na PDF (F-045) |
| R-18 Faktura walutowa: kurs NBP z dnia roboczego poprzedzającego (art. 31a), VAT w PLN (art. 106e ust. 11, P_14_xW) | XSD | XSD ZWERYFIKOWANE, ustawa NIEZWERYFIKOWANA | tylko PLN (F-007) |
| R-19 Numer: „kolejny numer nadany w ramach jednej lub więcej serii” (art. 106e ust. 1 pkt 2); KSeF wykrywa duplikat po NIP + rodzaju + P_2 | adnotacja XSD, CIRFMF | ZWERYFIKOWANE | numer ręczny (F-015), unikalność per firma (F-052) |
| R-20 Retencja: art. 112 (do przedawnienia, ok. 5 lat); KSeF przechowuje 10 lat | ksef.podatki.gov.pl — tylko indeks | zweryfikowane pośrednio | polityka 10 lat — zgodne |
| R-22 API 2.8.0: kod 21184 „Sesja tymczasowo niedostępna” | CIRFMF `api-changelog.md` | ZWERYFIKOWANE | nieobsłużony (F-050) |
| R-23 Art. 106i ust. 7: fakturę można wystawić najwcześniej 60. dnia przed dostawą lub usługą | ustawa o VAT (źródło wtórne: poradnikprzedsiebiorcy.pl) | NIEZWERYFIKOWANE w źródle pierwotnym | formularz zabrania daty sprzedaży po dacie wystawienia (F-014) |
| R-24 Kwota podatku „od sumy wartości sprzedaży netto” per stawka (art. 106e ust. 1 pkt 14); różnice groszowe metod uznawane za nieistotne | ustawa (cyt. w `docs/fa3-schema-analysis.md:38`), infor.pl (wtórne) | NIEZWERYFIKOWANE w źródle pierwotnym | VAT liczony per pozycja (F-012) |

### 6. Dokumenty wyjściowe, raporty, eksporty

**Działa:**
- PDF:
  - polskie znaki (Roboto) i adnotacje (MPP, odwrotne obciążenie, zwolnienie, metoda kasowa);
  - KOD I zgodny ze specyfikacją MF z numerem KSeF — gdy jest hash XML;
  - kwoty na PDF równe XML dla faktury zwykłej;
  - na ROZ „Do zapłaty” = P_15.
- JPK_FA(4) zgodny z XSD na przykładzie brzegowym.
- CSV: UTF-8 z BOM, separator `;`, przecinek dziesiętny, daty DD.MM.RRRR, ochrona przed formułami.
- KPiR XLSX: 17 kolumn, VAT nieodliczony w koszcie.
- Wyłączone formaty (JPK_V7M, Optima, Symfonia, Wapro, Subiekt) blokowane także po stronie serwera.

**Błędne:** F-054–F-072.

### 7. Wyszukiwanie, filtrowanie, operacje masowe

**Działa:** paginacja zapytań do skrzynki KSeF i deduplikacja numerów KSeF.

**Błędne lub brakuje:**
- Lista faktur bez wyszukiwania i ucięta do 100 (F-086).
- Wybór faktury do korekty ucięty do 50 (F-005).
- Listy wydatków bez nawigacji (F-087).
- Limity 1000 wierszy po cichu obcinają raporty (F-071).
- Paczka PDF (F-068), brak operacji masowych (F-090).

### Porównanie z konkurencją (podstawowy obieg faktury)

Źródło: strony pomocy Fakturowni, inFaktu, wFirmy i iFirmy (plany bazowe), dostęp 2.10.2026. Zestawienie powstało z wyników wyszukiwarki dla oficjalnych stron, bo pobieranie stron było zablokowane przez proxy sesji. Ceny i przypisanie do planów trzeba potwierdzić w przeglądarce.

| Funkcja | Fakturownia | inFakt | wFirma | iFirma | FaktFlow |
|---|---|---|---|---|---|
| Faktura walutowa, kurs NBP, VAT w PLN | tak | tak | tak | tak | **brak** (F-007) |
| Korekta (ilość, cena, do zera) | tak | tak | tak | tak | nie działa (F-049, F-004) |
| Zaliczkowa / końcowa | tak | tak | tak | tak | częściowo / wstrzymana |
| Proforma | tak | tak | tak | tak | brak |
| Duplikat | tak | tak | tak | tak | brak |
| E-mail z PDF | tak | tak | tak | tak | tak |
| Automatyczna numeracja z seriami i resetem | tak | tak | tak | tak | **brak** (F-015) |
| Rabat na pozycji | tak | tak | tak | tak | brak |
| Liczenie od brutto | tak | niepotwierdzone | tak | tak | brak |
| `zw` z podstawą, `oo`, MPP | tak | częściowo | tak | tak / niepotwierdzone | tak |
| JPK_FA | tak | tak | tak | tak | tak (bez korekt, F-060) |
| KSeF: wysyłka / odbiór kosztów | tak / tak | tak / tak | tak / nie w pakiecie | tak / tak | tak / częściowo |
| Faktury cykliczne | nie w Start | tak | tak | nie w Faktura+ | brak |

Do planu jako NOWA (kryterium c) kwalifikuje się automatyczna numeracja (F-015): mają ją wszyscy czterej, a ręczne wpisywanie numeru przy każdej fakturze prowadzi do dziur i duplikatów w serii.

Faktura walutowa też spełnia kryterium c, ale to duży zakres z decyzjami prawnymi: kurs, warianty WDT, eksport, np II, VAT-UE nabywcy. Nie da się jej bezpiecznie zrobić w jedną noc, więc trafia do pomysłów na później z uzasadnieniem.

## Znaleziska

### Obszar 1 — pokrycie przypadków użycia

#### F-001 — Szkicu nie da się wysłać, poprawić ani usunąć; jego numer przepada
- Typ: NIEDOKOŃCZONE · Waga: **K2** · Pewność: Z ODCZYTU (grep po całym repo) · PR: brak
- **Skutek:**
  - Faktura zapisana przyciskiem „Zapisz szkic” albo zapisana automatycznie, bo wysyłka nie ruszyła, zostaje szkicem na zawsze. Przyczyną automatycznego zapisu może być brak certyfikatu, pauza operatora albo błąd odczytu ustawień.
  - Komunikaty obiecują, że da się ją wysłać później (`lib/invoices/ksef-submit-enqueue.ts:71`, `lib/ksef/submission-holds.ts:27-28`).
  - Ponowne wpisanie tej samej faktury kończy się błędem „Faktura o numerze … już istnieje” (unikat `uq_invoices_tenant_internal_number`, migracja 00096), więc klient musi użyć nowego numeru i zostawia dziurę w serii.
- **Dowód:**
  - Jedynymi miejscami, które kolejkują wysyłkę (`enqueueKsefSubmitAfterDraft`), są akcje tworzące nowy dokument (`components/invoices/actions.ts:550`, `correction-actions.ts:538`, `advance-actions.ts:263`).
  - Nie ma akcji wysyłki szkicu ani strony edycji. Widok szczegółu ma tylko PDF, e-mail i XML (`components/invoices/invoice-detail-view.tsx:342-348`).
  - Zdarzenia audytu `invoice.draft_updated` i `draft_deleted` istnieją (`lib/audit/log.ts:54-55`), ale nic ich nie używa.
  - RLS pozwala usuwać tylko szkice (`supabase/migrations/00002_rls_policies.sql:114-119`), ale w UI nie ma przycisku.
- **Powinno:** szkic da się wysłać do KSeF po walidacji i da się go usunąć, co zwalnia numer.

#### F-002 — Faktury odrzuconej lub nieudanej nie da się poprawić ani wysłać ponownie
- Typ: NIEDOKOŃCZONE · Waga: **K2** · Pewność: Z ODCZYTU · PR: kod wysyłki zmieniany w PR #63, #71, #122, #147
- **Skutek:**
  - Każda faktura w stanie `rejected` lub `failed` jest martwa. Dotyczy to też odrzuconych lokalnie przez walidację, które nigdy nie dotarły do KSeF (`submit-invoice.ts:358-361`).
  - UI każe „ręcznie uzgodnić z KSeF”, ale nie ma żadnego ekranu uzgodnienia. Link „Przejdź do problematycznego pola” wraca na tę samą stronę (`components/invoices/error-display.tsx:18-19,60-66`).
- **Dowód:**
  - `resendInvoiceAction` zawsze zwraca „wstrzymana” (`components/invoices/actions-detail.ts:112-137`).
  - Brak czytelnika flagi `manualReconciliationRequired` poza powiadomieniem (`lib/inngest/jobs/notify-user.ts:184`).
- **Powinno:** dokument, którego KSeF nie przyjął, da się poprawić i wysłać pod tym samym numerem; wynik niepewny trafia do uzgodnienia po numerze referencyjnym.
- Uwaga: blokadę ponowień wprowadzono celowo (ryzyko dubla przy niepewnym wyniku), a projekt uzgadniania jest w PR #71.

#### F-003 — Faktury końcowe (ROZ) nie wysyłają się nigdzie, korekty nie wysyłają się na produkcji
- Typ: NIEDOKOŃCZONE · Waga: **K2** · Pewność: Z ODCZYTU · PR: — (znane: AUD-03, AUD-04)
- **Skutek:** ROZ zawsze kończy się komunikatem o wstrzymaniu (`lib/ksef/roz-submission-hold.ts`, `components/invoices/final-actions.ts:366-374`). Korekta na KSeF produkcyjnym zostaje szkicem (`lib/ksef/submission-holds.ts:30-33,61-63`), a w połączeniu z F-001 jest martwa.
- **Dowód:** sprawdzenia `isRozSubmission` i `isCorrectionHeldForEnv` w `lib/invoices/ksef-submit-enqueue.ts:93-111`. Komentarz blokady KOR mówi, że generator wysyła wartości „po” zamiast różnicy. Na `main` to już poprawione (`fa3-correction-generator.ts:150-172`, commit `aed95eb`), ale zostają F-049, F-004 i F-018.
- **Powinno:** blokady zdjęte po usunięciu przyczyn (decyzja Bartka po teście na KSeF TEST).

#### F-004 — Korekta zmniejszająca kwotę (i każde anulowanie) nie zapisze się w bazie
- Typ: BŁĄD · Waga: **K2** · Pewność: POTWIERDZONE (`scripts/verify-migration-00200.sh` na tymczasowym lokalnym Postgresie: INSERT z `gross_total = -246` odrzucony przez CHECK z 00012) · PR: brak
- **Skutek:** od commita `aed95eb` (AUD-21, 2.10.2026) suma korekty to różnica, czyli liczba ujemna dla korekty w dół. Ograniczenie `check_paid_amount_valid` wymaga `paid_amount <= gross_total`, a `paid_amount` ma wartość domyślną 0, więc `0 <= -246` nie jest spełnione. INSERT pada, a użytkownik widzi surowy błąd Postgresa.
- **Dowód:**
  - `supabase/migrations/00012_invoice_types_extension.sql:71` (`paid_amount … DEFAULT 0`) i `:113-118` (CHECK); żadna późniejsza migracja ani PR tego nie zmienia (grep po gałęziach PR).
  - Zapis różnicy: `components/invoices/correction-actions.ts:388-393`.
  - Test jednostkowy korekty mockuje bazę, więc tego nie łapie (`tests/unit/korekta-sumy-roznica.test.ts`).
- **Powinno:** dokument o ujemnej wartości da się zapisać (ograniczenie górne tylko dla `gross_total >= 0`).

#### F-005 — Korekta: tylko faktury B2B, tylko 50 ostatnich, bez wejścia ze szczegółu faktury
- Typ: NIEDOKOŃCZONE · Waga: K2 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #63 (`correction/page.tsx`, `correction-actions.ts`)
- **Skutek:**
  - Faktury dla konsumenta nie da się skorygować: `buyerDataFromParty` wymaga NIP (`components/invoices/correction-actions.ts:108-125,469`).
  - Starszych faktur też nie: lista ma 50 pozycji (`app/(dashboard)/invoices/new/correction/page.tsx:12-19`), a `?parentId` działa tylko w jej obrębie (`correction-form.tsx:185-187`).
  - Szczegół faktury nie ma przycisku „Koryguj”.
  - Danych nabywcy nie da się skorygować (brak `Podmiot2K`).

#### F-006 — Nie ma jak oznaczyć faktury jako zapłaconej
- Typ: BRAK · Waga: K2 · Pewność: Z ODCZYTU (UNSURE co do zasięgu canary FLO) · PR: brak
- **Skutek:**
  - Faktury gotówkowe i kartowe oraz faktury opłacone przelewem zostają „niezapłacone”, przechodzą w „zaległe” i dostają propozycje przypomnień.
  - Jedyna droga to karta FLO K-01 w trybie canary (`lib/flo/functions/payment-confirm-producer.ts`, `lib/flo/rollout.ts:62,74`).
  - Zdarzenie `invoice/payment.received` nie jest nigdzie emitowane (`lib/jobs/queues.ts:39`), więc `cancel-reminders-on-payment` nie działa.
  - Zapis `paid_amount` po stronie klienta zablokowano w ramach granicy bezpieczeństwa (migracje 00073, 00074).

#### F-007 — Brak sprzedaży walutowej, wewnątrzwspólnotowej i eksportowej
- Typ: BRAK · Waga: K2 · Pewność: POTWIERDZONE (subagent wygenerował XML) · PR: brak
- **Skutek:** firmy nie wystawią poprawnie faktury dla klienta z UE ani spoza kraju. Każde obejście daje błędny dokument (K1), który przechodzi XSD, więc nikt go nie zatrzyma.
- **Dowód:**
  - Waluta zawsze PLN (`types/invoice.ts:120`, `components/invoices/actions.ts:318`).
  - `np` zawsze „np I” (P_13_8) i `0` zawsze „0 KR”; brak WDT, eksportu i „np II” z P_18=1 (`lib/xml/fa3-generator.ts:75-83`).
  - Nabywca zawsze z kraju PL, z polskim NIP (`actions.ts:257-261`, `lib/schemas/invoice-form.ts:72-78`).
  - JST/GV zawsze 2, brak Podmiot3 (`fa3-generator.ts:291-292`).

#### F-008 — Danych firmy nie da się poprawić; założenie firmy tylko przez GUS
- Typ: NIEDOKOŃCZONE · Waga: K3 · Pewność: Z ODCZYTU · PR: akcje ustawień zmieniane w PR #63, #160, #161
- **Skutek:** błędny lub nieaktualny adres z GUS trafia na każdą fakturę. Ustawienia pokazują dane tylko do odczytu (`app/(dashboard)/settings/page.tsx:185-256`), a onboarding nie ma ręcznego wpisu (`components/onboarding/form.tsx:243-300`).

#### F-009 — Połączenie z KSeF przyjmuje tylko niezaszyfrowany klucz RSA PKCS#8
- Typ: NIEDOKOŃCZONE · Waga: K2 · Pewność: POTWIERDZONE dla formatów kluczy (subagent, WebCrypto); NIEZWERYFIKOWANE, jaki format wydaje MCU · PR: akcja uploadu zmieniana w PR #63, #160, #161
- **Skutek:** klucz zaszyfrowany hasłem, klucz PKCS#1 i klucz EC P-256 kończą się błędem „Certyfikat nie działa z KSeF”, a dokumentacja MF dopuszcza EC P-256 (`certyfikaty-KSeF.md`, CIRFMF). Nie ma też UI dla tokenu KSeF, mimo że istnieje `lib/ksef/auth-token.ts`.
- **Dowód:** `lib/ksef/auth.ts:136-142`, `components/settings/certificate-upload.tsx`.

#### F-010 — Faktury kosztowe sprzed założenia konta nie trafiają do aplikacji
- Typ: NIEDOKOŃCZONE · Waga: K2 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #63, #86
- **Skutek:** pierwsze odpytanie skrzynki sięga 48 h wstecz (`lib/inngest/jobs/inbox-polling.ts:54`). Magiczny import z UI pobiera tylko faktury wystawione (`app/onboarding/magic-import/actions.ts:65`) i nie uruchamia autokategoryzacji (`lib/inngest/jobs/magic-import-ksef.ts`).

#### F-011 — Kontrahenci: brak dodawania, edycji, usuwania i wyszukiwania
- Typ: NIEDOKOŃCZONE · Waga: K3 · Pewność: Z ODCZYTU · PR: brak
- **Skutek:**
  - Baza kontrahentów to tylko pamięć wyszukiwań w GUS (`components/invoices/actions.ts:126-191`), nigdy nieodświeżana.
  - Nabywcy wpisani ręcznie nie są zapisywani.
  - Lista pokazuje 200 pozycji (`app/(dashboard)/contractors/page.tsx:14-21`).

### Obszar 2 — reguły biznesowe i obliczenia

#### F-012 — VAT liczony od każdej pozycji, a nie od sumy netto w stawce
- Typ: BŁĄD (do decyzji) · Waga: K3 · Pewność: POTWIERDZONE (skrypt: 3 × 0,07 zł netto przy 23% daje VAT 0,06 zamiast 0,05; 10 × 1,15 zł daje 2,60 zamiast 2,65) · PR: brak
- **Skutek:**
  - P_14_x to suma zaokrąglonych VAT-ów pozycji, a nie 23% od P_13_1. Różnica wynosi grosze na fakturze.
  - Art. 106e ust. 1 pkt 14 mówi o „kwocie podatku od sumy wartości sprzedaży netto”, a własna specyfikacja projektu (`docs/fa3-schema-analysis.md:38`) też tak opisuje P_14_1. Źródła wtórne uznają różnice groszowe metod za nieistotne, a inFakt liczy per pozycja.
- **Dowód:** `lib/xml/invoice-calculator.ts:71-128`.
- **Decyzja:** zmiana metody zmienia kwoty wszystkich faktur, więc wymaga decyzji Bartka (najlepiej z doradcą podatkowym). Nie naprawiam.

#### F-013 — Daty w formularzach liczone w UTC: przycisk „14 dni” daje 13 dni, a po północy data wystawienia to „wczoraj”
- Typ: BŁĄD · Waga: **K1** · Pewność: POTWIERDZONE (`TZ=Europe/Warsaw`: 2026-10-02 + 14 → 2026-10-15; + 0 → 2026-10-01) · PR: formularz zaliczki zmieniany w PR #85 (pomijam go)
- **Skutek:**
  - Przycisk terminu ustawia datę o dzień wcześniejszą niż wybrana. Termin trafia do XML w KSeF i na PDF, a zaległość i przypomnienia zaczynają się dzień wcześniej. Pole pokazuje datę, ale użytkownik nie ma powodu jej sprawdzać.
  - Między 00:00 a 01:00/02:00 czasu polskiego domyślna data wystawienia to poprzedni dzień, czyli przy przełomie miesiąca poprzedni okres VAT.
- **Dowód:**
  - `components/invoices/invoice-form.tsx:146,254-261`, `correction-form.tsx:98,102`, `final-form.tsx:81-82`.
  - Ten sam wzorzec jest w `advance-form.tsx:61-62` (PR #85).
  - `new Date(...).toISOString().slice(0, 10)` bierze datę UTC.
- **Powinno:** daty kalendarzowe liczone bez strefy, „dziś” liczone w Europe/Warsaw.

#### F-014 — Data sprzedaży późniejsza niż data wystawienia jest zabroniona
- Typ: BŁĄD · Waga: K3 · Pewność: POTWIERDZONE (subagent: walidacja odrzuca) · PR: brak (PR #134 zmienia sąsiedni fragment tego samego łańcucha walidacji)
- **Skutek:** nie da się wystawić faktury przed dostawą lub usługą, choć art. 106i ust. 7 na to pozwala (najwcześniej 60. dnia przed dostawą).
- **Dowód:** `lib/schemas/invoice-form.ts:109-118`, `lib/xml/invoice-calculator.ts:330-337`.

#### F-015 — Brak automatycznej numeracji faktur
- Typ: BRAK · Waga: K3 · Pewność: Z ODCZYTU · PR: brak
- **Skutek:**
  - Numer wpisuje się ręcznie przy każdej fakturze (`components/invoices/invoice-form.tsx:154,446-449`, placeholder na stałe „FV/2026/04/001”).
  - Ciągłość serii (art. 106e ust. 1 pkt 2) zależy wyłącznie od użytkownika.
  - Unikalność porównuje surowy tekst, więc „FV/1”, „fv/1” i „FV/1 ” to trzy różne numery.
- **Konkurencja:** numeracja z seriami i resetem miesięcznym lub rocznym jest u wszystkich czterech (Fakturownia `pomoc.fakturownia.pl/347326-Numerowanie-faktur`; inFakt `pomoc.infakt.pl/hc/pl/articles/115000177784`; wFirma `pomoc.wfirma.pl/-wybor-serii-numeracji-dokumentow`; iFirma `pomoc.ifirma.pl/pomoc-artykul/seria-numeracji-faktur-sprzedazy/`).

#### F-016 — Kolejna korekta i anulowanie liczą „stan przed” z faktury pierwotnej, ignorując wcześniejsze korekty
- Typ: BŁĄD · Waga: **K1** · Pewność: Z ODCZYTU (subagent potwierdził generator na danych) · PR: kod zmieniany w PR #63 — PR przebudowuje `fetchParentInvoiceLines` i wymusza „przed” równe fakturze pierwotnej, więc błędu nie usuwa
- **Skutek:** po korekcie 10 → 8 szt. druga korekta 8 → 6 szt. wykazuje −400/−492 zamiast −200/−246. Anulowanie po korekcie odwraca pełną pierwotną kwotę.
- **Dowód:** `components/invoices/correction-actions.ts:140-173` (pozycje zawsze z `invoice_line_items` rodzica) i `:472-483`; nic nie czyta korekt po `parent_invoice_id`.

#### F-017 — Korekta kwotowa: ujemna kwota przy 8% lub 5% trafia do stawki 23%; netto, VAT i brutto mogą się nie sumować
- Typ: BŁĄD · Waga: K1 · Pewność: POTWIERDZONE (subagent) · PR: **naprawiane w PR #63** (`resolveAmountChangeVatRate` odrzuca niespójne i niejednoznaczne kwoty)
- **Dowód:** `lib/ksef/fa3-correction-generator.ts:95-103`; `lib/validators/invoice-validators.ts:177-185`.

#### F-018 — Korekty dla stawki `zw`: stawka zamieniana na 23%, a generator odmawia
- Typ: BŁĄD · Waga: K1 · Pewność: Z ODCZYTU · PR: częściowo w PR #63 (zamiast cichego 23% rzuca „wymagane ręczne uzgodnienie”); AUD-04
- **Skutek:** firma zwolniona z VAT (art. 113, główna grupa docelowa) nie skoryguje faktury albo wyśle korektę z 23%.
- **Dowód:**
  - `components/invoices/correction-actions.ts:93-106` (zamiana na 23%);
  - schemat korekty bez `zw` (`lib/validators/invoice-validators.ts:48`);
  - generator rzuca na `zw` (`lib/ksef/fa3-correction-generator.ts:241-246`).

#### F-019 — Korekta przed/po paruje pozycje po kolejności, a nie po treści
- Typ: BŁĄD · Waga: K3 · Pewność: POTWIERDZONE (subagent: usunięcie środkowej z trzech pozycji daje wiersze „B przed → C po, C przed”) · PR: brak (PR #63 zmienia inny fragment pliku)
- **Skutek:** sumy są poprawne, ale wiersze opisują inną zmianę, niż zrobił użytkownik.
- **Dowód:** `lib/ksef/fa3-correction-generator.ts:137-147`.

#### F-020 — Faktura zaliczkowa bez wymaganych danych zamówienia i daty otrzymania zaliczki
- Typ: NIEDOKOŃCZONE · Waga: **K1** · Pewność: POTWIERDZONE (subagent: brak elementów w XML) · PR: generator i formularz zmieniane w PR #85 (adnotacje), bez tych elementów
- **Skutek:**
  - Brak bloku `Zamowienie` z wartością zamówienia (art. 106f ust. 1 pkt 4); wartość umowy jest tylko w wolnym tekście `DodatkowyOpis`.
  - Brak P_6 (data otrzymania zaliczki).
  - Sekcja `Platnosc` ma przyszły termin zamiast „zapłacono”.
- **Dowód:** `lib/ksef/fa3-advance-generator.ts:321,402-409`.

#### F-021 — Kilka zaliczek do jednego zamówienia nie jest śledzonych
- Typ: BRAK · Waga: K3 · Pewność: POTWIERDZONE (subagent) · PR: brak
- **Skutek:** „pozostało do rozliczenia” to umowa minus tylko bieżąca zaliczka (`lib/invoices/calculator.ts:153`). Zamówienia z kilkoma stawkami nie da się zaliczkować proporcjonalnie.

#### F-022 — Faktury zaliczkowe, korygujące i końcowe pomijają adnotacje firmy (metoda kasowa, MPP, zwolnienie)
- Typ: BŁĄD · Waga: K1 · Pewność: Z ODCZYTU · PR: **naprawiane w PR #85 dla ZAL**; KOR i ROZ bez zmian
- **Dowód:**
  - P_16=2, P_18A=2 i P_19N wpisane na sztywno: `fa3-advance-generator.ts:174-194`, `fa3-correction-generator.ts:237-257`.
  - Czy korekta musi powtarzać adnotację: NIEZWERYFIKOWANE.

#### F-023 — Metoda kasowa znika z faktur, gdy firma ma ustawioną podstawę zwolnienia
- Typ: BŁĄD · Waga: K1 · Pewność: POTWIERDZONE (subagent: 23% + `zw` + metoda kasowa daje P_16=2) · PR: **naprawiane w PR #158** (`isSubjectiveVatExemption`)
- **Dowód:** `lib/invoices/annotations.ts:49`.

#### F-024 — ROZ zapisuje w `gross_total` całe zamówienie: płatność nigdy „zapłacona”, przypomnienia o pełną kwotę
- Typ: BŁĄD · Waga: K1 (uśpione — ROZ wstrzymane; dotyczy już ROZ z importu) · Pewność: Z ODCZYTU · PR: pulpit naprawiany w PR #151; przypomnienia w PR #86 (częściowo)
- **Dowód:** `components/invoices/final-actions.ts:179,266`; przypomnienia liczą `gross_total − paid` (`lib/reminders/prepare-delivery.ts:53,89`).

#### F-025 — ROZ: brak kontroli, czy zaliczki należą do tego nabywcy i czy nie zostały już rozliczone
- Typ: BŁĄD · Waga: K1 (uśpione) · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #63, #71, #85
- **Dowód:** `app/(dashboard)/invoices/new/final/page.tsx:12-19`, `components/invoices/final-actions.ts:198-222`.

#### F-026 — Kwoty z więcej niż dwoma miejscami po przecinku
- Typ: BŁĄD · Waga: K4 · Pewność: POTWIERDZONE (subagent: zaliczka 100,005 daje P_15=100,00, a baza zapisze 100,01) · PR: formularz zaliczki w PR #85

### Obszar 3 — model domeny, cykle życia, zadania w tle

#### F-027 — Niezmienność wystawionej faktury tylko częściowa; statusy bez reguł przejść
- Typ: BŁĄD · Waga: K1 (tylko przy celowym obejściu UI) · Pewność: Z ODCZYTU · PR: **naprawiane w PR #63 (00088) i #71 (00093)**
- **Skutek:**
  - `sale_date`, `notes` i `invoice_type` przyjętej faktury oraz jej pozycje (`invoice_line_items`) dają się zmienić z poziomu klienta bazy. PDF budowany z tych tabel może się wtedy rozjechać z XML w KSeF.
  - Ten sam problem jako ustalenie bezpieczeństwa jest w PR #63 i #71.

#### F-028 — Status 550 lub 440 poprzedniej wysyłki → pętla uzgadniania bez końca
- Typ: BŁĄD · Waga: K2 · Pewność: POTWIERDZONE (subagent, test na mockach istniejącego testu) · PR: kod zmieniany w PR #63, #71, #122, #147, #159
- **Dowód:** `lib/inngest/jobs/submit-invoice.ts:713-735`; wiersz `ksef_submissions` zostaje `sent`, a kolejne próby tylko uzgadniają.

#### F-029 — Błąd XSD i błąd uwierzytelnienia traktowane jak awaria KSeF → 1 h 22 min ponowień → Offline24
- Typ: BŁĄD · Waga: K2 · Pewność: POTWIERDZONE (subagent) · PR: **naprawiane częściowo w PR #147** („błąd XSD bez ponowień”)
- **Dowód:** `lib/ksef/submit-invoice-full.ts:92-97` (zwykły `Error`), `submit-invoice.ts:848-881,301-341`.

#### F-030 — Wynik niepewny przed zapisem numerów referencyjnych → faktura przyjęta w KSeF, a w aplikacji „Błąd”
- Typ: BŁĄD · Waga: K2 · Pewność: Z ODCZYTU · PR: **naprawiane w PR #71** („uzgodnienie niepewnych wyników”, `submit-reference-boundary.ts`)
- **Dowód:** `lib/ksef/submit.ts:97-150` (referencja zapisywana po wysłaniu, błąd zapisu połykany).

#### F-031 — Powód odrzucenia przez KSeF ginie; powiadomienia wprowadzają w błąd
- Typ: BŁĄD · Waga: K2 · Pewność: POTWIERDZONE (subagent) · PR: kod zmieniany w PR #64, #71, #159
- **Skutek:**
  - Użytkownik widzi „NonRetriableError: KSeF odrzucił fakturę (HTTP 400): KSeF API POST … failed: 400” zamiast opisu z KSeF. Tłumacz błędów jest martwy: `logTranslatedErrorToInvoice` nie ma wywołań.
  - Przy przejściu w Offline24 przychodzi e-mail i push „Faktura odrzucona przez KSeF” (`lib/inngest/jobs/notify-user.ts:288`).
- **Dowód:** `lib/ksef/client.ts` (komunikat bez treści odpowiedzi), `submit-invoice.ts:186-192,243`.

#### F-032 — Stany, które mogą utknąć na zawsze, bez automatycznego sprzątania
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #63, #71, #147, #159
- **Przykłady:**
  - `sending` po trzech przerwanych przebiegach workera;
  - wiersz kolejki offline w `sending` po błędzie `sendEvent` (`process-offline-queue.ts:276-340`);
  - brak zamówienia UPO po awarii za `save-ksef-number` (`submit-invoice.ts:462-472`).

#### F-033 — XML FA(3) niedeterministyczny (`DataWytworzeniaFa = now`)
- Typ: BŁĄD · Waga: K3 · Pewność: POTWIERDZONE (subagent: dwa przebiegi dają różny SHA-256) · PR: **naprawiane w PR #161** („stały XML przy ponowieniach”)

#### F-034 — Brak atomowego przejęcia faktury przed wysyłką
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: **naprawiane w PR #71**
- **Dowód:** `submit-invoice.ts:638-654`. Dziś przed dublem chroni przypadkowo jedna kolejka z `batchSize 1`.

#### F-035 — Jedna nieudana sonda zdrowia przełącza na Offline24; „awaria MF” rozpoznawana po słowach „503” i „MF” w komunikacie
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #64, #147
- **Dowód:** `lib/ksef/health-check.ts:95-121`, `submit-invoice.ts:321-327`.

#### F-036 — Przepustowość wysyłek i ignorowany nagłówek Retry-After
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: **naprawiane w PR #159**

#### F-037 — UPO: przypadki brzegowe
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: `upo-retry-stale.ts` zmieniany w PR #63, #71, #159
- **Przypadki:**
  - Brak limitu prób.
  - Stały `NO_SESSION_REFERENCE`.
  - Data przyjęcia „teraz”, gdy nie da się odczytać jej z UPO (`lib/ksef/upo-client.ts:234-239`).
  - Nieudane UPO wyświetlane jako „w trakcie generowania”.

#### F-038 — Błąd po zapisie faktury kosztowej → koszt nigdy nie powstaje
- Typ: BŁĄD · Waga: **K1** · Pewność: POTWIERDZONE (subagent, test na mockach) · PR: kod zmieniany w PR #64 (te same kroki joba)
- **Skutek:** koszt brakuje w KPiR i JPK, a klient przepłaca podatek, nie wiedząc o tym.
- **Dowód:**
  - Kroki pg-boss nie są zapamiętywane (`lib/jobs/step-shim.ts:6-10`).
  - Po wyjątku za insertem (`lib/inngest/jobs/inbox-polling.ts:223-292` i dalej) ponowienie odsiewa zapisane faktury i nie wysyła zdarzeń autokategoryzacji (`:212-221`).
  - Nic nie szuka faktur przychodzących bez wydatku.

#### F-039 — Po przerwie dłuższej niż 90 dni skrzynka pomija miesiące faktur kosztowych
- Typ: BŁĄD · Waga: **K1** · Pewność: Z ODCZYTU + dokumentacja MF (subagent potwierdził na mocku) · PR: brak (PR #63 i #64 zmieniają inne fragmenty pliku)
- **Skutek:** firma, której odpytywanie stało ponad 90 dni (np. wygasły certyfikat), traci faktury kosztowe z okresu między końcem okna a bieżącym HWM.
- **Dowód:**
  - Zapytanie ma `dateRange.to` = koniec 90-dniowego okna, a kolejne okno startuje od zwróconego `permanentStorageHwmDate` (`lib/inngest/jobs/inbox-polling.ts:171`).
  - Dokumentacja MF (`pobieranie-faktur/przyrostowe-pobieranie-faktur.md`, CIRFMF): „Przez moment zakończenia rozumie się wartość `dateRange.to`, gdy została podana”. HWM jest globalny i może być późniejszy niż `to`.
- **Powinno:** następne okno od `min(HWM, dateRange.to)`.

### Obszar 4 — walidacja i przypadki brzegowe

#### F-040 — Formularz przepuszcza fakturę, którą potem odrzuca walidacja przy wysyłce
- Typ: BŁĄD · Waga: K2 · Pewność: POTWIERDZONE (subagent) · PR: **naprawiane w PR #134**
- **Skutek:** przelew bez numeru rachunku (domyślne ustawienie formularza), 26-cyfrowy NRB bez „PL”, data wystawienia sprzed 2025-09-01 lub ponad 30 dni naprzód. W połączeniu z F-002 numer przepada.

#### F-041 — Formularz przyjmuje dane, które XSD albo baza odrzucają dopiero po zapisie
- Typ: BŁĄD · Waga: K3 · Pewność: POTWIERDZONE (subagent: lokalny XSD i ograniczenia bazy) · PR: brak (PR #134 zmienia koniec łańcucha walidacji, nie schemat pozycji)
- **Przypadki:**
  - Znak sterujący w nazwie pozycji, np. pionowy tabulator z Worda: błąd XSD „PCDATA invalid Char value 11”.
  - Numer z samych spacji: P_2 łamie minLength.
  - Nazwa nabywcy dłuższa niż 512 znaków.
  - Jednostka dłuższa niż 50 znaków: `VARCHAR(50)` i surowy błąd Postgresa.
  - Kwoty przekraczające `NUMERIC(12,2)`.
- **Dowód:** `lib/schemas/invoice-form.ts:31-64`.

#### F-042 — Zapis szkicu bez walidacji serwerowej
- Typ: BŁĄD · Waga: K4 · Pewność: Z ODCZYTU · PR: brak
- **Dowód:** `components/invoices/actions.ts:487-497` nie wywołuje `invoiceFormSchema.safeParse`, a `saveAndSendInvoiceAction` je wywołuje (`:529`). Nabiera znaczenia, gdy szkic da się wysłać (F-001).

#### F-043 — Edycja wydatku bez walidacji serwerowej
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #128 (`app/actions/expenses.ts`)
- **Skutek:** brak sprawdzenia, czy netto + VAT = brutto, brak kontroli znaku i NIP. Puste pole zamienia się w 0 (`app/actions/expenses.ts:190-247`).

#### F-092 — Data wystawienia inna niż dzień wysyłki: KSeF odrzuci albo uzna fakturę za offline
- Typ: BŁĄD · Waga: **K2** · Pewność: Z ODCZYTU + dokumentacja MF · PR: reguła zakresu dat przenoszona do formularza w PR #134 (zostaje „do 30 dni naprzód”)
- Znalezione w trakcie wykonania planu (P-08).
- **Skutek:** formularz i walidacja przy wysyłce dopuszczają datę wystawienia do 30 dni w przyszłość i dowolnie wstecz (od 2025-09-01).
  - Datę późniejszą niż dzień przyjęcia KSeF odrzuca („Data wystawienia faktury (`P_1`) nie może być późniejsza niż data przyjęcia dokumentu do systemu KSeF”, CIRFMF `faktury/weryfikacja-faktury.md:35`), więc faktura kończy jako odrzucona i martwa (F-002).
  - Przy dacie wcześniejszej niż dzień wysyłki KSeF sam oznacza fakturę jako **offline** (`offline/automatyczne-okreslanie-trybu-offline.md`), a aplikacja nie dołącza wtedy kodów QR offline (F-046).
- **Dowód:** `lib/xml/invoice-calculator.ts:279-328` (`MAX_ISSUE_DATE_AHEAD_MS` = 30 dni); `components/invoices/actions.ts:523-533` (brak kontroli daty względem dnia wysyłki).
- **Powinno:** „Wystaw i wyślij” przyjmuje datę wystawienia = dziś (czas polski); inną datę można zapisać jako szkic.

#### F-044 — NIP „0000000000” przechodzi sumę kontrolną
- Typ: BŁĄD · Waga: K4 · Pewność: POTWIERDZONE (subagent) · PR: brak
- Import używa go jako zastępczego NIP sprzedawcy (`lib/import/import-engine.ts:576`).

### Obszar 5 — zgodność z przepisami

#### F-045 — Na PDF nie ma KOD I (kodu QR), a pobranie XML zawsze się nie udaje
- Typ: BŁĄD · Waga: **K1** · Pewność: Z ODCZYTU (grep: nic nie zapisuje `xml_documents`) · PR: **naprawiane w PR #147** (`lib/storage/xml-documents.ts`)
- **Skutek:** od 1.02.2026 faktura przekazana poza KSeF musi mieć KOD I (R-16).
  - Hash XML nie jest zapisywany, więc `lib/pdf/invoice-data.ts:236-243` zwraca `null` i PDF nie ma kodu.
  - `downloadInvoiceXmlAction` zawsze odpowiada „Brak rekordu xml_documents” (`components/invoices/actions-detail.ts:50-63`).

#### F-046 — Kody QR trybu Offline24 niezgodne ze specyfikacją MF i nieobecne na PDF
- Typ: BŁĄD · Waga: **K1** · Pewność: POTWIERDZONE (subagent: zmyślony URL, pseudo-podpis „HASH:”) · PR: **naprawiane w PR #122**
- **Dowód:**
  - `lib/ksef/qr-codes.ts:44,46-57,78`.
  - Generowany jest KOD I z nieistniejącym adresem `ksef.mf.gov.pl/web/verify?d=…`.
  - KOD II nie jest linkiem i jest podpisany PKCS#1 v1.5 certyfikatem zamiast klucza.
  - Kolumn `offline_qr_*` nikt nie czyta (`lib/pdf/invoice-data.ts:83-92`).
  - Fałszywy link jest też w `lib/ksef/upo-pdf-generator.ts:24` (PDF UPO).

#### F-047 — Terminy Offline24 liczone źle; faktura po terminie przepadała
- Typ: BŁĄD · Waga: **K1** · Pewność: POTWIERDZONE (subagent: 10.11 daje termin 11.11, czyli dzień świąteczny) · PR: **naprawiane w PR #147** (święta, czas warszawski, dosyłanie po terminie)
- **Dowód:** `lib/ksef/idempotency.ts:30-47`, `lib/inngest/jobs/process-offline-queue.ts:210-246`.

#### F-048 — Faktura offline wysyłana bez `offlineMode: true`; zaliczki i korekty z trybu offline nie wysyłają się wcale
- Typ: BŁĄD · Waga: **K1** · Pewność: Z ODCZYTU (UNSURE, jak KSeF potraktuje brak flagi) · PR: kod zmieniany w PR #63, #71, #122, #147
- **Dowód:**
  - `types/ksef.ts:127-138` nie ma pola.
  - `process-offline-queue.ts:313-322` nie przekazuje `correctionData` ani `advanceData`, więc `assertSpecialInvoiceData` odrzuca.
  - ZAL nie jest wstrzymany.

#### F-049 — Korekta faktury z numerem KSeF ma niepoprawny XML (`NumerKSeFFaKorygowanej` zamiast `NrKSeFFaKorygowanej`)
- Typ: BŁĄD · Waga: **K1** · Pewność: **POTWIERDZONE** (walidacja XSD: „Element 'NumerKSeFFaKorygowanej': This element is not expected. Expected is NrKSeFFaKorygowanej”) · PR: brak (sprawdzone na wszystkich gałęziach PR)
- **Skutek:**
  - Korygować można tylko faktury przyjęte w KSeF (`correction-actions.ts:459-462`), więc każda korekta odpada na lokalnej walidacji XSD.
  - Do KSeF nie trafia nic, a korekta ląduje jako nieudana i martwa (F-002).
  - Istniejące testy pokrywają tylko gałąź `NrKSeFN`.
- **Dowód:** `lib/ksef/fa3-correction-generator.ts:493-495`; schemat `lib/xml/schemas/fa3/schemat.xsd:2917`.

#### F-050 — Nieobsłużony kod KSeF 21184 „Sesja tymczasowo niedostępna” (API 2.8.0, produkcja od 23.09.2026)
- Typ: BRAK · Waga: K3 · Pewność: Z ODCZYTU (grep) · PR: brak
- **Skutek:** zalecana reakcja to otwarcie nowej sesji. Dziś kod trafia do ogólnej ścieżki ponowień albo odrzuceń.

#### F-051 — Procedury szczególne nieobsługiwane: marża, samofakturowanie, JST z Podmiot3, rabat P_10
- Typ: BRAK · Waga: K3 · Pewność: Z ODCZYTU · PR: brak
- **Skutek:** podatnik objęty marżą nie ma blokady i wystawi fakturę z `P_PMarzyN=1` (`fa3-generator.ts:441`).

#### F-052 — Unikalność numeru per organizacja, a KSeF sprawdza duplikat per NIP
- Typ: BŁĄD · Waga: K4 · Pewność: Z ODCZYTU · PR: brak
- Dwie organizacje z tym samym NIP mogą zderzyć się dopiero w KSeF (błąd 440).

#### F-053 — Podpowiedź MPP przy „co najmniej 15 000 zł” zamiast „powyżej”
- Typ: BŁĄD · Waga: K4 · Pewność: POTWIERDZONE · PR: **naprawiane w PR #151**

### Obszar 6 — dokumenty wyjściowe, raporty, eksporty

#### F-054 — PDF: nagłówek tabeli schodkuje na każdej fakturze, a powyżej ok. 22 pozycji dokument rozpada się na dziesiątki stron
- Typ: BŁĄD · Waga: **K1** · Pewność: **POTWIERDZONE** (render PDF do PNG: nagłówki kolumn po skosie przy 1 pozycji; 25 pozycji daje 29 stron, 40 pozycji 149 stron po jednej komórce na stronę; długie nazwy nachodzą na następny wiersz) · PR: brak (PR #151 zmienia inną funkcję pliku)
- **Skutek:** nabywca i księgowa dostają dokument, którego nie da się czytać.
- **Dowód:** `lib/pdf/invoice-renderer.ts:330-339`. Etykiety używają `doc.y + 6`, a `doc.y` przesuwa się po każdej etykiecie.
- `:343-369`: stała wysokość wiersza 20 pt, brak łamania stron, a `lineBreak: false` nie zapobiega zawijaniu.

#### F-055 — PDF korekty przed/po pokazuje stan po korekcie i różnicę jako „Do zapłaty”
- Typ: BŁĄD · Waga: **K1** · Pewność: POTWIERDZONE (subagent, render) · PR: zapis korekty zmieniany w PR #63 i #71, dane PDF w PR #122
- **Skutek:**
  - Przy korekcie 10 → 8 szt. PDF pokazuje „23% netto 800,00 VAT 184,00” obok „Do zapłaty −246,00”.
  - Brak stanu przed korektą i kwot korekty per stawka (art. 106j ust. 2 pkt 5). XML jest poprawny.
- **Dowód:** pozycje korekty zapisywane jako stan po (`correction-actions.ts:257-273`), sumy jako różnica (`:388-393`), PDF z pozycji (`invoice-renderer.ts:386-417`). Stan przed korektą nie jest nigdzie zapisany.

#### F-056 — PDF faktury końcowej bez numerów faktur zaliczkowych i kwot pomniejszonych per stawka
- Typ: BŁĄD · Waga: K1 (uśpione — ROZ wstrzymane) · Pewność: Z ODCZYTU · PR: dane PDF w PR #122
- **Dowód:** `lib/pdf/invoice-renderer.ts:167-183,403-429` (art. 106f ust. 3).

#### F-057 — Szkic i fakturę odrzuconą można wysłać nabywcy e-mailem jako zwykłą „Fakturę VAT”
- Typ: BŁĄD · Waga: K2 · Pewność: Z ODCZYTU · PR: akcja e-mail i PDF zmieniane w PR #122
- **Dowód:** `components/invoices/actions-detail.ts:158-201` (bez sprawdzenia statusu); znak wodny tylko przy `KSEF_ENV=test` (`lib/pdf/invoice-pdf.ts:93`).

#### F-058 — Eksport „KPiR Excel” domyślnie bez kosztów
- Typ: BŁĄD · Waga: K2 · Pewność: Z ODCZYTU · PR: brak dla formularza (`data-fetcher.ts` zmieniany w PR #63, #71, #86, #128)
- **Skutek:** księga ma same przychody, bo koszty (`expenses`, także paragony) są dołączane tylko przy zaznaczonym „Faktury otrzymane (zakupowe)”, a to pole jest domyślnie odznaczone.
- **Dowód:** `components/exports/exports-center.tsx:131,299`; `lib/exports/data-fetcher.ts:113-115`. Okres z samymi kosztami kończy się „Brak faktur” (`exports-generate.ts:317-320`, PR #71 i #128).

#### F-059 — Odznaczenie „Korekty” w eksporcie wycina też faktury zaliczkowe i końcowe
- Typ: BŁĄD · Waga: K2 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #71 (ten sam hunk)
- **Dowód:** `lib/exports/data-fetcher.ts:241-243` (`invoice_kind = 'regular'`).

#### F-060 — JPK_FA odmawia okresu, w którym jest korekta
- Typ: NIEDOKOŃCZONE · Waga: K2 · Pewność: POTWIERDZONE (subagent) · PR: generator zmieniany w PR #128
- **Dowód:** `lib/exports/jpk-fa-generator.ts:153-173`. Dotyczy też portalu księgowej. Odblokowanie wymaga stanu przed korektą (jak w F-055).

#### F-061 — JPK_V7M (wyłączony) wykazuje korekty stanem po zamiast różnicy
- Typ: BŁĄD · Waga: K1 przy włączeniu · Pewność: POTWIERDZONE (subagent) · PR: kod zmieniany w PR #128
- **Dowód:** `lib/exports/jpk-v7m-generator.ts:114-117,275-276`. Do naprawy przed włączeniem formatu.

#### F-062 — CSV: zakupy wyglądają jak sprzedaż, waluta zawsze PLN, brak rozbicia na stawki
- Typ: BŁĄD · Waga: K3 · Pewność: POTWIERDZONE (subagent) · PR: kod zmieniany w PR #128
- **Dowód:** `lib/exports/csv-generators.ts:122-162`.

#### F-063 — Portal księgowej: 100 ostatnich dokumentów wszystkich statusów i obu kierunków, bez okresu i bez PDF
- Typ: NIEDOKOŃCZONE · Waga: K2 · Pewność: Z ODCZYTU · PR: brak
- **Skutek:**
  - Księgowa widzi szkice i odrzucone faktury przemieszane z kosztami, ze statusami po angielsku („accepted”, „draft”).
  - „Pobierz XML” na szkicach i kosztach daje błąd 404.
- **Dowód:** `lib/accountant/load-accountant-portal.ts:57-62`; `components/accountant/invoice-list.tsx:61-69`; `app/accountant/[token]/download/[invoiceId]/route.ts:44-50`.

#### F-064 — Korekty zapisane przed AUD-21 mają sumy stanu po (albo 0), bez migracji porządkującej
- Typ: BŁĄD · Waga: K1 · Pewność: NIEPEWNE (zależy od danych produkcyjnych) · PR: brak
- KPiR, CSV i pulpit sumują `net_total`, więc historyczne korekty są liczone źle.

#### F-065 — Pulpit i przepływy liczą szkice i odrzucone faktury; brak górnej granicy daty i paginacji
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #71, #86, #128, #151
- **Dowód:** `lib/dashboard/monthly-figures.ts:63-68,76-81,193-205`.

#### F-066 — Eksporty biorą tylko faktury przyjęte w KSeF; zapytanie faktur bez paginacji
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #71
- **Dowód:** `lib/exports/data-fetcher.ts:236,245`. Faktury offline z okresu znikają bez ostrzeżenia, a ponad 1000 faktur zostaje obciętych.

#### F-067 — Faktury z importu historii mają surowe kody stawek: PDF pokazuje „undefined”, JPK_FA pada
- Typ: BŁĄD · Waga: K3 · Pewność: POTWIERDZONE (subagent) · PR: generator JPK zmieniany w PR #128
- **Dowód:** `lib/import/fa3-parser.ts:182` (np. „0 KR”, „np I”); `lib/pdf/invoice-renderer.ts:352,411` (etykieta z mapy bez wartości zapasowej); `lib/exports/jpk-fa-generator.ts:297-300`.

#### F-068 — Paczka PDF zawiera szkice i odrzucone faktury; jeden błąd psuje cały ZIP; ponad 100 faktur kończy się kodem 413
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #122
- **Dowód:** `app/api/invoices/batch-pdf/route.ts:83-89,106-110`.

#### F-069 — PDF zaokrągla cenę jednostkową i ilość do 2 miejsc; numer VAT-UE opisany jako „NIP”
- Typ: BŁĄD · Waga: K4 · Pewność: POTWIERDZONE (subagent: cena 100,1234 drukowana jako 100,12 obok wartości 150,19) · PR: brak
- **Dowód:** `lib/pdf/invoice-renderer.ts:88-93,348-350,294`.

#### F-070 — Raporty liczą „bieżący miesiąc” w strefie serwera
- Typ: BŁĄD · Waga: K4 · Pewność: POTWIERDZONE (subagent) · PR: kod zmieniany w PR #63, #71, #86, #128
- **Dowód:** `app/(dashboard)/reports/kpir/page.tsx:31-32`, `lib/dashboard/monthly-figures.ts:54-58`.

#### F-071 — KPiR i przepływy po cichu ucinane do 1000 wierszy
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU (`max_rows=1000` w `supabase/config.toml:18`; wartość produkcyjna nieznana) · PR: kod zmieniany w PR #63, #71, #86, #128
- **Dowód:** `app/(dashboard)/reports/kpir/page.tsx:34-53`, `app/(dashboard)/przeplywy/page.tsx:35-60`.

#### F-072 — Zaległe: kafelki liczone z pierwszych 100 pozycji
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #71, #86
- **Dowód:** `app/(dashboard)/payments/overdue/page.tsx:43-48,122`.

#### F-073 — Przypomnienia i lista zaległych ignorują korekty
- Typ: BŁĄD · Waga: **K1** · Pewność: Z ODCZYTU · PR: **naprawiane w PR #86** (strażnik uzgodnienia i widok 00097)
- **Skutek:** nabywca jest ścigany o kwotę sprzed korekty, a korekty z kwotą ujemną trafiają na listę zaległych.
- **Dowód:** `lib/reminders/prepare-delivery.ts:53,89`; widok `supabase/migrations/00082_invoices_overdue_outgoing.sql` bez filtra `invoice_kind`.

#### F-074 — Część ustawień przypomnień nic nie robi
- Typ: NIEDOKOŃCZONE · Waga: K3 · Pewność: Z ODCZYTU · PR: `reminder-scheduler.ts` zmieniany w PR #153
- **Przykłady:**
  - Pauzy po płatności lub odpowiedzi nigdzie nie są czytane (`components/reminders/reminder-settings-form.tsx:259-271`).
  - Godzina wysyłki i dni robocze nie działają, `recipientEmail` jest zawsze `null` (`lib/inngest/jobs/reminder-scheduler.ts:52-91`).
  - Przypomnienie dla konsumenta zawsze kończy się błędem „Brak poprawnego NIP” (`lib/reminders/delivery-safety.ts:71`).

#### F-075 — Wezwanie do zapłaty zawsze podaje rekompensatę 40 EUR
- Typ: BŁĄD · Waga: K4 · Pewność: Z ODCZYTU · PR: **naprawiane w PR #155** (40, 70 lub 100 EUR)

### Koszty (obszary 1–2 dla faktur zakupowych)

#### F-076 — Faktury kosztowe z KSeF w walucie obcej księgowane jako PLN
- Typ: BŁĄD · Waga: **K1** · Pewność: Z ODCZYTU · PR: **naprawiane w PR #128**
- **Dowód:** `lib/inngest/jobs/auto-categorize-inbox.ts:192-207,280-302`.

#### F-077 — Hotel i gastronomia: pełne odliczenie VAT, a „reprezentacja” w kosztach
- Typ: BŁĄD · Waga: **K1** · Pewność: POTWIERDZONE (subagent: heurystyka kategorii) · PR: zapis wydatku zmieniany w PR #128 i #158
- **Skutek:** VAT od usług noclegowych i gastronomicznych nie podlega odliczeniu (art. 88 ust. 1 pkt 4 lit. b), a reprezentacja nie jest kosztem (art. 23 ust. 1 pkt 23 ustawy o PIT). Aplikacja odlicza całość, a w edycji wydatku nie ma pola, które by to poprawiło.
- **Dowód:** `lib/categorization/heuristics.ts:38-49`; `auto-categorize-inbox.ts:296`; `process-ocr.ts:252-253`.

#### F-078 — Import deduplikuje po samym numerze faktury w całej firmie (bez kierunku i sprzedawcy)
- Typ: BŁĄD · Waga: **K1** · Pewność: POTWIERDZONE (subagent: z trzech różnych faktur zaimportowano jedną) · PR: **naprawiane w PR #64**
- **Dowód:** `lib/import/import-engine.ts:348-358,402-409,490`.

#### F-079 — Parser FA(3) psuje pola liczbopodobne: numer rachunku, numer faktury, kody
- Typ: BŁĄD · Waga: **K1** · Pewność: **POTWIERDZONE** (uruchomienie `parseFa3Xml`: NrRB `12345678901234567890123456` → `1.2345678901234568e+25`, P_2 `000123` → `123`, `1e3` → `1000`, `0012.50` → `12.5`) · PR: brak (PR #151 zmienia tylko funkcję zaokrąglenia)
- **Skutek:** faktury z importu historii mają zepsuty numer rachunku (drukowany na PDF) i numer faktury, co psuje też deduplikację i powiązania korekt.
- **Dowód:** `lib/import/fa3-parser.ts:66-73` (`parseTagValue: true`); ten sam wzorzec jest w `lib/import/jpk-fa-parser.ts`.

#### F-080 — Magiczny import gubi faktury nie-PLN i te z błędem XML; zapytanie o 90–730 dni naraz
- Typ: BŁĄD · Waga: K2 · Pewność: Z ODCZYTU (UNSURE dla limitu 100 dni) · PR: kod zmieniany w PR #63, #86
- **Dowód:** `lib/inngest/jobs/magic-import-ksef.ts:121-127`, `lib/import/fa3-parser.ts:126-133`, `lib/ksef/history-fetcher.ts:85-108`.

#### F-081 — Każdy koszt trafia do KPiR bez przeglądu; brak deduplikacji OCR ↔ KSeF
- Typ: BŁĄD · Waga: K2 · Pewność: Z ODCZYTU · PR: brak
- **Dowód:** `is_deductible` domyślnie TRUE (migracja 00034:80); KPiR i eksporty ignorują `is_reviewed` (`app/(dashboard)/reports/kpir/page.tsx:34-41`, `lib/exports/data-fetcher.ts:148-160`). Zdjęcie faktury z KSeF daje dwa koszty.
- **Decyzja:** to sprawa projektu obiegu (FLO zakłada przegląd), do decyzji Bartka.

#### F-082 — Odliczenie VAT od kosztu według daty wystawienia, a nie otrzymania w KSeF
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #63, #71, #86, #128
- **Dowód:** `lib/exports/data-fetcher.ts:156-157`, `lib/exports/jpk-v7m-generator.ts:386` (art. 86 ust. 10b pkt 1).

#### F-083 — Skrzynka zapisuje tylko metadane; korekty i zaliczki otrzymane wyglądają jak zwykłe faktury
- Typ: NIEDOKOŃCZONE · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #63, #64
- **Dowód:** `lib/inngest/jobs/inbox-polling.ts:244-246` (`invoice_type: 'VAT'` na sztywno). Brak pozycji i XML kosztu.

#### F-084 — „Uczenie się” kategorii nie działa dla sprzedawców bez NIP
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: brak
- **Dowód:** reguły `name_exact` są zapisywane (`lib/categorization/index.ts:182-193`), ale `lib/categorization/rule-engine.ts` czyta tylko typy `nip` i `keyword`.

#### F-085 — Import nie ustawia `origin`, więc stare faktury dostają propozycje przypomnień
- Typ: BŁĄD · Waga: K2 · Pewność: Z ODCZYTU · PR: **naprawiane w PR #64**
- **Dowód:** `lib/import/import-engine.ts:427-456`.

### Obszar 7 — wyszukiwanie, filtrowanie, operacje masowe

#### F-086 — Lista faktur: tylko 100 najnowszych, bez wyszukiwania, filtrów i stronicowania
- Typ: NIEDOKOŃCZONE · Waga: K2 · Pewność: Z ODCZYTU · PR: brak
- **Skutek:** starszych faktur nie da się znaleźć ani otworzyć z listy. W całym `(dashboard)` nie ma wyszukiwania, a `lib/pagination/cursor.ts` nie ma użyć.
- **Dowód:** `app/(dashboard)/invoices/page.tsx:15-23`.

#### F-087 — Wydatki i skrzynka bez nawigacji po okresach i bez wyszukiwania
- Typ: NIEDOKOŃCZONE · Waga: K3 · Pewność: Z ODCZYTU · PR: strona wydatku zmieniana w PR #128
- **Dowód:** `app/(dashboard)/expenses/page.tsx:31-35`, `app/(dashboard)/inbox/page.tsx:38-46`.

#### F-088 — Masowa walidacja kontrahentów: najwyżej 1000 wierszy, `.in()` bez podziału na paczki, błędy zapisu ignorowane
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU (UNSURE) · PR: brak
- **Dowód:** `app/actions/validation.ts:116-120`, `lib/inngest/jobs/bulk-validate-contractors.ts:22-26,66-70`.

#### F-089 — Import plików: `.in()` bez podziału, waluta CSV i P_6 ignorowane, liczniki produktów podwajane przy ponowieniu
- Typ: BŁĄD · Waga: K3 · Pewność: Z ODCZYTU · PR: kod zmieniany w PR #63, #64, #86

#### F-090 — Brak operacji masowych poza paczką PDF
- Typ: BRAK · Waga: K4 · Pewność: Z ODCZYTU · PR: brak

#### F-091 — Drobiazgi (zbiorczo)
- Typ: BŁĄD · Waga: K4 · Pewność: Z ODCZYTU · PR: różne
- Szczegół faktury pokazuje ilość i cenę z 2 miejscami (`invoice-detail-view.tsx:289,295`), a `ksef_accepted_at` jako surowy znacznik ISO.
- Toast po „Wystaw i wyślij” jest taki sam w trybie Offline24.
- Podtytuł listy mówi „wysłane do KSeF”, choć lista zawiera szkice.
- Nieaktualne komentarze w `inbox-polling.ts:35-39,186-188` i `xml_documents` w migracji 00027.
- Martwy `lib/dashboard/aggregates.ts`; push „Faktura opłacona” prowadzi do nieistniejącej strony `/payments`.
- Status połączenia KSeF zielony po wygaśnięciu certyfikatu.
- Luki audytu: pauza lub brak weryfikacji KSeF daje szkic bez wpisu w `audit_logs`; `logAudit` po cichu ignoruje błąd zapisu (`lib/audit/log.ts:128-150`).

## Poza zakresem (inne bloki audytu)

**Bezpieczeństwo** (jedno zdanie, bez szczegółów; numery `AUD-NN` i PR, gdzie są):
- Akcje zapisu korekt przyjmują identyfikator faktury pierwotnej i dane sprzedawcy z przeglądarki bez kontroli po stronie serwera (`components/invoices/correction-actions.ts`; PR #63).
- Pozycje faktury przyjętej dają się zmienić z poziomu klienta bazy (`supabase/migrations/00002_rls_policies.sql`; PR #63/#71).
- Pamięć sesji KSeF jest kluczowana samym NIP-em (`lib/ksef/session-cache.ts`).
- Wgranie certyfikatu KSeF nie sprawdza roli w organizacji (`components/settings/actions.ts`).
- Cofnięcie tokenu księgowej opiera się wyłącznie na RLS (`components/settings/accountant-actions.ts`).
- Token portalu księgowej jest częścią adresu URL (`app/accountant/[token]`).
- Akcje przeglądu i usuwania wydatku biorą organizację z ciasteczka bez sprawdzenia członkostwa (`app/actions/expenses.ts`).

**Wydajność:**
- Pamięć podręczna PDF nigdy nie trafia, bo zapis ścieżki podbija `updated_at` (`lib/pdf/pdf-storage.ts`).
- Odpytywanie statusu wysyłki trzyma jedyny slot workera do ~16 min (`lib/ksef/submit.ts`).
- Eksport trzyma cały zbiór danych w wyniku kroku joba (`lib/inngest/jobs/exports-generate.ts`).
- `.in()` z setkami identyfikatorów może przekroczyć długość adresu (`lib/exports/data-fetcher.ts`).

**UX:**
- Pole e-mail nie jest wypełniane adresem nabywcy.
- Wiersze skrzynki nie są klikalne.
- Kwoty bez kursu oznaczone jako „PLN” na liście wydatków.
- Natywne okna `confirm()`.
- Surowe błędy Postgresa przy przepełnieniu pól.

**Jakość kodu i dokumentacja:**
- `AGENTS.md` opisuje nieaktualny stos (Inngest, NextAuth, R2, Vercel).
- `KONTEKST-REPO.md` wskazuje `docs/launch/01-TWOJ-PLAN-TERAZ.md`, którego nie ma w repo.
- `FAKTFLOW-DLA-AI.md` zawiera polecenia dla asystentów AI (zapis do pamięci, czytanie `instrukcja.txt`, którego nie ma w repo) — warto je usunąć.
- Komentarze obiecują deterministyczny XML i działający tłumacz błędów.

**Agent FLO:** poza zakresem. Dotyka faktur tylko przez kartę płatności K-01 (F-006) i podpowiedź „wypełnij z ostatniej”.

## Źródła

Wszystkie z dostępem 2.10.2026.

**Źródła pierwotne MF:**
- Repozytorium dokumentacji KSeF 2.0: https://github.com/CIRFMF/ksef-docs (klon HEAD `c50f855` z 22.09.2026, przemianowane na CIRFMF/ksef-api). Wykorzystane pliki:
  - `faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd`, `open-api.json`, `srodowiska.md`, `api-changelog.md`;
  - `tryby-offline.md`, `offline/automatyczne-okreslanie-trybu-offline.md`, `offline/korekta-techniczna.md`;
  - `kody-qr.md`, `faktury/numer-ksef.md`, `faktury/weryfikacja-faktury.md`;
  - `pobieranie-faktur/przyrostowe-pobieranie-faktur.md`, `certyfikaty-KSeF.md`.

**Strony MF i ISAP** — zablokowane przez proxy sesji, treść tylko z indeksu wyszukiwarki:
- https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/podstawy-prawne-oraz-kluczowe-terminy/
- https://ksef.podatki.gov.pl/ponizej-10-000-zl/
- https://ksef.podatki.gov.pl/ksef-news/zasady-obowiazywania-ksef-i-przepisy-prawne/
- https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/kody-weryfikujace-qr/
- https://ksef.podatki.gov.pl/pytania-i-odpowiedzi-ksef-20/
- https://www.gov.pl/web/finanse/przedluzenie-odroczenia-kar-za-bledy-w-stosowaniu-ksef-do-konca-2027-r
- Rozporządzenie MFiG z 12.12.2025 w sprawie korzystania z KSeF (Dz.U. 2025 poz. 1815): https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU20250001815/O/D20251815.pdf

**Źródła wtórne:**
- Art. 106i ust. 7 (60 dni): https://poradnikprzedsiebiorcy.pl/-wczesniejsze-wystawianie-faktur-za-i-przeciw
- Metody liczenia VAT: https://ksiegowosc.infor.pl/podatki/vat/faktura/729627,Czy-drobne-roznice-w-wyliczeniu-VAT-przy-stosowaniu-roznych-metod-sa-dopuszczalne.html oraz https://www.infakt.pl/blog/jak-jest-wyliczany-podatek-vat-na-fakturach/

**Konkurencja:** strony pomocy z wyników wyszukiwarki, zestawienie w tabeli wyżej.
- Fakturownia: https://pomoc.fakturownia.pl/1237002-faktura-walutowa, https://pomoc.fakturownia.pl/347326-Numerowanie-faktur, https://pomoc.fakturownia.pl/89452541-jak-utworzyc-korekte-do-faktury, https://fakturownia.pl/ksef
- inFakt: https://pomoc.infakt.pl/hc/pl/articles/115001013410, https://pomoc.infakt.pl/hc/pl/articles/115000177784, https://pomoc.infakt.pl/hc/pl/articles/200973656
- wFirma: https://pomoc.wfirma.pl/-faktura-sprzedazy-dla-zagranicznego-kontrahenta-jak-wystawic, https://pomoc.wfirma.pl/-wybor-serii-numeracji-dokumentow, https://pomoc.wfirma.pl/-faktura-korygujaca-pozycje-faktury-jak-wystawic
- iFirma: https://pomoc.ifirma.pl/pomoc-artykul/jak-wystawic-fakture-z-cena-okreslona-w-walucie-obcej/, https://pomoc.ifirma.pl/pomoc-artykul/seria-numeracji-faktur-sprzedazy/, https://pomoc.ifirma.pl/pomoc-artykul/faktura-korygujaca-sprzedaz-krajowa-w-pigulce/

**Metoda:**
- Sześciu subagentów przejrzało obszary A–F równolegle (tylko odczyt), a dwóch kolejnych zebrało przepisy i dane o konkurencji.
- Każde znalezisko K1/K2 z ich ustaleń sprawdziłem w kodzie. F-049, F-054 i F-079 potwierdziłem dodatkowo uruchomieniem, a F-013 i F-012 własnym skryptem.
- Mapę PR zbudowałem na gałęziach pobranych tylko do odczytu.
