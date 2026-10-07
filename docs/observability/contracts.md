# F0 — kontrakty wyników i korelacji

Stan: **propozycja do zatwierdzenia**, 04.10.2026. Według ustaleń z 07.10
Igor jest właścicielem monitoringu i decyzji F0; Codex przygotowuje materiał,
a udział Bartosza ograniczamy do koniecznych czynności operatorskich zgodnie
z [rejestrem](ownership.md#decyzje-i-deklaracje-przekazane-07102026).
Publikacja tego dokumentu nie zatwierdza kontraktów i nie wdraża instrumentacji,
dziennika ani nowych statusów domenowych. F0-G04 pozostaje **PENDING**.

Ten dokument zawiera cały proponowany kontrakt. Bieżący pomiar środowiska jest
w [inwentarzu](runtime-inventory.md), polityka eksportu w [data-policy](data-policy.md),
a scenariusze w [planie odbioru](acceptance-plan.md). Odczyt z 04.10.2026,
11:03–11:22 UTC, był wyłącznie odczytem; web i worker były healthy na
`ae87bdde93a636fcb2c48aef737e57a80a3315a7` o 11:21 UTC, po wdrożeniu z innej sesji.
Pomiar nie oznacza odbioru proponowanych kontraktów.

## Historyczny punkt odniesienia kodu

Odnośniki kodowe wskazują niezmienny snapshot
`dcf48bad4ca63802b57f7046d8932b369cd9cfc9`. Opisują podstawę przygotowania
kontraktów, a nie potwierdzoną wersję produkcji lub stan każdego pliku na bazie
publikacji `1f95c97`. Wdrożenie kontraktu wymaga ponownego przeglądu aktualnego kodu.

- [run-job.ts](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/run-job.ts)
  rozliczał wykonanie techniczne i nie przenosił zwróconej wartości handlera do
  wspólnego wyniku domenowego. Zielony run-log nie dowodził biznesowego sukcesu.
- [enqueue.ts](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/enqueue.ts)
  miał `inTransaction`, wspólne połączenie pg-boss i `singletonKey`.
  [KSeF enqueue](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/invoices/ksef-submit-enqueue.ts)
  korzystał ze wspólnej transakcji. Journal i korelacja powinny rozszerzać tę
  istniejącą granicę, zamiast wprowadzać osobny mechanizm kolejki.
- [Inbox](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/runners/inbox-polling.ts)
  emitował auto-categorize przed kartą/pushem i wykorzystywał singletonKey oraz
  inbox-backfill. To dowód kodu, nie kompletności skutków ani aktywnego harmonogramu.

## Wynik i źródło prawdy

`technical_outcome` opisuje próbę handlera. `business_outcome` opisuje wynik
obiecany użytkownikowi. `completed` w kolejce, HTTP 200, event Sentry lub wpis
audit nie wystarczają do uznania biznesowego sukcesu. Stan domeny ma
pierwszeństwo przed projekcją operacji; monitoring nie staje się silnikiem
faktur lub płatności.

Proponowane klasy wyniku: `succeeded`, `partial`, `failed`, `unknown`,
`cancelled`, `rejected_input`, `held`. `waiting_retry`, `waiting_dependency`
i `waiting_human` opisują postęp. `reconciliation_required` oznacza potrzebę
uzgodnienia możliwego efektu; obserwator nie resetuje claimów i nie ponawia
finansowego POST.

| Rodzina / proponowane typy | Autorytatywny wynik i osobne kamienie milowe | Unknown / partial / brak postępu | Proponowana populacja i termin |
|---|---|---|---|
| Faktura i UPO: `invoice.submit`, `upo.archive`, agregat `invoice.issue.full` | `invoices` accepted, numer KSeF i zgodne referencje `ksef_submissions`; osobno `upo_receipts` downloaded oraz zgodne pliki w storage. [Submit](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/runners/submit-invoice.ts), [UPO](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/runners/download-upo.ts). | Timeout po POST lub brak trwałej referencji: unknown/reconciliation bez drugiego POST. Accepted bez UPO to sukces submit i niekompletny pipeline; dziecko ma własny wiek. | Submit: jedna kwalifikująca intencja, accepted ≤120 s od przyjęcia. UPO: accepted outgoing z dojrzałym deadline, wymagane pliki ≤15 min od accepted. Full ma odrębny mianownik. |
| Skrzynka: `inbox.scan`, `inbox.xml.archive`, `inbox.expense.create` | `ksef_inbox_cursor`, kompletność okna i zapisane tożsamości `invoices`; osobno archiwum XML i `expenses`. [Polling](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/runners/inbox-polling.ts), [archiwum](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/ksef/inbox-xml.ts). | HWM nie dowodzi fan-out. Ucięty scan, błąd query lub brak dzieci: partial/unknown. Poprawny scan bez nowych faktur jest zdrowym zerem. | Kwalifikujące tenant-minuty: kompletne skanowanie i HWM lag ≤30 min. Disabled/invalid credentials osobno widoczne; kwalifikacji nie zmieniać po błędzie. |
| OCR/import: `ocr.extract`, `import.file`, `import.ksef.history` | `ocr_jobs.completed` z poprawnym `expense_id` lub jawnym review; księgowanie osobno. Import: `import_jobs`, faktyczne nagłówki/pozycje, liczby zapisanych i legalnie pominiętych elementów, XML osobno. [OCR](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/runners/process-ocr.ts), [import](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/import/import-engine.ts). | `success:false`, niezapisane pozycje lub `archived:false` nie stają się sukcesem przez completed handlera. Partial pokazuje brakujące elementy. | Przyjęte po walidacji pliki z dojrzałym deadline: OCR ≤5 min, import ≤10 min tylko w klasie rozmiaru odebranej na staging. Limit pliku PENDING. |
| Billing: `billing.payment`, `billing.vat.handoff` → submit → UPO | Stripe state i domenowe receipts/attempts/payments; osobno entitlement, faktura VAT i potwierdzony handoff. [Webhook](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/app/api/stripe/webhook/route.ts), [VAT](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/runners/self-invoice-payment.ts). | Receipt processing/processed nie dowodzi wszystkich skutków. Możliwy efekt bez finalizacji: reconciliation bez automatycznego reclaim/refund. Opłacone bez VAT/handoff: niekompletny pipeline. | Jedna kwalifikująca opłacona płatność, VAT i potwierdzony enqueue ≤15 min; KSeF/UPO osobno. Replay webhooka nie zwiększa populacji. |
| Flo: `flo.tick`, `flo.execute` | Tick: pokrycie kwalifikujących firm/reguł i osobny wynik każdej. Execute: efekt domenowy, wersja proposal/approval, istniejący claim i końcowy stan. [Tick](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/flo/tick.ts), [execute](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/flo/execute.ts). | Zero kart może być sukcesem; pominięta firma z błędem to partial. Waiting human nie jest awarią workera. Efekt wykonany bez done wymaga reconciliation bez ponownego zużycia approval. | Oczekiwane firmy/reguły na okno. Terminy tick/execute do decyzji po przeglądzie aktualnego registry i klas efektów. |
| Eksporty, powiadomienia, backup, housekeeping | Eksport: `export_jobs`, `export_files`, dostępny obiekt i hash; pusty okres osobno. Notify: karta, przyjęcie przez dostawcę i push osobno. Snapshot: `backup_log.success`, obiekt/hash/liczniki. Verify: integrity, coverage i świeżość. Retencja: faktycznie usunięty obiekt i wiersz. | Provider accepted nie dowodzi doręczenia. Ograniczony JSON snapshot i verify nie dowodzą pełnej kopii ani restore. Audit przed DELETE nie dowodzi usunięcia; błędy count/list i pending pozostają widoczne. | Eksport ≤10 min w ustalonej klasie pliku. Pozostałe terminy z aktywnych harmonogramów i grace; brak pierwszego sukcesu i najstarszy backlog osobno. |

Auth/MFA i wybór organizacji są granicami HTTP do odbioru. Support stream
rozdziela rozpoczęcie HTTP 200, dostarczenie odpowiedzi, zapis wiadomości i
eskalację. Przyjęcie sześciu rodzin nie pomija tych granic.

## Zasady liczenia

- Jeden wynik dla jednej przyjętej intencji i `source_generation`; retry,
  redelivery i deployment nie powiększają mianownika.
- `accepted_at` to trwałe przyjęcie intencji po walidacji. Deadline ustala się
  wtedy; odmowy/hold wcześniej mają osobny licznik. Awarii po przyjęciu nie
  wyłącza się wstecznie z populacji, także przy awarii dostawcy.
- Do czasowego SLI wchodzą dojrzałe deadline, również utknięte operacje.
  Unknown po deadline jest złym wynikiem SLI i nadal wymaga uzgodnienia.
- `expected = succeeded + failed + skipped + pending`; terminalna kompletność
  wymaga `pending = 0`. Skipped wymaga legalnego powodu, np. dedup. Nieznane
  expected lub niepełny scan daje unknown/partial.
- Agregat niesie `query_success`, `scan_complete`, `source_freshness` i okno.
  Błąd query/timeout nie staje się zerem. Bez kwalifikujących operacji jest
  brak próby; przy nieświeżych danych wynik jest unknown.
- SLI rozstrzyga domena/ledger; eksport at-least-once wymaga deduplikacji
  i okresowego uzgodnienia. Sampling trace nie usuwa outcome.

## Kontrakt korelacji v1 — propozycja

| Pole | Reguła |
|---|---|
| `service`, `env`, `version` | Stałe nazwy usług uzgodnione z inventory; env development/staging/production; wersja to działający SHA procesu. Sam rekord deployu nie wystarcza. |
| `deployment_id`, `configuration_revision` | Wspólne wydanie i osobne wersje web/worker; rewizja konfiguracji bez hashów sekretów. Digest pozostaje w prywatnym inventory. |
| `ksef.environment` | Test/demo/production niezależnie od env aplikacji; sprawdzane z konfiguracją i źródłem domenowym. |
| `operation_id`, parent/root | Serwerowy UUID intencji; unique `(type, tenant, source_type, source_id, source_generation)`; stabilny po retry/replay. Dziecko ma własny ID i deadline. |
| `attempt_id` | Nowy dla wykonania; istniejące claim/approval powiązane bez eksportu tokenu. Attempt joba i polling HTTP to osobne liczniki. |
| `event_id`, `causation_id`, `delivery_id`, `job_id` | Event stabilny po redelivery; causation wskazuje przyczynę; delivery nowe; techniczny job może się zmieniać przy retry. |
| `request_id` | Nowy lub zweryfikowany na wejściu; klientowy ID nie ustanawia tenant scope ani prawa odczytu. |
| W3C `traceparent`, `tracestate` | Walidowany, ograniczony envelope. Krótki handoff może kontynuować trace; długi retry/fan-out daje nowy trace z linkiem. Jedna operacja ma wiele trace. |
| `occurred_at`, `recorded_at`, duration | UTC ISO8601, osobno czas źródła i zapisu; duration monotoniczne. Dryf zegara podlega inventory. |

Envelope zawiera `schema_version`, korelację, source revision, `enqueue_at`,
`not_before` i bezpieczny trace context, osobno od payloadu biznesowego.
Retry zachowuje envelope, scope i event ID. Stare zdarzenia mają jawne `legacy`.
Mixed releases i odrzucenie nieobsługiwanego schematu należą do **TEST-01/TEST-02**
w [planie odbioru](acceptance-plan.md); oba testy pozostają **NOT RUN**.

Baggage domyślnie wyłączone. Treść faktury nie trafia do trace context. Domenowe
boundary guards ponownie sprawdzają tenant scope. Tenant/document/job/operation
UUID nie są wymiarami metryk. Dopuszczalne referencje w chronionym dzienniku
opisuje [polityka danych](data-policy.md).

Otwarte decyzje: klasy wyniku i deadline, limity import/eksport, wymagany audit
oraz journal, kwalifikacja tick. Przyjęcie kontraktu zapisuje właściciela, datę,
wersję i wyjątki według [ownership](ownership.md).

## Uzgodnienie z C-22 przed przyjęciem G04

Sekcja 8 [briefu centrum dowodzenia](../koordynacja/CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md)
także jest propozycją do zatwierdzenia. Nie potwierdza przyjęcia liczb z tego
dokumentu. W G04 potrzebny jest zapis zgodności definicji lub konkretnych zmian:

- F0 proponuje accepted ≤120 s dla przyjętej intencji; brief proponuje S4
  p95 ≤15 min od pierwszego kolejkowania, tylko przy dostępności KSeF, oraz
  S1 ≥99,5% accepted w 24 h w oknie przesuniętym o dobę.
- F0 proponuje wymagane pliki UPO ≤15 min od accepted; brief S5 proponuje
  p95 ≤2 h i 100% ≤24 h. Trzeba określić, co jest terminem operacji,
  celem statystycznym i progiem istniejącego strażnika.
- F0 kwalifikuje tenant-minuty i kompletność skanowania skrzynki; brief S10
  mierzy p95 od `DataPrzeslania` do zapisu otrzymanej faktury. To różne
  populacje; żadna nie dowodzi automatycznie kompletności drugiej.
- F0 nie wyłącza po przyjęciu intencji awarii dostawcy z populacji.
  Warunkowe S4 może istnieć jako osobny wskaźnik diagnostyczny, ale nie
  zastępuje wyniku całej przyjętej populacji.

Różne wskaźniki mogą współistnieć, jeśli ich zakres i cel są jawne. Do decyzji
pozostają powyższe definicje, limity plików i terminy Flo; nie wybrano jednej
wersji w imieniu właściciela. Kontrakt A5 wymaga osobnego uzgodnienia z torem
wysyłki. F0 nie zmienia runnera, strażnika, cronów ani monitora alarmów.
