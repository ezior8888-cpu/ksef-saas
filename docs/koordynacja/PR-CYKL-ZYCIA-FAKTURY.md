# PR „cykl życia faktury” — rozpisanie

Realizuje `docs/architecture/cykl-zycia-faktury-ksef.md`. Zamyka ustalenia K3, W1, W2, W3, W16, S1, S22 z `docs/automation/13_REWIZJA_2026-10-03.md`. Nie dotyka K1 (faktura za abonament), K2 (skrzynka) ani K4 (druga korekta) — to osobne PR.

Zasada tej rundy: **stos czterech małych PR zamiast jednego dużego**, każdy z testem czerwonym na `main` przed naprawą, każdy osobno wdrażalny. Kolejność scalania i wdrażania jest częścią projektu, bo stary kod webu pisze `queued` z sesji klienta, a wyzwalacze trzeba zacieśnić dopiero po jego wymianie.

## Stan realizacji (03.10.2026)

| Część | PR | Stan |
|---|---|---|
| PR 1 — baza (00131: katalog kodów, RPC przejść, strażnik) | #202 | scalony, 00131 wgrana na db-1 03.10 |
| PR 2 — worker (klasyfikacja, kody, zamykanie historii, oczekiwanie) | #204 | scalony, wdrożony |
| PR 3a — kolejkowanie w jednej transakcji (W16/W2) | #205 | scalony |
| PR 3b — „Wyślij ponownie” / „Wróć do szkicu” (K3) | #206 → #207 | #206 trafił do gałęzi 3a, #207 przenosi do `main` |
| PR 3c — panel operatora `/admin/ksef` | #208 | otwarty (stos na #207) |
| PR 4 — strażnik: 00132, cron ponowień, alarm `queued`, martwe kolejki | — | do zrobienia |
| D5 — klucz XML per próba | — | osobny PR, do zrobienia |

Numery migracji: rejestr w `CLAUDE-DO-CODEXA.md` podaje „następny wolny 00129”, ale `00129_xml_document_invoice_identity.sql` istnieje już na gałęzi `codex/security-xml-evidence-integrity` (commit 0701675). `00130_roz_amount_due.sql` leży na gałęzi `claude/roz-warunki` (commit 7494b19). Plan używa **00131** (PR 1, przed wdrożeniem) i **00132** (PR 4, PO wdrożeniu); rejestr zaktualizowany w PR 1 (następny wolny 00133).

---

## PR 1 — baza: RPC przejść i katalog kodów (migracja 00131, PRZED wdrożeniem)

Addytywna: nowe funkcje, bez zmian w istniejących wyzwalaczach. Stary kod działa z nią bez zmian.

### Zawartość 00131_ksef_send_lifecycle.sql

