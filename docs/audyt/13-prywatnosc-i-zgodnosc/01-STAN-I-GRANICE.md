# 01 — Stan obecny i granice audytu

| | |
|---|---|
| Etap | Rozpoznanie projektu i dostępu (pkt 2 zadania) |
| Autor | koordynator (główna sesja) |
| Data | 7.10.2026 |
| Wersja kodu | `origin/main` @ `7c0097f` (2026-10-07 17:38 +0200, scalenie PR #243) |
| Gałąź robocza | `claude/gallant-faraday-ypjokp` = `origin/main`, drzewo czyste, brak lokalnych zmian |
| Recenzja | patrz `10-REVIEW.md` (etap R1) |

## 1. Po co ten plik

Ustala, na czym stoi audyt: jaki kod czytaliśmy, co jest w aplikacji, do
czego mieliśmy dostęp, a do czego nie. Każdy wniosek w pozostałych plikach
trzeba czytać przez pryzmat ograniczeń z sekcji 5.

## 2. Wersja kodu i zmiany w toku

- Audyt dotyczy `7c0097f` (HEAD `origin/main` w chwili startu). Nie było
  lokalnych zmian ani nieśledzonych plików.
- Otwarte PR na 7.10.2026 (odczyt przez GitHub API):

| PR | Tytuł (skrót) | Znaczenie dla tego audytu |
|---|---|---|
| #225 (Codex, niescalony) | F0: wybory właściciela, dowody i bezpieczny inwentarz | **Istotny.** `docs/observability/*` na gałęzi `codex/f0-runtime-inventory` zawiera deklarowany pomiar produkcji z 4.10, odczyty API dostawców z 6.10 i przyjętą (niewdrożoną) politykę danych obserwowalności. Używamy go jako dowodu pośredniego, z oznaczeniem poziomu. |
| #244, #195, #189 | KSeF: ponowienia, ROZ, kody błędów | Integralność przetwarzania (SOC 2 PI); nie zmieniają przetwarzania danych osobowych. |
| #190, #193, #197 (szkice) | Bezpieczeństwo: dowody XML, obraz workera, sekrety buildu | Pośrednio SOC 2 (CC6/CC8). |
| #236 | Plan agenta | Dokumentacja. |

## 3. Co jest w aplikacji (potwierdzone w kodzie)

| Obszar | Stan | Dowód |
|---|---|---|
| Framework | Next.js 16.3.8 App Router, React 19; `proxy.ts` zamiast `middleware.ts` | `package.json`, `proxy.ts` |
| Rozmiar | 74 strony (`page.tsx`), 19 handlerów tras (`route.ts`), 34 pliki `'use server'` | `find app -name page.tsx`, `find app -name route.ts`, grep `'use server'` |
| Uwierzytelnianie | Supabase GoTrue: e-mail/hasło, Google OAuth, MFA TOTP | `app/(auth)/login/actions.ts:102` (`signInWithOAuth`), `app/(dashboard)/settings/security/actions.ts:172` (`mfa.enroll`) |
| Baza | Postgres z RLS, 131 plików migracji (`00001`–`00147` z lukami, `00200`) | `supabase/migrations/` |
| Zadania w tle | pg-boss w tym samym Postgresie (schemat `pgboss`), worker jako osobny proces | `lib/jobs/boss.ts:28-36`, `lib/jobs/worker.ts` |
| Pliki | klient S3 (MinIO), zmienne `R2_*` | `lib/storage/r2.ts` |
| Integracje (wg `.env.example` i kodu) | KSeF (MF), Stripe, Resend, Sentry, PostHog, Anthropic (support, OCR), Redis przez REST, GUS, web push (VAPID), Slack, Telegram, heartbeat, AWS (zmienne archiwum) | `.env.example`; szczegóły i potwierdzenia w `04-PROCESORZY-I-LOKALIZACJE.md` |
| Strony prawne | polityka prywatności, regulamin, strona RODO | `app/(marketing)/legal/*/page.tsx` |
| Administrator w polityce | **placeholder** „[nazwa firmy], NIP [TWÓJ_NIP], z siedzibą w Poznaniu” | `app/(marketing)/legal/polityka-prywatnosci/page.tsx:20-21` |
| Mechanizmy RODO | eksport (`app/api/gdpr/export/route.ts`), usunięcie z 14-dniowym okresem (`lib/gdpr/*`, ADR 0006), zgoda analityczna (`lib/analytics/consent.ts`) | szczegóły w `A1-…`, `A2-…` |
| Testy | 436 plików `*.test.ts` w `tests/`, 10 specyfikacji e2e | `find tests -name '*.test.ts'`, `find e2e -name '*.spec.ts'` |
| CI | 5 workflow: `ci.yml`, `security.yml`, `e2e-staging.yml`, `agent.yml`, `agent-guard.yml` | `.github/workflows/` |

`agent.yml` uruchamia agenta Claude Code (Anthropic) na treści issue
oznaczonego `agent:napraw`. To przepływ kodu i treści zgłoszeń, nie danych
klientów, ale treść issue trafia do zewnętrznego dostawcy (`.github/workflows/agent.yml:1-30`).

## 4. Infrastruktura (z dokumentacji — nie weryfikowana w tej sesji)

Według `AGENTS.md` (sekcja „Infrastruktura i dostępy”): trzy serwery
Hetznera w regionie NBG1 (aplikacja i worker, panel Coolify, Supabase
self-hosted), wdrożenia ręczne przez Coolify, migracje wgrywane ręcznie
przez SSH. Adresy i nazwy kontenerów są celowo poza repozytorium.

Niescalony PR #225 (pomiar operatora z 4.10.2026, deklaracje z 6–7.10)
koryguje `AGENTS.md` w punktach istotnych dla prywatności:

| Teza w `AGENTS.md` | Według PR #225 | Poziom dowodu |
|---|---|---|
| MinIO aplikacji na `db-1` | MinIO aplikacji na `ops-1`; na `db-1` osobny MinIO dla Supabase Storage | pomiar operatora 4.10 |
| (zmienne `UPSTASH_*`) | Redis lokalny (`redis:7.2` + SRH) na `app-1`, nie Upstash | pomiar operatora 4.10 |
| — | Sentry i PostHog: intake w regionie EU | pomiar 4.10 + API 6.10 |
| — | Brak pełnej kopii bazy i MinIO poza hostem źródłowym; lokalny nocny `pg_dump`; snapshot JSON schematu `public` na drugim hoście; obrazy hosta Hetznera tylko dla `db-1` | pomiar 4.10 + API 6.10 |
| — | Staging nie istnieje; produkcja ma `KSEF_ENV=test` | pomiar 4.10 |

Żadnego z tych faktów nie sprawdziliśmy sami. W raportach oznaczamy je
jako „pomiar/deklaracja operatora z PR #225”.

## 5. Środowisko audytu i ograniczenia dowodowe

| Ograniczenie | Skutek | Jak oznaczamy |
|---|---|---|
| Sesja w chmurze: brak `.env.local`, brak `.agents/infra.env`, brak klucza SSH, brak `docs/automation/` | Brak dostępu do produkcji, bazy produkcyjnej, Coolify, logów, kopii. Brak prywatnych dzienników napraw `AUD-NN`. | „niezweryfikowane — brak dostępu do produkcji” |
| Brak dostępu do paneli i umów dostawców (Sentry, PostHog, Stripe, Resend, Anthropic, Hetzner, Google, Cloudflare) | Nie znamy treści DPA, ustawień retencji, regionów dodatkowych funkcji, list dalszych procesorów | „stan umowy nieznany; nie zgadujemy treści” |
| Egress sieci filtrowany polityką organizacji (sprawdzone 7.10.2026 ok. 18:55 UTC) | **Zablokowane (403):** eur-lex.europa.eu, edpb.europa.eu, uodo.gov.pl, isap.sejm.gov.pl, api.sejm.gov.pl, eli.gov.pl, aicpa-cima.com, gov.pl, ec.europa.eu, strony dostawców (supabase.com, posthog.com, sentry.io, stripe.com, resend.com, hetzner.com, upstash.com, cloudflare.com). **Dostępne:** github.com, raw.githubusercontent.com, www.anthropic.com/legal/*, registry.npmjs.org. | Źródła pierwotne prawa i AICPA: „niezweryfikowane online 7.10.2026 — egress zablokowany; identyfikacja wg wiedzy modelu” |
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

**W zakresie:** cały kod aplikacji i workera na `7c0097f`, migracje,
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

| Etap | Autor | Plik wynikowy | Recenzent |
|---|---|---|---|
| Rozpoznanie | koordynator | `01-STAN-I-GRANICE.md` | R1 (osobny agent) |
| Inwentarz i przepływy | agent INWENTARZ | `02-INWENTARZ-I-PRZEPLYWY.md` | R1 |
| Research źródeł | agent ŹRÓDŁA | `03-REJESTR-ZRODEL.md` | R2 |
| Procesorzy i lokalizacje | agent PROCESORZY | `04-PROCESORZY-I-LOKALIZACJE.md` | R2 |
| Mechanizmy: minimalizacja, zgody | agent MECHANIZMY-A | `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` | R3 |
| Mechanizmy: prawa, retencja, AI | agent MECHANIZMY-B | `A2-MECHANIZMY-PRAWA-RETENCJA.md` | R3 |
| Dowody i testy | agent SOC2-DOWODY | `A3-DOWODY-I-TESTY.md` | R4 |
| Test runtime cookies i sieci | agent RUNTIME | `A4-TEST-COOKIES-I-SIECI.md` + `narzedzia/` | R3 |
| Macierz wymagań (analiza luk) | koordynator | `05-MACIERZ-WYMAGAN.md` | R3 |
| SOC 2 | agent SOC2-DOWODY | `06-SOC2.md` | R4 |
| Plan etapów | koordynator | `07-PLAN-ETAPOW.md` | R4 |
| Niewiadome i review prawne | koordynator | `08-NIEWIADOME-I-REVIEW-PRAWNE.md` | R5 |
| Kompletność całości | — | `10-REVIEW.md` | R5 (niezależny) |

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
