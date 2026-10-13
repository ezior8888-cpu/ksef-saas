# 09 — Materiały robocze: rejestry, DPIA, LIA, TIA, umowa powierzenia, procedury

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.** Dotyczy całego pliku i każdej sekcji
> z osobna.

| | |
|---|---|
| Etap | Materiały robocze (pkt 5.G zadania: „Oceń potrzebę dodatkowych analiz, np. DPIA, LIA lub oceny transferów, na podstawie faktów. Przygotuj materiały robocze tam, gdzie są potrzebne”) |
| Autor | agent MATERIAŁY ROBOCZE (synteza; subagent koordynatora) |
| Data | 13.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (10.10.2026) |
| Zakres | 12 materiałów: (1) rejestr czynności administratora, (2) rejestr kategorii czynności procesora, (3) screening DPIA, (4) projekty LIA, (5) lista kontrolna TIA, (6) szkielet umowy powierzenia, (7) projekt listy dalszych procesorów, (8) procedura żądań osób, (9) procedura naruszeń, (10) tabela decyzji retencyjnych, (11) wymagania treści polityki i informacji, (12) specyfikacja zgody na technologie w przeglądarce; zestawienie potrzeb (§ 13) |
| Źródła | raporty etapów badania (wszystkie po recenzjach R1–R4): `01-STAN-I-GRANICE.md`, `02-INWENTARZ-I-PRZEPLYWY.md` (INW-NN, D-NN, O-NN), `03-REJESTR-ZRODEL.md` (ZR-NN, WYM-NN), `04-PROCESORZY-I-LOKALIZACJE.md` (R-NN, PRC-NN, DOK-n), `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` (MIN-NN, ZGD-NN), `A2-MECHANIZMY-PRAWA-RETENCJA.md` (PRA-NN, RET-NN, AI-NN), `A3-DOWODY-I-TESTY.md` (DOW-NN), `A4-TEST-COOKIES-I-SIECI.md` (RUN-NN), `06-SOC2.md` (SOC-NN); pliki recenzji R1–R4 (`recenzje/R1.md`, `recenzje/R2-runda1.md`, `recenzje/R2.md`, `recenzje/R3.md`, `recenzje/R4.md`) **[R6]**; kontrolny `git grep` na `3e5e00d` (§ 15); PR #225 (niescalony, gałąź `codex/f0-runtime-inventory`, head `c2ab6a8`) — tylko `acceptance-plan.md` wiersz F0-G08 |
| Ograniczenia | brak dostępu do produkcji, paneli i umów dostawców; przepisy i wytyczne z wiedzy modelu (egress do źródeł prawa zablokowany, WebSearch odrzucony przez właściciela); podmiot prawny operatora nieustalony (placeholder); pliki `05-…`, `07-…`, `08-…`, `10-…` nie istniały w chwili pisania. **[R5b]** `05`, `07`, `08` już istnieją; odwołania do nich sprawdził recenzent R5b (13.10.2026), a redaktor poprawek dopisał w § 14 odpowiedniki N-NN z `08` |
| Stan | po recenzji R5b („wymaga poprawek”, bez uwag blokujących) i naniesieniu jej uwag przez redaktora poprawek 13.10.2026 — zob. „Historia recenzji” **[R5b]**; autor nie zatwierdzał własnego etapu |

## 0. Oznaczenia i zasady tego pliku

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

- **[NZ]** — przepis, wytyczna lub fakt o dostawcy przytoczony z pamięci
  modelu: „niezweryfikowane online 13.10.2026 (egress zablokowany) — treść
  wg wiedzy modelu, do potwierdzenia w końcowym review”.
- **[PR225]** — „PR #225 (niescalony), plik:sekcja — pomiar/deklaracja
  operatora, niezweryfikowane w tej sesji”; **[PR225 @a72b567]** — odczyt
  SSH i paneli z 10.10.2026 (`01` § 4).
- **[DOK-n]** — dokumentacja dostawcy odczytana 10.10.2026 przez agenta
  PROCESORZY (`04` § 8.2). Dokumentacja nie jest umową FaktFlow.
- **FF-A** — FaktFlow jako administrator; **FF-P** — FaktFlow jako podmiot
  przetwarzający (procesor) danych klienta (`02` § 4). Role są
  **propozycjami** do review prawnego.
- **Placeholdery:** `[OPERATOR]` (nazwa podmiotu prowadzącego FaktFlow —
  niewiadoma N-01 / N-INW-13), `[NIP OPERATORA]`, `[ADRES]`, `[KONTAKT RODO]`,
  `[IOD — jeśli wyznaczony]`. Nie wpisujemy danych osób.
- Stany: **potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy**.
  Klasy: **P** obowiązek prawny, **O** interpretacja organu, **S** kryterium
  SOC 2, **I** praktyka inżynierska.
- „Nie znaleziono w repo” ≠ „nie istnieje”.
- Okresy retencji, podstawy prawne i terminy powiadomień w tym pliku są
  **opcjami do decyzji**, nie ustaleniami. Tam, gdzie fakt jest nieznany,
  wpisujemy „do decyzji” albo lukę ze źródłem niewiadomej.
- Repo jest publiczne: bez sekretów, adresów, nazw kontenerów; luki
  bezpieczeństwa jednym zdaniem.

**Stan recenzji materiałów wejściowych.** Każdy raport wejściowy ma
w „Historii recenzji” wpis o naniesieniu wszystkich uwag swojej grupy
(`02` — R1 14/14; `03` i `04` — R2 rundy 1 i 2; `A1`, `A2`, `A4` — R3;
`A3`, `06` — R4; `01` — R4-U30). Nie znaleziono recenzji nienaniesionej.
**[R5b]** Wyjątek wykryty przez R5b: pytanie 2 z rundy 1 recenzji R2
(`R2-runda1.md` § 7 — czy C-40/17 przesądza o współadministrowaniu FF
z PostHog przy zbieraniu zdarzeń przez `/ingest`) nie miało odpowiednika
w raportach; dopisane do `08` Q-03 i uwzględnione w § 7.2 tego pliku.
Uwagę R4 do tego etapu („R5 musi potwierdzić, że szkice rejestru,
screeningu DPIA, LIA i TIA tam powstały” — `R4.md`, tabela kompletności)
realizują §§ 1–5.

**Rozbieżności między raportami sprawdzone w kodzie (`3e5e00d`):**

| Teza | Raporty | Wynik sprawdzenia | Skutek dla tego pliku |
|---|---|---|---|
| Sentry dostaje UUID użytkownika (`user` zredukowany do `id`) | `02` D-23, `04` R-03 | `git grep "setSentryUserContext\|withSentryUserContext"` poza definicją w `lib/observability/sentry-context.ts` — **0 wywołań**; zgodne z `A2` E.1 [R3] („kod nie ustawia użytkownika”) | w rejestrach: Sentry dostaje `tenantId` w tagach i treść błędów po redakcji; identyfikator użytkownika — tylko jeśli wywołanie zostanie dodane |
| Domyślny typ identyfikatora nabywcy B2C | `02` D-09 („domyślnie brak ID”) vs `A1` MIN-01 („domyślnie PESEL”) | `components/invoices/invoice-form.tsx:437` ustawia `'pesel'` po wyborze „Osoba prywatna”; zgodne z MIN-01 | DPIA (§ 3) i retencja (§ 10) przyjmują wersję MIN-01 |

---

## 1. Projekt rejestru czynności przetwarzania — FaktFlow jako administrator (art. 30 ust. 1 RODO [NZ])

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** W repo nie znaleziono rejestru (`A3` DOW-01, § 1.2; jedyne
trafienie to zadanie w `docs/security/PLAN-ODPORNOSCI-CYBER.md:113`).
Zwolnienie z art. 30 ust. 5 nie obejmuje przetwarzania, które nie ma
charakteru sporadycznego (ZR-55, WYM-48/49 [NZ]) — wszystkie czynności niżej
są ciągłe. Zakres czynności FF-A: `02` § 4.1; cele i proponowane podstawy:
`A1`, tabela „cel → proponowana podstawa”.

### 1.1. Część ogólna

| Element (art. 30 ust. 1 lit. a, g) | Treść robocza | Stan |
|---|---|---|
| Administrator | `[OPERATOR]`, `[NIP OPERATORA]`, `[ADRES]`, `[KONTAKT RODO]` | brak — podmiot nieustalony (`01` § 5; polityka ma placeholder `polityka-prywatnosci/page.tsx:20-21`) |
| Współadministratorzy | nie zidentyfikowano; role Stripe, Cloudflare (Turnstile), Google (fonty) do review (`02` § 4.3, `04` § 7 pkt 5–6) | niezweryfikowane |
| Przedstawiciel w UE | nie dotyczy (zakładamy siedzibę w PL — do potwierdzenia z N-01) | niezweryfikowane |
| IOD | `[IOD — jeśli wyznaczony]`; nie znaleziono wyznaczenia (`A3` § 1.3: „DPO” tylko w nieaktualnych runbookach); obowiązek do oceny (art. 37 [NZ], ZR-48) — **obowiązek nieoceniony** (`08` Q-39) **[R5b]** | brak **[R5b]** |
| Wersja rejestru, data, właściciel | do nadania przy przyjęciu; proponowane miejsce: plik w `docs/` wersjonowany w repo, przegląd przy każdej zmianie odbiorców (`A3` DOW-01) | nie dotyczy (nadawana przy przyjęciu) **[R5b]** |

**Ogólny opis środków (art. 30 ust. 1 lit. g) — wspólny dla obu rejestrów.**
Odwołania „Ś-NN” w tabelach.

| ID | Środek (stan w kodzie) | Dowód | Znana luka (jedno zdanie) |
|---|---|---|---|
| Ś-01 | izolacja firm przez RLS na 70/70 tabelach `public` | `01` § 3; ADR 0001 | testy na bazie nie obejmują 14 tabel z danymi osobowymi (`A3` DOW-15) |
| Ś-02 | MFA TOTP dla użytkowników (opcjonalne) i wymagane dla panelu operatora | `app/(dashboard)/settings/security/actions.ts:172`; `lib/auth/admin-guard.ts:31-48` | MFA przy operacjach wrażliwych za flagą domyślnie wyłączoną (`06` SOC-10) |
| Ś-03 | szyfrowanie poświadczeń KSeF (AES-256-GCM, klucz z env) | `lib/ksef/credentials-crypto.ts:36,126` | rotacja klucza niewykonana (`06` SOC-27…30) |
| Ś-04 | redakcja telemetrii (Sentry `scrubTelemetry`, `sendDefaultPii: false`), allowlista zdarzeń PostHog, analityka przeglądarki dopiero po zgodzie | `lib/observability/scrub.ts`; `lib/analytics/privacy.ts`; `init-posthog-browser.ts:13-24` | proxy `/ingest` i `/monitoring` przekazują dostawcom nagłówki przeglądarki (`A4` RUN-08) |
| Ś-05 | dziennik audytu append-only (wyzwalacz), pseudonimizacja wpisów przy usunięciu konta | `00052_audit_logs_immutable_trigger.sql:16-41,95-121` | odczyty operatora nie są logowane (`A3` DOW-08); IP z nagłówka zależnego od klienta (`02` INW-09) |
| Ś-06 | pliki w S3 pod prefiksem organizacji sprawdzanym przed odczytem; linki podpisane 300 s | `lib/storage/tenant-path.ts:5-24`; `lib/storage/r2.ts:498-516` | brak szyfrowania po stronie aplikacji (`02` § 3.1); linki 7 dni w paczkach księgowych (`02` INW-19) |
| Ś-07 | CSP egzekwowana, HSTS, `Referrer-Policy: no-referrer` | `next.config.ts:28-58`; `lib/security/csp.ts:7-42` | `img-src https:` dowolny host (`A1` CSP) |
| Ś-08 | ochrona przed nadużyciami: Turnstile, limity prób, sprawdzenie hasła w HIBP (k-anonimowość) | `lib/security/turnstile.ts`; `lib/rate-limit/*`; `lib/auth/breach-check.ts:17-41` | skróty identyfikatorów w limitach bez soli (`02` INW-16) |
| Ś-09 | kopie: nocny `pg_dump` lokalnie (14 zrzutów), snapshot JSON `public` w S3 (30/56 dni), obrazy dysku hosta bazy (7) [PR225] | `scripts/hetzner/db-backup.sh`; `lib/jobs/runners/cleanup-old-backups.ts:20-21` | brak pełnej kopii poza hostem, zrzuty lokalnie bez szyfrowania, brak kopii MinIO aplikacji (`02` INW-04, `04` PRC-14) |
| Ś-10 | zarządzanie zmianami: PR do chronionego `main`, wymagane kontrole CI | `06` § 3 (CC8) | brak niezależnego przeglądu człowieka (`A3` DOW-13) |
| Ś-11 | upoważnienia, poufność, szkolenia osób z dostępem | — | nie znaleziono (`A3` DOW-23) |

### 1.2. Czynności (FF-A)

Kolumna „Odbiorcy” używa ID z `04` § 1; „Transfery” — stan według `04`
§ 4 (mechanizm nieodczytany = „do potwierdzenia”). „Termin usunięcia”
podaje stan w kodzie i — gdy brak — „do decyzji” (opcje: § 10). Podstawa
to propozycja z `A1` (tabela celów), **nie** ustalenie.

| ID | Czynność / cel | Kategorie osób (`02` § 1) | Kategorie danych (`02` § 2) | Proponowana podstawa (do review) | Odbiorcy | Transfery poza EOG | Planowany termin usunięcia | Środki | Źródło faktów |
|---|---|---|---|---|---|---|---|---|---|
| RA-01 | Konto: rejestracja, logowanie e-mail i Google, MFA | O-01, O-14 | D-01 (e-mail, hash hasła, imię i nazwisko, tożsamość Google, czynniki MFA, kody ratunkowe) | art. 6 ust. 1 lit. b | R-01 Hetzner; R-09 Google (logowanie — odrębny administrator konta Google); R-08 Cloudflare (Turnstile); R-05 Resend (SMTP GoTrue wg dokumentu migracji); R-04 PostHog (zdarzenia serwerowe) | Cloudflare, Resend, PostHog — do potwierdzenia (`04` § 4.2) | do usunięcia konta (`lib/gdpr/deletion.ts:196`); konta nieaktywne — **do decyzji** (nie znaleziono reguły); `auth.*` GoTrue — niezweryfikowane (N-INW-01) | Ś-02, Ś-08 | `02` D-01; `A1` cel #1 |
| RA-02 | Bezpieczeństwo kont i rozliczalność: dziennik audytu z IP i user agent | O-01, O-14; adresaci w `metadata` (np. `invoice.emailed`) | D-02 (`audit_logs`, `details_json`) | art. 6 ust. 1 lit. f — **LIA L-01 (§ 4)** | R-01 | nie | `audit_logs` 12 mies. w kodzie (`00052…sql:53-74`); opcje różne dla klas zdarzeń — **do decyzji** (§ 10, RT-AUD) | Ś-05 | `02` D-02, INW-09; `A2` RET-03; `A3` DOW-07/09 |
| RA-03 | Ochrona przed nadużyciami: Turnstile, limity prób, HIBP | O-01, O-13 | IP (Turnstile `remoteip`), skróty IP/e-mail w kluczach Redis, 5 znaków skrótu SHA-1 hasła | art. 6 ust. 1 lit. f — **LIA L-02** | R-08 Cloudflare; R-16 HIBP (nie dotyczy — model k-anonimowości) | Cloudflare — do potwierdzenia | TTL Redis: okno limitu (`lib/rate-limit/index.ts`); u Cloudflare — nieznane | Ś-08 | `02` D-26; `04` R-08, R-16 |
| RA-04 | Rozliczenie usługi FaktFlow i własne faktury VAT | O-16, O-04 | D-20 (e-mail, nazwa, NIP klienta, zdarzenia Stripe, `last_webhook_payload`, faktury własne) | lit. b; dokumenty rozliczeniowe — lit. c (obowiązki FF jako podatnika [NZ]) | R-07 Stripe (częściowo odrębny administrator [NZ]); R-11 MF/KSeF; R-05 Resend; R-04 PostHog | Stripe — do potwierdzenia | faktury własne — **do decyzji** (§ 10, RT-FAKT-FF); `stripe_webhook_events.payload` przycinany po 90 dniach (`00109…sql:102-110`); `last_webhook_payload` — brak reguły | Ś-01, Ś-05 | `02` D-20, INW-12; `04` R-07 |
| RA-05 | Komunikacja transakcyjna i produktowa: e-maile transakcyjne, sekwencja próbna dni 1/4/8, preferencje, odbicia i skargi | O-01, O-05, O-09 | D-17, D-28 (adres, treść, zdarzenia doręczeń) | transakcyjne — lit. b; porady w okresie próbnym — lit. f (**LIA L-05**); treść handlowa — zgoda z art. 398 PKE [NZ] (wg wstępnej oceny — kwalifikacja treści dnia 8 i numer przepisu do potwierdzenia, `08` Q-07) **[R5b]** | R-05 Resend | Resend — do potwierdzenia | `email_bounces`, `email_preferences` — **do decyzji** (brak reguły) | wypis HMAC + one-click (`app/api/email/unsubscribe/route.ts`) | `A1` ZGD-06, cel #15–16, #27 |
| RA-06 | Marketing i newsletter (dziś uśpione: brak kodu wysyłki, formularz nieosadzony) | O-10 | D-18 (e-mail, źródło, data) | zgoda (lit. a) + art. 398 PKE [NZ] | — (brak wysyłki) | nie dotyczy | **do decyzji** (brak reguły; `unsubscribed_at` nieustawiane) | — | `02` INW-14; `A1` ZGD-06 |
| RA-07 | Pomoc techniczna: czat z modelem AI, eskalacja do zespołu, skrzynka pomocy | O-12, O-11 (w tym kontrahenci odpowiadający na e-mail z fakturą), osoby trzecie w treści | D-16 (treść czatu), D-29 (e-mail przy eskalacji w Slacku), D-30 (pełne wiadomości przychodzące) | lit. b (pomoc w ramach usługi); eskalacja i skrzynka — lit. f (do review) | R-06 Anthropic; R-17 Slack; R-08 Cloudflare Email Routing; R-25 skrzynki docelowe; R-18 Telegram (tylko kategoria) | Anthropic — tak, SCC w DPA [DOK-3]; Slack, Cloudflare, skrzynki — do potwierdzenia | czat — **do decyzji** (brak reguły, zostaje po usunięciu konta); poczta — **do decyzji** | Ś-04 (identyfikator rozmowy w Sentry) | `02` D-16, D-29, D-30, INW-06/07; `A2` AI-03; `04` PRC-08 |
| RA-08 | Analityka produktu (przeglądarka po zgodzie; serwer bez zgody) | O-01, O-13 | D-24 (UUID użytkownika i organizacji, zdarzenia z allowlisty; IP — zależnie od ustawienia projektu) | przeglądarka — zgoda (art. 399 PKE + lit. a [NZ]); serwer — lit. f z **LIA L-03** albo objęcie zgodą (decyzja) | R-04 PostHog | tak według DPA PostHog pkt 10.2 (US) [DOK-7]; mechanizm DPF/SCC — do potwierdzenia | konto PostHog: analityka 1 rok, replay 30 dni (panel) [PR225, PR225 @a72b567]; kod nie usuwa osoby — **do decyzji** | Ś-04 | `02` D-24; `A1` MIN-08, ZGD-05; `04` PRC-09; `A4` RUN-02 |
| RA-09 | Diagnostyka: telemetria błędów, logi aplikacji, workera i usług Supabase | O-01, O-13; resztkowo dane klientów w komunikatach | D-23 (zdarzenia błędów, sesje i ślady z przeglądarki, `tenantId`), D-25 (stdout kontenerów; `inngest_run_log`), logi `_supabase` | lit. f — **LIA L-06**; sesje i ślady w przeglądarce — zgoda albo wyłączenie (decyzja, `A4` RUN-04) | R-03 Sentry; R-01 | Sentry — konto i wsparcie w US [DOK-5]; mechanizm do potwierdzenia | Sentry: 30 dni wg dokumentacji, TTL nieodczytany [PR225 @a72b567]; `inngest_run_log` 3 mies.; logi Docker i `_supabase` — **nieznane** (N-INW-06, N-INW-15) | Ś-04 | `02` D-23, D-25, § 3.1; `A4` RUN-04 |
| RA-10 | Alerty i raporty operacyjne | O-01, O-14 | D-29 (identyfikatory, UUID organizacji, e-mail przy eskalacji) | lit. f (do review) | R-17 Slack; R-18 Telegram; R-05 Resend (raport dzienny do operatorów); R-19 heartbeat (bez danych osobowych) | Telegram — mechanizmu nie widać [NZ] (`04` § 4.2: nie wysyłać danych osobowych); Slack — do potwierdzenia | po stronie dostawców — nieznane | minimalizacja w kodzie (`lib/alerts/telegram.ts:12-14`) | `02` D-29; `04` PRC-12 |
| RA-11 | Panel operatora: nadzór, notatki o klientach, flagi | O-14, O-01 | D-21 (`admin_user_notes`, `adminEmail` w audycie) | lit. f (do review) | R-01 | nie | `admin_user_notes` — **do decyzji** (tylko `archived_at`) | Ś-02, Ś-05 | `02` D-21, INW-15; `A1` MIN-05 |
| RA-12 | Realizacja praw osób i ewidencja żądań | O-01, O-17, osoby bez konta | `gdpr_deletion_requests` (e-mail, IP, UA), wpisy `gdpr.*` w audycie | lit. c (art. 12–22 RODO [NZ]) | R-01 | nie | `gdpr_deletion_requests` — brak reguły; wpisy audytu 12 mies. — **do decyzji** (§ 10, RT-DSAR) | Ś-05 | `A2` PRA-11, RET-12 |
| RA-13 | Wspólna pamięć danych z rejestrów publicznych (rola niepewna — `02` § 4.1 „średnia”) | O-05, O-06 (JDG) | `validation_cache` (nazwa, adres, rachunki po NIP), Redis `ff:gus:<nip>`, `ff:valid:PL:<nip>` | lit. f — **LIA L-04** (jeśli FF-A) | źródła: R-12 MF, R-13 VIES, R-14 GUS (odrębni administratorzy) | nie | 24 h + usunięcie 7 dni po wygaśnięciu (`00022…sql:110-125`); Redis 24 h | Ś-01 (ale polityka `USING (true)` — każdy zalogowany czyta) | `02` INW-16; `A1` MIN-03 |
| RA-14 | Powiadomienia push i e-mail o stanie usługi | O-01 | D-19 (endpoint, klucze, UA, nazwa urządzenia) | lit. b (funkcja żądana); zapis subskrypcji — wyjątek art. 399 PKE [NZ] | R-10 usługi push przeglądarek (treść szyfrowana) | zależnie od przeglądarki | dezaktywacja przy 404/410; wiersz — **do decyzji** | — | `02` D-19; `A1` cel #24 |
| RA-15 | Kopie zapasowe i odtwarzanie (dane FF-A; dane klientów — RP-11) | wszystkie | DUMP, SNAP, HIMG | lit. f / art. 32 ust. 1 lit. c [NZ] | R-01 Hetzner; planowany Storage Box w HEL1 (Finlandia) — decyzja niewykonana [PR225] | nie | 14 zrzutów; 30/56 dni; 7 obrazów — bez propagacji usunięć (`A2` RET-09) | Ś-09 | `02` § 3.1; `A2` RET-09 |
| RA-16 | Dostęp do produkcji przez agentów AI (diagnostyka, weryfikacja wdrożeń) — **czynność do decyzji: utrzymać na warunkach komercyjnych albo usunąć** | O-01, O-04, O-05 (w wynikach skryptów) | identyfikatory organizacji, numery faktur i KSeF (z NIP), kwoty, log workera | do decyzji (`04` PRC-07) | R-24 (Anthropic, OpenAI) | tak; mechanizm nieznany (plan subskrypcji) | po stronie dostawcy — wg warunków planu [DOK-9] | brak (skrypty nie redagują) | `04` R-24, PRC-07; `06` SOC-08 |