| Obiekt | Sygnatura | Reguły |
|---|---|---|
| funkcja pomocnicza | `public.ksef_has_contact_evidence(p_invoice_id uuid, p_tenant_id uuid) RETURNS boolean` | `ksef_number IS NOT NULL` OR EXISTS `ksef_submissions` ze statusem `sent`/`accepted`/`duplicate`; `STABLE`, `SET search_path = ''`, EXECUTE dla `service_role` i `authenticated` (UI pokazuje przyciski) |
| RPC | `public.enqueue_ksef_send(p_invoice_id, p_tenant_id, p_attempt_id text) RETURNS public.invoices` | `UPDATE … SET ksef_status='queued', ksef_send_owner=NULL, last_error*=NULL WHERE id AND tenant_id AND direction='outgoing' AND ksef_status='draft' RETURNING *`; 0 wierszy = wyjątek `P0002` z komunikatem „Faktura nie jest szkicem”. Tylko `service_role`. Wołana **wewnątrz transakcji pg-boss** (sekcja PR 3) |
| RPC | `public.release_ksef_enqueue(p_invoice_id, p_tenant_id, p_reason text) RETURNS boolean` | `queued → draft` tylko gdy `NOT ksef_has_contact_evidence(...)`; czyści `ksef_send_owner`, `submitted_to_ksef_at`; wpis `audit_logs` (`invoice.enqueue_released`, metadata: reason). Tylko `service_role` |
| RPC | `public.requeue_ksef_send(p_invoice_id, p_tenant_id, p_attempt_id text, p_actor_user_id uuid, p_reconcile_only boolean DEFAULT false) RETURNS public.invoices` | dozwolone z `failed` (każdy kod poza TERMINAL) oraz z `rejected` tylko gdy `p_reconcile_only`; blokada doradcza `pg_advisory_xact_lock(hashtext(p_invoice_id::text))`; ustawia `queued`, `ksef_send_owner=NULL`, `submission_attempts+1`; `audit_logs` (`invoice.send_requeued`, metadata: previous_code, actor, reconcile_only). Tylko `service_role` |
| RPC | `public.reset_ksef_send(p_invoice_id, p_tenant_id, p_actor_user_id uuid) RETURNS public.invoices` | dozwolone z `failed`/`rejected` tylko gdy `NOT ksef_has_contact_evidence(...)` i `last_error_code` nie jest RECONCILE; przed wyczyszczeniem zapisuje poprzednie wartości (`submitted_to_ksef_at`, `last_*`, `submission_attempts`, `xml_storage_path`, `xml_generated_at`) do `audit_logs` (`invoice.send_reset`); potem `ksef_status='draft'` i NULL w tych polach; usuwa wiersze `ksef_submissions` ze statusem `rejected` dla faktury? **nie** — zostają jako historia. Tylko `service_role` |
| tabela | `public.ksef_error_codes (code text PRIMARY KEY, class text CHECK (class IN ('terminal','transient','hold','reconcile','setup')), auto_requeue boolean, client_message text)` | seed z katalogu (sekcja 6 dokumentu); `GRANT SELECT TO authenticated, service_role`; `last_error_code` **bez** FK (stare wiersze mają dowolne teksty; strażnik I4 je wyłapie) |
| widok | `public.ksef_lifecycle_violations` (`security_invoker = true`, SELECT tylko `service_role`) | wiersze: `invoice_id, tenant_id, invariant text, detail jsonb`; I1 wymaga odczytu `pgboss.job` — funkcja `SECURITY DEFINER` z `SET search_path = ''` jak `ops.*` z 00100 (ta sama pułapka w CI: schemat `pgboss` musi istnieć przed migracją, `scripts/ci/rls-local.sh` już to robi) |

Wszystkie funkcje: `LANGUAGE plpgsql`, `SET search_path = ''`, `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role` (poza `ksef_has_contact_evidence`). Wzorzec: `claim_ksef_send` z 00124 i `review_ksef_expense` z 00127.

### Testy PR 1 (na bazie, `tests/rls-uprawnienia.test.ts` albo nowy `tests/rls-cykl-faktury.test.ts` w tym samym configu)

1. `enqueue_ksef_send`: z `draft` → `queued`; drugi raz → wyjątek; z `failed` → wyjątek; klient (`authenticated`) nie wywoła (42501).
2. `release_ksef_enqueue`: `queued` bez dowodu → `draft` + wpis audytu; z wierszem `ksef_submissions.sent` → `false`, stan bez zmian.
3. `requeue_ksef_send`: `failed KSEF_UNAVAILABLE` → `queued`, `submission_attempts` +1, owner NULL; `failed XSD_INVALID` → wyjątek; `rejected` bez `p_reconcile_only` → wyjątek.
4. `reset_ksef_send`: `failed INFRA` bez dowodu → `draft`, pola wyczyszczone, audyt ma stare wartości; `failed` z `ksef_submissions.sent` → wyjątek; `rejected` z wpisem `rejected` → `draft` (wpis zostaje).
5. `ksef_has_contact_evidence`: cztery przypadki (numer KSeF, `sent`, `duplicate`, tylko `rejected`).
6. Widok naruszeń: faktura `queued` bez joba w `pgboss.job` pojawia się jako I1; `accepted` bez `upo_receipts` jako I3.

