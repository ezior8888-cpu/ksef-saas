# R2 — Recenzja etapów: rejestr źródeł (03) oraz procesorzy i lokalizacje (04)

| | |
|---|---|
| Grupa | audyt „13. Prywatność i zgodność”, etapy ZRD (`03-REJESTR-ZRODEL.md`) i PRC (`04-PROCESORZY-I-LOKALIZACJE.md`) |
| Recenzent | R2 — niezależny recenzent (agent); nie jest autorem żadnego z recenzowanych etapów |
| Data | 10.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza `claude/gallant-faraday-ypjokp`); gałąź PR #225 @ `686a465` |
| Zakres | pokrycie wymagań `00-ZADANIE.md` właściwych dla etapów, kontrole punktowe tez w kodzie, rzetelność źródeł i klas P/O/S/I, luki, sprzeczności, zasady repo publicznego |
| Źródła danych | `BRIEF.md` (z ADDENDUM 1 i 2), `00-ZADANIE.md`, `01-STAN-I-GRANICE.md`, oba recenzowane pliki (w całości), kod repo, zainstalowane SDK w `node_modules`, gałąź PR #225, 5 powtórzonych pobrań URL (sekcja 2.3) |
| Ograniczenia | bez WebSearch; egress filtrowany — domen zablokowanych nie odpytywałem (403 = polityka); brak dostępu do produkcji, paneli i umów dostawców. Wiedza prawna recenzenta oznaczona: „niezweryfikowane online 2026-10-10 (egress zablokowany) — treść wg wiedzy modelu” (skrót: **[NZ-R2]**) |

## 1. Werdykt per plik

| Plik | Werdykt | Uzasadnienie w jednym akapicie |
|---|---|---|
| `03-REJESTR-ZRODEL.md` | **zatwierdzony z uwagami** | Plik jest kompletny i rzetelny metodycznie. Jedyny odczyt online (Anthropic Commercial Terms) powtórzyłem — URL działa, a wersja, daty i cytowane sekcje się zgadzają. Pozostałe źródła są uczciwie oznaczone jako NZ, a niepewne numery jako „do potwierdzenia”. Dokumenty konsultacyjne (ZR-42, ZR-43) i projekt ePrivacy (ZR-07) nie tworzą samodzielnych wymagań. Klasy P/O/S/I są przypisane poprawnie, z jednym wyjątkiem (WYM-72). Daty i numery, które znam (RODO, decyzje 2021/914, 2021/915 i 2023/1795, AI Act, wytyczne EDPB, WP29, TSUE, Dz.U.), są prawdopodobne i w większości zgodne z moją wiedzą. Wszystkie 21 kontroli punktowych w kodzie wyszło pozytywnie, dwie z drobną nieścisłością. Uwagi: brak kilku orzeczeń TSUE ważnych dla wymagań o dostępie i rolach (istotna) oraz drobne braki w katalogu (AI Act art. 4, technologie w urządzeniu, Data Act jako sygnał). |
| `04-PROCESORZY-I-LOKALIZACJE.md` | **wymaga poprawek** | Rejestr jest szeroki i w większości dobrze udokumentowany: 27 kontroli punktowych, 3 powtórzone odczyty dokumentacji dostawców się zgadzają. Nie ma zgadywania treści umów — DPA są cytowane tylko tam, gdzie je odczytano. Trzy błędy merytoryczne zmieniają jednak wnioski. (1) `ip: false` w PostHog przedstawiono jako środek minimalizacji, a w zainstalowanym SDK ta opcja **nie ma żadnego efektu**. (2) Brakuje odbiorcy i ryzyka „testowe środowisko KSeF z danymi produkcyjnymi”, choć sam plik podaje, że produkcja ma `KSEF_ENV=test`. (3) W ocenie łańcucha „opcji UE nie znaleziono” zamieniono na „brak regionu UE w API Anthropic”, co myli „nie znaleziono” z „nie istnieje”. Wszystkie poprawki da się nanieść bez ponownego badania — treść podaję w sekcji 3. |
| **Grupa (najgorszy)** | **wymaga poprawek** | — |

## 2. Kontrole punktowe

### 2.1. `03-REJESTR-ZRODEL.md` — 21 kontroli