**Czynności mieszane.** Dziennik audytu działań na fakturach (`02` § 4.1,
„mieszana — do review”) i kopie zapasowe obejmują dane obu ról — w tym
rejestrze ujęto część FF-A, w § 2 część FF-P.

**Luki rejestru (do uzupełnienia przed przyjęciem):** administrator (N-01);
mechanizmy transferu i daty DPA dla R-03…R-09, R-17, R-24 (N-PRC-01);
retencja po stronie dostawców (N-PRC-02, N-INW-08); retencja logów
(N-INW-06, N-INW-15); zakres `auth.*` GoTrue (N-INW-01); ustawione zmienne
produkcji, w tym czy Stripe, AWS, Slack są aktywne (N-PRC-03).

---

## 2. Projekt rejestru kategorii czynności — FaktFlow jako procesor (art. 30 ust. 2 RODO [NZ])

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** Klient (organizacja) decyduje, komu wystawia faktury, jakich
kontrahentów zapisuje, co wysyła do KSeF i komu udostępnia dokumenty;
FaktFlow wykonuje to według konfiguracji klienta (`02` § 4.2). Rejestru
procesora nie znaleziono (`A3` § 1.2).

### 2.1. Część ogólna

| Element (art. 30 ust. 2 lit. a, d) | Treść robocza | Stan |
|---|---|---|
| Procesor | `[OPERATOR]`, `[KONTAKT RODO]`, `[IOD — jeśli wyznaczony]` | brak (N-01) |
| Administratorzy, w imieniu których działa | każdy klient (organizacja w `tenants`) — proponowany załącznik generowany z bazy: identyfikator organizacji, nazwa, data akceptacji umowy powierzenia i jej wersja (I); dziś nie ma zapisu akceptacji żadnego dokumentu (`A1` ZGD-04) | brak |
| Dalsi procesorzy | lista § 7 | częściowe (projekt § 7) **[R5b]** |
| Środki | Ś-01 … Ś-11 (§ 1.1) | częściowe |

### 2.2. Kategorie czynności (FF-P)

| ID | Kategoria czynności | Dane / osoby | Dalsi procesorzy (§ 7) | Transfery poza EOG | Uwagi i luki |
|---|---|---|---|---|---|
| RP-01 | Wystawianie i przechowywanie faktur sprzedaży; generowanie XML FA(3), PDF | D-08, D-09 (w tym PESEL albo numer dokumentu nabywcy B2C); O-04, O-05, O-07 | Hetzner; AWS (tylko jeśli archiwum włączone — `04` R-20) | AWS — możliwy [NZ] | PESEL domyślny w UI (`A1` MIN-01); okres przechowania — decyzja projektu, nie klienta (`02` § 4.2, `A2` RET-01) |
| RP-02 | Wysyłka do KSeF w imieniu klienta, odbiór UPO | D-04, D-08 | Hetzner | nie | MF jest odrębnym administratorem (`02` § 4.3); produkcja ma `KSEF_ENV=test` [PR225] — **[R5b]** przy danych prawdziwych klientów byłoby to przekazanie do środowiska testowego poza poleceniem (`04` PRC-17, R-11a); czy już nastąpiło — `08` N-02, Q-37 (c) (deklaracja [PR225]: brak prawdziwych klientów) |
| RP-03 | Odbiór skrzynki KSeF (cron co 15 min), faktury kosztowe, KPiR | D-10; O-06 (wszyscy sprzedawcy klienta, w tym JDG) | Hetzner | nie | automatyczne w ramach usługi; także dla organizacji „usuniętych” (`A2` PRA-04) |
| RP-04 | OCR dokumentów kosztowych i automatyczna kategoryzacja KPiR modelem AI | D-11 (pełny obraz/PDF), D-10 (nazwa, NIP sprzedawcy, numer, pozycje, kwota); O-06, O-07 | Anthropic | tak — SCC w DPA [DOK-3]; TIA wymagana (§ 5) | kategoryzacja bez przełącznika klienta (`A2` AI-01, `04` PRC-06); możliwe dane szczególne na paragonach (`04` § 7 pkt 2) |
| RP-05 | Kontrahenci i ich weryfikacja w rejestrach (także cykliczna w tle) | D-07; O-05, O-06 | Hetzner | nie | weryfikacja cykliczna to decyzja FF o środkach — wpisać do umowy (`02` § 8 pyt. 1) |
| RP-06 | Płatności i rozliczenia faktur | D-12; O-05, O-08 | Hetzner | nie | `payment_imports` bez zasilania w kodzie (`02` O-08) |
| RP-07 | E-mail faktury do nabywcy; przypomnienia i wezwania do zapłaty (po zatwierdzeniu przez klienta) | D-13, D-28; O-09 | Resend; Cloudflare i skrzynka pomocy (odpowiedzi nabywców — `Reply-To` pomocy) | Resend — do potwierdzenia | odpowiedzi kontrahentów trafiają do FaktFlow, nie do klienta (`02` INW-07); wiadomości bez informacji art. 14 (`A1` ZGD-09) |
| RP-08 | Portal i paczki dla księgowej (w tym adresy CC) | D-06, D-14; O-03 | Resend | do potwierdzenia | linki-okaziciele 7 dni, CC bez weryfikacji (`02` INW-19) |
| RP-09 | Agent FLO — propozycje regułowe i wykonanie zatwierdzonych działań | D-22; O-04, O-05, O-06, O-09 | Resend (wysyłka przypomnień) | do potwierdzenia | model językowy nieaktywny (`A2` AI-04); `payment.score` zablokowany (`lib/flo/flags.ts:39-47`) |
| RP-10 | Eksport i import danych; zaproszenia do organizacji | D-05, D-14, D-15 | Resend (zaproszenia, paczki) | do potwierdzenia | pliki importu i eksportu bez retencji (`A2` RET-06) |
| RP-11 | Kopie zapasowe, archiwum i usuwanie danych klienta | wszystkie D-NN klienta | Hetzner; AWS (jeśli archiwum aktywne) | AWS — możliwy [NZ] | brak propagacji usunięć do kopii (`A2` RET-09); „usunięcie organizacji” bez wykonawcy (`A2` PRA-04) |
| RP-12 | Utrzymanie i wsparcie techniczne: panel operatora, SSH, diagnostyka błędów, agenci AI | wszystkie (dostęp), resztki w komunikatach błędów | Sentry; dostawca agentów AI — tylko po decyzji `04` PRC-07 | Sentry — częściowo US [DOK-5]; agenci — US | odczyty operatora nielogowane (`A3` DOW-08); brak upoważnień (`A3` DOW-23) |

**Luki rejestru:** lista klientów i akceptacji umowy (brak mechanizmu,
`A1` ZGD-04); decyzja o agentach AI (`04` PRC-07); stan archiwum AWS
(N-INW-04); mechanizmy transferu (N-PRC-01).

---

## 3. Wstępna ocena potrzeby DPIA (screening)

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** W repo nie znaleziono DPIA ani screeningu (`A3` DOW-20, § 6).
`A3` § 6.1 zrobił screening zbiorczy; tu rozbijamy go na operacje
i konfrontujemy z faktami z kodu.

### 3.1. Kryteria

- **WP248 rev.01** (ZR-46; O, [NZ]) — dziewięć kryteriów: K1 ocena lub
  scoring; K2 zautomatyzowane decyzje o skutkach prawnych lub podobnie
  istotnych; K3 systematyczne monitorowanie; K4 dane wrażliwe lub
  o charakterze wysoce osobistym (wytyczne wymieniają przykładowo dane
  finansowe [NZ]); K5 duża skala; K6 łączenie lub dopasowywanie zbiorów;
  K7 osoby szczególnie wrażliwe; K8 innowacyjne zastosowanie technologii;
  K9 uniemożliwienie skorzystania z prawa lub usługi. Reguła orientacyjna:
  zwykle co najmniej dwa kryteria → DPIA.
- **Wykaz Prezesa UODO z 2019 r.** (ZR-20; komunikat z 17.06.2019,
  oznaczenie M.P. „2019 poz. 666” do potwierdzenia) — art. 35 ust. 4 RODO
  [NZ]. Źródła nie odczytano (egress zablokowany). Według wiedzy modelu
  wykaz opisuje typy operacji odpowiadające kryteriom WP248, w tym m.in.:
  **U-a** ocena lub scoring (z przykładami oceny sytuacji ekonomicznej),
  **U-b** zautomatyzowane decyzje, **U-c** systematyczne monitorowanie,
  **U-d** szczególne kategorie danych, **U-e** duża skala,
  **U-f** porównywanie lub wnioskowanie na podstawie danych z różnych
  źródeł, **U-g** innowacyjne rozwiązania technologiczne,
  **U-h** przetwarzanie uniemożliwiające skorzystanie z prawa lub usługi.
  **[NZ] — liczba punktów, ich numeracja, brzmienie i przykłady do
  potwierdzenia; etykiety U-a…U-h są robocze i nie odpowiadają numeracji
  wykazu.**
- Rola: przy FF-P obowiązek DPIA ciąży na kliencie-administratorze,
  a FaktFlow pomaga (art. 28 ust. 3 lit. f [NZ]); przy FF-A — na FaktFlow.

### 3.2. Screening per operacja

„Spełnione” = fakt z kodu wskazuje na kryterium; „?” = zależy od faktu
nieznanego (źródło w ostatniej kolumnie).

| ID | Operacja (rola) | Fakty z kodu i raportów | Kryteria WP248 | Typy UODO [NZ] | Rekomendacja | Uzasadnienie | Niewiadome (źródło) |
|---|---|---|---|---|---|---|---|
| DS-01 | OCR dokumentów kosztowych modelem AI (FF-P; dostawcę i zakres danych wybiera FaktFlow) | pełny obraz/PDF do Anthropic (`lib/ocr/engine.ts:144-158`); paragony i faktury mogą ujawniać dane o zdrowiu (`04` § 7 pkt 2); plik bez retencji (`A2` RET-06); brak informacji przy przycisku (`A1` ZGD-08); transfer do US — SCC w DPA [DOK-3] | K4 — wg wstępnej oceny (O, interpretacja WP248 [NZ]; `08` Q-38) **[R5b]**; K8 spełnione (O — modele językowe jako innowacyjna technologia); K5 ? | U-g; U-d ? (gdy dokument ujawnia dane szczególne) | **DPIA zalecana** — jedna wspólna „DPIA funkcji AI” (DS-01, DS-02, DS-07) przygotowana przez FaktFlow: jako materiał dla DPIA klientów i dobrowolna ocena własna | ≥ 2 kryteria; klient-mikroprzedsiębiorca realnie nie oceni dostawcy modelu (`A3` § 6.1 b); transfer poza EOG podnosi ryzyko (czynnik dodatkowy, nie kryterium WP248) | retencja żądań API u Anthropic, ustawienie obszaru roboczego (N-PRC-02); skala (N-PRC-10) |
| DS-02 | Automatyczna kategoryzacja KPiR modelem AI (FF-P) | dla każdej faktury kosztowej z KSeF nierozpoznanej regułami — nazwa, NIP sprzedawcy, numer, pozycje, kwota (`lib/categorization/ai-classifier.ts:42-52`, `index.ts:69-76`); bez działania użytkownika i bez przełącznika organizacji (`A2` AI-01); wynik zawsze do przeglądu (`is_reviewed = false`, `A2` PRA-08) | K4 — wg wstępnej oceny (O, interpretacja WP248 [NZ]; `08` Q-38) **[R5b]**; K8 spełnione; K2 nie (wynik do przeglądu, bez skutków prawnych dla sprzedawcy); K6 ? (dane z KSeF łączone z regułami organizacji) | U-g | **DPIA zalecana** — w ramach DPIA funkcji AI; warunek wdrożeniowy: przełącznik organizacji i usunięcie NIP z promptu (`A2` AI-01) | ≥ 2 kryteria; osoby (sprzedawcy, w tym JDG) nie mają relacji z FaktFlow ani wiedzy o przekazaniu | jak DS-01 |
| DS-03 | Skrzynka KSeF: automatyczny odbiór wszystkich faktur zakupowych organizacji co 15 min, z weryfikacją kontrahentów w rejestrach (FF-P; wspólna pamięć — rola niepewna) | cron odbioru dla organizacji z poświadczeniami (`lib/jobs/queues.ts`, `lib/jobs/runners/inbox-polling.ts:265-330`) — dane wszystkich sprzedawców klienta; także organizacji „usuniętych” (`A2` PRA-04); każda faktura przechodzi do DS-02 (`lib/jobs/runners/auto-categorize-inbox.ts:296`); weryfikacja GUS/VIES/biała lista, także cykliczna (`nightly-validation-recheck.ts:6-30`); wspólna `validation_cache` czytelna dla każdego zalogowanego (`02` INW-16) | K4 — wg wstępnej oceny (dane finansowe; O, interpretacja WP248 [NZ]; `08` Q-38) **[R5b]**; K6 prawdopodobnie (KSeF + rejestry + wspólna pamięć między firmami); K5 ?; K3 nie (brak obserwacji zachowań osób) | U-f ?; U-e ? | **DPIA wskazana po stronie klienta**; FaktFlow: łańcuch „skrzynka → kategoryzacja AI” w DPIA funkcji AI, wspólna pamięć — LIA L-04 (§ 4); powtórzyć screening po przekroczeniu progu skali (próg — do decyzji) | 2 kryteria (jedno prawdopodobne); źródło danych to system państwowy, ale zakres obejmuje wszystkich dostawców klienta bez wyboru pojedynczych dokumentów | skala (liczba klientów i sprzedawców — N-PRC-10); interpretacja „łączenia” w ramach jednego celu klienta (`A3` § 6.1) |
| DS-04 | Analityka produktu: PostHog w przeglądarce (po zgodzie) i na serwerze (bez zgody); Sentry w przeglądarce (sesje, 10 % śladów) (FF-A) | allowlista zdarzeń, `persistence: 'memory'`, bez autocapture i nagrań w kodzie (`A1` MIN-08); stały UUID użytkownika i organizacji, zdarzenia serwerowe bez zgody (`lib/analytics/server.ts:7-38`); sesje Sentry przy każdym wczytaniu strony (`A4` RUN-04); **w panelu PostHog nagrania, konsola i czasy sieci włączone, retencja 30 dni** [PR225 @a72b567]; 2 nagrania w cyklu 17.09–17.10 o nieustalonym źródle (`04` PRC-09) | K3 wątpliwe dziś (zdarzenia z allowlisty, bez treści); K5 ?; K4 nie dziś | U-c ? | **DPIA niewymagana w obecnym zakresie kodu** wg wstępnej oceny — do potwierdzenia (`08` Q-05, Q-38) **[R6]** — udokumentować wynik negatywny + LIA L-03 i L-06; **DPIA wymagana wg wstępnej oceny przed włączeniem nagrań sesji lub heatmap (≥ 2 kryteria WP248, art. 35 ust. 1 [NZ]) — do potwierdzenia (`08` Q-05, Q-38)** **[R5b]** (wtedy K3 + K4: nagranie utrwala tekst strony z danymi faktur i kontrahentów; panel maskuje tylko pola formularzy) | **[R5b]** w kodzie `3e5e00d` ustawienia panelu nie włączają nagrań (SDK nie pobiera konfiguracji projektu — `A4` § 7; `init-posthog-browser.ts:37,49`); wyłączenie w panelu to druga warstwa ochrony; 2 nagrania wskazują inną wersję kodu lub inne środowisko (`08` N-08) | źródło 2 nagrań i „Discard client IP data” (N-PRC-02, NA1-02) |
| DS-05 | PESEL i numer dokumentu nabywcy B2C (FF-P) | po wyborze „Osoba prywatna” UI ustawia PESEL jako domyślny (`invoice-form.tsx:437`, sprawdzone 13.10; `A1` MIN-01); dane w kolumnach, `fa3_data`, XML w S3, payloadzie pg-boss, kopiach; widoczne dla każdego członka organizacji (`02` INW-05); do KSeF jako `NrID` | K4 częściowo (krajowy numer identyfikacyjny — art. 87 RODO [NZ]; WP248 nie wymienia go wprost — interpretacja); K7 nie (konsumenci jako nabywcy nie są per se osobami szczególnie wrażliwymi); K5 ? | — (model nie zna punktu wykazu dotyczącego wprost identyfikatorów krajowych; nie przesądzamy) | **DPIA niewymagana dla samej operacji** (1 kryterium, częściowo) wg wstępnej oceny — do potwierdzenia (`08` Q-05, Q-38) **[R6]**; PESEL jako krajowy numer identyfikacyjny — art. 87 RODO [NZ], pytanie `08` Q-28; zamiast niej: minimalizacja domyślna (MIN-01), ograniczenie widoczności, opis w materiałach dla DPIA klientów | jedno kryterium; ryzyko adresowane zmianą domyślną i art. 25 | czy przepisy o fakturowaniu wymagają identyfikatora konsumenta (pytanie z `A1`); skala B2C |
| DS-06 | Portal i paczki dla księgowej (FF-P) | dostęp tokenem (hash w bazie), odczyt kluczem serwisowym (`lib/accountant/load-accountant-portal.ts:16-24,46`); paczki do 25 MB w załącznikach, powyżej — linki ważne 7 dni, także do adresów CC (`co-pilot-monthly.ts:43,486-494,563-579`); e-mail księgowej w `metadata` przy każdym wejściu (`A3` L8) | K4 — wg wstępnej oceny (pełne dane faktur; O, interpretacja WP248 [NZ]; `08` Q-38) **[R5b]**; pozostałe nie | — | **DPIA niewymagana** wg wstępnej oceny — do potwierdzenia (`08` Q-05, Q-38) **[R6]**; ryzyko to bezpieczeństwo przekazania (art. 32) — analiza ryzyka i zmiany z `02` INW-19 | jedno kryterium | — |
| DS-07 | Czat pomocy z modelem AI (FF-A; treść o danych klienta — FF-P) | do 20 tur rozmowy do Anthropic (`lib/support/chat.ts:75-84`); treść swobodna, użytkownicy mogą wklejać dane kontrahentów; bez retencji, zostaje po usunięciu konta (`A2` AI-03); brak informacji, że odpowiada model (`A1` ZGD-08) | K8 spełnione; K4 ? (zależnie od treści) | U-g | **objąć DPIA funkcji AI** (ten sam dostawca, mały koszt) | 1–2 kryteria; FaktFlow jest tu administratorem | jak DS-01 |
| DS-08 | FLO: ocena terminowości płatności kontrahenta (`payment.score`) i generowanie treści modelem — **dziś zablokowane / nieaktywne** | `lib/flo/flags.ts:39-47` (blokada z powodów prawnych); `lib/flo/llm.ts:1-3`, test `tests/unit/flo-nieaktywne.test.ts:22-41` | K1 spełnione po włączeniu (ocena zachowania płatniczego osób prowadzących JDG); K4 — wg wstępnej oceny (O, interpretacja WP248 [NZ]; `08` Q-38) **[R5b]**; K8 (jeśli model) | U-a (ocena sytuacji ekonomicznej [NZ]) | **DPIA wymagana wg wstępnej oceny przed włączeniem (≥ 2 kryteria WP248, art. 35 ust. 1 [NZ]) — do potwierdzenia (`08` Q-05, Q-38)** **[R5b]** (warunek wdrożeniowy) + ocena art. 22 (`A2` PRA-08) i roli (`02` § 8 pyt. 2) | ≥ 2 kryteria; prawdopodobnie typ z wykazu UODO | brzmienie wykazu [NZ] |
| DS-09 | Konta, bezpieczeństwo, dziennik audytu, billing, poczta (FF-A) | `02` D-01, D-02, D-20, D-28 | brak spełnionych kryteriów (K3 nie — rejestrowanie zdarzeń bezpieczeństwa nie jest monitorowaniem w rozumieniu WP248 [NZ]) | — | **DPIA niewymagana** wg wstępnej oceny — do potwierdzenia (`08` Q-05, Q-38) **[R6]** — zapisać wynik negatywny (rozliczalność, art. 5 ust. 2 [NZ]) | 0 kryteriów | — |

