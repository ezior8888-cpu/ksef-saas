# 01 — Stan obecny i granice audytu

| | |
|---|---|
| Etap | Rozpoznanie projektu i dostępu (pkt 2 zadania) |
| Autor | koordynator (główna sesja) |
| Data | 7.10.2026 (start), 10.10.2026 (wznowienie) |
| Wersja kodu | `origin/main` @ `3e5e00d` (10.10.2026, scalenie PR #245); start audytu 7.10 na `7c0097f` |
| Gałąź robocza | `claude/gallant-faraday-ypjokp` = `origin/main` + pliki tego audytu (scalenie `main` 10.10), brak innych lokalnych zmian |
| Recenzja | R1 (niezależny agent, 10.10.2026): „wymaga poprawek”, 10 uwag, wszystkie naniesione 11.10.2026; R4-U30 (drobna) naniesiona 13.10.2026; końcowa kontrola kompletności R6; historia na końcu pliku i w `10-REVIEW.md` |

## 1. Po co ten plik

Ustala, na czym stoi audyt: jaki kod czytaliśmy, co jest w aplikacji, do
czego mieliśmy dostęp, a do czego nie. Każdy wniosek w pozostałych plikach
trzeba czytać przez pryzmat ograniczeń z sekcji 5.

## 2. Wersja kodu i zmiany w toku

- Audyt wystartował 7.10.2026 na `7c0097f`. Pierwsze podejście agentów
  przerwał limit użycia API (żaden raport nie został zapisany), więc
  10.10.2026 gałąź scalono z aktualnym `main` (`3e5e00d`) i badanie
  wykonano na tej wersji. Różnica to 15 commitów KSeF (PR #244, #245:
  ponowienia KOR/ZAL/ROZ, decyzja klienta przy duplikacie, migracja
  `00148`); w obszarze prywatności zmieniły się tylko `lib/audit/log.ts`
  (+6 linii) i `lib/email/send.ts` (+40 linii). Nie było innych lokalnych
  zmian ani nieśledzonych plików poza materiałami audytu.
- Otwarte PR na 10.10.2026 (odczyt przez GitHub API):

| PR | Tytuł (skrót) | Znaczenie dla tego audytu |
|---|---|---|
| #225 (Codex, niescalony; raporty cytują stan @ `686a465`; 10.10 do 17:58 UTC gałąź przesunęła się do `a72b567`, 21 commitów, tytuł „F0: prepare complete backup execution with bounded adapters”; **[R4]** 11.10 14:32 UTC gałąź przesunęła się do `c2ab6a8` (tytuł „F0: prepare full backup execution, verified resume and signals”; odczyt R4 przez GitHub API 13.10); `A3` cytuje tę wersję, `06` — @`686a465` i @`a72b567`; stany bramek F0-G03/G09 bez zmian, numery linii `acceptance-plan.md` przesunięte o 7) | F0: wybory właściciela, dowody i bezpieczny inwentarz | **Istotny.** `docs/observability/*` na gałęzi `codex/f0-runtime-inventory` zawiera deklarowany pomiar produkcji z 4.10, odczyty API dostawców z 6.10, przyjętą (niewdrożoną) politykę danych obserwowalności oraz decyzje z 10.10 (docelowo płatny Sentry Team EU, 10-letnia historia błędów faktur we własnej bazie, przyszły agent z odczytem zredagowanej diagnostyki). Wcześniejsze próby SSH 10.10 były nieudane; według `a72b567` od 14:23 UTC operator uzyskał dostęp SSH i wykonał odczyt runtime i rozmiarów (fakty w § 4). Używamy go jako dowodu pośredniego, z oznaczeniem poziomu. |
| #195, #189 | KSeF: ROZ, kody błędów | Integralność przetwarzania (SOC 2 PI); nie zmieniają przetwarzania danych osobowych. |
| #190, #193, #197 (szkice) | Bezpieczeństwo: dowody XML, obraz workera, sekrety buildu | Pośrednio SOC 2 (CC6/CC8). |
| #236 | Plan agenta | Dokumentacja. |

**Dryf wersji po zamrożeniu.** Audyt czyta `3e5e00d`. Po zamrożeniu `main`
przesunął się 10.10 do `face09c` (PR #246, #247: przebudowa importu faktur —
`lib/import/*`, bez nowych migracji; odczyt recenzenta R1 przez GitHub REST
API). Według PR #225 @`a72b567` (pomiar operatora 10.10, 14:26 UTC)
produkcja działa na `43091e7` (scalenie #246), czyli na kodzie nowszym niż
audytowany. Odwołania `ścieżka:linia` w raportach dotyczą `3e5e00d`;
w `lib/import/import-engine.ts` mogą nie pasować do nowszego kodu. Zmiana
nie dotyczy zakresu danych osobowych poza przeniesieniem logiki wiersza
importu (w tym PESEL i dokumentu nabywcy) do
`lib/import/imported-invoice-row.ts` — do sprawdzenia w pierwszym etapie
wykonawczym.

## 3. Co jest w aplikacji (potwierdzone w kodzie)

| Obszar | Stan | Dowód |
|---|---|---|
| Framework | Next.js 16.3.8 App Router, React 19; `proxy.ts` zamiast `middleware.ts` | `package.json`, `proxy.ts` |
| Rozmiar | 74 strony (`page.tsx`), 18 handlerów tras (`route.ts`; w tym 2 w `app/api/dev/` zamknięte na produkcji oraz 2 testowe Sentry: `sentry-test-log` na produkcji wymaga sekretu, `sentry-example-api` nie ma warunku w handlerze — `app/api/sentry-example-api/route.ts:12-17`), 44 pliki z dyrektywą `'use server'` (31 w `app/`, 10 w `components/`, 3 w `lib/`) | `find app -name page.tsx`, `find app -name route.ts`, `git grep -lE "^\s*['\"]use server['\"];?\s*$" -- '*.ts' '*.tsx'` (R1 10.10, powtórzone przez koordynatora 11.10) |
| Trasy istotne dla prywatności | `api/gdpr/export`, `api/support/chat`, `api/stripe/webhook`, `api/email/resend-webhook`, `api/email/unsubscribe`, `api/portal/exports/generate`, `accountant/[token]/download/[invoiceId]`, `api/invoices/[id]/pdf`, `api/invoices/batch-pdf`, `share-target`, `auth/callback`, trasy `dev` i testowe Sentry | `find app -name route.ts` |
| Uwierzytelnianie | Supabase GoTrue: e-mail/hasło, Google OAuth, MFA TOTP | `app/(auth)/login/actions.ts:102` (`signInWithOAuth`), `app/(dashboard)/settings/security/actions.ts:172` (`mfa.enroll`) |
| Baza | Postgres z RLS: 132 pliki migracji (`00001`–`00148` z lukami, `00200`), 70 tabel `public`, RLS włączony na 70/70 | `ls supabase/migrations/*.sql`, grep `CREATE TABLE` i `ENABLE ROW LEVEL SECURITY` (R1) |
| Zadania w tle | pg-boss w tym samym Postgresie (schemat `pgboss`), worker jako osobny proces; 27 cronów w rejestrze (zgodne z pomiarem PR #225: 52 kolejki, 27 cronów) | `lib/jobs/boss.ts:28-36`, `lib/jobs/worker.ts`, `lib/jobs/queues.ts:88-128` |
| Pliki | klient S3 (MinIO), zmienne `R2_*` | `lib/storage/r2.ts` |
| Integracje (wg `.env.example` i kodu) | KSeF (MF), Stripe, Resend, Sentry, PostHog, Anthropic (support, OCR, kategoryzacja), Redis przez REST, GUS, web push (VAPID), Slack, Telegram, heartbeat, Cloudflare Turnstile (`TURNSTILE_*`), Google OAuth (przez GoTrue), HIBP (`lib/auth/breach-check.ts`), MF biała lista, VIES, NBP, Google Fonts (`app/layout.tsx:114-124`), Cloudflare Email Routing (`ops/poczta`), Healthchecks (ping z `scripts/hetzner/db-backup.sh:19,46-49`); AWS w kodzie to archiwum faktur (Glacier), nie kopia zapasowa | `.env.example`; szczegóły i potwierdzenia w `04-PROCESORZY-I-LOKALIZACJE.md` |
| Strony prawne | polityka prywatności, regulamin, strona RODO | `app/(marketing)/legal/*/page.tsx` |
| Administrator w polityce | **placeholder** „[nazwa firmy], NIP [TWÓJ_NIP], z siedzibą w Poznaniu” | `app/(marketing)/legal/polityka-prywatnosci/page.tsx:20-21` |
| Mechanizmy RODO | eksport (`app/api/gdpr/export/route.ts`), usunięcie z 14-dniowym okresem (`lib/gdpr/*`, ADR 0006), zgoda analityczna (`lib/analytics/consent.ts`) | szczegóły w `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` i `A2-MECHANIZMY-PRAWA-RETENCJA.md` |
| Testy | 446 plików `*.test.ts` w `tests/` (w tym 8 testów na bazie `tests/rls-*.test.ts`, uruchamianych w jobie CI „RLS isolation (lokalny Supabase)”), 10 specyfikacji e2e | `find tests -name '*.test.ts'`, `find e2e -name '*.spec.ts'`, `.github/workflows/ci.yml:82-108` |
| Środowiska | Produkcja (jedyne środowisko serwerowe; staging nie istnieje wg PR #225), lokalne środowisko deweloperskie z bazą w Supabase Cloud („pozostałość po erze Vercela”, do której według komentarza w kodzie nikt nie ma już hasła), CI z lokalnym Supabase do testów RLS. Workflow `e2e-staging.yml` (ręczny, środowisko GitHub `security-staging`) istnieje, ale według PR #225 bez sekretów i bez uruchomień. Przełączniki: `KSEF_ENV`, `APP_ENV`/`NEXT_PUBLIC_APP_ENV`, `JOBS_BACKEND`, `WORKER_DISABLE_SCHEDULES`, `LOAD_TEST_MODE` (zakomentowany, tylko test/staging). Checklista wyłączenia Vercela, Supabase Cloud, Upstash, Inngest i R2 jest niezaznaczona | `AGENTS.md` („Pułapki”: lokalny `.env.local`), `app/(dashboard)/dashboard/page.tsx:150-156`, `.github/workflows/e2e-staging.yml:4-10`, `.github/workflows/ci.yml:82-108`, `docs/migration/PRZEPROWADZKA-HETZNER.md:720-733`, `.env.example` |
| CI | 5 workflow: `ci.yml`, `security.yml`, `e2e-staging.yml`, `agent.yml`, `agent-guard.yml` | `.github/workflows/` |

`agent.yml` uruchamia agenta Claude Code (Anthropic) na treści issue
oznaczonego `agent:napraw`. To przepływ kodu i treści zgłoszeń, nie danych
klientów, ale treść issue trafia do zewnętrznego dostawcy
(`.github/workflows/agent.yml:15,23` — wyzwalacz etykietą `agent:napraw`;
`:51` — `anthropics/claude-code-action`).

**Instrukcje i dokumentacja architektury.** `CLAUDE.md` zawiera wyłącznie
import `@AGENTS.md`. `AGENTS.md` jest głównym źródłem opisu stosu
i infrastruktury; jest nieaktualny co do lokalizacji MinIO aplikacji
(§ 4). `docs/architecture/` ma 6 plików (`system-overview.md`,
`billing-flow.md`, `cykl-zycia-faktury-ksef.md`, `ksef-flow.md`,
`multi-tenant-rls.md`, `ocr-flow.md`); `system-overview.md:5` sam ostrzega,
że opisuje stan sprzed przeprowadzki (Vercel, Supabase Cloud, Inngest, R2,
Upstash — l. 21-25), więc nie traktujemy go jako opisu produkcji.
Pozostałych pięciu plików nie oceniano w tym audycie pod kątem aktualności;
opis przepływów opiera się na kodzie (`02-INWENTARZ-I-PRZEPLYWY.md`).

**Struktura.** `app/` dzieli się na grupy `(auth)`, `(dashboard)`,
`(marketing)`, `(landing)` oraz `admin`, `accountant`, `api`, `onboarding`,
`invite`, `share-target`; logika w `lib/*` (m.in. `gdpr`, `retention`,
`analytics`, `observability`, `audit`, `ksef`, `jobs`, `storage`, `backup`,
`ocr`, `support`, `flo`); narzędzia operatorskie w `ops/` i `scripts/`;
PWA: `app/sw.ts`, `app/manifest.ts`, `share-target` (opis magazynów
przeglądarki w `02` i `A4`).

## 4. Infrastruktura (z dokumentacji — nie weryfikowana w tej sesji)

Według `AGENTS.md` (sekcja „Infrastruktura i dostępy”): trzy serwery
Hetznera w regionie NBG1 (aplikacja i worker, panel Coolify, Supabase
self-hosted), wdrożenia ręczne przez Coolify, migracje wgrywane ręcznie
przez SSH. Adresy i nazwy kontenerów są celowo poza repozytorium.

Niescalony PR #225 (pomiar operatora z 4.10.2026, deklaracje z 6–7.10,
odczyt SSH i paneli z 10.10 w wersji @`a72b567`) koryguje i uzupełnia
`AGENTS.md` w punktach istotnych dla prywatności:

| Teza w `AGENTS.md` | Według PR #225 | Poziom dowodu |
|---|---|---|
| MinIO aplikacji na `db-1` | MinIO aplikacji na `ops-1`; na `db-1` osobny MinIO dla Supabase Storage | pomiar operatora 4.10 |
| (zmienne `UPSTASH_*`) | Redis lokalny (`redis:7.2` + SRH) na `app-1`, nie Upstash | pomiar operatora 4.10 |
| — | Sentry i PostHog: intake w regionie EU | pomiar 4.10 + API 6.10 |
| — | Brak pełnej kopii bazy i MinIO poza hostem źródłowym; lokalny nocny `pg_dump`; snapshot JSON schematu `public` na drugim hoście; obrazy hosta Hetznera tylko dla `db-1` | pomiar 4.10 + API 6.10 |
| — | Staging nie istnieje; produkcja ma `KSEF_ENV=test` | pomiar 4.10 |
| — | Produkcja (web, worker) na `43091e7`, Redis 7.2.15 lokalnie | pomiar operatora 10.10, PR #225 @`a72b567` |
| — | MinIO Supabase Storage: 1 bucket, 0 obiektów; MinIO aplikacji: 1 bucket, 31 obiektów (ok. 0,4 MB), bez wersjonowania | pomiar operatora 10.10, PR #225 @`a72b567` |
| — | Druga baza `_supabase` (ok. 676 MB) obok `postgres` (ok. 190 MB); nocny `pg_dump` obejmuje tylko `postgres` | pomiar operatora 10.10, PR #225 @`a72b567` + `scripts/hetzner/db-backup.sh:77` |
| — | PostHog (panel): replay ON, console ON, network timings ON, nagłówki i treść OFF, retencja replay 30 dni; kod nadal wyłącza replay | odczyt panelu 10.10, PR #225 @`a72b567` |
| — | Sentry: aktywny plan Developer; retencja zdarzeń 30 dni według dokumentacji dostawcy, aktywny TTL nieodczytany | odczyt panelu 10.10, PR #225 @`a72b567` |

Żadnego z tych faktów nie sprawdziliśmy sami. W raportach oznaczamy je
jako „pomiar/deklaracja operatora z PR #225”.

## 5. Środowisko audytu i ograniczenia dowodowe

| Ograniczenie | Skutek | Jak oznaczamy |
|---|---|---|
| Sesja w chmurze: brak `.env.local`, brak `.agents/infra.env`, brak klucza SSH, brak `docs/automation/` | Brak dostępu do produkcji, bazy produkcyjnej, Coolify, logów, kopii. Brak prywatnych dzienników napraw `AUD-NN`. | „niezweryfikowane — brak dostępu do produkcji” |
| Brak dostępu do paneli i umów dostawców (Sentry, PostHog, Stripe, Resend, Anthropic, Hetzner, Google, Cloudflare) | Nie znamy treści DPA, ustawień retencji, regionów dodatkowych funkcji, list dalszych procesorów | „stan umowy nieznany; nie zgadujemy treści” |
| Egress sieci filtrowany polityką organizacji (sprawdzone 7.10.2026 ok. 18:55 UTC; stan polityki ponownie potwierdzany przez agentów 10.10) | **Zablokowane (403):** eur-lex.europa.eu, edpb.europa.eu, uodo.gov.pl, isap.sejm.gov.pl, api.sejm.gov.pl, eli.gov.pl, aicpa-cima.com, gov.pl, ec.europa.eu, strony dostawców (supabase.com, posthog.com, sentry.io, stripe.com, resend.com, hetzner.com, upstash.com, cloudflare.com). **Dostępne:** github.com, raw.githubusercontent.com, www.anthropic.com/legal/*, registry.npmjs.org. | Źródła pierwotne prawa i AICPA: „niezweryfikowane online 7.10.2026 — egress zablokowany; identyfikacja wg wiedzy modelu” |
| Właściciel odrzucił użycie wyszukiwarki (WebSearch) w trakcie sesji i polecił kontynuować | Brak wyszukiwania nowszych wersji wytycznych, orzeczeń i dokumentów dostawców | jak wyżej |
| Brak prawdziwych danych | Analiza na kodzie, schematach, konfiguracji i danych syntetycznych; test przeglądarkowy na lokalnym buildzie z syntetycznymi zmiennymi | wyniki testów runtime opisują build lokalny, nie produkcję |
| Podmiot prawny operatora | Polityka prywatności ma placeholder; `ai_todo.md` mówi o pracy „przed założeniem firmy” | niewiadoma N-01 w `08-NIEWIADOME-I-REVIEW-PRAWNE.md` |

**Konsekwencja dla wniosków prawnych.** Treść przepisów RODO, ustawy
Prawo komunikacji elektronicznej, wytycznych EROD/UODO i kryteriów AICPA
opisujemy według wiedzy modelu (stan do połowy 2026 r.), a każdą taką
pozycję oznaczamy jako niezweryfikowaną online. Nie blokuje to analizy luk
w aplikacji, bo większość luk wynika z kodu (brak mechanizmu, niespójność
z deklaracją). Blokuje natomiast ostateczne brzmienie podstaw prawnych,
okresów retencji i klauzul — to trafia do końcowego review prawnego wraz
z listą przepisów do sprawdzenia w źródle.

## 6. Granice audytu

**W zakresie:** cały kod aplikacji i workera na `3e5e00d`, migracje,
konfiguracja w repo (CSP, Sentry, PostHog, Docker, CI), dokumentacja
w repo, otwarty PR #225 jako dowód pośredni, lokalny test przeglądarkowy
(cookies, magazyny, żądania sieciowe) na stronach publicznych.

**Poza zakresem lub niewykonalne w tej sesji:** stan produkcji (konfiguracja
kontenerów, logi, zawartość bazy, kopie), panele dostawców, umowy, testy
penetracyjne, strony za logowaniem w przeglądarce (wymagają działającego
Supabase), formalna ocena prawna. Agent FLO (`lib/flo/`) oceniamy tylko
w zakresie: czy przetwarza dane osobowe i czy może zostać włączony.

**Nie zmieniamy:** kodu aplikacji, migracji, konfiguracji, danych. Ten etap
kończy się raportami; zmiany ruszają po osobnym promptcie wykonawczym.

## 7. Workflow agentowy (pkt 3 zadania)

Subagenci byli dostępni i zostali użyci. Każdy pracował na tych samych
wymaganiach (`00-ZADANIE.md`) i wspólnym briefie z granicami (bez
WebSearch, bez zmian kodu, repo publiczne). Recenzentem etapu jest zawsze
inny agent niż autor; koordynator nie zatwierdza własnych etapów.

| Etap | Autor | Plik wynikowy | Recenzent | Stan |
|---|---|---|---|---|
| Rozpoznanie | koordynator | `01-STAN-I-GRANICE.md` | R1 (osobny agent) | gotowy, po recenzji R1 |
| Inwentarz i przepływy | agent INWENTARZ | `02-INWENTARZ-I-PRZEPLYWY.md` | R1 | gotowy, po recenzji R1 |
| Research źródeł | agent ŹRÓDŁA | `03-REJESTR-ZRODEL.md` | R2 | gotowy, po recenzji R2 |
| Procesorzy i lokalizacje | agent PROCESORZY | `04-PROCESORZY-I-LOKALIZACJE.md` | R2 | gotowy, po recenzji R2 |
| Mechanizmy: minimalizacja, zgody | agent MECHANIZMY-A | `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` | R3 | gotowy, po recenzji R3 |
| Mechanizmy: prawa, retencja, AI | agent MECHANIZMY-B | `A2-MECHANIZMY-PRAWA-RETENCJA.md` | R3 | gotowy, po recenzji R3 |
| Dowody i testy | agent DOWODY | `A3-DOWODY-I-TESTY.md` | R4 | gotowy, po recenzji R4 |
| Test runtime cookies i sieci | agent RUNTIME | `A4-TEST-COOKIES-I-SIECI.md` + `narzedzia/` | R3 | gotowy, po recenzji R3 |
| Macierz wymagań (analiza luk) | agent MACIERZ | `05-MACIERZ-WYMAGAN.md` | R5a | gotowy, po recenzji R5a |
| SOC 2 | agent SOC2 | `06-SOC2.md` | R4 | gotowy, po recenzji R4 |
| Plan etapów | agent PLAN | `07-PLAN-ETAPOW.md` | R5a | gotowy, po recenzji R5a |
| Niewiadome i review prawne | agent NIEWIADOME | `08-NIEWIADOME-I-REVIEW-PRAWNE.md` | R5b | gotowy, po recenzji R5b |
| Materiały robocze (RoPA, DPIA, LIA, TIA, umowa powierzenia, procedury) | agent MATERIAŁY | `09-MATERIALY-ROBOCZE.md` | R5b | gotowy, po recenzji R5b |
| Kompletność całości | — | `10-REVIEW.md` | R6a (pokrycie zadania), R6b (adwersaryjna kontrola dowodów) | szczegóły w `10-REVIEW.md` |

Uwaga o przebiegu: limit użycia API przerwał pracę agentów 7.10 i dwukrotnie
10.10. Przerwani agenci byli uruchamiani ponownie od zera (z dostępem do
swoich niepełnych szkiców); od 10.10 wieczorem agenci pracują najwyżej po
dwóch naraz, a recenzje są grupowe (R1–R4), zgodnie z pierwotnym podziałem
w tej tabeli. Poprawki z recenzji R1 i R2
(obie rundy) naniósł koordynator, który nie jest autorem tych etapów
(z wyjątkiem `01`, gdzie zatwierdzenie należy do recenzenta, a koordynator
tylko nanosi jego tekst). Poprawki z R3, R4, R5a i R5b naniosły osobne
agenty-redaktorzy, które nie były ani autorami, ani recenzentami; każdy
redaktor najpierw weryfikował uwagę w kodzie i mógł ją odrzucić
z uzasadnieniem. Recenzent R2 został uruchomiony ponownie po poprawkach
i wykonał rundę 2 — sprawdził wierność naniesienia rundy 1. Końcową
kontrolę kompletności wykonali dwaj niezależni krytycy (R6a, R6b).

Wyniki recenzji, poprawki i stan każdej bramki zapisuje `10-REVIEW.md`.

## 8. Konwencje w raportach

- Stany wymagań: **potwierdzone / częściowe / brak / niezweryfikowane /
  nie dotyczy** (z uzasadnieniem).
- Klasa wymagania: **P** obowiązek prawny, **O** interpretacja organu
  (EROD, UODO), **S** kryterium SOC 2, **I** praktyka inżynierska.
- „Nie znaleziono w repo” nie znaczy „nie istnieje”.
- Dowody: `ścieżka:linia`, nazwa migracji, wynik komendy; dla PR #225 —
  gałąź i plik.
- Repo jest publiczne: bez sekretów, adresów, nazw kontenerów; luki
  bezpieczeństwa jednym zdaniem.

## Historia recenzji

| Recenzent | Data | Werdykt | Uwagi | Przyjęte | Odrzucone | Plik recenzji |
|---|---|---|---|---|---|---|
| R1 — niezależny agent-recenzent (grupa: `01` + `02`) | 10.10.2026 | wymaga poprawek (20 kontroli punktowych: 12 potwierdzonych, 2 częściowe, 4 obalone — liczby ze starszej wersji kodu, 2 nieaktualne) | 10 uwag do tego pliku (R1-U01 … R1-U10; 6 istotnych, 4 drobne) | wszystkie 10 — naniesione przez koordynatora 11.10.2026 (tekst recenzenta, bez własnych wniosków koordynatora); liczby powtórnie sprawdzone przez koordynatora | — | `recenzje/R1.md` (streszczenie w `10-REVIEW.md`) |
| R4 — niezależny agent-recenzent (grupa: `A3` + `06`; ten plik poza grupą) | 13.10.2026 | brak werdyktu dla tego pliku (uwaga wspólna dla grupy i `01`) | 1 uwaga do tego pliku (R4-U30, drobna: head PR #225 to `c2ab6a8` od 11.10) | R4-U30 — naniesiona przez redaktora poprawek 13.10.2026 po sprawdzeniu (`git log -1 c2ab6a8`: 11.10.2026 14:32 UTC; stany F0-G03/G09 w `acceptance-plan.md` @`c2ab6a8` bez zmian); miejsce oznaczone **[R4]** w § 2 | — | `recenzje/R4.md` (streszczenie w `10-REVIEW.md`) |