| ID | Teza autora (miejsce w 03) | Dowód sprawdzony przez R2 | Wynik |
|---|---|---|---|
| K03-01 | Polityka ma placeholder administratora (§2.1a art. 27, WYM-18, N-ZR-09) | `app/(marketing)/legal/polityka-prywatnosci/page.tsx:20-21` — „[nazwa firmy], NIP [TWÓJ_NIP], z siedzibą w Poznaniu” | potwierdzone |
| K03-02 | Polityka deklaruje SCC z dostawcami z USA (ZR-04, WYM-60) | `polityka-prywatnosci/page.tsx:91,102,106,111` (+ `:114` Inngest) | potwierdzone |
| K03-03 | „Faktury: 10 lat (art. 70 § 1 OP)” (ZR-14, WYM-68) | `polityka-prywatnosci/page.tsx:230` | potwierdzone |
| K03-04 | Lista dostawców wymienia Supabase, R2, Vercel, Inngest; brak PostHog (WYM-19) | `polityka-prywatnosci/page.tsx:85,88,99,114`; lista `:81-120` bez PostHog (PostHog tylko w `:240`) | potwierdzone |
| K03-05 | Analityka serwerowa na uzasadnionym interesie (WYM-04, WYM-12, WYM-28) | `polityka-prywatnosci/page.tsx:243-246` | potwierdzone |
| K03-06 | 14 dni na wycofanie i „najpóźniej w ciągu miesiąca” (WYM-75) | `lib/gdpr/deletion.ts:6` (`GDPR_COOLING_OFF_DAYS = 14`), `:107`; `polityka-prywatnosci/page.tsx:170-174` | potwierdzone |
| K03-07 | Strona RODO: „Frankfurt (Hetzner, Vercel)”, „Brak cookies analitycznych”, DPA „na żądanie”, „72 godziny” (WYM-19, WYM-41, WYM-53) | `app/(marketing)/legal/rodo/page.tsx:20`, `:47`, `:54-58`, `:61-65` | potwierdzone |
| K03-08 | Regulamin: pełnoletność, placeholder, brak postanowień o powierzeniu (WYM-16, N-ZR-09) | `regulamin/page.tsx:56`, `:23`; grep „powierz\|podmiot przetwarzaj” w regulaminie — 0 trafień | potwierdzone |
| K03-09 | Newsletter: e-mail, źródło, czas, bez wersji treści i bez potwierdzenia (WYM-13, WYM-66) | `supabase/migrations/00059_newsletter_subscribers.sql:12-22`; `app/actions/newsletter.ts:34-71` (upsert bez kroku potwierdzenia) | potwierdzone |
| K03-10 | Zgoda analityczna tylko w `localStorage` pod kluczem `ff_analytics_consent` (WYM-13, WYM-63) | `lib/analytics/consent.ts:2,20,31` | potwierdzone |
| K03-11 | PostHog: `persistence: 'memory'`, opt-out domyślny, bez autocapture i replay (WYM-32) | `lib/analytics/init-posthog-browser.ts:29-37` | potwierdzone |
| K03-12 | Wypis z kategorii e-mail (WYM-14) | `lib/email/preferences.ts:93-101` (upsert z `unsubscribed_at`) | potwierdzone |
| K03-13 | Domyślne `retention_years = 10`, usuwanie po retencji (WYM-45) | `supabase/migrations/00009_retention.sql:7-9`; `lib/jobs/runners/retention-delete.ts:14,59` | potwierdzone |
| K03-14 | `AGENTS.md`: NBG1, fikcyjny NIP, „RODO — retencja 10 lat” (WYM-19, WYM-37, WYM-45) | `AGENTS.md:22,89`, `:75`, `:87` | potwierdzone |
| K03-15 | Portal sprawdza `expires_at` i `revoked_at` (WYM-33) | `app/api/portal/exports/generate/route.ts:49-66` — tak; `lib/accountant/load-accountant-portal.ts:51` to tylko `select`, sprawdzenie jest w `:57-58` | częściowe (zły numer linii) |
| K03-16 | Turnstile w akcjach rejestracji i resetu hasła (WYM-63) | `app/(auth)/register/actions.ts:14`, `app/(auth)/forgot-password/actions.ts:10,29`; pominięte logowanie: `app/(auth)/login/actions.ts:11,32` | potwierdzone (niepełna lista) |
| K03-17 | OCR wysyła obraz do modelu (ZR-06, WYM-62) | `lib/ocr/engine.ts:148-158` | potwierdzone |
| K03-18 | Usuwanie plików faktur z magazynów (WYM-71) | `lib/retention/invoice-files.ts:9-16` | potwierdzone |
| K03-19 | FLO jest konsumentem `lib/anthropic/client.ts` i dalszym procesorem „dla FLO” (ZR-80, WYM-62) | import jest (`lib/flo/llm.ts:27`), ale moduł jest oznaczony jako nieaktywny i nie ma importera (`lib/flo/llm.ts:1-3`, `tests/unit/flo-nieaktywne.test.ts`; `generateCopy` użyte tylko w definicji `lib/flo/llm.ts:226`) | częściowe |
| K03-20 | Jedyny odczyt online: Commercial Terms, „Effective June 17, 2025”, sekcja B (zakaz trenowania), C (DPA przez odesłanie), zmiany z 30-dniowym wyprzedzeniem (ZR-80, sekcja 1.1) | ponowne pobranie 10.10.2026 19:55 UTC, HTTP 200; „Effective June 17, 2025”; „Anthropic may not train models on Customer Content from Services”; „C. Data Privacy … Data Processing Addendum … incorporated … by reference”; „M.3 … effective 30 days after the updates are posted” (z wyjątkiem zmian prawa) | potwierdzone |
| K03-21 | 75 wymagań WYM-01–WYM-75 i 7 WYM-SOC; spójność odwołań | skrypt: 75 unikalnych ID WYM, ciągłe, bez duplikatów; każdy WYM i ZR, do którego plik się odwołuje, jest zdefiniowany | potwierdzone |

### 2.2. `04-PROCESORZY-I-LOKALIZACJE.md` — 27 kontroli