### 3.3. Szkielet „DPIA funkcji AI” (DS-01, DS-02, DS-07) — elementy art. 35 ust. 7 [NZ]

| Element | Co już wiadomo (fakty) | Luka do uzupełnienia |
|---|---|---|
| Opis operacji i celów | tabela `A2` AI.0 (wyzwalacze, zakres danych, zapis w aplikacji, człowiek w pętli) | decyzja o przełączniku organizacji i wartości domyślnej (`A2` AI-01) |
| Niezbędność i proporcjonalność | OCR wymaga całego dokumentu (`A2` AI-02); kategoryzacja nie wymaga NIP (`A2` AI-01: NIP służy regułom lokalnym przed modelem) | minimalizacja: kadrowanie, usunięcie NIP i numeru z promptu, ostrzeżenie w czacie |
| Ryzyka dla osób | transfer do US (SCC w DPA [DOK-3]); dane osób trzecich (sprzedawcy, osoby na paragonach); możliwe dane szczególne; bezterminowe przechowywanie czatu i plików OCR | retencja żądań u dostawcy, region, dalsi procesorzy Anthropic (N-PRC-02; `trust.anthropic.com` zablokowane) |
| Środki | DPA z SCC i zakazem trenowania [DOK-1], [DOK-3]; blok „dane, nie polecenia” w prompcie (`A2` AI.0); wynik do przeglądu | potwierdzenie Commercial Terms na koncie organizacji; TIA (§ 5); retencja (§ 10); informacja przy użyciu (§ 11) |
| Opinia IOD, konsultacja | — | ocena obowiązku IOD (WYM-57); art. 36 tylko przy wysokim ryzyku szczątkowym (WYM-56) |

### 3.4. Pakiet dla DPIA klientów (art. 28 ust. 3 lit. f [NZ])

Zestaw do udostępnienia klientom po przyjęciu: opis kategorii czynności
(§ 2.2), lista dalszych procesorów (§ 7), stan transferów (§ 5), środki
(Ś-01…Ś-11), harmonogram retencji (§ 10 po decyzjach), kanał zgłoszeń
naruszeń i żądań (§§ 8–9), wynik DPIA funkcji AI (§ 3.3).

## 4. Projekty LIA (test trzech kroków)

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** Polityka powołuje się na art. 6 ust. 1 lit. f
(`polityka-prywatnosci/page.tsx:58-72,243-246`), a w repo nie ma żadnej
LIA (`A1` ZGD-01, `A3` § 6.2). Test trzech kroków: (1) uzasadniony
interes, (2) niezbędność przetwarzania dla tego interesu, (3) równowaga
z interesami i prawami osób — art. 6 ust. 1 lit. f, motywy 47 i 49 RODO;
TSUE C-252/21 (ZR-63); wytyczne EROD 1/2024 — **wersja konsultacyjna**,
nie ostateczna (ZR-42) [NZ]. Wynik każdej LIA to **wstępna ocena robocza**,
nie rozstrzygnięcie.

**Zgoda z Prawa komunikacji elektronicznej niezależnie od RODO [NZ]:**
art. 399 PKE (przechowywanie informacji lub dostęp do nich w urządzeniu
końcowym — zgoda, chyba że ściśle niezbędne do usługi żądanej przez
użytkownika) i art. 398 PKE (marketing bezpośredni drogą elektroniczną —
uprzednia zgoda; numer i zakres do potwierdzenia, ZR-11). Gdzie PKE wymaga
zgody, pozytywna LIA nie zastępuje tej zgody.

### L-01. Bezpieczeństwo kont i dziennik audytu (RA-02)

| Krok | Ocena robocza | Fakty |
|---|---|---|
| Cel i interes | bezpieczeństwo kont, wykrywanie nadużyć, rozliczalność działań — interes zgodny z prawem, określony i rzeczywisty (motyw 49 [NZ]) | `lib/audit/log.ts:4-19,146-160`; logowanie, MFA, żądania RODO, operacje na fakturach |
| Niezbędność | IP i user agent są potrzebne przy zdarzeniach bezpieczeństwa (logowanie, MFA, usunięcie konta), **nie** przy każdej akcji; widoczność IP/UA dla każdego członka organizacji nie jest potrzebna; jeden okres 12 mies. dla wszystkich klas zdarzeń — niezbędność niewykazana; IP pobierane z nagłówka zależnego od klienta osłabia przydatność danych | `00008` (`audit_logs_select_own_tenant`); `02` INW-09; `A2` RET-03 |
| Równowaga | użytkownik może rozsądnie oczekiwać logów bezpieczeństwa; nie oczekuje, że współpracownicy zobaczą jego IP i urządzenie; e-mail księgowej (osoby bez konta) zapisywany przy każdym wejściu bez informacji (`A3` L8) | `02` INW-09; `A3` DOW-09 |
| Wynik wstępny | **pozytywny pod warunkami** | — |
| Warunki | (a) IP/UA tylko dla zdarzeń bezpieczeństwa; (b) IP/UA niewidoczne w UI dla ról niższych (albo dla wszystkich); (c) wiarygodne źródło IP (wspólna funkcja z `lib/auth/get-client-ip.ts`); (d) retencja per klasa zdarzeń (§ 10, RT-AUD); (e) opis w polityce; (f) pseudonimizacja obejmująca `details_json` (`02` D-02 [R1]) | — |
| Sprzeciw (art. 21) | ograniczony — ważne prawnie uzasadnione podstawy (bezpieczeństwo) zwykle przeważają [NZ]; ścieżka: procedura § 8 | — |
| PKE | nie dotyczy — dane z nagłówków przesyłanych z żądaniem, bez dostępu do urządzenia [NZ] | — |

### L-02. Ochrona przed nadużyciami: Turnstile, HIBP, limity prób (RA-03)

| Krok | Ocena robocza | Fakty |
|---|---|---|
| Cel i interes | zapobieganie automatycznym próbom logowania, rejestracji i resetu hasła, przejmowaniu kont i użyciu wyciekniętych haseł — motywy 47 (zapobieganie oszustwom) i 49 [NZ] | Turnstile na `/login`, `/register`, `/forgot-password` (`components/auth/turnstile-widget.tsx:20-43`); HIBP (`lib/auth/breach-check.ts:17-41`); limity (`lib/rate-limit/*`) |
| Niezbędność | limity prób — niezbędne, ale skrót identyfikatora bez soli daje się odwrócić słownikiem (pseudonimizacja, nie anonimizacja — `02` INW-16); HIBP — wysyłany jest tylko 5-znakowy prefiks skrótu hasła (model k-anonimowości), po stronie HIBP prawdopodobnie brak danych osobowych [NZ]; Turnstile — przekazuje token i IP (`lib/security/turnstile.ts:119-124`); alternatywa mniej inwazyjna do rozważenia: Turnstile dopiero po N nieudanych próbach | `lib/rate-limit/index.ts:131-135`; `04` R-08, R-16 |
| Równowaga | ochrona formularzy uwierzytelnienia jest oczekiwana; dane krótkotrwałe (TTL okna limitu); Cloudflare jest w US i może działać także na własny cel wykrywania botów — rola do review (`02` § 4.3 [R1], `04` § 7 pkt 5) | `04` R-08 [DOK-8] |
| Wynik wstępny | **pozytywny pod warunkami** | — |
| Warunki | (a) skrót z kluczem (HMAC) w limitach prób; (b) potwierdzenie roli i mechanizmu transferu Cloudflare (§ 5); (c) w polityce: także IP do Cloudflare (dziś „token weryfikacyjny”, `04` § 5) | — |
| Sprzeciw | jak L-01 | — |
| PKE | **Turnstile: skrypt i ramka działają w urządzeniu** — wymaga zgody, chyba że ściśle niezbędny do usługi żądanej (logowanie); proponowana klasyfikacja: ściśle niezbędny (`A1` tabela technologii, `A4` RUN-09) — do review; zawartości ramki (ewentualne ciasteczka w domenie Cloudflare) nie zbadano. Limity i HIBP — PKE nie dotyczy (strona serwera) | — |

### L-03. Analityka po stronie serwera — jeśli zostaje (RA-08)

| Krok | Ocena robocza | Fakty |
|---|---|---|
| Cel i interes | pomiar konwersji, logowań, zdarzeń rozliczeniowych i wysyłek — interes gospodarczy w rozwoju produktu (motyw 47 [NZ]) | `lib/analytics/server.ts:7-38`; wywołania: logowanie (`login/actions.ts:73-77`), rejestracja z `$set: { plan }` (`register/actions.ts:95-102`), Stripe (`webhook-handlers.ts:103,142,249,332`), przyjęcie faktury (`submit-invoice.ts:1933-1940`) |
| Niezbędność | **niewykazana w obecnym kształcie**: te same wskaźniki można liczyć agregatami we własnej bazie albo zdarzeniami bez profilu osoby (`$process_person_profile: false`) lub tylko na poziomie organizacji; stały UUID osoby i powiązanie z profilem z przeglądarki (`identify`) nie są potrzebne do pomiaru konwersji | `A1` MIN-08 |
| Równowaga | osoba, która w banerze wybrała „Tylko niezbędne”, rozsądnie oczekuje braku analityki — zdarzenia serwerowe z jej UUID są z tym sprzeczne; dostawca przetwarza dane także w US (DPA pkt 10.2 [DOK-7]); brak mechanizmu sprzeciwu; retencja 1 rok [PR225] | `A1` MIN-08; `04` PRC-09 |
| Wynik wstępny | **negatywny w obecnym kształcie** | — |
| Warunki wariantu pozytywnego | (a) zdarzenia bez profilu osoby albo tylko agregaty; (b) honorowanie odmowy zapisanej przy koncie; (c) mechanizm sprzeciwu; (d) krótsza retencja; (e) informacja w polityce. **Alternatywa:** objęcie zdarzeń serwerowych tą samą zgodą co przeglądarka (decyzja właściciela i review) | — |
| PKE | samo wysłanie z serwera nie jest dostępem do urządzenia [NZ]; spójność z wyborem użytkownika w banerze — decyzja produktowa | — |

### L-04. Wspólna pamięć danych z rejestrów publicznych (RA-13)

| Krok | Ocena robocza | Fakty |
|---|---|---|
| Cel i interes | wydajność, ograniczenie obciążenia rejestrów publicznych, spójność weryfikacji kontrahentów | `validation_cache` (`00022…sql:26,45`), Redis `ff:gus:<nip>`, `ff:valid:PL:<nip>` (`lib/cache/keys.ts:18-38`) |
| Niezbędność | pamięć podręczna — tak; **odczyt przez każdego zalogowanego** (polityka `USING (true)`, `00022…sql:58-64`) — nie: wystarczy odczyt przez serwer; kolumna `raw_response` nieużywana | `02` INW-16 |
| Równowaga | dane pochodzą z publicznych rejestrów (dla JDG: imię i nazwisko w nazwie, adres, rachunki) — niski wpływ; wspólna tabela ujawnia jednak, że ktoś sprawdzał dany NIP; krótka retencja (24 h + 7 dni) | `A2` E.1 |
| Wynik wstępny | **pozytywny pod warunkami** — o ile czynność jest FF-A; przy FF-P podstawę ocenia klient | — |
| Warunki | (a) odczyt tylko przez serwer; (b) usunięcie `raw_response`; (c) utrzymanie TTL; (d) rozstrzygnięcie roli (`02` § 8 pyt. 3) | — |
| PKE | nie dotyczy | — |

### L-05. Komunikacja z klientami B2B: porady w okresie próbnym, informacje o produkcie (RA-05)

| Krok | Ocena robocza | Fakty |
|---|---|---|
| Cel i interes | pomoc we wdrożeniu usługi i informowanie własnych klientów — motyw 47 (marketing bezpośredni może być uzasadnionym interesem) [NZ] | sekwencja dni 1/4/8 do każdego zarejestrowanego jako `product_updates` (`lib/jobs/runners/email-sequence.ts:16-22`); dzień 8 z treścią handlową o cenie (`:151-168`) |
| Niezbędność | porady o używanej usłudze — uzasadnione; treść handlowa — nie jest niezbędna do pomocy we wdrożeniu | `A1` ZGD-06 |
| Równowaga | odbiorcy to użytkownicy biznesowi, ale wielu to osoby fizyczne (JDG); porady są oczekiwane, reklama bez zgody — nie; wypis tylko nagłówkiem i tylko przy ustawionym `EMAIL_UNSUBSCRIBE_SECRET` (`lib/email/send.ts:178-195`), w treści brak linku | `A1` ZGD-06; NA1-10 |
| Wynik wstępny | RODO: **pozytywny dla porad** pod warunkami; **dla treści handlowej rozstrzyga PKE** | — |
| Warunki | (a) oddzielić treść handlową od porad; (b) link wypisu w treści każdego e-maila nietransakcyjnego; (c) brak sekretu wypisu = brak wysyłki (fail-closed); (d) kategoria `marketing` w modelu opt-in z zapisem wersji i daty zgody | — |
| Sprzeciw | wobec marketingu bezpośredniego — bezwzględny (art. 21 ust. 2–3 [NZ]); mechanizm wypisu istnieje (`app/api/email/unsubscribe/route.ts`) | — |
| PKE | **[R5b]** Wg wstępnej oceny (do potwierdzenia — `08` Q-07; numer przepisu ZR-11 [NZ]): **art. 398 PKE wymaga uprzedniej zgody na marketing bezpośredni drogą elektroniczną niezależnie od RODO** [NZ] — dla e-maila 8. dnia, newslettera i kampanii lit. f nie wystarcza; status art. 10 UŚUDE po wejściu PKE — do potwierdzenia (ZR-12) | — |

### L-06. Diagnostyka błędów (Sentry) — dodatkowa, z rekomendacji `A1` ZGD-01 i `A4` RUN-04 (RA-09)

| Krok | Ocena robocza | Fakty |
|---|---|---|
| Cel i interes | integralność i dostępność usługi (art. 32 [NZ]) | `sentry.server.config.ts:4-12`; `instrumentation-client.ts:5-21`; `lib/jobs/sentry.ts:23-37` |
| Niezbędność | błędy — tak; **sesje (release health) i 10 % śladów wydajności w przeglądarce** — to pomiar użycia, nie niezbędny dla bezpieczeństwa; **przekazywanie dostawcy nagłówków przeglądarki, w tym ciasteczek** przez tunel `/monitoring` — nie jest niezbędne (`A4` RUN-08); kod nie ustawia identyfikatora użytkownika (sprawdzone 13.10, § 0) | `A4` RUN-04, RUN-08 |
| Równowaga | monitorowanie błędów jest oczekiwane; przekazanie ciasteczek sesji poza system — nie; konto i wsparcie Sentry w US [DOK-5]; retencja 30 dni wg dokumentacji [PR225 @a72b567] | `04` R-03, PRC-16 |
| Wynik wstępny | **błędy: pozytywny pod warunkami; sesje i ślady w przeglądarce: negatywny na lit. f** | — |
| Warunki | (a) tunel bez nagłówków `cookie`, `authorization`, `x-forwarded-*`; (b) sesje i `tracesSampleRate` w przeglądarce wyłączone albo za zgodą; (c) opis w polityce; (d) potwierdzenie mechanizmu transferu (§ 5) | — |
| PKE | SDK w przeglądarce odczytuje informacje z urządzenia (user agent, ekran) — może to być „dostęp” w rozumieniu EROD 2/2023 (ZR-34) [NZ]; dla sesji i śladów — zgoda albo wyłączenie; dla samych błędów — do review | — |

**Cele bez LIA w tym pliku** (wymienione w `A1` tabeli celów jako lit. f,
do uzupełnienia po decyzjach): eskalacja czatu do Slacka (RA-07), skrzynka
pomocy (RA-07), alerty operacyjne (RA-10), panel operatora (RA-11), kopie
zapasowe (RA-15). Dla każdego wystarczy ten sam format.

## 5. Lista kontrolna TIA — dostawcy spoza EOG

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** W repo nie ma TIA ani umowy z SCC (`A3` § 6.3); polityka
deklaruje „SCC z każdym US-based subprocesorem” bez dokumentów
(`rodo/page.tsx:43-44`, `04` PRC-02). `04` § 4.2 wskazuje, że TIA jest
potrzebna co najmniej dla Anthropic i Resend, a dla reszty zależy od DPF.

### 5.1. Kroki oceny (dla każdego dostawcy)

Podstawa: art. 44–46 RODO; TSUE C-311/18 (ZR-60); zalecenia EROD 01/2020 —
sześć kroków (ZR-38); SCC 2021/914, klauzula 14 (ZR-04); decyzja
2023/1795 — DPF (ZR-03); lista DPF (ZR-82, nieosiągalna w tej sesji) —
wszystko [NZ]. Proponowana interpretacja (`04` § 4.2, pytanie 9 do
review): przy imporcie do organizacji z aktywnym certyfikatem DPF transfer
opiera się na art. 45 i TIA w rozumieniu klauzuli 14 SCC nie jest
wymagana — wystarczy udokumentowana weryfikacja certyfikatu i jego
zakresu; przy SCC — TIA wymagana.

| Krok | Pytanie kontrolne | Dowód do zapisania |
|---|---|---|
| T1 | Jakie dane, czyje, w jakiej roli FF (A/P), jaką ścieżką i jak często trafiają do dostawcy? Czy obejmuje to dostęp zdalny (wsparcie, spółka matka)? | wiersz rejestru § 1/§ 2; ścieżki w kodzie |
| T2 | Jaki mechanizm: DPF (czy certyfikat aktywny i obejmuje dane „non-HR”), SCC (który moduł), inny? Kto jest stroną umowy (spółka UE czy US)? | zrzut wpisu DPF z datą; wersja i data akceptacji DPA |
| T3 | Czy prawo i praktyka państwa importera (np. dostęp organów do danych) podważają skuteczność SCC dla tych danych? | ocena na podstawie informacji dostawcy (np. raporty przejrzystości) — [NZ] |
| T4 | Jakie środki uzupełniające: szyfrowanie z kluczem u FF, pseudonimizacja przed wysłaniem, minimalizacja, region UE, wyłączenie funkcji? | zmiany w kodzie i ustawieniach z datą |
| T5 | Kroki formalne (np. aneksy, zgody klientów na dalszego procesora) | umowa, lista § 7 |
| T6 | Termin ponownej oceny i wyzwalacze (zmiana dostawcy, decyzji DPF, funkcji) | data w rejestrze dostawców (`06` SOC-18) |

### 5.2. Dostawcy

