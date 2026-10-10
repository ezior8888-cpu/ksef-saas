# 04 — Procesorzy, lokalizacje i transfery (rejestr odbiorców danych)

| | |
|---|---|
| Etap | Procesorzy, lokalizacje i transfery (pkt 5F zadania, `00-ZADANIE.md`) |
| Autor | agent PROCESORZY |
| Data | 10.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza zawiera to scalenie) |
| Zakres | rzeczywiści odbiorcy danych odtworzeni z kodu, konfiguracji w repo i dokumentów operacyjnych; role, dane, regiony, transfery, DPA, retencja dostawców; ocena łańcucha; projekt listy dalszych procesorów dla klientów; porównanie z deklaracjami stron prawnych |
| Źródła danych | kod (`lib/**`, `app/**`, `components/**`, `ops/**`, `scripts/**`, `instrumentation*.ts`, `sentry.*.config.ts`, `next.config.ts`, `lib/security/csp.ts`, `Dockerfile`, `.github/workflows/*`, `renovate.json`, `.env.example`), zainstalowane SDK w `node_modules` (wersje z `package.json`), dokumenty repo (`AGENTS.md`, `docs/runbooks/*`, ADR 0007/0009, `docs/security/rto-rpo.md`, `docs/migration/*`), niescalony PR #225 (`origin/codex/f0-runtime-inventory` @ `686a465`), publiczna dokumentacja dostawców odczytana 10.10.2026 (sekcja 8) |
| Stan | gotowe do recenzji R2 (autor nie zatwierdza własnego etapu) |
| Ograniczenia | brak dostępu do produkcji, paneli i umów dostawców; egress filtrowany (strony dostawców i źródła prawa zablokowane); bez WebSearch; fakty z PR #225 to pomiar lub deklaracja operatora, niezweryfikowane w tej sesji; przepisy podane z wiedzy modelu są oznaczone |

Oznaczenia używane niżej:

- **[PR225]** — „PR #225 (niescalony), plik:sekcja — pomiar/deklaracja operatora, niezweryfikowane w tej sesji”.
- **[NZ]** — „niezweryfikowane online 2026-10-10 (egress zablokowany) — treść wg wiedzy modelu, do potwierdzenia w końcowym review”.
- **[DOK-n]** — dokumentacja dostawcy odczytana 10.10.2026, lista w sekcji 8.2. Dokumentacja (także kopia w repozytorium GitHub dostawcy) nie jest umową FaktFlow.
- Stany: potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy. Klasy: P obowiązek prawny, O interpretacja organu, S kryterium SOC 2, I praktyka inżynierska. Identyfikatory kryteriów SOC 2 (CC6.1, CC7.1, CC9.2, A1.2) podano według wiedzy modelu — tekst AICPA nie był dostępny w tej sesji [NZ].
- Nazwy podmiotów i siedziby dostawców (np. „Plus Five Five, Inc.”, „Stripe Payments Europe, Ltd.”, „AWS EMEA SARL”, „Telegram FZ-LLC”, siedziba Hetznera) podano według wiedzy modelu [NZ]; potwierdzone w dokumentach są tylko podmioty Anthropic [DOK-1], [DOK-2] i lista dalszych procesorów PostHog [DOK-6].
- „Nie znaleziono w repo” nie znaczy „nie istnieje”. Repo nie zawiera żadnej umowy z dostawcą, więc kolumna DPA brzmi wszędzie „nie znaleziono w repo; stan umowy nieznany”, chyba że niżej podano coś więcej.

## 0. Jak odtworzono odbiorców

1. Lista domen w kodzie i konfiguracji: `grep -rhoE "https?://…"` po `lib app scripts components ops instrumentation*.ts sentry.*.config.ts next.config.ts proxy.ts Dockerfile .github renovate.json .env.example` — 66 różnych hostów; po odrzuceniu przestrzeni nazw XML, linków dokumentacji i placeholderów zostały hosty z tabeli 1.
2. SDK z `package.json`: `@anthropic-ai/sdk` 0.95.0, `@aws-sdk/client-s3` 3.1032.0, `@sentry/nextjs` 10.53.1, `posthog-js` 1.374.3, `posthog-node` 5.34.7, `resend` 6.12.0, `stripe` 22.1.1, `@upstash/redis` 1.38.0, `web-push` 3.6.7, `pg-boss` 12.27.0 (wersje odczytane z `node_modules`).
3. Każde wywołanie sieciowe prześledzone do miejsca, w którym powstaje treść (co dokładnie wychodzi) i do warunku włączenia (zmienna środowiskowa, zgoda, akcja użytkownika, cron).
4. CSP (`lib/security/csp.ts:7-42`) jako kontrola krzyżowa: przeglądarka może łączyć się tylko z `'self'`, `challenges.cloudflare.com`, originem Supabase, `fonts.googleapis.com`/`fonts.gstatic.com` (style, fonty), dowolnym `https:` dla obrazów; `form-action` dopuszcza `accounts.google.com`, `checkout.stripe.com`, `billing.stripe.com`. PostHog i Sentry z przeglądarki idą przez własny serwer: `/ingest` (`next.config.ts:140-155`) i `/monitoring` (`tunnelRoute`, `next.config.ts:189`).
5. Dokumenty operacyjne (runbooki, migracja, ADR, `AGENTS.md`) dla odbiorców spoza kodu aplikacji: poczta, kopie, agenci, DNS.

## 1. Rejestr odbiorców danych

Rola to **propozycja do review prawnego** (art. 4 pkt 7–9, art. 26, art. 28 RODO; wytyczne EROD 07/2020 — [NZ]). „Dalszy procesor” oznacza dalszy podmiot przetwarzający wobec klientów FaktFlow, dla danych, które FaktFlow przetwarza jako ich procesor (`02-INWENTARZ-I-PRZEPLYWY.md` § 4.2).

### 1.1. Infrastruktura i oprogramowanie własne

| ID | Odbiorca | Usługa | Rola (propozycja) | Dane / osoby | Dowód w kodzie | Region (źródło) | Transfer poza EOG i mechanizm (status) | DPA (stan) | Retencja dostawcy | Uwagi |
|---|---|---|---|---|---|---|---|---|---|---|
| R-01 | Hetzner Online GmbH (DE) | 3 serwery chmurowe (`app-1` aplikacja i worker, `ops-1` Coolify, MinIO aplikacji, Uptime Kuma, bramka; `db-1` Supabase), funkcja backupu obrazów dla `db-1`; planowany Storage Box | procesor FaktFlow; dalszy procesor dla danych klientów | wszystkie kategorie z `02-…` § 2: konta, faktury, kontrahenci (w tym PESEL nabywców B2C), pliki, logi, kopie | brak SDK; infrastruktura: `AGENTS.md` § „Serwery”; `scripts/hetzner/db-backup.sh:14-21`; `docs/adr/0009-pg-dump-na-db-1-i-storage-box.md:25-28` | NBG1 (Norymberga, DE) według `AGENTS.md`; „lokalizacja DE” dla trzech VM z API 06.10 [PR225] `runtime-inventory.md` § „Odczyty dostawców”; MinIO aplikacji na `ops-1` [PR225]; Storage Box wybrany w HEL1, Finlandia — decyzja niewykonana [PR225] `evidence/f0-decisions-2026-10-07.json` | siedziba i lokalizacja w EOG; dostęp zdalny dostawcy (wsparcie, ratunkowy dostęp do konsoli) i dalsi procesorzy Hetznera — niezweryfikowane | nie znaleziono w repo; stan umowy nieznany | obrazy backupu `db-1`: 7, ostatni 06.10 [PR225]; los danych po usunięciu VM — nieznany | strony prawne podają „Frankfurt” — wg [NZ] Hetzner nie ma centrum danych we Frankfurcie (PRC-03) |
| R-02 | Oprogramowanie self-hosted: Supabase (Postgres, GoTrue, PostgREST, Kong, Studio, MinIO Storage), MinIO aplikacji, Redis 7.2 + SRH, Coolify, Uptime Kuma, pg-boss | — | **nie jest odbiorcą**, o ile nie wysyła telemetrii; operator sprzętu = R-01 | — | Coolify: domyślnie pobiera wersje z `cdn.coollabs.io` (dane serwera), Sentry samego Coolify tylko przy ustawionym `SENTRY_DSN` (brak domyślnego DSN w `.env.production`), pole `do_not_track` w ustawieniach instancji [DOK-11]; upstreamowy `docker-compose.yml` Supabase bez wpisów telemetrii [DOK-10]; obecny szablon Supabase w Coolify kieruje logi usług (Vector → Logflare) do lokalnej bazy (`POSTGRES_BACKEND_SCHEMA=_analytics`), wariant BigQuery jest zakomentowany, a MinIO Storage to obraz budowany przez Coolify (`ghcr.io/coollabsio/minio:RELEASE.2025-10-15…`) [DOK-11] — szablon z dnia instalacji (sierpień 2026) nieodczytany; MinIO: repozytorium społeczności „no longer maintained”, dystrybucja tylko ze źródeł [DOK-12] | jak R-01 | n/d | n/d | n/d | konfiguracja instancji (Coolify, Studio, MinIO, Kuma) nieodczytana; MinIO bez wsparcia to ryzyko art. 32 (PRC-13) |

### 1.2. Dostawcy usług z danymi osobowymi