| ID | Teza autora (miejsce w 04) | Dowód sprawdzony przez R2 | Wynik |
|---|---|---|---|
| K04-01 | CSP dopuszcza Turnstile, origin Supabase, Google Fonts, `https:` dla obrazów, formularze do Google i Stripe (§0 pkt 4) | `lib/security/csp.ts:7-42` | potwierdzone |
| K04-02 | PostHog przez `/ingest` do `eu.i.posthog.com`, Sentry przez `/monitoring` (§0, R-03, R-04) | `next.config.ts:140-155`, `:189` | potwierdzone |
| K04-03 | Sentry: `sendDefaultPii: false`, redakcja, `infer_ip: 'never'`; w przeglądarce bez bramki zgody (R-03, PRC-16) | `instrumentation-client.ts:5-21`; `lib/observability/scrub.ts:70-79`; `node_modules/.pnpm/@sentry+browser@10.53.1/…/esm/prod/client.js:26-29` | potwierdzone |
| K04-04 | PostHog w przeglądarce „`ip: false`” jako element minimalizacji (R-04) | opcja `ip` w zainstalowanym `@posthog/types@1.374.3` (zależność `posthog-js` 1.374.3): `dist/posthog-config.d.ts:1490-1494` — „@deprecated - THIS OPTION HAS NO EFFECT … Use … "Discard IP data" project setting instead” | **obalone** |
| K04-05 | Klient Anthropic bez `baseURL` i bez `inference_geo` (R-06, PRC-06) | `lib/anthropic/client.ts:13-21`; brak `inference_geo` w wywołaniach (`lib/ocr/engine.ts:148`, `lib/categorization/ai-classifier.ts:34`, `lib/support/chat.ts:79`) | potwierdzone |
| K04-06 | Klasyfikator wysyła nazwę i NIP sprzedawcy, numer, pozycje, kwotę — „dla **każdej** faktury kosztowej … jedynym ogranicznikiem jest budżet” (PRC-06) | treść potwierdzona: `lib/categorization/ai-classifier.ts:46-52`. Ale model jest wołany dopiero wtedy, gdy nie zadziałają reguły organizacji (NIP, nazwa, słowa kluczowe) ani heurystyka: `lib/categorization/index.ts:45-67`, `:71-76` | częściowe (nadmierne uogólnienie) |
| K04-07 | `Reply-To: pomoc@…` „we wszystkich e-mailach, także w fakturach do kontrahentów” (R-05, PRC-08) | `lib/email/send.ts:197-200` — tak dla wysyłek przez `sendViaResend` (także faktura z PDF `:574-579`); wezwania do zapłaty mają `replyTo` z ustawień klienta: `lib/reminders/prepare-delivery.ts:93-94,131`, `lib/jobs/runners/send-reminder.ts:76` | częściowe |
| K04-08 | Turnstile dostaje IP klienta (`remoteip`) (R-08, §5) | `lib/security/turnstile.ts:116-129` | potwierdzone |
| K04-09 | Google Fonts w głównym layoucie, na każdej stronie (R-09, PRC-10) | `app/layout.tsx:114-125`; `lib/security/csp.ts:30,32` | potwierdzone |
| K04-10 | Glacier: domyślnie `eu-central-1`, usunięcie po 8 latach, cron codziennie, bez sprawdzenia konfiguracji (R-20, PRC-15) | `lib/storage/glacier.ts:10`; `lib/jobs/runners/archive-old-invoices.ts:20-60` (brak strażnika konfiguracji AWS przed pętlą), `:97-100`; `lib/jobs/queues.ts:89`; `lib/jobs/handlers/package-a.ts:42` | potwierdzone |
| K04-11 | Przy pustym `R2_ENDPOINT` kod łączy się z Cloudflare R2 (R-08e, PRC-15) | `lib/storage/r2-client.ts:31-38`, `:72-75` (wybór adresu; `:53` to tylko odczyt zmiennej) | potwierdzone |
| K04-12 | Sprzeczne komentarze o Redis/Upstash (§1 akapit Upstash) | `lib/cache/redis.ts:1-8`; `.env.example:268-273`; `scripts/check-env.ts:85`; [PR225] `evidence/f0-2026-10-04.json` (`upstash_service: false`) | potwierdzone |
| K04-13 | E-mail użytkownika do Slacka przy eskalacji; kanał `urgent` także na Telegram z UUID organizacji (R-17, R-18, PRC-12) | `lib/support/support-actions.ts:76-83`; `lib/alerts/slack.ts:93-113`; `lib/jobs/runners/cert-expiry-alert.ts:227-237` | potwierdzone |
| K04-14 | Skrypt operacyjny zwraca `tenant_id`, numery faktur, numery KSeF i log workera z 2 h (R-24, PRC-07) | `scripts/ops/kontrola-faktur-ksef.sh:135`, `:186-209` | potwierdzone |
| K04-15 | Push: lista hostów, TTL 24 h (R-10) | `lib/push/endpoint.ts:11-19`; `lib/push/sender.ts:111` | potwierdzone |
| K04-16 | HIBP: 5 znaków SHA-1, k-anonimowość (R-16) | `lib/auth/breach-check.ts:17,34-43` | potwierdzone |
| K04-17 | Stripe: e-mail, nazwa, NIP, `tenantId`, `tax_id` (R-07) | `lib/stripe/customer.ts:90-101` | potwierdzone |
| K04-18 | Stripe i AWS na poziomie „deferred” (R-07, R-20) | `scripts/check-env.ts:124-127`, `:132-135` | potwierdzone |
| K04-19 | Email Worker nie przekazuje treści do Telegrama (R-08c, PRC-08, PRC-12) | `ops/poczta/worker.mjs:8-10`, `:46-55` | potwierdzone |
| K04-20 | Wcześniejsze SEC-D-01 twierdziło „transferu poza EOG nie ma” (PRC-09) | `docs/security/audyt/REJESTR-USTALEN.md:48` | potwierdzone |
| K04-21 | Stałe `ff-assets.ts` bez użycia (R-09) | grep: `FF_DASHBOARD_DECOR_IMG`, `FF_DASHBOARD_AVATAR_FALLBACK` — 0 użyć poza definicją | potwierdzone |
| K04-22 | DOK-3 (DPA Anthropic): „Effective February 24, 2025”; I.1 SCC moduł 2/3; C.3 15 dni; I.4 TIA; H.1 30 dni; Schedule 1 B.3 „None”, B.7 okres umowy | ponowne pobranie 19:55 UTC, HTTP 200 — wszystkie cytowane punkty znalezione w tekście | potwierdzone |
| K04-23 | DOK-7 (PostHog `dpa.tsx`): 10.2 przetwarzanie w US, 10.3 DPF, 10.4 SCC | ponowne pobranie, HTTP 200 — brzmienie 10.2 identyczne; 10.3 „Processor confirms that it participates in the EU-US Data Privacy Framework”; 10.4 SCC | potwierdzone |
| K04-24 | DOK-5 (Sentry): EU = Frankfurt; dane ze zgłoszeń wsparcia w US; lista danych w US niezależnie od regionu | ponowne pobranie, HTTP 200; `index.mdx:22`, `:44-58`, `:62` | potwierdzone |
| K04-25 | DOK-9 (Consumer Terms): Commercial Terms nie obejmują Claude.ai/Pro; trenowanie, „chyba że konto ma wyłączoną tę opcję” (R-23, PRC-07) | ponowne pobranie, HTTP 200, „Effective October 8, 2025”; cytat 1 zgodny. Cytat 2 urwany — dalej: „Even if you opt out, we will use Materials for model training when: (1) you provide Feedback …” | częściowe (pominięte wyjątki) |
| K04-26 | „Brak regionu UE w API Anthropic … transfer pełny” (§4.1; podstawa DOK-4) | DOK-4 to dokumentacja narzędzia sesji opisująca Managed Agents (autor sam to zaznacza w §8.2). Zainstalowany SDK 0.95.0: `inference_geo?: string \| null`, przy braku wartości obowiązuje `default_inference_geo` obszaru roboczego (`node_modules/.pnpm/@anthropic-ai+sdk@0.95.0_zod@4.4.1/node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:1988-1992`); odpowiedź zwraca `usage.inference_geo` (`:1496-1499`) | częściowe (nadinterpretacja) |
| K04-27 | Dokumenty operacyjne: ADR 0009 „Proposed”, ping Healthchecks w skrypcie kopii, SMTP GoTrue przez Resend, [PR225] B2 i ustawienia PostHog | `docs/adr/0009-…:3`; `scripts/hetzner/db-backup.sh:19,46-49`; `docs/migration/PRZEPROWADZKA-HETZNER.md:495-499`; `git show origin/codex/f0-runtime-inventory:docs/observability/evidence/f0-2026-10-10.json` (rekomendacja B2 EU Central), `runtime-inventory.md:152-154` (replay i heatmaps włączone) | potwierdzone |

### 2.3. Powtórzone pobrania URL oznaczonych jako odczytane

Każde pobranie jednokrotne, 10.10.2026 ok. 19:55 UTC, `curl -sS -L --max-time 25`. Domen zablokowanych nie odpytywałem.