| Dostawca | Znane fakty (dane, przepływ, region, mechanizm) | Braki | Pytania do dostawcy / do odczytu w panelu | Wstępna potrzeba TIA |
|---|---|---|---|---|
| **Anthropic** (R-06, R-23, R-24) | OCR — pełny dokument; kategoryzacja — nazwa, NIP, numer, pozycje, kwota; czat — do 20 tur (`A2` AI.0); klient SDK bez `baseURL` i `inference_geo` (`lib/anthropic/client.ts:13-21`); strona umowy dla klientów z EOG — Anthropic Ireland [DOK-1]; DPA wbudowuje SCC moduł 2/3, sprzeciw wobec dalszego procesora w 15 dni [DOK-3]; **[R5b]** przekazanie poza EOG wynika z DPA (SCC moduł 2/3 [DOK-3]); polityka prywatności Anthropic mówi o serwerach w US, ale nie obejmuje treści klientów API [DOK-2] — tylko kontekst; opcji przetwarzania w UE w API **nie znaleziono** w dostępnych materiałach (to nie dowód, że nie istnieje) [DOK-4]; agent kodu w CI i agenci z dostępem do produkcji na planach nieznanych (`04` PRC-07) | czy konto FaktFlow działa na Commercial Terms (nie subskrypcja konsumencka); retencja żądań API; lista dalszych procesorów (`trust.anthropic.com` zablokowane); obszar roboczy i domyślna geografia | (1) potwierdzenie Commercial Terms + DPA na koncie organizacji, data i wersja; (2) retencja żądań i dostępność ZDR; (3) informacje do TIA zgodnie z DPA I.4 [DOK-3]; (4) aktualna lista dalszych procesorów; (5) czy istnieje przetwarzanie w UE; (6) dla agentów: plan i wyłączenie trenowania [DOK-9] | **wymagana** (SCC); zapisywać `usage.inference_geo` z odpowiedzi jako dowód geografii (`04` PRC-06 [R2]) |
| **Stripe** (R-07) | e-mail, nazwa, NIP klienta FF, `tenantId` w metadanych (`lib/stripe/customer.ts:90-104`); dane karty wprost do Stripe; zmienne „deferred — wymaga firmy” (`scripts/check-env.ts:124-127`) — możliwe, że w produkcji nieaktywny; polityka: „US, SCC” | strona umowy; DPF; zakres roli odrębnego administratora [NZ] | (1) podmiot umowy (spółka w UE czy US); (2) DPA i mechanizm transferu; (3) status DPF; (4) które dane trafiają do spółki w US | **zależna od mechanizmu**; dotyczy tylko danych FF-A (billing) |
| **Resend** (R-05) | wszystkie e-maile aplikacji, w tym PDF faktur do nabywców, PDF wezwań, paczki księgowe; e-maile GoTrue i odpowiedzi z poczty pomocy według dokumentów (`04` PRC-11); API globalne, region wysyłki ustawiany per domena w panelu (SDK zna m.in. `us-east-1`, `eu-west-1`); polityka: „US, SCC” | region domeny; retencja treści i logów; śledzenie otwarć i kliknięć; DPA; dalsi procesorzy | (1) region domeny wysyłkowej; (2) czy i jak długo przechowywana jest treść i załączniki; (3) śledzenie otwarć/kliknięć — wyłączyć; (4) DPA, DPF, dalsi procesorzy | **wymagana** przy SCC (`04` § 4.2); środek uzupełniający: link podpisany zamiast załącznika PDF (`04` PRC-11) |
| **Sentry** (R-03) | błędy i transakcje po redakcji, sesje z przeglądarki, `tenantId` w tagach; kod nie ustawia identyfikatora użytkownika (§ 0); intake EU (Frankfurt) [PR225], [DOK-5]; **konta, ustawienia, metadane projektu, logi audytu organizacji i treści zgłoszeń do wsparcia — w US** [DOK-5]; plan Developer, retencja 30 dni wg dokumentacji [PR225 @a72b567]; tunel przekazuje nagłówki przeglądarki (`A4` RUN-08) | DPA i mechanizm (sentry.io zablokowane); ustawienie przechowywania IP; aktywny TTL | (1) DPA, DPF/SCC; (2) czy dane zdarzeń (nie konta) są dostępne z US (wsparcie, inżynierowie); (3) ustawienie IP i filtrów po stronie serwera; (4) retencja w panelu | **zależna od mechanizmu**; część „konto i wsparcie w US” wymaga mechanizmu niezależnie od regionu zdarzeń |
| **PostHog** (R-04) | UUID użytkownika i organizacji, zdarzenia z allowlisty; region EU (Frankfurt) z kodu i pomiaru [PR225]; DPA pkt 10.2: przetwarzanie także w US; mechanizmy w DPA: DPF (10.3), SCC (10.4) [DOK-7]; dalsi procesorzy m.in. AWS, PlanetScale, Modal, Wiz, Cloudflare (globalnie dla danych w tranzycie), przy funkcjach AI — dostawcy modeli w US [DOK-6]; `ip: false` nie działa w SDK 1.374.3; replay ON w panelu [PR225 @a72b567] | czy DPA zawarty; status DPF; „Discard client IP data”; czy funkcje AI włączone; źródło 2 nagrań | (1) DPA z datą; (2) DPF; (3) odczyt i zapis ustawienia IP; (4) wyłączenie replay/console/network capture; (5) funkcje AI w projekcie | **uproszczona** przy potwierdzonym DPF (`04` § 4.2) |
| **Google** (R-09, R-25) | (a) logowanie Google — odrębny administrator konta Google; (b) Material Symbols z `fonts.googleapis.com` na każdej stronie — IP, UA, `Referer` odwiedzającego (`app/layout.tsx:114-125`, `A4` RUN-05); (c) docelowe skrzynki poczty pomocy „np. Gmail” (`docs/runbooks/skrzynka-pomoc.md:16-17`) | rola przy fontach; usługa skrzynek (konsumencka czy Workspace) | (a) — nie dotyczy TIA FF (relacja użytkownik–Google); (b) **nie pytać — usunąć odbiorcę** (samohostowanie, `04` PRC-10); (c) jeśli Workspace: DPA, region, DPF | (b) **zbędna po samohostowaniu**; (c) **wymagana**, jeśli skrzynka zostaje u Google; konsumencki Gmail — brak umowy powierzenia [NZ] (`04` PRC-08) |
| **Cloudflare** (R-08) | Turnstile: token, IP (`remoteip`), sygnały przeglądarki; działa „on behalf of the website operator” [DOK-8]; Email Routing: pełne wiadomości na domenę (`ops/poczta/worker.mjs`); DNS; tryb proxy nieustalony; R2 domyślny w kodzie przy pustym `R2_ENDPOINT` (`lib/storage/r2-client.ts:31-38`) | DPA, mechanizm, retencja logów Turnstile i Email Routing; tryb proxy | (1) DPA i DPF/SCC; (2) zakres i retencja danych Turnstile; (3) logi Email Routing; (4) tryb „DNS only/Proxied” dla domen | **zależna od mechanizmu**; jeśli proxy włączone — cały ruch |
| **GitHub** (R-22) | publiczne repo, CI na danych syntetycznych; treść issue `agent:napraw` do agenta Anthropic (`.github/workflows/agent.yml`); warunek: brak danych klientów w zadaniach (`docs/runbooks/agent-kodu.md` § 4 pkt 6) | lista współpracowników (proxy 403) | (1) potwierdzić zasadę „bez danych klientów w issue/PR”; (2) DPF dla danych zespołu | **nie dotyczy danych klientów**; dla danych zespołu — zależna od mechanizmu |
| **Slack** (R-17) | e-mail użytkownika przy prośbie o kontakt z człowiekiem (`lib/support/support-actions.ts:76-83`); UUID organizacji w alertach (`cert-expiry-alert.ts:227-237`); deklaracja 07.10: „Slack roboczo” [PR225] | plan, DPA, retencja kanałów | (1) DPA, DPF; (2) retencja | **wymagana tylko, jeśli zostaną dane osobowe**; zalecenie: usunąć e-mail i UUID z alertów (`04` PRC-12) |
| **Telegram** (R-18) | alerty, raport dzienny, bramka operatorska, powiadomienia o poczcie (lokalna część adresu i kategoria); UUID organizacji przez kanał `urgent` (`lib/alerts/slack.ts:93-113`); kod zakłada brak danych osobowych (`lib/alerts/telegram.ts:12-14`) | mechanizmu z art. 44–46 nie widać [NZ] | nie pytać — **nie wysyłać danych osobowych**; test „kanał Telegram bez identyfikatorów” | **nie wykonywać TIA — zaprzestać przekazywania danych osobowych** (`04` § 4.2) |

Dodatkowo, poza listą z zadania: **AWS** (R-20 — tylko jeśli archiwum
Glacier jest aktywne, N-INW-04) i **agenci AI z dostępem do produkcji**
(R-24, OpenAI według dokumentów koordynacji) — ten sam format po decyzji
z `04` PRC-07.

## 6. Szkielet umowy powierzenia dla klientów

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** Każdy klient-przedsiębiorca jest administratorem danych swoich
kontrahentów, a FaktFlow ich procesorem (`02` § 4.2). Wzoru umowy nie ma
w repo; regulamin nie zawiera postanowień o powierzeniu
(`regulamin/page.tsx:88-100`, `grep -i powierz` — 0 trafień); strona RODO
obiecuje „DPA dla każdej umowy” (`rodo/page.tsx:54-58`) — `A1` ZGD-02,
`A3` § 1.1, `04` PRC-04/05. Proponowana forma: załącznik do regulaminu
akceptowany elektronicznie z zapisem wersji (art. 28 ust. 9 [NZ]; `A1`
ZGD-04). Możliwa baza tekstu: standardowe klauzule z decyzji 2021/915
(ZR-05) [NZ] — decyzja prawnika.

To **mapa wymagań na funkcje aplikacji i luki**, nie tekst umowy.

| § umowy (roboczo) | Wymóg [NZ] | Funkcja aplikacji / stan faktyczny | Luka | Zależność / ID |
|---|---|---|---|---|
| 1. Przedmiot, czas trwania, charakter i cel | art. 28 ust. 3 zd. 1 | kategorie czynności RP-01…RP-12 (§ 2.2); czas — okres korzystania z usługi + okres usuwania | opis automatycznych funkcji (niżej, § 3) | § 2 |
| 2. Rodzaj danych i kategorie osób | jw. | `02` § 1 (O-04…O-09, O-15) i § 2 (D-04…D-15, D-22); w tym PESEL i numer dokumentu nabywcy B2C (D-09) oraz możliwe dane szczególne na dokumentach kosztowych (`04` § 7 pkt 2) | DPA Anthropic deklaruje „Special categories: None” [DOK-3] — sprzeczność do rozstrzygnięcia | DS-01, DS-05 |
| 3. Udokumentowane polecenia, w tym co do transferów | lit. a | działania klienta w UI = polecenia; **funkcje automatyczne do wpisania jako polecenie**: odbiór skrzynki KSeF co 15 min (RP-03), kategoryzacja AI (RP-04), nocna ponowna weryfikacja kontrahentów w rejestrach (`nightly-validation-recheck.ts:6-30`), propozycje FLO (RP-09), archiwizacja i usuwanie po terminie (`archive-old-invoices.ts`, `retention-delete.ts`); transfer do US (Anthropic) | kategoryzacja AI bez przełącznika (`A2` AI-01); **[R5b] ryzyko wysyłki do testowego KSeF przy `KSEF_ENV=test`** — przy danych prawdziwych klientów byłoby to przekazanie poza poleceniem (`04` PRC-17); czy już nastąpiło — `08` N-02, Q-37 (c); 10 lat retencji to decyzja projektu, nie klienta (`tenants.retention_years` nieużywane, `A2` RET-01) | AI-01, PRC-17, RET-01 |
| 3a. Informowanie, gdy polecenie narusza prawo | art. 28 ust. 3 akapit 2 | — | brak procedury | — |
| 4. Poufność osób upoważnionych | lit. b | dostęp operatorów: `ADMIN_EMAILS` z MFA (`lib/auth/admin-guard.ts:9-48`), SSH jako `root` (`06` SOC-08), agenci AI (`04` PRC-07) | brak upoważnień, zobowiązań do poufności i szkoleń (`A3` DOW-23); odczyty operatora nielogowane (`A3` DOW-08) | DOW-23, DOW-08 |
| 5. Środki bezpieczeństwa | lit. c (art. 32) | Ś-01…Ś-10 (§ 1.1) | Ś-06 bez szyfrowania S3 po stronie aplikacji; Ś-09 brak kopii poza hostem; RUN-08 przekazywanie ciasteczek dostawcom; deklaracje „AES-256”, „TLS 1.3” niezweryfikowane (`A1` D-02, `A1` D-03 **[R5b]**) | INW-04, PRC-14, RUN-08 |
| 6. Dalsi procesorzy | lit. d; ust. 2 (uprzednia zgoda — ogólna lub szczegółowa; informowanie o zmianach, prawo sprzeciwu); ust. 4 (te same obowiązki, odpowiedzialność) | lista § 7; Anthropic daje FF 15 dni na sprzeciw [DOK-3] | brak listy i procedury zmian (`04` PRC-05); okres powiadomienia klientów musi zmieścić się w terminach dostawców (`04` § 7 pyt. 3); porównanie DPA dostawców z umową FF (ust. 4) — tylko Anthropic odczytany | PRC-04, PRC-05 |
| 7. Pomoc w realizacji praw osób | lit. e | klient może edytować i usuwać kontrahentów (`app/actions/contractors.ts:24,95`), wyłączyć przypomnienia (`app/actions/reminders.ts:245`), eksportować dane księgowe (`app/actions/exports.ts`); faktur wysłanych do KSeF nie usunie (wyzwalacze integralności) | brak eksportu „wszystko o jednej osobie/NIP” (`A2` PRA-10); brak ograniczenia przetwarzania (`A2` PRA-06); brak procedury przekazania żądań klientowi (`A2` PRA-09) — § 8 | PRA-06, PRA-09, PRA-10 |
| 8. Pomoc w art. 32–36 (bezpieczeństwo, naruszenia, DPIA, konsultacje) | lit. f | materiały § 3.4; procedura § 9 | brak procedury naruszeń (`A3` DOW-03); błędna deklaracja „72 h (art. 33)” wobec klienta (`A1` D-11) | DOW-03, § 9 |
| 9. Usunięcie lub zwrot po zakończeniu | lit. g | „Usuń organizację” ustawia `deleted_at`, `hard_delete_at = +30 dni` (`components/settings/account-actions.ts:22-84`), ale **nic nie wykonuje usunięcia** i organizacja jest dalej przetwarzana, np. odbiór skrzynki KSeF (`A2` PRA-04, RET-04); brak pełnego eksportu organizacji przed odejściem (`A2` RET-11); usunięcie faktur wysłanych do KSeF blokuje wyzwalacz `00132` także dla `service_role` (`A2` RET-02); pliki S3 poza fakturami bez reguły (RET-06); kopie: 14 zrzutów, 30/56 dni, 7 obrazów — bez propagacji usunięć (RET-09); archiwum AWS — jeśli aktywne | wykonawca usunięcia, eksport przed odejściem, opis losu danych w kopiach, decyzja, czy faktury po zakończeniu umowy zwracać czy przechowywać (obowiązek przechowania ciąży na kliencie-podatniku — `A2` pyt. 2) | PRA-04, RET-02, RET-04, RET-09, RET-11 |
| 10. Informacje i audyty | lit. h | dziennik audytu działań (Ś-05); brak raportów SOC 2/ISO (`A3` DOW-21) | brak śladu odczytów operatora (`A3` DOW-08); brak pakietu dowodów dla klienta; zasady audytu u FF (zapowiedź, koszt, zakres) — do decyzji | DOW-08, DOW-21 |
| 11. Lokalizacja i transfery | lit. a + rozdz. V | Hetzner NBG1 (`AGENTS.md`); planowane kopie w HEL1 (Finlandia) [PR225]; transfery: § 5 | polityka i regulamin podają „Frankfurt” (`04` PRC-03) | PRC-02, PRC-03 |
| 12. Okres przechowywania danych w trakcie umowy | lit. a, g | `tenants.retention_years` (domyślnie 10, nieczytane — `A2` RET-01) | instrukcja klienta o okresie; bieg od końca roku, nie od dnia joba (§ 10) | RET-01 |
| 13. Ryzyko przejścia w rolę administratora | art. 28 ust. 10 | funkcje, w których FF ustala cele lub środki ponad polecenie: wspólna pamięć rejestrów (`02` INW-16), reguły FLO, wybór dostawcy AI, telemetria z resztkami danych klienta | do opisania w umowie albo wyłączenia | `02` § 8 pyt. 1–3 |
| 14. Postanowienia handlowe (odpowiedzialność, limity) | — | — | poza zakresem audytu — do prawnika | — |

**Warunki wstępne przed podpisaniem pierwszej umowy:** ustalenie
podmiotu (N-01); lista § 7 zweryfikowana z umowami dostawców; procedury
§ 8 i § 9 przyjęte; wykonawca usunięcia organizacji (PRA-04); decyzja
o `KSEF_ENV` w produkcji (PRC-17).

## 7. Projekt listy dalszych procesorów dla klientów

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.** Nie publikować przed: (a) ustaleniem
> podmiotu `[OPERATOR]` (N-01), (b) potwierdzeniem każdego wiersza umową
> lub odczytem panelu (N-PRC-01, N-PRC-02), (c) decyzjami w kolumnie
> „Warunek”.

Źródło: `04` § 3 (propozycja), uzupełniona o stan weryfikacji. Nazwy
i siedziby dostawców poza Anthropic i PostHog podano według wiedzy modelu
[NZ] (`04` § 0). Lista obejmuje tylko podmioty przetwarzające dane
powierzone przez klienta (RP-NN).

### 7.1. Wzór do publikacji (po weryfikacji)

> **Dalsi podmioci przetwarzający — `[OPERATOR]`**
> Wersja: `[N]` · obowiązuje od: `[DATA]` · poprzednia wersja: `[LINK]`
> Zmiany ogłaszamy co najmniej `[X]` dni przed wejściem w życie
> (e-mailem do właściciela organizacji i na tej stronie). Sprzeciw:
> `[KONTAKT RODO]` w terminie `[Y]` dni — skutki sprzeciwu: `[do decyzji]`.

| Lp. | Podmiot i siedziba | Cel przetwarzania | Kategorie danych | Miejsce przetwarzania | Przekazanie poza EOG i podstawa | Kiedy dotyczy | Stan weryfikacji (wewnętrzny — nie publikować) |
|---|---|---|---|---|---|---|---|
| 1 | Hetzner Online GmbH, Niemcy [NZ — siedziba] | hosting serwerów aplikacji, bazy danych i plików; kopie zapasowe | wszystkie dane powierzone | Norymberga (DE); kopie: `[Helsinki (FI) — po wdrożeniu decyzji]` | `[nie — do potwierdzenia: dostęp zdalny wsparcia]` | zawsze | umowa powierzenia — nieznana (N-PRC-09); lokalizacja z `AGENTS.md` i API [PR225] |
| 2 | Anthropic Ireland, Limited (IE); Anthropic, PBC (US) jako podmiot powiązany | rozpoznawanie dokumentów kosztowych (OCR), kategoryzacja kosztów, asystent pomocy | treść dokumentów kosztowych; nazwa, NIP sprzedawcy, numer i pozycje faktur kosztowych; treść pytań do asystenta | USA i inne kraje wg listy dostawcy | tak — standardowe klauzule umowne (moduł 2/3) w DPA dostawcy [DOK-3] | `[gdy klient korzysta z OCR, kategoryzacji AI lub asystenta — wymaga przełącznika, AI-01]` | podmioty i SCC — z dokumentów [DOK-1], [DOK-3]; akceptacja na koncie — nieznana; TIA — brak |
| 3 | `[Resend — nazwa spółki do potwierdzenia]` (US) [NZ] | wysyłka e-maili z fakturami, wezwaniami i paczkami dokumentów do odbiorców wskazanych przez klienta | adresy e-mail, treść wiadomości, załączniki PDF | `[region domeny — do odczytu]` | `[do potwierdzenia]` | gdy klient wysyła dokumenty e-mailem | region, retencja, DPA — nieznane (`04` PRC-11) |
| 4 | Cloudflare, Inc. (US) [NZ] | odbiór i przekazywanie poczty przychodzącej na adresy FaktFlow (odpowiedzi kontrahentów) | treść wiadomości od kontrahentów klienta | globalna sieć dostawcy | `[do potwierdzenia]` | `[gdy routing poczty działa — N-A2-08]`; **alternatywa: zmiana `Reply-To` na adres klienta usuwa tę pozycję** (`02` INW-07) | stan routingu nieznany (`04` PRC-08) |
| 5 | `[dostawca skrzynki pomocy — do wyboru]` | obsługa korespondencji | jak wyżej | `[do ustalenia]` | `[do ustalenia]` | po wyborze usługi z umową powierzenia | dziś prywatne skrzynki (`04` R-25) |
| 6 | Functional Software, Inc. (Sentry, US) [NZ — nazwa] | diagnostyka błędów | identyfikatory techniczne i fragmenty komunikatów błędów, które mimo redakcji mogą zawierać dane klienta | Frankfurt (DE); dane konta i wsparcia w USA [DOK-5] | `[częściowo — do potwierdzenia]` | zawsze | rola do review (`04` § 7 pyt. 4) |
| 7 | Amazon Web Services EMEA SARL (LU) [NZ] | archiwum długoterminowe XML faktur | pełne pliki XML faktur | `[Frankfurt (eu-central-1) — do potwierdzenia]` | `[do potwierdzenia]` | **tylko jeśli archiwum zostanie włączone** (N-INW-04) | konfiguracja produkcji nieznana |
| 8 | `[dostawca agentów AI z dostępem do produkcji]` | utrzymanie i diagnostyka systemu | wyciągi z bazy i logów | USA | `[do potwierdzenia]` | **tylko jeśli decyzja z `04` PRC-07 utrzyma dostęp**; inaczej usunąć dostęp, nie dopisywać | plan subskrypcji nieznany (N-PRC-07) |

### 7.2. Podmioty, które nie są dalszymi procesorami klienta (do strony informacyjnej, propozycja)