| ID | Odbiorca | Usługa | Rola (propozycja) | Dane / osoby | Dowód w kodzie | Region (źródło) | Transfer poza EOG i mechanizm (status) | DPA (stan) | Retencja dostawcy | Uwagi |
|---|---|---|---|---|---|---|---|---|---|---|
| R-03 | Functional Software, Inc. — Sentry (US) | błędy i transakcje (próbkowanie 0,1) z przeglądarki, Node, Edge; błędy workera; upload map źródeł przy buildzie | procesor FaktFlow; dalszy procesor dla danych klientów, które przenikną do komunikatów błędów | UUID użytkownika (`user` zredukowany do `id`), tag `tenantId`, nazwa kolejki, komunikaty błędów po redakcji (`e-mail`, tokeny, parametry URL usuwane), user agent; IP z przeglądarki nie jest wnioskowane (`infer_ip: 'never'` przy `sendDefaultPii: false`) | `instrumentation-client.ts:5-21`; `sentry.server.config.ts:4-12`; `sentry.edge.config.ts:4-12`; `lib/jobs/sentry.ts:23-38`; `lib/observability/scrub.ts:4-79`; `lib/observability/sentry-context.ts:23-33`; `next.config.ts:189`; `Dockerfile:53-72`; SDK: `node_modules/.pnpm/@sentry+browser@10.53.1/…/esm/prod/client.js:26-29` | region wynika z DSN, którego nie ma w repo; intake EU według pomiaru 04.10 i API 06.10 [PR225]; region EU = Frankfurt [DOK-5] | **tak, częściowo potwierdzone w dokumentacji**: konta użytkowników Sentry, ustawienia organizacji, metadane projektu, logi audytu organizacji i treści zgłoszeń do supportu są przechowywane w US niezależnie od regionu [DOK-5]; mechanizm (DPF/SCC) — [NZ] | nie znaleziono w repo; stan umowy nieznany | nieodczytana (plan darmowy według deklaracji 07.10 [PR225]); docelowo Team EU, błędy 90 dni, spany 30 dni — decyzja niewykonana [PR225] `evidence/f0-2026-10-10.json` | Sentry w przeglądarce bez bramki zgody (`instrumentation-client.ts:5`) — ocena podstawy w `A1-…` |
| R-04 | PostHog Inc. (US) | analityka produktu: przeglądarka (po zgodzie) i serwer (bez zgody) | procesor FaktFlow | `distinctId` = UUID użytkownika lub organizacji, zdarzenia z listy dozwolonych, właściwości po filtrze; przeglądarka: `ip: false`, pamięć `memory`, bez autocapture, replay, heatmap; ruch przeglądarki przez `/ingest` własnego serwera | `lib/analytics/init-posthog-browser.ts:23-54`; `lib/analytics/server.ts:22-55`; `lib/analytics/posthog-node-client.ts:28-36`; `next.config.ts:140-155`; wywołania serwerowe m.in. `app/(auth)/register/actions.ts:95`, `lib/stripe/webhook-handlers.ts:103`, `lib/jobs/runners/submit-invoice.ts:1933` | EU wynika z kodu: `eu.i.posthog.com` i `eu-assets.i.posthog.com` (`next.config.ts:144-152`, `posthog-node-client.ts:30-32`, `.env.example:193`); intake EU potwierdzony pomiarem [PR225]; EU Cloud = Frankfurt [DOK-6] | **tak, potwierdzone w dokumentacji**: DPA PostHog pkt 10.2 — przetwarzanie „outside of the Protected Area including in the US”; dalsi procesorzy rdzenia: AWS (DE dla EU Cloud), PlanetScale, Modal Labs (DE dla EU), Wiz (DE/FR), Cloudflare (globalna sieć dla danych w tranzycie) [DOK-6], [DOK-7]; mechanizm w DPA: DPF (10.3), SCC (10.4) [DOK-7] | nie znaleziono w repo; PostHog oferuje samoobsługowy DPA na każdym planie, także darmowym [DOK-6] — czy zawarty: nieznane | Product Analytics 1 rok, replay 1 miesiąc (uprawnienia organizacji z API 06.10 [PR225]) | ustawienia projektu: replay opt-in i heatmaps **włączone**, kod je wyłącza [PR225] (PRC-09) |
| R-05 | Resend (Plus Five Five, Inc., US) | e-maile aplikacji (transakcyjne, produktowe, faktura do nabywcy z PDF, wezwania do zapłaty z PDF, paczki księgowe z załącznikami); webhooki doręczeń; według dokumentów także SMTP dla GoTrue i dla odpowiedzi z poczty pomocy | procesor FaktFlow; dalszy procesor dla e-maili wysyłanych w imieniu klienta | adresy i treści do: użytkowników, kontrahentów klientów (faktura, wezwanie), księgowych (paczki z fakturami, wyciągami); załączniki PDF; zdarzenia odbić i skarg | `lib/email/send.ts:146-218`, `:550-578`; `lib/jobs/runners/send-reminder.ts:75-80`; `lib/jobs/runners/co-pilot-monthly.ts:483-580`; `app/api/email/resend-webhook/route.ts`; GoTrue: `docs/migration/PRZEPROWADZKA-HETZNER.md:493-499`; poczta pomocy: `docs/runbooks/skrzynka-pomoc.md:71-79` | API globalne `api.resend.com` (SDK `resend` 6.12.0); region wysyłki ustawia się dla domeny w panelu (SDK zna `us-east-1`, `eu-west-1`, `sa-east-1`, `ap-northeast-1`) — w repo brak; polityka prywatności podaje „US” | prawdopodobny (US); mechanizm: polityka deklaruje SCC — stan umowy nieznany, [NZ] | nie znaleziono w repo; stan umowy nieznany | nieznana (historia wysyłek w panelu dostawcy) | e-maile do kontrahentów mają `Reply-To` na skrzynkę pomocy (`lib/email/send.ts:198-200`) — łączy R-05 z R-25 |
| R-06 | Anthropic: Anthropic Ireland, Limited (strona umowy dla klientów z EOG), Anthropic PBC (US) | Messages API: OCR dokumentów kosztowych, klasyfikacja KPiR, czat supportu (streaming) | procesor FaktFlow (Commercial Terms + DPA); dalszy procesor dla dokumentów klientów | obrazy i PDF dokumentów kosztowych (pełna treść, także dane osób na paragonach i fakturach); dla każdej faktury kosztowej z KSeF: nazwa i NIP sprzedawcy, numer, nazwy pozycji, kwota brutto; treść rozmowy z czatem (pytania użytkowników, mogą zawierać dane osób trzecich) | `lib/anthropic/client.ts:13-21` (brak `baseURL`); `lib/ocr/engine.ts:144-158`; `lib/categorization/ai-classifier.ts:34-50`, `lib/categorization/index.ts:71-76`; automatycznie z `lib/jobs/runners/auto-categorize-inbox.ts:296` i `process-ocr.ts:390`; `lib/support/chat.ts:75-84`; FLO **nie** wysyła: `lib/flo/llm.ts:1-3`, brak importu `generateCopy`, `tests/unit/flo-nieaktywne.test.ts` | brak parametru `inference_geo` w wywołaniach → domyślna geografia obszaru roboczego; w dokumentacji SDK jedyne udokumentowane wartości `inference_geo` to `"us"` i `"global"` — opcji UE w API Anthropic nie znaleziono [DOK-4]; polityka prywatności Anthropic: dane przekazywane do US [DOK-2] | **tak, potwierdzone w dokumentach Anthropic**: DPA wbudowuje SCC moduł 2 i 3 (pkt I.1), Commercial Terms włączają DPA przez odesłanie [DOK-1], [DOK-3]; czy konto FaktFlow działa na Commercial Terms — nieznane | DPA jest częścią Commercial Terms [DOK-1]; stan konta i akceptacji — nieznany | DPA H.1: usunięcie danych klienta w 30 dni po zakończeniu umowy [DOK-3]; retencja pojedynczych żądań API — nie znaleziono w odczytanych dokumentach | Commercial Terms: zakaz trenowania na treściach klienta [DOK-1]; lista dalszych procesorów na `trust.anthropic.com` — zablokowana |
| R-07 | Stripe (Stripe Payments Europe, Ltd., IE / Stripe, Inc., US) | płatności abonamentu, klient Stripe, portal klienta, webhooki | dla danych billingowych FaktFlow: częściowo procesor, częściowo odrębny administrator (typowa konstrukcja umów płatniczych [NZ]); nie dotyczy danych klientów jako procesora | e-mail, nazwa, NIP klienta FaktFlow, `tenantId` w metadanych, `tax_id`; dane karty trafiają wprost do Stripe | `lib/stripe/customer.ts:90-104`; `lib/stripe/webhook-handlers.ts`; `lib/security/csp.ts:12-13`; konfiguracja „deferred — wymaga firmy”: `scripts/check-env.ts:124-127` | globalny; polityka: „US” | prawdopodobny; polityka deklaruje SCC — [NZ] | nie znaleziono w repo; stan umowy nieznany | nieznana; obowiązki przechowywania po stronie Stripe [NZ] | możliwe, że w produkcji nieaktywny (zmienne „deferred”) |
| R-08 | Cloudflare, Inc. (US) | (a) Turnstile na logowaniu, rejestracji, resecie hasła; (b) DNS domeny; (c) Email Routing i Email Worker dla poczty na domenę; (d) proxy/CDN — tryb nieustalony; (e) R2 — historyczny magazyn, nadal domyślny w kodzie przy pustym `R2_ENDPOINT` | (a), (c) procesor FaktFlow; (b) dostawca DNS (bez treści użytkowników); (d) gdyby proxy było włączone — procesor całego ruchu | (a) token, IP klienta (`remoteip`), sygnały przeglądarki — osoby logujące się i rejestrujące; (c) **pełne wiadomości** na dowolny adres w domenie: klienci, kontrahenci odpowiadający na faktury, osoby bez konta, wnioski RODO | (a) `lib/security/turnstile.ts:116-129`, `components/auth/turnstile-widget.tsx:25-38`, `lib/security/csp.ts:8,29,34`, wywołania w `app/(auth)/{login,register,forgot-password}/actions.ts`; (c) `ops/poczta/worker.mjs:1-12`, `docs/runbooks/skrzynka-pomoc.md:24-64`; (b),(d) `AGENTS.md` (apex i www „DNS only”), `docs/migration/PRZEPROWADZKA-HETZNER.md:445-449,483-484` (instrukcja przełączenia na „Proxied”); (e) `lib/storage/r2-client.ts:31-38,53` | globalna sieć; region nie wynika z repo | prawdopodobny; [NZ] mechanizm | nie znaleziono w repo; stan umowy nieznany | nieznana | Turnstile według dokumentacji działa „on behalf of the website operator” [DOK-8]; Email Routing nie występuje w polityce prywatności |
| R-09 | Google (Google Ireland Ltd / Google LLC) | (a) logowanie Google przez GoTrue; (b) Google Fonts (Material Symbols) ładowane przez przeglądarkę na **każdej** stronie; (c) FCM (patrz R-10); (d) docelowe skrzynki poczty pomocy „np. Gmail” (patrz R-25) | (a) odrębny administrator konta Google; (b) odbiorca IP i nagłówków odwiedzającego z inicjatywy strony — rola do oceny | (a) e-mail, imię, zdjęcie profilu, identyfikator Google; (b) IP, user agent, `Referer` każdego odwiedzającego, także przed jakąkolwiek zgodą | (a) `app/(auth)/login/actions.ts:97-113`, `lib/security/csp.ts:12`; (b) `app/layout.tsx:114-125`, `lib/security/csp.ts:30,32`. Obrazy z `lh3.googleusercontent.com` idą przez optymalizator `next/image` (`next.config.ts:92-100`, `components/marketing/blog-article-card.tsx:25-31`) — żądanie wysyła serwer, nie przeglądarka; stałe w `components/dashboard/ff-assets.ts` nie mają użycia | globalny | prawdopodobny (US) — [NZ] | (a), (b) nie dotyczy umowy powierzenia; (d) patrz R-25 | nieznana | brak w polityce prywatności (PRC-01, PRC-10) |
| R-10 | Usługi push przeglądarek: Google FCM, Mozilla autopush, Apple Push, Microsoft WNS | doręczenie powiadomień push | dostawca transportu wybrany przez przeglądarkę użytkownika; rola do oceny | adres subskrypcji (identyfikator przeglądarki), metadane; treść szyfrowana (`web-push`, RFC 8291) | `lib/push/endpoint.ts:11-19`; `lib/push/sender.ts:74-110`; wywołania m.in. `lib/jobs/runners/inbox-polling.ts:475`, `notify-user.ts:141` | globalne | prawdopodobny; n/d | n/d | TTL wiadomości 24 h (`lib/push/sender.ts:111`) | treść niewidoczna dla dostawcy |
| R-17 | Slack (Slack Technologies, LLC / Salesforce, US) | webhooki alertów (`urgent`, `bugs`, `metrics`); powiadomienia Uptime Kuma według dokumentu migracji | procesor FaktFlow | e-mail użytkownika przy eskalacji czatu do człowieka; UUID konwersacji i organizacji; liczniki | `lib/alerts/slack.ts:23,43-60`; `lib/support/support-actions.ts:76-83`; `app/api/support/chat/route.ts:178-185`; `lib/jobs/runners/cert-expiry-alert.ts:227-237`; `docs/migration/PRZEPROWADZKA-HETZNER.md` § 7 pkt 2 | US / globalny | prawdopodobny; [NZ] | nie znaleziono w repo; stan umowy nieznany | nieznana (zależna od planu) | konfiguracja opcjonalna (`scripts/check-env.ts:97-99`); deklaracja 07.10: „Slack roboczo” [PR225] |
| R-18 | Telegram (Telegram FZ-LLC, ZEA / Telegram Messenger Inc.) | alerty krytyczne i pilne, raport dzienny, bramka operatorska (polecenia), powiadomienia o poczcie | odbiorca bez umowy powierzenia — [NZ]; kod zakłada brak danych osobowych w treści | liczby i statusy; UUID organizacji z liczbą dni do wygaśnięcia certyfikatu (kanał `urgent` → także Telegram); lokalna część adresu i kategoria poczty; identyfikatory czatów i konta operatorów | `lib/alerts/telegram.ts:12-16`; `lib/alerts/slack.ts:93-113,133-151`; `lib/jobs/runners/cert-expiry-alert.ts:227-237`; bramka: `ops/bramka/src/clients.mjs:32-56`, `supabase/migrations/00100_ops_gate.sql:104-123` (tylko agregaty); poczta: `ops/poczta/worker.mjs:44-53,66` | poza EOG — [NZ] | tak; mechanizmu z art. 44–46 nie widać — [NZ] | nie znaleziono w repo | nieznana | minimalizacja zapisana w kodzie (`lib/alerts/telegram.ts:12-14`, `ops/poczta/worker.mjs:8-10`) — UUID organizacji to wciąż identyfikator pośredni (PRC-12) |
| R-19 | Strażnik heartbeat: `OPS_HEARTBEAT_URL` (Healthchecks.io **albo** Uptime Kuma — repo nie rozstrzyga); `HC_URL` w skrypcie kopii (`hc-ping.com` = Healthchecks.io) | sygnał „żyję” z workera i z nocnego zrzutu | **nie dotyczy** danych osobowych (ping bez treści; IP serwera) | — | `lib/jobs/heartbeat.ts:12-13,29-38,73`; `scripts/hetzner/db-backup.sh:19,46-49`; `scripts/check-env.ts:102` | nieznany; [PR225] decyzja: Healthchecks Hobbyist, `processing_chain_EU_guaranteed: false` | n/d | n/d | n/d | dostawcy nie zgadujemy; wartość zmiennej poza repo |
| R-20 | Amazon Web Services (AWS EMEA SARL / Amazon.com, Inc.) | S3 Glacier Deep Archive — archiwum XML faktur starszych niż ok. 2 lata | dalszy procesor (gdy skonfigurowany) | pełne XML FA(3): sprzedawca, nabywca (NIP, PESEL lub numer dokumentu), pozycje, rachunek | `lib/storage/glacier.ts:5-28,50-58`; `lib/jobs/runners/archive-old-invoices.ts:12-110`; cron codziennie 3:00: `lib/jobs/queues.ts:89`, `lib/jobs/handlers/package-a.ts:42`; zmienne „deferred”: `scripts/check-env.ts:132-135` | domyślnie `eu-central-1` (Frankfurt) w kodzie (`glacier.ts:10`); konfiguracja produkcji nieznana | możliwy dostęp z US — [NZ] | nie znaleziono w repo; stan umowy nieznany | obiekt usuwany po 8 latach od archiwizacji (`archive-old-invoices.ts:97-100`) | polityka prywatności nazywa to „Backup” — w kodzie to archiwum, nie kopia zapasowa (PRC-03) |