| Plik | URL | Wynik R2 | Zgodność z autorem |
|---|---|---|---|
| 03 (ZR-80) | https://www.anthropic.com/legal/commercial-terms | 200 | zgodne (K03-20) |
| 04 (DOK-3) | https://www.anthropic.com/legal/data-processing-addendum | 200 | zgodne (K04-22) |
| 04 (DOK-7) | https://raw.githubusercontent.com/PostHog/posthog.com/master/src/pages/dpa.tsx | 200 | zgodne (K04-23) |
| 04 (DOK-5) | https://raw.githubusercontent.com/getsentry/sentry-docs/master/docs/organization/data-storage-location/index.mdx | 200 | zgodne (K04-24) |
| 04 (DOK-9) | https://www.anthropic.com/legal/consumer-terms | 200 | częściowo — cytat urwany (K04-25) |

Wniosek: żaden z autorów nie udaje weryfikacji online. Plik 03 ma jeden odczyt i oznacza wszystko inne jako NZ. Plik 04 opisuje próby nieudane (§8.3) i odróżnia dokumentację w repozytorium dostawcy od umowy.

## 3. Uwagi

Wagi: **blokująca** — bez poprawki etap nie może przejść; **istotna** — błąd albo brak zmieniający wniosek, ryzyko lub listę odbiorców; **drobna** — precyzja, spójność, wygoda dalszych etapów.

### 3.1. Uwagi do `03-REJESTR-ZRODEL.md`

| ID | Waga | Miejsce | Problem | Wymagana zmiana (gotowa do naniesienia) |
|---|---|---|---|---|
| R2-U01 | istotna | §2.5 (orzecznictwo); WYM-21, WYM-22, WYM-39; Q-ZR-07 | Brakuje orzeczeń TSUE bezpośrednio dotyczących wymagań z katalogu. Chodzi o tożsamość odbiorców w prawie dostępu, bezpłatną pierwszą kopię niezależnie od motywu, logi dostępu jako dane i współadministrowanie przy osadzaniu zasobów stron trzecich. To ostatnie dotyczy Google Fonts i analityki — 04 PRC-10 i pytanie 5 opierają się dziś tylko na wyroku sądu niemieckiego. | Dopisać do §2.5 cztery wiersze, wszystkie z „Weryfikacja: NZ (wg wiedzy modelu recenzenta R2); do potwierdzenia: data i teza”: **ZR-65** — wyrok TSUE z 12.01.2023, C-154/21, RW v Österreichische Post: art. 15 ust. 1 lit. c — na żądanie trzeba podać konkretnych odbiorców, a nie tylko kategorie, chyba że to niemożliwe albo żądanie jest ewidentnie nieuzasadnione lub nadmierne → WYM-21, WYM-26. **ZR-66** — wyrok TSUE z 26.10.2023, C-307/22, FT v DW: pierwsza kopia jest bezpłatna także wtedy, gdy żądanie służy celowi innemu niż ochrona danych → WYM-22, WYM-75. **ZR-67** — wyrok TSUE z 22.06.2023, C-579/21, Pankki S: informacje z logów o konsultacjach danych osoby są informacjami, do których ma ona dostęp; tożsamość pracowników co do zasady nie → WYM-21, WYM-35 (`audit_logs`). **ZR-68** — wyrok TSUE z 29.07.2019, C-40/17, Fashion ID: podmiot osadzający na stronie zasób strony trzeciej, który przekazuje jej dane odwiedzających, może być współadministratorem w zakresie zbierania i przekazania → WYM-39, WYM-63, 04 PRC-10. Wszystkie cztery wpisać w §4 do typowych źródeł klasy P. |
| R2-U02 | drobna | WYM-72 (klasa „O, I”) | Klasa O opiera się tylko na ZR-45 o nieznanym statusie. Własna zasada 4 z §4 mówi, że źródło o niepotwierdzonym statusie nie tworzy samodzielnego wymagania. | Zmienić klasę WYM-72 na „I (O — do potwierdzenia statusu ZR-45)” i dopisać w uwagach: „Do czasu potwierdzenia raportu CEF 2025 to praktyka inżynierska, nie interpretacja organu.” |
| R2-U03 | drobna | ZR-80, WYM-62 („dalszy procesor … i FLO”; „Użycie: … `lib/flo/llm.ts`”) | FLO importuje klienta Anthropic, ale jest nieaktywny i nie ma importera w kodzie produkcyjnym. Plik 04 (R-06) opisuje to poprawnie, więc oba pliki są dziś niespójne. | W ZR-80 zamienić „dla supportu, OCR, kategoryzacji i FLO” na „dla supportu, OCR i kategoryzacji (FLO — moduł nieaktywny, bez importera: `lib/flo/llm.ts:1-3`, `tests/unit/flo-nieaktywne.test.ts`)”. W WYM-62 przy `lib/flo/llm.ts` dopisać „(nieaktywny)”. |
| R2-U04 | drobna | ZR-80 „Uwaga…”, WYM-62, N-ZR-10 („DPA Anthropic nieodczytane”) | Plik 04 odczytał DPA (DOK-3), a 03 tego nie uwzględnia. Recenzent potwierdził treść DPA (K04-22). | W N-ZR-10 dopisać: „DPA Anthropic odczytane w `04-…` (DOK-3, wersja „Effective February 24, 2025”): SCC moduł 2/3 (I.1), dalsi procesorzy — sprzeciw w 15 dni (C.3), usunięcie w 30 dni po zakończeniu umowy (H.1), okres przechowywania = czas umowy (Schedule 1 B.7).” W ZR-80 „Uwaga” dopisać: „DPA przewiduje przechowywanie przez czas umowy (Schedule 1 B.7) — teza polityki „nie są przechowywane” wymaga sprostowania (04 §5).” |
| R2-U05 | drobna | ZR-04 („numer klauzuli do potwierdzenia”) | Plik 04 §4.2 podaje klauzulę 14, więc oba pliki są niespójne. | W ZR-04 wpisać: „klauzula 14 (prawo i praktyki państwa trzeciego) i klauzula 15 (obowiązki importera przy dostępie organów publicznych) — NZ, wg wiedzy modelu i recenzenta R2 (wysoka pewność)”. |
| R2-U06 | drobna | WYM-63 (punkt zaczepienia), Q-ZR-06 | Lista technologii w urządzeniu jest niepełna. Brakuje: service workera z Cache Storage (`app/sw.ts:16-38`, `@serwist/next`; buforuje tylko publiczne zasoby statyczne, 7 dni), `sessionStorage` (`app/(dashboard)/_components/ksef-health-banner-client.tsx:73`), `localStorage` dla banerów (`components/dashboard/dismissible-banner.tsx:63`) i motywu (`components/dashboard/theme-toggle.tsx:37`), ciasteczka organizacji na 30 dni (`app/actions/organizations.ts:36-43`), ciasteczka 30-dniowego w `lib/supabase/middleware.ts:337` oraz subskrypcji push. Pominięty Turnstile przy logowaniu (`app/(auth)/login/actions.ts:11,32`). Polityka deklaruje „Cookies preferencji: 1 rok” (`polityka-prywatnosci/page.tsx:233`) — takiego ciasteczka nie znalazłem w repo. | Dopisać te miejsca do „Punktu zaczepienia” WYM-63 i do Q-ZR-06 (klasyfikacja per technologia). Dopisać do WYM-19 niespójność „Cookies preferencji: 1 rok” (`:233`) wobec ciasteczek 30-dniowych w kodzie (do potwierdzenia w A4). |
| R2-U07 | drobna | ZR-06 / WYM-62 | ZR-06 wymienia art. 4 AI Act (kompetencje w zakresie AI, od 2.02.2025), ale żadne wymaganie go nie obejmuje. FF stosuje systemy AI w OCR, kategoryzacji i czacie wsparcia. | Dopisać do WYM-62 zdanie: „Art. 4 AI Act — zapewnienie kompetencji w zakresie AI osobom obsługującym te systemy (od 2.02.2025; P dla FF jako podmiotu stosującego — kwalifikacja do review, Q-ZR-14).” |
| R2-U08 | drobna | §2.2 (ZR-12, ZR-13), N-ZR-05, N-ZR-06 | Recenzent może zawęzić dwie niewiadome (NZ-R2, średnia pewność): (a) PKE uchyliło art. 10 UŚUDE, a zakaz niezamówionej informacji handlowej przeniesiono do art. 398 PKE; (b) okres 10 lat przechowywania faktur w KSeF wynika z art. 112ba ustawy o VAT. | Dopisać w N-ZR-05: „wg wiedzy recenzenta R2 (średnia pewność, NZ): art. 10 UŚUDE uchylony przez PKE; zakaz w art. 398 PKE — do potwierdzenia”. W N-ZR-06: „wg wiedzy recenzenta R2 (średnia pewność, NZ): art. 112ba ustawy o VAT — do potwierdzenia”. Nie przenosić do WYM bez potwierdzenia. |
| R2-U09 | drobna | WYM-37 (dane testowe) | Wymaganie nie obejmuje testowego środowiska KSeF Ministerstwa Finansów. Pomoc aplikacji zakazuje wysyłania tam prawdziwych danych (`content/help/srodowisko-testowe-ksef.mdx:19`), a według [PR225] produkcja ma `KSEF_ENV=test`. Kod domyślnie wybiera `test`: `lib/jobs/runners/submit-invoice.ts:628`, `lib/invoices/ksef-submit-enqueue.ts:127`. | Dopisać w WYM-37: „Dotyczy także testowego środowiska KSeF (MF): prawdziwe dane klientów nie mogą trafiać do środowiska testowego (zasada z pomocy aplikacji, `content/help/srodowisko-testowe-ksef.mdx:19`; produkcja z `KSEF_ENV=test` według [PR225] — patrz 04, R2-U12).” |
| R2-U10 | drobna | §2.3 (UODO), N-ZR-12 | Materiały UODO ograniczają się do wykazu DPIA i trzech decyzji. Zadanie (pkt 4) wymaga stanowisk UODO o privacy by design, zgodach, rolach, dostępie i usuwaniu. Autor ujawnił ten brak (N-ZR-12) — dobrze — ale bez wskazówki dla review. | Dopisać w N-ZR-12: „Do sprawdzenia w review: decyzje Prezesa UODO dotyczące weryfikacji podmiotu przetwarzającego i art. 25 (wg wiedzy recenzenta R2 m.in. sprawa z 2022 r. dotycząca spółki energetycznej i jej procesora — pewność niska, nie cytować bez odczytu) oraz poradniki UODO dla administratorów.” |
| R2-U11 | drobna | §2.1 (poza minimum zadania) | Rejestr nie wymienia rozporządzenia (UE) 2023/2854 (Data Act). Jego rozdział VI (zmiana dostawcy usług przetwarzania danych, także SaaS) stosuje się od 12.09.2025 i dotyczy eksportu danych przy końcu umowy (WYM-27, WYM-45). | Dopisać jako sygnał, analogicznie do AI Act: „**ZR-08** — Rozporządzenie (UE) 2023/2854 (Data Act), rozdz. VI: obowiązki dostawców usług przetwarzania danych przy zmianie dostawcy (umowa, eksport danych, opłaty) — NZ (wg wiedzy recenzenta R2); zastosowanie do FF jako dostawcy SaaS i ewentualne wyłączenia — do review. Poza minimum zadania; nie tworzy WYM do czasu potwierdzenia.” |