| Podmiot | Dlaczego nie na liście (`04` § 3.2) |
|---|---|
| Ministerstwo Finansów (KSeF, biała lista), GUS, VIES | odrębni administratorzy systemów i rejestrów publicznych [NZ] |
| Stripe | przetwarza dane klienta jako klienta FaktFlow (rozliczenie usługi), nie dane powierzone |
| PostHog | analityka produktu FaktFlow — FaktFlow jest administratorem (do potwierdzenia w review — `08` Q-03, w tym ewentualne współadministrowanie przy `/ingest`) **[R5b]** |
| Google (logowanie), HIBP, NBP | relacja z użytkownikiem albo brak danych powierzonych; fonty Google — do usunięcia (`04` PRC-10) |
| Usługi push przeglądarek | wybór przeglądarki użytkownika; treść szyfrowana |
| Slack, Telegram | po usunięciu danych osobowych z alertów (`04` PRC-12) — nie otrzymują danych powierzonych; inaczej wracają na listę |
| GitHub | brak danych klientów w repozytorium i CI (warunek `docs/runbooks/agent-kodu.md` § 4 pkt 6) |

## 8. Procedura obsługi żądań osób (DSAR)

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** Samoobsługa istnieje tylko dla posiadacza konta (eksport JSON
z sesją i MFA, usunięcie konta z 14-dniowym okresem — `A2` D.1). Osoby bez
konta — największa grupa (kontrahenci klientów) — mają tylko e-mail
pomocy, bez procedury, weryfikacji, wyszukiwania i ewidencji (`A2` PRA-09,
PRA-11; `A3` DOW-04). Ścieżka operatora do usunięcia konta **nie działa**
dla kont z wpisem w dzienniku audytu (`A2` PRA-03) — procedura zależy od
tej naprawy. Podstawa: art. 12, 15–22 RODO; wytyczne EROD 01/2022 (ZR-33);
WP242 (ZR-49) [NZ].

### 8.1. Kanały przyjęcia

| Kanał | Stan faktyczny | Wymóg roboczy |
|---|---|---|
| Ustawienia konta (eksport, usunięcie) | działa dla posiadacza konta; konto tylko z Google nie przejdzie ponownego uwierzytelnienia hasłem (`A2` PRA-02, N-A2-07) | zostaje; dopisać ścieżkę dla kont Google |
| E-mail `[KONTAKT RODO]` (dziś adres pomocy) | Cloudflare Email Routing → prywatne skrzynki operatorów; worker klasyfikuje temat do kategorii „RODO / dane osobowe” z notatką „termin ustawowy: 1 miesiąc” i wysyła na Telegram powiadomienie bez nadawcy, tematu i treści (`ops/poczta/worker.mjs:14-16`, test `ops/poczta/worker.test.mjs`); runbook z 1.10 odnotował brak rekordów MX (`docs/runbooks/skrzynka-pomoc.md:10-11`) — działanie dziś niezweryfikowane (N-A2-08) | skrzynka służbowa z umową powierzenia (`04` PRC-08); automatyczne potwierdzenie wpływu z numerem sprawy (I) |
| Przekazanie przez klienta-administratora (FF-P) | brak | kanał w umowie powierzenia (§ 6, wiersz 7) |
| Formularz WWW | nie istnieje (`/kontakt` to `mailto:`, `02` O-11) | opcjonalnie — decyzja |

### 8.2. Przebieg

| Krok | Działanie | Kto | Termin roboczy [NZ] |
|---|---|---|---|
| P1 | Rejestracja żądania w rejestrze (§ 8.5) z datą wpływu; potwierdzenie wpływu | obsługa skrzynki | dzień wpływu |
| P2 | **Kwalifikacja roli:** dane FF-A (konto, billing, support, telemetria, newsletter, odbicia, zaproszenia) → FaktFlow odpowiada sam; dane FF-P (kontrahenci, nabywcy, adresaci faktur i przypomnień, osoby na dokumentach, księgowe w portalu) → przekazanie klientowi (§ 8.6); mieszane → oba tory | obsługa + właściciel produktu | do `[N]` dni roboczych — do decyzji |
| P3 | **Identyfikacja proporcjonalna** (EROD 01/2022 [NZ]): posiadacz konta — żądanie z zalogowanej sesji albo odpowiedź na adres przypisany do konta; osoba bez konta — korespondencja zwrotna na adres, którego dotyczy żądanie; NIP/PESEL — tylko dopasowanie, bez żądania skanu dokumentu tożsamości; wzór „niezależne dowody i kanały, sam e-mail lub dane firmy nie wystarczą” z `docs/runbooks/unlock-account.md:68-70` stosować tylko przy żądaniach wysokiego ryzyka (usunięcie, wydanie kopii) | obsługa | wstrzymuje bieg do czasu identyfikacji — do review |
| P4 | Wyszukanie we **wszystkich** magazynach (§ 8.3) — wynik jako liczniki per magazyn i organizację (bez kopiowania treści do rejestru); narzędzie: skrypt w `scripts/ops/` (`A2` PRA-09; zasada `AGENTS.md` pkt 9) — **nie istnieje** | operator z dostępem | — |
| P5 | Realizacja: kopia (art. 15) — z ochroną danych innych osób (np. współpracownicy w dzienniku audytu); sprostowanie; usunięcie (z wyjątkami: faktury — obowiązek przechowania klienta, art. 17 ust. 3 lit. b [NZ]); ograniczenie — **brak mechanizmu** (`A2` PRA-06); sprzeciw — marketing: wypis istnieje; lit. f: decyzja per LIA (§ 4) | operator | — |
| P6 | Odpowiedź; przy odmowie — podstawa i pouczenie o skardze do Prezesa UODO i drodze sądowej (art. 12 ust. 4) | właściciel produktu | **1 miesiąc od otrzymania; przedłużenie o 2 miesiące z informacją w ciągu pierwszego miesiąca** (art. 12 ust. 3) [NZ] |
| P7 | Zamknięcie wpisu; dowód wykonania (np. identyfikator przebiegu usunięcia); wpis RODO poza 12-miesięcznym czyszczeniem audytu (`A2` PRA-11) | obsługa | — |
| P8 | Informowanie odbiorców o sprostowaniu, usunięciu lub ograniczeniu (art. 19) — np. dostawcy z § 1 | operator | — |

### 8.3. Zakres wyszukiwania — wszystkie magazyny (z `02` §§ 2–3)

| Magazyn | Klucze wyszukiwania | Co tam jest (ID) | Uwagi |
|---|---|---|---|
| Postgres `public` — konto i organizacja | `user_id`, e-mail, NIP organizacji | D-01…D-06, D-16…D-22 | eksport konta ma limit 1000 wierszy na sekcję i pomija m.in. IP/UA, `admin_user_notes`, wpisy o osobie jako przedmiocie (`A2` PRA-01) |
| Postgres `public` — dane kontrahentów (FF-P) | e-mail, NIP, PESEL, numer dokumentu, nazwa | `contractors`, `invoices.buyer_*`, `fa3_data`, `special_data`, `expenses.seller_*`, `payments.bank_payer_*`, `payment_imports`, `payment_reminders`, `flo_approvals.snapshot`, `export_jobs.emailed_to`, `accountant_access`, `organization_invitations`, `email_bounces`, `newsletter_subscribers` | wolny tekst (`notes`, nazwy pozycji, `kpir_entries.description`) — wyszukiwanie pełnotekstowe po nazwie |
| `validation_cache` (wspólna) | NIP | dane z rejestrów | 24 h + 7 dni |
| `audit_logs` | `user_id`, e-mail w `metadata`, `details_json` | D-02 | 12 mies.; pseudonimizacja pomija `details_json` |
| `gdpr_deletion_requests` | e-mail | e-mail, IP, UA | bezterminowo (`A2` RET-12) |
| `auth.*` (GoTrue) | e-mail, `user_id` | tożsamości, sesje, czynniki MFA, dziennik GoTrue | schemat poza repo (N-INW-01) |
| `pgboss.job` | NIP, e-mail w payloadach | D-27 | 7/14 dni (domyślne biblioteki) |
| Redis (lokalny) | NIP, skróty IP/e-mail | D-26 | TTL 60 s–24 h — zwykle zbędne |
| S3 aplikacji (MinIO) | prefiks organizacji, numer faktury | XML, UPO, PDF faktur i wezwań, zdjęcia OCR, eksporty, importy, snapshoty | treść plików przeszukiwana tylko przez organizację; brak indeksu po osobie |
| Snapshot JSON (SNAP), `pg_dump` (DUMP), obrazy hosta (HIMG) | — | kopie | nie przeszukuje się; informacja o rotacji (14 zrzutów, 30/56 dni, 7 obrazów) i ponowne usunięcie po odtworzeniu (`A2` RET-09) |
| Logi Docker (`app-1`), logi usług Supabase w bazie `_supabase` | e-mail, IP | D-25; logi Kong/GoTrue/PostgREST | retencja nieznana (N-INW-06, N-INW-15) |
| Archiwum AWS Glacier | numer faktury | XML faktur > 2 lata | tylko jeśli aktywne (N-INW-04) |
| Sentry | `tenantId`, treść błędu | D-23 | usuwanie na żądanie — panel dostawcy (`A2` RET-10) |
| PostHog | UUID użytkownika i organizacji | D-24 | usunięcie osoby — panel/API dostawcy; kod nie usuwa (`A2` RET-10) |
| Resend | e-mail odbiorcy | historia wysyłek | retencja nieznana |
| Stripe | e-mail, NIP klienta FF | D-20 | obowiązki własne Stripe [NZ] |
| Anthropic | — (brak identyfikatora po stronie FF) | treści żądań OCR, kategoryzacji, czatu | retencja nieznana (N-PRC-02) |
| Slack, Telegram | e-mail (Slack), UUID organizacji | D-29 | retencja kanałów nieznana (N-A2-14) |
| Poczta pomocy (Cloudflare → skrzynki docelowe) | e-mail nadawcy | D-30 | prywatne skrzynki (`04` R-25) |
| Magazyny historyczne: Supabase Cloud (baza deweloperska), Inngest, Vercel, Cloudflare R2, Upstash | e-mail, NIP | dane sprzed przeprowadzki | stan nieznany (N-INW-16, N-PRC-06) |
| Transkrypcje agentów AI z dostępem do produkcji | identyfikatory organizacji, numery faktur | wyniki skryptów | po stronie dostawcy agenta (`04` PRC-07) |

### 8.4. Terminy (robocze)

| Sytuacja | Termin | Źródło |
|---|---|---|
| Odpowiedź FF-A | 1 miesiąc; przedłużenie o 2 miesiące z uzasadnieniem w 1. miesiącu | art. 12 ust. 3 [NZ] |
| Przekazanie żądania klientowi (FF-P) | `[N] dni roboczych` — **do decyzji i do umowy** | art. 28 ust. 3 lit. e [NZ]; `A2` PRA-10 |
| Pomoc klientowi w realizacji (dane, eksport) | `[M] dni` — do umowy | jw. |
| Wykonanie usunięcia konta | 14 dni na wycofanie + cron co godzinę (`lib/gdpr/deletion.ts`, ADR 0006) | kod |

### 8.5. Rejestr żądań — pola (bez kopiowania treści danych)

`id_sprawy` · `data_wpływu` · `kanał` · `rodzaj żądania` (art. 15/16/17/18/20/21, wycofanie zgody) · `relacja osoby` (konto / kontrahent / adresat / subskrybent / inna) · `rola FF` (A / P / mieszana) · `organizacja` (identyfikator, gdy P) · `metoda identyfikacji` i `data identyfikacji` · `zakres wyszukiwania` (lista magazynów z § 8.3 + liczniki) · `decyzja` (wykonano / częściowo / odmowa + podstawa) · `termin` · `przedłużenie` (data informacji, uzasadnienie) · `data przekazania klientowi` · `data odpowiedzi` · `informacja dla odbiorców` (art. 19) · `osoba obsługująca` (rola) · `odnośnik do korespondencji` (nie treść) · `data zamknięcia` · `okres przechowania wpisu` (do decyzji — § 10, RT-DSAR).

Dziś jedyną ewidencją jest `gdpr_deletion_requests` (tylko konta) i wpisy
audytu kasowane po 12 mies. (`A2` PRA-11).

### 8.6. Ścieżka, gdy FaktFlow jest procesorem

1. Nie realizować żądania samodzielnie wobec danych klienta (poza
   wyjątkami z umowy, np. techniczne usunięcie na polecenie klienta).
2. Ustalić organizację (lub organizacje), w których są dane osoby —
   liczniki z P4.
3. Przekazać klientowi (właściciel organizacji, kanał z umowy) treść
   żądania i liczniki w terminie § 8.4; poinformować osobę, że
   administratorem jest klient, i podać jego dane, jeśli umowa na to
   pozwala (do review).
4. Udostępnić klientowi narzędzie: dziś tylko edycja i usunięcie
   kontrahenta, wyłączenie przypomnień, eksporty księgowe; **brak eksportu
   „wszystko o osobie/NIP”** (`A2` PRA-10) — do wdrożenia.
5. Gdy dane są w kilku organizacjach — przekazać każdej osobno; nie
   ujawniać jednej organizacji danych innej (`A1` MIN-03).

## 9. Procedura naruszeń ochrony danych

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** Procedury nie ma: kroki „zgłoszenie do UODO” są tylko
w runbookach oznaczonych „TEN DOKUMENT JEST NIEAKTUALNY”
(`docs/runbooks/key-rotation.md:3-10,183-190`,
`docs/runbooks/disaster-recovery.md:3-10,117-120`), odsyłają do
niewyznaczonego „DPO”; brak rejestru naruszeń, post-mortem i ćwiczeń
(`A3` DOW-03, `06` SOC-16). Strona RODO obiecuje klientowi „72 godziny
(art. 33)”, co myli zgłoszenie do organu z powiadomieniem administratora
przez procesora (`A1` D-11). Podstawa: art. 33–34 RODO; wytyczne EROD
9/2022 (ZR-36) i 01/2021 (ZR-37) [NZ].

### 9.1. Źródła wykrycia (stan w kodzie)

| Źródło | Co wykrywa | Dowód | Ograniczenie |
|---|---|---|---|
| Sentry (aplikacja, worker, przeglądarka) | błędy, wyjątki | `sentry.*.config.ts`, `lib/jobs/sentry.ts:23-37` | dostęp do panelu: zob. `06` SOC-09 **[R6-wer]** |
| Monitor alertów krytycznych co 5 min → Slack `#urgent` i Telegram | KSeF, kolejka offline, Stripe, VAT, uzgodnienia; alarm nieaktualnej kopii | `docs/runbooks/telegram-heartbeat.md:9-15`; `lib/jobs/runners/critical-alerts-monitor.ts:831-860` | deduplikacja 30 min; „dostarczony, jeśli potwierdzi choć jeden kanał”; brak kryteriów naruszenia danych (`06` CC7.3) |
| Heartbeat workera co minutę do zewnętrznego strażnika | zatrzymanie workera lub bazy | `lib/jobs/heartbeat.ts:12-13,29-38` | dostawca strażnika poza repo (`04` R-19) |
| `/api/health` | dostępność aplikacji | `app/api/health/route.ts:21-78` | brak zewnętrznego monitora potwierdzonego w repo (`06` NS-05) |
| Raport dzienny 06:00 (e-mail do operatorów i Telegram) | liczby błędów, rejestracji, faktur | `telegram-heartbeat.md:10` | wykrycie z opóźnieniem do doby |
| Poczta przychodząca (klienci, kontrahenci, dostawcy, badacze bezpieczeństwa) | zgłoszenia zewnętrzne | `ops/poczta/worker.mjs:14-27` | **brak kategorii „bezpieczeństwo / naruszenie”** — zgłoszenie z tematem np. „wyciek” trafi do kategorii niepilnej (sprawdzone 13.10 w `3e5e00d`); skrzynki prywatne (`04` PRC-08) |
| Skany CI (CodeQL, przegląd zależności) | podatności w kodzie i zależnościach | `.github/workflows/security.yml` (`06` § 3) | brak skanowania hostów i obrazów (`06` SOC-19) |
| Dziennik audytu | nietypowe operacje | `lib/audit/log.ts` | brak alarmów; utrata wpisu bez alarmu (`A3` DOW-11) |
| Powiadomienia od dostawców (art. 33 ust. 2 po ich stronie) | naruszenia u dalszych procesorów | — | kanał odbioru i terminy z umów — nieznane (N-PRC-01) |

### 9.2. Triage

| Krok | Pytanie | Wynik |
|---|---|---|
| N1 | Czy zdarzenie dotyczy danych osobowych (poufność, integralność, dostępność)? | nie → incydent bezpieczeństwa/dostępności poza tą procedurą (rejestr incydentów `06` SOC-16); tak → N2 |
| N2 | **Chwila „stwierdzenia”** — kiedy osoba odpowiedzialna ma rozsądny stopień pewności (EROD 9/2022 [NZ]) | zapisać datę i godzinę — od niej biegną terminy |
| N3 | Czyje dane: FF-A, FF-P (których organizacji), oba? | wyznacza tor 9.3 albo 9.4 |
| N4 | Ocena ryzyka: rodzaj i ilość danych (np. PESEL, dane finansowe, dokumenty OCR, sesje), łatwość identyfikacji, skutki, liczba osób, szczególne kategorie | brak ryzyka / ryzyko / wysokie ryzyko — z uzasadnieniem w rejestrze |
| N5 | Działania ograniczające (rotacja sekretów — runbook do aktualizacji; „hamulce KSeF” `docs/runbooks/hamulce-ksef.md`; wyłączenie funkcji) | zapis w rejestrze |

### 9.3. Tor FF-A (FaktFlow jako administrator)

- **Zgłoszenie do Prezesa UODO bez zbędnej zwłoki, w miarę możliwości
  nie później niż 72 h od stwierdzenia**, chyba że naruszenie
  prawdopodobnie nie skutkuje ryzykiem; po 72 h — z uzasadnieniem
  opóźnienia; informacje można przekazywać etapami (art. 33 ust. 1, 3, 4)
  [NZ].
- **Zawiadomienie osób bez zbędnej zwłoki przy wysokim ryzyku**
  (art. 34; wyjątki z ust. 3) [NZ].
- Kto zgłasza: `[OPERATOR]` — **podmiot nieustalony (N-01)**; bez niego
  nie wiadomo, kto jest stroną zgłoszenia.

### 9.4. Tor FF-P (FaktFlow jako procesor)

- **Powiadomienie każdego klienta, którego dane dotyczy, bez zbędnej
  zwłoki po stwierdzeniu** (art. 33 ust. 2) [NZ]; konkretny termin
  umowny — `[X h]`, **do decyzji i do umowy** (§ 6, wiersz 8). Treść:
  zakres art. 33 ust. 3 w miarę dostępności, uzupełniana etapami.
- FaktFlow nie zgłasza do UODO w imieniu klienta, chyba że umowa tak
  stanowi (do review); pomaga w ocenie i w zawiadomieniu osób (art. 28
  ust. 3 lit. f).
- Poprawić deklarację „72 godziny (art. 33)” na stronie RODO (`A1` D-11).

### 9.5. Rejestr naruszeń — pola (art. 33 ust. 5 [NZ])

`id` · `data i godzina wykrycia` · `źródło wykrycia` (§ 9.1) ·
`data i godzina stwierdzenia` · `opis` (bez danych osobowych) ·
`kategorie danych` · `kategorie i przybliżona liczba osób` ·
`przybliżona liczba wpisów` · `rola` (A / P) · `organizacje dotknięte`
(identyfikatory) · `ocena ryzyka` + uzasadnienie · `decyzja o zgłoszeniu do
UODO` (tak/nie + uzasadnienie) · `data zgłoszenia` i numer · `zawiadomienie
osób` (tak/nie, data, forma) · `powiadomienie klientów` (lista, data) ·
`działania zaradcze` · `przyczyna` · `odnośnik do post-mortem` (dziś
`docs/incidents/` nie istnieje, choć wymaga go `docs/bug-triage.md:50`) ·
`osoba decyzyjna` (rola) · `data zamknięcia`. Wpis także dla naruszeń
niezgłoszonych.

### 9.6. Zależności i ryzyka procedury

| Zależność | Fakt | Skutek dla terminów | Działanie |
|---|---|---|---|
| **Brak dyżuru** | PR #225, `acceptance-plan.md` @`c2ab6a8`, F0-G08: **PARTIAL** — wybrany główny odbiorca alarmów, „brak gwarantowanych godzin reakcji i zastępcy pozostaje jawny”; docelowo Telegram/e-mail, a kod krytycznych używa Slack/Telegram; TEST-06 NOT RUN [PR225] | stwierdzenie w piątek wieczorem może zjeść większość 72 h bez reakcji; procesor nie dotrzyma „bez zbędnej zwłoki” | decyzja: godziny reakcji, zastępca, ćwiczenie (`06` SOC-16) |
| Kanał zgłoszeń zewnętrznych | brak kategorii „bezpieczeństwo” w workerze poczty; skrzynki prywatne | zgłoszenie może czekać jako niepilne | kategoria i alarm pilny; skrzynka służbowa |
| Podmiot i IOD | podmiot nieustalony (N-01); IOD nie wyznaczony, obowiązek nieoceniony | brak strony zgłoszenia | N-01; ocena art. 37 |
| Runbooki | `key-rotation.md`, `disaster-recovery.md` nieaktualne (Vercel, Supabase Cloud, Inngest) | błędne kroki ograniczania | aktualizacja w jednej procedurze `docs/runbooks/` (`A3` DOW-03) |
| Dowody | odczyty operatora nielogowane (`A3` DOW-08); logi bez centralnego zbierania i retencji (`06` SOC-17) | trudność ustalenia zakresu naruszenia | log odczytów, retencja logów |
| Kopie | brak kopii poza hostem (`04` PRC-14) | utrata dostępności = naruszenie z ryzykiem trwałej utraty | wdrożenie decyzji o kopiach |
| Dostawcy | terminy powiadomień w umowach dostawców nieznane (N-PRC-01) | łańcuch FF-P może się opóźnić | rejestr umów (`06` SOC-18) |
| Ćwiczenie | brak zapisu ćwiczenia (`A3` DOW-03) | procedura nieprzetestowana | ćwiczenie stołowe z datowanym zapisem |