### 1.3. Odbiorcy publiczni (rejestry i administracja)

| ID | Odbiorca | Usługa | Rola (propozycja) | Dane / osoby | Dowód w kodzie | Region | Transfer | DPA | Retencja | Uwagi |
|---|---|---|---|---|---|---|---|---|---|---|
| R-11 | Ministerstwo Finansów — KSeF | wysyłka faktur, skrzynka odbiorcza, UPO | odrębny administrator z mocy prawa [NZ] | XML FA(3), w tym dane nabywców (NIP, PESEL lub dokument), poświadczenia klienta | `lib/ksef/client.ts:7-17`; `.env.example:83-84` | PL | nie | nie dotyczy (przepis prawa) | według przepisów | produkcja ma `KSEF_ENV=test` [PR225] |
| R-12 | MF — wykaz podatników VAT (biała lista) | weryfikacja NIP i rachunków | odrębny administrator rejestru publicznego | NIP kontrahenta w zapytaniu | `lib/validation/whitelist-client.ts:5` | PL | nie | n/d | n/d | także cykliczne sprawdzanie w tle (`02-…` § 3.2) |
| R-13 | VIES (Komisja Europejska i administracje VAT państw UE) | weryfikacja numeru VAT UE | odrębni administratorzy | numer VAT kontrahenta | `lib/validation/vies-client.ts:5-6` | UE | nie | n/d | n/d | |
| R-14 | GUS — BIR (REGON) | dane rejestrowe po NIP | odrębny administrator | NIP | `lib/gus/client.ts:24-25,222-225` | PL | nie | n/d (regulamin API) | n/d | |
| R-15 | NBP | kursy walut | nie dotyczy | brak danych osobowych | `lib/nbp/client.ts:13` | PL | nie | n/d | n/d | |
| R-16 | Have I Been Pwned — Pwned Passwords | sprawdzenie hasła w bazie wycieków | nie dotyczy — model k-anonimowości | 5 pierwszych znaków skrótu SHA-1 hasła, IP serwera | `lib/auth/breach-check.ts:17,35-43` | globalny [NZ] | n/d | n/d | n/d | polityka opisuje to poprawnie (sekcja 7 polityki) |

### 1.4. Narzędzia wytwórcze i operacyjne, poczta, dostawcy historyczni

| ID | Odbiorca | Usługa | Rola (propozycja) | Dane / osoby | Dowód | Region | Transfer poza EOG i mechanizm | DPA (stan) | Retencja | Uwagi |
|---|---|---|---|---|---|---|---|---|---|---|
| R-22 | GitHub, Inc. (Microsoft, US) | publiczne repozytorium, Actions (CI, CodeQL, przegląd zależności), issues i PR; Renovate | odbiorca danych zespołu; danych klientów — nie, o ile nikt ich nie wklei | dane autorów commitów, treści issue i PR; CI na danych syntetycznych | `.github/workflows/{ci,security,e2e-staging,agent,agent-guard}.yml`; `renovate.json`; `docs/runbooks/agent-kodu.md:113-117` (warunek: brak danych klientów w zadaniach) | US | tak; [NZ] | n/d dla danych klientów | — | repo publiczne: dokument migracji wciąż zawiera adres hosta i nazwę kontenera (higiena; poza zakresem tego raportu) |
| R-23 | Anthropic — agent kodu w GitHub Actions (`claude-code-action`) na **tokenie subskrypcji Claude** | naprawy z issue `agent:napraw` | zależnie od planu subskrypcji: warunki konsumenckie albo komercyjne | treść issue i komentarzy, kod repozytorium | `.github/workflows/agent.yml:10-12,51-62`; `docs/runbooks/agent-kodu.md:3-4,76-87,99-101` | US | tak; mechanizm zależny od planu — nieznany | Commercial Terms nie obejmują Claude.ai ani Claude Pro [DOK-9]; plan subskrypcji nieznany | według warunków planu | ryzyko tylko przy wklejeniu danych klientów do issue (zakaz: `agent-kodu.md` § 4 pkt 6) |
| R-24 | Agenci AI z dostępem do produkcji: lokalne sesje Claude Code (Anthropic) z kluczem SSH i `.agents/infra.env`; Codex (OpenAI) według dokumentów koordynacji | odczyty produkcji: statusy faktur, kolejki, logi, wdrożenia | **do ustalenia** — procesor FaktFlow tylko przy umowie komercyjnej z DPA; przy subskrypcji konsumenckiej odbiorca na warunkach konsumenckich | wynik `scripts/ops/kontrola-faktur-ksef.sh`: UUID organizacji, numery wewnętrzne i numery KSeF faktur, okresy, kwoty netto/VAT, kody błędów, log workera z 2 h | `AGENTS.md` (sekcje „Infrastruktura i dostępy”, „Weryfikacja po wdrożeniu”); `scripts/ops/kontrola-faktur-ksef.sh:1-30,135,174,186-209`; `docs/koordynacja/CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md:1-5`; próby SSH i odczyty API Sentry/PostHog/Hetzner przez agenta [PR225] `runtime-inventory.md:15-35,122-161` | US | tak; mechanizm nieznany | nie znaleziono w repo; plan subskrypcji nieznany | według warunków planu; przy warunkach konsumenckich trenowanie zależne od ustawienia konta [DOK-9] | PRC-07 |
| R-25 | Skrzynki docelowe poczty pomocy (prywatne skrzynki operatorów, w runbooku „np. Gmail”) + odpowiedzi przez SMTP Resend | obsługa zgłoszeń, w tym wniosków RODO | zależnie od usługi; dla konsumenckiego Gmaila brak umowy powierzenia — [NZ] | pełne wiadomości: klienci, kontrahenci odpowiadający na e-mail z fakturą, osoby bez konta | `docs/runbooks/skrzynka-pomoc.md:6-22,38-41,66-79`; `lib/email/send.ts:198-200` (`Reply-To`) | nieznany | prawdopodobny | nie znaleziono w repo; stan nieznany | nieznana | na 1.10.2026 routing „nie działa” (`skrzynka-pomoc.md:10`); stan obecny nieznany |
| R-26 | Dostawcy historyczni: Vercel, Supabase Cloud, Inngest, Upstash, Cloudflare R2 | dawny hosting, baza, kolejki, cache, pliki | procesorzy w przeszłości; Supabase Cloud nadal baza deweloperska | dane testowe i deweloperskie; historyczne logi, przebiegi zadań, pliki | `docs/migration/PRZEPROWADZKA-HETZNER.md:4,15-23,720-733` (checklista sprzątania niezaznaczona poza Edge Config); `AGENTS.md` („Lokalny `.env.local` celuje w INNĄ bazę”); `app/(dashboard)/dashboard/page.tsx:154` | Vercel, Inngest: US; Supabase Cloud: nieznany | historycznie tak | nieznany | nieznana — zależy, czy projekty i buckety usunięto | polityka prywatności wciąż wymienia Vercel, Supabase, R2, Inngest (PRC-01) |
| R-27 | 1Password (AgileBits, CA) | przechowanie sekretów infrastruktury według dokumentu migracji | dostawca narzędzia operatora | sekrety, nie dane klientów | `docs/migration/PRZEPROWADZKA-HETZNER.md:480-481` | nieznany | — | — | — | istotne dla SOC 2 (CC6), nie dla listy procesorów |

Upstash jako odbiorca: według pomiaru Redis jest lokalny (`redis:7.2` + SRH na `app-1`, `upstash_service: false` [PR225] `evidence/f0-2026-10-04.json`). Kod wysyła żądania pod dowolny `UPSTASH_REDIS_REST_URL` (`lib/cache/redis.ts:21-42`, `lib/rate-limit/mfa.ts:56-57`), więc o odbiorcy decyduje wyłącznie konfiguracja. Komentarze są sprzeczne: „Upstash… EU region (Frankfurt)” (`lib/cache/redis.ts:1-8`), „poza produkcją… passthrough” (`.env.example:268-273`, `scripts/check-env.ts:85`), „lokalny Redis + SRH” [PR225]. Stan: **niezweryfikowane**, z przewagą dowodu, że Upstash nie jest odbiorcą.

Odbiorcy wskazani przez klienta (kontrahenci otrzymujący fakturę e-mailem, księgowa z portalem i paczkami) nie są procesorami FaktFlow; to odbiorcy z polecenia klienta (`02-…` § 4.3).

## 2. Ustalenia PRC-NN

Kolejność: od najwyższego ryzyka. Ryzyko liczone dla stanu po starcie sprzedaży; dziś złagodzone deklaracją, że nie ma prawdziwych klientów i produkcja wysyła do KSeF TEST [PR225] — tej deklaracji nie sprawdziliśmy.

| ID | Temat | Stan | Ryzyko |
|---|---|---|---|
| PRC-01 | Lista procesorów w polityce prywatności nie odpowiada rzeczywistości | brak | wysokie |
| PRC-02 | Deklaracje „Dane w UE” i „SCC z każdym US-based subprocesorem” bez pokrycia | niezweryfikowane / sprzeczne z dokumentacją dostawców | wysokie |
| PRC-03 | Lokalizacja „Frankfurt” i „Backup: AWS Glacier” niezgodne z infrastrukturą | brak | średnie |
| PRC-04 | Brak rejestru umów powierzenia i ich stanu | brak (w repo) | wysokie |
| PRC-05 | Brak listy dalszych procesorów i procedury zmian dla klientów | brak | wysokie |
| PRC-06 | Anthropic: transfer do US, automatyczna klasyfikacja bez wyboru klienta | częściowe | wysokie |
| PRC-07 | Agenci AI z dostępem do produkcji poza listą procesorów | brak | wysokie |
| PRC-08 | Poczta pomocy: Cloudflare Email Routing → prywatne skrzynki | niezweryfikowane | wysokie (po włączeniu) |
| PRC-09 | PostHog: „EU” nie obejmuje całego łańcucha; rozjazd ustawień projektu | częściowe | średnie |
| PRC-10 | Google Fonts z serwerów Google na każdej stronie | potwierdzone (w kodzie) | średnie |
| PRC-11 | Resend: region wysyłki nieznany, treść faktur i załączniki do osób trzecich | niezweryfikowane | średnie |
| PRC-12 | Telegram i Slack: identyfikatory i e-maile w kanałach bez umowy | częściowe | niskie |
| PRC-13 | MinIO bez wsparcia producenta jako magazyn wszystkich plików | potwierdzone (dokumentacja) | średnie |
| PRC-14 | Kopie: wszystko u jednego dostawcy, plan off-host nie wykonany | brak | średnie |
| PRC-15 | Dostawcy historyczni i zapasowe ścieżki kodu (R2, Upstash, Glacier) | niezweryfikowane | niskie–średnie |
| PRC-16 | Sentry: region EU nie obejmuje konta i wsparcia; retencja nieznana | częściowe | niskie |

### PRC-01. Lista procesorów w polityce prywatności nie odpowiada rzeczywistości