### 3.2. Uwagi do `04-PROCESORZY-I-LOKALIZACJE.md`

| ID | Waga | Miejsce | Problem | Wymagana zmiana (gotowa do naniesienia) |
|---|---|---|---|---|
| R2-U12 | **istotna** | R-11 (KSeF), §2 (lista PRC), §3.2, N-PRC-10 | Brakuje odbiorcy i ryzyka: produkcja ma `KSEF_ENV=test` [PR225], kod domyślnie wybiera `test` (`lib/jobs/runners/submit-invoice.ts:628`, `lib/invoices/ksef-submit-enqueue.ts:127`). Faktury z danymi nabywców trafiłyby więc do **testowego** środowiska MF, a nie do systemu działającego z mocy prawa. Pomoc aplikacji sama zakazuje wysyłania tam prawdziwych danych (`content/help/srodowisko-testowe-ksef.mdx:19`). Według wiedzy modelu [NZ-R2] środowisko testowe KSeF pozwala uwierzytelnić się dowolnym NIP-em i certyfikatem testowym, więc osoby trzecie mogą zobaczyć dane; MF zaleca dane fikcyjne. Rola „odrębny administrator z mocy prawa” z R-11 nie pasuje do środowiska testowego. | (a) Dodać wiersz **R-11a**: „MF — testowe środowisko KSeF (`api-test.ksef.mf.gov.pl`, `lib/ksef/client.ts:9`) \| wysyłka faktur przy `KSEF_ENV=test` (według [PR225] obecny stan produkcji; kod domyślnie `test`: `submit-invoice.ts:628`, `ksef-submit-enqueue.ts:127`) \| rola: brak podstawy do przekazywania prawdziwych danych — środowisko do prób \| XML FA(3) z danymi nabywców \| PL \| nie \| n/d \| nieznana \| pomoc aplikacji zakazuje prawdziwych danych (`content/help/srodowisko-testowe-ksef.mdx:19`); dostęp osób trzecich do danych w środowisku testowym — [NZ]”. (b) Dodać ustalenie **PRC-17** „Produkcja wysyła do testowego KSeF”, stan **częściowe** (deklaracja braku klientów niezweryfikowana), ryzyko **wysokie od pierwszego prawdziwego klienta**, rekomendacja (I): „blokada startu workera i aplikacji, gdy środowisko jest produkcyjne, a `KSEF_ENV≠production`, albo jawna flaga «tryb pokazowy — tylko dane fikcyjne» widoczna dla użytkownika; przełączenie na `production` jako warunek wejścia pierwszego klienta”. (c) W N-PRC-10 dopisać: „i czy do testowego KSeF wysłano już dane prawdziwych osób”. |
| R2-U13 | **istotna** | R-04 („przeglądarka: `ip: false`”), PRC-09 | `ip: false` nie jest środkiem minimalizacji: w zainstalowanym SDK opcja „HAS NO EFFECT” (`@posthog/types@1.374.3 dist/posthog-config.d.ts:1490-1494`). Ruch przeglądarki idzie przez `/ingest`, a proxy Next przekazuje nagłówki żądania dalej i nie usuwa `X-Forwarded-For` (`node_modules/.pnpm/next@16.3.8…/next/dist/server/lib/router-utils/proxy-request.js:30-41`). Czy PostHog dostaje IP klienta, zależy więc od proxy przed aplikacją i od ustawienia projektu „Discard client IP data” — nieodczytanego. Ten sam błąd jest prawdopodobnie w `A1-…:138` (zakres R3). | W R-04 zamienić „przeglądarka: `ip: false`, pamięć `memory`…” na „przeglądarka: pamięć `memory`, bez autocapture, replay i heatmap; opcja `ip: false` w kodzie **nie działa** w SDK 1.374.3 (`@posthog/types/dist/posthog-config.d.ts:1490-1494`) — o zapisie IP decyduje ustawienie projektu „Discard client IP data” (nieodczytane) i nagłówki przekazywane przez `/ingest`”. W PRC-09 „Dowód” dopisać to samo zdanie, a w „Rekomendacji” zastąpić „potwierdzić «Discard client IP data»” przez „włączyć i zapisać datę odczytu «Discard client IP data»; usunąć martwą opcję `ip: false` z `init-posthog-browser.ts:52`; rozważyć usuwanie `X-Forwarded-For` w `/ingest`”. Ryzyko PRC-09 bez zmian (średnie), ale uzasadnienie: „IP klientów może trafiać do PostHog — niezweryfikowane”. Koordynator: przekazać R3 do sprawdzenia `A1-…:138`. |
| R2-U14 | **istotna** | §4.1 wiersz „Anthropic” („brak regionu UE w API Anthropic … transfer pełny”); PRC-06 „Dowód”; R-06 kolumna „Region” | „Nie znaleziono” zamieniono na „nie istnieje”. DOK-4 to dokumentacja narzędzia sesji o Managed Agents (autor sam to zaznacza w §8.2). Typy SDK 0.95.0 przyjmują dowolny napis w `inference_geo` i odsyłają do domyślnej geografii obszaru roboczego. | W §4.1 zamienić „brak regionu UE w API Anthropic; udokumentowane `inference_geo`: `us`, `global` [DOK-4]; region `eu` tylko przez Vertex AI [DOK-4] \| wszystko \| transfer pełny” na: „opcji przetwarzania w UE w API Anthropic **nie znaleziono** w dostępnych materiałach (DOK-4: `us`, `global` dla Managed Agents; SDK 0.95.0: `inference_geo?: string \| null`, domyślnie `default_inference_geo` obszaru roboczego — `@anthropic-ai/sdk/resources/messages/messages.d.ts:1988-1992`); region `eu` udokumentowany dla Vertex AI [DOK-4] \| treść żądań \| transfer do US prawdopodobny (DPA z SCC — DOK-3); ustawienie obszaru roboczego nieodczytane (N-PRC-02)”. W PRC-06 i R-06 analogicznie: „opcji UE nie znaleziono” zamiast „brak”. Dodać rekomendację (I): „zapisywać `usage.inference_geo` z odpowiedzi (`messages.d.ts:1496-1499`) jako dowód faktycznej geografii przetwarzania”. |
| R2-U15 | drobna | PRC-06 „Dowód” („dla **każdej** faktury kosztowej … jedynym ogranicznikiem jest budżet”), R-06 | Uogólnienie za mocne: model jest wołany tylko wtedy, gdy nie zadziałają reguły organizacji i heurystyka (`lib/categorization/index.ts:45-67`). | Zamienić na: „dla każdej faktury kosztowej z KSeF, której nie sklasyfikowały reguły organizacji (NIP, nazwa, słowa kluczowe — `lib/categorization/index.ts:45-64`) ani heurystyka (`:66-67`); dodatkowym ogranicznikiem jest budżet AI (`lib/ai/tenant-ai-budget.ts:5-26`, `index.ts:71-76`)”. Wniosek (brak wyboru klienta) bez zmian. |
| R2-U16 | drobna | R-05 „Uwagi”, PRC-08 „Dowód” („we wszystkich e-mailach, także w fakturach do kontrahentów”) | Wezwania do zapłaty mają `Reply-To` z ustawień klienta, nie skrzynkę pomocy FF: `lib/reminders/prepare-delivery.ts:93-94,131`, `lib/jobs/runners/send-reminder.ts:76`. | Zamienić na: „we wszystkich e-mailach wysyłanych przez `sendViaResend` (`lib/email/send.ts:197-200`), w tym w fakturze z PDF do nabywcy (`:574-579`); wezwania do zapłaty mają `Reply-To` klienta (`lib/reminders/prepare-delivery.ts:93-94`)”. |
| R2-U17 | drobna | PRC-10 „Ryzyko” (LG München I … „klasa O”); §7 pytanie 5 | Pomylone klasy. Wyrok sądu krajowego innego państwa nie jest interpretacją organu (O w schemacie audytu, `01-…` §8). Brakuje kotwicy w orzecznictwie TSUE dla roli osadzającego zasób strony trzeciej. | Zamienić „— [NZ], klasa O, nie wiąże polskiego organu” na „— [NZ]; orzeczenie sądu krajowego innego państwa członkowskiego: materiał pomocniczy, nie P ani O, nie wiąże w PL”. Dopisać: „Rola FF przy osadzaniu zasobu Google — wyrok TSUE C-40/17 Fashion ID (P, [NZ]; ZR-68 po uzupełnieniu 03 — R2-U01)”. W pytaniu 5 dodać odesłanie do C-40/17. |
| R2-U18 | drobna | R-23, PRC-07 („materiały mogą służyć do trenowania, chyba że konto ma wyłączoną tę opcję [DOK-9]”) | Cytat urwany: Consumer Terms przewidują trenowanie także po wyłączeniu opcji, gdy użytkownik przekaże opinię albo w przypadkach przeglądu bezpieczeństwa. | Dopisać po cytacie: „; nawet po wyłączeniu — w przypadkach wskazanych w warunkach (m.in. przekazanie opinii) [DOK-9]”. |
| R2-U19 | drobna | §1 akapit „Upstash jako odbiorca” | Nie opisano, jakie dane trafiłyby do zewnętrznego Redis przy innej konfiguracji: skróty SHA-256 (32 znaki) z IP i e-maila w kluczach limitów (`lib/rate-limit/index.ts:63,134-135`, `lib/rate-limit/auth.ts:23-46`) — to pseudonimizacja, nie anonimizacja — oraz wyniki walidacji GUS/VIES/białej listy (`lib/validation/cache.ts:3-16`), w tym dane przedsiębiorców będących osobami fizycznymi. | Dopisać zdanie: „Gdyby `UPSTASH_REDIS_REST_URL` wskazywał usługę zewnętrzną, trafiałyby do niej: skróty SHA-256 identyfikatorów (IP, e-mail) w kluczach limitów (`lib/rate-limit/index.ts:63,134-135`; dane spseudonimizowane, nadal osobowe) i wyniki walidacji kontrahentów (`lib/validation/cache.ts`).” |
| R2-U20 | drobna | cały plik (brak odwołań do 03) | Plik 04 nie odwołuje się do żadnego ZR ani WYM z 03 (grep: 0 trafień). Przepisy są cytowane osobno jako [NZ]. Macierz (`05-…`) będzie musiała łączyć je ręcznie. | W kolumnie „Ryzyko” albo „Stan” każdego PRC dopisać odpowiednie WYM: PRC-01 → WYM-18, WYM-19; PRC-02 → WYM-19, WYM-58–60; PRC-03 → WYM-19; PRC-04 → WYM-40, WYM-74; PRC-05 → WYM-41, WYM-43; PRC-06 → WYM-42, WYM-60, WYM-62; PRC-07 → WYM-47, WYM-58; PRC-08 → WYM-17, WYM-40; PRC-09 → WYM-34, WYM-58; PRC-10 → WYM-63; PRC-11 → WYM-58; PRC-12 → WYM-36; PRC-13 → WYM-50; PRC-14 → WYM-51, WYM-72; PRC-15 → WYM-24, WYM-71; PRC-16 → WYM-58; PRC-17 (nowe) → WYM-37. W §4.2 „Podstawa” dopisać ZR-01, ZR-03, ZR-04, ZR-38, ZR-60 (`03-…`). |