## 10. Harmonogram retencji — tabela decyzji

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Po co.** W kodzie działają tylko cztery reguły z wykonawcą (audyt
12 mies., log przebiegów 3 mies., pamięć walidacji, przycinanie zdarzeń
Stripe) plus reguły biblioteczne i TTL (`A2` E.0); większość kategorii
nie ma reguły (`02` INW-01, INW-03). Pkt 5.E zadania zakazuje wymyślania
jednego okresu dla całej aplikacji. **Kolumna „Opcje okresu” zawiera
wyłącznie warianty, które mają źródło (kod, deklaracja w repo, decyzja
[PR225], przepis [NZ]) albo są oznaczone jako `[N]` do ustalenia; żadna
opcja nie jest rekomendacją.** Kolumna „Decyzja” — wszędzie „do podjęcia”.
**[R5b]** Tabela ma 32 pozycje — redaktor poprawek dopisał RT-KSEF
(poświadczenia i sesje KSeF, `02` D-04, wcześniej bez pozycji) oraz
uzupełnił RT-KONTR (`payment_reminders`), RT-STRIPE (tabele `*_attempts`),
RT-DOST (Telegram) i RT-AUD (opcje z [PR225] `data-policy.md`).

| ID | Kategoria / magazyn | Stan w kodzie | Opcje okresu | Moment rozpoczęcia biegu | Podstawa do potwierdzenia | Mechanizm usuwania (I) | Decyzja |
|---|---|---|---|---|---|---|---|
| RT-FAKT | Faktury sprzedaży klienta: wiersze (`invoices` + kaskada), XML, próby XML, PDF, UPO, PDF wezwań; kopie w Glacier | archiwizacja po 2 latach od `issue_date` (tylko z XML), usunięcie = dzień archiwizacji + 8 lat; bez zmiennych AWS nic nie dostaje terminu; faktury bez XML — nigdy; `tenants.retention_years` (domyślnie 10) nieczytane; **`DELETE` faktur wysłanych do KSeF blokowany wyzwalaczem `00132` dla każdej roli**; job kasuje pliki przed wierszami (`A2` RET-01, RET-02; `02` INW-18) | (a) do końca roku kalendarzowego, w którym upłynął termin płatności podatku, + 5 lat (art. 112 ustawy o VAT, art. 86 § 1 w zw. z art. 70 § 1 OP) [NZ]; (b) 10 lat (deklaracja projektu: `AGENTS.md`, polityka `:230`, [PR225] `data-policy.md`); (c) okres z instrukcji klienta w umowie (`tenants.retention_years`); (d) do zakończenia umowy + eksport/zwrot, potem usunięcie (art. 28 ust. 3 lit. g) | dziś: dzień wykonania joba archiwizacji; opcje: koniec roku kalendarzowego / termin płatności podatku / data wystawienia / koniec umowy | obowiązek przechowania ciąży na kliencie-podatniku; FF-P działa na polecenie (`A2` pyt. 1) [NZ]; czy po terminie usuwać wiersz, czy tylko dane osobowe z kopii lokalnej, skoro oryginał jest w KSeF (`A2` pyt. 1 [R3]) | `scheduled_deletion_at` liczone przy akceptacji, niezależnie od XML i Glaciera; wyjątek w wyzwalaczu tylko dla `service_role` po terminie albo zerowanie danych osobowych zamiast `DELETE`; usuwanie plików po udanym usunięciu wiersza; test na bazie z datami granicznymi (`A2` RET-01, RET-02) | do podjęcia |
| RT-FAKT-FF | Faktury własne FaktFlow za subskrypcję (organizacja operatora) | jak RT-FAKT (ten sam job); usunięcie tylko przez serwis po terminie (`00079…sql:73-84`) | (a) jak RT-FAKT (a) — obowiązek własny FF jako podatnika [NZ]; (b) 10 lat | koniec roku / termin płatności podatku | ustawa o VAT, OP [NZ] | jak RT-FAKT | do podjęcia |
| RT-KOSZT | Koszty (`expenses`, `kpir_entries`, `ocr_jobs`), zdjęcia i PDF dokumentów kosztowych, XML ze skrzynki KSeF | brak reguły; plik zdjęcia zostaje po usunięciu kosztu (`A2` RET-05, RET-06) | (a) jak dowody księgowe — RT-FAKT (a) (rozporządzenie o KPiR, ZR-16; OP) [NZ]; (b) okres z instrukcji klienta; (c) dla samego zdjęcia po zatwierdzeniu kosztu: `[N]` — do ustalenia, jeśli zdjęcie nie jest dowodem księgowym | koniec roku podatkowego / zatwierdzenie kosztu | przepisy podatkowe klienta [NZ]; polecenie klienta | reguła per kategoria; usuwanie zdjęcia razem z kosztem i organizacją | do podjęcia |
| RT-KONTR | Kontrahenci, produkty, płatności, `payment_imports`; **[R5b]** przypomnienia o płatności (`payment_reminders` — adresat, temat, treść, ścieżka PDF wezwania; PDF w S3 `reminders/`; `02` D-13) | brak reguły; usunięcie ręczne przez klienta (`app/actions/contractors.ts:95-125`) | (a) do usunięcia przez klienta; (b) do końca umowy; (c) `[N]` lat od ostatniego dokumentu z kontrahentem | koniec umowy / ostatni dokument | polecenie klienta | usuwanie z organizacją (RT-ORG); kontrahent bez dokumentów — `[N]` | do podjęcia |
| RT-ORG | Organizacja po „Usuń organizację” (`deleted_at`, `hard_delete_at = +30 dni`) | **brak wykonawcy**; organizacja dalej przetwarzana (np. odbiór skrzynki KSeF i kategoryzacja AI) (`A2` PRA-04, RET-04) | (a) 30 dni (obietnica UI `settings/account/page.tsx:47-52`); (b) czas na eksport/zwrot `[N]` dni, potem usunięcie z wyjątkiem RT-FAKT; (c) zgodnie z umową | żądanie właściciela / koniec umowy | art. 28 ust. 3 lit. g [NZ] | job realizujący `hard_delete_at`; filtr `deleted_at` w jobach i sesji; eksport organizacji przed odejściem (`A2` RET-11) | do podjęcia |
| RT-KSEF **[R5b]** | Poświadczenia i sesje KSeF (`tenants.ksef_credentials_encrypted`, `ksef_sessions.session_token_encrypted`) — dane pozwalające działać w KSeF w imieniu klienta | brak reguły czasowej; usunięcie przez klienta (`ksef.credentials_removed` — `lib/audit/log.ts:77`) (`02` D-04); `ksef_sessions` istnieje w schemacie (`00001_initial_schema.sql:105`), ale `git grep` w `lib/`, `app/` na `3e5e00d` nie znajduje jej użycia (13.10) — czy ma wiersze, rozstrzyga licznik `07` D-06 | (a) do usunięcia przez klienta albo wygaśnięcia certyfikatu/tokenu; (b) sesje — `[N]` po wygaśnięciu; (c) z organizacją (RT-ORG) | usunięcie / wygaśnięcie / koniec umowy | polecenie klienta; art. 32 [NZ] | job czyszczący sesje; usunięcie z organizacją | do podjęcia |
| RT-KONTO | Konto użytkownika (`auth.users`, `public.users` + kaskada) | żądanie + 14 dni na wycofanie + cron co godzinę (ADR 0006); ścieżka operatora przerywa się na wyzwalaczu audytu (`A2` PRA-03); konta nieaktywne — brak reguły; „do 30 dni po anulowaniu subskrypcji” w polityce bez kodu (`A2` RET-13) | (a) 14 dni (obecne); (b) konta nieaktywne: `[N]` mies. bez logowania — do ustalenia lub brak reguły; (c) po anulowaniu subskrypcji — 30 dni (deklaracja polityki) albo usunięcie deklaracji | żądanie / ostatnie logowanie / anulowanie | art. 17 [NZ]; ADR 0006 | wspólna funkcja usuwania dla obu ścieżek; czerwony test na bazie najpierw (`A2` kolejność 2) | do podjęcia |
| RT-AUD | Dziennik audytu `audit_logs` | całość > 12 mies. usuwana 1. dnia miesiąca; pseudonimizacja przy usunięciu konta bez `details_json` (`A2` RET-03) | (a) 12 mies. (kod, polityka `:215,231`); (b) audyt dostępu/admin 13 mies. i finansowy 10 lat ([PR225] `data-policy.md`, przyjęta, niewdrożona) oraz **[R5b]** minimalna historia błędów faktur 10 lat i próby/kroki (attempts/steps) 90 dni ([PR225] `data-policy.md:62-63`, przyjęte, niewdrożone — osobnego magazynu historii błędów faktur nie znaleziono w migracjach `3e5e00d`, `git grep` „CREATE TABLE” 13.10); (c) podział: bezpieczeństwo / KSeF i finanse / RODO (RT-DSAR) | `created_at` | rozliczalność, bezpieczeństwo (L-01); dla zdarzeń KSeF — dowód dla klienta | czyszczenie per klasa; wpisy RODO poza czyszczeniem; pseudonimizacja także `details_json` | do podjęcia |
| RT-DSAR | Rejestr żądań osób; `gdpr_deletion_requests` (e-mail, IP, UA) | `gdpr_deletion_requests` bezterminowo; wpisy `gdpr.*` w audycie 12 mies. (`A2` PRA-11, RET-12) | (a) przedawnienie roszczeń (KC art. 117–118, ZR-17) [NZ] **[R5b]** — kierunek z `A2` PRA-11; (b) `[N]` lat od zamknięcia; (c) e-mail osoby usuniętej — pseudonimizacja po `[N]` | zamknięcie sprawy | rozliczalność art. 5 ust. 2 vs minimalizacja (`02` § 8 pyt. 11) [NZ] | jeden rejestr (§ 8.5) z regułą | do podjęcia |
| RT-CZAT | Czat pomocy (`support_conversations`, `support_messages`) | brak reguły; zostaje po usunięciu konta z `user_id = NULL` (`A2` AI-03) | (a) usuwanie razem z kontem (kierunek `A2` AI-03); (b) `[N]` mies. od ostatniej wiadomości | ostatnia wiadomość / usunięcie konta | art. 5 ust. 1 lit. e, art. 17 [NZ] | job + kaskada przy usunięciu konta | do podjęcia |
| RT-POCZTA | Poczta pomocy (skrzynki docelowe), odpowiedzi kontrahentów | brak reguły; skrzynki prywatne (`04` PRC-08) | (a) `[N]` mies. od zamknięcia zgłoszenia; (b) korespondencja RODO — jak RT-DSAR; (c) odpowiedzi kontrahentów — przekazanie klientowi i usunięcie | zamknięcie zgłoszenia | lit. f (RA-07) [NZ] | zależny od wybranej usługi | do podjęcia |
| RT-MAIL | `email_bounces`, `email_preferences`, `billing_notifications` | brak reguły; `raw_payload` wyzerowane (`00113…sql:82-83`) | (a) lista blokad — tak długo, jak potrzebna do respektowania wypisu (dane minimalne); (b) `[N]` lat | zdarzenie / wypis | art. 21 [NZ]; reputacja wysyłki (I) | job czyszczący; ewentualnie skrót adresu zamiast adresu (I) | do podjęcia |
| RT-NEWS | Newsletter (`newsletter_subscribers`) | brak reguły; `unsubscribed_at` nigdy nie ustawiane; wysyłka nie istnieje (`02` INW-14) | (a) do wypisu + dowód zgody przez `[N]`; (b) usunąć zbiór do czasu uruchomienia newslettera | wypis / zapis | art. 7 ust. 1 (wykazanie zgody) [NZ] | wypis + job | do podjęcia |
| RT-ZAPR | Zaproszenia i prośby o dołączenie | wiersze zostają po wygaśnięciu (`02` INW-01) | `[N]` dni po wygaśnięciu, akceptacji lub odwołaniu | zmiana statusu | minimalizacja (I) | job | do podjęcia |
| RT-KSIEG | `accountant_access`, `accountant_settings`, `export_jobs.emailed_to` | brak reguły; odwołanie = `revoked_at` (`A2` E.1 [R3]) | (a) `[N]` po odwołaniu/wygaśnięciu; (b) do końca umowy | odwołanie / wygaśnięcie | polecenie klienta | job | do podjęcia |
| RT-EKSP | Eksporty i importy w S3 (`exports/`, `imports/`) | komentarz „pliki usuwane po 90 dniach” bez kodu (`00024…sql:211`); importy „tymczasowe” bez usuwania (`A2` RET-06) | (a) eksporty 90 dni (komentarz w migracji); (b) importy: `[N]` dni po zakończeniu importu | utworzenie pliku / zakończenie importu | minimalizacja (I) | job + reguła cyklu życia w MinIO | do podjęcia |
| RT-LINK | Linki podpisane | 300 s; 3600 s (zdjęcie); **7 dni** (paczka księgowa e-mailem) (`A2` RET-07) | (a) obecne; (b) skrócenie linku paczki do `[N]` lub dostęp przez portal z tokenem i audytem (`02` INW-19) | wygenerowanie | art. 32 [NZ] | konfiguracja | do podjęcia |
| RT-FLO | `flo_proposals`, `flo_approvals` (treść wiadomości, PDF w base64), `flo_shadow`, `flo_decisions` | propozycje wygaszane statusem, wiersze bez usuwania (`A2` E.1 [R3]) | (a) zatwierdzenia — jak dowód polecenia klienta: do końca umowy lub `[N]`; (b) propozycje wygasłe — `[N]` dni | wygaśnięcie / wysyłka | polecenie klienta | job | do podjęcia |
| RT-PUSH | `push_subscriptions` | dezaktywacja przy 404/410 i wypisie; wiersz zostaje | (a) usunięcie przy dezaktywacji; (b) `[N]` dni po dezaktywacji | dezaktywacja | minimalizacja (I) | zmiana w `lib/push/sender.ts` | do podjęcia |
| RT-ADMIN | `admin_user_notes` | tylko `archived_at` | (a) do końca relacji z klientem + `[N]`; (b) usuwanie z kontem osoby | koniec relacji | lit. f (RA-11) [NZ] | job | do podjęcia |
| RT-STRIPE | `stripe_webhook_events.payload`; `subscriptions.last_webhook_payload`, `stripe_payments.last_webhook_payload`; **[R5b]** `stripe_checkout_attempts` (`00081…sql:20`), `stripe_customer_attempts` (`00114…sql:21`) — identyfikatory klienta i sesji Stripe, kaskada z organizacją, bez reguły czasowej | zdarzenia przycinane po 90 dniach od przetworzenia; `last_webhook_payload` — brak reguły (`02` INW-12) | (a) przycinanie `last_webhook_payload` jak zdarzeń (90 dni — reguła istniejąca w kodzie); (b) nie zapisywać pełnego obiektu | przetworzenie | minimalizacja (I) | rozszerzenie istniejącego joba | do podjęcia |
| RT-PGB | Kolejka pg-boss (`pgboss.job`) — payloady z obiektem faktury, NIP, e-mailami | biblioteka: 7 dni po zakończeniu, 14 dni oczekiwania (`A2` RET-08) | (a) zachować i udokumentować; (b) krótsze dla kolejek z danymi osobowymi; (c) identyfikatory zamiast obiektów w payloadach | zakończenie / utworzenie zadania | minimalizacja (I) | konfiguracja `deleteAfterSeconds` | do podjęcia |
| RT-RUNLOG | `inngest_run_log`, `ksef_health_log` | 3 mies. (działa); `ksef_health_log` — komentarz 3 mies. bez kodu | (a) 3 mies. dla obu | `created_at` | techniczna (I) | dopisać tabelę do funkcji czyszczącej | do podjęcia |
| RT-CACHE | `validation_cache`, Redis | 24 h + 7 dni; TTL 60 s–24 h | (a) obecne | zapis | techniczna (I); L-04 | — | do podjęcia (potwierdzenie) |
| RT-KOPIE | `pg_dump` lokalny, snapshot JSON, obrazy hosta; planowana kopia poza hostem | 14 zrzutów; 30/56 dni; 7 obrazów; brak kopii poza hostem i propagacji usunięć (`A2` RET-09) | (a) obecne; (b) decyzja 07.10 (niewdrożona): restic w HEL1, 7 dziennych / 4 tygodniowe / 12 miesięcznych [PR225] | data kopii | art. 32 ust. 1 lit. c [NZ]; `A2` pyt. 6 | rotacja + procedura ponownego usunięcia po odtworzeniu (lista usunięć poza kopią) | do podjęcia |
| RT-LOGI | Logi Docker (aplikacja, worker), logi usług Supabase w bazie `_supabase` | brak konfiguracji w repo; `_supabase` ok. 676 MB, poza `pg_dump`, retencja nieznana [PR225 @a72b567] | (a) 7 dni, 10 MiB × 5 plików ([PR225] `data-policy.md`, niewdrożona); (b) logi dostępu z IP: `[N]` dni dla celu bezpieczeństwa (`02` pyt. R1) | zapis | lit. f (RA-09) [NZ] | konfiguracja Docker i Logflare/Vector | do podjęcia |
| RT-SENTRY | Sentry | 30 dni wg dokumentacji dla planu Developer, TTL nieodczytany [PR225 @a72b567] | (a) 30 dni (stan); (b) błędy 90 dni, spany 30 dni (decyzja 10.10 o planie Team EU, niewdrożona) [PR225] | zdarzenie | L-06 | panel dostawcy; usuwanie na żądanie — procedura § 8 | do podjęcia |
| RT-POSTHOG | PostHog | analityka 1 rok, nagrania 30 dni (konto/panel) [PR225, PR225 @a72b567] | (a) 1 rok ([PR225] `data-policy.md`); (b) krócej — `[N]`; nagrania — wyłączone | zdarzenie | L-03; zgoda | panel; usuwanie osoby przez API przy wycofaniu zgody (§ 12) | do podjęcia |
| RT-DOST | Resend, Slack, **[R5b]** Telegram, Anthropic (żądania API), Cloudflare (Turnstile, Email Routing) | nieznane (`A2` RET-10, N-PRC-02) | do odczytu w panelach/umowach, potem decyzja | — | umowy dostawców | panel; wyłączenie przechowywania treści, jeśli możliwe | do podjęcia |
| RT-AUTH | `auth.*` GoTrue (sesje, tokeny odświeżania, dziennik) | zarządza GoTrue, niezweryfikowane (N-INW-01) | do odczytu konfiguracji | — | — | konfiguracja GoTrue | do podjęcia |
| RT-SESJA | Ciasteczko sesji Supabase w przeglądarce | 400 dni, `httpOnly: false` (domyślne `@supabase/ssr`; `A1` ZGD-11) | (a) `[N]` dni zgodnie z polityką sesji; (b) „do zamknięcia przeglądarki” (obecna deklaracja polityki `:232`) | logowanie | art. 399 PKE, art. 13 [NZ] | `cookieOptions` w klientach Supabase | do podjęcia |
| RT-HIST | Magazyny historyczne: Supabase Cloud (baza deweloperska), Inngest, Vercel, Cloudflare R2, Upstash | stan nieznany; checklista sprzątania niezaznaczona (`02` § 3.3) | (a) usunąć projekty i dane teraz; (b) zostawić tylko bazę deweloperską z danymi syntetycznymi | — | minimalizacja (P) [NZ] | ręcznie, z datą i dowodem (N-PRC-06) | do podjęcia |

## 11. Wymagania treści polityki prywatności, strony RODO i informacji przy zbieraniu

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.** To lista braków i błędów względem
> stanu faktycznego, **nie** gotowy tekst prawny.

Źródła porównania: `A1` (tabele „Deklaracje ze stron prawnych vs stan
faktyczny”: `A1` P-01…P-21, `A1` D-01…D-12, `A1` R-01…R-05, `A1` X-01…X-02 **[R5b]**; ZGD-03, ZGD-04,
ZGD-08, ZGD-09), `04` § 5, `A4` RUN-11. Podstawa: art. 12–14 RODO,
art. 7 ust. 3, art. 399 PKE, wytyczne WP260 (ZR-47) [NZ].
**[R5b]** Identyfikatory P-NN, D-NN, R-NN i X-NN w tej sekcji to pozycje
tabel deklaracji `A1` — redaktor poprawek dopisał przedrostek `A1`, bo
kolidowały z P-NN `A3` (pytania), D-NN `02` (kategorie danych) i R-NN `04`
(odbiorcy), używanymi w innych sekcjach tego pliku i w `08`.

### 11.1. Polityka prywatności (`app/(marketing)/legal/polityka-prywatnosci/page.tsx`, „Ostatnia aktualizacja: 9 maja 2026”)