| | |
|---|---|
| Stan | **brak** (klasa P) |
| Dowód | `app/(marketing)/legal/polityka-prywatnosci/page.tsx:81-120` wymienia: Supabase (Frankfurt), Cloudflare R2, Cloudflare Turnstile, Vercel, Resend, Anthropic, Stripe, Inngest, Sentry. Kod i dokumenty pokazują: Supabase jest self-hosted na Hetznerze (R-01, R-02), plikami zajmuje się MinIO, nie R2 ([PR225]; `.env.example:121`), hostingiem jest Hetzner, nie Vercel (`AGENTS.md` § „Stack”), Inngest odpięto 02.10.2026 (`AGENTS.md` § „Stack”, `.env.example:98`). Brak na liście: Hetzner jako procesor (jest tylko jako „centrum danych”, `page.tsx:76`), PostHog (wspomniany tylko w § 13, `page.tsx:240`), Cloudflare Email Routing (R-08c), Google Fonts i logowanie Google (R-09), Slack (R-17), Telegram (R-18), AWS jako archiwum (R-20), usługi push (R-10), agenci AI (R-24), skrzynki pomocy (R-25). |
| Luka | Informacja o odbiorcach i kategoriach odbiorców (art. 13 ust. 1 lit. e RODO [NZ]) nie odpowiada przetwarzaniu. Klient (administrator) nie ma rzetelnej listy, na której mógłby oprzeć zgodę na dalszych procesorów. |
| Ryzyko | **wysokie** — publiczny dokument prawny wprowadza w błąd co do odbiorców i lokalizacji; dla klientów B2B to podstawa ich własnej zgodności. Dziś złagodzone brakiem prawdziwych klientów (deklaracja [PR225]). |
| Rekomendacja | (I) Utrzymywać listę odbiorców jako dane (jeden plik w repo, np. `lib/legal/processors.ts` albo `content/legal/procesorzy.json`), z którego renderują się: polityka, strona RODO i lista dla klientów; test porównujący listę z hostami w CSP i SDK z `package.json`. Treść z sekcji 3 tego raportu jako punkt startu, po review prawnym. |

### PRC-02. Deklaracje „Dane w UE” i „SCC z każdym US-based subprocesorem” bez pokrycia

| | |
|---|---|
| Stan | **niezweryfikowane** (umowy) i **sprzeczne z dokumentacją dostawców** (zakres „w UE”); klasa P |
| Dowód | `app/(marketing)/legal/rodo/page.tsx:20` („Dane w UE — Frankfurt am Main (Hetzner, Vercel)”), `:43-44` („Standard Contractual Clauses z każdym US-based subprocesorem”); `polityka-prywatnosci/page.tsx:76-77` („Wszystkie dane pozostają w UE”). Dokumentacja dostawców z 10.10: PostHog DPA pkt 10.2 — przetwarzanie także w US przy EU Cloud [DOK-7]; Sentry — konta, ustawienia organizacji i dane ze zgłoszeń supportu w US niezależnie od regionu [DOK-5]; Anthropic — dane do US [DOK-2]. Telegram (R-18), Slack (R-17), Google Fonts (R-09b) — umów w repo brak, a dla Telegrama mechanizmu z art. 46 nie widać [NZ]. W repo nie ma żadnej umowy ani SCC. |
| Luka | „Wszystkie dane pozostają w UE” jest nieprawdziwe co najmniej dla Anthropic, Resend, Stripe (według samej polityki — „US”), części danych Sentry i PostHog. „SCC z każdym” to teza o umowach, których nie widać; dla PostHog i Sentry podstawą może być DPF, nie SCC. |
| Ryzyko | **wysokie** — deklaracja publiczna sprzeczna z faktami (art. 5 ust. 1 lit. a, art. 13 ust. 1 lit. f [NZ]); przy kontroli lub sporze obciąża operatora. |
| Rekomendacja | (P/I) Usunąć tezy absolutne. Pisać per dostawca: siedziba, region przechowywania, czy dane mogą trafić poza EOG, mechanizm (DPF / SCC / decyzja stwierdzająca odpowiedni stopień ochrony) — dopiero po potwierdzeniu w umowach (sekcja 6, N-PRC-01). |

### PRC-03. Lokalizacja „Frankfurt” i „Backup: AWS Glacier” niezgodne z infrastrukturą

| | |
|---|---|
| Stan | **brak** zgodności (klasa P dla polityki; I dla materiałów marketingowych) |
| Dowód | „Frankfurt” w: `rodo/page.tsx:20`, `polityka-prywatnosci/page.tsx:76`, `regulamin/page.tsx:90-91`, `components/marketing/landing-hero.tsx:38`, `app/(marketing)/vs/{inni,wfirma,infakt,ifirma}/page.tsx`, `content/help/rodo-i-usuwanie-konta.mdx:30`. Infrastruktura: NBG1 (Norymberga) według `AGENTS.md` § „Serwery”, lokalizacja DE według API 06.10 [PR225]. Hetzner nie prowadzi centrum danych we Frankfurcie (lokalizacje DE: Norymberga, Falkenstein) [NZ]. „Backup: AWS Glacier, Frankfurt (eu-central-1)” (`polityka-prywatnosci/page.tsx:79`): kopie to lokalny `pg_dump` na `db-1`, obrazy hosta Hetznera dla `db-1` i snapshot JSON w MinIO na drugim hoście, bez pełnej kopii poza hostem [PR225]; Glacier to archiwum XML faktur po 2 latach (`lib/jobs/runners/archive-old-invoices.ts:12`), nie kopia zapasowa, z kluczami oznaczonymi jako „deferred” (`scripts/check-env.ts:132-135`). |
| Luka | Błędne miejsce przetwarzania i błędny opis kopii w informacji dla osób i klientów. |
| Ryzyko | **średnie** — oba miejsca leżą w Niemczech, więc dla transferu różnica jest nieistotna; istotna jest rzetelność i to, że „backup w Glacier” sugeruje ochronę, której nie ma. |
| Rekomendacja | (I) „Hetzner Online GmbH, centrum danych w Norymberdze (Niemcy)”; kopie opisać zgodnie z wdrożonym stanem (po wykonaniu decyzji o Storage Box: „kopie szyfrowane, Hetzner, Helsinki (Finlandia)”). Glacier usunąć z polityki do czasu włączenia albo opisać jako archiwum. |

### PRC-04. Brak rejestru umów powierzenia i ich stanu

| | |
|---|---|
| Stan | **brak** w repo; stan poza repo **nieznany** (klasa P: art. 28 ust. 3; S: CC9.2 — zarządzanie dostawcami) |
| Dowód | `grep -rn "DPA\|Data Processing Agreement\|umowa powierzenia"` po `app components content lib docs` (bez tego audytu) daje tylko wzmianki: `app/(marketing)/legal/rodo/page.tsx:54-59` („oferujemy DPA… pobierz pdf z [e-mail]”), `docs/security/rto-rpo.md:144` (R2 jako procesor — nieaktualne), `docs/security/PLAN-ODPORNOSCI-CYBER.md:113` (zadanie: ustalić umowy z prawnikiem). Żadnego dokumentu umowy, rejestru dostawców ani dat akceptacji. `ai_todo.md` i placeholder administratora (`polityka-prywatnosci/page.tsx:20-21`) wskazują, że podmiot prawny może jeszcze nie istnieć (`01-STAN-I-GRANICE.md` § 5) — wtedy umowy z dostawcami są zawarte (o ile w ogóle) na osobę fizyczną. |
| Luka | Nie wiadomo, z kim i na jakich warunkach zawarto umowy (np. Anthropic: Commercial Terms czy subskrypcja konsumencka; PostHog: czy wygenerowano DPA; Hetzner: czy zaakceptowano umowę powierzenia w konsoli). |
| Ryzyko | **wysokie** — bez tego nie da się złożyć listy dalszych procesorów, TIA ani rzetelnej polityki; SOC 2 wymaga dowodu przeglądu dostawców. |
| Rekomendacja | (I/S) Prywatny rejestr dostawców (poza publicznym repo albo bez danych kont): dostawca, podmiot umowy, plan, region konta, data i wersja DPA, mechanizm transferu, lista dalszych procesorów (link + data odczytu), retencja ustawiona w panelu, właściciel, data przeglądu. Po założeniu spółki — przenieść konta i umowy na spółkę. |

### PRC-05. Brak listy dalszych procesorów i procedury zmian dla klientów

| | |
|---|---|
| Stan | **brak** (klasa P: art. 28 ust. 2 i 4 [NZ]) |
| Dowód | Strona RODO obiecuje DPA „dla każdej umowy” (`rodo/page.tsx:54-59`), ale w repo nie ma treści DPA dla klientów, listy dalszych procesorów do załączenia ani mechanizmu powiadamiania o zmianie (brak strony, e-maila, pola w bazie). `regulamin/page.tsx` nie zawiera postanowień o powierzeniu (sprawdzone: brak słów „powierz”, „podmiot przetwarzający”). |
| Luka | FaktFlow przetwarza dane kontrahentów klientów jako procesor (`02-…` § 4.2), więc potrzebuje uprzedniej zgody klienta (ogólnej lub szczegółowej) na dalszych procesorów i musi informować o zmianach z możliwością sprzeciwu [NZ]. Dostawcy działają tak samo wobec FaktFlow: Anthropic daje 15 dni na sprzeciw (DPA C.3 [DOK-3]), PostHog publikuje zmiany listy na stronie i powiadamia „in accordance with the terms of the DPA” [DOK-6]. |
| Ryzyko | **wysokie** dla sprzedaży B2B — biura rachunkowe i firmy zapytają o listę; brak zgody na dalszego procesora to naruszenie art. 28 ust. 2 po stronie FaktFlow. |
| Rekomendacja | (P/I) Umowa powierzenia jako część regulaminu z ogólną zgodą na dalszych procesorów z listy (sekcja 3) i 14–30-dniowym okresem na sprzeciw; publiczna strona `/legal/podprocesorzy` generowana z jednego źródła (PRC-01); powiadomienie e-mail do właścicieli organizacji przy zmianie listy (kategoria transakcyjna w `lib/email/send.ts`). Okres i forma — do review prawnego. |

### PRC-06. Anthropic: transfer do US, automatyczna klasyfikacja bez wyboru klienta

| | |
|---|---|
| Stan | **częściowe** — dokumenty Anthropic przewidują DPA z SCC [DOK-1], [DOK-3]; nie wiadomo, czy konto FaktFlow je obejmuje; brak TIA i wyboru po stronie klienta (klasy P, O, I) |
| Dowód | Wywołania bez `baseURL` i bez `inference_geo` (`lib/anthropic/client.ts:19`, `lib/ocr/engine.ts:148`, `lib/categorization/ai-classifier.ts:34`, `lib/support/chat.ts:79`). Udokumentowane wartości `inference_geo` to `"us"` i `"global"` [DOK-4] — opcji przetwarzania w UE w API Anthropic nie znaleziono; ta sama dokumentacja podaje, że Claude na Google Vertex AI przyjmuje region wielostrefowy `"eu"` [DOK-4]. Klasyfikacja KPiR wysyła nazwę i NIP sprzedawcy, numer faktury, nazwy pozycji i kwotę dla **każdej** faktury kosztowej pobranej z KSeF, automatycznie po odbiorze (`lib/jobs/runners/auto-categorize-inbox.ts:296` → `lib/categorization/index.ts:71-76` → `ai-classifier.ts:42-50`), jedynym ogranicznikiem jest budżet kosztowy (`lib/ai/tenant-ai-budget.ts:5-26`). Ustawienia, którym klient wyłącza AI, nie znaleziono (grep po migracjach i `lib/feature-flags` bez wyników dla `ai_enabled`, `ocr_enabled`, `auto_categor…`). NIP i nazwa sprzedawcy będącego osobą fizyczną prowadzącą działalność to dane osobowe [NZ]. Wcześniejsze ustalenie SEC-D-05 (`docs/security/audyt/REJESTR-USTALEN.md:59`) dotyczyło tylko OCR. |
| Luka | Transfer do państwa trzeciego wymaga mechanizmu z rozdz. V RODO i — przy SCC — oceny skutków transferu (TIA) [NZ, O: zalecenia EROD 01/2020]. Klient nie wie o automatycznym przekazywaniu danych swoich dostawców do Anthropic i nie może go wyłączyć. |
| Ryzyko | **wysokie** — pełne dokumenty kosztowe i dane kontrahentów do US; dla części klientów (biura rachunkowe) to warunek odmowy. |
| Rekomendacja | (P) Potwierdzić Commercial Terms + DPA na koncie organizacji (nie subskrypcja konsumencka), zapisać datę i wersję; TIA na podstawie DPA I.4 („Anthropic will… provide information… to complete a transfer impact assessment” [DOK-3]). (I) Przełącznik organizacji „Automatyczna kategoryzacja AI” (domyślnie: do decyzji prawnej) i informacja w UI OCR/czatu; rozważyć wysyłanie do klasyfikatora tylko nazw pozycji bez NIP i numeru. Stan retencji żądań API potwierdzić w umowie (nie znaleziono w odczytanych dokumentach). (I, opcja) Jeśli przetwarzanie ma zostać w UE: model przez Google Vertex AI w regionie `eu` (zmiana klienta SDK na `AnthropicVertex`, dostawcą staje się Google) — dostępność modeli i funkcji do sprawdzenia, decyzja produktowa. |

### PRC-07. Agenci AI z dostępem do produkcji poza listą procesorów