Dodatkowo **testy charakteryzujące dzisiejsze wyzwalacze** (zielone na main, pilnują, że PR 1 niczego nie zmienia): klient nie ustawi `sending`; klient nie usunie `queued`; worker (service_role) może przejść `sending → failed`.

---

## PR 2 — worker: klasyfikacja błędów, kody, zamykanie historii

Bez migracji. Wdrażany **po 00131** (RPC istnieją), **przed PR 3**.

| Zmiana | Plik | Co dokładnie |
|---|---|---|
| katalog kodów w kodzie | nowy `lib/ksef/send-error-codes.ts` | enum kodów + klasa + `fromError(error): { code, class }`; jedno miejsce mapowania; eksport `isAutoRequeueable(code)` |
| W1 | `lib/jobs/runners/submit-invoice.ts:714-725` (`load-credentials-meta`) | `NonRetriableError` tylko dla: brak blobu, nieznany `type`, NIP ≠ zweryfikowany; błąd PostgREST/sieci → zwykły `Error` (ponowienie), brak klucza po rotacji → `RetryAfterError` z kodem `CREDENTIALS_UNAVAILABLE` + `Sentry.captureMessage` poziomu `error` |
| S1 | `submit-invoice.ts:977-997` | w gałęziach `KsefInvoiceRejectedError` (nie-duplikat) i 440 nie-własne: `markKsefSubmission({status: 'rejected' / 'duplicate', errorCode})` dla otwartego wpisu, zanim poleci `NonRetriableError` |
| S1 okno 48 h | `lib/ksef/submission-log.ts:78-98` | `findOpenKsefSubmission` zwraca też `attempted_at`; w `reconcile-previous-submission` wpis starszy niż 48 h, na który KSeF odpowiada „nieznana sesja/faktura” (kod do ustalenia na KSeF TEST), zamykany jako `duplicate` z `error_code = 'STALE'`, a wysyłka idzie dalej |
| kody przy porażce | `submit-invoice.ts:195-217` (`markFailureUnlessAccepted`) i cała gałąź `onSubmitInvoiceExhausted` | `last_error_code` zawsze z katalogu (dziś zerowany); `ksef_send_owner = NULL` przy `failed`/`rejected`; klasyfikacja `isBusinessRejection` zastąpiona `fromError(error).class === 'terminal'` |
| W3 | `onSubmitInvoiceExhausted` gałęzie `handled:false` | zamiast `return` bez zmian: `failed` z kodem `INVALID_EVENT` / `ENV_MISMATCH` / `INVOICE_DIRECTION` (ten ostatni bez zmiany statusu, bo wiersz jest przychodzący) + `Sentry.captureMessage` (nie `captureException`, bo `ignoreErrors` filtruje `NonRetriableError`) |
| S22 | `lib/jobs/retry.ts:54-59` albo `submit-invoice.ts` | `RetryAfterError` z przyczyn „KSeF nadal przetwarza” i „inna próba trzyma wysyłkę” nie zużywa `maxRetries` (osobny licznik w payloadzie albo `startAfter` bez `attempt+1`); po wyczerpaniu zwykłych ponowień kod `KSEF_UNAVAILABLE`, nie `rejected` |
| komunikat | `lib/ksef/submission-holds.ts:27-28` | `KSEF_PAUSED_MESSAGE`: „Faktura wyjdzie automatycznie po przywróceniu wysyłki.” |
| komentarze | `lib/jobs/retry.ts:11-12`, `lib/jobs/worker.ts:9` | usunąć „retryLimit: 0” |

### Testy PR 2 (Vitest, prawdziwy runner, mock DB/KSeF jak w `ksef-submission-brakes.test.ts`)