| ID | Element (przepis [NZ]) | Stan obecny (dowód) | Błąd / brak | Fakt do wpisania (źródło) | Stan |
|---|---|---|---|---|---|
| W-01 | Tożsamość i kontakt administratora (art. 13 ust. 1 lit. a) | „[nazwa firmy], NIP [TWÓJ_NIP], z siedzibą w Poznaniu” (`:20-21`, `A1` P-01) | placeholder | `[OPERATOR]` po N-01 | brak |
| W-02 | Kontakt do IOD (lit. b) | brak wzmianki (grep `inspektor\|IOD\|DPO` — 0 trafień, 13.10) | brak oceny obowiązku | po decyzji z WYM-57; jeśli IOD nie jest wymagany — tylko `[KONTAKT RODO]` | brak |
| W-03 | Cele i podstawy (lit. c) | trzy podstawy bez przypisania celów (`:58-72`, `A1` P-06) | cele z kodu bez podstaw; brak analityki (lit. a), marketingu, AI | tabela RA-01…RA-16 (§ 1.2) po review | brak |
| W-04 | Uzasadnione interesy (lit. d) | odesłanie do „dokumentacji technicznej produktu” (`:243-246`), której nie ma | brak opisu interesów | L-01…L-06 (§ 4) po review | brak |
| W-05 | Odbiorcy (lit. e) | lista z Supabase (Frankfurt), Cloudflare R2, Vercel, Inngest (`:81-120`, `A1` P-09) | nieaktualni odbiorcy; brak: PostHog (tylko w sekcji cookies), Slack, Telegram, Google (logowanie, fonty), Cloudflare Email Routing, GUS/VIES/biała lista, usługi push, skrzynki pomocy; Anthropic opisany tylko dla OCR — brak czatu i kategoryzacji (`04` § 5) | `04` § 1 (R-01…R-25) i § 7 | brak **[R5b]** |
| W-06 | Transfery i zabezpieczenia (lit. f) | „Wszystkie dane pozostają w UE” (`:76-77`, `A1` P-07); „SCC z każdym US-based subprocesorem” (`rodo/page.tsx:43-44`) | nieprawdziwe: Anthropic (US, SCC w DPA), PostHog (przetwarzanie w US wg DPA), Sentry (konto i wsparcie w US), Resend, Stripe, Cloudflare, Google; mechanizmy niepotwierdzone | § 5 po odczycie umów; opis transferów „częściowych” (`04` § 7 pyt. 10) | brak **[R5b]** |
| W-07 | Lokalizacja | „Hetzner, Frankfurt” (`:76`), „Backup: AWS Glacier, Frankfurt” (`:79`, `A1` P-08) | serwery w NBG1 (Norymberga) wg `AGENTS.md`; kopie lokalnie u Hetznera; Glacier to archiwum faktur, prawdopodobnie nieaktywne (`04` PRC-03) | Hetzner NBG1; kopie wg RT-KOPIE | brak **[R5b]** |
| W-08 | Okres przechowywania (ust. 2 lit. a) | „Cookies sesji: do końca sesji” (`:232`); „Dane konta: do 30 dni po anulowaniu” (`:229`); „Faktury: 10 lat (art. 70 § 1 OP)” (`:230`); „Logi audit: 12 miesięcy” (`:231`) | sesja 400 dni (`A1` ZGD-11); „30 dni po anulowaniu” bez kodu (`A2` RET-13); art. 70 § 1 OP wg ZR-14 to 5 lat od końca roku [NZ] i obowiązek klienta; audyt — zgodne z kodem | § 10 po decyzjach | brak **[R5b]** |
| W-09 | Prawa osób (ust. 2 lit. b) | lista praw (`:191-202`); eksport „JSON / CSV / JPK_FA” w 30 dni (`A1` P-16); „Sprzeciwu (możesz w każdej chwili zrezygnować)” (`:199`, `A1` P-17) | eksport konta to tylko JSON (`A2` PRA-01); sprzeciw pomylony z wycofaniem zgody; ograniczenie bez mechanizmu (`A2` PRA-06) | procedura § 8; rzeczywisty zakres eksportu | częściowe |
| W-10 | Prawo wycofania zgody (ust. 2 lit. c; art. 7 ust. 3) | brak informacji; w UI brak sposobu (`A1` ZGD-05, `A4` RUN-03) | brak | link „Ustawienia prywatności” (§ 12, ZG-04) | brak |
| W-11 | Skarga do organu (ust. 2 lit. d) | „Skargi do Prezesa UODO (uodo.gov.pl)” (`:200`, sprawdzone 13.10) | — | — | potwierdzone |
| W-12 | Wymóg podania danych i skutki (ust. 2 lit. e) | „Imię (opcjonalnie)” (`:32`, `A1` P-03) | formularz wymaga imienia i nazwiska (`A1` MIN-02) | które pola są wymagane i dlaczego | brak **[R5b]** |
| W-13 | Zautomatyzowane decyzje (ust. 2 lit. f) | brak wzmianki (grep `zautomatyzowan` — 0 trafień) | brak stwierdzenia | „nie podejmujemy decyzji wyłącznie zautomatyzowanych” — o ile review potwierdzi `A2` PRA-08; kategoryzacja AI z przeglądem człowieka | brak |
| W-14 | Dane nie od osoby: kategorie i źródło (art. 14 ust. 1 lit. d, ust. 2 lit. f) | brak | dla FF-A: dane z rejestrów (GUS, VIES, biała lista) we wspólnej pamięci; Google przy logowaniu | `02` D-07, RA-13 | brak |
| W-15 | Rozdzielenie ról | dane kontrahentów opisane jak „Twoje dane” zbierane przy korzystaniu z usługi (`:34-42`) | FF jest procesorem tych danych (`A1` ZGD-02) | osobna sekcja „Dane, które przetwarzamy na zlecenie klientów” z odesłaniem do umowy powierzenia i § 7 | brak |
| W-16 | Technologie w urządzeniu (art. 399 PKE) | „Cookies (sesja, preferencje)”, „Cookies preferencji: 1 rok” (`:44-50,226-246`) | brak: Google Fonts, service worker i Cache Storage, klucze `localStorage`, sesje i ślady Sentry; ciasteczka preferencji nie istnieją (motyw w `localStorage`) (`A4` RUN-11) | tabela § 12.3 po decyzjach | brak **[R5b]** |
| W-17 | Funkcje AI (art. 13; art. 50 AI Act — termin do potwierdzenia [NZ]) | Anthropic tylko przy OCR; „zdjęcia … nie są przechowywane przez Anthropic” (`:106-109`, `A1` P-10) | brak czatu i kategoryzacji; twierdzenie zbyt mocne (DPA: przechowywanie w okresie umowy, usunięcie w 30 dni po jej zakończeniu [DOK-3]) | `A2` AI.0; § 3.3 | brak **[R5b]** |
| W-18 | Anonimizacja vs pseudonimizacja | „wpisy audytu zostaną zanonimizowane” (`:183-188,221-224`, `A1` P-13) | to pseudonimizacja (`A1` MIN-11) | właściwy termin i zakres | brak **[R5b]** |
| W-19 | Turnstile | „trafia token weryfikacyjny” (`:90-97`) | do Cloudflare trafia też IP i sygnały przeglądarki (`lib/security/turnstile.ts:119`) | `04` R-08 | częściowe |
| W-20 | Wersja i data | „9 maja 2026” — sprzed przeprowadzki na Hetznera | brak numeru wersji i historii zmian (`A1` ZGD-04) | numer wersji, data, rejestr zmian | brak |

### 11.2. Strona „RODO i bezpieczeństwo” (`app/(marketing)/legal/rodo/page.tsx`, bez daty)

Wszystkie pozycje oznaczone na stronie „✅” (`A1` ZGD-12). Kierunek:
zdjąć stronę albo zastąpić listą faktów z datą weryfikacji (`A1` ZGD-12).

| ID (`A1`) | Deklaracja | Błąd | Kierunek poprawki |
|---|---|---|---|
| D-01 | „Dane w UE — Frankfurt am Main (Hetzner, Vercel)” | NBG1; Vercel nieużywany; transfery do US | lokalizacja i lista transferów z § 5 |
| D-02 | „Szyfrowanie at-rest — AES-256 (Supabase + R2)” | R2 nieużywany; szyfrowania MinIO i dysków nie ma w repo; zrzuty bez szyfrowania | tylko potwierdzone środki (Ś-03) albo usunąć |
| D-03 | „TLS 1.3 dla wszystkich połączeń” | wersja TLS poza repo; połączenia wewnętrzne bez wymuszonego TLS | usunąć „wszystkich” albo potwierdzić |
| D-06 | „Audit logs — kto i kiedy uzyskał dostęp do Twoich danych” | odczyty nie są audytowane (`A3` DOW-08) | usunąć do czasu logowania odczytów |
| D-07 | „SCC z każdym US-based subprocesorem” | brak umów w repo | stan z § 5 |
| D-08 | „Brak cookies analitycznych” | mylące — analityka po zgodzie, sesje Sentry bez zgody | opis z § 12.3 |
| D-10 | „oferujemy DPA … Pobierz pdf” | wzoru brak; link `mailto:` | po przyjęciu § 6 |
| D-11 | „powiadomimy Cię w ciągu 72 godzin (art. 33)” | art. 33 ust. 1 dotyczy organu; procesor — „bez zbędnej zwłoki” (art. 33 ust. 2) [NZ] | termin umowny z § 9.4 |
| D-12 | „Kontakt RODO: [adres pomocy]” | adres zgodny; kanał w prywatnych skrzynkach | po zmianie skrzynki (§ 8.1) |
| D-04, D-05 | eksport „30 dni”; usunięcie „najpóźniej w ciągu miesiąca” | zakres eksportu węższy; „usunięcie organizacji” bez wykonawcy (`A2` PRA-01, PRA-04) | opis rzeczywistego zakresu |
| D-09 | „2FA dla kont (opcjonalnie, polecane)” | zgodne | — |

### 11.3. Informacja w punktach zbierania danych

| Punkt | Stan (dowód) | Brak | Kierunek |
|---|---|---|---|
| Rejestracja e-mail | zdanie „Rejestrując się akceptujesz regulamin i politykę prywatności” bez pola i bez zapisu (`app/(auth)/register/page.tsx:164-173`) | zapis wersji i chwili; „akceptacja polityki” myli informację z oświadczeniem woli (`A1` ZGD-04) | „Zapoznałem się z polityką” + link do wersji; zapis `legal_acceptances` (I) |
| Rejestracja przez Google z ekranu logowania | brak jakiejkolwiek informacji (`app/(auth)/login/page.tsx`; grep `regulamin\|polityk` — brak) | informacja art. 13 i akceptacja regulaminu | ekran potwierdzenia przed utworzeniem organizacji |
| Baner zgody | cel, dostawca, region, link (`consent-banner.tsx:47-57`) | okres, powiązanie z kontem (`identify`, `group`), sposób wycofania (`A1` ZGD-05) | § 12 |
| Czat pomocy | „Cześć! Jestem asystentem FaktFlow…” (`support-widget.tsx:334-335`) | że odpowiada model zewnętrznego dostawcy, zapis rozmowy, eskalacja do zespołu, prośba o niewklejanie danych kontrahentów (`A1` ZGD-08) | jedno zdanie pod polem |
| OCR dokumentu | brak (`capture-button.tsx`, `expense-edit-form.tsx`) | informacja o modelu i dostawcy | jedno zdanie przy przycisku |
| E-maile do osób trzecich (faktura, przypomnienie, zaproszenie, paczka księgowa) | „Wiadomość wysłana przez FaktFlow.” albo nic (`A1` ZGD-09) | wskazanie nadawcy-klienta, roli FF, odesłanie do informacji; dla FF-P — wsparcie obowiązku art. 14 klienta | stopka + strona „Informacja dla odbiorców wiadomości FaktFlow” |
| Newsletter | formularz nieosadzony; atrapa obiecuje „Zapisano” bez zapisu (`A1` ZGD-06, MIN-12) | treść zgody, potwierdzenie adresu, informacja | przed uruchomieniem |
| Powiadomienia push | zgoda przeglądarki (`hooks/use-push-notifications.ts:72-110`) | brak w polityce | wpis w polityce |
| Portal księgowej | wejście zapisuje e-mail księgowej w `metadata` (`A3` L8) | informacja dla księgowej (osoba bez konta) | krótka informacja na stronie portalu |

**Regulamin** (`regulamin/page.tsx`): placeholder usługodawcy (`A1` R-01),
data „1 maja 2026” mimo zmiany 1.10.2026 (`A1` R-02), „Frankfurt” (`A1` R-03),
„30 dni … permanentnie usuwane” bez mechanizmu i sprzeczne z „faktury
10 lat” (`A1` R-04), brak postanowień o powierzeniu, AI, FLO i przypomnieniach
(`A1` R-05) — `A1` § „Regulamin” **[R5b]**.

## 12. Specyfikacja funkcjonalna zgody na technologie w przeglądarce

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Stan wyjściowy (fakty).** Działa: brak PostHog przed wyborem i po
odmowie, odmowa na pierwszej warstwie, na tym samym poziomie i tej samej wielkości (słabszy kontrast — do oceny, `08` Q-45), brak pól zaznaczonych
domyślnie, 0 ciasteczek na stronach publicznych przed wyborem (`A1`
ZGD-05; `A4` RUN-01, RUN-02 — runtime na lokalnym buildzie). Nie działa:
wycofanie z interfejsu (`A4` RUN-03), dowód i wersja decyzji (RUN-10),
zgoda per przeglądarka zamiast per osoba (`A1` ZGD-05); bez zgody działają
sesje i ślady Sentry (RUN-04), arkusz fontu Google (RUN-05), service
worker z Cache Storage (RUN-06); proxy przekazuje ciasteczka dostawcom
(RUN-08). Podstawa: art. 399–400 PKE, art. 5 ust. 3 dyr. 2002/58, art. 4
pkt 11 i art. 7 RODO; EROD 05/2020, 2/2023, raport Cookie Banner
Taskforce; TSUE C-673/17 (ZR-02, ZR-11, ZR-31, ZR-34, ZR-40, ZR-62) [NZ].

### 12.1. Wymagania funkcjonalne

| ID | Wymaganie | Kryterium akceptacji | Test (I) | Źródło luki |
|---|---|---|---|---|
| ZG-01 | **Granulacja:** kategorie „Niezbędne” (zawsze, bez przełącznika), „Analityka produktu (PostHog)”, oraz — jeśli review nie zakwalifikuje ich do lit. f — „Diagnostyka w przeglądarce: sesje i pomiar wydajności (Sentry)”; każda kategoria osobno | każda kategoria ma własny przełącznik na drugiej warstwie; pierwsza warstwa: „Akceptuję wszystkie”, „Tylko niezbędne”, „Ustawienia” | test komponentu | `A4` RUN-04; decyzja L-06 |
| ZG-02 | **Równoważna odmowa:** „Tylko niezbędne” na pierwszej warstwie, tej samej wagi wizualnej; zamknięcie „X” = odmowa (stan dziś) | brak dodatkowego kroku dla odmowy | test e2e (scenariusz `b` uprzęży `A4`) | utrzymać `consent-banner.tsx:60-84` |
| ZG-03 | **Brak działania przed wyborem:** bez zgody nie startuje SDK kategorii opcjonalnych i nie ma żądań do `/ingest`; sesje i ślady Sentry wyłączone do zgody (jeśli ZG-01 je obejmuje) | 0 żądań `/ingest`; 0 kopert `session`/`transaction` z przeglądarki przed zgodą | uprząż `A4` scenariusz `a` (`narzedzia/uruchom-test-runtime.sh`) | RUN-02, RUN-04 |
| ZG-04 | **Wycofanie w każdej chwili, tak łatwe jak udzielenie:** link „Ustawienia prywatności” w stopce wszystkich układów (marketing, logowanie, panel, 404) i w `/settings`, otwierający ten sam wybór | dwa kliknięcia od dowolnej strony; po wycofaniu 0 żądań `/ingest` | uprząż `A4`, krok d1 zastąpiony kliknięciem (RUN-03) | `A1` ZGD-05; `A4` RUN-03 |
| ZG-05 | **Skutki wycofania:** `opt_out_capturing()` + `posthog.reset()` (nowy identyfikator), zatrzymanie sesji Sentry (jeśli ZG-01); informacja, jak zażądać usunięcia danych już zebranych (procedura § 8); usunięcie osoby w PostHog przez API przy żądaniu | brak dalszych zdarzeń; identyfikator zmieniony | test jednostkowy `syncPosthogConsent` | `A1` ZGD-05 („wycofanie nie czyści profilu”) |
| ZG-06 | **Wersjonowanie i dowód:** zapis `{decyzja per kategoria, wersja treści banera, data}`; po zalogowaniu — kopia przy koncie (tabela zgód, I) | zmiana wersji treści → baner wraca; rekord z wersją i datą | test jednostkowy `lib/analytics/consent.ts` | `A4` RUN-10 |
| ZG-07 | **Zgoda per osoba, nie per przeglądarka:** zgoda wyrażona anonimowo nie obejmuje automatycznie `identify`/`group` po zalogowaniu — przy pierwszym logowaniu potwierdzenie albo przyjęcie decyzji zapisanej przy koncie | brak `identify` bez decyzji zapisanej dla konta | test komponentu `analytics-identify.tsx` | `A1` ZGD-05 [R3] |
| ZG-08 | **Ponowienie pytania:** po zmianie wersji treści; okres ważności decyzji — `[N]` mies. (do decyzji; brak źródła okresu w repo) | — | — | `A1` ZGD-05 („decyzja nie wygasa”) |
| ZG-09 | **Treść warstwy pierwszej i drugiej:** cel, dostawca, region i transfery (PostHog — przechowywanie w UE, przetwarzanie także w US wg DPA [DOK-7]), okres (RT-POSTHOG), powiązanie z kontem i organizacją, sposób wycofania, link do polityki | kompletność wg tabeli § 12.3 | przegląd treści | `A1` ZGD-05 (brak okresu, `identify`, wycofania) |
| ZG-10 | **Technologie, które nie powinny wymagać zgody, bo znikają:** Material Symbols samohostowane (usunąć `fonts.googleapis.com`/`fonts.gstatic.com` z layoutu i CSP); service worker rejestrowany dopiero w panelu po zalogowaniu albo po akcji „Zainstaluj aplikację” | scenariusz `a`: 0 żądań do Google; brak SW na stronach marketingowych | uprząż `A4` | RUN-05, RUN-06, RUN-07 |
| ZG-11 | **Proxy telemetrii bez nagłówków przeglądarki:** `/ingest` i `/monitoring` przekazują tylko treść i `content-type` — bez `cookie`, `authorization`, `x-forwarded-*` | uprząż `e3`: brak nagłówka `cookie` w żądaniu do lokalnego odbiornika | uprząż `A4` krok `e3` | RUN-08 |
| ZG-12 | **Bez zgody aplikacja działa w pełni** (brak „cookie wall”) | wszystkie funkcje dostępne przy „Tylko niezbędne” | e2e | EROD 05/2020 [NZ] |
| ZG-13 | **Zdarzenia serwerowe spójne z wyborem** — wariant z L-03: bez profilu osoby albo honorowanie odmowy zapisanej przy koncie | brak zdarzeń z UUID osoby po odmowie (jeśli wybrano wariant „zgoda”) | test jednostkowy `trackServer` | `A1` MIN-08 |

### 12.2. Zachowanie przy braku zgody (stan docelowy roboczy)

| Technologia | Bez zgody | Po zgodzie | Po wycofaniu |
|---|---|---|---|
| PostHog (SDK, `/ingest`) | nie startuje (stan dziś) | `$pageview`/`$pageleave` z allowlisty, `persistence: 'memory'` | `opt_out` + `reset`; flaga SDK `0` |
| Sentry — błędy | do decyzji L-06 (lit. f) | jw. | jw. |
| Sentry — sesje i ślady w przeglądarce | wyłączone | włączone (jeśli ZG-01) | wyłączone od następnego wczytania |
| Fonty, service worker | nie dotyczy po ZG-10 | — | — |
| Turnstile | ładowany na formularzach uwierzytelnienia (ściśle niezbędny — propozycja) | jw. | jw. |

### 12.3. Lista technologii i proponowana klasyfikacja

Połączenie tabel `A1` („Tabela technologii przeglądarkowych”) i `A4` § 4.
Klasyfikacja to **propozycja do review** [NZ].

