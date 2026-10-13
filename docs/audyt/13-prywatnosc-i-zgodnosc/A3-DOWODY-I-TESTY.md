# A3 — Dokumenty, dowody, ślady audytowe i testy

| | |
|---|---|
| Autor | agent DOWODY (subagent audytu 13) |
| Data | 10.10.2026 (zadanie); odczyty i przebiegi testów 11.10.2026 i 13.10.2026 (godziny UTC przy każdym dowodzie) |
| Wersja kodu | `origin/main` @ `3e5e00d` (scalenie PR #245); gałąź robocza bez zmian kodu poza `docs/audyt/` |
| Zakres | pkt 5.G zadania: polityki, rejestry, procedury praw osób, incydentów i retencji, przeglądy dostępów, ślady audytowe, raporty i certyfikaty, ADR, wcześniejsze audyty i plany; CI i zarządzanie zmianami; testy prywatności (istniejące, wynik uruchomienia, brakujące); ocena potrzeby DPIA, LIA, TIA |
| Źródła danych | repo (kod, migracje, testy, `docs/**`, `.github/**`); historia git (lokalny klon jest płytki, pełną historię `main` odczytano z osobnego klonu bez plików w scratchpadzie); GitHub REST API, wyłącznie GET (reguły gałęzi `main`, przebiegi workflow, check runs, recenzje PR); lokalne przebiegi Vitest; niescalony PR #225 (`origin/codex/f0-runtime-inventory`, lokalna kopia @ `c2ab6a8` z 11.10; koordynator cytuje @ `a72b567`) — dalej „[PR225]”, dowód pośredni: pomiar lub deklaracja operatora, niezweryfikowane w tej sesji |
| Ograniczenia | brak dostępu do produkcji (baza, logi, przebiegi cronów, kopie), paneli i umów dostawców; odczyt współpracowników repo przez GitHub API zablokowany przez proxy (403, 13.10); przepisy RODO, wytyczne i kryteria AICPA według wiedzy modelu; nie uruchamiano e2e ani testów RLS na bazie |
| Recenzja | R4 (osobny agent); autor nie zatwierdza własnego etapu. **[R4]** Werdykt R4 (13.10.2026): zatwierdzony z uwagami; uwagi naniósł 13.10.2026 redaktor poprawek (osobny agent, nie autor i nie recenzent) po sprawdzeniu każdej w kodzie — miejsca oznaczone **[R4]**, rozliczenie w „Historii recenzji” na końcu pliku. **[R4]** Head PR #225 od 11.10.2026 14:32 UTC to `c2ab6a8` (tytuł „F0: prepare full backup execution, verified resume and signals”) — ta sama wersja, którą cytuje ten plik |

## 0. Konwencje

- Stany: **potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy**.
- Klasy: **P** obowiązek prawny, **O** interpretacja organu (EROD, UODO),
  **S** kryterium SOC 2, **I** praktyka inżynierska.
- **Projekt kontroli** = istnieje dokument, kod albo konfiguracja.
  **Działanie w czasie** = istnieje datowany zapis wykonania (log, protokół,
  wynik testu, przebieg CI). Sam dokument procedury nie dowodzi jej
  wykonania.
- „Nie znaleziono w repo” nie znaczy „nie istnieje”: rejestr, umowa albo
  zapis może istnieć poza repozytorium (np. w prywatnych dziennikach
  `docs/automation/`, których nie ma w tym klonie).
- **[NZ]** = „niezweryfikowane online 2026-10-10 (egress zablokowany) —
  treść wg wiedzy modelu”. Dotyczy każdego odwołania do RODO, wytycznych
  WP29/EROD, wykazu UODO i kryteriów AICPA w tym pliku.

## 1. Inwentarz dokumentów i dowodów

Metoda: przegląd katalogów `app/(marketing)/legal/`, `docs/support/`,
`docs/security/` (z `audyt/`), `docs/runbooks/`, `docs/adr/`,
`docs/audyt/blok-1/`, `.github/`, plików `docs/observability/*` z [PR225];
wyszukiwanie `git grep -iE` fraz: „rejestr czynności”, „RoPA”, „art. 30”,
„DPIA”, „ocena skutków”, „umowa powierzenia”, „DPA”, „art. 33/34”, „72 h”,
„przegląd dostępów”, „access review”, „SOC 2”, „ISO 27001”, „pentest”,
„IOD”, „DPO” (z wyłączeniem plików tego audytu). Wyniki wyszukiwań są
cytowane w kolumnie „Uwagi”.

### 1.1. Polityki i informacje dla osób

| Dokument / dowód | Ścieżka | Co dowodzi | Projekt czy działanie | Stan | Uwagi |
|---|---|---|---|---|---|
| Polityka prywatności | `app/(marketing)/legal/polityka-prywatnosci/page.tsx` (251 l.) | informacja z art. 13 RODO (P) [NZ] | projekt (deklaracja publiczna) | **częściowe** | administrator to placeholder „[nazwa firmy], NIP [TWÓJ_NIP]” (`:20-21`); „Ostatnia aktualizacja: 9 maja 2026” (`:16`) — sprzed przeprowadzki na Hetznera; lokalizacja „Hetzner, Frankfurt am Main” (`:76`) zamiast NBG1 (Norymberga, `AGENTS.md`); „Backup: AWS Glacier, Frankfurt” (`:79`) — według [PR225] kopie bazy są lokalne na hoście bazy, a AWS w kodzie to archiwum faktur (`01-STAN-I-GRANICE.md` § 3); lista procesorów (`:85-118`) zawiera nieużywane już Supabase Cloud, Cloudflare R2, Vercel i Inngest, a PostHog występuje tylko w § 13 (`:240`); retencja „Logi audit: 12 miesięcy” (`:231`) zgodna z kodem (§ 2.1); „Dane konta: do 30 dni po anulowaniu subskrypcji” (`:229`) — brak wykonawcy (DOW-17). Pełne porównanie deklaracji z kodem: `04-PROCESORZY-I-LOKALIZACJE.md` § 5 i `A1-…` |
| Strona „RODO i bezpieczeństwo” | `app/(marketing)/legal/rodo/page.tsx` (74 l.) | deklaracje bezpieczeństwa, DPA, incydentów | projekt | **sprzeczne z kodem w kilku punktach** | „Frankfurt am Main (Hetzner, Vercel)” (`:20`); „AES-256 (Supabase + R2)” (`:23`) — szyfrowania dysków na self-hosted nie sprawdzono; „Audit logs — kto i kiedy uzyskał dostęp do Twoich danych” (`:39-40`) — odczyty operatora nie są logowane (§ 2.3, L4); „Standard Contractual Clauses z każdym US-based subprocesorem” (`:43-44`) — umów nie ma w repo; „Brak cookies analitycznych” (`:47`) — PostHog po zgodzie (polityka `:238-242`, test runtime `A4-…`); „oferujemy DPA … Pobierz pdf” (`:54-58`) — DPA nie znaleziono w repo; „powiadomimy Cię w ciągu 72 godzin (zgodnie z art. 33 RODO)” (`:63-64`) — art. 33 ust. 1 dotyczy zgłoszenia organowi przez administratora, a procesor powiadamia administratora „bez zbędnej zwłoki” (art. 33 ust. 2) [NZ] |
| Regulamin | `app/(marketing)/legal/regulamin/page.tsx` (113 l.) | warunki usługi, § 6 dane | projekt | **częściowe** | „Hetzner, Frankfurt” (`:90-91`); „po anulowaniu subskrypcji … 30 dni, po czym są permanentnie usuwane” (`:94-95`) — brak wykonawcy (DOW-17); brak postanowień o powierzeniu przetwarzania (`grep -i powierz` — 0 trafień) |
| Umowa powierzenia (DPA) dla klientów | nie znaleziono w repo | art. 28 ust. 3 RODO (P) [NZ] | — | **brak (nie znaleziono)** | jedyne wzmianki: `rodo/page.tsx:54-58` (deklaracja) i `docs/security/PLAN-ODPORNOSCI-CYBER.md:113` (zadanie „ustalić z prawnikiem umowy powierzenia, rejestr czynności, transfery i potrzebę oceny skutków”) |
| Wytyczne wsparcia | `docs/support/{common-scenarios,escalation-matrix,refund-policy,tone-guidelines}.md` | obsługa zgłoszeń | projekt | **częściowe** | `escalation-matrix.md:41-42`: „Żądania RODO (eksport, usunięcie konta) — user robi to sam w ustawieniach. Eskalacja tylko, gdy user stracił dostęp do konta” — brak ścieżki dla osób bez konta, dla sprostowania, ograniczenia i sprzeciwu oraz dla żądań klienta jako administratora; `:38-39` **[R4]** odsyła incydent bezpieczeństwa do `key-rotation.md` § 9. **[R4]** Żądania przysłane e-mailem nie są „bez ścieżki”: zaprojektowany kanał przyjęcia z klasyfikacją RODO istnieje (§ 1.3, wiersz „Przyjęcie żądań e-mailem”), brakuje ewidencji i procedury |

### 1.2. Rejestry i ewidencje

| Dokument / dowód | Ścieżka | Co dowodzi | Projekt czy działanie | Stan | Uwagi |
|---|---|---|---|---|---|
| Rejestr czynności przetwarzania administratora | nie znaleziono | art. 30 ust. 1 (P) [NZ] | — | **brak (nie znaleziono)** | `git grep` fraz „rejestr czynno”, „RoPA”, „art. 30 RODO” — jedyne trafienie to zadanie w `PLAN-ODPORNOSCI-CYBER.md:113`. Inne trafienia „ropa” to fragmenty innych słów (np. „Europa”) |
| Rejestr kategorii czynności procesora | nie znaleziono | art. 30 ust. 2 (P) [NZ] | — | **brak (nie znaleziono)** | FaktFlow jest procesorem danych kontrahentów klientów (`02-INWENTARZ-I-PRZEPLYWY.md`) |
| Lista dalszych procesorów dla klientów | polityka `:83-118` | art. 28 ust. 2 i 4 (P) [NZ] | projekt | **częściowe** | lista nieaktualna (wyżej); projekt rejestru w `04-…` § 3 |
| Rejestr naruszeń | nie znaleziono | art. 33 ust. 5 (P) [NZ] | — | **brak (nie znaleziono)** | `docs/incidents/` nie istnieje, choć `docs/bug-triage.md:50` wymaga post-mortem po każdej naprawie P0, a `docs/runbooks/key-rotation.md:190` po incydencie; `AGENTS.md` opisuje co najmniej dwie awarie produkcji (wyłączenie na 15 godzin, OOM 29.08.2026) — zapisów post-mortem w repo brak |
| Ewidencja żądań osób | tabela `gdpr_deletion_requests` (status, `executed_at`); wpis audytu `gdpr.export_requested` (`app/api/gdpr/export/route.ts`) | rozliczalność realizacji praw | działanie tylko w bazie produkcyjnej | **częściowe / niezweryfikowane** | obejmuje usunięcie i eksport z poziomu konta; żądania mailowe (polityka `:202`, „Wniosek do realizacji prawa: …”) nie mają ewidencji w repo; zawartości bazy nie widzieliśmy. **[R4]** Poczta na adres pomocy jest klasyfikowana do kategorii „RODO / dane osobowe” z alarmem „pilne” (`ops/poczta/worker.mjs:15-16`, § 1.3) — to powiadomienie bez nadawcy i treści, nie ewidencja: brak daty wpływu, identyfikacji osoby i terminu odpowiedzi |

### 1.3. Procedury

| Dokument / dowód | Ścieżka | Co dowodzi | Projekt czy działanie | Stan | Uwagi |
|---|---|---|---|---|---|
| Procedura praw osób | ADR 0006; polityka § 9–10 (`:162-202`); `escalation-matrix.md:41-42`; kod `lib/gdpr/*`, `app/api/gdpr/export/route.ts` | art. 12, 15–22 (P) [NZ] | projekt (kod samoobsługi) | **częściowe** | mechanizm dla posiadacza konta (eksport, usunięcie z 14-dniowym okresem); brak procedury dla sprostowania, ograniczenia, sprzeciwu, osób bez konta i pomocy klientowi jako procesor (art. 28 ust. 3 lit. e [NZ]); szczegóły mechanizmów: `A2-…`. **[R4]** Wzór identyfikacji osoby istnieje w innym runbooku: przy odblokowaniu konta właściciel zatwierdza procedurę i potwierdza tożsamość „przez niezależne dowody i kanały”, a sam e-mail lub dane firmy nie wystarczają (`docs/runbooks/unlock-account.md:68-70`) — do przeniesienia do procedury praw osób |
| **[R4]** Przyjęcie żądań e-mailem | `ops/poczta/worker.mjs:15-16`; `docs/runbooks/skrzynka-pomoc.md:16-22`; test `ops/poczta/worker.test.mjs` | art. 12 ust. 2–3 (P) [NZ] | projekt (kod + test w wymaganej kontroli „Typecheck + Lint + Unit tests”, `.github/workflows/ci.yml:49-50`) | **częściowe** | worker poczty klasyfikuje wiadomość po słowach z tematu (m.in. „rodo”, „usunięcie danych”, „sprzeciw”) do kategorii „RODO / dane osobowe”, oznacza ją jako pilną z notatką „termin ustawowy: 1 miesiąc” i wysyła na Telegram powiadomienie bez nadawcy, tematu i treści (test „powiadomienie nie zawiera nadawcy, tematu ani treści” — 6/6 PASS, `node --test`, 13.10.2026). Brak rejestru żądań, potwierdzenia wpływu, identyfikacji osoby i terminu liczonego od daty wpływu; poczta trafia do skrzynek prywatnych (`04-…` PRC-08); czy routing i worker działają na produkcji — niezweryfikowane (N-DOW-09) |
| Procedura naruszeń | `docs/runbooks/key-rotation.md:183-190`; `docs/runbooks/disaster-recovery.md:117-120`; `escalation-matrix.md:38-39` **[R4]**; `PLAN-ODPORNOSCI-CYBER.md:147`; `docs/runbooks/flo-incident.md` | art. 33–34 (P) [NZ] | projekt | **częściowe** | oba runbooki z krokiem „zgłoszenie do UODO” mają nagłówek „TEN DOKUMENT JEST NIEAKTUALNY” (`key-rotation.md:3-10`, `disaster-recovery.md:3-10`); odsyłają do „DPO”, którego wyznaczenia nie znaleziono (`git grep` „Inspektor Ochrony Danych”, „IOD” — 0 trafień poza tymi runbookami); brak kryteriów oceny ryzyka naruszenia, szablonu zgłoszenia, ścieżki powiadomienia klientów-administratorów, wskazania osoby decyzyjnej; brak zapisu ćwiczenia. `PLAN-ODPORNOSCI-CYBER.md:147` poprawnie opisuje próg zgłoszenia, ale to plan, nie procedura |
| Procedura retencji | polityka § 11–12 (`:204-233`); ADR 0006; crony `cron.cleanup-audit-logs`, `retention-delete`, retencja Stripe i kopii (`lib/jobs/queues.ts:88-128`); [PR225] `data-policy.md` (przyjęta, niewdrożona) | art. 5 ust. 1 lit. e (P) [NZ] | projekt + kod | **częściowe** | sprzeczności: audyt 12 mies. dla wszystkiego (L2), `hard_delete_at` bez wykonawcy (DOW-17), wyzwalacz `b_guard_invoice_pending_content` blokuje usuwanie wysłanych faktur także dla `service_role` (ustalenie R1, `00132…sql:63-73`); dowodu przebiegów cronów na produkcji brak |
| Kopie i odtwarzanie | `docs/runbooks/backup-restore.md` (§ 1, § 5 `:128-171`); `docs/security/rto-rpo.md:128-131`; ADR 0007, 0009 | art. 32 ust. 1 lit. c–d (P) [NZ]; S (A1.2/A1.3) [NZ] | projekt + jednorazowe działanie **deklarowane** (wiersz protokołu `backup-restore.md:171`, bez surowego logu) **[R4]** | **częściowe** | jeden zapis próby odtworzenia: 01.10.2026, sama baza `postgres`, na `ops-1` (`backup-restore.md:171`, `rto-rpo.md:131`) — w repo jako wiersz tabeli, bez surowego logu; MinIO bez kopii; [PR225] F0-G09 **FAIL** (brak pełnej kopii poza hostem, `acceptance-plan.md:220`); ADR 0009 ma status „Proposed” (`0009-…:3`); miesięczny cykl prób nie ma jeszcze drugiego wpisu (kolejny termin ok. 01.11) |
| Rotacja kluczy | `docs/runbooks/key-rotation.md` | art. 32 (P); S (CC6.1) [NZ] | projekt | **częściowe** | dokument oznaczony jako nieaktualny (`:3-10`), opisuje zmienne Vercela; zapisów wykonanych rotacji w repo brak |
| **[R4]** Wdrożenia przez bramkę `/wdroz` (Telegram) | `docs/runbooks/bramka-telegram.md:13-34`; `ops/bramka/src/deploy.mjs:120-137`; migracja `00100_ops_gate.sql:155-185`; testy `ops/bramka/test/*` w CI (`.github/workflows/ci.yml:47-48`) | S (CC8.1) [NZ]; rozliczalność zmian | projekt | **niezweryfikowane (działanie)** | wdraża tylko HEAD `main` z zielonymi „Typecheck + Lint + Unit tests” i „Next build”, wymaga TOTP, odmawia przy niewgranych migracjach i zapisuje `ops.deploy.started/finished/failed` z aktorem i SHA w `audit_logs`; `/wylacz` zapisuje `ops.flag.disabled`. Czy bramka jest używana — nieznane: rejestr nie oznacza `00100` jako wgranej (`docs/koordynacja/CLAUDE-DO-CODEXA.md:43`), a `AGENTS.md` opisuje tylko `tinker` (N-DOW-11). Wpisy `ops.*` podlegają 12-miesięcznej retencji (L2) |
| **[R4]** Gotowość do wydania — procedury operatora | `docs/koordynacja/GOTOWOSC-DO-WYDANIA.md:24` (kryterium G8) | S (CC7.4, A1.3) [NZ] | projekt (kryterium) | **niezweryfikowane (działanie)** | G8 wymaga, by procedury operatora (migracja, wdrożenie, wycofanie, reset faktury, uzgodnienie środowiska, odtworzenie bazy) „istniały i były przećwiczone” — „jedna próba każdej na KSeF TEST / kopii bazy”; w tym etapie znana jest tylko jedna deklarowana próba odtworzenia (01.10, wiersz wyżej); trafień „przećwicz” w innych dokumentach `docs/` nie zestawiano z G8 |

### 1.4. Przeglądy dostępów

| Dokument / dowód | Ścieżka | Co dowodzi | Projekt czy działanie | Stan | Uwagi |
|---|---|---|---|---|---|
| Przegląd dostępów (operatorzy aplikacji, SSH, Coolify, GitHub, panele dostawców) | nie znaleziono | S (CC6.2, CC6.3) [NZ]; art. 32 (P) [NZ] | — | **brak (nie znaleziono)** | `git grep -iE` fraz „przegląd dostęp”, „access review”, „recertyfik” — 0 trafień. **[R4]** Najbliższy artefakt to jednorazowy rejestr ręcznego rozliczenia 89 pozycji (z 305 zapytań kodu z kluczem `service_role`) z 16.09.2026 (`docs/security/audyt/service-role-review-20260916.json`, opis `docs/security/FAZA-03-IZOLACJA-FIRM-I-SERVICE-ROLE.md:11`) — przegląd uprawnień kodu, nie kont osób; stan wiersza bez zmian (brak) |
| Lista operatorów aplikacji | zmienna `ADMIN_EMAILS` (`lib/auth/admin-guard.ts:9-15`, `.env.example:265`) | kto ma dostęp `service_role` między firmami | projekt | **niezweryfikowane** | wartość tylko w konfiguracji produkcji (poza repo); zmiana listy nie zostawia śladu w repo ani w `audit_logs` |
| Dostęp do repozytorium i bramki zmian | `.github/CODEOWNERS`, `agent-guard.yml` | kontrola zmian wrażliwych ścieżek | projekt + działanie (reguły z API, § 3) | **częściowe** | to kontrola zmian, nie przegląd dostępu; listy współpracowników nie odczytano (proxy 403) |
| Konta dostawców | [PR225] `ownership.md:20-27` | — | deklaracja operatora 10.10 | **niezweryfikowane** | według odczytu UI: Sentry ma jednego członka, z którego korzysta druga osoba, i nieaktywne TOTP/passkey; MFA GitHub nieodczytane. Wspólne konto bez MFA wyklucza rozliczalność dostępu |
| **[R4]** Upoważnienia do przetwarzania, zobowiązania do poufności, szkolenia | nie znaleziono (`git grep -nliE "upoważnieni\|upowaznieni\|poufnoś\|poufnos\|\bNDA\b\|szkoleni" -- docs AGENTS.md app` poza plikami audytu — trafienia tylko w ogólnych zdaniach `docs/security/PLAN-ODPORNOSCI-CYBER.md:9`, `docs/security/rto-rpo.md:140` i na stronach porównań `app/(marketing)/vs/*`; odczyt 13.10.2026) | art. 28 ust. 3 lit. b, art. 29, art. 32 ust. 4 (P) [NZ]; S (CC1.4, C1.1) [NZ] | — | **brak (nie znaleziono)** | dotyczy osób z dostępem `service_role`, SSH, Coolify i paneli dostawców oraz sesji agentów AI z dostępem do produkcji (`04-…` PRC-07); warunek zobowiązania z art. 28 ust. 3 lit. b w umowie powierzenia (DOW-01, DOW-20); szczegóły: DOW-23 |

### 1.5. Ślady audytowe

Opisane w § 2 (mechanizm, lista akcji, luki).

### 1.6. Raporty, certyfikaty, audyty

| Dokument / dowód | Ścieżka | Co dowodzi | Projekt czy działanie | Stan | Uwagi |
|---|---|---|---|---|---|
| Raport SOC 2, ISO 27001, test penetracyjny | nie znaleziono | S | — | **brak (nie znaleziono)** | wzmianki „SOC 2” w `docs/audyt/blok-1/*` i `docs/security/*` to cele lub odwołania, nie raporty. Raportów SOC 2 dostawców (np. hostingu, Sentry, PostHog) nie zebrano — egress do ich stron zablokowany |
| Audyt bezpieczeństwa 6–9.09.2026 | `docs/security/audyt/RAPORT.md`, `REJESTR-USTALEN.md`, `01-…07-*.md` | stan wycieków między firmami | **działanie jednorazowe** | historyczne | nagłówki `RAPORT.md:2-3` i `REJESTR-USTALEN.md:2-3` oznaczają stan jako historyczny |
| Odczyty bazy produkcyjnej z audytu | `docs/security/audyt/wynik-0*.txt`, `wynik-99-*.txt` (08.09.2026) | RLS, polityki, uprawnienia ról, funkcje `SECURITY DEFINER`, PostgREST bez tokenu | **działanie w punkcie czasu** | potwierdzone dla 08.09 | jedyny w repo datowany odczyt uprawnień produkcji; po 08.09 doszło kilkadziesiąt migracji, więc nie opisuje stanu z 10.10. Plik `wynik-00-adres-bazy.txt` ujawnia adres hosta bazy i ścieżkę lokalnego klucza z nazwą konta (DOW-19) |
| Test maskowania przed modelem | `docs/security/audyt/06-redakcja.md` (09.09) | skuteczność `redactForModel` | działanie jednorazowe | historyczne | 17 przypadków, 1 przeciek; czy dzisiejsze `flo-privacy`/`flo-redact-expense` (zielone 13.10) obejmują ten przypadek — nie sprawdzano |
| Nagłówki produkcji | `docs/security/audyt/07-produkcja.md` (09.09) | HSTS, CSP i inne | działanie jednorazowe | historyczne | GET-y z zewnątrz |
| Mapa OWASP | `docs/security/owasp-top10-mapping.md` | mapowanie kontroli | projekt | — | sam dokument: „nie jest certyfikatem … nie potwierdza wdrożenia” (`:3`) |
| Dzienniki prac bezpieczeństwa | `docs/security/DZIENNIK-AUDYT.md` (880 l.), `DZIENNIK-ODPORNOSCI-CYBER.md` (1248 l.), `DZIENNIK-NAPRAW-ASTRA.md` | przebieg napraw, odwołania do PR i CI | działanie (datowane wpisy prac) | — | dowód wykonywania napraw, nie okresowych kontroli |
| Plany | `PLAN-ODPORNOSCI-CYBER.md` (13.09, „plan przyjęty; realizacja rozpoczęta”), `PLAN-WYDANIA-GDPR.md` (15.09), `PROPOZYCJE-SCHEMATU-GDPR.md` (historyczny), `ZGODA-NA-PRZYPOMNIENIA-2026-09-23.md` | zamiary i decyzje | projekt | — | `PLAN-WYDANIA-GDPR.md` deklaruje wgranie 2 z 3 zależności 15.09 — deklaracja, niezweryfikowane |
| Audyt funkcjonalny bloku 1 | `docs/audyt/blok-1/{ZADANIE,PLAN,STAN,RAPORT,PODSUMOWANIE,KONTEKST-REPO}.md` | funkcjonalność | działanie jednorazowe | — | nie dotyczy prywatności poza kontekstem (FLO niewdrożony) |
| CI i wymagane kontrole | `docs/security/CI-SECURITY.md`, `GITHUB-WYMAGANE-KONTROLE.md` | projekt kontroli zmian | projekt | częściowe | porównanie ze stanem z API: § 3.2 |
| **[R4]** Przegląd ścieżek `service_role` | `docs/security/audyt/service-role-review-20260916.json` (16.09.2026, baza `36f2bae`); opis `docs/security/FAZA-03-IZOLACJA-FIRM-I-SERVICE-ROLE.md:11` | ręczne rozliczenie 89 pozycji z 305 zapytań (prześledzona ścieżka / naprawa / kod niepodłączony / otwarte zadanie) | **działanie jednorazowe** | historyczne | sam opis zastrzega, że rozliczenie nie oznacza 89 napraw ani 89 bezpiecznych ścieżek; bez cyklu powtórzeń; nie opisuje kodu `3e5e00d` (dzisiejszy zasięg `service_role`: `06-SOC2.md` § 3.6) |

### 1.7. ADR

| ADR | Status, data | Znaczenie dla prywatności | Zgodność z kodem |
|---|---|---|---|
| 0001 RLS jako jedyne źródło izolacji | Accepted, 2026-01-15 | izolacja firm | RLS na 70/70 tabel `public` (`01-…` § 3); testy na bazie obejmują część tabel (§ 4.3) |
| 0005 2FA natywne MFA Supabase | Accepted, 2026-04-08 | bezpieczeństwo kont | zgodne (`01-…` § 3) |
| 0006 usunięcie konta z 14-dniowym okresem | Accepted, 2026-04-15 | art. 17 | **częściowo**: 14 dni i anonimizacja audytu zgodne (`lib/gdpr/deletion.ts:190-195`); deklaracja „audit_logs muszą zostać do audytu (też prawo)” (`0006-…:14`) sprzeczna z usuwaniem po 12 mies. (L2); deklaracja „anonimizujemy email u Stripe (`customer.update`)” (`0006-…:30`) bez pokrycia — **[R4]** `git grep -ni stripe lib/gdpr/` daje 2 trafienia, oba w komentarzach o blokadzie subskrypcji (`lib/gdpr/deletion-blockers.ts:8, 19`); żadnego wywołania API Stripe; jedyne `customers.update` to synchronizacja adresu (`lib/stripe/customer-email.ts:16`) (DOW-18). **[R4]** Druga rozbieżność: ADR zapowiada automatyczne anulowanie subskrypcji przy usunięciu (`0006-…:45-46`), a kod blokuje usunięcie konta jedynego właściciela z płatną subskrypcją (`lib/gdpr/deletion-blockers.ts`, test `gdpr-subscription-blocker.test.ts`) |
| 0007 kopie „free tier first” | Accepted, faza 2 zastąpiona przez 0009 | dostępność, odtwarzanie | historyczne |
| 0009 `pg_dump` na hoście bazy i Storage Box | **Proposed** (`:3`), 2026-10-01 | kopie poza hostem | niewdrożone (Storage Box „czeka na zakup”, `backup-restore.md` § 1); [PR225] decyzja 07.10 o innej lokalizacji, niewdrożona |

### 1.8. Materiały z niescalonego PR #225

| Dokument / dowód | Ścieżka [PR225] | Co dowodzi | Projekt czy działanie | Stan | Uwagi |
|---|---|---|---|---|---|
| Inwentarz runtime i indeksy dowodów | `runtime-inventory.md`, `evidence/f0-*.json` (04.10, 06.10, 07.10, 10.10, 11.10) | stan produkcji: lokalizacje, wersje, ustawienia Sentry/PostHog, kopie | działanie (pomiar punktowy operatora) | **niezweryfikowane w tej sesji** | surowe załączniki prywatne; fakty używane w raportach z oznaczeniem poziomu dowodu (`01-…` § 4) |
| Plan odbioru i bramki | `acceptance-plan.md` | stan bramek F0 | projekt + częściowe pomiary | — | F0-G03 staging **FAIL** (`:214`); F0-G09 kopie poza hostem **FAIL** (`:220`); G01, G02, G07, G08 **PARTIAL**; G04, G05, G06 **PASS tylko dla decyzji** (`:215-217`); rejestr testów TEST-01…TEST-07 — **wszystkie NOT RUN** (`:458-468`), w tym TEST-04 „prywatność/RBAC” (kanarki w logach, śladach, błędach, RUM, alertach i AI) i TEST-07 „restore” |
| Polityka danych obserwowalności | `data-policy.md` | retencja telemetrii i audytu | projekt (przyjęta, niewdrożona) | — | audyt dostępu/admin 13 mies., audyt finansowy i minimalna historia błędów faktur 10 lat (`:61-62`), logi lokalne do 7 dni (`:65`, `:71`), błędy Sentry 30 dni (`:67`), analityka produktowa 1 rok (`:69`) |
| Role i dostęp | `ownership.md` | właściciele monitoringu, operatora, dokumentacji | deklaracja | — | por. § 1.4 |
| Kontrakty wyników | `contracts.md` | kontrakt v1.2 (integralność przetwarzania) | projekt | — | SOC 2 PI; poza prywatnością |

## 2. Ślady audytowe

### 2.1. Mechanizm

| Element | Stan | Dowód |
|---|---|---|
| Tabela `audit_logs` | potwierdzone (projekt) | `supabase/migrations/00001_initial_schema.sql:162-174`; kolumny `metadata`, `user_agent` dodane w `00008_audit_logs_refinements.sql:8-9` |
| Zapis tylko przez serwer | potwierdzone (projekt) | `authenticated` ma tylko `SELECT` (`00008_audit_logs_refinements.sql:40-41`, komentarz `00027_lockdown_audit_xml_writes.sql:36-37`); polityki `audit_logs_no_update` i `audit_logs_no_delete` z `USING (false)` (`00008:55-67`) |
| Odczyt przez klienta | potwierdzone (projekt) | polityka `audit_logs_select_own_tenant` (`00008:48-53`): **każdy** członek firmy widzi wszystkie wpisy firmy; strona `app/(dashboard)/settings/audit/page.tsx:35-38` czyta `select('*')`, limit 200, bez sprawdzenia roli, i pokazuje adres IP (`:98`) |
| Wyzwalacz „append-only” | potwierdzone (projekt), z wyjątkiem | `00052_audit_logs_immutable_trigger.sql:16-41` blokuje `UPDATE` i `DELETE` niezależnie od roli, ale przepuszcza każdą sesję, która ustawi `app.allow_audit_purge = 'true'` (`:21-23`). **[R4]** Taką zmienną (prefiks `app.`) może ustawić każda rola, więc wyzwalacz chroni tylko przed pomyłką roli, która ma uprawnienia `UPDATE`/`DELETE` (np. `service_role`); rolę `authenticated` zatrzymują już `REVOKE` i polityki RLS (`00008:40-41, 55-67`); wyłączyć wyzwalacz może właściciel tabeli albo superuser. Komentarz twierdzi, że łapie „nawet superuser próbę” (`:5`) — przecenia ochronę. To ochrona przed pomyłką, nie dowód niezmienności (brak łańcucha skrótów, brak kopii poza hostem) |
| Helpery zapisu | potwierdzone (kod) | `lib/audit/log.ts:146-168` (IP z nagłówków, `user-agent`); `lib/audit/log-system.ts:10-33` (joby: bez IP, `user_agent: 'inngest-job'` — `:24`); zapis bezpośredni z rzucaniem błędu w `lib/ksef/duplicate-decision-notice.ts:149-170` |
| Utrata wpisu przy błędzie | potwierdzone (kod) — luka | oba helpery łapią błąd i piszą tylko `console.error('[audit] write_failed')` (`log.ts:162-167`, `log-system.ts:27-32`); główna operacja idzie dalej; brak alarmu i licznika |
| Retencja | potwierdzone (kod) — sprzeczność | cron `cron.cleanup-audit-logs` `0 3 1 * *` (`lib/jobs/queues.ts:91`, `lib/jobs/handlers/package-a.ts:44`) woła `cleanup_old_audit_logs(12)` (`lib/jobs/runners/cleanup-audit-logs.ts:19,33-40`), które usuwa **wszystkie** wpisy starsze niż 12 miesięcy (`00052:53-86`). Komentarz tabeli w `00001:174` mówił „Retencja 10 lat”; zastąpiony w `00027:36-37` bez słowa o retencji |
| Anonimizacja przy usunięciu konta | potwierdzone (kod) | `anonymize_user_audit_logs` (`00052:95-124`) zeruje `user_id`, IP, `user_agent` i zastępuje **całe** `metadata` wpisów osoby; wywołanie `lib/gdpr/deletion.ts:190-195`; prawo wykonania odebrane rolom `anon`/`authenticated` (`00069_audit_permission_hardening.sql:23-25`). **[R4]** Nie obejmuje kolumny `details_json` (`00001_initial_schema.sql:169`; funkcja `00052:105-115` czyści tylko `user_id`, IP, `user_agent` i `metadata`, późniejsze migracje jej nie redefiniują poza uprawnieniami w `00069`), do której piszą RPC wysyłki KSeF przez `ksef_send_audit` (`00131_ksef_send_lifecycle.sql:121-136`) — m.in. `previous_error` (`00131:302-309, 368-375`) i nowa w `3e5e00d` akcja `invoice.ksef_duplicate_decided` z aktorem i wolnym tekstem `note` (`00148_ksef_duplicate_decision.sql:537-545`); wolny tekst może zawierać dane osobowe i zostaje po usunięciu konta do 12 miesięcy (L10) |
| Zmiana w `3e5e00d` | potwierdzone (diff `7c0097f..3e5e00d`) | `lib/audit/log.ts` +6 linii: akcje `invoice.operator_duplicate_decision` i `invoice.ksef_duplicate_decision_notified`. Drugą zapisuje `lib/ksef/duplicate-decision-notice.ts:153-170` z `metadata.original_ksef_number`, `idempotency_key` i `operator` (e-mail operatora przy przypomnieniu) i **używa `audit_logs` jako stanu biznesowego**: odczyt `:88-93`, `:113-114` decyduje, czy powiadomienie już poszło. Po 12 miesiącach (cron) albo po anonimizacji `metadata` ten stan znika |

### 2.2. Lista logowanych akcji (stan na `3e5e00d`)

Unia `AuditAction` w `lib/audit/log.ts:25-130` ma **90** akcji (odczyt
13.10.2026). Dla każdej sprawdzono wystąpienia poza słownikami etykiet
(`lib/admin/audit.ts`, `app/(dashboard)/settings/audit/page.tsx`):
`git grep -lF "'<akcja>'" -- app lib components supabase/migrations`.
71 akcji ma wystąpienie poza słownikami; 19 nie ma żadnego.

| Obszar | Akcje z miejscem zapisu (przykładowy dowód) |
|---|---|
| Uwierzytelnianie | `auth.login`, `auth.logout` (`app/(auth)/login/actions.ts`), `auth.signup` (`app/(auth)/register/actions.ts`), `auth.password_reset_requested` (`app/(auth)/forgot-password/actions.ts`), `auth.password_changed` (`app/(auth)/reset-password/actions.ts`, `app/(dashboard)/settings/security/actions.ts`), `auth.mfa_enrolled`, `auth.mfa_unenrolled` (`settings/security/actions.ts`), `auth.mfa_challenge_succeeded`, `auth.mfa_challenge_failed` (`app/(auth)/login/two-factor/actions.ts`) |
| RODO | `gdpr.export_requested` (`app/api/gdpr/export/route.ts`), `gdpr.deletion_requested` (`app/(dashboard)/settings/account/actions.ts:73`), `gdpr.deletion_canceled` (`app/(auth)/gdpr/cancel/actions.ts:20`, `settings/account/actions.ts:101`); `retention.deletion_requested` (`components/settings/account-actions.ts`), `retention.deletion_executed` (`lib/jobs/runners/retention-delete.ts:52-53`) |
| Firma i członkostwo | `tenant.created`, `invitation.*`, `join_request.*`, `membership.revoked`, `membership.role_changed` (`app/actions/organizations.ts`), `tenant.updated` (m.in. `app/actions/company-profile.ts`, `app/actions/cash-method.ts`), `tenant.ksef_verified`, `tenant.ksef_nip_ownership_claimed`, `ksef.credentials_uploaded` (SQL w `00117_ksef_certificate_claim_guard.sql:454-460`) |
| Faktury i KSeF | `invoice.draft_created` (`components/invoices/actions.ts`), `invoice.draft_deleted` (`components/invoices/draft-actions.ts`), `invoice.submit_requested` (`lib/invoices/ksef-submit-enqueue.ts`), `invoice.submit_succeeded`/`_failed`/`_redirected_offline` (`lib/jobs/runners/submit-invoice.ts`), `invoice.upo_downloaded` (`lib/jobs/runners/download-upo.ts`), `invoice.xml_downloaded` (`components/invoices/actions-detail.ts`, `app/accountant/[token]/download/[invoiceId]/route.ts`), `invoice.emailed` (`components/invoices/actions-detail.ts:516-522` **[R4]**), `invoice.ksef_duplicate_decision_notified` (`lib/ksef/duplicate-decision-notice.ts`), `ksef.session.open` (`lib/ksef/client.ts`), `ksef.upo.download` (`lib/ksef/upo-client.ts`), `ksef.cert_expiry_alert`; zapisy SQL `invoice.send_enqueued`, `invoice.send_requeued`, `invoice.send_reset`, `invoice.enqueue_released` (wspólny zapis `ksef_send_audit`, `00131_ksef_send_lifecycle.sql:134`), **[R4]** `invoice.ksef_duplicate_decided` (`00148_ksef_duplicate_decision.sql:538`; `invoice.submit.requested` z poprzedniej wersji to nazwa zdarzenia kolejki — `lib/invoices/ksef-submit-enqueue.ts:279`, `00131:426` — nie akcja audytu), `expense.*` (`00127_ksef_expense_provenance_guard.sql:204`) |
| Operator / admin | `admin.user.suspended`, `admin.user.unsuspended`, `admin.user.deleted`, `admin.note.created`, `admin.note.archived` (`app/admin/users/actions.ts:49-287`), `admin.flag.toggled` (`app/admin/flags/actions.ts:59`), `admin.flo.rollout.changed` (`app/admin/flo/actions.ts:81`), `invoice.operator_requeue`/`_reconcile`/`_reset`/`_duplicate_decision` (`app/admin/ksef/actions.ts:170-212,346`), `billing.refund.issued`, `billing.refund.reconciliation_required` (`app/admin/users/[userId]/billing-actions.ts:63, 42` — kolejność wg akcji **[R4]**), `ops.flag.disabled` (SQL, `00100_ops_gate.sql:155,185`) |
| Płatności | `billing.checkout.session_created` (`lib/stripe/checkout.ts`), `billing.subscription.synced`/`canceled`, `billing.payment.succeeded`/`failed`, `billing.trial.will_end` (`lib/stripe/webhook-handlers.ts`), `billing.vat_invoice.queued` (`lib/jobs/runners/self-invoice-payment.ts`) |
| Księgowa (portal z tokenem) | `accountant.token_created`, `accountant.token_revoked` (`components/settings/accountant-actions.ts`), `accountant.access_used` (`lib/accountant/load-accountant-portal.ts:84-92`), `accountant.portal_export` (`app/api/portal/exports/generate/route.ts`) |
| Kontrahenci | `contractor.updated`, `contractor.deleted` (`app/actions/contractors.ts`) |
| Agent FLO (niewdrożony) | `flo.proposal.executed`, `flo.proposal.failed`, `flo.proposal.undone` (`lib/flo/execute.ts`, `lib/flo/tick.ts`, `lib/flo/undo.ts`) |

**Akcje zadeklarowane bez żadnego wystąpienia (19 z 90):**
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
(`app/admin/users/actions.ts:97-129`). Dla prywatności istotna jest para
`gdpr.deletion_executed`/`gdpr.deletion_failed` (L1).

### 2.3. Luki w śladzie audytowym

| # | Luka | Dowód | Znaczenie |
|---|---|---|---|
| L1 | Wykonanie usunięcia konta (RODO) nie trafia do `audit_logs`; stan zapisuje tylko `gdpr_deletion_requests.status/executed_at` | `lib/gdpr/deletion.ts:196-207` (zmiana statusu); brak `logAudit*` w `lib/gdpr/` (`grep -n "logAudit\|audit" lib/gdpr/*.ts` — tylko odczyt i RPC anonimizacji) i w `lib/jobs/runners/gdpr-process-deletions.ts` | dowód realizacji żądania z art. 17 [NZ] zależy od wiersza w tabeli żądań; audyt ma tylko „zażądano” i „anulowano” |
| L2 | Retencja 12 miesięcy dla wszystkich wpisów, także finansowych i KSeF | `00052:53-86`, `cleanup-audit-logs.ts:19` | sprzeczne z komentarzem `00001:174`, z ADR 0006 (`:14`) i z przyjętą polityką [PR225] (`data-policy.md:61-62`); po roku znika ślad wysyłek do KSeF, zmian płatności oraz stan idempotencji powiadomień (§ 2.1) |
| L3 | Anonimizacja zastępuje całe `metadata` wpisów osoby | `00052:105-115` | wpisy o wysyłce faktur tracą numer, status i kod błędu; do decyzji, czy to zamierzone (art. 17 ust. 3 lit. b i e [NZ]) |
| L4 | Odczyty danych przez operatora nie są logowane | `git grep -l logAudit -- 'app/admin/**/page.tsx'` — pusto; widoki `/admin/users/[userId]`, `/admin/support`, `/admin/audit` czytają dane klientów kluczem `service_role` | brak śladu, kto i kiedy przeglądał dane osoby lub rozmowy wsparcia; sprzeczne z deklaracją `rodo/page.tsx:39-40` |
| L5 | Akcje operatora zapisywane helperem „systemowym” | `app/admin/users/actions.ts:6,49,80,199`, `app/admin/ksef/actions.ts:8,170,201,346` używają `logAuditSystem` → `ip_address: null`, `user_agent: 'inngest-job'` (`log-system.ts:23-24`); tożsamość operatora tylko w `metadata.adminEmail`/`operator` | wpis wygląda jak zdarzenie joba; brak IP i klienta operatora |
| L6 | Utracony zapis audytu nie alarmuje | `log.ts:162-167`, `log-system.ts:27-32` | brak dowodu kompletności śladu |
| L7 | Brak niezmienności poza bazą | wyzwalacz `00052` jest jedyną barierą; według [PR225] brak pełnej kopii bazy poza hostem | przejęcie hosta bazy pozwala zmienić albo usunąć ślad bez wykrycia |
| L8 | `metadata` zawiera adresy e-mail osób trzecich | księgowa: `components/settings/accountant-actions.ts:62-72`, `lib/accountant/load-accountant-portal.ts:84-92` (przy **każdym** wejściu do portalu, `user_id` puste); odbiorca faktury: `components/invoices/actions-detail.ts:522`; operator: `lib/ksef/duplicate-decision-notice.ts:166`, `app/admin/**` (`adminEmail`) | anonimizacja obejmuje tylko wpisy z `user_id` usuwanej osoby (`00052:105-115`), więc te adresy zostają do 12 miesięcy; minimalizacja (art. 5 ust. 1 lit. c [NZ]) — identyfikator dostępu wystarczyłby |
| L9 | Wszyscy członkowie firmy widzą cały dziennik z adresami IP współpracowników | `00008:48-53`; `app/(dashboard)/settings/audit/page.tsx:35-38,98` | rola członka (np. pracownika) nie ogranicza wglądu w IP i e-maile z `metadata`; do decyzji, czy dziennik ma być tylko dla właściciela/administratora |
| L10 **[R4]** | `details_json` poza anonimizacją | `00052:105-115` (czyści `metadata`, nie `details_json`); zapisy do `details_json`: `00131:121-136` (`ksef_send_audit`), `00148:537-545` (`invoice.ksef_duplicate_decided` z wolnym tekstem `note` i aktorem) | niskie–średnie: wolny tekst notatki decyzji i treść błędów (`previous_error`) zostają po usunięciu konta do 12 miesięcy; do decyzji, czy notatka decyzji ma być wolnym tekstem; treść na produkcji nieznana (N-DOW-10) |

Ślad audytowy jako **projekt kontroli** istnieje i jest szeroki. Dowodu
**działania w czasie** (liczba wpisów na produkcji, przebiegi
`cron.cleanup-audit-logs`, brak `write_failed` w logach) nie mamy — brak
dostępu do bazy i logów produkcji.

## 3. CI i zarządzanie zmianami

### 3.1. Kontrole w workflow

| Workflow | Wyzwalacz | Joby (nazwa kontroli) | Co sprawdza |
|---|---|---|---|
| `.github/workflows/ci.yml` | `pull_request`, `push` na `main` (`:3-6`) | `Typecheck + Lint + Unit tests` (`:16-17`), `Next build` (`:54-55`), `RLS isolation (lokalny Supabase)` (`:84-85`), `Test-first (agent)` (`:109-111`, tylko PR), `Offline security inventory` (`:152-153`), `dependency-review` (`:173`, tylko PR) | `pnpm audit --prod`, `pnpm run ci` (= typecheck, eslint, 3 testy tsx, cały Vitest — `package.json:12`), testy skryptów bramek; build Next; migracje + `test:rls` na lokalnym Supabase; dla PR agenta: nowe testy muszą padać na bazie; inwentarz offline; przegląd zależności |
| `.github/workflows/security.yml` | `pull_request`, `push`, `workflow_dispatch` | `Secret scan` (Gitleaks), `CodeQL (actions)`, `CodeQL (javascript-typescript)` | sekrety w historii, analiza statyczna z bramką high/critical (`docs/security/CI-SECURITY.md:5-28`) |
| `.github/workflows/agent-guard.yml` | `pull_request_target` | `Agent guard` | PR agenta kodu dotykający ścieżek z `.github/CODEOWNERS` wymaga etykiety zgody |
| `.github/workflows/agent.yml` | issue z etykietą | `Agent kodu` | uruchamia agenta (przepływ w `01-STAN-I-GRANICE.md` § 3) |
| `.github/workflows/e2e-staging.yml` | tylko ręcznie (`workflow_dispatch`, `:7`), środowisko `security-staging` (`:28`) | `Playwright E2E` | **0 przebiegów** (GitHub API `actions/workflows/e2e-staging.yml/runs` → `total_count: 0`, odczyt 11.10 i ponownie 13.10.2026 11:17 UTC) |

Brak kontroli CI specyficznych dla prywatności poza testami w Vitest (np.
skanu danych osobowych w fixture'ach, testu treści stron prawnych poza
`tests/unit/rodo-terminy-usuwania.test.ts`, kontroli listy dostawców
w CSP względem polityki). Szablon PR (`.github/pull_request_template.md`,
sekcje `:3-34`: „Co naprawia”, „Zmiana”, „Najpierw test”, „Ponowienie od
zera”, „Weryfikacja”, „Migracje”, „Po wdrożeniu”) nie ma pola „wpływ na
dane osobowe”.

### 3.2. Wymagane kontrole — dokument a stan rzeczywisty

| Źródło | Co mówi |
|---|---|
| `docs/security/GITHUB-WYMAGANE-KONTROLE.md:3-5` | stan 25.09.2026: ruleset aktywny, PR wymagany, 0 akceptacji, 6 wymaganych kontroli, `strict`; plan dopisania 3 kolejnych (`Next build`, `Test-first (agent)`, `Agent guard`) |
| `docs/security/CI-SECURITY.md:41-51` | lista ustawień do wykonania przez właściciela (Dependency graph, wymagane kontrole, środowisko `security-staging`) — dokument nie potwierdza wykonania |
| `AGENTS.md` („Scalanie PR”) | „11 kontroli CI musi być zielonych” |
| **GitHub API, 13.10.2026 11:17 UTC** (`GET /repos/{repo}/rules/branches/main`; ten sam wynik 11.10) | reguły: `deletion`, `non_fast_forward`, `pull_request` z `required_approving_review_count: 0`, `required_status_checks` z **9** kontrolami i `strict: true`: `Typecheck + Lint + Unit tests`, `Offline security inventory`, `dependency-review`, `Secret scan`, `CodeQL (actions)`, `CodeQL (javascript-typescript)`, `Next build`, `Test-first (agent)`, `Agent guard` |
| **GitHub API, 11.10.2026** (check runs head PR #245) | 11 kontroli, wszystkie `success`: 9 wymaganych + `RLS isolation (lokalny Supabase)` + zbiorczy `CodeQL` |
| **GitHub API, 13.10.2026** (`actions/workflows/ci.yml/runs?branch=main`) | 217 przebiegów CI na `main`; ostatni dla `face09c` (10.10.2026 14:50 UTC) — `success` |

Wniosek: dokument z 25.09 jest częściowo nieaktualny (3 kontrole doszły),
a `AGENTS.md` liczy 11 widocznych kontroli, nie 11 wymaganych. **Job
`RLS isolation (lokalny Supabase)` — jedyna kontrola izolacji firm na
prawdziwej bazie — nie jest kontrolą wymaganą.** PR z czerwonym testem RLS
technicznie da się scalić; chroni przed tym tylko zasada z `AGENTS.md`
(„nie scalasz PR z czerwonym CI”).

### 3.3. Historia zmian na `main`

Lokalny klon jest płytki (`git rev-parse --is-shallow-repository` →
`true`, historia od 01.10.2026): `git log --merges --oneline | wc -l`
lokalnie daje 248 (13.10, gałąź robocza) i nie opisuje całości. Pełną
historię odczytano z klonu bez plików (`git clone --bare --filter=tree:0`)
w scratchpadzie; liczby powtórzono 13.10.

| Miara (do `3e5e00d`, pierwszy commit 19.04.2026) | Wartość |
|---|---|
| Commity osiągalne z `main` (`git rev-list --count`) | 1061 |
| Commity scalające (`git rev-list --merges --count`) | 287 |
| Commity na linii pierwszego rodzica `main` (`--first-parent`) | 296 |
| — z tego scalenia PR (wszystkie scalenia na tej linii: 114, każde z tytułem „Merge pull request #N” albo „Merge PR #N”) | 114 |
| — commity bezpośrednie (bez PR) **[R4]** | 180 |
| — PR scalone metodą squash (Dependabot #5 i #6, 14.09.2026, tytuły z „(#N)”; `git log --first-parent --no-merges` w pełnym klonie) **[R4]** | 2 |
| Odsetek zmian `main` przez PR — cała historia **[R4]** | 116/296 = 39,2 % (wcześniej podano 114/296 = 38,5 %, bez PR scalonych metodą squash) |
| Odsetek od 19.09.2026 (ostatni commit bezpośredni: 18.09.2026) | 100 % |
| Pierwsze scalenie PR na linii `main` **[R4]** | 14.09.2026 (squash); pierwszy commit scalający PR: 23.09.2026 |

Recenzje: dla 40 ostatnich PR scalonych do `main` przed `3e5e00d` (numery
187–245) GitHub API (`pulls/{n}/reviews`, odczyt 11.10) nie zwrócił żadnej
recenzji człowieka ani akceptacji (`APPROVED`: 0/40). To zgodne z decyzją
właściciela (ruleset z 0 akceptacji, `GITHUB-WYMAGANE-KONTROLE.md:3`),
ale w zarządzaniu zmianami nie ma niezależnego przeglądu człowieka.
Kompensacją są wymagane kontrole automatyczne, bramka `Agent guard` dla PR
agenta i protokół z `AGENTS.md`.

**Projekt czy działanie:** **[R4]** Od 19.09.2026 każda zmiana `main`
przeszła przez PR (pierwszy commit scalający 23.09; 19–22.09 bez commitów
na linii `main`). Ruleset według `docs/security/GITHUB-WYMAGANE-KONTROLE.md:3`
działał najpóźniej od 25.09 (deklaracja), a obecny zestaw 9 kontroli
powstał po 01.10 (`:5`); daty z historii rulesetu nie odczytano. Okres
obserwacji do `3e5e00d`: ok. 2–3 tygodnie; przed 19.09 większość zmian
szła bezpośrednio. Nie ma dowodu, że wdrożenie produkcji odpowiada
scalonemu commitowi poza pomiarami operatora w [PR225] (wdrożenia są
ręczne, `AGENTS.md`). **[R4]** W repo jest zaprojektowana bramka wdrożeń
`/wdroz` (Telegram), która wdraża tylko HEAD `main` z zielonym CI
i zapisuje aktora i SHA jako `ops.deploy.*` w `audit_logs`
(`ops/bramka/src/deploy.mjs:120-137`, `00100_ops_gate.sql:167-185`,
§ 1.3); czy jest używana — niezweryfikowane (rejestr nie oznacza `00100`
jako wgranej, `docs/koordynacja/CLAUDE-DO-CODEXA.md:43`; `AGENTS.md`
opisuje tylko `tinker`). Wpisy `ops.*` podlegają tej samej
12-miesięcznej retencji (L2).

## 4. Testy istniejące i wynik uruchomienia

**[R4]** Repo ma w `tests/unit/` 486 plików testów (436 `.test.ts`,
50 `.test.tsx`) i 7 plików pomocniczych (493 pliki — `find tests/unit
-type f`); w całym `tests/` 496 plików testów, w tym 446 `.test.ts`
(jak w `01-STAN-I-GRANICE.md` § 3); odczyt `find`, 13.10.2026 (wcześniej
podane „489 plików” było nieodtwarzalne). Testy na bazie: 8 plików
`tests/rls-*.test.ts` z 83 wywołaniami `it(`/`test(`
(`grep -cE '^\s*(it|test)\(' tests/rls-*.test.ts`); z wariantami
`it.each`/`it.skip` itp. 91 (`'^\s*(it|test)(\.[a-zA-Z]+)*\('`), R4
podaje 87 innym wzorcem — liczba przypadków zależy od wzorca. Poza tym
2 inne testy w `tests/` i 10 specyfikacji e2e (`e2e/tests/*.spec.ts`). Do prywatności odnosi się 49 plików
jednostkowych wybranych niżej (po nazwie i importowanych modułach:
`lib/gdpr`, `lib/analytics`, `lib/observability/scrub*`, `lib/retention`,
`lib/audit`, `beforeSend`, `posthog`, `redact`, wypis z maili, tokeny
portalu, dostęp admina), 2 testy RLS na bazie i 1 specyfikacja e2e. Testy
jednostkowe mockują bazę, HTTP i SDK — dowodzą logiki kodu, nie działania
wyzwalaczy, uprawnień ani konfiguracji produkcji (`AGENTS.md`, „Protokół
naprawy błędu”, pkt 2).

### 4.1. Testy jednostkowe związane z prywatnością (uruchomione)

| Plik (`tests/unit/`) | Obszar | Co sprawdza (z nazw przypadków) |
|---|---|---|
| `analytics-privacy.test.ts` | zgoda analityczna | PostHog startuje dopiero po zgodzie i zatrzymuje się po wycofaniu, także w innej karcie; stary opt-in SDK nie zastępuje zgody; niedostępny `localStorage` nie daje zgody; z wysyłanych zdarzeń znikają tekst DOM, właściwości osobowe i pełne URL |
| `analytics-server-privacy.test.ts` | analityka serwerowa | odrzuca dane osobowe i dowolne właściwości (także w `identify`), nazwa zdarzenia nie może nieść danych osobowych, brak analityki nie psuje akcji biznesowej |
| `telemetry-privacy.test.ts` | Sentry (scrubbing) | usuwa payload żądania, nagłówki i dane użytkownika, czyści spany, parametry zapytań, poświadczenia, SQL, e-maile w URL i tekście; nie eksportuje breadcrumbów konsoli/DOM ani automatycznych logów |
| `worker-sentry.test.ts` | Sentry w workerze | worker używa tych samych filtrów co Next (`sendDefaultPii: false`, `lib/observability/scrub.ts:71`); poza produkcją Sentry wyłączony |
| `logi-jobow-bez-danych.test.ts` | logi jobów | logger maskuje NIP i e-mail, także zagnieżdżone |
| `worker-run-log.test.ts` | log przebiegów jobów | zapis błędu bez adresów e-mail, payloadu i identyfikatorów firmy |
| `audit-failure-privacy.test.ts` | ślad audytowy | błąd zapisu audytu nie wypisuje treści wpisu; poprawny zapis trafia do `audit_logs` |
| `security-api-error-boundaries.test.ts` | odpowiedzi API | odpowiedzi HTTP nie ujawniają treści wyjątków (Stripe, Resend) |
| `password-breach-privacy.test.ts` | HIBP | do serwisu idzie tylko 5-znakowy prefiks skrótu; brak cache pochodnych hasła |
| `email-recipient-privacy.test.ts` | e-mail | podmiana odbiorcy tylko w jawnym trybie deweloperskim |
| `email-preferences-failures.test.ts` | preferencje e-mail | maile transakcyjne zachowane, skarga wyłącza każdą kategorię; zmiana preferencji tylko dla zweryfikowanego użytkownika |
| `unsubscribe-access.test.ts` | wypis z maili | odrzuca zmieniony lub wygasły token, zamyka się bez sekretu podpisu, tożsamość i kategoria tylko z podpisu |
| `wypis-potwierdzenie.test.ts` | wypis z maili | GET z linku nie zmienia stanu; POST z formularza i One-Click (RFC 8058) wypisują |
| `maile-sekwencja-wypis.test.ts` | maile próbne | wypis działa w sekwencji próbnej; powitanie po rejestracji pozostaje transakcyjne |
| `email-sequence-membership.test.ts` | maile próbne a firma | po odebraniu członkostwa mail nie czyta faktur ani wydatków dawnej firmy |
| `invoice-email-tenant-boundary.test.ts` | wysyłka PDF e-mailem | PDF tylko z faktury zweryfikowanej organizacji; brak wysyłki dla obcej organizacji |
| `reminder-consent-dialog.test.tsx` | przypomnienia o płatności | wysyłka dopiero po podglądzie i jawnym potwierdzeniu; zmiana odbiorcy unieważnia podgląd |
| `push-endpoint.test.ts` | web push | odrzuca adres spoza usług push i złe klucze; preferencje zapisują tylko pola `notify_*` |
| `gdpr-account-actions.test.tsx` | usunięcie konta | wymaga sesji, hasła i AAL2 przy MFA; zła treść formularza nie anuluje cudzego żądania; komunikat zgodny z faktem wysyłki maila |
| `gdpr-cancel-confirmation.test.tsx` | anulowanie usunięcia | link GET nie zmienia stanu i nie ujawnia e-maila; sfałszowany wynik nie pokazuje sukcesu |
| `gdpr-deletion.test.ts` | żądanie usunięcia | w bazie tylko SHA-256 tokenu; token jednorazowy; współbieżność; blokada przez subskrypcję; dane do UI bez skrótu tokenu i e-maila |
| `gdpr-subscription-blocker.test.ts` | usunięcie konta a firma | jedyny właściciel z płatną subskrypcją blokuje usunięcie z nazwą firmy |
| `gdpr-export-boundary.test.ts` | eksport RODO | tylko zweryfikowane konto, bez faktur firmy i innych osób; raportuje limit wierszy; prywatny plik i audyt zakresu |
| `rodo-eksport-pelny.test.ts` | eksport RODO (AUD-76) | eksport obejmuje dane osoby z każdego miejsca zapisu (lista w teście), bez sekretów i danych innych osób; pokrycie sekcji |
| `rodo-terminy-usuwania.test.ts` | treść stron prawnych | kod (14 dni) i teksty polityki oraz strony RODO mówią o tych samych terminach (`:17-36`) — **jedyny test treści stron prawnych** |
| `rodo-usuniecie-konta-klucze.test.ts` | migracja 00113 | statyczny odczyt SQL: kolumny autora mogą być `NULL`, migracja bez usuwania danych |
| `admin-gdpr-membership-scope.test.ts` | usunięcie konta przez admina | dezaktywuje tylko firmę, której osoba jest aktywnym właścicielem; nie raportuje sukcesu przy błędzie usługi auth |
| `mfa-recovery-cleanup.test.ts` | kody zapasowe MFA | usuwa stare kody tylko uprawnionego użytkownika; nie ujawnia komunikatu bazy |
| `retencja-pliki.test.ts` | retencja faktur (AUD-45) | pliki faktury w MinIO i Glacier usuwane przed wierszem; błąd magazynu zostawia wiersz; klucz spoza katalogu firmy nie jest usuwany |
| `kopie-zapasowe-retencja.test.ts` | retencja snapshotów JSON | stare kopie kasowane, 7 ostatnich dobrych zostaje |
| `kopia-bazy-swiezosc.test.ts` | monitor kopii | brak kopii lub kopia sprzed 2 dni → alarm |
| `stripe-retencja.test.ts` | webhooki Stripe | przetworzone zdarzenia po 90 dniach redukowane do id i typu |
| `flo-privacy.test.ts`, `flo-redact-expense.test.ts` | agent FLO (AI) | minimalizacja przed modelem: usuwa numer konta, PESEL, e-mail, telefon, adres; lista dozwolonych pól promptu |
| `flo-tenant-boundaries.test.ts` | agent FLO | odrzuca obce faktury i wydatki w spreparowanej propozycji |
| `admin-audit-access.test.ts`, `admin-operational-access.test.ts`, `admin-user-metrics-access.test.ts` | dostęp operatora | odczyt między firmami (`service_role`) dopiero po zweryfikowanej tożsamości admina z MFA; usunięcie z listy odbiera dostęp |
| `admin-session-revocation-status.test.ts` | akcje admina | odmowa wymuszonego wylogowania bez wpisu sukcesu; nieudana blokada nie raportuje sukcesu |
| `logout-boundary.test.ts` | wylogowanie | czyści tylko bieżącą sesję i dokładne nazwy cookies; nie przypisuje tożsamości z cookie bez weryfikacji |
| `accountant-document-isolation.test.ts`, `portal-ksiegowej-lista.test.tsx` | portal księgowej (token) | cudzy klucz pliku odrzucony mimo autoryzowanego wiersza; metadane XML związane z firmą; zakaz cache |
| `storage-tenant-boundaries.test.ts`, `invoice-pdf-storage-isolation.test.ts` | pliki w MinIO | wiersz bazy nie autoryzuje obiektu innej firmy; zdjęcia wydatków prywatne i `no-store`; cache PDF z cudzą ścieżką regenerowany |
| `tenant-export-reminder-offline-boundaries.test.ts` | eksporty księgowe | granice firm dla eksportów JPK, fail-closed przy nieznanym środowisku |
| `support-chat-firma.test.ts` | czat wsparcia | rozmowa przypięta do firmy tylko przy aktywnym członkostwie |
| `rls-environment.test.ts`, `ci-rls.test.ts` | konfiguracja testów RLS | testy RLS tylko na lokalnej bazie; CI ma job RLS |
| `backup-readable-tables.test.ts` | kopia JSON | `service_role` czyta każdą tabelę `public` poza listą pominięć |
| **[R4]** `service-worker-cache.test.ts` | magazyn przeglądarki (PWA) | „service worker: cache never crosses account boundaries” — dane w pamięci podręcznej service workera nie przechodzą między kontami. Uruchomiony przez redaktora poprawek (przebieg 3, § 4.2), poza listą 49 plików |
| **[R4]** `reminder-dispatch.test.ts` | przypomnienia o płatności | „reminder consent registry with the real helper” — wysyłka przypomnień przez rejestr zgód z prawdziwym helperem; adres kontrahenta na liście odbić (AUD-80). Uruchomiony w przebiegu 3, poza listą 49 plików |
| **[R4]** `ops/poczta/worker.test.mjs` (poza `tests/unit/`, poza Vitest — `node --test`) | przyjęcie poczty pomocy, w tym żądań RODO | „powiadomienie nie zawiera nadawcy, tematu ani treści”, „kategorie i pilność z tematu”; 6/6 PASS w przebiegu R4 i redaktora 13.10.2026; w CI w kontroli „Typecheck + Lint + Unit tests” (`.github/workflows/ci.yml:49-50`) |

### 4.2. Wynik uruchomienia (dowód)

| | Przebieg 1 | Przebieg 2 (bieżący) |
|---|---|---|
| Komenda | `pnpm exec vitest run <39 plików> --reporter=dot` | `pnpm exec vitest run <49 plików z § 4.1> --reporter=dot` |
| Lista plików | scratchpad sesji, `a3-lista-testow.txt` | scratchpad sesji, `a3-lista-testow-v2.txt` (39 + 10 dopisanych: wypis, sekwencje maili, PDF e-mailem, FLO granice, push, kody MFA, sesje admina, wylogowanie, świeżość kopii) |
| Kiedy | 11.10.2026, start 14:56:43 UTC | 13.10.2026, polecenie 11:14:22–11:15:06 UTC (start Vitest 11:14:30) |
| Środowisko | kontener sesji, Node v22.22.0, Vitest 4.1.11, `vitest.config.ts`, bez `.env` | jw. |
| Kod | `3e5e00d` (zmiany tylko w `docs/audyt/`) | jw. |
| Wynik | **39/39 plików, 540/540 testów PASS; FAIL 0; SKIP 0** | **49/49 plików, 638/638 testów PASS; FAIL 0; SKIP 0** (w wyjściu brak „skipped” i „todo”) |
| Czas | 17,03 s | 35,81 s (transform 4,81 s, import 18,82 s, testy 4,85 s) |
| Kod wyjścia | 0 | 0 |
| Uwagi | 2 oczekiwane komunikaty `[flo/llm] wyjście odrzucone` (przypadek odrzucenia placeholdera w `flo-privacy`) | jw.; wyjście bez danych osobowych |

**[R4]** Powtórzenie i uzupełnienie: R4 powtórzył przebieg 2 tą samą
komendą i listą (13.10.2026, start Vitest 11:32:39 UTC) — 49/49 plików,
638/638 testów, kod 0. Przebieg 3 (redaktor poprawek, 13.10.2026, start
Vitest 11:57:40 UTC, to samo środowisko): `pnpm exec vitest run
tests/unit/service-worker-cache.test.ts tests/unit/reminder-dispatch.test.ts
--reporter=dot` — **2/2 pliki, 122/122 testy PASS**, kod 0; `node --test
ops/poczta/worker.test.mjs` — **6/6 PASS**, 0 skipped.

Wynik dowodzi, że **logika kodu** na `3e5e00d` spełnia asercje tych
testów. Nie dowodzi działania na produkcji (ustawienia paneli PostHog
i Sentry, przebiegi cronów, wyzwalacze bazy) ani kompletności asercji
(np. `rodo-eksport-pelny` sprawdza listę miejsc zapisaną w teście, a nie
listę tabel ze schematu — § 5, T-01).

### 4.3. Testy na bazie (RLS) — nieuruchomione lokalnie, dowód z CI

| Plik | Związek z prywatnością | Dowód działania |
|---|---|---|
| `tests/rls-isolation.test.ts` (8 przypadków) | izolacja firm: faktury, sfałszowany nagłówek aktywnej firmy, duplikat NIP, odebrane członkostwo, zaproszenie obcym kontem, dowody wpłat | job CI `RLS isolation (lokalny Supabase)` — `success` dla `3e5e00d` (push na `main`, zakończony 2026-10-08T15:00:42Z) i dla head PR #245 (GitHub API, odczyt 11.10.2026) |
| `tests/rls-uprawnienia.test.ts` (8) | członek nie czyta zaszyfrowanych danych KSeF; usunięcie konta zeruje autora wydatku, OCR i dostępu księgowej (00113); blokady usunięcia tylko dla serwisu | jw. |
| pozostałe 6 (`rls-cykl-faktury`, `rls-cykl-wyzwalacze`, `rls-dane-specjalne` — „dane specjalne” to kształt danych korekt i ROZ, nie art. 9 RODO —, `rls-decyzja-duplikatu`, `rls-kolejkowanie-wysylki`, `rls-korekta-jedna-otwarta`) | integralność przetwarzania KSeF (SOC 2 PI), nie prywatność | jw. |

Testy RLS dotykają tabel (zliczenie `from('…')` w `tests/rls-*.test.ts`,
13.10): `invoices`, `tenants`, `memberships`, `ksef_submissions`,
`payments`, `audit_logs`, `payment_reminders`, `users`, `payment_imports`,
`expenses`, `organization_join_requests`, `ocr_jobs`, `accountant_access`,
`upo_receipts`, `organization_invitations`, `ksef_error_codes`. **Nie
dotykają** tabel z danymi osobowymi: `contractors`, `invoice_line_items`,
`support_conversations`, `support_messages`, `email_preferences`,
`email_bounces`, `push_subscriptions`, `newsletter_subscribers`,
`gdpr_deletion_requests`, `mfa_recovery_codes`, `admin_user_notes`,
`export_files`, `export_jobs`, `import_jobs`. Job RLS nie jest kontrolą
wymaganą (§ 3.2).

### 4.4. E2E — nieuruchamiane

10 specyfikacji Playwright; jedyny przypadek związany z prywatnością to
`e2e/tests/05-landing.spec.ts:53-57` („legal pages dostępne z footera” —
sprawdza nawigację do `/legal/regulamin`, nie treść). Workflow
`e2e-staging.yml` nie miał żadnego przebiegu (§ 3.1), staging nie istnieje
([PR225], F0-G03 FAIL). Brak dowodu działania e2e w czasie. Cookies
i żądania sieciowe przed zgodą i po jej wycofaniu zbadał jednorazowo agent
RUNTIME (`A4-TEST-COOKIES-I-SIECI.md`, `narzedzia/test-cookies-i-sieci.mjs`)
— poza zestawem testów repo i poza CI.

## 5. Testy brakujące (propozycje)

Zasada z `AGENTS.md` („Protokół naprawy błędu”, pkt 2): wyzwalacze, RPC,
uprawnienia i przejścia statusów testuje się na bazie (`tests/rls-*.test.ts`,
job „RLS isolation”), nie w pamięci. Kolumna „Przed naprawą” to
przewidywanie na podstawie kodu `3e5e00d` (testów nie napisano ani nie
uruchomiono — ten etap nie zmienia repo). „Zależy od decyzji” znaczy, że
oczekiwany wynik wymaga rozstrzygnięcia właściciela albo review prawnego.

| ID | Proponowany plik | Asercja | Typ | Przed naprawą | Powiązanie |
|---|---|---|---|---|---|
| T-01 | `tests/unit/rodo-eksport-schemat.test.ts` | każda tabela z migracji, która ma kolumnę wskazującą osobę (`user_id`, `*_by_user_id`, `invited_by`, `email`, `accountant_email`, `buyer_pesel`…), jest w `lib/gdpr/data-collector.ts` albo na jawnej liście wyłączeń z uzasadnieniem; nowa migracja z taką kolumną bez wpisu = czerwony | jednostkowy (statyczny odczyt migracji) | nieznane — dziś pokrycie sprawdza lista zapisana w teście (`rodo-eksport-pelny.test.ts:90-120`) | eksport RODO; `A2-…` |
| T-02 | `tests/rls-rodo-eksport.test.ts` | na lokalnej bazie: osoba A w dwóch firmach i osoba B; eksport A zawiera wiersze A z każdej sekcji, zero wierszy B, zero skrótów tokenów i zaszyfrowanych danych KSeF; przekroczenie limitu raportowane | RLS na bazie | nieznane | eksport RODO |
| T-03 | `tests/rls-rodo-usuniecie-konta.test.ts` | po `executeGdprRequest`: brak użytkownika w `auth.users`; zero wierszy z jego `user_id` w tabelach osobowych (członkostwa, preferencje, push, kody MFA, rozmowy wsparcia…); wpisy `audit_logs` zanonimizowane; **[R4]** po anonimizacji wpisy osoby nie zawierają wolnego tekstu w `details_json` (albo udokumentowany wyjątek — L10); faktury zostają; status `executed`; **istnieje wpis audytu `gdpr.deletion_executed`** | RLS na bazie + runner | **czerwony** w części audytu (L1: brak zapisu) i `details_json` (L10) **[R4]** | usunięcie konta; DOW-06 |
| T-04 | `tests/rls-usuniecie-organizacji.test.ts` | firma z `hard_delete_at` w przeszłości: po przebiegu joba retencji dane firmy usunięte (poza fakturami w okresie obowiązkowej retencji), pliki firmy usunięte, wpis audytu | RLS na bazie + runner | **czerwony**: `hard_delete_at` ustawiają tylko `app/admin/users/actions.ts:173` i `components/settings/account-actions.ts:62`; żaden job go nie czyta (`git grep hard_delete_at -- lib` — 0) | usunięcie organizacji; DOW-17 |
| T-05 | `tests/rls-retencja-faktur-wyzwalacz.test.ts` | runner `retention-delete` dla faktury wysłanej do KSeF po okresie retencji kończy się zgodnie z przyjętą regułą (usunięcie albo jawny hold z komunikatem i ścieżką operatora) — nie cichym błędem | RLS na bazie | **czerwony** wg R1: `b_guard_invoice_pending_content` (`00132…sql:63-73`) blokuje `DELETE` także dla `service_role` | retencja; zależy od decyzji |
| T-06 | `tests/unit/rodo-usuniecie-pliki.test.ts` | przy usunięciu konta i organizacji obiekty pod prefiksem firmy w MinIO (zdjęcia wydatków, pliki OCR, eksporty, cache PDF, XML/UPO poza retencją) są usuwane albo zachowane według reguły; magazyn S3 w pamięci; asercja na liście obiektów po przebiegu | jednostkowy (opcjonalnie integracyjny z kontenerem MinIO w CI) | **czerwony**: `lib/gdpr/*` nie odwołuje się do magazynu (`git grep -n "r2\|storage" -- lib/gdpr` — 0) | pliki MinIO; DOW-17 |
| T-07 | `tests/rls-retencja-audytu.test.ts` | `cleanup_old_audit_logs` usuwa wpisy dostępu/admin po przyjętym okresie, a zachowuje akcje finansowe i KSeF zgodnie z polityką; bez `app.allow_audit_purge` `DELETE` i `UPDATE` odrzucone także dla `service_role` | RLS na bazie | **czerwony** dla części finansowej (L2); zależy od decyzji | retencja; DOW-07 |
| T-08 | `tests/unit/retencja-rejestr.test.ts` | każda tabela z danymi osobowymi (lista z `02-INWENTARZ-I-PRZEPLYWY.md`) ma w kodzie wpis rejestru retencji: okres, zdarzenie początkowe, job wykonawczy albo „bez limitu” z podstawą | jednostkowy (statyczny) | **czerwony** — rejestru retencji w kodzie nie ma | retencja |
| T-09 | `e2e/tests/08-zgoda-analityczna.spec.ts` | strony publiczne: przed zgodą zero żądań do hostów PostHog i brak kluczy `ph_*` w cookies i `localStorage`; po zgodzie żądania tylko do hosta EU; po wycofaniu brak nowych żądań i usunięte klucze; to samo po przeładowaniu i w drugiej karcie | e2e (bez backendu; port `narzedzia/test-cookies-i-sieci.mjs` z `A4-…`) | do ustalenia po wynikach `A4-…` | zgoda i wycofanie |
| T-10 | `tests/unit/posthog-konfiguracja.test.ts` | kontrakt konfiguracji SDK: `disable_session_recording: true`, `autocapture: false`, `capture_heatmaps: false`, przypięta wersja SDK; test **nie** uznaje `ip: false` za środek minimalizacji (opcja bez działania w SDK 1.374.3 — ustalenie R2) | jednostkowy + osobny skrypt `scripts/ops/` porównujący ustawienia projektu PostHog (replay, heatmapy) z kodem | zielony dla flag kodu; skrypt wykryłby rozjazd panelu ([PR225]: replay ON) | zgoda; `A1-…` |
| T-11 | `tests/unit/analityka-serwer-odmowa.test.ts` | zdarzenia serwerowe nie są wysyłane dla osoby, która odmówiła albo wycofała zgodę (o ile przyjęta podstawa tego wymaga) | jednostkowy | zależy od decyzji (`A1-…`: zdarzenia serwerowe w modelu uzasadnionego interesu) | zgoda; LIA |
| T-12 | `tests/unit/telemetria-kanarek.test.ts` | reprezentatywna trasa, akcja serwera i job kończą się błędem z kanarkami (e-mail, NIP, PESEL, IBAN, treść faktury); przechwycone `console.*`, logger i transport testowy Sentry nie zawierają żadnego kanarka | jednostkowy/integracyjny | nieznane; odpowiada TEST-04 z [PR225] (NOT RUN) | scrubbing PII |
| T-13 | `tests/unit/logi-bez-pii-statyczny.test.ts` | skan źródeł: brak wywołań `console.log`, `console.warn`, `console.error` z interpolacją zmiennych `*email*`, `*nip*`, `*pesel*` poza loggerem maskującym; wyjątki na liście z uzasadnieniem | jednostkowy (statyczny) albo reguła ESLint | nieznane | scrubbing PII |
| T-14 | `tests/rls-dane-osobowe-izolacja.test.ts` | dla 14 tabel z § 4.3 bez pokrycia: członek firmy A nie czyta, nie zmienia i nie usuwa wierszy firmy B ani innej osoby; `anon` nie dostaje nic | RLS na bazie | nieznane | RLS; DOW-15 |
| T-15 | `tests/rls-pokrycie-tabel.test.ts` | zapytanie do katalogu: każda tabela `public` ma RLS i co najmniej jedną politykę; `anon` nie ma uprawnień do tabel z danymi osobowymi; funkcje `SECURITY DEFINER` mają przypięte `search_path` — automatyczna wersja odczytów z 08.09 (`docs/security/audyt/wynik-01…04`) | RLS na bazie | nieznane | RLS |
| T-16 | `tests/unit/admin-odczyt-audyt.test.ts` | wejście operatora na `/admin/users/[userId]`, `/admin/support` (**[R4]** jedyna strona wsparcia, `app/admin/support/page.tsx`) i `/admin/audit` zapisuje wpis (operator, osoba, zakres, IP, UA) | jednostkowy | **czerwony** (L4) | dostęp admina; DOW-08 |
| T-17 | `tests/unit/admin-akcje-tozsamosc.test.ts` | akcje z `app/admin/**` zapisują `user_id` operatora, IP i UA, nie `user_agent: 'inngest-job'` | jednostkowy | **czerwony** (L5) | dostęp admina; DOW-08 |
| T-18 | `tests/unit/audyt-zapis-alarm.test.ts` | nieudany zapis audytu zwiększa licznik albo wysyła alarm bez treści wpisu | jednostkowy | **czerwony** (L6) | ślad audytowy |
| T-19 | `tests/unit/audyt-metadata-minimalizacja.test.ts` | wpisy `accountant.*`, `invoice.emailed`, akcje operatora nie zapisują jawnego e-maila osoby trzeciej (identyfikator dostępu albo skrót z kluczem) | jednostkowy | **czerwony** (L8); zależy od decyzji | minimalizacja |
| T-20 | `tests/unit/strony-prawne-tresc.test.ts` | renderowany tekst stron prawnych: brak placeholderów (`[nazwa firmy]`, `[TWÓJ_NIP]`); brak dostawców nieobecnych w kodzie (Vercel, Inngest, Supabase Cloud, Cloudflare R2); każdy aktywny odbiorca z rejestru w kodzie wymieniony; lokalizacja zgodna z infrastrukturą; okresy (audyt 12 mies. z `cleanup-audit-logs.ts:19`, 14 dni z `lib/gdpr`) równe stałym; deklaracje `rodo/page.tsx` („kto uzyskał dostęp”, „brak cookies analitycznych”, „SCC z każdym”) dopuszczone tylko przy fladze potwierdzenia | jednostkowy | **czerwony** (§ 1.1) | strony prawne; DOW-02 |
| T-21 | `tests/unit/strony-prawne-wersja.test.ts` | skrót treści stron prawnych przypięty do wpisu wersji; zmiana treści bez nowej daty „Ostatnia aktualizacja” i wpisu w historii wersji = czerwony | jednostkowy | nie dotyczy przed wprowadzeniem wersjonowania | strony prawne; `A1-…` (wersjonowanie treści) |

Kontrola procesu (I): dopisać `RLS isolation (lokalny Supabase)` do
wymaganych kontroli rulesetu (DOW-12) — bez tego testy T-02…T-07, T-14
i T-15 nie blokują scalenia.

## 6. Potrzeba DPIA / LIA / TIA

W repo **nie znaleziono** żadnej DPIA, wstępnej oceny potrzeby DPIA, LIA
ani TIA (`git grep -E "DPIA|ocen[ay] skutk"` poza plikami audytu — jedno
trafienie: zadanie w `PLAN-ODPORNOSCI-CYBER.md:113`). Poniżej propozycja
oceny na faktach z kodu. To materiał roboczy dla review prawnego, nie
rozstrzygnięcie. Podstawy: art. 35 ust. 1, 3, 4 RODO; WP248 rev.01
(kryteria, zwykle „co najmniej dwa → DPIA”); komunikat Prezesa UODO
z wykazem operacji wymagających DPIA (ZR-20 w `03-REJESTR-ZRODEL.md`,
oznaczenie M.P. do potwierdzenia); art. 6 ust. 1 lit. f i motyw 47
(LIA); art. 44–46, wyrok C-311/18, zalecenia EROD 01/2020 (TIA) — wszystko
[NZ].

### 6.1. DPIA — wstępna ocena (screening)

Role: dla danych klientów i ich kontrahentów FaktFlow działa co do zasady
jako procesor (`02-…`), więc obowiązek DPIA ciąży na kliencie
(administratorze), a FaktFlow ma mu pomóc (art. 28 ust. 3 lit. f [NZ]).
Dla danych kont, wsparcia i telemetrii FaktFlow jest administratorem.

| Kryterium WP248 | Fakty z kodu | Ocena | Rola FF |
|---|---|---|---|
| 1. Ocena lub scoring | ocena terminowości płatności kontrahenta (`payment.score`) zbudowana, ale zablokowana z powodów prawnych (`lib/flo/flags.ts:39-47`); moduł FLO bez importera w kodzie produkcyjnym (`lib/flo/functions/payment-score.ts:1-3`, AUD-115) | **dziś nie**; **tak** po włączeniu (ocena zachowania osób prowadzących JDG) | do ustalenia (`02-…`, pytanie o FLO) |
| 2. Decyzje zautomatyzowane o skutkach prawnych | wysyłka do KSeF i przypomnienia wymagają działania użytkownika (`reminder-consent-dialog.test.tsx`, `flo-no-auto-send.test.ts`) | nie | — |
| 3. Systematyczne monitorowanie | analityka po zgodzie; audyt z IP i UA dla bezpieczeństwa | nie w rozumieniu WP248 (brak monitorowania miejsc publicznych i profilowania zachowań) | FF-A |
| 4. Dane wrażliwe lub o charakterze wysoce osobistym | dane finansowe: faktury, płatności, wyciągi (`payment_imports`, `00014_payments_and_reminders.sql:95`); PESEL nabywcy B2C (`invoices.buyer_pesel`, `00012_invoice_types_extension.sql:67,160-161`); zdjęcia paragonów do OCR, które mogą ujawniać dane o zdrowiu (`03-…`, art. 9) | **spełnione** (WP248 podaje dane finansowe jako przykład danych wysoce osobistych) | FF-P (dane klientów) |
| 5. Duża skala | brak klientów (deklaracja w [PR225]); docelowo wiele firm × ich kontrahenci | **nieznane** | FF-P |
| 6. Łączenie zbiorów | pobieranie faktur zakupowych z KSeF; rejestry GUS, VIES, biała lista MF z pamięcią wspólną dla firm (`validation_cache`, `00022_validation_infrastructure.sql:26`); importy płatności i faktur | **prawdopodobnie spełnione** (do interpretacji: łączenie w ramach jednego celu klienta) | FF-P, częściowo FF-A (wspólna pamięć) |
| 7. Osoby szczególnie wrażliwe | usługa B2B; konsumenci tylko jako nabywcy faktur B2C | nie | — |
| 8. Innowacyjne technologie | modele językowe dostawcy z US: OCR (`lib/ocr/engine.ts:11`), kategoryzacja (`lib/anthropic/client.ts:9`), czat wsparcia (`lib/support/chat.ts:13`); agent FLO (niewdrożony) | **spełnione** (interpretacja O) | FF-P (OCR, kategoryzacja), FF-A (czat wsparcia) |
| 9. Uniemożliwienie skorzystania z prawa lub usługi | brak | nie | — |

**Propozycja (do review prawnego):** dla operacji na danych klientów
spełnione są co najmniej dwa kryteria (4 i 8, prawdopodobnie 6), więc:
(a) przygotować dla klientów pakiet materiałów do ich DPIA (opis
przetwarzania, odbiorcy, transfery, środki — `09-MATERIALY-ROBOCZE.md`);
(b) przeprowadzić dobrowolną DPIA FaktFlow dla funkcji z modelami
językowymi (OCR, kategoryzacja, czat wsparcia), bo to FaktFlow wybiera
dostawcę i zakres danych, a klient-mikroprzedsiębiorca realnie jej nie
wykona; (c) DPIA jako warunek włączenia `payment.score` i agenta FLO;
(d) udokumentować screening także dla operacji FF-A z wynikiem
negatywnym (rozliczalność, art. 5 ust. 2 [NZ]). Wykazu UODO nie odczytano
(egress zablokowany); według wiedzy modelu obejmuje m.in. ocenę lub
scoring sytuacji ekonomicznej osób oraz przetwarzanie z użyciem
innowacyjnych rozwiązań technologicznych — [NZ], do potwierdzenia
brzmienia punktów.

### 6.2. LIA — dla których celów

LIA dotyczy celów, w których FaktFlow jako administrator opiera się na
art. 6 ust. 1 lit. f. Dla danych przetwarzanych na polecenie klienta
podstawę wybiera klient.

| Cel (FF-A) | Fakty z kodu | Dlaczego LIA | Stan |
|---|---|---|---|
| Bezpieczeństwo kont i zapobieganie nadużyciom | IP i UA w audycie (`lib/audit/log.ts:146-160`), retencja 12 mies. (§ 2.1); limity zapytań per IP i NIP (`lib/cache/keys.ts:12,33`); HIBP (`lib/auth/breach-check.ts`); Turnstile; polityka wskazuje lit. f (`polityka-prywatnosci/page.tsx:58-72`) | okres przechowywania IP, widoczność IP dla wszystkich członków firmy (L9) | brak LIA |
| Analityka serwerowa bez zgody | `lib/analytics/server.ts:14-28` (stały identyfikator); polityka zapowiada uzasadniony interes (`:243-246`) | stały identyfikator wiązany z kontem; brak sprzeciwu w kodzie (`A1-…`) | brak LIA |
| Diagnostyka błędów (Sentry) | filtr `lib/observability/scrub.ts` (`sendDefaultPii: false`, `:71`); retencja wg [PR225] 30 dni | resztkowe dane w błędach, odbiorca spoza UE w łańcuchu | brak LIA |
| Eskalacja rozmów wsparcia do zespołu | `app/api/support/chat/route.ts:176-178`, `lib/support/support-actions.ts:26` (Slack) | treść rozmowy u dostawcy komunikatora (`04-…`, PRC-12) | brak LIA |
| Wspólna pamięć danych z rejestrów publicznych | `validation_cache` (`00022:26`) | dane JDG z rejestrów współdzielone między firmami (`A1-…`) | brak LIA |
| Maile w okresie próbnym i newsletter | sekwencja próbna z wypisem (`maile-sekwencja-wypis.test.ts`), tabela `newsletter_subscribers` | marketing bezpośredni (motyw 47 [NZ]); osobno zgoda na komunikację elektroniczną wg Prawa komunikacji elektronicznej [NZ] | brak LIA; podstawa do review |
| Rejestrowanie wejść księgowej do portalu | e-mail księgowej w `metadata` przy każdym wejściu (L8) | osoba bez konta, brak informacji i eksportu | brak LIA |

### 6.3. TIA — dla których dostawców

Szczegółowa tabela mechanizmów transferu jest w
`04-PROCESORZY-I-LOKALIZACJE.md` § 4.2. Tu: powiązanie z kodem i stan
dowodów. Żadnej TIA ani umowy z klauzulami SCC nie ma w repo.

| Dostawca | Przepływ w kodzie | Potrzeba TIA (wg `04-…`) | Dowód w repo |
|---|---|---|---|
| Anthropic | OCR, kategoryzacja, czat wsparcia (`lib/ocr/engine.ts:11`, `lib/support/chat.ts:13`); agent kodu na treści issue (`.github/workflows/agent.yml:51`) | **wymagana** (SCC) | brak |
| Resend | wszystkie maile (`lib/email/send.ts:62-76`) | **wymagana** przy SCC (polityka deklaruje SCC) | brak |
| PostHog, Sentry | analityka po zgodzie i analityka serwerowa; błędy | intake EU według [PR225]; spółki z US w łańcuchu — uproszczona przy potwierdzonym DPF | brak |
| Stripe, Cloudflare (Turnstile, poczta), Google (OAuth, czcionki `app/layout.tsx:114-124`), AWS (archiwum, jeśli aktywne) | płatności; weryfikacja botów; logowanie; archiwum | zależna od mechanizmu | brak |
| Slack | alerty i eskalacje (`lib/alerts/slack.ts:17-23`) | jeśli zostaną dane osobowe | brak |
| Telegram | alerty (`lib/alerts/telegram.ts:16`) | brak mechanizmu transferu — **nie wysyłać danych osobowych** (`04-…`) | brak |

Sam „region UE” intake'u nie zamyka oceny: dostęp zdalny spółek
z państw trzecich, dalsi procesorzy i wsparcie dostawcy wymagają osobnej
weryfikacji (pkt 5.F zadania).

## 7. Ustalenia DOW-NN

Przegląd zbiorczy (szczegóły niżej):

**[R4]** Ryzyko oceniam dla osób, których dane dotyczą, i dla usługi;
`06-SOC2.md` ocenia dodatkowo gotowość do badania — przy rozbieżności
podaję oba poziomy. Po recenzji R4 poziomy ujednolicono z `06` § 8:
DOW-05 = SOC-07/SOC-09 (wysokie), DOW-08 = SOC-11 (wysokie), DOW-22 =
SOC-21/SOC-22 (wysokie); DOW-13 zostaje „średnie” dla usługi, „wysokie”
dla gotowości do badania (SOC-01).

| ID | Ustalenie (skrót) | Stan | Ryzyko | Klasa |
|---|---|---|---|---|
| DOW-01 | Brak rejestrów czynności (administrator i procesor) | brak (nie znaleziono) | wysokie | P |
| DOW-02 | Strony prawne niezgodne z kodem; placeholder administratora; jeden test treści | częściowe | wysokie | P |
| DOW-03 | Procedura naruszeń tylko we fragmentach nieaktualnych runbooków; brak rejestru naruszeń i post-mortem | częściowe | wysokie | P, S |
| DOW-04 | Brak procedury i ewidencji żądań poza samoobsługą posiadacza konta (kanał przyjęcia e-mailem z alarmem istnieje — **[R4]**) | częściowe | średnie | P |
| DOW-05 | Brak zapisów przeglądów dostępów; wspólne konto dostawcy bez MFA | brak | **wysokie** **[R4]** (było: średnie; jak SOC-07, SOC-09) | S, P |
| DOW-06 | Wykonanie usunięcia konta poza `audit_logs` | brak | średnie | P, S |
| DOW-07 | Jednolita retencja audytu 12 mies.; audyt jako stan biznesowy | częściowe | średnie | P, S |
| DOW-08 | Odczyty operatora nielogowane; akcje operatora jako „system” | brak | wysokie | S, P |
| DOW-09 | Adresy e-mail osób trzecich i IP widoczne w dzienniku firmy | częściowe | niskie–średnie | P |
| DOW-10 | Niezmienność audytu tylko wyzwalaczem z obejściem | częściowe | średnie | S |
| DOW-11 | Utrata wpisu audytu bez alarmu | brak | niskie–średnie | S, I |
| DOW-12 | Test RLS na bazie nie jest kontrolą wymaganą; dokumenty kontroli nieaktualne | częściowe | średnie | S |
| DOW-13 | Brak niezależnego przeglądu człowieka; krótki okres dowodów zarządzania zmianami | częściowe | średnie; dla gotowości do badania — wysokie (SOC-01) **[R4]** | S |
| DOW-14 | E2E nigdy nie uruchomione; brak automatycznego testu zgody i cookies | brak | średnie | S, I |
| DOW-15 | Testy RLS nie obejmują 14 tabel z danymi osobowymi | częściowe | średnie | I, S |
| DOW-16 | 49 plików testów prywatności zielonych (638/638) — dowód logiki, nie produkcji | potwierdzone (projekt) | — | I |
| DOW-17 | Usunięcie organizacji i plików bez wykonawcy i bez testów | brak | wysokie | P |
| DOW-18 | ADR 0006 deklaruje anonimizację w Stripe — brak w kodzie | brak | średnie | P |
| DOW-19 | Publiczny plik audytu z adresem hosta i ścieżką klucza | potwierdzone (luka) | średnie | I, S |
| DOW-20 | Brak DPIA (screening), LIA i TIA | brak | wysokie | P, O |
| DOW-21 | Brak raportów i certyfikatów; brak zebranych raportów dostawców | brak (nie znaleziono) | niskie | S |
| DOW-22 | Odtwarzanie: jedna deklarowana próba (sama baza), brak kopii poza hostem | częściowe | **wysokie** **[R4]** (było: średnie; jak SOC-21, SOC-22) | P, S |
| DOW-23 **[R4]** | Brak upoważnień do przetwarzania, zobowiązań do poufności i szkoleń osób z dostępem | brak (nie znaleziono) | średnie | P, S |

### DOW-01 — Brak rejestrów czynności przetwarzania

- **Klasa:** P (art. 30 ust. 1 i 2 [NZ]).
- **Stan:** brak (nie znaleziono w repo).
- **Dowód:** wyszukiwanie § 1.2; jedyne trafienie to zadanie
  w `docs/security/PLAN-ODPORNOSCI-CYBER.md:113`.
- **Luka:** FaktFlow jest administratorem (konta, wsparcie, telemetria)
  i procesorem (dane kontrahentów klientów), więc potrzebne są oba rejestry.
  Zwolnienie z art. 30 ust. 5 nie obejmuje przetwarzania, które nie ma
  charakteru sporadycznego [NZ].
- **Ryzyko:** wysokie — rejestr jest podstawą umowy powierzenia, DPIA, LIA,
  TIA i polityki; jego brak wykaże każda kontrola organu.
- **Rekomendacja:** przyjąć szkic z `09-MATERIALY-ROBOCZE.md` (cele
  i podstawy z `A1-…`, kategorie z `02-…`, odbiorcy z `04-…`); wersjonować
  w repo; przegląd przy każdej zmianie odbiorców.

### DOW-02 — Strony prawne niezgodne ze stanem faktycznym

- **Klasa:** P (art. 5 ust. 1 lit. a, art. 13 [NZ]).
- **Stan:** częściowe.
- **Dowód:** § 1.1: placeholder administratora
  (`polityka-prywatnosci/page.tsx:20-21`), lokalizacja i dostawcy
  (`:76-118`, `rodo/page.tsx:20-23`, `regulamin/page.tsx:90-91`),
  deklaracje audytu, SCC, cookies i DPA (`rodo/page.tsx:39-64`); jedyny test
  treści: `tests/unit/rodo-terminy-usuwania.test.ts:17-36`.
- **Luka:** treść informacyjna opisuje infrastrukturę sprzed przeprowadzki
  i mechanizmy, których kod nie ma; nic w CI nie wykrywa rozjazdu.
- **Ryzyko:** wysokie — nieprawdziwa informacja wobec osób i klientów
  (rzetelność, przejrzystość); dla klienta-administratora błędna lista
  dalszych procesorów.
- **Rekomendacja:** po ustaleniu podmiotu (N-01) poprawić strony według
  `04-…` § 5; testy T-20 i T-21.

### DOW-03 — Procedura naruszeń niepełna i bez dowodu działania

- **Klasa:** P (art. 33–34 [NZ]); S (CC7.3–CC7.5 [NZ]).
- **Stan:** częściowe.
- **Dowód:** `docs/runbooks/key-rotation.md:183-190` i
  `docs/runbooks/disaster-recovery.md:117-120` — oba z nagłówkiem
  „TEN DOKUMENT JEST NIEAKTUALNY” (`:3-10`); `escalation-matrix.md:38-39` **[R4]**;
  brak `docs/incidents/` mimo `docs/bug-triage.md:50`; wzmianki „DPO” bez
  wyznaczenia IOD; `rodo/page.tsx:63-64` (72 h wobec klienta).
- **Luka:** brak procedury z oceną ryzyka naruszenia, rolą decyzyjną,
  szablonem zgłoszenia, ścieżką „procesor → administrator bez zbędnej
  zwłoki”, rejestrem naruszeń (art. 33 ust. 5) i ćwiczeniem.
- **Ryzyko:** wysokie — termin 72 godzin biegnie od stwierdzenia
  naruszenia; bez procedury i rejestru nie da się wykazać oceny także
  incydentów niezgłoszonych.
- **Rekomendacja:** jedna procedura w `docs/runbooks/` (aktualna
  infrastruktura), rejestr naruszeń (także „brak obowiązku zgłoszenia”
  z uzasadnieniem), ćwiczenie stołowe z datowanym zapisem; ustalić, czy
  wymagany jest IOD (pytanie P-04).

### DOW-04 — Żądania osób poza samoobsługą bez procedury i ewidencji

- **Klasa:** P (art. 12 ust. 3, art. 15–22, art. 28 ust. 3 lit. e [NZ]).
- **Stan:** częściowe.
- **Dowód:** `docs/support/escalation-matrix.md:41-42`; polityka
  `:191-202`; ewidencja tylko w `gdpr_deletion_requests` i audycie eksportu.
  **[R4]** Kanał przyjęcia e-mailem: `ops/poczta/worker.mjs:15-16`,
  `docs/runbooks/skrzynka-pomoc.md:16-22` (test `ops/poczta/worker.test.mjs`
  w CI); wzór identyfikacji osoby: `docs/runbooks/unlock-account.md:68-70`.
- **Luka:** brak procedury dla sprostowania, ograniczenia, sprzeciwu, osób
  bez konta (kontrahenci, księgowe, nabywcy z PESEL) i dla żądań
  przekazanych przez klienta-administratora; brak ewidencji terminów
  odpowiedzi. **[R4]** Kanał przyjęcia z alarmem istnieje (`ops/poczta`),
  ale bez ewidencji i terminów; jego działanie na produkcji niezweryfikowane
  (N-DOW-09).
- **Ryzyko:** średnie — dziś brak klientów; po starcie żądania mailowe nie
  zostawią śladu terminu.
- **Rekomendacja:** procedura i rejestr żądań (data wpływu, identyfikacja,
  zakres, termin, odpowiedź); mechanizmy w `A2-…`.

### DOW-05 — Brak przeglądów dostępów

- **Klasa:** S (CC6.2, CC6.3 [NZ]); P (art. 32 [NZ]).
- **Stan:** brak (nie znaleziono zapisów).
- **Dowód:** § 1.4: lista operatorów tylko w `ADMIN_EMAILS`
  (`lib/auth/admin-guard.ts:9-15`); [PR225] `ownership.md:20-27` —
  wspólne konto Sentry bez aktywnego TOTP/passkey, MFA GitHub
  nieodczytane; listy współpracowników repo nie odczytano (proxy 403).
- **Luka:** nikt nie potwierdza okresowo, kto ma dostęp do `service_role`,
  SSH, Coolify, repo i paneli dostawców; konto współdzielone uniemożliwia
  przypisanie działań osobie.
- **Ryzyko:** **wysokie** **[R4]** (było: średnie) — mały zespół, ale
  dostęp operatora obejmuje dane wszystkich firm, a konto współdzielone bez
  MFA uniemożliwia rozliczalność; zgodnie z `06-SOC2.md` SOC-07 i SOC-09.
- **Rekomendacja:** kwartalny przegląd dostępów z datowanym zapisem
  (lista kont, MFA, uzasadnienie); indywidualne konta u dostawców; zmiana
  `ADMIN_EMAILS` z wpisem audytu.

### DOW-06 — Wykonanie usunięcia konta poza śladem audytowym

- **Klasa:** P (art. 5 ust. 2 [NZ]); S.
- **Stan:** brak.
- **Dowód:** L1 (`lib/gdpr/deletion.ts:196-207`); akcje
  `gdpr.deletion_executed`/`_failed` zadeklarowane bez wystąpienia (§ 2.2).
- **Luka:** dowód realizacji żądania usunięcia to tylko wiersz w tabeli
  żądań.
- **Ryzyko:** średnie — utrata albo zmiana wiersza żądania usuwa jedyny
  dowód.
- **Rekomendacja:** wpis audytu bez danych osobowych (identyfikator
  żądania, wynik, liczby wierszy) po wykonaniu i po błędzie; test T-03.

### DOW-07 — Jednolita retencja audytu i audyt jako stan biznesowy

- **Klasa:** P (art. 5 ust. 1 lit. e [NZ]); S.
- **Stan:** częściowe.
- **Dowód:** L2; `lib/ksef/duplicate-decision-notice.ts:6-7,88-93,153-170`.
- **Luka:** 12 miesięcy dla wszystkich akcji, wbrew ADR 0006 (`:14`)
  i [PR225] `data-policy.md:61-62`; idempotencja powiadomień o duplikacie
  KSeF zależy od wpisu, który cron albo anonimizacja usuwa.
- **Ryzyko:** średnie — po roku brak śladu operacji finansowych i KSeF;
  możliwe ponowne powiadomienie klienta.
- **Rekomendacja:** klasy retencji audytu (dostęp/admin vs finansowe);
  stan powiadomień w osobnej tabeli; test T-07.

### DOW-08 — Odczyty operatora nielogowane, akcje operatora jako „system”

- **Klasa:** S (CC6.1, CC7.2 [NZ]); P (art. 5 ust. 1 lit. a i ust. 2 [NZ]).
- **Stan:** brak.
- **Dowód:** L4, L5; deklaracja `rodo/page.tsx:39-40`.
- **Luka:** operator czyta dane wszystkich firm kluczem `service_role` bez
  śladu; zmiany operatora zapisane bez IP i z `user_agent: 'inngest-job'`.
- **Ryzyko:** wysokie — publiczna deklaracja jest nieprawdziwa, a dostęp
  między firmami nie zostawia śladu. **[R4]** `06-SOC2.md` SOC-11
  podniesiono do tego samego poziomu.
- **Rekomendacja:** `logAuditAdmin` z tożsamością operatora, IP i UA;
  zapis każdego widoku danych osoby; testy T-16, T-17.

### DOW-09 — Dane osób trzecich i IP w dzienniku widocznym dla firmy

- **Klasa:** P (art. 5 ust. 1 lit. c [NZ]).
- **Stan:** częściowe.
- **Dowód:** L8, L9.
- **Luka:** e-maile księgowej (przy każdym wejściu), odbiorców faktur
  i operatora w `metadata`; IP współpracowników widoczne dla każdego
  członka; anonimizacja ich nie obejmuje.
- **Ryzyko:** niskie–średnie — niewielki zakres, ale osoby bez konta nie
  mają wglądu ani eksportu.
- **Rekomendacja:** identyfikatory zamiast adresów; dziennik tylko dla
  ról właściciel/administrator albo maskowanie IP; test T-19.

### DOW-10 — Niezmienność audytu tylko na poziomie wyzwalacza

- **Klasa:** S (CC7.2, CC4.1 [NZ]).
- **Stan:** częściowe.
- **Dowód:** `00052_audit_logs_immutable_trigger.sql:5,21-23`; L7.
- **Luka:** zmienna sesji otwiera `UPDATE`/`DELETE`; brak łańcucha skrótów
  i kopii poza hostem; komentarz migracji przecenia ochronę.
- **Ryzyko:** średnie — przejęcie hosta bazy pozwala zatrzeć ślad.
- **Rekomendacja:** okresowy eksport skrótów lub wpisów do magazynu poza
  hostem (append-only), poprawa komentarza.

### DOW-11 — Utrata wpisu audytu bez alarmu

- **Klasa:** S; I.
- **Stan:** brak.
- **Dowód:** L6.
- **Ryzyko:** niskie–średnie — brak dowodu kompletności śladu.
- **Rekomendacja:** licznik i alarm (bez treści wpisu); test T-18.

### DOW-12 — Test RLS na bazie nie jest kontrolą wymaganą

- **Klasa:** S (CC8.1 [NZ]).
- **Stan:** częściowe.
- **Dowód:** § 3.2 (GitHub API 11.10 i 13.10: 9 wymaganych kontroli bez
  `RLS isolation (lokalny Supabase)`); `GITHUB-WYMAGANE-KONTROLE.md:3-5`
  nieaktualny; `AGENTS.md` „11 kontroli”.
- **Ryzyko:** średnie — jedyna kontrola izolacji firm na bazie da się
  pominąć przy scaleniu.
- **Rekomendacja:** dodać job do wymaganych; zaktualizować dokument
  kontroli i `AGENTS.md`.

### DOW-13 — Zarządzanie zmianami bez niezależnego przeglądu człowieka

- **Klasa:** S (CC8.1 [NZ]).
- **Stan:** częściowe.
- **Dowód:** § 3.3: 0/40 PR z akceptacją; **[R4]** 39,2 % zmian przez PR
  w całej historii (116/296, w tym 2 PR scalone metodą squash), 100 % od
  19.09; wdrożenia ręczne (`AGENTS.md`); zaprojektowana bramka `/wdroz`
  z zapisem aktora i SHA, działanie niezweryfikowane (§ 1.3).
- **Ryzyko:** średnie dla usługi; **[R4]** dla gotowości do badania —
  wysokie (`06-SOC2.md` SOC-01). Dla badania typu II okres dowodów
  działania zaczyna się najwcześniej 19.09 (ruleset najpóźniej od 25.09,
  deklaracja); brak rozdzielenia autor–zatwierdzający.
- **Rekomendacja:** decyzja organizacyjna właściciela: albo wymóg
  akceptacji dla ścieżek wrażliwych
  (migracje, `lib/gdpr`, `lib/audit`, strony prawne), albo udokumentowana
  kontrola kompensująca; zapis wdrożeń (SHA, czas, osoba).

### DOW-14 — E2E bez przebiegów; brak automatycznego testu zgody

- **Klasa:** S; I.
- **Stan:** brak.
- **Dowód:** `e2e-staging.yml` — 0 przebiegów (§ 3.1); staging nie istnieje
  ([PR225] F0-G03 FAIL).
- **Ryzyko:** średnie — zachowanie banera, cookies i żądań w przeglądarce
  sprawdzono tylko jednorazowo (`A4-…`).
- **Rekomendacja:** test T-09 na stronach publicznych w CI (bez
  backendu), niezależnie od stagingu.

### DOW-15 — Testy RLS nie obejmują tabel z danymi osobowymi

- **Klasa:** I; S.
- **Stan:** częściowe.
- **Dowód:** § 4.3 (14 tabel bez pokrycia).
- **Ryzyko:** średnie — RLS jest włączony na wszystkich tabelach
  (`01-…` § 3), ale poprawności polityk tych tabel nie sprawdza żaden test
  na bazie.
- **Rekomendacja:** testy T-14 i T-15.

### DOW-16 — Testy prywatności przechodzą (dowód projektu logiki)

- **Klasa:** I.
- **Stan:** potwierdzone (projekt kontroli).
- **Dowód:** § 4.2 — 49/49 plików, 638/638 testów, 13.10.2026; wcześniej
  39/39, 540/540, 11.10.2026.
- **Ograniczenie:** testy mockują bazę, SDK i HTTP; nie dowodzą ustawień
  produkcji (np. [PR225]: replay PostHog włączony w panelu, choć kod go
  wyłącza).
- **Rekomendacja:** utrzymać; uzupełnić o testy z § 5.

### DOW-17 — Usunięcie organizacji i plików bez wykonawcy i testów

- **Klasa:** P (art. 5 ust. 1 lit. e, art. 17 [NZ]).
- **Stan:** brak.
- **Dowód:** `hard_delete_at` ustawiane w `app/admin/users/actions.ts:173`
  i `components/settings/account-actions.ts:62`, bez czytelnika w `lib/`
  (ustalenie zgodne z R1); `lib/gdpr/*` bez odwołań do magazynu plików;
  deklaracje `regulamin/page.tsx:94-95`, `polityka-prywatnosci/page.tsx:229`.
- **Luka:** zapowiedziane usunięcie danych firmy i plików nie następuje.
- **Ryzyko:** wysokie — deklaracja wobec klientów bez realizacji; pliki
  (zdjęcia paragonów, eksporty) zostają bezterminowo.
- **Rekomendacja:** wykonawca z regułami retencji i testy T-04, T-06; do
  tego czasu poprawić deklaracje.

### DOW-18 — Anonimizacja w Stripe zadeklarowana, niezaimplementowana

- **Klasa:** P (art. 17, art. 19 [NZ]).
- **Stan:** brak.
- **Dowód:** `docs/adr/0006-gdpr-14d-cooling-off.md:30` („Stripe customer —
  anonimizujemy email u Stripe”); **[R4]** `git grep -ni stripe lib/gdpr/`
  — 2 trafienia, oba w komentarzach o blokadzie subskrypcji
  (`lib/gdpr/deletion-blockers.ts:8, 19`); żadnego wywołania API Stripe;
  jedyne `customers.update` to synchronizacja adresu
  (`lib/stripe/customer-email.ts:16`). ADR zapowiada też automatyczne
  anulowanie subskrypcji przy usunięciu (`0006-…:45-46`), a kod blokuje
  usunięcie przy płatnej subskrypcji (§ 1.7).
- **Ryzyko:** średnie — e-mail osoby zostaje u odbiorcy po usunięciu
  konta (część danych Stripe może podlegać obowiązkom rachunkowym —
  do review).
- **Rekomendacja:** decyzja: anonimizacja, usunięcie klienta w Stripe albo
  zachowanie z podstawą; test w zestawie T-03.

### DOW-19 — Publiczny plik audytu ujawnia adres hosta bazy

- **Klasa:** I; S (CC6.1 [NZ]).
- **Stan:** potwierdzone (luka).
- **Dowód:** `docs/security/audyt/wynik-00-adres-bazy.txt:1` zawiera adres
  hosta bazy i ścieżkę lokalnego klucza z nazwą konta (treści nie
  powtarzamy).
- **Luka:** sprzeczne z zasadą `AGENTS.md` („adresy … NIE są w tym
  pliku”); `AGENTS.md` sam przyznaje, że adresy zostały w historii.
- **Ryzyko:** średnie — ułatwia rozpoznanie; logowanie tylko kluczem
  i zapora chmurowa ograniczają skutek.
- **Rekomendacja:** usunąć plik z drzewa (historia zostaje) i dopisać
  wzorzec do skanu sekretów.

### DOW-20 — Brak DPIA (screening), LIA i TIA

- **Klasa:** P (art. 35, art. 6 ust. 1 lit. f, art. 44–46 [NZ]); O.
- **Stan:** brak (nie znaleziono).
- **Dowód:** § 6.
- **Ryzyko:** wysokie — co najmniej dwa kryteria WP248 dla danych klientów
  i funkcji z modelami językowymi; transfery do US bez oceny.
- **Rekomendacja:** § 6.1–6.3; kolejność: rejestr (DOW-01) → screening
  DPIA → TIA dla Anthropic i Resend → LIA dla celów z § 6.2.

### DOW-21 — Brak raportów i certyfikatów

- **Klasa:** S.
- **Stan:** brak (nie znaleziono w repo).
- **Dowód:** § 1.6.
- **Ryzyko:** niskie — nie jest wymogiem prawnym; istotne dla klientów
  pytających o SOC 2 i dla oceny dostawców (CC9.2 [NZ]).
- **Rekomendacja:** teczka raportów dostawców (SOC 2, ISO) z datami;
  żadnej deklaracji „certyfikacji” (`06-SOC2.md`).

### DOW-22 — Odtwarzanie: jedna próba, brak kopii poza hostem

- **Klasa:** P (art. 32 ust. 1 lit. c–d [NZ]); S (A1.2, A1.3 [NZ]).
- **Stan:** częściowe.
- **Dowód:** `backup-restore.md:171`, `rto-rpo.md:131` (próba 01.10, sama
  baza — **[R4]** wiersz protokołu wpisany przez wykonawcę, bez surowego
  logu); [PR225] F0-G09 FAIL (`acceptance-plan.md:220`), TEST-07 NOT RUN;
  **[R4]** na @`c2ab6a8` plan pełnego restore jest tylko przygotowany
  („operacje i TEST-07 są niewykonane”, `acceptance-plan.md:106-108`).
- **Ryzyko:** **wysokie** **[R4]** (było: średnie) — utrata hosta bazy
  oznacza utratę pełnych danych z ostatniej doby lub więcej, a pliki faktur
  w MinIO aplikacji nie mają kopii; zgodnie z `06-SOC2.md` SOC-21 i SOC-22
  oraz `A2-…`.
- **Rekomendacja:** kopia poza hostem bazy i MinIO; miesięczna próba
  odtworzenia z datowanym protokołem obejmującym pliki i `auth`.

### DOW-23 — Brak upoważnień, zobowiązań do poufności i szkoleń **[R4]**

- **Klasa:** P (art. 28 ust. 3 lit. b, art. 29, art. 32 ust. 4 [NZ]);
  S (CC1.4, C1.1 [NZ]).
- **Stan:** brak (nie znaleziono w repo).
- **Dowód:** § 1.4 (wyszukiwanie `upoważnieni|poufnoś|NDA|szkoleni`
  w `docs`, `AGENTS.md`, `app` poza plikami audytu — tylko ogólne zdania
  w `PLAN-ODPORNOSCI-CYBER.md:9` i `rto-rpo.md:140` oraz strony porównań
  `app/(marketing)/vs/*`); `06-SOC2.md` C1.1, SOC-13.
- **Luka:** nikt z osób z dostępem do danych (`service_role`, SSH, Coolify,
  panele dostawców) nie ma udokumentowanego upoważnienia, zobowiązania do
  poufności ani szkolenia; sesje agentów AI z dostępem do produkcji
  (`04-…` PRC-07) nie są ujęte w żadnym zobowiązaniu. „Nie znaleziono” ≠
  „nie istnieje” (N-DOW-01).
- **Ryzyko:** średnie — bez tego nie da się złożyć zobowiązania z art. 28
  ust. 3 lit. b w umowie powierzenia (DOW-01, DOW-20) ani wykazać środka
  z art. 32 ust. 4.
- **Rekomendacja:** imienne upoważnienia i zobowiązania do poufności
  z datą; rejestr osób upoważnionych; szkolenie z potwierdzeniem (wspólne
  z `06-SOC2.md` SOC-13); decyzja, jak ująć sesje agentów AI (P-10).

## 8. Niewiadome i ograniczenia

| ID | Niewiadoma | Co blokuje | Jak rozstrzygnąć |
|---|---|---|---|
| N-DOW-01 | Czy rejestry, umowy powierzenia, TIA, rejestr naruszeń lub przeglądy dostępów istnieją poza repo (prywatne dzienniki, dysk właściciela) | ostateczny stan DOW-01, -03, -05, -20 oraz -23 **[R4]** (upoważnienia, poufność, szkolenia) („nie znaleziono” ≠ „nie istnieje”) | pytanie do właściciela; lista dokumentów z datami |
| N-DOW-02 | Stan produkcji: liczba wpisów `audit_logs`, przebiegi `cron.cleanup-audit-logs`, `gdpr-process-deletions`, `retention-delete`, wpisy `write_failed` w logach | dowód działania kontroli w czasie (§ 2) | odczyt operatora skryptem `scripts/ops/` (bez danych osobowych w wyniku) |
| N-DOW-03 | Wartość `ADMIN_EMAILS` i lista kont z dostępem (SSH, Coolify, GitHub, dostawcy) | DOW-05 | przegląd dostępów z datowanym zapisem |
| N-DOW-04 | Czy uprawnienia i polityki na produkcji odpowiadają migracjom po 08.09 | ważność odczytów `docs/security/audyt/wynik-*` | powtórzenie zapytań z 08.09 (T-15 jako wzór) |
| N-DOW-05 | Treść paneli i umów dostawców (DPA, SCC, DPF, retencje) | TIA (§ 6.3) | dokumenty od właściciela; `04-…` |
| N-DOW-06 | Skala docelowa (liczba firm, kontrahentów, dokumentów OCR) | kryterium 5 WP248 (§ 6.1) | prognoza właściciela |
| N-DOW-07 | Wynik testów RLS na bazie dla `3e5e00d` poza odczytem statusu CI | szczegóły asercji RLS | lokalny Supabase (poza tą sesją) |
| N-DOW-08 | Podmiot prawny operatora (placeholder w polityce) | DOW-02, DPA, rejestry | decyzja właściciela (N-01 w `08-…`) |
| N-DOW-09 **[R4]** | Czy routing poczty (Cloudflare Email Routing) i worker `ops/poczta` działają na produkcji | stan wiersza „Przyjęcie żądań e-mailem” (§ 1.3), DOW-04; `06-SOC2.md` P8.1 | odczyt konfiguracji przez właściciela (bez treści wiadomości) |
| N-DOW-10 **[R4]** | Treść `details_json` na produkcji — czy notatki decyzji o duplikacie i treści błędów zawierają dane osobowe | L10, T-03 | przegląd próbki przez operatora bez kopiowania treści (tylko liczba wpisów z niepustym `note`) |
| N-DOW-11 **[R4]** | Czy bramka `/wdroz` i schemat `ops` (migracja `00100`) działają na produkcji | stan wiersza „Wdrożenia przez bramkę” (§ 1.3), § 3.3, DOW-13; `06-SOC2.md` SOC-04, SOC-05 | odczyt operatora: `schema_migrations` dla `00100`, liczba wpisów `ops.deploy.*` w `audit_logs` (bez danych osobowych) |

Ograniczenia tej pracy: brak dostępu do produkcji i paneli; odczyt
współpracowników repo zablokowany przez proxy; e2e i testy RLS na bazie
nieuruchamiane; przepisy i kryteria [NZ]; materiały [PR225] to pomiary
i deklaracje operatora, niezweryfikowane w tej sesji; odwołania
`ścieżka:linia` dotyczą `3e5e00d`, a produkcja według [PR225] działa na
nowszym kodzie (`01-…` § 2).

## 9. Pytania do końcowego review prawnego

| ID | Pytanie | Kontekst |
|---|---|---|
| P-01 | Czy FaktFlow musi prowadzić oba rejestry z art. 30 mimo małej skali (przetwarzanie nie jest sporadyczne)? | DOW-01 |
| P-02 | Czy przy danych klientów spełnione kryteria WP248 (dane finansowe, modele językowe, łączenie zbiorów) wymagają DPIA po stronie klienta, a FaktFlow powinien przeprowadzić dobrowolną DPIA dla funkcji z modelami językowymi? Czy któraś operacja mieści się w wykazie Prezesa UODO? | § 6.1, DOW-20 |
| P-03 | Jaki termin i treść powiadomienia klienta-administratora o naruszeniu przyjąć w umowie powierzenia, skoro strona RODO obiecuje 72 h „zgodnie z art. 33”? | DOW-03, `rodo/page.tsx:63-64` |
| P-04 | Czy FaktFlow musi wyznaczyć IOD (art. 37), skoro runbooki odwołują się do „DPO”? | DOW-03 |
| P-05 | Czy wpisy audytu wysyłek do KSeF i operacji płatniczych mogą być usuwane po 12 miesiącach, czy podlegają dłuższej retencji (np. jako dowód rozliczeń podatkowych)? Czy anonimizacja może usuwać całe `metadata`? | DOW-07, L2, L3 |
| P-06 | Czy rejestrowanie e-maila księgowej przy każdym wejściu do portalu i e-maila odbiorcy faktury w audycie ma podstawę, czy wystarczy identyfikator? | DOW-09 |
| P-07 | Czy dane klienta w Stripe po usunięciu konta należy anonimizować, czy zachować z powodu obowiązków rachunkowych? | DOW-18 |
| P-08 | Czy maile sekwencji próbnej i newsletter mogą opierać się na uzasadnionym interesie, czy wymagają zgody na komunikację elektroniczną według Prawa komunikacji elektronicznej? | § 6.2 |
| P-09 | Czy brak logowania odczytów operatora jest dopuszczalny przy obecnej deklaracji „kto i kiedy uzyskał dostęp do Twoich danych”, czy deklarację trzeba wycofać do czasu wdrożenia? | DOW-08 |
| P-10 **[R4]** | Czy przy przetwarzaniu jako podmiot przetwarzający (art. 28 ust. 3 lit. b [NZ]) potrzebne są pisemne zobowiązania do poufności także od współpracowników spoza zatrudnienia i jak ująć sesje agentów AI z dostępem do produkcji? | DOW-23; `06-SOC2.md` § 11 pkt 4 |
| P-11 **[R4]** | Czy automatyczna klasyfikacja poczty z alarmem „pilne” (bez rejestru) wystarcza jako ułatwienie wykonywania praw (art. 12 ust. 2 [NZ]), czy potrzebna jest ewidencja z datą wpływu i odpowiedzi? | DOW-04, § 1.3 |
| P-12 **[R4]** | Czy wolny tekst notatki decyzji klienta w `details_json` może pozostać po usunięciu konta przez okres retencji audytu? | L10, DOW-07 |

## 10. Co sprawdziłem / czego nie mogłem sprawdzić

**Sprawdziłem (13.10.2026, chyba że zaznaczono inaczej):**

- strony prawne (`polityka-prywatnosci`, `rodo`, `regulamin`) — treść
  i numery linii deklaracji;
- `docs/support/*`, `docs/runbooks/*` (nagłówki i fragmenty o incydentach
  i kopiach), `docs/adr/*` (statusy, ADR 0006 w części o usuwaniu),
  `docs/security/*` (nagłówki, plany, `audyt/*` z datami),
  `docs/audyt/blok-1/*` (lista);
- wyszukiwania rejestrów, DPIA, DPA, IOD, przeglądów dostępów, raportów
  i certyfikatów (§ 1);
- ślad audytowy: migracje `00001`, `00008`, `00027`, `00052`, `00069`;
  helpery `lib/audit/*`; 90 akcji i ich wystąpienia (skrypt `git grep`);
  diff `7c0097f..3e5e00d` dla `lib/audit/log.ts` i `lib/email/send.ts`;
  `lib/ksef/duplicate-decision-notice.ts`; metadane z e-mailami; strona
  dziennika firmy;
- `lib/gdpr/deletion.ts` (brak audytu wykonania, brak Stripe, brak
  magazynu plików); `hard_delete_at` w całym kodzie;
- CI: pliki workflow, `package.json:12`, szablon PR; GitHub API (GET):
  reguły `main` (11.10 i 13.10), przebiegi `e2e-staging.yml` (0) i `ci.yml`
  na `main`, check runs PR #245 i recenzje 40 PR (11.10);
- historia `main` z pełnego klonu bez plików (liczby powtórzone 13.10);
- 49 plików testów prywatności uruchomionych lokalnie (638/638 PASS);
  pokrycie tabel przez testy RLS (zliczenie `from('…')`);
- [PR225] @ `c2ab6a8`: `acceptance-plan.md` (bramki, rejestr testów),
  `data-policy.md` (retencje), `ownership.md` (dostęp), `contracts.md`
  (nagłówek).
- **[R4]** Redaktor poprawek (13.10.2026) sprawdził każdą uwagę R4 przed
  naniesieniem: `ops/poczta/worker.mjs:15-16`, `skrzynka-pomoc.md:16-22`,
  `ci.yml:44-50`; `00001:169`, `00052:95-124`, `00131:118-138, 300-310,
  366-376, 420-430`, `00148:530-548` (anonimizacja nie czyści
  `details_json`); `git grep -ni stripe lib/gdpr/` (2 trafienia
  w komentarzach), ADR 0006 `:30, :45-46`; `00052:1-41` i `00008:38-67`
  (wyzwalacz, uprawnienia); `ops/bramka/src/deploy.mjs:110-140`,
  `00100:150-190`, `bramka-telegram.md:1-40`, `CLAUDE-DO-CODEXA.md:40-45`;
  historia `main` w pełnym klonie bez plików (1061/287/296/114, squash
  #5 i #6, brak commitów 19–22.09); `GITHUB-WYMAGANE-KONTROLE.md:1-8`;
  liczby `find tests` i wywołań `it(`/`test(` w `tests/rls-*`;
  `unlock-account.md:64-70`, `GOTOWOSC-DO-WYDANIA.md:24`,
  `service-role-review-20260916.json` (metadane), `FAZA-03-…:1-13`;
  `actions-detail.ts:514-523`, `escalation-matrix.md:36-43`,
  `app/admin/support/`; wyszukiwanie upoważnień, poufności i szkoleń;
  przebieg 3 testów (§ 4.2).

**Nie mogłem sprawdzić:**

- produkcji (baza, logi, crony, kopie, zmienne `ADMIN_EMAILS`), paneli
  i umów dostawców;
- listy współpracowników repo i ustawień MFA w GitHubie (proxy 403);
- testów RLS na bazie i e2e (nie uruchamiano; RLS — tylko status CI);
- treści przepisów, wytycznych WP248/EROD, wykazu UODO i kryteriów AICPA
  w źródłach pierwotnych (egress zablokowany, WebSearch odrzucony) — [NZ];
- dokumentów poza repo (prywatne dzienniki `docs/automation/`, dysk
  właściciela).

## Historia recenzji

| Recenzent | Data | Werdykt | Uwagi | Przyjęte | Odrzucone | Plik recenzji |
|---|---|---|---|---|---|---|
| R4 — niezależny agent-recenzent (grupa: `A3` + `06`) | 13.10.2026 | zatwierdzony z uwagami (27 z 32 kontroli punktowych potwierdzonych, 0 obalonych wniosków; przebieg testów odtworzony 49/49, 638/638) | 15 uwag do tego pliku: R4-U01 … R4-U13 (3 istotne: U01–U03; 10 drobnych) oraz wspólne R4-U16 (istotna, ryzyka względem `06`) i R4-U30 (drobna, wersja PR #225) | wszystkie 15 — R4-U01, U02, U03, U04, U05, U06, U07, U08, U09, U10, U11, U12, U13, U16, U30; naniesione przez redaktora poprawek 13.10.2026 po sprawdzeniu w kodzie, historii git i [PR225] (wyniki w § 10); trzy wskazane testy uruchomione (przebieg 3, § 4.2); nowe: DOW-23, L10, N-DOW-09…11, P-10…P-12; ryzyka DOW-05 i DOW-22 podniesione do „wysokie” | częściowo: R4-U07 — liczby 87 przypadków RLS nie przyjęto jako jedynej (zależy od wzorca: 83 dla `it(`/`test(`, 91 z wariantami; zapisano obie z komendami); R4-U12 — teza „odbiorca w `:521`” nietrafna (`actions-detail.ts:522` to `metadata: { recipient }`), więc L8 zostaje `:522`, a § 2.2 dostał zakres `:516-522` | `R4.md` (scratchpad sesji; streszczenie w `10-REVIEW.md`) |