1. Reprodukcje z rewizji (były czerwone, mają zzielenieć): `getTenantKsefCredentials` rzuca `TypeError: fetch failed` → po wyczerpaniu `failed` z kodem `INFRA`, nie `rejected`; odrzucenie 450 → wpis `ksef_submissions` zamknięty jako `rejected`.
2. Tabela klasyfikacji: dla każdego kodu z katalogu jeden przypadek wejściowy (XSD, 400, 440 własne, 440 obce, 401, 408, 429, 5xx, `ECONNRESET`, brak certyfikatu, brak klucza, hamulec) → oczekiwany stan + kod + `ksef_send_owner IS NULL`.
3. `onExhausted` z `environment` ≠ skonfigurowane → `failed ENV_MISMATCH`, `captureMessage` wywołane.
4. Pięć kolejnych „inna próba trzyma wysyłkę” nie kończy się `failed`.

---

## PR 3 — web: kolejkowanie transakcyjne, akcje klienta, panel operatora

Bez migracji. Wdrażany **po PR 2**. Po nim żadna ścieżka webu nie pisze `ksef_status` z sesji klienta.

| Zmiana | Plik | Co dokładnie |
|---|---|---|
| W16, W2 | `lib/invoices/ksef-submit-enqueue.ts:250-281` | zamiast `sendJobEvent` + `update({queued})`: jedna transakcja na połączeniu pg-boss. Sprawdzone w pg-boss 12.27.0: `boss.getDb()` zwraca instancję `Db` z metodą `withTransaction(fn)` (`node_modules/pg-boss/dist/db.js:189`, `fn` dostaje `{ executeSql }` na jednym kliencie `pg`), `send()` przyjmuje `db` (`types.d.ts:44,300`) i `singletonKey` (`types.d.ts:286`). Typ `IDatabase` nie deklaruje `withTransaction`, więc potrzebny wąski typ pomocniczy (`db as IDatabase & { withTransaction<T>(fn: (tx: IDatabase) => Promise<T>): Promise<T> }`) z testem jednostkowym pilnującym, że metoda istnieje. Kroki: (1) `SELECT public.enqueue_ksef_send($1,$2,$3)` przez `tx.executeSql` (rola z `DATABASE_URL` musi mieć EXECUTE — nadać w 00131), (2) `boss.send(name, data, { db: tx, singletonKey: invoiceId })`. Błąd w (2) wycofuje (1). Jeśli transakcja na połączeniu pg-boss okaże się niemożliwa (rola `DATABASE_URL` bez EXECUTE na funkcji), wariant B: RPC adminem, potem `boss.send`, a przy błędzie `release_ksef_enqueue` w `finally` + strażnik I1 jako siatka |
| W2 | `components/invoices/draft-actions.ts:100-135` | usunąć własne `update({queued})` i cofnięcie; podwójne kliknięcie łapie `enqueue_ksef_send` (warunek `draft`) i `singletonKey` |
| hamulce | `ksef-submit-enqueue.ts:111-130` | bez zmian logicznych; `KSEF_PAUSED` jako odmowa przed kolejką zostaje (szkic nie dostaje statusu `failed`) |
| K3 | `components/invoices/actions-detail.ts:115-145` (`resendInvoiceAction`) | prawdziwa implementacja: `requireOrgRole(['owner','admin'])` (D4), odczyt `last_error_code` → jeśli klasa dopuszcza: ta sama transakcja co enqueue, ale z `requeue_ksef_send`; dla RECONCILE komunikat „zgłoszono operatorowi” + `Sentry.captureMessage` |
| nowa akcja | `components/invoices/actions-detail.ts` | `resetInvoiceToDraftAction`: `requireOrgRole(['owner','admin'])`, `reset_ksef_send` adminem, `revalidatePath` |
| UI stanu | `components/invoices/status-badge.tsx`, `invoice-detail-view.tsx`, `invoice-actions.tsx` | etykieta + podetykieta z `ksef_error_codes.client_message`; przyciski wg tabeli w sekcji 7 dokumentu; dla `failed TRANSIENT` czas następnej próby z `pgboss.job.start_after` nie jest dostępny klientowi — pokazać „ponowimy automatycznie” |
| D5 | `lib/storage/r2.ts` + `lib/ksef/submit-invoice-full.ts` | klucz XML `invoices/<tenant>/<invoiceId>/<sendAttemptId>.xml`; `xml_storage_path` wskazuje konkretny plik; czytelnicy (`actions-detail.ts` „Pobierz XML”, PDF KOD I, portal) czytają `xml_storage_path` z wiersza, więc bez zmian |
| panel operatora | nowy `app/admin/ksef/page.tsx` + `actions.ts` | tabela z widoku `ksef_lifecycle_violations`, lista `failed` per kod, historia `ksef_submissions` faktury, przyciski „Wyślij ponownie”, „Tylko uzgodnij”, „Wróć do szkicu” (te same RPC z `p_actor_user_id`); dostęp jak reszta `/admin` (`ADMIN_EMAILS`) |
| wyzwalacze — jeszcze nie | — | PR 3 działa z 00119/00122 w obecnej postaci: klient nie dotyka już `queued`, więc wyjątek w wyzwalaczach jest martwy, ale nie szkodzi |