## 4. Braki pokrycia

### 4.1. Etap ZRD (pkt 4 zadania)

| Wymaganie z `00-ZADANIE.md` | Pokrycie w 03 | Ocena R2 |
|---|---|---|
| RODO (EUR-Lex), art. 25 i przepisy powiązane (zasady, podstawy, prawa, procesorzy, bezpieczeństwo, retencja, transfery) | §2.1a — art. 4–49, 82–83 i motywy; WYM-01–WYM-75 | pełne (NZ — egress) |
| EROD/EDPB i UODO: privacy by design/default, zgody, role, dostęp, usuwanie | EDPB: ZR-30–ZR-57; UODO: ZR-20, ZR-21 | EDPB pełne; UODO **częściowe** — brak jest ujawniony (N-ZR-12; R2-U10) |
| ePrivacy i prawo krajowe; PKE art. 399–400 | ZR-02, ZR-11 (art. 398–400), ZR-12; WYM-63–WYM-66 | pełne (NZ, niepewności oznaczone) |
| AICPA: aktualne TSC i zasady raportowania SOC 2 | ZR-70–ZR-74, §2.6a (61 identyfikatorów; liczba zgodna z wiedzą R2) | pełne (NZ, ograniczenie ujawnione — N-ZR-11) |
| Oficjalne dokumentacje dostawców, umowy, ustawienia | ZR-80 (odczyt), ZR-81, ZR-82 — odesłanie do 04 | pokryte przez 04 |
| Advisera, Schneider Downs — tylko jako lista zagadnień | ZR-83, ZR-84 — „brak mocy”, „niepobierane” | poprawnie |
| Oddzielenie P/O/S/I; źródło, przepis, data, zastosowanie dla każdego wniosku | §4, kolumny rejestru i katalogu | pełne; jeden błąd klasy (R2-U02) |
| Nieprzypisywanie mocy dokumentom konsultacyjnym | ZR-07, ZR-42, ZR-43 oznaczone; §4 zasada 4 | poprawnie |
| Orzecznictwo TSUE istotne dla wymagań | ZR-60–ZR-64 | **częściowe** — brakuje C-154/21, C-307/22, C-579/21, C-40/17 (R2-U01) |