| | |
|---|---|
| Stan | **brak** (klasa P: art. 28, art. 32; S: CC6.1, CC9.2) |
| Dowód | `AGENTS.md` instruuje każdą sesję agenta, jak wejść na serwery (SSH, `psql`, `docker logs`) i zaleca `./scripts/ops/kontrola-faktur-ksef.sh` do weryfikacji wdrożeń. Skrypt zwraca m.in. `tenant_id`, `internal_number`, `ksef_number`, okresy i kwoty faktur (`scripts/ops/kontrola-faktur-ksef.sh:186-209`) oraz log workera z 2 godzin (`:135`). Numer KSeF zawiera NIP sprzedawcy [NZ]. Wynik trafia do kontekstu modelu dostawcy agenta (Anthropic dla Claude Code, OpenAI dla Codexa — `docs/koordynacja/CENTRUM-DOWODZENIA-BRIEF-DLA-CODEXA.md:1-5`). Agent Codex wykonywał odczyty API Sentry, PostHog i Hetznera oraz próby SSH [PR225] `runtime-inventory.md:15-35,122-161`. Planowany jest „przyszły agent deweloperski” z odczytem zredagowanej diagnostyki [PR225] `data-policy.md`. Agent w CI działa na „tokenie subskrypcji Claude” (`docs/runbooks/agent-kodu.md:3-4,99-101`); Commercial Terms Anthropic nie obejmują Claude.ai ani Claude Pro [DOK-9], a przy warunkach konsumenckich materiały mogą służyć do trenowania, chyba że konto ma wyłączoną tę opcję [DOK-9]. |
| Luka | Dostawcy agentów nie są na żadnej liście odbiorców; nie wiadomo, na jakich warunkach (konsumenckich czy komercyjnych z DPA) przetwarzają wyciągi z produkcji; skrypty nie redagują identyfikatorów. |
| Ryzyko | **wysokie** po starcie — dane klientów (numery faktur z NIP, identyfikatory organizacji, treści błędów) wychodzą do dostawców AI poza EOG bez umowy powierzenia. |
| Rekomendacja | (P/I) Decyzja właściciela: agenci z dostępem do produkcji tylko na planach z umową komercyjną i DPA (np. Claude Team/Enterprise albo klucz API na Commercial Terms) i z wyłączonym trenowaniem; dopisać ich do listy procesorów. Skrypty operacyjne: domyślnie agregaty bez `tenant_id`/numerów, szczegóły tylko z flagą i z maskowaniem NIP w numerze KSeF. Zasada w `AGENTS.md`: agent nie wkleja wyników z produkcji do PR, issue ani plików w repo. |

### PRC-08. Poczta pomocy: Cloudflare Email Routing → prywatne skrzynki

| | |
|---|---|
| Stan | **niezweryfikowane** (wdrożenie po 1.10.2026 nieznane); klasy P i I |
| Dowód | `docs/runbooks/skrzynka-pomoc.md:16-17` („Każdy mail na dowolny adres w `faktflow.pl` trafi do Twojej zwykłej skrzynki (np. Gmail) i do skrzynki Igora”), `:38-41` (adresy docelowe operatorów), `:66-79` (odpowiedzi z Gmaila przez SMTP Resend). Aplikacja ustawia `Reply-To: pomoc@…` we wszystkich e-mailach, także w fakturach do kontrahentów (`lib/email/send.ts:198-200`, `:550-578`), więc odpowiedzi kontrahentów trafią do tych skrzynek. Worker nie wysyła treści dalej poza przekazaniem i powiadomieniem (`ops/poczta/worker.mjs:8-10,44-53`). |
| Luka | Pełna korespondencja klientów, kontrahentów i wnioski RODO trafiają do prywatnych skrzynek osób; dla konsumenckiego Gmaila nie ma umowy powierzenia [NZ]; brak retencji, kontroli dostępu po stronie organizacji i śladu obsługi wniosków. Cloudflare (Email Routing) i Google (skrzynka) nie są wymienieni w polityce. |
| Ryzyko | **wysokie** po włączeniu routingu — kanał wniosków RODO i kontakt kontrahentów działa na kontach prywatnych. |
| Rekomendacja | (I) Skrzynka służbowa w usłudze z umową powierzenia (np. Google Workspace lub Microsoft 365 na spółkę, region i DPA potwierdzone) albo system zgłoszeń; dostęp imienny, retencja, rejestr wniosków RODO. Dopisać Cloudflare Email Routing do listy procesorów. |

### PRC-09. PostHog: „EU” nie obejmuje całego łańcucha; rozjazd ustawień projektu

| | |
|---|---|
| Stan | **częściowe** (klasy P, I) |
| Dowód | Region EU wynika z kodu (`next.config.ts:144-152`, `lib/analytics/posthog-node-client.ts:30-32`) i pomiaru [PR225]. DPA PostHog pkt 10.2: przetwarzanie także w US; dalsi procesorzy rdzenia obejmują Cloudflare z „Global edge locations… for data in transit” [DOK-6], [DOK-7]. Wcześniejszy wniosek „transferu poza EOG nie ma” (`docs/security/audyt/REJESTR-USTALEN.md:48`, SEC-D-01) jest więc za mocny. Ustawienia projektu z API 06.10: replay opt-in **włączony** (retencja 30 dni), heatmaps **włączone**, podczas gdy kod ustawia `disable_session_recording: true`, `capture_heatmaps: false` (`init-posthog-browser.ts:37,42`) [PR225]. Zdarzenia serwerowe idą bez zgody (`lib/analytics/server.ts:7-11`). Ustawienie „IP data capture” projektu — nieodczytane; dla nowych projektów EU domyślnie wyłączone [DOK-6]. |
| Luka | Brak TIA dla PostHog; ustawienia projektu pozwalają na funkcje, których kod nie chce — jedna zmiana w kodzie albo w SDK wystarczy, by je uruchomić. |
| Ryzyko | **średnie** — dane to UUID i zdarzenia z listy dozwolonych, ale zakres przetwarzania zależy od panelu, którego nikt nie pilnuje. |
| Rekomendacja | (I) Wyłączyć replay i heatmaps w ustawieniach projektu, potwierdzić „Discard client IP data”, ustawić retencję zgodną z polityką [PR225] `data-policy.md`; zapisać datę odczytu w rejestrze dostawców. (P) Opis w polityce: „PostHog Cloud EU (Frankfurt); dostawca może przetwarzać dane także w USA na podstawie DPF/SCC” — po potwierdzeniu DPA. |

### PRC-10. Google Fonts z serwerów Google na każdej stronie

| | |
|---|---|
| Stan | **potwierdzone** w kodzie (klasy O, I) |
| Dowód | `app/layout.tsx:114-125` — `<link rel="preconnect">` do `fonts.googleapis.com` i `fonts.gstatic.com` oraz arkusz `fonts.googleapis.com/css2?family=Material+Symbols+Outlined…` w głównym layoucie, więc na każdej stronie (także publicznej, przed jakąkolwiek zgodą); CSP dopuszcza oba hosty (`lib/security/csp.ts:30,32`). |
| Luka | Przeglądarka każdego odwiedzającego wysyła IP, user agent i `Referer` do Google (US). Polityka o tym nie mówi. |
| Ryzyko | **średnie** — orzecznictwo niemieckie uznało dynamiczne ładowanie Google Fonts bez zgody za naruszenie (LG München I, 20.01.2022, 3 O 17493/20 — [NZ], klasa O, nie wiąże polskiego organu). |
| Rekomendacja | (I) Hostować font lokalnie (plik w `public/` albo `next/font/local`), usunąć hosty Google z CSP — likwiduje odbiorcę zamiast go opisywać. |

### PRC-11. Resend: region wysyłki nieznany, treść faktur i załączniki do osób trzecich

| | |
|---|---|
| Stan | **niezweryfikowane** (klasy P, I) |
| Dowód | Klient SDK łączy się z globalnym `api.resend.com`; region wysyłki ustawia się dla domeny (SDK 6.12.0 zna `us-east-1`, `eu-west-1`, `sa-east-1`, `ap-northeast-1`), a domeny nie tworzy kod. Przez Resend wychodzą: PDF faktury do nabywcy (`lib/email/send.ts:550-578`), PDF wezwania (`send-reminder.ts:75-80`), paczki księgowe z załącznikami (`co-pilot-monthly.ts:483-580`), e-maile GoTrue (potwierdzenie, reset hasła — `docs/migration/PRZEPROWADZKA-HETZNER.md:493-499`), odpowiedzi z poczty pomocy (`skrzynka-pomoc.md:71-79`). Polityka podaje „US, SCC” (`polityka-prywatnosci/page.tsx:102-103`). |
| Luka | Nie wiadomo, gdzie Resend przechowuje treść i załączniki ani jak długo. |
| Ryzyko | **średnie** — pełne faktury z danymi nabywców (w tym B2C z PESEL — `02-…` INW-05) u dostawcy z US. |
| Rekomendacja | (I) Odczytać region domeny w panelu; jeśli `us-east-1`, rozważyć domenę w `eu-west-1`; sprawdzić retencję logów wiadomości i możliwość wyłączenia przechowywania treści; DPA i mechanizm transferu do rejestru (PRC-04). Rozważyć link do pobrania (podpisany, krótko ważny) zamiast załącznika PDF. |

### PRC-12. Telegram i Slack: identyfikatory i e-maile w kanałach bez umowy

| | |
|---|---|
| Stan | **częściowe** — kod minimalizuje, ale nie do zera (klasy P, I) |
| Dowód | Alert o wygasających certyfikatach idzie na kanał `urgent` z listą `tenantId → dni` (`lib/jobs/runners/cert-expiry-alert.ts:227-237`); kanał `urgent` trafia także do Telegrama (`lib/alerts/slack.ts:93-113`). Eskalacja czatu wysyła do Slacka e-mail użytkownika (`lib/support/support-actions.ts:76-83`). Powiadomienie o poczcie zawiera lokalną część adresu i kategorię, np. „RODO / dane osobowe” (`ops/poczta/worker.mjs:15,44-53`). Komentarz w kodzie zakłada brak danych osobowych w Telegramie (`lib/alerts/telegram.ts:12-14`). |
| Luka | UUID organizacji to identyfikator pośredni (dla jednoosobowej działalności — osoby); e-mail w Slacku to dana osobowa; brak umów i informacji. |
| Ryzyko | **niskie** — mała skala i identyfikatory pośrednie. |
| Rekomendacja | (I) W alertach liczby zamiast UUID (szczegóły w `/admin`); eskalacja czatu z identyfikatorem konwersacji bez e-maila. Telegram zostawić jako kanał bez danych osobowych i opisać tę zasadę testem. Slack — DPA w rejestrze, jeśli pozostaje. |

### PRC-13. MinIO bez wsparcia producenta jako magazyn wszystkich plików

| | |
|---|---|
| Stan | **potwierdzone** w dokumentacji producenta (klasa P: art. 32 [NZ]; S: CC7.1) |
| Dowód | README repozytorium `minio/minio`: „THIS REPOSITORY IS NO LONGER MAINTAINED”, edycja społecznościowa tylko ze źródeł, bez binariów [DOK-12]. Pliki aplikacji (XML, UPO, PDF, zdjęcia OCR, eksporty, snapshoty bazy) leżą w MinIO na `ops-1`, a Supabase Storage w drugim MinIO na `db-1` [PR225]; wersja binarki MinIO aplikacji nieodczytana [PR225] `evidence/f0-2026-10-04.json`. |
| Luka | Brak poprawek bezpieczeństwa dla komponentu przechowującego dokumenty klientów; zmiana dostawcy oprogramowania lub wersji płatnej (AIStor) to potencjalnie nowy podmiot w łańcuchu. |
| Ryzyko | **średnie** — magazyn jest za siecią prywatną i kluczami, ale bez ścieżki aktualizacji. |
| Rekomendacja | (I) Decyzja: przypięta, znana wersja z monitoringiem CVE i planem migracji (np. na inną implementację S3 lub usługę obiektową z umową w EOG). Uwaga: jeśli wybór padnie na usługę zewnętrzną, trafia ona do listy procesorów. |

### PRC-14. Kopie: wszystko u jednego dostawcy, plan off-host nie wykonany