### Testy PR 3

1. Na bazie: `sendDraftInvoiceAction` z mockiem `boss.send` rzucającym → faktura zostaje `draft` (dziś: `queued` na zawsze — reprodukcja W2 na prawdziwych wyzwalaczach, czerwona na main).
2. Na bazie: podwójne wywołanie akcji → jedno zlecenie (drugie dostaje „już wysyłana”).
3. Vitest: `resendInvoiceAction` dla każdej klasy kodu (dozwolone / odmowa / reconcile).
4. Vitest: `resetInvoiceToDraftAction` odmawia przy dowodzie kontaktu.
5. RTL: przyciski widoczne wg tabeli stanów; `member` nie widzi „Wyślij ponownie”.

---

## PR 4 — strażnik cyklu życia (migracja 00132, PO wdrożeniu PR 3)

### 00132_ksef_lifecycle_guard_tighten.sql (PO wdrożeniu)

- `guard_invoice_pending_content` (00119) i `guard_invoice_delivery_history` (00122): `CREATE OR REPLACE` z trzema zmianami: (1) usunięty wyjątek „klient zmienia `draft → queued`” — klient nie zmienia `ksef_status` nigdy; (2) „historyczny” = `ksef_has_contact_evidence()` OR `ksef_number`/`ksef_accepted_at`/`xml_storage_path` niepuste — `last_attempt_at`, `submission_attempts`, `last_error*` przestają zamrażać treść (są diagnostyką); (3) DELETE dla klienta wyłącznie `draft` bez dowodu kontaktu (bez zmian). Wyzwalacz dla `service_role` nadal przepuszcza wszystko — ochroną są RPC.
- Nagłówek migracji: „PO wdrożeniu PR 3; DROP/CREATE wyzwalaczy bez zmian danych”.

### Cron `cron.ksef-lifecycle-reconcile` (co 15 min) — `lib/jobs/runners/ksef-lifecycle-reconcile.ts`, rejestracja w `package-a.ts`, wpis w `CRON_JOBS` (liczba cronów w logu workera rośnie z 24 na 25 — zaktualizować AGENTS.md)