### 4.2. Etap PRC (pkt 5F zadania)

| Wymaganie z `00-ZADANIE.md` | Pokrycie w 04 | Ocena R2 |
|---|---|---|
| Rzeczywiści odbiorcy i dostawcy, także dalsi procesorzy, support, telemetria | R-01–R-27, §1 Upstash; grep domen i SDK | **częściowe** — brak testowego KSeF jako odbiorcy (R2-U12). Mój grep (`lib app scripts components ops` + konfiguracje) nie wykazał innych hostów wysyłających dane: `api.github.com` w `ops/bramka/src/clients.mjs:131` i `scripts/ci/agent-guard.mjs:135` dotyczy repozytorium, nie danych klientów; `qr*.ksef.mf.gov.pl` to adresy w kodach QR, nie wywołania. Wszystkie SDK z `package.json` mające ruch sieciowy (`@anthropic-ai/sdk`, `@aws-sdk/*`, `@sentry/nextjs`, `posthog-*`, `resend`, `stripe`, `@upstash/redis`, `web-push`, `@supabase/*`, `pg-boss`) są w rejestrze. |
| Dostępne DPA, regiony, lokalizacje kopii, zdalny dostęp, retencja dostawców, mechanizmy transferów | kolumny R-*, §4, §6 N-PRC-01–N-PRC-11 | pełne w granicach dostępu; mechanizmy oznaczone jako niezweryfikowane, gdzie umów brak |
| „Region UE” to nie pełna ocena łańcucha | §4.1 | pełne, ale z nadinterpretacją dla Anthropic (R2-U14) |
| Nie zgadywać treści nieudostępnionych umów | DPA cytowane tylko po odczycie (DOK-3, DOK-7); w pozostałych „nie znaleziono w repo; stan umowy nieznany” | poprawnie |
| Projekt listy dalszych procesorów i potrzeba TIA | §3, §4.2 | pełne (materiał roboczy oznaczony) |