| | |
|---|---|
| Stan | **brak** kopii poza hostem (klasa P: art. 32 ust. 1 lit. b–c [NZ]; S: A1.2) |
| Dowód | Lokalny nocny `pg_dump` na `db-1`, obrazy hosta tylko dla `db-1`, brak kopii MinIO aplikacji i pełnej bazy poza hostem [PR225] `runtime-inventory.md` § „Kopie zapasowe”; skrypt wysyła poza serwer tylko przez zdalny `crypt` (`scripts/hetzner/db-backup.sh:20-21`); ADR 0009 ma status „Proposed” (`docs/adr/0009-pg-dump-na-db-1-i-storage-box.md:3`). Decyzja 07.10: Storage Box BX11 w HEL1 (Finlandia), restic z szyfrowaniem po stronie klienta — niewykonana [PR225]; 10.10 zarekomendowano dodatkowo Backblaze B2 (EU Central, Amsterdam) [PR225] `evidence/f0-2026-10-10.json`. |
| Luka | Lokalizacja wszystkich kopii = lokalizacja oryginałów i ten sam dostawca. Dodanie B2 wprowadziłoby podmiot z siedzibą w US (Backblaze, Inc. [NZ]) — przy szyfrowaniu po stronie klienta ryzyko dostępu jest małe, ale dostawca trafia na listę i do TIA. |
| Ryzyko | **średnie** (dostępność i integralność; dla prywatności — neutralne do czasu dodania dostawcy z US). |
| Rekomendacja | (I) Wykonać decyzję HEL1 (EOG, ten sam procesor — lista bez zmian, tylko nowa lokalizacja); B2 dopiero po decyzji i wpisie do listy. Szczegóły retencji i odtwarzania — `02-…` INW-04 i raport retencji. |

### PRC-15. Dostawcy historyczni i zapasowe ścieżki kodu (R2, Upstash, Glacier)

| | |
|---|---|
| Stan | **niezweryfikowane** (klasy P, I) |
| Dowód | Checklista „sprzątania” po migracji: Vercel, Supabase Cloud, Upstash, Inngest, R2 — niezaznaczone (`docs/migration/PRZEPROWADZKA-HETZNER.md:720-733`). Supabase Cloud nadal jest bazą deweloperską (`AGENTS.md` § „Pułapki”; `app/(dashboard)/dashboard/page.tsx:154`). Kod przy pustym `R2_ENDPOINT` łączy się z Cloudflare R2 (`lib/storage/r2-client.ts:31-38,53`; `.env.example:115-119` z kontem R2); przy ustawionym `UPSTASH_REDIS_REST_URL` z dowolnym hostem REST (`lib/cache/redis.ts:35-42`). Cron archiwizacji do AWS działa codziennie (`lib/jobs/queues.ts:89`) niezależnie od tego, czy AWS jest skonfigurowany. |
| Luka | Nie wiadomo, czy u dawnych dostawców zostały dane (logi Vercela, przebiegi Inngest z treścią zadań, pliki w R2, projekt Supabase Cloud) ani czy dane deweloperskie są wyłącznie syntetyczne. Domyślne wartości w kodzie kierują do dostawcy z US przy błędzie konfiguracji. |
| Ryzyko | **niskie–średnie** — według dokumentu migracji przed przeprowadzką były tylko dane testowe (`PRZEPROWADZKA-HETZNER.md` § 4.4). |
| Rekomendacja | (I) Potwierdzić i zapisać usunięcie projektów i bucketów (z datą); bazę deweloperską trzymać na danych syntetycznych i wpisać ją do rejestru dostawców, dopóki istnieje. W kodzie: produkcja bez `R2_ENDPOINT` ma kończyć się błędem startu, nie cichym przełączeniem na R2; cron Glacier wyłączony, dopóki archiwum nie jest decyzją. |

### PRC-16. Sentry: region EU nie obejmuje konta i wsparcia; retencja nieznana

| | |
|---|---|
| Stan | **częściowe** (klasy P, S) |
| Dowód | Region EU = Frankfurt; konta, ustawienia, metadane projektu, logi audytu organizacji i dane ze zgłoszeń supportu — w US [DOK-5]. Kod ogranicza dane: `sendDefaultPii: false`, redakcja wszystkich transportów, `user` tylko z `id` (`lib/observability/scrub.ts:25-79`), w przeglądarce `infer_ip: 'never'` (SDK 10.53.1). Retencja i plan nieodczytane; deklaracja: plan bezpłatny; docelowo Team EU [PR225]. Ruch z przeglądarki przez `/monitoring` własnego serwera (`next.config.ts:189`). |
| Luka | Brak potwierdzenia DPA i retencji; polityka podaje „Sentry (Frankfurt)” bez zastrzeżeń. |
| Ryzyko | **niskie** — dane telemetryczne są pseudonimizowane i redagowane; ryzyko rośnie, jeśli błędy będą niosły treść faktur (zakaz w `scrub.ts:19-24`). |
| Rekomendacja | (I) Odczytać retencję i region w panelu, zaakceptować DPA, wpisać do rejestru; w polityce: „Sentry, region UE (Frankfurt); dane konta i wsparcia w USA”. |

## 3. Projekt listy dalszych procesorów dla klientów

**Materiał roboczy, nie do publikacji bez review prawnego i bez uzupełnienia rejestru umów (PRC-04).** Lista obejmuje tylko podmioty, które przetwarzają dane powierzone przez klienta (faktury, kontrahenci, dokumenty kosztowe, korespondencja z kontrahentami — `02-…` § 4.2). Pola „do potwierdzenia” wymagają odczytu umowy lub panelu.

### 3.1. Dalsi procesorzy (propozycja)

| Lp. | Podmiot | Cel przetwarzania | Kategorie danych powierzonych | Miejsce przetwarzania | Przekazanie poza EOG / podstawa | Warunek |
|---|---|---|---|---|---|---|
| 1 | Hetzner Online GmbH, Gunzenhausen (DE) | hosting serwerów aplikacji, bazy danych i plików; kopie zapasowe | wszystkie dane powierzone | Norymberga (DE); kopie: Helsinki (FI) po wdrożeniu decyzji | nie — do potwierdzenia w umowie (dostęp zdalny wsparcia) | stały |
| 2 | Anthropic Ireland, Limited (IE), z Anthropic PBC (US) jako podmiotem powiązanym | rozpoznawanie dokumentów kosztowych (OCR), automatyczna kategoryzacja kosztów, asystent pomocy | treść dokumentów kosztowych; nazwa, NIP sprzedawcy, numer i pozycje faktur kosztowych; treść pytań do asystenta | USA i inne kraje według listy Anthropic | tak — SCC (moduł 2/3) wbudowane w DPA [DOK-3]; wymagana TIA | tylko gdy klient korzysta z OCR, kategoryzacji AI lub asystenta (dziś kategoryzacja jest automatyczna — PRC-06) |
| 3 | Resend (Plus Five Five, Inc., US) | wysyłka e-maili z fakturami, wezwaniami i paczkami dokumentów do odbiorców wskazanych przez klienta | adresy e-mail i treść wiadomości, załączniki PDF (faktury, wezwania, zestawienia) | do potwierdzenia (region domeny) | do potwierdzenia | stały, gdy klient wysyła dokumenty e-mailem |
| 4 | Cloudflare, Inc. (US) | odbiór i przekazywanie poczty przychodzącej na adresy FaktFlow (odpowiedzi kontrahentów na e-maile z fakturami) | treść wiadomości od kontrahentów klienta | globalna sieć Cloudflare | do potwierdzenia | gdy routing poczty działa (PRC-08) |
| 5 | Dostawca skrzynki pomocy (do wyboru — PRC-08) | obsługa korespondencji | jak wyżej | do ustalenia | do ustalenia | po wyborze usługi z umową powierzenia |
| 6 | Functional Software, Inc. (Sentry, US) | diagnostyka błędów | identyfikatory techniczne i fragmenty komunikatów błędów, które mimo redakcji mogą zawierać dane klienta | Frankfurt (DE); dane konta i wsparcia w USA [DOK-5] | częściowo — do potwierdzenia (DPF/SCC) | stały |
| 7 | Amazon Web Services EMEA SARL (LU) | archiwum długoterminowe XML faktur | pełne pliki XML faktur | Frankfurt (eu-central-1) — do potwierdzenia | do potwierdzenia | **tylko jeśli** archiwum zostanie włączone (PRC-15) |
| 8 | Dostawca agentów AI z dostępem do produkcji (Anthropic lub OpenAI) | utrzymanie i diagnostyka systemu | wyciągi z bazy i logów | USA | do potwierdzenia | **tylko jeśli** decyzja z PRC-07 utrzyma taki dostęp; inaczej — usunąć dostęp, nie dopisywać |

### 3.2. Nie są dalszymi procesorami klienta (propozycja uzasadnienia)

| Podmiot | Dlaczego nie na liście |
|---|---|
| Ministerstwo Finansów (KSeF, biała lista), GUS, VIES | odrębni administratorzy rejestrów i systemów publicznych; przekazanie wynika z przepisów lub z polecenia klienta [NZ] |
| Stripe | przetwarza dane rozliczeniowe klienta jako klienta FaktFlow, nie dane powierzone |
| PostHog | analityka produktu FaktFlow na pseudonimowych identyfikatorach użytkowników; FaktFlow jest tu administratorem — opis w polityce prywatności, nie na liście dalszych procesorów (do potwierdzenia w review) |
| Google (logowanie, fonty), HIBP, NBP | logowanie i fonty dotyczą użytkownika jako osoby odwiedzającej; HIBP i NBP — brak danych powierzonych |
| Usługi push przeglądarek | wybór przeglądarki użytkownika; treść szyfrowana end-to-end |
| Slack, Telegram | po wdrożeniu PRC-12 nie powinny otrzymywać danych powierzonych; jeśli zostaną identyfikatory lub e-maile — wracają na listę albo są usuwane z alertów |
| GitHub | brak danych klientów w repozytorium i CI (warunek z `docs/runbooks/agent-kodu.md` § 4 pkt 6) |

## 4. Ocena łańcucha i potrzeba TIA

### 4.1. „Region UE” a cały łańcuch

| Dostawca | Deklarowany / skonfigurowany region | Co wychodzi poza region (źródło) | Ocena |
|---|---|---|---|
| Hetzner | DE (NBG1) | nic nie wiadomo; dostęp wsparcia i dalsi procesorzy Hetznera — nieodczytane | EOG, ale umowa i dostęp zdalny niezweryfikowane |
| Sentry | EU (Frankfurt) [PR225], [DOK-5] | konta użytkowników, ustawienia, metadane projektu, logi audytu organizacji, dane ze zgłoszeń wsparcia — US [DOK-5] | region EU obejmuje zdarzenia, nie całą usługę |
| PostHog | EU Cloud (Frankfurt) — z kodu | przetwarzanie także w US (DPA 10.2); Cloudflare jako globalna sieć dla danych w tranzycie; PlanetScale, Modal, Wiz [DOK-6], [DOK-7] | region EU obejmuje przechowywanie, nie przetwarzanie |
| Anthropic | brak regionu UE w API Anthropic; udokumentowane `inference_geo`: `us`, `global` [DOK-4]; region `eu` tylko przez Vertex AI [DOK-4] | wszystko | transfer pełny |
| Resend | nieznany | nieznane | do odczytu |
| Cloudflare | globalny | wszystko | transfer prawdopodobny |
| AWS | eu-central-1 (kod) | dostęp spółki matki — [NZ] | jeśli aktywny |

Dostęp zdalny do danych (tylko z dokumentów repo): operatorzy przez SSH z kluczem i panel Coolify przez tunel SSH (`AGENTS.md` § „Pułapki”); agenci AI w lokalnych sesjach z kluczem SSH (`AGENTS.md`, R-24); próby SSH agenta Codex [PR225]. Lokalizacja operatorów i ich urządzeń nie wynika z repo. Logi dostawców: Sentry (zdarzenia), PostHog (zdarzenia), Resend (historia wysyłek), Cloudflare (Turnstile, Email Routing), Anthropic (żądania API — retencja nieodczytana) — żadnej z tych retencji nie odczytano poza PostHog [PR225].

### 4.2. Potrzeba TIA i rejestru dalszych procesorów

Podstawa (P/O, [NZ]): art. 44–46 RODO; wyrok TSUE C-311/18 (Schrems II); zalecenia EROD 01/2020 w sprawie środków uzupełniających; decyzja wykonawcza Komisji (UE) 2023/1795 w sprawie EU-US Data Privacy Framework (odpowiedni stopień ochrony dla organizacji z certyfikatem DPF). Proponowana interpretacja (do review, pytanie 9): przy imporcie do organizacji z aktywnym certyfikatem DPF TIA w rozumieniu klauzuli 14 SCC nie jest wymagana, bo transfer opiera się na art. 45; przy SCC — jest wymagana. Status certyfikatu DPF każdego dostawcy trzeba sprawdzić na liście DPF (domena nieosiągalna w tej sesji).