| Inwariant | Zapytanie | Akcja |
|---|---|---|
| I1 | widok naruszeń, `queued` > 15 min bez joba | `release_ksef_enqueue` gdy brak dowodu; inaczej `failed ENQUEUE_LOST`; licznik do raportu |
| I5 | `ksef_submissions.sent` > 48 h | `requeue_ksef_send(reconcile_only)` |
| I6 | `failed` z `auto_requeue` i `updated_at` < 60 min, wiek < 24 h | `requeue_ksef_send` (nowy `sendAttemptId`); po 24 h → `TRANSIENT_EXHAUSTED` + alarm |
| I7 | `failed KSEF_PAUSED` gdy `killAllKsefSubmissions = false`; `KOR_HOLD` gdy `isCorrectionHeldForEnv` = false | `requeue_ksef_send` |
| I4, I9 | kody spoza katalogu; `rejected`/`failed` z numerem KSeF | tylko alarm |
| raport | o 07:30 PL: liczba per stan, naruszenia, akcje z doby | `sendSlackAlert({channel:'daily'})` → Telegram (kanał z #120) |

`critical-alerts-monitor.ts`: dodać `checkStaleKsefQueuedInvoices` (bliźniak `checkStaleKsefSendingInvoices`, próg 15 min) — W3.

### Testy PR 4

1. Na bazie: po 00132 klient nie zmieni `draft → queued` (dziś może); klient edytuje `failed INFRA` po resecie (dziś nie może); klient nadal nie usunie wiersza z wpisem `sent`.
2. Vitest runnera: scenariusze I1, I5, I6, I7 z mockiem bazy; `TRANSIENT_EXHAUSTED` po 24 h; raport dzienny zawiera liczby.
3. `tests/unit/jobs-registry.test.ts`: komplet 25 cronów.

---

## Kolejność wdrożenia

```
1. PR 1 → scalenie → 00131 na db-1 (przed) → weryfikacja: \df public.*ksef_send*, PostgREST widzi ksef_error_codes
2. PR 2 → scalenie → wdrożenie workera (id=2), potem aplikacji (id=1) — jak zawsze
3. PR 3 → scalenie → wdrożenie aplikacji (id=1), potem workera (id=2) — ten PR zmienia głównie web; worker dla spójności
4. test dymny na KSeF TEST: wystaw FA → accepted → UPO; wystaw FA przy KSEF_PAUSED=true → failed KSEF_PAUSED → zdjęcie flagi → cron → accepted; wymuś 5xx (mock w TEST) → failed KSEF_UNAVAILABLE → requeue → accepted; szkic bez certyfikatu → zostaje draft
5. PR 4 → scalenie → wdrożenie workera i aplikacji → 00132 na db-1 (PO) → test dymny ponownie
6. siedem dni raportu dziennego bez naruszeń = gotowe
```

Wycofanie: 00131 jest addytywna (funkcje można zostawić); PR 2/3 cofa się zwykłym wdrożeniem poprzedniego SHA; 00132 ma parę odwrotną (przywrócenie funkcji z 00119/00122 — dołączyć jako `00132_rollback.sql.txt` w katalogu migracji, nieuruchamiany automatycznie).

## Dokumenty do aktualizacji w tych PR

- `docs/runbooks/hamulce-ksef.md:48-62` — po hamulcu faktury wracają same (I7); operator nic nie klika.
- nowy `docs/runbooks/faktura-do-uzgodnienia.md` — co robić z kodami RECONCILE (`/admin/ksef`, „Tylko uzgodnij”, kiedy SQL jako `postgres`).
- `docs/architecture/ksef-flow.md` — link do maszyny stanów; sekcja „Retry schedule” o auto-ponowieniach z crona.
- `docs/koordynacja/CLAUDE-DO-CODEXA.md` — rejestr: 00131, 00132; kolizja 00129 z Codexem.
- `AGENTS.md` — liczba cronów „25/25”.

## Definicja ukończenia

- Wszystkie testy z sekcji PR 1–4 zielone w CI (w tym job RLS na lokalnym Supabase).
- Reprodukcje z rewizji (W1, W2, S1, W3) zielone na nowym kodzie.
- Test dymny na KSeF TEST z kroku 4 przeszedł dwa razy (przed i po 00132).
- `grep -rn "ksef_status: 'queued'" app components lib` zwraca zero trafień poza RPC.
- Raport dzienny strażnika przychodzi na Telegram i przez 7 dni nie zgłasza naruszeń.
- Rewizja wąska: jeden rewident czyta tylko diff PR 1–4 względem tego dokumentu (nie kolejny pełny audyt).

## Co świadomie zostaje poza tym stosem

- K1 (self-invoice), K2 (skrzynka), K4 (druga KOR) — osobne PR, niezależne.
- Offline24 na PROD, kody QR KOD II — decyzja prawna.
- Zmiana zestawu statusów w CHECK (np. nowy `needs_reconciliation`) — celowo nie: `failed` + kod niesie tę informację bez ruszania 30 konsumentów `ksef_status`.
- Edycja treści w `failed` bez resetu — nie; wyjście to zawsze `draft`.
