# A3 — Dokumenty, dowody, ślady audytowe i testy

| | |
|---|---|
| Autor | agent DOWODY (subagent audytu 13) |
| Data | 10.10.2026 (zadanie); odczyty GitHub API i przebieg Vitest wykonane 11.10.2026 ok. 14:55–15:10 UTC |
| Wersja kodu | `origin/main` @ `3e5e00d` (scalenie PR #245, 08.10.2026); gałąź robocza bez zmian kodu poza `docs/audyt/` |
| Zakres | pkt 5.G zadania: polityki, rejestry, procedury praw osób, incydentów i retencji, przeglądy dostępów, ślady audytowe, raporty i certyfikaty, ADR, wcześniejsze audyty i plany; CI i zarządzanie zmianami; testy prywatności (istniejące, wynik uruchomienia, brakujące); ocena potrzeby DPIA, LIA, TIA |
| Źródła danych | repo (kod, migracje, testy, `docs/**`, `.github/**`); historia git (lokalny klon jest płytki, więc pełną historię commitów `main` odczytano z osobnego klonu bez plików w scratchpadzie); GitHub REST API, tylko GET (reguły gałęzi `main`, check runs, recenzje PR, liczba przebiegów workflow); lokalny przebieg Vitest; niescalony PR #225 (`origin/codex/f0-runtime-inventory` @ `686a465`) jako dowód pośredni |
| Ograniczenia | brak dostępu do produkcji (baza, logi, cron, kopie), paneli i umów dostawców; przepisy RODO i kryteria AICPA według wiedzy modelu — niezweryfikowane online 2026-10-10 (egress zablokowany, WebSearch odrzucony przez właściciela); nie uruchamiano e2e ani testów RLS na bazie |
| Recenzja | R4 (osobny agent); autor nie zatwierdza własnego etapu |

## 0. Konwencje

- Stany: **potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy**.
- Klasy: **P** obowiązek prawny, **O** interpretacja organu (EROD, UODO),
  **S** kryterium SOC 2, **I** praktyka inżynierska.
- „Projekt kontroli” = istnieje dokument, kod albo konfiguracja.
  „Działanie w czasie” = istnieje datowany zapis wykonania (log, protokół,
  wynik testu, przebieg CI). Sam dokument procedury nie dowodzi jej
  wykonania.
- „Nie znaleziono w repo” nie znaczy „nie istnieje”: rejestr, umowa albo
  zapis może istnieć poza repozytorium.
- Odwołania prawne bez odczytu źródła w tej sesji mają dopisek
  „niezweryfikowane online 2026-10-10 (egress zablokowany) — treść wg wiedzy
  modelu”.

## 1. Inwentarz dokumentów i dowodów

(uzupełniane)

## 2. Ślady audytowe

### 2.1. Mechanizm

| Element | Stan | Dowód |
|---|---|---|
| Tabela `audit_logs` | potwierdzone (projekt) | `supabase/migrations/00001_initial_schema.sql:162-176`; kolumny `metadata`, `user_agent` dodane w `00008_audit_logs_refinements.sql:8-9` |
| Zapis tylko przez serwer | potwierdzone (projekt) | `authenticated` ma tylko `SELECT` (`00008_audit_logs_refinements.sql:40-41`, `00027_lockdown_audit_xml_writes.sql:36-37`); polityki `audit_logs_no_update` i `audit_logs_no_delete` z `USING (false)` (`00008:55-67`) |
| Odczyt przez klienta | potwierdzone (projekt) | polityka `audit_logs_select_own_tenant` (`00008:48-53`) — członek firmy widzi wpisy swojej firmy; strona `app/(dashboard)/settings/audit/page.tsx` |
| Wyzwalacz „append-only” | potwierdzone (projekt), z wyjątkiem | `00052_audit_logs_immutable_trigger.sql:16-41` blokuje `UPDATE` i `DELETE` niezależnie od roli, ALE przepuszcza każdą sesję, która ustawi `app.allow_audit_purge = 'true'` (`:21-23`). Komentarz w migracji twierdzi, że łapie „nawet superuser próbę” (`:5`), choć superuser albo właściciel tabeli może ustawić tę zmienną albo wyłączyć wyzwalacz. To ochrona przed pomyłką, nie dowód niezmienności (brak łańcucha skrótów, brak kopii poza hostem) |
| Helper zapisu | potwierdzone (kod) | `lib/audit/log.ts:146-168` (IP z `x-forwarded-for`, `user-agent`); `lib/audit/log-system.ts:10-33` (joby: bez IP, `user_agent: 'inngest-job'`) |
| Utrata wpisu przy błędzie | potwierdzone (kod) — luka | oba helpery łapią błąd i piszą tylko `console.error('[audit] write_failed')` (`log.ts:162-167`, `log-system.ts:27-32`); główna operacja idzie dalej. Brak alarmu i licznika nieudanych zapisów — utracony wpis audytu nie zostawia śladu poza logiem kontenera |
| Retencja | potwierdzone (kod) — sprzeczność | cron `cron.cleanup-audit-logs` `0 3 1 * *` (`lib/jobs/queues.ts:91`, `lib/jobs/handlers/package-a.ts:44`) woła `cleanup_old_audit_logs(12)` (`lib/jobs/runners/cleanup-audit-logs.ts:19,33-40`), które usuwa **wszystkie** wpisy starsze niż 12 miesięcy (`00052:53-86`). Komentarz tabeli w `00001:174` mówił „Retencja 10 lat”; nadpisany w `00027:36-37` bez słowa o retencji. Przyjęta (niewdrożona) polityka z PR #225 (`data-policy.md`) rozróżnia audyt dostępu/admin 13 mies. i audyt finansowy 10 lat — kod tego rozróżnienia nie ma |
| Anonimizacja przy usunięciu konta | potwierdzone (kod) | `anonymize_user_audit_logs` (`00052:95-124`) zeruje `user_id`, IP, `user_agent` i **całe** `metadata` wpisów osoby; wywołanie `lib/gdpr/deletion.ts:192-195`. Wywołanie RPC odebrane rolom `anon`/`authenticated` w `00069_audit_permission_hardening.sql:23-25` (SEC-C-06) |

### 2.2. Lista logowanych akcji (stan na `3e5e00d`)

Unia `AuditAction` w `lib/audit/log.ts:25-130` ma 90 akcji. Dla każdej
sprawdzono miejsca zapisu poza słownikami etykiet (`lib/admin/audit.ts`,
`app/(dashboard)/settings/audit/page.tsx`) — polecenie `git grep -lF
"'<akcja>'" -- app lib components supabase/migrations` z wyłączeniem tych
plików.

| Obszar | Akcje z miejscem zapisu (przykładowy dowód) |
|---|---|
| Uwierzytelnianie | `auth.login`, `auth.logout` (`app/(auth)/login/actions.ts`), `auth.signup` (`app/(auth)/register/actions.ts`), `auth.password_reset_requested` (`app/(auth)/forgot-password/actions.ts`), `auth.password_changed` (`app/(auth)/reset-password/actions.ts`, `app/(dashboard)/settings/security/actions.ts`), `auth.mfa_enrolled`, `auth.mfa_unenrolled` (`settings/security/actions.ts`), `auth.mfa_challenge_succeeded`, `auth.mfa_challenge_failed` (`app/(auth)/login/two-factor/actions.ts`) |
| RODO | `gdpr.export_requested` (`app/api/gdpr/export/route.ts`), `gdpr.deletion_requested` (`app/(dashboard)/settings/account/actions.ts:73`), `gdpr.deletion_canceled` (`app/(auth)/gdpr/cancel/actions.ts:20`, `settings/account/actions.ts:101`); `retention.deletion_requested` (`components/settings/account-actions.ts`), `retention.deletion_executed` (`lib/jobs/runners/retention-delete.ts:52-53`) |
| Firma i członkostwo | `tenant.created`, `invitation.*`, `join_request.*`, `membership.revoked`, `membership.role_changed` (`app/actions/organizations.ts`), `tenant.updated` (m.in. `app/actions/company-profile.ts`, `app/actions/cash-method.ts`), `tenant.ksef_verified`, `tenant.ksef_nip_ownership_claimed`, `ksef.credentials_uploaded` (SQL w `00117_ksef_certificate_claim_guard.sql:454-460`) |
| Faktury i KSeF | `invoice.draft_created` (`components/invoices/actions.ts`), `invoice.draft_deleted` (`components/invoices/draft-actions.ts`), `invoice.submit_requested` (`lib/invoices/ksef-submit-enqueue.ts`), `invoice.submit_succeeded`/`_failed`/`_redirected_offline` (`lib/jobs/runners/submit-invoice.ts`), `invoice.upo_downloaded` (`lib/jobs/runners/download-upo.ts`), `invoice.xml_downloaded` (`components/invoices/actions-detail.ts`, `app/accountant/[token]/download/[invoiceId]/route.ts`), `invoice.emailed`, `invoice.ksef_duplicate_decision_notified` (`lib/ksef/duplicate-decision-notice.ts`, nowe w `3e5e00d`), `ksef.session.open` (`lib/ksef/client.ts`), `ksef.upo.download` (`lib/ksef/upo-client.ts`), `ksef.cert_expiry_alert`; zapisy SQL `invoice.send_enqueued`, `invoice.send_requeued`, `invoice.send_reset`, `invoice.enqueue_released`, `invoice.submit.requested` (`00131_ksef_send_lifecycle.sql:134`), `expense.*` (`00127_ksef_expense_provenance_guard.sql:204`) |
| Operator / admin | `admin.user.suspended`, `admin.user.unsuspended`, `admin.user.deleted`, `admin.note.created`, `admin.note.archived` (`app/admin/users/actions.ts:49-287`), `admin.flag.toggled` (`app/admin/flags/actions.ts:59`), `admin.flo.rollout.changed` (`app/admin/flo/actions.ts:81`), `invoice.operator_requeue`/`_reconcile`/`_reset`/`_duplicate_decision` (`app/admin/ksef/actions.ts:170-212,346`), `billing.refund.issued`, `billing.refund.reconciliation_required` (`app/admin/users/[userId]/billing-actions.ts:42,63`), `ops.flag.disabled` (SQL, `00100_ops_gate.sql:155,185`) |
| Płatności | `billing.checkout.session_created` (`lib/stripe/checkout.ts`), `billing.subscription.synced`/`canceled`, `billing.payment.succeeded`/`failed`, `billing.trial.will_end` (`lib/stripe/webhook-handlers.ts`), `billing.vat_invoice.queued` (`lib/jobs/runners/self-invoice-payment.ts`) |
| Księgowa (portal z tokenem) | `accountant.token_created`, `accountant.token_revoked` (`components/settings/accountant-actions.ts`), `accountant.access_used` (`lib/accountant/load-accountant-portal.ts`), `accountant.portal_export` (`app/api/portal/exports/generate/route.ts`) |
| Kontrahenci | `contractor.updated`, `contractor.deleted` (`app/actions/contractors.ts`) |
| Agent FLO | `flo.proposal.executed`, `flo.proposal.failed`, `flo.proposal.undone` (`lib/flo/execute.ts`, `lib/flo/tick.ts`, `lib/flo/undo.ts`) |

**Akcje zadeklarowane bez żadnego miejsca zapisu (19 z 90):**
`auth.mfa_recovery_code_used`, `auth.mfa_recovery_codes_regenerated`,
`gdpr.deletion_executed`, `gdpr.deletion_failed`,
`tenant.user_role_changed`, `invoice.draft_updated`,
`invoice.resubmit_requested`, `ksef.credentials_removed`,
`ksef.environment_changed`, `ksef.session.close`, `ksef.invoice.send`,
`ksef.invoice.poll`, `ksef.inbox.poll`, `ksef.auth.token`,
`admin.user.force_logout`, `admin.user.password_reset_triggered`,
`billing.customer.created`, `billing.subscription.created`,
`billing.subscription.updated`. Część jest uzasadniona: funkcje kodów
zapasowych MFA (`lib/auth/mfa-recovery.ts:30,65`) nie mają wywołań poza
modułem, a akcje admina „wymuś wylogowanie” i „reset hasła” są wyłączone
(`app/admin/users/actions.ts:97-129`). Istotna dla prywatności jest para
`gdpr.deletion_executed`/`gdpr.deletion_failed` — opisana niżej.

### 2.3. Luki w śladzie audytowym

| # | Luka | Dowód | Znaczenie |
|---|---|---|---|
| L1 | Wykonanie usunięcia konta (RODO) nie trafia do `audit_logs`. Stan zapisuje tylko `gdpr_deletion_requests.status/executed_at` | `lib/gdpr/deletion.ts:197-207` (zmiana statusu), brak wywołania `logAudit*` w `lib/gdpr/` i `lib/jobs/runners/gdpr-process-deletions.ts:34-60` (tylko licznik i alert przy błędzie) | dowód realizacji żądania art. 17 zależy od wiersza w tabeli żądań; audyt ma tylko „zażądano” i „anulowano” |
| L2 | Retencja 12 miesięcy dla wszystkich wpisów, także finansowych i KSeF | `00052:53-86`, `cleanup-audit-logs.ts:19` | sprzeczne z komentarzem `00001:174` i z przyjętą polityką PR #225 (audyt finansowy 10 lat); po roku znika ślad wysyłek do KSeF i zmian płatności |
| L3 | Anonimizacja zeruje całe `metadata` wpisów osoby | `00052:106-115` | po usunięciu konta wpisy o wysyłce faktur tracą numer, status i kod błędu — zostaje sama nazwa akcji; do decyzji, czy to zamierzone (P: art. 17 ust. 3 lit. b i e — niezweryfikowane online 2026-10-10 (egress zablokowany) — treść wg wiedzy modelu) |
| L4 | Odczyty danych przez operatora nie są logowane | brak `logAudit*` w żadnym `app/admin/**/page.tsx` (`git grep -l logAudit -- 'app/admin/**/page.tsx'` — pusto); widoki `/admin/users/[userId]`, `/admin/support`, `/admin/audit` czytają dane klientów kluczem `service_role` | SOC 2 CC6/CC7 i zasada rozliczalności: brak śladu, kto i kiedy przeglądał dane osoby lub rozmowy wsparcia |
| L5 | Akcje operatora zapisywane przez helper „systemowy” | `app/admin/users/actions.ts:6,49,80,199`, `app/admin/ksef/actions.ts:8,170,201,346` używają `logAuditSystem` → `ip_address: null`, `user_agent: 'inngest-job'` (`log-system.ts:23-24`); tożsamość operatora tylko w `userId` i `metadata.adminEmail`/`operator` | wpis wygląda jak zdarzenie joba; brak IP i klienta operatora |
| L6 | Utracony zapis audytu nie alarmuje | `log.ts:162-167`, `log-system.ts:27-32` | brak dowodu kompletności śladu (SOC 2 PI, CC7) |
| L7 | Brak niezmienności poza bazą | wyzwalacz `00052` jest jedyną barierą; wg PR #225 (pomiar operatora 04.10, niezweryfikowane w tej sesji) brak pełnej kopii bazy poza hostem | przejęcie hosta bazy pozwala zmienić albo usunąć ślad bez wykrycia |

Ślad audytowy jako **projekt kontroli** istnieje i jest szeroki. Dowodu
**działania w czasie** (liczba wpisów na produkcji, przebiegi
`cron.cleanup-audit-logs`, brak `write_failed` w logach) nie mamy — brak
dostępu do bazy i logów produkcji.

## 3. CI i zarządzanie zmianami

### 3.1. Kontrole w workflow

| Workflow | Wyzwalacz | Joby (nazwa kontroli) | Co sprawdza |
|---|---|---|---|
| `.github/workflows/ci.yml` | `pull_request`, `push` na `main` (`:3-6`) | `Typecheck + Lint + Unit tests` (`:16-50`), `Next build` (`:54`), `RLS isolation (lokalny Supabase)` (`:84-106`), `Test-first (agent)` (`:109`, tylko PR), `Offline security inventory` (`:152`), `dependency-review` (`:173`, tylko PR) | `pnpm audit --prod --audit-level=high`, `pnpm run ci` (= typecheck, eslint, 3 testy tsx, cały Vitest — `package.json:12`), testy skryptów bramek; build Next; migracje + `test:rls` na lokalnym Supabase (`scripts/ci/rls-local.sh`); dla PR agenta: nowe testy muszą padać na bazie; inwentarz offline; przegląd zależności |
| `.github/workflows/security.yml` | `pull_request`, `push`, `workflow_dispatch` | `Secret scan` (Gitleaks na historii), `CodeQL (actions)`, `CodeQL (javascript-typescript)` | sekrety w historii, analiza statyczna z lokalną bramką high/critical (`docs/security/CI-SECURITY.md:5-28`) |
| `.github/workflows/agent-guard.yml` | `pull_request_target` | `Agent guard` | PR agenta kodu dotykający ścieżek z `.github/CODEOWNERS` wymaga etykiety zgody |
| `.github/workflows/agent.yml` | issue z etykietą | `Agent kodu` | uruchamia agenta (przepływ opisany w `01-STAN-I-GRANICE.md`) |
| `.github/workflows/e2e-staging.yml` | tylko ręcznie (`workflow_dispatch`, `:6-7`) | `Playwright E2E` | **0 przebiegów** (GitHub API `actions/workflows/e2e-staging.yml/runs`: `total_count=0`, odczyt 11.10.2026) — testy e2e nigdy nie działały w CI |

Brak kontroli w CI specyficznych dla prywatności poza testami w Vitest
(np. skanu danych osobowych w fixture'ach, testu treści stron prawnych
poza `tests/unit/rodo-terminy-usuwania.test.ts`, kontroli listy
dostawców w CSP). Szablon PR (`.github/pull_request_template.md`) nie ma
pola „wpływ na dane osobowe”.

### 3.2. Wymagane kontrole — dokument a stan rzeczywisty

| Źródło | Co mówi |
|---|---|
| `docs/security/GITHUB-WYMAGANE-KONTROLE.md:3-5` | stan 25.09.2026: ruleset aktywny, PR wymagany z 0 akceptacji, 6 wymaganych kontroli, `strict`; plan dopisania 3 kolejnych (`Next build`, `Test-first (agent)`, `Agent guard`) |
| `docs/security/CI-SECURITY.md:41-51` | lista ustawień do wykonania przez właściciela (Dependency graph, wymagane kontrole, środowisko `security-staging`) — dokument nie potwierdza wykonania |
| `AGENTS.md` („Scalanie PR”) | „11 kontroli CI musi być zielonych” |
| **GitHub API 11.10.2026** (`GET /repos/{repo}/rules/branches/main`) | reguły z rulesetu `23339700`: `deletion`, `non_fast_forward`, `pull_request` z `required_approving_review_count: 0`, `required_status_checks` z **9** kontrolami i `strict: true`: `Typecheck + Lint + Unit tests`, `Offline security inventory`, `dependency-review`, `Secret scan`, `CodeQL (actions)`, `CodeQL (javascript-typescript)`, `Next build`, `Test-first (agent)`, `Agent guard` |
| **GitHub API 11.10.2026** (check runs head PR #245) | 11 kontroli, wszystkie `success`: 9 wymaganych + `RLS isolation (lokalny Supabase)` + zbiorczy `CodeQL` (inna aplikacja) |

Wniosek: dokument z 25.09 jest częściowo nieaktualny (3 kontrole doszły),
a `AGENTS.md` liczy 11 widocznych kontroli, nie 11 wymaganych. **Job
`RLS isolation (lokalny Supabase)` — jedyna kontrola izolacji firm na
prawdziwej bazie — nie jest kontrolą wymaganą.** PR z czerwonym testem RLS
technicznie da się scalić; dziś chroni przed tym tylko zasada z `AGENTS.md`
(„nie scalasz PR z czerwonym CI”).

### 3.3. Historia zmian na `main`

Lokalny klon jest płytki (`git rev-parse --is-shallow-repository` →
`true`, historia od 01.10.2026), więc `git log --merges --oneline | wc -l`
lokalnie daje 247 i nie opisuje całości. Pełną historię odczytano z klonu
bez plików (`git clone --bare --filter=tree:0`) w scratchpadzie.

| Miara (do `3e5e00d`, pierwszy commit 19.04.2026) | Wartość |
|---|---|
| Commity osiągalne z `main` | 1061 |
| Commity scalające (`git rev-list --merges --count`) | 287 |
| Commity na linii pierwszego rodzica `main` | 296 |
| — z tego scalenia PR („Merge pull request #N”) | 113 |
| — scalenie PR z własnym tytułem („Merge PR #100”, 01.10.2026; GitHub API `commits/6b59e00/pulls` → PR #100 scalony przez GitHub) | 1 |
| — commity bezpośrednie (bez PR) | 182 |
| Odsetek zmian `main` przez PR — cała historia | 114/296 = 38,5 % |
| Odsetek od 19.09.2026 (ostatni commit bezpośredni: 18.09.2026) | 114/114 = 100 % |
| Pierwsze scalenie PR na linii `main` | 23.09.2026 |

Recenzje: dla 40 ostatnich PR scalonych do `main` przed `3e5e00d`
(numery 187–245) GitHub API (`pulls/{n}/reviews`) nie zwrócił żadnej
recenzji człowieka ani żadnej akceptacji (`APPROVED`: 0/40). Jest to zgodne
z decyzją właściciela (ruleset z 0 akceptacji,
`GITHUB-WYMAGANE-KONTROLE.md:3`), ale oznacza, że w zarządzaniu zmianami
nie ma niezależnego przeglądu człowieka. Kompensacją są wymagane kontrole
automatyczne, bramka `Agent guard` dla PR agenta i protokół z `AGENTS.md`.

**Projekt czy działanie:** ochrona `main` i wymagane kontrole działają
w czasie — potwierdzają to reguły odczytane z API i 100 % zmian przez PR
od 19.09. Dowodem działania jest historia git i check runs; okres
obserwacji jest krótki (ok. 3 tygodnie), a przed 19.09 większość zmian szła
bezpośrednio.

## 4. Testy istniejące i wynik uruchomienia

Repo ma 489 plików w `tests/unit/`, 8 testów na bazie (`tests/rls-*.test.ts`)
i 10 specyfikacji e2e (`e2e/tests/*.spec.ts`). Do prywatności odnosi się
39 plików jednostkowych wybranych niżej (po nazwie i po importowanych
modułach: `lib/gdpr`, `lib/analytics`, `lib/observability/scrub*`,
`lib/retention`, `lib/audit`, `beforeSend`, `posthog`, `redact`), 2 testy
RLS na bazie i 1 specyfikacja e2e. Testy jednostkowe mockują bazę, HTTP
i SDK — dowodzą logiki kodu, nie działania wyzwalaczy, uprawnień ani
konfiguracji produkcji (zob. `AGENTS.md`, „Protokół naprawy błędu”, pkt 2).

### 4.1. Testy jednostkowe związane z prywatnością (uruchomione)

| Plik (`tests/unit/`) | Obszar | Co sprawdza (z nazw przypadków) |
|---|---|---|
| `analytics-privacy.test.ts` | zgoda analityczna | PostHog startuje dopiero po zgodzie i zatrzymuje się po wycofaniu, także w innej karcie; stary opt-in SDK nie zastępuje zgody; niedostępny `localStorage` nie daje zgody; z wysyłanych zdarzeń znikają tekst DOM, właściwości osobowe i pełne URL |
| `analytics-server-privacy.test.ts` | analityka serwerowa | odrzuca dane osobowe i dowolne właściwości (także w `identify`), nazwa zdarzenia nie może nieść danych osobowych, brak analityki nie psuje akcji biznesowej |
| `telemetry-privacy.test.ts` | Sentry (scrubbing) | usuwa payload żądania, nagłówki i dane użytkownika, czyści spany, parametry zapytań, poświadczenia, SQL, e-maile w URL i tekście; nie eksportuje breadcrumbów konsoli/DOM ani automatycznych logów |
| `worker-sentry.test.ts` | Sentry w workerze | worker używa tych samych filtrów prywatności co Next; poza produkcją Sentry wyłączony |
| `logi-jobow-bez-danych.test.ts` | logi jobów | logger maskuje NIP i e-mail, także zagnieżdżone |
| `worker-run-log.test.ts` | log przebiegów jobów | zapis błędu bez adresów e-mail, payloadu i identyfikatorów firmy |
| `audit-failure-privacy.test.ts` | ślad audytowy | błąd zapisu audytu nie wypisuje treści wpisu do konsoli; poprawny zapis trafia do `audit_logs` |
| `security-api-error-boundaries.test.ts` | odpowiedzi API | odpowiedzi HTTP nie ujawniają treści wyjątków (Stripe, Resend) |
| `password-breach-privacy.test.ts` | HIBP | do zewnętrznego serwisu idzie tylko 5-znakowy prefiks skrótu; brak cache pochodnych hasła |
| `email-recipient-privacy.test.ts` | e-mail | podmiana odbiorcy tylko w jawnym trybie deweloperskim |
| `email-preferences-failures.test.ts` | preferencje e-mail | polityka maili transakcyjnych zachowana, skarga (complaint) wyłącza każdą kategorię; zmiana preferencji tylko dla zweryfikowanego użytkownika |
| `unsubscribe-access.test.ts` | wypis z maili | odrzuca zmieniony lub wygasły token, zamyka się bez sekretu podpisu, bierze tożsamość i kategorię tylko z podpisu |
| `reminder-consent-dialog.test.tsx` | przypomnienia o płatności | wysyłka dopiero po podglądzie i jawnym potwierdzeniu; zmiana odbiorcy unieważnia podgląd |
| `gdpr-account-actions.test.tsx` | usunięcie konta | wymaga sesji, hasła i AAL2 przy MFA; zła treść formularza nie anuluje cudzego żądania; komunikat o mailu zgodny z faktem wysyłki; blokada przez subskrypcję wymienia firmy |
| `gdpr-cancel-confirmation.test.tsx` | anulowanie usunięcia | link GET nie zmienia stanu i nie ujawnia e-maila; sfałszowany wynik nie pokazuje sukcesu |
| `gdpr-deletion.test.ts` | żądanie usunięcia | w bazie tylko SHA-256 tokenu; token jednorazowy; brak rotacji przy ponowieniu; współbieżność; blokada przez subskrypcję; dane do UI bez skrótu tokenu i e-maila |
| `gdpr-subscription-blocker.test.ts` | usunięcie konta a firma | jedyny właściciel z płatną subskrypcją blokuje usunięcie z nazwą firmy; członek bez prawa do płatności może usunąć konto |
| `gdpr-export-boundary.test.ts` | eksport RODO | eksportuje tylko zweryfikowane konto, bez faktur firmy i innych osób; uczciwie raportuje limit wierszy; endpoint zwraca prywatny plik i audytuje faktyczny zakres |
| `rodo-eksport-pelny.test.ts` | eksport RODO (AUD-76) | eksport obejmuje dane osoby z każdego miejsca zapisu, bez sekretów i bez danych innych osób; każda sekcja ma pokrycie |
| `rodo-terminy-usuwania.test.ts` | treść stron prawnych | kod (14 dni) i teksty polityki prywatności oraz strony RODO mówią o tych samych terminach — **jedyny test treści stron prawnych** |
| `rodo-usuniecie-konta-klucze.test.ts` | migracja 00113 | statyczny odczyt SQL: kolumny autora mogą być `NULL`, sprawdzanie blokad tylko dla `service_role`, migracja bez usuwania danych |
| `admin-gdpr-membership-scope.test.ts` | usunięcie konta przez admina | dezaktywuje tylko firmę, której osoba jest aktywnym właścicielem; nie raportuje sukcesu przy błędzie usługi auth |
| `retencja-pliki.test.ts` | retencja faktur (AUD-45) | pliki faktury w MinIO i Glacier usuwane przed wierszem; błąd magazynu zostawia wiersz; klucz spoza katalogu firmy nie jest usuwany; audyt podaje liczbę plików |
| `kopie-zapasowe-retencja.test.ts` | retencja snapshotów JSON | stare kopie kasowane, 7 ostatnich dobrych zostaje zawsze |
| `stripe-retencja.test.ts` | retencja webhooków Stripe | przetworzone zdarzenia po 90 dniach redukowane do id i typu |
| `flo-privacy.test.ts`, `flo-redact-expense.test.ts` | agent FLO (AI) | minimalizacja przed wysłaniem do modelu: usuwa numer konta, PESEL, e-mail, telefon, adres; NIP tylko jawnie dopuszczony; lista dozwolonych pól promptu |
| `admin-audit-access.test.ts`, `admin-operational-access.test.ts`, `admin-user-metrics-access.test.ts` | dostęp operatora | odczyt między firmami (`service_role`) dopiero po zweryfikowanej tożsamości admina z MFA; usunięcie z listy dopuszczonych odbiera dostęp |
| `accountant-document-isolation.test.ts`, `portal-ksiegowej-lista.test.tsx` | portal księgowej (token) | cudzy klucz pliku odrzucony mimo autoryzowanego wiersza; metadane XML związane z firmą, zakaz cache |
| `storage-tenant-boundaries.test.ts`, `invoice-pdf-storage-isolation.test.ts` | pliki w MinIO | wiersz bazy nie autoryzuje obiektu innej firmy; nowe zdjęcia wydatków prywatne i `no-store`; cache PDF z cudzą ścieżką regenerowany |
| `tenant-export-reminder-offline-boundaries.test.ts` | eksporty księgowe | granice firm dla eksportów JPK, fail-closed przy nieznanym środowisku |
| `support-chat-firma.test.ts` | czat wsparcia | rozmowa przypięta do firmy tylko przy aktywnym członkostwie |
| `rls-environment.test.ts`, `ci-rls.test.ts` | konfiguracja testów RLS | testy RLS tylko na lokalnej bazie, bez fallbacku na dane aplikacji; CI ma job RLS |
| `backup-readable-tables.test.ts` | kopia JSON | `service_role` czyta każdą tabelę `public` poza listą pominięć |

### 4.2. Wynik uruchomienia (dowód)

| | |
|---|---|
| Komenda | `pnpm exec vitest run <39 plików z tabeli 4.1> --reporter=dot` (lista w scratchpadzie sesji, `a3-lista-testow.txt`) |
| Kiedy | 11.10.2026, start 14:56:43 UTC |
| Środowisko | kontener sesji, Node v22.22.0, Vitest 4.1.11, `vitest.config.ts` (bez `.env`, `KSEF_ENV=test`, jeden worker) |
| Kod | `3e5e00d` (drzewo robocze: zmiany tylko w `docs/audyt/`) |
| Wynik | **Test Files 39 passed (39); Tests 540 passed (540); FAIL 0; SKIP 0** |
| Czas | 17,03 s (transform 2,37 s, import 7,02 s, testy 2,87 s) |
| Kod wyjścia | 0 |
| Uwagi | stdout zawiera 2 oczekiwane komunikaty `[flo/llm] wyjście odrzucone` z testu `flo-privacy` (przypadek odrzucenia placeholdera); brak danych osobowych w wyjściu |

Wynik dowodzi, że **logika kodu** na `3e5e00d` spełnia asercje tych
testów. Nie dowodzi działania na produkcji (konfiguracja PostHog/Sentry po
stronie paneli, cron, wyzwalacze bazy).

### 4.3. Testy na bazie (RLS) — nieuruchomione lokalnie, dowód z CI

| Plik | Związek z prywatnością | Dowód działania |
|---|---|---|
| `tests/rls-isolation.test.ts` (8 przypadków) | izolacja firm: faktury, sfałszowany nagłówek aktywnej firmy, duplikat NIP, odebrane członkostwo, zaproszenie obcym kontem, dowody wpłat | job CI `RLS isolation (lokalny Supabase)` — `success` dla `3e5e00d` (push na `main`, zakończony 2026-10-08T15:00:42Z) i dla head PR #245 (GitHub API, odczyt 11.10.2026) |
| `tests/rls-uprawnienia.test.ts` (8) | członek nie czyta zaszyfrowanych danych KSeF; usunięcie konta zeruje autora wydatku, OCR i dostępu księgowej (00113); blokady usunięcia tylko dla serwisu | jw. |
| pozostałe 6 (`rls-cykl-*`, `rls-dane-specjalne`, `rls-decyzja-duplikatu`, `rls-kolejkowanie-wysylki`, `rls-korekta-jedna-otwarta`) | integralność przetwarzania KSeF (SOC 2 PI), nie prywatność | jw. |

Testy RLS dotykają tabel `invoices`, `tenants`, `memberships`, `payments`,
`payment_reminders`, `payment_imports`, `users`, `expenses`, `ocr_jobs`,
`accountant_access`, `organization_join_requests`,
`organization_invitations`, `ksef_submissions`, `upo_receipts`,
`audit_logs` (zliczenie `.from('…')` w `tests/rls-*.test.ts`). **Nie
dotykają** tabel z danymi osobowymi: `contractors`, `support_conversations`,
`support_messages`, `email_preferences`, `email_bounces`,
`push_subscriptions`, `newsletter_subscribers`, `gdpr_deletion_requests`,
`mfa_recovery_codes`, `admin_user_notes`, `invoice_line_items`,
`export_files`/`export_jobs`, `import_jobs`. Job RLS nie jest kontrolą
wymaganą (§ 3.2).

### 4.4. E2E — nieuruchamiane

10 specyfikacji Playwright; jedyny przypadek związany z prywatnością to
`e2e/tests/05-landing.spec.ts:53` („legal pages dostępne z footera” —
sprawdza nawigację do `/legal/regulamin`, nie treść). Workflow
`e2e-staging.yml` nie miał żadnego przebiegu (§ 3.1), staging nie istnieje
(PR #225, pomiar 04.10). Brak dowodu działania e2e w czasie. Zachowanie
cookies i żądań sieciowych przed zgodą i po jej wycofaniu zbadał osobny
test runtime agenta RUNTIME (`A4-TEST-COOKIES-I-SIECI.md`,
`narzedzia/test-cookies-i-sieci.mjs`) — nie jest częścią zestawu testów
repo ani CI.

## 5. Testy brakujące (propozycje)

(uzupełniane)

## 6. Potrzeba DPIA / LIA / TIA

(uzupełniane)

## 7. Ustalenia DOW-NN

(uzupełniane)

## 8. Niewiadome i ograniczenia

(uzupełniane)

## 9. Pytania do końcowego review prawnego

(uzupełniane)

## 10. Co sprawdziłem / czego nie mogłem sprawdzić

(uzupełniane)