| Dostawca | Mechanizm według odczytanych dokumentów | TIA | Rejestr dalszych procesorów dla klientów (art. 28 ust. 2 i 4) |
|---|---|---|---|
| Anthropic | SCC moduł 2/3 w DPA [DOK-3]; polityka prywatności: SCC [DOK-2] | **wymagana** (SCC; pełne dokumenty) — Anthropic zobowiązuje się dostarczyć informacje do TIA (DPA I.4) | tak, poz. 2 |
| PostHog | DPF (10.3) i SCC (10.4) w treści DPA z repo dostawcy [DOK-7] | uproszczona, jeśli DPF potwierdzony | nie (FaktFlow jako administrator) — do review |
| Sentry | nie odczytano (sentry.io zablokowane) | zależna od mechanizmu | tak, poz. 6 |
| Resend | polityka FaktFlow: SCC (deklaracja, `polityka-prywatnosci/page.tsx:102-103`) | wymagana przy SCC | tak, poz. 3 |
| Cloudflare | nie odczytano | zależna od mechanizmu | tak, poz. 4 (poczta) |
| Stripe | polityka FaktFlow: SCC (deklaracja) | zależna od mechanizmu | nie |
| Slack | nie odczytano | jeśli zostaną dane osobowe | nie po PRC-12 |
| Telegram | brak mechanizmu w repo i w wiedzy modelu [NZ] | brak podstawy transferu — **nie wysyłać danych osobowych** | nie |
| Google (Fonts, Gmail) | nie odczytano | Fonts: usunąć odbiorcę (PRC-10); Gmail: zależne od wyboru usługi | Gmail — poz. 5 |
| AWS | nie odczytano | jeśli aktywny | tak, poz. 7 |
| Agenci AI (Anthropic, OpenAI) | zależny od planu (konsumencki vs komercyjny) [DOK-9] | wymagana przy komercyjnym; przy konsumenckim — brak podstawy | tak, poz. 8 albo usunięcie dostępu |

Wniosek: TIA jest potrzebna co najmniej dla Anthropic i Resend, a dla pozostałych dostawców z US zależy od potwierdzenia DPF. Rejestr dalszych procesorów (sekcja 3) jest konieczny przed pierwszym klientem, bo FaktFlow jest procesorem danych kontrahentów klientów, a klient musi wyrazić uprzednią zgodę i mieć możliwość sprzeciwu wobec zmian (art. 28 ust. 2 [NZ]); FaktFlow musi też nałożyć na dalszych procesorów te same obowiązki co w umowie z klientem (art. 28 ust. 4 [NZ]) — w praktyce porównać standardowe DPA dostawców z przyszłą umową powierzenia FaktFlow.

## 5. Deklaracje stron prawnych a stan faktyczny

| Deklaracja | Miejsce | Stan faktyczny | Ocena |
|---|---|---|---|
| „Dane w UE — Frankfurt am Main (Hetzner, Vercel)” | `rodo/page.tsx:20` | Hetzner NBG1 (Norymberga); Vercel nie jest używany od migracji (`AGENTS.md` § „Stack”); część danych poza UE (R-03, R-04, R-05, R-06, R-08, R-09) | **niezgodne** (PRC-02, PRC-03) |
| „Szyfrowanie at-rest — AES-256 (Supabase + R2)” | `rodo/page.tsx:23` | R2 nie jest używany; szyfrowania w MinIO i Postgresie aplikacja nie konfiguruje (brak `ServerSideEncryption` w kodzie — `02-…` § 3.1); stan dysków u Hetznera nieznany | **niezweryfikowane / prawdopodobnie niezgodne** (poza zakresem tego raportu, do A2/SOC2) |
| „Standard Contractual Clauses z każdym US-based subprocesorem” | `rodo/page.tsx:43-44` | brak umów w repo; PostHog opiera się także na DPF; Telegram bez mechanizmu | **niezweryfikowane** (PRC-02, PRC-04) |
| „Brak cookies analitycznych” | `rodo/page.tsx:47-48` | PostHog z `persistence: 'memory'` (`init-posthog-browser.ts:29`) — bez cookies; zgoda w `localStorage` | do oceny w `A1-…` / `A4-…` (nie zakres tego raportu) |
| „oferujemy DPA dla każdej umowy. Pobierz pdf z [e-mail]” | `rodo/page.tsx:54-59` | brak dokumentu DPA w repo | **brak** (PRC-05) |
| „Centrum danych: Hetzner, Frankfurt am Main, Niemcy. Wszystkie dane pozostają w UE.” | `polityka-prywatnosci/page.tsx:76-77` | jak wyżej | **niezgodne** |
| „Backup: AWS Glacier, Frankfurt (eu-central-1).” | `polityka-prywatnosci/page.tsx:79` | kopie lokalne u Hetznera; Glacier = archiwum, prawdopodobnie nieaktywne | **niezgodne** (PRC-03) |
| Lista: Supabase (Frankfurt), Cloudflare R2 (EU), Vercel (Frankfurt), Inngest (US) | `polityka-prywatnosci/page.tsx:84-90,98-100,113-116` | self-hosted, MinIO, Hetzner, pg-boss | **nieaktualne** (PRC-01) |
| Cloudflare Turnstile „(USA, SCC tam gdzie ma zastosowanie)… trafia token weryfikacyjny” | `polityka-prywatnosci/page.tsx:90-97` | do Cloudflare trafia też IP klienta (`lib/security/turnstile.ts:119`) i sygnały przeglądarki | **częściowe** — opis niepełny |
| Resend, Anthropic, Stripe „(US, SCC)” | `polityka-prywatnosci/page.tsx:101-112` | zgodne co do kierunku; SCC niepotwierdzone; Anthropic dostaje też dane faktur kosztowych z KSeF i treść czatu, nie tylko „zdjęcia paragonów” | **częściowe** (PRC-06) |
| Anthropic: zdjęcia „nie są przechowywane przez Anthropic” | `polityka-prywatnosci/page.tsx:106-108` | DPA przewiduje przechowywanie w okresie umowy i usunięcie w 30 dni po jej zakończeniu (H.1, Schedule 1 B.7) [DOK-3]; retencji żądań nie odczytano | **niezweryfikowane — sformułowanie zbyt mocne** |
| „Sentry (Frankfurt)” | `polityka-prywatnosci/page.tsx:118` | zdarzenia we Frankfurcie, konto i wsparcie w US [DOK-5]; region z DSN potwierdzony tylko pomiarem [PR225] | **częściowe** (PRC-16) |
| PostHog „przetwarzanie w regionie UE” | `polityka-prywatnosci/page.tsx:239-240` | przechowywanie w UE; przetwarzanie także w US według DPA [DOK-7] | **częściowe** (PRC-09) |
| „Dane… hostowane w centrum danych Hetzner, Frankfurt (Niemcy), w ramach EU.” | `regulamin/page.tsx:90-91` | Norymberga | **niezgodne** (PRC-03) |
| „dane w UE (Frankfurt)”, „Frankfurt 🇪🇺” | `components/marketing/landing-hero.tsx:38`, `app/(marketing)/vs/*/page.tsx`, `content/help/rodo-i-usuwanie-konta.mdx:30` | jak wyżej | **niezgodne** (I — materiały marketingowe) |
| Brak wzmianek | — | Google Fonts, logowanie Google, Cloudflare Email Routing, Slack, Telegram, usługi push, agenci AI, skrzynki pomocy | **brak** (PRC-01) |

## 6. Niewiadome i ograniczenia (co pozyskać od właściciela)

Niewiadome blokują wnioski o zgodności transferów i treść listy dla klientów; nie blokują zmian, które usuwają odbiorców (PRC-10, PRC-12, część PRC-15) ani poprawek tekstów, które dziś są nieprawdziwe (PRC-03).

| ID | Co pozyskać | Od kogo / skąd | Co odblokowuje |
|---|---|---|---|
| N-PRC-01 | Dla każdego dostawcy z R-01, R-03–R-09, R-17, R-20, R-22–R-25: podmiot umowy po obu stronach (osoba fizyczna czy spółka), plan, data i wersja zaakceptowanego DPA, mechanizm transferu wskazany w umowie | Bartosz (konta dostawców) | PRC-02, PRC-04, PRC-05, sekcja 3 |
| N-PRC-02 | Odczyty z paneli z datą: Sentry — region organizacji, retencja, ustawienie IP; PostHog — „IP data capture”, retencja, replay i heatmaps; Resend — region domeny, przechowywanie treści i logów; Anthropic — obszar roboczy, domyślna geografia, ustawienie retencji (ZDR lub nie) | operator; agent z dostępem tylko do odczytu | PRC-06, PRC-09, PRC-11, PRC-16 |
| N-PRC-03 | Które zmienne są ustawione w produkcji (bez wartości): `STRIPE_*`, `AWS_*`, `SLACK_WEBHOOK_*`, `TELEGRAM_*`, `OPS_HEARTBEAT_URL` (tylko nazwa dostawcy), host `UPSTASH_REDIS_REST_URL` (lokalny czy zewnętrzny), `R2_ENDPOINT` (ustawiony czy pusty), `TURNSTILE_*` | odczyt Coolify | R-07, R-17–R-21, PRC-15 |
| N-PRC-04 | Tryb proxy Cloudflare dla `faktflow.pl`, `www`, `db.` i `s3.` (DNS only czy Proxied); czy Email Routing jest włączony i dokąd przekazuje | panel Cloudflare | R-08, PRC-08 |
| N-PRC-05 | Ustawienia instancji Coolify (`do_not_track`, `SENTRY_DSN`), wersje MinIO (oba), Studio, Uptime Kuma; czy Kuma wysyła powiadomienia do Slacka | odczyt serwerów | R-02, PRC-13 |
| N-PRC-06 | Stan usunięcia dawnych usług (Vercel, Supabase Cloud, Inngest, Upstash, R2) z datami; czy baza deweloperska w Supabase Cloud zawiera wyłącznie dane syntetyczne | Bartosz | R-26, PRC-15 |
| N-PRC-07 | Agenci AI: kto ich uruchamia, na jakim planie (Claude Pro/Max/Team/Enterprise, klucz API; ChatGPT/Codex — plan), czy trenowanie jest wyłączone, czy wyniki z produkcji trafiały do PR, issue lub plików | Bartosz, Igor | PRC-07, R-23, R-24 |
| N-PRC-08 | Kraj, z którego operatorzy i agenci łączą się z serwerami (dostęp zdalny spoza EOG to także transfer) | zespół | sekcja 4.1 |
| N-PRC-09 | Hetzner: zaakceptowana umowa powierzenia, lokalizacja obrazów backupu, dostęp wsparcia | konsola Hetznera | R-01 |
| N-PRC-10 | Czy w produkcji są już dane prawdziwych osób (deklaracja z [PR225]: brak klientów, KSeF TEST) | Bartosz | ocena ryzyka wszystkich PRC |
| N-PRC-11 | Podmiot prawny operatora (spółka i jej dane) — od niego zależy strona umów z dostawcami i treść list | Bartosz | PRC-04, PRC-05 (wspólne z N-01 w `08-…`) |

Ograniczenia dowodowe tej sesji: brak dostępu do produkcji, paneli i umów; brak rozwiązywania DNS w środowisku (nie sprawdzono trybu proxy Cloudflare); strony dostawców i źródła prawa zablokowane polityką (sekcja 8.3). Fakty z [PR225] przytaczamy jako pomiar lub deklarację operatora.

## 7. Pytania do końcowego review prawnego

