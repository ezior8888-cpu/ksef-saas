# F0 — kontrakty wyników i korelacji

Stan: **przyjęta decyzja kontraktowa**, 07.10.2026, wersja **F0-contract-v1**.
Igor jest właścicielem monitoringu i decyzji F0. W wiadomości z 07.10 przekazał
Codexowi wybór pozostałych szczegółów: „Wybierz wszystko co uważasz za najlepsze”.
Na tej podstawie Codex wybiera poniższe wyniki, populacje, terminy i korelację.
F0-G04 jest **PASS w zakresie decyzji**; nie oznacza to implementacji, działającej
instrumentacji, wyniku testów ani odbioru całego F0. Wykonanie serwerowe, migracje,
wdrożenia i restore pozostają poza autoryzacją tego czatu; F1 nie rozpoczęto.
Role i granice delegacji opisuje [rejestr](ownership.md#decyzje-i-deklaracje-przekazane-07102026).

Pomiary i ich daty są w [inwentarzu](runtime-inventory.md), polityka eksportu w
[data-policy](data-policy.md), a scenariusze w [planie odbioru](acceptance-plan.md).
Odczyt z 04.10.2026, 11:03–11:22 UTC, był wyłącznie odczytem; web i worker były
healthy na `ae87bdde93a636fcb2c48aef737e57a80a3315a7` o 11:21 UTC, po wdrożeniu
z innej sesji. Nie jest to nowy pomiar ani dowód zgodności z wybraną decyzją.

## Podstawa decyzji 07.10.2026

Przegląd statyczny wykonano na `1712ff27006a8afb67f2e3d7bdc16a1c73582746`.
Poniższe odnośniki opisują kod tej wersji, nie aktualną konfigurację lub SHA
procesów na serwerach. Terminy są wybranymi granicami obserwacji wyniku, a nie
zmierzonymi czasami, istniejącymi hard timeoutami lub poleceniem zmiany kodu.

- [Registry i harmonogramy](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/queues.ts#L85-L128)
  określają due; [worker](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/worker.ts#L95-L118)
  może wyłączyć harmonogramy i rejestruje tylko obsługiwane kolejki. Sam wpis
  w kodzie nie dowodzi aktywnego crona.
- [Retry KSeF](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/retry-schedule.ts#L30-L74)
  dopuszcza pięć ponowień oraz Retry-After do godziny. Czterogodzinny
  [lease pg-boss](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/boss.ts#L69-L74)
  jest granicą techniczną, nie terminem obietnicy biznesowej.
- [Klasy plików i limity](#klasy-wejścia-i-populacje) oraz
  [Flo](#kwalifikacja-i-wyniki-flo) wynikają z istniejących granic wejścia i
  domeny. Wybranych terminów nie używa się do ponownego POST, resetu claim,
  przywrócenia zgody, refundu lub usunięcia danych.

## Historyczny punkt odniesienia kodu

Propozycja z 04.10 była przygotowana na snapshot
`dcf48bad4ca63802b57f7046d8932b369cd9cfc9`. To podstawa historyczna, nie
potwierdzona wersja produkcji lub stan każdego pliku na bazie publikacji
`1f95c97`. Jej terminy submit 120 s, UPO 15 min, import/eksport 10 min z klasą
odkładaną do staging oraz nierozstrzygnięte terminy Flo są **zastąpione** przez
F0-contract-v1. Oryginalna [propozycja w pakiecie z 04.10](https://github.com/ezior8888-cpu/ksef-saas/blob/6399ff9/docs/observability/contracts.md)
i historyczne indeksy dowodów pozostają odrębnymi zapisami.

- [run-job.ts](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/run-job.ts)
  rozliczał wykonanie techniczne i nie przenosił zwróconej wartości handlera do
  wspólnego wyniku domenowego. Zielony run-log nie dowodził biznesowego sukcesu.
- [enqueue.ts](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/enqueue.ts)
  miał `inTransaction`, wspólne połączenie pg-boss i `singletonKey`.
  [KSeF enqueue](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/invoices/ksef-submit-enqueue.ts)
  korzystał ze wspólnej transakcji. Dziennik i korelacja rozszerzają tę granicę
  jako docelowy kontrakt, bez osobnego mechanizmu kolejki i bez jego wdrożenia w F0.
- [Inbox](https://github.com/ezior8888-cpu/ksef-saas/blob/dcf48bad4ca63802b57f7046d8932b369cd9cfc9/lib/jobs/runners/inbox-polling.ts)
  emitował auto-categorize przed kartą/pushem i wykorzystywał singletonKey oraz
  inbox-backfill. To dowód kodu, nie kompletności skutków lub aktywnego crona.

## Wynik i źródło prawdy

`technical_outcome` opisuje próbę handlera. `business_outcome` opisuje wynik
obiecany użytkownikowi. `completed` w kolejce, HTTP 200, event Sentry lub wpis
audit nie wystarczają do uznania biznesowego sukcesu. Stan domeny ma
pierwszeństwo przed projekcją operacji; monitoring nie staje się silnikiem
faktur lub płatności.

Przyjęte klasy wyniku: `succeeded`, `partial`, `failed`, `unknown`,
`cancelled`, `rejected_input`, `held`. `waiting_retry`, `waiting_dependency`
i `waiting_human` opisują postęp. `reconciliation_required` oznacza potrzebę
uzgodnienia możliwego efektu. Wstrzymanie po przyjęciu nie zatrzymuje wieku
operacji; po jej terminie brak wyniku pozostaje widocznym naruszeniem.

| Rodzina / typy | Autorytatywny wynik i osobne kamienie milowe | Unknown / partial / brak postępu | Przyjęta populacja i termin operacji |
|---|---|---|---|
| Faktura i UPO: `invoice.submit`, `upo.archive`, `invoice.issue.full` | `invoices` accepted, numer KSeF i zgodne referencje `ksef_submissions`; osobno `upo_receipts` downloaded, zgodne XML/PDF i hash w storage. [Submit](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/runners/submit-invoice.ts), [UPO](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/runners/download-upo.ts#L104-L135). | Timeout po POST lub brak trwałej referencji: unknown/reconciliation bez drugiego POST. Accepted bez UPO to sukces submit i niekompletny pipeline. | Każda trwale przyjęta, zwalidowana intencja outgoing w danym KSeF env: submit ≤24 h od pierwszego przyjęcia/kolejkowania; UPO ≤24 h od rzeczywistego accepted, nie od utworzenia receipt; full ≤48 h od przyjęcia intencji. Retry nie przesuwa terminów. |
| Skrzynka: `inbox.scan`, `inbox.xml.archive`, `inbox.expense.create` | `ksef_inbox_cursor`, kompletność okna i zapisane tożsamości `invoices`; osobno archiwum XML i `expenses`. [Polling](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/runners/inbox-polling.ts). | HWM nie dowodzi fan-out. Ucięty scan, błąd query lub brak dzieci: partial/unknown. Kompletny scan bez nowych faktur jest zdrowym zerem. | Kwalifikujące tenant-minuty: pełny scan i HWM lag ≤30 min; pojedynczy oczekiwany scan ≤30 min od due. Wymagane XML i koszt ≤30 min od trwałego odkrycia faktury. Disabled/brak ważnych credentials przed oknem mają jawny powód; awaria po zakwalifikowaniu nie wyłącza firmy. |
| OCR/import: `ocr.extract`, `import.file`, `import.ksef.history` | `ocr_jobs.completed` z poprawnym `expense_id` i jawnym stanem review; księgowanie osobno. Import: `import_jobs`, faktyczne nagłówki/pozycje, liczby zapisanych i legalnie pominiętych elementów, XML osobno. [OCR](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/runners/process-ocr.ts), [import](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/import/import-engine.ts). | `success:false`, niezapisane pozycje lub `archived:false` nie stają się sukcesem przez completed handlera. Partial pokazuje brakujące elementy. | Przyjęte pliki według klas poniżej: OCR obraz ≤5 min, PDF ≤15 min; import ≤1 MiB:10 min, >1–10 MiB:60 min; historia KSeF ≤2 h na kierunek i zakres dat. Terminy od trwałego przyjęcia, obejmują kolejkę, provider i retry. |
| Billing: `billing.payment`, `billing.vat.handoff` → submit → UPO | Stripe state i domenowe receipts/attempts/payments; osobno entitlement, faktura VAT i potwierdzony handoff. [Webhook](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/app/api/stripe/webhook/route.ts), [VAT](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/runners/self-invoice-payment.ts). | Receipt processing/processed nie dowodzi wszystkich skutków. Możliwy efekt bez finalizacji: reconciliation bez reclaim/refund. Opłacone bez VAT/handoff: niekompletny pipeline. | Każda zweryfikowana, trwale przyjęta płatność wymagająca skutku domenowego: entitlement/VAT/potwierdzony enqueue ≤15 min. KSeF/UPO mają własne terminy. Replay tego samego provider event/payment nie powiększa populacji. |
| Flo: `flo.tick`, `flo.execute` | Tick: pokrycie kwalifikujących par firma/reguła i osobny wynik każdej. Execute: efekt domenowy, wersja proposal/approval, claim i końcowy stan. [Tick](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/flo/tick.ts#L147-L233), [execute](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/flo/execute.ts#L169-L307). | Zero kart może być sukcesem; błąd jednej firmy to partial. Waiting human nie jest awarią workera. Efekt wykonany bez done wymaga reconciliation bez ponownego zużycia approval. | Tick: oczekiwany due 07:30 Europe/Warsaw, komplet ≤30 min od due. Execute: ważna przyjęta zgoda na konkretną wersję, efekt i done ≤2 min od pierwszego trwałego przyjęcia tej zgody/claim. Szczegóły poniżej. |
| Eksporty, powiadomienia, backup, housekeeping | Eksport: `export_jobs`, `export_files`, dostępny obiekt i zgodny hash; pusty okres osobno. Notify: karta, przyjęcie przez dostawcę i doręczenie osobno. Snapshot: `backup_log.success`, obiekt/hash/liczniki. Verify: integrity, coverage i świeżość. Retencja: faktycznie usunięty obiekt i wiersz. | Provider accepted nie dowodzi doręczenia. Ograniczony JSON snapshot i verify nie dowodzą pełnej kopii ani restore. Audit przed DELETE nie dowodzi usunięcia; błędy count/list i pending pozostają widoczne. | Każdy przyjęty aktywny eksport ≤60 min; batch PDF ≤5 min po przyjęciu. Karta ≤5 min, provider acceptance ≤15 min od przyjęcia powiadomienia; dostępne potwierdzenie delivery ≤60 min, jego brak/nieobsługiwany kanał jawnie unknown. Crony według due i budżetów poniżej. |

Auth/MFA i wybór organizacji: odpowiedź dla kwalifikującego poprawnego żądania
≤10 s od wejścia na serwer, z auth/membership wymaganym przez daną granicę;
odmowy auth/invalid input liczone osobno,
bez oczekiwania na interakcję człowieka lub powrót z zewnętrznego OAuth.
Support: pierwszy fragment odpowiedzi ≤30 s, pełna odpowiedź ≤120 s,
zapis wiadomości i wymaganej eskalacji ≤180 s od trwałego przyjęcia.
HTTP 200 bez odpowiedzi/zapisu nie jest sukcesem tych kamieni milowych.
[Route support](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/app/api/support/chat/route.ts#L124-L197)
rozdziela stream i późniejszy zapis; powyższe budżety są decyzją, nie testem route.

## Klasy wejścia i populacje

- OCR: JPG/JPEG, PNG, WEBP, GIF i PDF rozpoznane z zawartości; 0 < rozmiar
  ≤10 MiB. [Upload](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/app/actions/expenses.ts#L123-L150)
  egzekwuje 10 × 1024 × 1024 bajtów i rozpoznany typ. PDF nie ma w tej granicy
  jawnego limitu stron; nie zakładamy jednej strony lub wdrożonego page cap.
  Jeśli istniejący walidator przyjmie nietypowy plik, pozostaje on w populacji
  i jego późniejszy błąd nie jest wstecznym odrzuceniem wejścia.
- Import pliku: niepusty CSV z Fakturowni, inFaktu, wFirmy lub iFirmy albo
  JPK_FA XML; 0 < rozmiar ≤10 MiB zgodnie z
  [akcją wejścia](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/app/onboarding/magic-import/actions.ts#L155-L230).
  Klasa mała ≤1 MiB i standardowa >1–10 MiB są wyborem terminów, nie nowym
  limitem przyjęcia. Nie wymyślamy limitu rekordów dla pliku, którego kod nie
  egzekwuje. Źródło, bajty i klasa ustalone przy przyjęciu nie zmieniają się po błędzie.
- Historia KSeF: jedna intencja określa tenant, kierunek issued/received,
  env i zakres dat. [Fetch](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/ksef/history-fetcher.ts#L77-L139)
  ma próg ochronny 5000; osiągnięcie go, również dokładnie 5000, oznacza
  `truncated`. [Runner](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/jobs/runners/magic-import-ksef.ts#L121-L143)
  odmawia kompletnego sukcesu dla uciętej lub niespójnej listy. Jest to failed
  albo partial względem obietnicy pełnego importu, nie legalny skip całej intencji.
- Eksport w tle: przyjęte JPK_FA, KPiR Excel i CSV uniwersalny, z utrwalonym
  tenant/env, okresem, kierunkiem i opcjami. Pozostałe formaty są obecnie
  [wstrzymane](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/exports/suspended-formats.ts#L19-L34).
  [Start](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/app/actions/exports.ts#L94-L150)
  nie ustanawia limitu dokumentów, bajtów ani długości okresu. Dlatego wybieramy
  wspólny termin 60 min dla całej przyjętej populacji, bez fikcyjnej klasy
  „do 1000 faktur”. Liczba oczekiwana i kompletność odczytu należą do wyniku;
  nieznany count jest unknown, a nie zdrowym zerem lub wyłączeniem z populacji.
  [Stronicowanie](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/accounting/read-complete-pages.ts#L18-L39)
  używa strony 500; nie jest to globalny limit 500 dokumentów.
- Batch PDF jest osobnym synchronicznym wejściem: ≤100 faktur, limit
  3 paczek/10 min na tenant i 2 równoczesne na proces,
  [kod](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/app/api/invoices/batch-pdf/route.ts#L24-L38).
  413/429 przed przyjęciem mają osobne liczniki; nie usuwają przyjętych żądań.

## Kwalifikacja i wyniki Flo

Tick obejmuje wszystkie aktywne, nieusunięte firmy z pełnego stronicowanego
odczytu oraz reguły due w danym przebiegu. [Strona 500](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/flo/tick.ts#L289-L313)
nie ogranicza liczby firm. Lista par i rewizja flag/rules muszą być związane
z due/source generation; nie wolno po błędzie skreślić firmy lub ustawić count 0.
Reguła nie-due, globalny hamulec, wyłączona funkcja, brak warunków domenowych,
dedup i dzienny limit kart są jawnymi powodami skipped/held. Błąd odczytu flag,
listy lub stanu domeny jest unknown/failed, nie legalnym skip.

Obecne reguły: ksef.audit (predykat pierwszego dnia roboczego z kodu),
payment.confirm, expense.missing, invoice.draft i onboarding.step. Brak kart
przy kompletnym odczycie i legalnych pominięciach nie jest brakiem postępu.
Daty predykatów reguł muszą być wykazane osobno: obecny kod wykorzystuje także
UTC; sam cron Europe/Warsaw nie dowodzi zmiany tej semantyki.

Execute obejmuje przyjęte, ważne, świeże zgody na konkretną wersję i scope
propozycji. Odmowa przed claim to rejected_input/held, powrót istniejącego done
to dedup tej samej intencji; czekanie na decyzję człowieka nie wchodzi do wieku
execute. Pierwszy accepted_at/claim pozostaje niezmienny po retry, zwolnieniu
claim lub zmianie approved_at. `expense.review`, `expense.rule` i
`payment.confirm` wymagają potwierdzonego zapisu odpowiednio expenses,
categorization_rules lub payments oraz done dla właściwej wersji.
`payment.chase` wymaga trwałego reminder/dispatch i potwierdzonego enqueue;
[handler](https://github.com/ezior8888-cpu/ksef-saas/blob/1712ff27006a8afb67f2e3d7bdc16a1c73582746/lib/flo/functions/payment-chase-handler.ts#L25-L52)
nie potwierdza doręczenia wiadomości. Dziecko notify ma własny termin.
Dodatkowe pytanie o regułę po expense.review jest osobnym wynikiem; jego błąd
nie cofa potwierdzonego wydatku, a brak tego dodatku nadal pozostaje widoczny.

Próg stuck 15 min w tick to istniejąca kwalifikacja do uzgodnienia, nie wybrany
termin execute i nie gwarancja wykrycia w 15 min: sprzątanie uruchamia się wraz
z kolejnym tick. Efekt domenowy bez done lub niepewny enqueue to unknown/
reconciliation, bez resetu zgody i bez automatycznego ponowienia wysyłki.

## Due i terminy cronów

Populacja to każda oczekiwana generacja due, wynikająca z zatwierdzonej
konfiguracji i registry, oraz wszystkie jej kwalifikujące elementy domenowe.
Kontrolowane wyłączenie wymaga rewizji i jawnego powodu; brak procesu,
niezarejestrowany oczekiwany handler lub zgubiony run nie wyłącza generacji.
Termin od due obejmuje opóźnienie startu, pracę i retry; grace zawiera się w
budżecie, nie dopisuje kolejnego okna po nim.

| Częstotliwość z registry | Termin kompletnego przebiegu od due |
|---|---|
| Co minutę: ksef-health-check, ops-heartbeat | 2 min |
| Co 5 min: critical-alerts-monitor, process-offline-queue | 10 min |
| Co 15 min: inbox-polling/backfill, jobs-watchdog, ksef-lifecycle-reconcile | 30 min |
| Godzinne: gdpr-process-deletions, reminder-scheduler, upo-retry-stale | 30 min |
| Dzienne: archive-old-invoices, cert-expiry-alert, cleanup-old-backups, co-pilot-monthly, daily-analytics-digest, daily-summary-email, ksef-lifecycle-report, nightly-validation-recheck, retention-delete, trial-countdown-emails | 60 min |
| Flo tick 07:30 Europe/Warsaw | 30 min |
| Ograniczony daily-db-snapshot 02:00 oraz verify-backup niedziela 03:00 | 120 min |
| Tygodniowe flo-shadow-settle i weekly-business-review; miesięczny cleanup-audit-logs | 120 min |

Większość wpisów registry ma Europe/Warsaw; gdpr-process-deletions nie ma jawnego
`tz`. Wybór kontraktowy to due i prezentacja w Europe/Warsaw, z konkretnym due
zapisanym jako UTC. Nie stwierdzamy, że wpis bez tz już realizuje tę decyzję.
Co-pilot uruchamia dispatcher codziennie o 08:00; oczekiwana paczka per tenant
zależy od jego skonfigurowanego dnia, enable, formatu i odbiorcy. Pełne kopie
z G09 są odrębnym kontraktem w [ownership](ownership.md) i [data-policy](data-policy.md):
powyższy JSON snapshot ani jego verify nie zastępują pg_dump, kopii MinIO lub restore.

## Zasady liczenia

- Jeden wynik dla jednej przyjętej intencji i `source_generation`; retry,
  redelivery i deployment nie powiększają mianownika.
- `accepted_at` to pierwsze trwałe przyjęcie intencji po walidacji. Deadline
  ustala się wtedy; odmowy/hold wcześniej mają osobny licznik. Awarii po przyjęciu
  nie wyłącza się wstecznie z populacji, także przy awarii dostawcy.
- Przekroczenie deadline tworzy trwały fakt `deadline_missed`; nie anuluje
  operacji ani nie zastępuje jej końcowego wyniku. Późny sukces nie naprawia
  wyniku „w terminie”, ale rozstrzyga osobno kompletność końcową.
- Do czasowego SLI wchodzą dojrzałe deadline, również utknięte operacje.
  Unknown po deadline jest złym wynikiem SLI i nadal wymaga uzgodnienia.
- `expected = succeeded + failed + skipped + pending`; klasy terminalne
  mapuje się rozłącznie: partial/unknown/cancelled po przyjęciu do failed,
  rejected_input przed przyjęciem poza tą populacją, held po przyjęciu do pending
  aż do rozstrzygnięcia. Terminalna kompletność wymaga `pending = 0`;
  skipped wymaga legalnego powodu, np. dedup. Nieznane expected lub niepełny
  scan daje unknown/partial. Ograniczenie metryki nie usuwa osobnego wyniku domenowego.
- Agregat niesie `query_success`, `scan_complete`, `source_freshness` i okno.
  Błąd query/timeout nie staje się zerem. Bez kwalifikujących operacji jest
  brak próby; przy nieświeżych danych wynik jest unknown.
- SLI rozstrzyga domena/ledger; eksport at-least-once wymaga deduplikacji
  i okresowego uzgodnienia. Sampling trace nie usuwa outcome.

## Kontrakt korelacji v1

| Pole | Reguła |
|---|---|
| `service`, `env`, `version` | Stałe nazwy usług według inventory; env development/staging/production; wersja to działający SHA procesu. Sam rekord deployu nie wystarcza. |
| `deployment_id`, `configuration_revision` | Wspólne wydanie i osobne wersje web/worker; rewizja konfiguracji bez hashów sekretów. Digest pozostaje w prywatnym inventory. |
| `ksef.environment` | Test/demo/production niezależnie od env aplikacji; sprawdzane z konfiguracją i źródłem domenowym. |
| `operation_id`, parent/root | Serwerowy UUID intencji; unique `(type, tenant, source_type, source_id, source_generation)`; stabilny po retry/replay. Dziecko ma własny ID i deadline. |
| `accepted_at`, `deadline_at`, `contract_version`, `input_class` | Niezmienne granice i wersja F0-contract-v1 wybrane przy przyjęciu; zmiana wymaga nowej jawnej generacji, nigdy naprawienia historycznej statystyki. |
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

Przyjęty minimalny dziennik operacji to chroniona projekcja intencji, prób,
niezmiennego deadline, wyniku, liczników expected i referencji do dowodu domenowego.
Audit istniejącej czynności i journal wyniku nie są zamiennikami: wpis audit
nie dowodzi efektu. Nie dublujemy domenowego silnika stanów ani kolejki.
Szczegóły realizacji storage/migracji dziennika należą do późniejszej implementacji,
a jego retencja i eksport do [polityki danych](data-policy.md); G04 nie wymaga
utworzenia nowej tabeli lub instrumentacji w tym czacie.

Baggage domyślnie wyłączone. Treść faktury nie trafia do trace context. Domenowe
boundary guards ponownie sprawdzają tenant scope. Tenant/document/job/operation
UUID nie są wymiarami metryk. Referencje pozostają w chronionym dzienniku;
tokeny approval, dane klientów i payloady nie trafiają do publicznych dowodów.

## Uzgodnienie z C-22 przed przyjęciem G04

Historyczna sekcja 8 [briefu centrum dowodzenia](../koordynacja/CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md)
była propozycją. Poniższy wybór rozwiązuje jej konflikt z propozycją F0 z 04.10
w zakresie kontraktu, bez zmiany briefu, runnera, strażnika, cronów lub monitora.

- **S1 przyjęty:** ≥99,5% intencji outgoing accepted ≤24 h od pierwszego
  trwałego przyjęcia/kolejkowania. Dojrzała kohorta `[T−48 h, T−24 h)`, dedup
  jednej intencji/source generation, bez wyłączania awarii po przyjęciu.
  Deadline pojedynczej operacji to 24 h; cel 99,5% określa udział dobrych
  wyników w populacji, nie gwarancję każdej operacji.
- **S4 przyjęty jako oddzielna diagnostyka:** p50/p95 czasu pierwsze przyjęcie →
  rzeczywiste accepted, cel p95 ≤15 min przy potwierdzonej dostępności KSeF.
  Nieznana dostępność jest jawna, bez przyjmowania filtra „KSeF działał”.
  Percentyl ukończonych operacji nie ukrywa stuck/failed, które nadal obciążają
  S1 i deadline całej populacji. Stare 120 s nie jest już terminem submit.
- **S5 przyjęty:** p95 accepted → zgodny downloaded XML/PDF ≤2 h,
  cel 100% kwalifikujących accepted z kompletem ≤24 h. 24 h jest terminem
  każdego UPO; 2 h jest celem rozkładu czasów, nie terminem każdego dziecka.
  Brak UPO po dojrzałym terminie obciąża populację. Nieukończone operacje
  mają co najmniej dotychczasowy wiek; jeśli uniemożliwiają rozstrzygnięcie
  p95 pełnej kohorty, wynik percentyla jest unknown, nie PASS z samych udanych
  próbek. Naruszenie 24 h jest jawnie złe niezależnie od p95. Stare UPO 15 min
  jest zastąpione.
- **S10 przyjęty jako osobny wskaźnik:** p95 `DataPrzeslania` → trwały received
  ≤30 min. Tylko zwalidowane timestampy i zgodna tożsamość/env; brak źródłowej
  daty oznacza unknown. To inna populacja niż tenant-minuty/HWM i pełny scan;
  żaden z tych wskaźników sam nie potwierdza kompletności pozostałych.
- Kohorty operacji mają jednoznaczne timestampy UTC; dni i raporty prezentujemy
  w Europe/Warsaw. Każdy wskaźnik pokazuje licznik, mianownik, okno, świeżość
  oraz braki. Brak próby nie daje PASS, a mała próba ogranicza interpretację.
  Kalibracja po późniejszym baseline nie zmienia historycznych deadline.
- A5 zachowuje znaczenie próby wysyłki: `send_attempt_id` i powiązanie z
  właścicielem invoice/audit; do jego implementacji źródłem pozostają domena
  i dostępne audit + invoices, z jawnym zakresem brakującej korelacji.
  Wybór definicji nie wdraża A5 ani nie uruchamia żadnego etapu planu.

## Odbiór decyzji G04

Zapis zawiera datę, delegującego właściciela Igora, wykonawcę wyboru Codex,
wersję F0-contract-v1, źródłowy commit kodu, wszystkie sześć rodzin, granice
HTTP/support, wyniki i źródła prawdy, kwalifikację, klasy wejścia, due/deadline,
zasady liczenia, minimalny journal, korelację v1 oraz rozstrzygnięcie C-22.
Nie pozostaje otwarta decyzja G04 o terminach Flo, plikach lub znaczeniu SLI.
To materiał pozwalający oznaczyć **G04 PASS (decyzja)** w rejestrze bramek.
Realizacja kontraktów i **TEST-01–TEST-06** pozostają nieodebrane; F0 wymaga
oddzielnego odbioru Igora wszystkich bramek. Nie dokładamy automatycznie
14-dniowego baseline lub wykonania tych testów do warunków zamknięcia F0.