## 5. Ocena końcowa

- **03:** zatwierdzony z uwagami. Rejestr spełnia pkt 4 zadania w granicach ograniczenia dowodowego, które jest jawne i uczciwie opisane. Nanieść R2-U01 (istotna) i drobne R2-U02–R2-U11.
- **04:** wymaga poprawek. Nanieść R2-U12, R2-U13 i R2-U14 (istotne, gotowa treść w tabeli), potem drobne R2-U15–R2-U20. Po naniesieniu plik nie wymaga ponownego badania. Wystarczy kontrola koordynatora, że teksty wstawiono, a numer nowego ustalenia PRC-17 i wiersza R-11a jest spójny z listą w §2.
- **Zależności poza grupą:** R2-U13 dotyczy też `A1-…:138` (recenzent R3). R2-U12 powinien trafić do macierzy (`05-…`) jako ryzyko „przed pierwszym klientem” i do `08-…` (N-PRC-10).
- **Najważniejsze ryzyka wynikające z recenzji:** (1) prawdziwe dane do testowego KSeF przy `KSEF_ENV=test`; (2) możliwy zapis IP klientów w PostHog mimo deklaracji minimalizacji; (3) automatyczne przekazywanie danych sprzedawców do Anthropic bez wyboru klienta (PRC-06 — potwierdzone, z korektą zakresu).

## 6. Niewiadome i ograniczenia

| ID | Niewiadoma | Skutek dla recenzji |
|---|---|---|
| N-R2-01 | Brzmienie przepisów i wytycznych (egress zablokowany). Moje uwagi o C-154/21, C-307/22, C-579/21, C-40/17, art. 112ba VAT, art. 398 PKE, Data Act i środowisku testowym KSeF pochodzą z wiedzy modelu | uwagi R2-U01, U08, U11, U12 mają oznaczenie NZ-R2 i wymagają potwierdzenia w review |
| N-R2-02 | Czy proxy przed aplikacją (Coolify/Traefik) dodaje `X-Forwarded-For` i czy projekt PostHog ma włączone „Discard client IP data” | R2-U13 opisuje możliwość, nie stwierdzony fakt |
| N-R2-03 | Faktyczne `KSEF_ENV` na produkcji — tylko deklaracja [PR225] | R2-U12 — ryzyko warunkowe |
| N-R2-04 | Ustawienie `default_inference_geo` obszaru roboczego Anthropic | R2-U14 — wniosek o transferze pozostaje „prawdopodobny” |

## 7. Pytania do końcowego review prawnego

1. Czy wysyłka faktur z danymi prawdziwych nabywców do testowego środowiska KSeF (przy `KSEF_ENV=test`) byłaby udostępnieniem bez podstawy i naruszeniem art. 32 RODO, skoro środowisko testowe nie zapewnia kontroli dostępu właściwej dla danych produkcyjnych? (R2-U12)
2. Czy wyrok C-40/17 Fashion ID przesądza o współadministrowaniu FF z Google przy ładowaniu fontów z serwerów Google oraz z PostHog przy zbieraniu zdarzeń przez `/ingest`? (R2-U01, R2-U17)
3. Czy prawo dostępu (art. 15 ust. 1 lit. c, C-154/21) wymaga od FF wskazania z nazwy wszystkich odbiorców z rejestru 04 w odpowiedzi na żądanie — także dostawców agentów AI i skrzynek pomocy? (R2-U01)
4. Czy Data Act, rozdz. VI, obejmuje FF jako dostawcę SaaS dla mikroprzedsiębiorców i czy wymaga zmian w regulaminie równolegle z umową powierzenia (PRC-05)? (R2-U11)

## 8. Co sprawdziłem / czego nie mogłem sprawdzić

**Sprawdziłem (10.10.2026):**

- W całości: `BRIEF.md` (z ADDENDUM 1 i 2), `00-ZADANIE.md`, `01-STAN-I-GRANICE.md`, `03-REJESTR-ZRODEL.md` (611 linii), `04-PROCESORZY-I-LOKALIZACJE.md` (446 linii).
- 48 kontroli punktowych w kodzie i dokumentach (21 dla 03, 27 dla 04). Wynik: 1 teza obalona (K04-04), 6 częściowych (K03-15, K03-19, K04-06, K04-07, K04-25, K04-26), reszta potwierdzona.
- 5 pobrań URL oznaczonych przez autorów jako odczytane (sekcja 2.3) — wszystkie HTTP 200, cytaty zgodne (jeden urwany).
- Własny grep hostów zewnętrznych (`lib app scripts components ops` i pliki konfiguracji) oraz lista zależności z `package.json`, porównane z rejestrem R-*.
- Zainstalowane SDK: `@sentry/browser` 10.53.1 (`infer_ip`), `@posthog/types` 1.374.3 (`ip` bez efektu), `@anthropic-ai/sdk` 0.95.0 (`inference_geo`), `next` 16.3.8 (proxy przepisań).
- Gałąź PR #225 @ `686a465`: `evidence/f0-2026-10-04.json`, `f0-2026-10-10.json`, `runtime-inventory.md` — tylko pola cytowane przez 04.
- Spójność identyfikatorów WYM/ZR w 03 (skrypt) oraz brak sekretów, adresów IP, e-maili i identyfikatorów kont w obu plikach (grep wzorców). Oba pliki spełniają zasady repo publicznego; uwaga o adresie hosta w dokumencie migracji (04, R-22) ma jedno zdanie bez szczegółów — zgodnie z briefem.

**Nie mogłem sprawdzić:**

- Źródeł prawa, EDPB, UODO i AICPA w oryginale (egress 403; domen zablokowanych nie odpytywałem ponownie, zgodnie z briefem).
- Stanu produkcji (`KSEF_ENV`, nagłówki proxy, zmienne `UPSTASH_*`, `R2_ENDPOINT`), paneli dostawców (PostHog „Discard client IP data”, Anthropic `default_inference_geo`, region Resend) ani umów.
- Listy DPF (domena zablokowana) — deklarację PostHog o udziale w DPF (DPA 10.3) potwierdziłem tylko w dokumencie dostawcy.

Recenzowanych plików nie edytowałem; nie commitowałem i nie pushowałem.