1. Czy FaktFlow może opierać automatyczną kategoryzację AI faktur kosztowych z KSeF (dane sprzedawców, w tym osób fizycznych prowadzących działalność) na ogólnej zgodzie klienta na dalszych procesorów, czy potrzebny jest wybór klienta (włączenie funkcji)? (PRC-06)
2. Czy dokumenty kosztowe w OCR mogą zawierać szczególne kategorie danych (np. faktury za usługi medyczne), skoro DPA Anthropic deklaruje „Special categories of personal data: None” (Schedule 1 B.3 [DOK-3])? Jak to ująć w umowie z klientem?
3. Jaki okres sprzeciwu i jaka forma powiadomienia o zmianie dalszego procesora (art. 28 ust. 2) są właściwe dla umowy z mikroprzedsiębiorcami i biurami rachunkowymi? Anthropic daje FaktFlow 15 dni [DOK-3] — termin wobec klientów nie może być od niego dłuższy, jeśli FaktFlow ma zdążyć zgłosić sprzeciw.
4. Rola Sentry wobec danych klientów, które mimo redakcji mogą znaleźć się w komunikatach błędów — wpisywać na listę dalszych procesorów czy traktować jako przetwarzanie FaktFlow jako administratora telemetrii?
5. Rola Cloudflare w Turnstile (procesor operatora strony czy odrębny administrator — dokumentacja Cloudflare mówi „on behalf of the website operator” [DOK-8]) i rola Google przy ładowaniu fontów (jeśli fonty zostaną, mimo rekomendacji PRC-10).
6. Podział ról ze Stripe (procesor czy odrębny administrator, w jakim zakresie).
7. Czy dopuszczalne jest przetwarzanie wyciągów z produkcji przez agentów AI na planach konsumenckich (warunki bez DPA, możliwe trenowanie [DOK-9])? Minimum umowne dla agentów (PRC-07).
8. Czy UUID organizacji (dla jednoosobowej działalności) i numer KSeF zawierający NIP osoby fizycznej są danymi osobowymi w kontekście alertów (Telegram, Slack) i skryptów operacyjnych? (PRC-07, PRC-12)
9. Czy przy DPF wystarczy dokumentacja weryfikacji certyfikatu, czy rekomendowana jest pełna TIA także dla dostawców z DPF (z uwagi na przyszłość decyzji 2023/1795 [NZ])?
10. Jak opisać w polityce transfery „częściowe” (Sentry: konto i wsparcie w US; PostHog: przetwarzanie w US mimo przechowywania w UE), żeby informacja z art. 13 ust. 1 lit. f była rzetelna, a nie myląca?
11. Skrzynka pomocy na prywatnych kontach operatorów — czy przed założeniem spółki dopuszczalne jest prowadzenie kanału wniosków RODO na koncie osoby fizycznej i na jakich warunkach? (PRC-08)

## 8. Co sprawdziłem / czego nie mogłem sprawdzić

### 8.1. Sprawdzone w repozytorium (10.10.2026, `3e5e00d`)

- Hosty zewnętrzne w kodzie i konfiguracji (grep opisany w sekcji 0) i każdy z nich do miejsca wywołania; CSP (`lib/security/csp.ts`), przepisania `/ingest` i tunel `/monitoring` (`next.config.ts`).
- Inicjalizacje Sentry (przeglądarka, Node, Edge, worker), redakcja (`lib/observability/scrub.ts`), zachowanie IP w zainstalowanym SDK 10.53.1 (`@sentry/browser` `prod/client.js:26-29`).
- PostHog: konfiguracja przeglądarki i serwera, host EU, wywołania serwerowe.
- Resend: wszystkie miejsca wysyłki, załączniki, `Reply-To`; zakres regionów w SDK 6.12.0.
- Anthropic: wszystkie wywołania; FLO bez importu warstwy modelu (`lib/flo/llm.ts:1-3`, brak użyć `generateCopy`, `tests/unit/flo-nieaktywne.test.ts`); brak przełącznika AI dla organizacji (grep migracji i flag).
- Stripe, Turnstile, Google OAuth i Fonts, obrazy `lh3` (przez `next/image`, stałe dashboardu bez użycia), push (lista hostów), HIBP, GUS, MF, VIES, NBP.
- Slack, Telegram, bramka (`ops/bramka`, funkcje `ops.*` z `00100_ops_gate.sql` zwracają agregaty), Email Worker (`ops/poczta`), heartbeat, skrypt kopii.
- AWS Glacier (klient, cron, retencja 8 lat, poziom „deferred”), Redis/Upstash, fallback R2.
- Workflowy GitHub (w tym `agent.yml`), `renovate.json`, `Dockerfile` (`NEXT_TELEMETRY_DISABLED=1`, `:75,127`; CI `ci.yml:79`).
- Dokumenty: `AGENTS.md`, `docs/runbooks/{agent-kodu,skrzynka-pomoc}.md`, ADR 0007/0009, `docs/security/rto-rpo.md`, `docs/migration/PRZEPROWADZKA-HETZNER.md`, strony prawne (`polityka-prywatnosci`, `rodo`, `regulamin`), treści pomocy, wcześniejszy rejestr `docs/security/audyt/REJESTR-USTALEN.md` (SEC-D-01, SEC-D-05).
- PR #225 @ `686a465`: `runtime-inventory.md`, `data-policy.md`, `evidence/f0-2026-10-04.json`, `f0-2026-10-06.json`, `f0-2026-10-10.json`, `f0-decisions-2026-10-07.json` (tylko pola bez identyfikatorów kont).

### 8.2. Dokumentacja dostawców odczytana 10.10.2026

| ID | URL | Wynik | Cytat (maks. 2 zdania) |
|---|---|---|---|
| DOK-1 | https://www.anthropic.com/legal/commercial-terms | 200; „Effective June 17, 2025” | „“Anthropic” means Anthropic Ireland, Limited if Customer resides in the European Economic Area (“EEA”), Switzerland or UK, and Anthropic, PBC if Customer resides anywhere else.” „Anthropic may not train models on Customer Content from Services.” |
| DOK-2 | https://www.anthropic.com/legal/privacy | 200; „Effective September 10, 2026”; polityka nie obejmuje treści przetwarzanych dla klientów biznesowych | „Anthropic is a global company, and when you access our Services, your personal data is transferred to our servers in the US, or to other countries outside the European Economic Area (“EEA”) and the UK…” |
| DOK-3 | https://www.anthropic.com/legal/data-processing-addendum | 200; „Effective February 24, 2025” | „The parties agree that, to the extent required by Applicable Data Protection Laws, the terms of the SCCs Module Two (controller to processor) and/or Module Three (processor to processor)… are hereby incorporated by reference…” „Customer may… object to Anthropic’s use of such Subprocessor by providing Anthropic with written notice of the objection within fifteen (15) days…” |
| DOK-4 | dokumentacja SDK Anthropic dołączona do narzędzia sesji (skill `claude-api`: `shared/managed-agents-core.md:265`, `shared/platform-availability.md:23`, `SKILL.md` § Vertex AI; stan na 2026-10-06) — **nie odczyt online, nie umowa**; wartości opisane dla Managed Agents, dla Messages API przykład z `"us"` | odczyt lokalny | „Accepts `"us"` or `"global"`” (o `inference_geo`). O Vertex AI: „`region` can be `"global"` (recommended), a multi-region (`"us"`/`"eu"`), or a specific region.” |
| DOK-5 | https://raw.githubusercontent.com/getsentry/sentry-docs/master/docs/organization/data-storage-location/index.mdx | 200 | Tabela: „European Union (EU) \| EU \| Frankfurt, Germany”. „If you choose to share data in a support ticket, chat or other support interaction, the data will be stored in the US.” |
| DOK-5a | https://raw.githubusercontent.com/getsentry/sentry-docs/master/docs/platforms/javascript/common/data-management/data-collected/index.mdx | 200; opisuje nowszą opcję `dataCollection`, której zainstalowane SDK 10.53.1 nie ma — zachowanie IP sprawdzone w `node_modules` | „By default, the SDK sends the user's IP address.” (dla wersji z `dataCollection`) |
| DOK-6 | https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/privacy/index.mdx; `…/contents/docs/privacy/gdpr-compliance.mdx`; `…/src/pages/subprocessors.tsx`; `…/src/data/subprocessors.json` | 200 / 200 / 200 / 200 | „All PostHog Cloud customers can get a DPA, on any plan.” „For organizations using PostHog Cloud EU, IP data capture is automatically disabled by default for all new projects.” Cloudflare: „Global edge locations (dynamic, worldwide) for data in transit”. |
| DOK-7 | https://raw.githubusercontent.com/PostHog/posthog.com/master/src/pages/dpa.tsx | 200 (źródło strony z podglądem DPA; dostawca zastrzega, że wiąże tylko kopia wygenerowana w aplikacji) | „The Company acknowledges that the Processor will Process the Company Personal Data outside of the Protected Area including in the US and elsewhere as identified on the Subprocessor Page to provide the Services.” |
| DOK-8 | https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/turnstile/index.mdx | 200 (strona „Turnstile Privacy Addendum” w repo to tylko link do cloudflare.com — zablokowane) | „Turnstile performs client-side security challenges on behalf of the website operator to distinguish human visitors from automated traffic.” |
| DOK-9 | https://www.anthropic.com/legal/consumer-terms | 200; „Effective October 8, 2025” | „For clarity, this does not include Claude.ai or Claude Pro use for individuals or entities.” „We may use Materials to provide, maintain, and improve the Services and to develop other products and services, including training our models, unless you opt out of training through your account settings.” |
| DOK-10 | https://raw.githubusercontent.com/supabase/supabase/master/docker/docker-compose.yml, `docker/.env.example` | 200 / 200 | (wynik grep: brak wpisów `telemetry`, `posthog`, `sentry`, `segment` w compose) |
| DOK-11 | https://raw.githubusercontent.com/coollabsio/coolify/main/ — `config/constants.php`, `app/Models/InstanceSettings.php`, `config/sentry.php`, `.env.production`, `scripts/install.sh`, `app/Jobs/CheckForUpdatesJob.php`, `templates/compose/supabase.yaml` | 200 dla wszystkich | `'versions_url' => env('VERSIONS_URL', env('CDN_URL', 'https://cdn.coollabs.io').'/coolify/versions.json')`; `.env.production` bez `SENTRY_DSN`; `InstanceSettings` ma pole `do_not_track`. Szablon Supabase: „# Uncomment to use Big Query backend for analytics” (wariant wyłączony). |
| DOK-12 | https://raw.githubusercontent.com/minio/minio/master/README.md | 200 | „THIS REPOSITORY IS NO LONGER MAINTAINED.” „The MinIO community edition is now distributed as source code only.” |

### 8.3. Próby nieudane (każda raz, bez obchodzenia)

| URL / cel | Wynik |
|---|---|
| https://www.anthropic.com/legal/dpa, https://www.anthropic.com/legal/subprocessors | 404 (właściwe adresy: `/legal/data-processing-addendum`; lista procesorów poza `/legal`) |
| https://www.anthropic.com/subprocessors | przekierowanie na `trust.anthropic.com` — CONNECT odrzucony (polityka) |
| `gh api repos/getsentry/sentry-docs/…` | 403 — sesja bez dostępu GitHub API do cudzych repozytoriów |
| https://github.com/getsentry/sentry-docs/tree/master/docs/organization | 403 |
| https://api.github.com/repos/PostHog/posthog.com/commits?… | 403 |
| sentry-docs: 5 ścieżek o retencji (`docs/organization/data-retention-periods/…` i warianty) | 404; `docs/pricing/index.mdx` 200, ale bez informacji o retencji |
| posthog.com repo: `contents/docs/privacy/eu.mdx`, `contents/subprocessors.md(x)`, `contents/dpa.mdx` | 404 (znaleziono właściwe pliki w `src/`) |
| cloudflare-docs: `turnstile/frequently-asked-questions.mdx`, cztery ścieżki `email-routing/…` | 404 — dokumentacji Email Routing nie odczytano |
| healthchecks repo: `templates/front/privacy.html`; resend: `resend/resend-docs`, `resend/docs` | 404 |
| https://telegram.org/privacy, https://developers.google.com/fonts/faq/privacy, https://docs.hetzner.com/…/backups-snapshots/, https://slack.com/trust/compliance/gdpr, https://haveibeenpwned.com/Privacy, https://www.dataprivacyframework.gov/list | CONNECT odrzucony (polityka) |
| Rozwiązywanie DNS domeny (`getent`) | brak odpowiedzi w środowisku — nie obchodzono przez DNS-over-HTTPS |
| Nie próbowano (zablokowane według briefu): sentry.io, posthog.com, stripe.com, resend.com, hetzner.com, cloudflare.com, upstash.com, supabase.com, eur-lex.europa.eu, edpb.europa.eu, uodo.gov.pl | — |

### 8.4. Czego nie sprawdziłem

- Treści żadnej umowy FaktFlow z dostawcą ani akceptacji warunków na kontach; planów, regionów i retencji ustawionych w panelach (poza danymi z [PR225]).
- Rzeczywistych żądań sieciowych z produkcji i zawartości zdarzeń w Sentry i PostHog (test przeglądarkowy na lokalnym buildzie — `A4-…`).
- Statusu certyfikatów DPF dostawców; listy dalszych procesorów Anthropic, Sentry, Resend, Stripe, Cloudflare, Hetznera, Slacka, Telegrama.
- Trybu proxy Cloudflare i stanu Email Routing; konfiguracji Coolify, MinIO, Studio i Uptime Kuma.
- Przepisów w źródłach pierwotnych (RODO, decyzja 2023/1795, zalecenia EROD 01/2020, wyrok C-311/18, orzeczenie LG München I) — wszystkie oznaczone [NZ].
- Brak niezależnego review tego etapu w momencie zapisu — recenzja R2 według `01-STAN-I-GRANICE.md` § 7.