| Technologia | Rodzaj, okres (stan) | Kiedy | Proponowana klasyfikacja | Uwaga / zmiana |
|---|---|---|---|---|
| `sb-<ref>-auth-token` (+ części) | ciasteczko, 400 dni, `httpOnly: false` | po zalogowaniu | niezbędne co do sesji; **trwałość 400 dni — do review** | RT-SESJA |
| `sb-<ref>-auth-token-code-verifier` | ciasteczko | logowanie Google | niezbędne | — |
| `ksef.active_org` | ciasteczko, 30 dni, `httpOnly` | wybór organizacji | niezbędne | — |
| `ff_analytics_consent` | `localStorage`, bez terminu | decyzja w banerze | niezbędne (zapis wyboru) | rozszerzyć o wersję i datę (ZG-06) |
| `__ph_opt_in_out_<klucz>` | `localStorage` | po zgodzie | niezbędne do respektowania wyboru | zostaje po wycofaniu z `0` |
| `theme`, `ff.banner.dismissed.*`, `install-prompt-dismissed-at`, `ff:ksef-banner-dismissed` | `localStorage`/`sessionStorage` | działanie użytkownika w panelu | niezbędne (preferencja użytkownika) | wpisać do polityki |
| PostHog SDK + `/ingest` | pamięć | po zgodzie | **wymaga zgody** (stan dziś zgodny) | ZG-04, ZG-05, ZG-11 |
| Sentry SDK + `/monitoring` — błędy | brak zapisu; odczyt UA/ekranu | każda strona | **do decyzji** (lit. f + LIA L-06) | ZG-11 |
| Sentry — sesje i 10 % śladów | jw. | każda strona | **zgoda albo wyłączenie** | ZG-01, ZG-03 |
| Service worker `/sw.js` + Cache Storage (precache ok. 205 plików, runtime 7 dni) + IndexedDB `serwist-expiration` | rejestracja automatyczna | każdy odwiedzający | niezbędne tylko w panelu/PWA/push; dla stron marketingowych — **nie** | ZG-10 |
| Subskrypcja push | przeglądarka + wiersz w bazie | po kliknięciu | niezbędne (usługa żądana) | — |
| Cloudflare Turnstile | skrypt i ramka; zapis w domenie Cloudflare nieobserwowany | formularze uwierzytelnienia | niezbędne (bezpieczeństwo usługi żądanej) — propozycja | L-02 |
| Google Fonts (Material Symbols) | żądanie do Google | każda strona | **nie jest niezbędne** | usunąć (ZG-10) |
| Fonty `next/font/google` | samohostowane przy budowie | — | nie dotyczy | — |
| Logowanie Google, Stripe Checkout | przekierowanie | po kliknięciu | niezbędne / nie dotyczy | — |
| Supabase Realtime (WebSocket) | połączenie | panel | niezbędne | — |

## 13. Zestawienie: materiał → potrzeba → stan → kto zatwierdza

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

„Kto zatwierdza” podaje role, nie osoby: **właściciel produktu**
(operator; po ustaleniu podmiotu — `[OPERATOR]` jako administrator),
**prawnik** (końcowe review, zgodnie z pkt 1 zadania), **operator**
(odczyty produkcji i paneli). Żaden materiał nie jest przyjęty.

| § | Materiał | Czy potrzebny — uzasadnienie faktami | Stan materiału **[R5b]** | Kto zatwierdza |
|---|---|---|---|---|
| 1 | Rejestr czynności (administrator) | **tak (P)** — 16 ciągłych czynności FF-A (RA-01…RA-16); w repo brak (`A3` DOW-01); wyjątek art. 30 ust. 5 nie obejmuje przetwarzania niesporadycznego (ZR-55) [NZ] | projekt; luki: podmiot (N-01), mechanizmy transferu, retencje „do decyzji” | właściciel produktu po review prawnym |
| 2 | Rejestr kategorii czynności (procesor) | **tak (P)** — FF przetwarza dane kontrahentów klientów (`02` § 4.2; RP-01…RP-12); w repo brak | projekt; brak listy klientów i zapisu akceptacji umowy (`A1` ZGD-04) | właściciel produktu po review prawnym |
| 3 | Screening DPIA | **tak (P/O)** — funkcje AI spełniają ≥ 2 kryteria WP248 (DS-01, DS-02); `payment.score` przed włączeniem (DS-08); brak jakiejkolwiek oceny w repo (`A3` DOW-20); kwalifikacja kryteriów — do review (`08` Q-38) **[R5b]** | screening dla 9 operacji; szkielet DPIA funkcji AI (§ 3.3) — pełnej DPIA nie wykonano | właściciel produktu + prawnik (+ IOD, jeśli wyznaczony) |
| 4 | LIA | **tak (P/O)** — polityka powołuje lit. f bez LIA (`A1` ZGD-01); 6 celów z faktami | 6 projektów: 4 pozytywne pod warunkami (L-01, L-02, L-04, L-05 częściowo), 1 negatywny w obecnym kształcie (L-03), 1 mieszany (L-06); 5 celów bez LIA (§ 4, akapit końcowy) | prawnik; decyzje wariantów — właściciel produktu |
| 5 | TIA | **tak (P/O)** — Anthropic na SCC [DOK-3]; Resend wg polityki na SCC; pozostali zależnie od DPF (`04` § 4.2); deklaracja „SCC z każdym” bez dowodu (`04` PRC-02) | lista kontrolna 10 dostawców z pytaniami; żadnej TIA nie wykonano (brak umów i paneli) | właściciel produktu po odczycie umów/paneli (operator) + prawnik |
| 6 | Umowa powierzenia (szkielet) | **tak (P)** — każdy klient jest administratorem danych kontrahentów; strona RODO obiecuje DPA bez wzoru (`rodo/page.tsx:54-58`) | mapa 14 elementów na funkcje i luki; tekstu brak | prawnik (tekst); właściciel produktu (decyzje: terminy, automatyczne funkcje, retencja) |
| 7 | Lista dalszych procesorów | **tak (P)** — art. 28 ust. 2 i 4; lista w polityce nieaktualna (`04` PRC-01, PRC-05) | projekt 8 pozycji, w tym 4 zależne od decyzji (poz. 4, 5, 7, 8); nie do publikacji przed weryfikacją | właściciel produktu po weryfikacji umów + prawnik |
| 8 | Procedura żądań osób | **tak (P)** — osoby bez konta bez ścieżki (`A2` PRA-09); ewidencja wygasa z dziennikiem (PRA-11); ścieżka operatora nie działa (PRA-03) | projekt procedury, zakres wyszukiwania (21 pozycji magazynów), pola rejestru; brak narzędzia wyszukiwania i rejestru | właściciel produktu + prawnik (terminy dla FF-P do umowy) |
| 9 | Procedura naruszeń | **tak (P/S)** — runbooki nieaktualne, brak rejestru i ćwiczeń (`A3` DOW-03, `06` SOC-16); błędna deklaracja „72 h” (`A1` D-11); dyżur PARTIAL (F0-G08) | projekt procedury i rejestru; zależna od decyzji o dyżurze i od N-01 | właściciel produktu + prawnik; odbiorca alarmów (rola z F0-G08) — dyżur |
| 10 | Tabela decyzji retencyjnych | **tak (P)** — większość kategorii bez reguły (`02` INW-01, INW-03; `A2` E.0); faktury: bieg od dnia joba i blokada wyzwalaczem (RET-01, RET-02) | 32 pozycje (**[R5b]** dodana RT-KSEF), wszystkie „do podjęcia” | właściciel produktu + prawnik (dla FF-P — także klient przez umowę) |
| 11 | Wymagania treści polityki i informacji | **tak (P)** — placeholder administratora, nieaktualni odbiorcy i lokalizacje, błędne okresy (`A3` DOW-02, `A1` ZGD-03) | lista 20 wymagań polityki (1 spełnione — W-11), 11 pozycji strony RODO, 9 punktów zbierania | prawnik (tekst) po decyzjach z §§ 1, 4, 10, 12 |
| 12 | Specyfikacja zgody w przeglądarce | **tak (P/O)** — brak wycofania (`A4` RUN-03), sesje Sentry bez zgody (RUN-04), fonty Google i SW przed wyborem (RUN-05, RUN-06), ciasteczka do dostawców (RUN-08) | 13 wymagań z kryteriami akceptacji i testami na uprzęży `A4` | właściciel produktu (ZG-01, ZG-08, L-06) + prawnik (klasyfikacja) |
| — | **Potrzebne, nieprzygotowane w tym pliku:** ocena obowiązku wyznaczenia IOD (WYM-57); upoważnienia, zobowiązania do poufności i szkolenia (`A3` DOW-23); rejestr umów z dostawcami (`04` PRC-04, `06` SOC-18); pełna DPIA funkcji AI | wynikają z faktów jak w kolumnie obok; poza listą 12 materiałów zadania tego etapu | nie rozpoczęte | właściciel produktu + prawnik |

## 14. Niewiadome i ograniczenia

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

| ID | Niewiadoma | Źródło niewiadomej | Blokuje w tym pliku | Jak ustalić | N w `08` **[R5b]** |
|---|---|---|---|---|---|
| N-01 / N-INW-13 / N-PRC-11 | Podmiot prawny operatora | placeholder w polityce i regulaminie; `ai_todo.md` („przed założeniem firmy”) | §§ 1, 2, 6, 7, 9.3 (strona zgłoszenia), 11 (W-01) | decyzja właściciela | N-01 |
| N-PRC-01 | Umowy z dostawcami: strona, plan, wersja DPA, mechanizm transferu, terminy powiadomień o naruszeniach | brak dostępu do kont dostawców | §§ 1 (transfery), 5, 6 (wiersz 6), 7, 9.6 | właściciel produktu (konta dostawców) | N-07 |
| N-PRC-02 / NA1-02 | Ustawienia paneli: Sentry (IP, retencja), PostHog (IP, replay, AI), Resend (region, retencja, śledzenie), Anthropic (obszar roboczy, retencja) | panele niedostępne w tej sesji | §§ 3 (DS-04), 5, 10 (RT-SENTRY, RT-POSTHOG, RT-DOST) | odczyt operatora z datą | N-08, N-09, N-10 |
| N-PRC-03 / N-INW-04 | Zmienne produkcji (bez wartości): Stripe, AWS, Slack, Telegram, `UPSTASH_*`, `R2_ENDPOINT`, `ANTHROPIC_BASE_URL`, `EMAIL_UNSUBSCRIBE_SECRET` | brak dostępu do Coolify | § 1 (RA-04, RA-10), § 7 (poz. 7), § 10 (RT-FAKT) | lista nazw zmiennych | N-16 |
| N-PRC-07 | Plany subskrypcji agentów AI z dostępem do produkcji | dokumenty koordynacji bez planu | RA-16, RP-12, § 7 poz. 8 | właściciel produktu | N-14 |
| N-PRC-10 | Czy w produkcji są dane prawdziwych osób (deklaracja: brak klientów, KSeF TEST) i czy do testowego KSeF wysłano prawdziwe dane | deklaracja [PR225], niezweryfikowana | ocena skali (K5) w § 3; pilność § 9 | odczyt licznikowy | N-02 |
| N-INW-01 | Schemat i retencja `auth.*` GoTrue | schemat poza repo | RA-01, RT-AUTH, § 8.3 | odczyt schematu na `db-1` | N-18 |
| N-INW-06 / N-INW-15 / N-A2-12 | Retencja i zawartość logów Docker i `_supabase` | pomiar częściowy [PR225 @a72b567] | RA-09, RT-LOGI, § 8.3 | odczyt konfiguracji bez treści logów | N-20 |
| N-INW-16 / N-PRC-06 | Stan magazynów historycznych (Supabase Cloud, Inngest, Vercel, R2, Upstash) | checklista sprzątania niezaznaczona | RT-HIST, § 8.3 | panele (właściciel) | N-13 |
| N-A2-08 | Czy skrzynka pomocy przyjmuje pocztę | runbook z 1.10: brak MX | § 8.1, § 7 poz. 4 | odczyt DNS, e-mail testowy | N-12 |
| N-09-01 | Brzmienie wykazu Prezesa UODO z 2019 r. (liczba i treść punktów) | egress do `uodo.gov.pl` i `isap.sejm.gov.pl` zablokowany; ZR-20 [NZ] | § 3 (kolumna „Typy UODO”) | odczyt M.P. w końcowym review | N-38 |
| N-09-02 | Treść przepisów i wytycznych użytych w §§ 3–12 (RODO, PKE art. 398–400, OP, ustawa o VAT, WP248, EROD 9/2022, 01/2022, 01/2020, 1/2024) | egress zablokowany, WebSearch odrzucony | wszystkie terminy i podstawy oznaczone [NZ] | odczyt źródeł w końcowym review (`03` lista) | N-37 |
| N-09-03 | Czy FaktFlow musi wyznaczyć IOD | brak oceny (WYM-57) | § 1.1, § 3.3, § 9.6 | ocena prawna | Q-39 (pytanie, nie niewiadoma) |
| N-09-04 | Gotowość dyżuru i godziny reakcji | F0-G08 PARTIAL, TEST-06 NOT RUN [PR225] | § 9.6 | decyzja właściciela, ćwiczenie | N-06 |
| N-09-05 | Skala docelowa (liczba klientów i kontrahentów) | brak klientów | § 3 (K5), progi ponownego screeningu | plan sprzedaży | N-04 |

**Ograniczenia tego pliku.** Synteza raportów, nie nowe badanie:
fakty o kodzie pochodzą z raportów etapów (po recenzjach) i z czterech
kontrolnych `git grep` (§ 15). Brak dostępu do produkcji, paneli i umów.
Przepisy i wytyczne — z wiedzy modelu [NZ]. Pliki `05-…`, `07-…`, `08-…`,
`10-…` nie istniały w chwili pisania. **[R5b]** Odwołania do `05`, `07`,
`08` sprawdził recenzent R5b (13.10.2026); kolumna „N w `08`” podaje
odpowiedniki z `08` § 2.7. Plik przeszedł niezależną recenzję R5b („wymaga
poprawek”, bez uwag blokujących); uwagi naniesione przez redaktora
poprawek 13.10.2026 — zob. „Historia recenzji”. Autor nie zatwierdzał
własnego etapu.

**[R5b] Ograniczenia redakcji po R5b.** Redaktor poprawek nie miał
dostępu do produkcji ani paneli: zakres i retencja `ksef_sessions`
(RT-KSEF), stan tabel `stripe_*_attempts` i zachowanie SDK PostHog wobec
ustawień projektu (DS-04) opisano z kodu `3e5e00d`, bez odczytu
produkcji — rozstrzygają odczyty `07` D-03, D-06. Kwalifikacja kryteriów
WP248 (K4) i kwestia „DPIA wymagana” pozostają do review prawnego
(`08` Q-05, Q-38).

## 15. Co sprawdziłem / czego nie

> **PROJEKT ROBOCZY — do review prawnego i decyzji właściciela; nie jest
> dokumentem przyjętym ani wdrożonym.**

**Przeczytałem:** `BRIEF.md` (z addendami 1–3) i `00-ZADANIE.md`
w całości; `01-STAN-I-GRANICE.md` w całości; z pozostałych raportów —
sekcje potrzebne do materiałów (tabele inwentarza, role, odbiorcy,
deklaracje, tabele praw i retencji, AI, DPIA/LIA/TIA, procedury,
technologie, niewiadome, pytania) oraz „Historię recenzji” każdego
raportu; w recenzjach R1–R4 — wyszukiwanie odniesień do materiałów
roboczych (`R4.md`: wymóg potwierdzenia szkiców przez R5; R4-U03:
upoważnienia i szkolenia).

**Sprawdziłem w kodzie (`git grep`/`git show` na `3e5e00d`, 13.10.2026):**

| Sprawdzenie | Wynik |
|---|---|
| wywołania `setSentryUserContext` / `withSentryUserContext` poza `lib/observability/sentry-context.ts` | 0 — rozstrzyga sprzeczność `02`/`04` vs `A2` na korzyść `A2` (§ 0) |
| `buyerConsumerIdType` w `components/invoices/invoice-form.tsx` | `:437` ustawia `'pesel'` — potwierdza `A1` MIN-01 wobec `02` D-09 (§ 0) |
| kategorie w `ops/poczta/worker.mjs` | 6 kategorii (RODO, ZWROT, KSEF, DOSTEP, BLAD, SPRZEDAZ) + „inne”; brak kategorii bezpieczeństwa/naruszenia (`:14-27`) — nowe ustalenie użyte w § 9.1 |
| polityka prywatności: `UODO\|skarg`, `inspektor\|IOD\|DPO`, `zautomatyzowan` | skarga do UODO jest (`:200`); IOD i decyzje zautomatyzowane — brak (§ 11, W-02, W-11, W-13) |
| PR #225 `acceptance-plan.md` @`c2ab6a8`, wiersz F0-G08 | PARTIAL; brak gwarantowanych godzin reakcji i zastępcy; TEST-06 NOT RUN (§ 9.6) |

**Nie sprawdziłem / nie mogłem:** produkcji (baza, S3, logi, zmienne,
kopie), paneli i umów dostawców, treści przepisów i wytycznych w źródłach
pierwotnych (egress zablokowany; WebSearch nie używany zgodnie z decyzją
właściciela), statusu DPF dostawców, rzeczywistego działania skrzynki
pomocy. Nie uruchamiałem aplikacji ani testów. Nie zmieniałem kodu,
migracji ani konfiguracji; nie commitowałem i nie pushowałem. Nie
czytałem `docs/automation/` ani `.agents/`.

**[R5b] Sprawdzenia redaktora poprawek po recenzji R5b (13.10.2026)** —
każdą uwagę zweryfikowałem przed naniesieniem:

| Uwaga | Sprawdzenie | Wynik |
|---|---|---|
| R5b-U05 | `03` ZR-17 (art. 117 i 118); RT-DSAR; `08` Q-24 | potwierdzone — ujednolicone na „KC art. 117–118” |
| R5b-U11 | § 0 (pięć stanów); § 1.1, § 2.1, § 11.1 (8 komórek „brak zgodności”), § 13 | potwierdzone |
| R5b-U12 | `02:55` (D-04: „do usunięcia przez klienta (`ksef.credentials_removed`); brak reguły czasowej”); `lib/audit/log.ts:77`; `git grep ksef_sessions 3e5e00d` (tylko `00001_initial_schema.sql:105` i RLS `00002`, bez użycia w `lib/`, `app/`); `02` D-13; `00081…sql:20`, `00114…sql:21` (bez joba czyszczącego w `lib/`) | potwierdzone; RT-KSEF dopisana, RT-KONTR, RT-STRIPE, RT-DOST uzupełnione |
| R5b-U13 | § 3.1 (K4 „przykładowo dane finansowe [NZ]”, reguła „zwykle ≥ 2 → DPIA”); `08` Q-05, Q-38 | potwierdzone; poza DS-01, DS-02, DS-03, DS-06 ujednolicono też DS-08 (to samo „K4 spełnione”) |
| R5b-U14 | `A4` § 7; `lib/analytics/init-posthog-browser.ts:37,49`; brak `startSessionRecording` w kodzie | potwierdzone; ta sama teza poprawiona w `07` („Pozycje pilne”) |
| R5b-U15 | `04` PRC-17 (ujęcie warunkowe), deklaracja [PR225] o braku klientów | potwierdzone |
| R5b-U16 | `04` § 8.2 DOK-2 („polityka nie obejmuje treści przetwarzanych dla klientów biznesowych”) | potwierdzone |
| R5b-U17 | `grep` identyfikatorów `A1` w pliku | częściowo: § 6 w. 8, § 9 (wstęp), § 9.4 i § 13 w. 9 miały już przedrostek `A1`; bez przedrostka były § 11 (źródła, W-NN: 10 odwołań P-NN, akapit „Regulamin”) i § 6 w. 5 (D-03) — tam dopisano |
| R5b-U18 | `08` Q-07 (kwalifikacja dnia 8 i numer przepisu otwarte) | potwierdzone; dopisano też w RA-05 |
| R5b-U19 | `08` § 2.7 (wiersz `09` § 14); `R2-runda1.md` § 7 pyt. 2 | potwierdzone |
| R5b-U20 | gałąź PR #225 `docs/observability/data-policy.md:62-63`; `git grep -i "CREATE TABLE"` w migracjach `3e5e00d` (brak osobnej tabeli historii błędów faktur) | potwierdzone |

## Historia recenzji

| Recenzent | Data | Werdykt | Uwagi | Przyjęte | Odrzucone | Plik recenzji |
|---|---|---|---|---|---|---|
| R5b — niezależny agent-recenzent (grupa: `08` + `09`) | 13.10.2026 | wymaga poprawek, bez uwag blokujących (42 kontrole punktowe dla `08` i `09`; dla `09` 24 z 28 potwierdzonych, częściowe K39, K40, K42, obalona co do trybu K41) | 11 uwag do tego pliku: R5b-U11, U12, U13 (istotne), R5b-U05 (wspólna z `08`), U14 – U20 (drobne) | wszystkie 11 — R5b-U05, U11, U12, U13, U14, U15, U16, U17, U18, U19, U20; naniesione przez redaktora poprawek 13.10.2026 (miejsca oznaczone **[R5b]**). Doprecyzowania redaktora: U13 — ujednolicono także DS-08; U17 — część wskazanych miejsc miała już przedrostek, zmiany w § 11 i § 6 w. 5; U12 — liczba pozycji przekazana do `07` D-05 i `08` § 4.3 | — | `recenzje/R5b.md` (streszczenie w `10-REVIEW.md`) |
| R6a/R6b — niezależni krytycy kompletności | 13.10.2026 | kompletny z uwagami | R6a-U04 (ten wpis), R6b-U08 (DS-04, DS-05, DS-06, DS-09: „DPIA niewymagana” oznaczone jako wstępna ocena do potwierdzenia, `08` Q-05, Q-38; DS-05 — art. 87, `08` Q-28), R6b-U12 (propagacja uogólnienia, tabela telemetrii), R6b-U16 (recenzje w `recenzje/`) | przyjęte (naniesione przez redaktora R6 13.10.2026) | — | `recenzje/R6a.md`, `recenzje/R6b.md` |
