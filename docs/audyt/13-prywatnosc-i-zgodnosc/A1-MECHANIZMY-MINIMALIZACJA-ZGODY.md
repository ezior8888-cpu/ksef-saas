# A1 — Mechanizmy: minimalizacja, ustawienia domyślne, podstawy, informacje, zgody i cookies

| | |
|---|---|
| Etap | Mechanizmy aplikacji, pkt 5B i 5C zadania (`00-ZADANIE.md`) |
| Autor | agent MECHANIZMY-A |
| Data | 10.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza zawiera to scalenie; brak innych zmian w kodzie) |
| Zakres | B: konieczność pól i schematów, zakres odpowiedzi API i akcji, dostęp operatorów, domyślne udostępnianie, logi i błędy, Sentry, PostHog, dane testowe, pseudonimizacja i szyfrowanie. C: cele i proponowane podstawy, obowiązek informacyjny, akceptacja dokumentów, zgody produktowe, marketing, push, technologie przeglądarkowe, CSP, deklaracje stron prawnych |
| Źródła danych | kod aplikacji i workera, migracje `supabase/migrations/`, `next.config.ts`, `lib/security/csp.ts`, strony `app/(marketing)/legal/*`, testy w `tests/`, `docs/security/audyt/REJESTR-USTALEN.md` (SEC-*), `docs/security/ZGODA-NA-PRZYPOMNIENIA-2026-09-23.md`, kod `node_modules` (posthog-js, posthog-node, @supabase/ssr, @supabase/auth-js, @serwist/next) w zakresie zachowania SDK; `03-REJESTR-ZRODEL.md` (identyfikatory ZR-NN, WYM-NN); `02-INWENTARZ-I-PRZEPLYWY.md` (ustalenia INW-NN — odwołujemy się, nie dublujemy); PR #225 (niescalony) jako dowód pośredni |
| Ograniczenia | Tylko analiza statyczna kodu. Aplikacji nie uruchamiano (test przeglądarkowy robi agent RUNTIME, `A4-…`). Brak dostępu do produkcji, paneli PostHog/Sentry/Supabase i umów. Przepisy cytowane z wiedzy modelu: „niezweryfikowane online 2026-10-10 (egress zablokowany) — treść wg wiedzy modelu” (skrót **[NZ]**). Klasy: **P** obowiązek prawny, **O** interpretacja organu, **S** kryterium SOC 2, **I** praktyka inżynierska |
| Status | Ukończony etap autora; czeka na niezależne review (R3). 12 ustaleń MIN, 12 ustaleń ZGD |
| Najważniejsze wnioski | (1) Brak podstaw dokumentacyjnych: administrator to placeholder, brak mapy celów i podstaw, brak umowy powierzenia, polityka i strona RODO opisują inny system niż kod (ZGD-01, ZGD-02, ZGD-03, ZGD-12). (2) Zgoda na analitykę działa poprawnie przed wyborem, ale **nie da się jej wycofać** z interfejsu i nie ma dowodu zgody (ZGD-05). (3) Ustawienia domyślne: PESEL domyślnie przy fakturze konsumenckiej (MIN-01), link księgowej 90 dni (MIN-06), marketing e-mail w modelu „wypis zamiast zgody” (ZGD-06). (4) Przetwarzanie poza zgodą przeglądarkową: zdarzenia serwerowe PostHog z profilem, Sentry w przeglądarce, fonty Google, service worker dla każdego odwiedzającego (MIN-08, ZGD-10). (5) SEC-D-01, SEC-D-07, SEC-D-08 — zamknięte w kodzie; SEC-D-05 — częściowe. Zalecana kolejność: podmiot i umowa powierzenia → polityka z mapą celów → wycofanie zgody i dowód → ustawienia domyślne (PESEL, marketing, link księgowej) → telemetria poza zgodą → strona RODO |

## Sekcja B — Minimalizacja i ustawienia domyślne (MIN-NN)

Ryzyko oceniamy przy deklarowanym braku prawdziwych klientów (produkcja na
`KSEF_ENV=test`, PR #225 — deklaracja operatora). Po starcie z klientami
ryzyka oznaczone „średnie” rosną zwykle o jeden poziom. Ustalenia, które
pokrywa już `02-INWENTARZ-I-PRZEPLYWY.md`, tylko przywołujemy (INW-NN) i
dopisujemy to, czego tam nie ma.

### B.0. Podsumowanie

| ID | Ustalenie (skrót) | Stan | Ryzyko | Klasa |
|---|---|---|---|---|
| MIN-01 | Faktura dla osoby prywatnej: interfejs domyślnie wybiera PESEL i wymaga poprawnej sumy kontrolnej | brak (ustawienie domyślne niezgodne z minimalizacją) | średnie | P, I |
| MIN-02 | Rejestracja: „Imię i nazwisko” wymagane w formularzu, „opcjonalne” w polityce i na serwerze; dane trafiają do metadanych GoTrue, zadań i e-maili | częściowe | niskie | P, I |
| MIN-03 | Wyszukanie NIP w onboardingu ujawnia każdemu zalogowanemu nazwy organizacji, które już używają FaktFlow pod tym NIP | potwierdzone (kod) | średnie | P, I |
| MIN-04 | Zakres danych w odpowiedziach stron i akcji: `select('*')`, IP współpracowników w dzienniku, surowe komunikaty błędów | częściowe | niskie | P, I |
| MIN-05 | Dostęp operatorów: allowlista + TOTP, brak impersonacji; wgląd w metadane faktur i dane nabywcy bez śladu odczytu | częściowe | średnie | P, S, I |
| MIN-06 | Domyślne udostępnianie: link księgowej domyślnie 90 dni (do 365), linki do paczek 7 dni, podpisane URL 5–60 min | częściowe | średnie | P, I |
| MIN-07 | Logi i błędy: logger aplikacji bez redakcji, logger workera maskuje po nazwie pola, Sentry z filtrem (SEC-D-07 zamknięte w kodzie) | częściowe | niskie | P, I |
| MIN-08 | PostHog: SEC-D-01/02 zamknięte w kodzie; zdarzenia serwerowe i profile osób niezależnie od decyzji w przeglądarce; ustawienia projektu niespójne z kodem | częściowe | średnie | P, O, I |
| MIN-09 | Dane testowe: 10 numerów NIP z poprawną sumą kontrolną w testach, w tym co najmniej jeden NIP rzeczywistej spółki; adresy e-mail w realnych domenach | częściowe | niskie | I |
| MIN-10 | Szyfrowanie i skróty: poświadczenia KSeF dobrze szyfrowane z rotacją; skróty limitów i resetu hasła bez soli (pseudonimizacja, odwracalna słownikiem) | częściowe | niskie | P (art. 32), I |
| MIN-11 | „Anonimizacja” `audit_logs` to pseudonimizacja: zostają `tenant_id`, `entity_id`, `details_json` i wpisy o osobie zapisane przez innych | częściowe | średnie | P, I |
| MIN-12 | Martwy kod z danymi osobowymi i korekty do inwentarza (obrazy Google, formularz newslettera, kontekst Sentry z e-mailem) | potwierdzone (kod) | niskie | I |

### B.1. Konieczność pól w formularzach i schematach

| Formularz | Pola (dowód) | Wymagane | Potrzeba / ocena |
|---|---|---|---|
| Rejestracja e-mail | imię i nazwisko, e-mail, hasło (`app/(auth)/register/page.tsx:108-151`) | HTML: wszystkie `required` (`:117,130,142`); serwer: tylko e-mail i hasło (`register/actions.ts:27`) | Imię służy tylko do powitania w e-mailach (`register/actions.ts:81-89`). Wymaganie w HTML jest nadmiarowe → MIN-02 |
| Rejestracja Google | dane z profilu Google przez GoTrue (`app/(auth)/login/actions.ts:102`) | — | Zakres pobierany przez GoTrue nie jest określony w repo (konfiguracja serwera GoTrue) — niezweryfikowane |
| Onboarding — firma | NIP, nazwa, kod, miasto, ulica, nr budynku i lokalu (`components/onboarding/actions.ts:131-147`) | tak | Potrzebne do faktury (Podmiot1 FA(3)) — proporcjonalne. Wyszukanie NIP → MIN-03 |
| Dane firmy (ustawienia) | nazwa, 2 linie adresu (`lib/schemas/company-profile.ts:24-31`) | tak | Proporcjonalne; NIP nieedytowalny |
| Faktura — nabywca firma | NIP, nazwa, adres, e-mail opcjonalny (`lib/schemas/invoice-form.ts:150-172`) | adres tak, e-mail nie | Proporcjonalne; e-mail tylko do wysyłki |
| Faktura — osoba prywatna | typ identyfikatora, PESEL albo nr dowodu/paszportu, adres (`invoice-form.ts:82-87,173-175,262-286`) | po wybraniu PESEL — wymagany z sumą kontrolną | Wariant „Bez identyfikatora” istnieje, ale nie jest domyślny → MIN-01 |
| Kontrahent | NIP, nazwa, adres z rejestru (GUS/biała lista), e-mail (`components/invoices/actions.ts:183-195`, `app/actions/contractors.ts:44`) | — | Kolumna `contractors.phone` (`00004_phase6_ui.sql:59`) bez zapisu w kodzie (grep `phone`) — pole bez celu, por. INW-13 |
| OCR kosztu | cały obraz/PDF dokumentu do modelu (`lib/ocr/engine.ts:144-158`) | — | Nieodłączne dla funkcji (SEC-D-05); brak przycinania i informacji w UI → ZGD-08 |
| Czat pomocy | swobodny tekst, do 20 ostatnich tur do modelu (`app/api/support/chat/route.ts:45,105-139`) | — | Brak podpowiedzi „nie wklejaj danych osobowych” (`components/support/support-widget.tsx:295,334`) → ZGD-08 |
| Kontakt | brak formularza — tylko `mailto:` (`app/(marketing)/kontakt/page.tsx:36`, INW-14) | — | Nie dotyczy (brak zbierania przez aplikację) |
| Newsletter | e-mail + pole-pułapka `website` (`app/actions/newsletter.ts:23-41`) | tak | Minimalny zakres. Formularz nie jest osadzony na żadnej stronie → MIN-12, ZGD-06 |
| Powiadomienia push | endpoint, klucze, user agent do 500 znaków, typ i nazwa urządzenia (`app/actions/push-subscriptions.ts:39-51`) | — | Pełny user agent nie jest potrzebny do wysyłki; wystarczy typ urządzenia (I) |
| Link dla księgowej | imię/nazwa, e-mail, poziom dostępu, ważność (`components/settings/accountant-actions.ts:10-15`) | tak | Proporcjonalne; ważność → MIN-06 |

### MIN-01. Faktura dla osoby prywatnej domyślnie wymaga PESEL

- **Stan:** brak (ustawienie domyślne). **Klasa:** P — art. 25 ust. 2 i art. 5 ust. 1 lit. c RODO; art. 87 RODO (krajowy numer identyfikacyjny) [NZ]; I.
- **Dowód:** wybór „Osoba prywatna” ustawia `buyerConsumerIdType = 'pesel'` (`components/invoices/invoice-form.tsx:436-437`), lista rozwijana pokazuje PESEL jako wartość domyślną (`invoice-form.tsx:774`), a schemat odrzuca formularz bez poprawnego PESEL (`lib/schemas/invoice-form.ts:263-273`). Wariant „Bez identyfikatora (konsument)” istnieje (`types/invoice-types.ts:284`), ale trzeba go wybrać ręcznie. Serwer przyjmuje `no_id` tylko, gdy typ w ogóle nie przyszedł (`components/invoices/actions.ts:413`).
- **Korekta do `02-…`:** INW-05 podaje „Domyślny typ to brak ID (`actions.ts:413`)”. To dotyczy wyłącznie zapasowej wartości serwera; w interfejsie domyślny jest PESEL.
- **Luka:** użytkownik, który nie potrzebuje identyfikatora nabywcy, i tak jest prowadzony do wpisania PESEL; brak informacji, kiedy identyfikator jest potrzebny.
- **Ryzyko:** średnie — krajowy numer identyfikacyjny konsumenta trafia potem do kolumny, `fa3_data`, XML w S3, payloadu pg-boss i kopii (INW-05). Po starcie z klientami — wysokie.
- **Rekomendacja:** (I) domyślnie „Bez identyfikatora”, PESEL i dokument tylko po świadomym wyborze, z jednozdaniową podpowiedzią; test komponentu sprawdzający wartość domyślną. Czy przepisy o fakturowaniu w KSeF wymagają identyfikatora konsumenta — pytanie do review (§ pytania).

### MIN-02. Rejestracja: imię i nazwisko — wymagane w formularzu, „opcjonalne” w polityce

- **Stan:** częściowe. **Klasa:** P — art. 5 ust. 1 lit. c, art. 13 RODO (rzetelna informacja) [NZ]; I.
- **Dowód:** pole `name` ma etykietę „Imię i nazwisko” i atrybut `required` (`app/(auth)/register/page.tsx:110-119`); serwer go nie wymaga (`register/actions.ts:27`); polityka podaje „Imię (opcjonalnie)” (`legal/polityka-prywatnosci/page.tsx:32`). Wartość trafia do `user_metadata.full_name` w GoTrue (`register/actions.ts:70`), do payloadu zadania `userRegistered` razem z e-mailem (`register/actions.ts:84-90`) i do treści e-maili sekwencji próbnej (`lib/jobs/runners/email-sequence.ts:77-79,178-190`). Dodatkowo błąd GoTrue jest przekazywany w URL i wyświetlany dosłownie (`register/actions.ts:76`, `register/page.tsx:46`; analogicznie `login/page.tsx:45`) — to treść sterowana parametrem adresu, opisujemy jednym zdaniem zgodnie z `BRIEF.md`.
- **Luka:** formularz wymusza więcej, niż deklaruje polityka i niż potrzebuje usługa (powitanie może użyć części e-maila — już tak robi przy braku imienia, `register/actions.ts:81-82`).
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) pole „Imię (opcjonalnie)” bez `required` albo usunięcie; stałe komunikaty błędów zamiast odbicia tekstu z URL.

### MIN-03. Wyszukanie NIP ujawnia, które firmy korzystają z FaktFlow

- **Stan:** potwierdzone (kod). **Klasa:** P — art. 5 ust. 1 lit. f i art. 25 ust. 2 RODO (domyślne nieudostępnianie danych nieokreślonej liczbie osób) [NZ]; I.
- **Dowód:** `lookupNipAction` dla dowolnego poprawnego NIP zwraca listę istniejących organizacji z nazwą i informacją o weryfikacji KSeF (`components/onboarding/actions.ts:94-117`), czytaną kluczem serwisowym. Jedyne ograniczenie to limit 20 wyszukiwań na godzinę na użytkownika (`actions.ts:61-71`); komentarz AUD-59 opisuje ryzyko świadomie.
- **Luka:** każdy zweryfikowany użytkownik (rejestracja jest otwarta) dowiaduje się, że firma o danym NIP jest klientem FaktFlow, i poznaje nazwę nadaną organizacji przez klienta. Dla JDG nazwa często zawiera imię i nazwisko — to dana osobowa i informacja o relacji handlowej.
- **Ryzyko:** średnie — 480 wyszukiwań na dobę na konto, konta zakładane bez ograniczeń poza Turnstile i limitem IP.
- **Rekomendacja:** (I) zwracać tylko fakt „ten NIP ma już organizację w FaktFlow” bez nazw, a prośbę o dostęp kierować do właściciela bez ujawniania danych pytającemu; rozważyć wymóg dowodu związku z NIP (np. po weryfikacji KSeF).

### MIN-04. Zakres danych w odpowiedziach stron i akcji

- **Stan:** częściowe. **Klasa:** P — art. 5 ust. 1 lit. c RODO [NZ]; I.
- **Dowód:**
  - `select('*')` w 16 miejscach `app/` i `components/` (wynik `grep -rn "select('\*')"`), m.in. `app/(dashboard)/expenses/page.tsx:29` (całe wiersze do komponentu klienckiego), `app/(dashboard)/settings/notifications/page.tsx:20-26` (klucze `p256dh`/`auth` subskrypcji push trafiają do przeglądarki — właściciela, ale bez potrzeby), `app/(dashboard)/settings/audit/page.tsx:34-38` (pełne wpisy audytu, w tym IP współpracowników — INW-09).
  - Wzorce dobre, do powielenia: portal księgowej czyta tylko numer, datę, kwotę, status i kierunek faktury (`lib/accountant/load-accountant-portal.ts:70`); lista dostępów księgowej przechodzi przez `toPublicAccesses` (`app/(dashboard)/settings/accountant/page.tsx:56`).
  - Surowe komunikaty błędów bazy wracają do klienta w akcjach (`app/actions/organizations.ts:736,887,918,960,999`, `app/actions/reminders.ts:235`, `app/admin/users/actions.ts:44,77,196,240,278`) i na stronie dziennika (`settings/audit/page.tsx:55`). SEC-A-01 zamknął ten wzorzec w trasach `route.ts`, nie w akcjach serwerowych — opis jednym zdaniem.
  - Dane innych najemców: nie analizowaliśmy ponownie (zakres `docs/security/audyt/02-service-role.md` — 305 zapytań kluczem serwisowym, 0 krytycznych, 78 do przeglądu; SEC-C-05 `invoices_overdue` — migracja `00068` istnieje, stan produkcji nieznany).
- **Luka:** brak zasady „tylko kolumny potrzebne widokowi”; pojedyncze miejsca wysyłają do przeglądarki więcej niż wyświetlają.
- **Ryzyko:** niskie — dane należą do tej samej organizacji; wyjątek to IP i user agent współpracowników (INW-09).
- **Rekomendacja:** (I) jawne listy kolumn w zapytaniach dla komponentów klienckich; reguła lint/test na `select('*')` w `app/**/page.tsx`; stały komunikat + identyfikator błędu w akcjach.

### MIN-05. Dostęp operatorów do danych klientów

- **Stan:** częściowe. **Klasa:** P — art. 28 ust. 3 lit. b, art. 32 ust. 4 RODO [NZ]; S (kontrola dostępu, monitorowanie — identyfikatory w `06-SOC2.md`); I.
- **Dowód:** wejście do `/admin` wymaga e-maila z `ADMIN_EMAILS`, potwierdzonego adresu i zweryfikowanej sesji TOTP (`lib/auth/admin-guard.ts:13-53`). **Impersonacji nie znaleziono** (`grep -rn impersonat` — brak trafień). Operator widzi: listę wszystkich kont z e-mailami i organizacjami (`lib/admin/users.ts:70-87`), szczegóły konta i notatki (`users.ts:224-302`), metadane faktur z błędami wysyłki wraz z nazwą i NIP organizacji (`lib/admin/support.ts:176-184`), cykl życia faktury z nazwą i NIP nabywcy oraz treścią błędów (`lib/admin/ksef-lifecycle.ts:334-358`, `app/admin/ksef/[id]/page.tsx:165`), rozmowy supportu bez treści wiadomości (`lib/admin/support.ts:320-326`). Zapisy operatora są audytowane z e-mailem operatora w metadanych (`app/admin/users/actions.ts:55,86,249,287`); odczyty — nie (INW-15). `admin_user_notes` (`00045_admin_panel.sql:16-40`) — swobodny tekst o kliencie, bez retencji i bez eksportu w RODO (brak w `lib/gdpr/data-collector.ts`, grep). Klucz serwisowy w jobach i portalu — ocena w `docs/security/audyt/02-service-role.md`, nie dublujemy.
- **Luka:** brak śladu odczytów, brak przeglądu `ADMIN_EMAILS` (lista w zmiennej środowiskowej, bez historii zmian w repo), brak informacji dla klienta o zakresie dostępu operatora (umowa powierzenia nie istnieje w repo — ZGD-02).
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) zdarzenie audytu „admin.read” przy wejściu w szczegóły konta/faktury (bez kopiowania danych); okresowy przegląd listy operatorów zapisany jako dowód (S); retencja i eksport notatek operatora; opis dostępu operatora w umowie powierzenia.

### MIN-06. Domyślne udostępnianie: linki i podpisane adresy

- **Stan:** częściowe. **Klasa:** P — art. 25 ust. 2, art. 32 RODO [NZ]; I.
- **Dowód:**

| Mechanizm | Domyślnie | Dowód |
|---|---|---|
| Link dla księgowej (token-okaziciel w URL, w bazie tylko SHA-256) | ważność 90 dni, maks. 365; poziom „tylko podgląd” | `components/settings/accountant-list.tsx:147-150,251-254`, `accountant-actions.ts:10-15`, `lib/accountant/tokens.ts:7-16` |
| Paczka miesięczna dla księgowej | załączniki do 25 MB, powyżej linki podpisane 7 dni, także do adresów CC | INW-19 (`lib/jobs/runners/co-pilot-monthly.ts:43,486-494,563-579`) |
| Podpisany URL do XML/UPO | 300 s, `Cache-Control: private, no-store` | `lib/storage/r2.ts:498-517` |
| Podpisany URL do zdjęcia kosztu | 3600 s | `lib/storage/expenses.ts:101` |
| Zaproszenie do organizacji | token tylko jako SHA-256 | `00036_memberships_invitations.sql:57-58` |
| Publiczny link do faktury/PDF dla nabywcy | **nie znaleziono** (PDF tylko z sesją, `app/api/invoices/[id]/pdf/route.ts:5,27`) | grep, `lib/supabase/middleware.ts:28-52` |
| Share target PWA | wymaga zalogowania; zdjęcie idzie do OCR | `app/share-target/route.ts:21-42` |

- **Luka:** 90 dni dostępu przez sam link to długo jak na domyślną wartość; link działa dla każdego, kto go dostanie (przekazanie e-maila).
- **Ryzyko:** średnie — portal pokazuje listę faktur i pozwala generować eksporty (`app/api/portal/exports/generate/route.ts:48-64`).
- **Rekomendacja:** (I) domyślnie 30 dni z przypomnieniem o przedłużeniu; powiązanie linku z adresem e-mail księgowej (kod jednorazowy); paczki przez portal zamiast linków 7-dniowych (INW-19).

### MIN-07. Logi i błędy

- **Stan:** częściowe. **Klasa:** P — art. 5 ust. 1 lit. c i e, art. 32 RODO [NZ]; I.
- **Dowód:**
  - Logger aplikacji: `debug`/`info` tylko lokalnie, `warn`/`error` zawsze i bez redakcji (`lib/observability/logger.ts:8-27`).
  - Logger workera maskuje NIP (zostają 3 ostatnie cyfry) i e-mail po nazwie pola (`lib/jobs/logger.ts:13-36`); `Error` wypisuje pełny `message` (`logger.ts:40`).
  - 58 wywołań `console.*` w `app/`, `lib/`, `components/`; nie znaleziono wywołań z e-mailem, PESEL czy NIP w treści (grep wzorców `email|nip|buyer|pesel|name|phone|address` — trafienia tylko z `maskNip`, `bulk-validate-contractors.ts:82,91`). Podpisany XML KSeF logowany tylko przy `DEBUG_KSEF=1` i poza produkcją (`lib/ksef/auth.ts:181-184`).
  - Retencja logów kontenerów: deklaracja w PR #225 (`data-policy.md`: 7 dni, 10 MiB × 5) — przyjęta, niewdrożona, niezweryfikowana.
  - Sentry (SEC-D-07): wspólny filtr dla przeglądarki, Node i Edge — `sendDefaultPii: false`, `beforeSend`/`beforeSendTransaction`/`beforeSendSpan` z redakcją kluczy, adresów i parametrów URL, `enableLogs: false`, `beforeSendLog: () => null`, okruszki `console` i `ui.*` usuwane, `request.headers/cookies/data` pomijane, `user` sprowadzony do `id` (`lib/observability/scrub.ts:87-162`; użycie: `instrumentation-client.ts:5-21`, `sentry.server.config.ts`, `sentry.edge.config.ts`). Brak integracji Replay (grep `replayIntegration` — brak). `tracesSampleRate: 0.1` w przeglądarce i na serwerze.
- **Luka:** filtr Sentry rozpoznaje e-maile, tokeny i adresy, ale nie nazwiska, PESEL ani NIP w treści błędu (komentarz w `scrub.ts:104-106` to przyznaje); treść błędów KSeF i bazy może zawierać dane faktury. Ustawienia projektu Sentry (przechowywanie IP, retencja) — niezweryfikowane (PR #225: retencja Sentry nieodczytana).
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) logger aplikacji z tą samą redakcją co worker; w Sentry — maska wzorców PESEL/NIP w `scrubTelemetryText`; potwierdzenie w panelu Sentry opcji „nie przechowuj IP” jako dowód (S).

### MIN-08. PostHog: stan SEC-D-01/02 i przetwarzanie poza zgodą przeglądarkową

- **Stan:** częściowe. **Klasa:** P (art. 6, 21 RODO), O (wytyczne EROD o art. 5 ust. 3 dyrektywy 2002/58) [NZ]; I.
- **Dowód (przeglądarka):** inicjalizacja dopiero po zgodzie (`lib/analytics/init-posthog-browser.ts:13-24`); `autocapture: false`, `disable_session_recording: true`, `session_recording: { maskAllInputs: true, maskTextSelector: '*' }`, `capture_heatmaps: false`, `disable_external_dependency_loading: true`, `advanced_disable_flags: true`, `persistence: 'memory'`, `ip: false`, `before_send` z allowlistą zdarzeń i właściwości (`init-posthog-browser.ts:24-54`, `lib/analytics/privacy.ts:28-123`). Żaden kod nie wywołuje `startSessionRecording` (grep). W SDK flaga `disable_session_recording` blokuje nagrywanie niezależnie od konfiguracji zdalnej (`node_modules/posthog-js/lib/src/extensions/replay/session-recording.js:78-79`). **SEC-D-01 i SEC-D-02 — zamknięte w kodzie.**
- **Dowód (serwer):** `trackServer` wysyła zdarzenia z UUID użytkownika lub organizacji bez sprawdzania jakiejkolwiek decyzji (`lib/analytics/server.ts:7-38`): logowanie (`app/(auth)/login/actions.ts:73-77`), rejestracja z `$set: { plan }` — czyli profil osoby (`register/actions.ts:95-102`), zdarzenia Stripe (`lib/stripe/webhook-handlers.ts:103,142,249,332`), przyjęcie faktury z `distinctId = tenantId` (`lib/jobs/runners/submit-invoice.ts:1933-1940`; przekazany tam `internal_number` odrzuca allowlista — obrona działa, ale wywołanie przekazuje numer dokumentu). GeoIP w `posthog-node` domyślnie wyłączone (`@posthog/core/dist/posthog-core-stateless.js:112`).
- **Dowód (konfiguracja):** według PR #225 projekt PostHog ma włączone nagrania opt-in i heatmapy; kod ich nie używa, ale ustawienia projektu nie odpowiadają polityce danych.
- **Luka:** osoba, która w przeglądarce wybrała „Tylko niezbędne”, nadal ma profil w PostHog (UUID + plan + zdarzenia logowania); brak mechanizmu sprzeciwu (art. 21). Gdy zgoda jest, `identify(userId)` łączy zdarzenia przeglądarkowe z tym samym profilem (`components/analytics/analytics-identify.tsx:13-20`).
- **Ryzyko:** średnie — identyfikator pseudonimowy, ale stały i wiązany z kontem; polityka zapowiada to jako uzasadniony interes (`polityka-prywatnosci/page.tsx:243-246`), bez LIA w repo.
- **Rekomendacja:** (I) decyzja: zdarzenia serwerowe bez profilu osoby (`$process_person_profile: false`) albo honorowanie odmowy zapisanej po stronie konta; LIA (`07-…`); wyłączenie nagrań i heatmap w ustawieniach projektu PostHog z zapisem jako dowód.

### MIN-09. Dane testowe

- **Stan:** częściowe. **Klasa:** I (zasada z `AGENTS.md`: „NIE używam prawdziwych NIP-ów w testach (fikcyjny testowy: `1234567890`)”).
- **Dowód:** skrypt sprawdzający sumę kontrolną NIP (wagi 6-5-7-2-3-4-5-6-7) po `tests/`, `e2e/`, `scripts/`, `lib/xml/` znalazł 10 różnych numerów z poprawną sumą, w tym dwa występujące w 83 i 58 plikach (np. `lib/xml/fa3-generator.test.ts`, `lib/xml/validator.test.ts`). Co najmniej jeden (`tests/unit/biala-lista-awaria-api.test.ts`) to według wiedzy modelu NIP dużej spółki giełdowej — dane podmiotu, nie osoby. Przynależności pozostałych nie sprawdziliśmy (rejestry blokowane przez egress). Adresy e-mail w testach są w większości w domenach zastrzeżonych (`example.test`, `example.invalid` — 239 wystąpień), ale część w realnych domenach (`biuro.pl` — 28, pojedyncze `firma.pl`, `nowak.pl`, `x.com`). `scripts/seed-tenant.ts:49-58` bierze NIP ze zmiennej `KSEF_TEST_NIP` — poza repo.
- **Luka:** zasada z `AGENTS.md` nie jest egzekwowana; jeśli któryś NIP należy do JDG, repo publiczne zawiera daną osobową; testy wysyłki mogłyby trafić na realne adresy, gdyby atrapa transportu zawiodła.
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) test-strażnik odrzucający NIP z poprawną sumą kontrolną spoza listy dozwolonych numerów testowych; e-maile wyłącznie w `*.test`/`*.invalid`/`example.*`.

### MIN-10. Szyfrowanie, skróty i oddzielenie kluczy

- **Stan:** częściowe. **Klasa:** P — art. 32 ust. 1 lit. a RODO (pseudonimizacja i szyfrowanie jako środki) [NZ]; I.
- **Dowód:**

| Dane | Mechanizm | Ocena | Dowód |
|---|---|---|---|
| Poświadczenia KSeF | AES-256-GCM, klucz rekordu z HKDF i soli rekordu, AAD = id organizacji, odcisk klucza, rotacja przez `…_PREVIOUS` i skrypt | potwierdzone; dobra praktyka | `lib/ksef/credentials-crypto.ts:10-89`, `scripts/reencrypt-ksef-credentials.ts` |
| Kody zapasowe MFA | scrypt z solą na kod | potwierdzone | `lib/auth/backup-codes.ts:42-46`, `00050_mfa_recovery_codes.sql:19` |
| Tokeny: księgowa, zaproszenia, anulowanie usunięcia | SHA-256 losowego tokenu (≥ 32 B) | potwierdzone; SEC-C-04 zamknięte migracją `00072_gdpr_cancel_token_hash.sql:57` (stan produkcji nieznany) | `lib/accountant/tokens.ts:7-16`, `lib/gdpr/deletion.ts:112,133` |
| Link wypisu | HMAC-SHA256 osobnym sekretem `EMAIL_UNSUBSCRIBE_SECRET` (≥ 32 znaki), ważność 90 dni | potwierdzone | `lib/email/unsubscribe-token.ts:13-46` |
| Klucze limitów prób (IP, e-mail) | SHA-256 bez soli, 32 znaki | pseudonimizacja; IPv4 i znane e-maile odwracalne słownikiem (INW-16) | `lib/rate-limit/index.ts:130-135` |
| Ślad „reset hasła” w audycie | SHA-256 e-maila bez soli, 16 znaków | pseudonimizacja, nie anonimizacja; e-mail rozpoznawalny przez porównanie | `app/(auth)/forgot-password/actions.ts:48` |
| PESEL, nr dokumentu nabywcy | jawny tekst, trzy kopie w wierszu | brak szyfrowania kolumnowego (INW-05) | `00012…sql:66-68` |
| Szyfrowanie bazy i S3 w spoczynku | nie znaleziono konfiguracji w repo | niezweryfikowane (ZGD-12, deklaracja „AES-256”) | — |

- **Oddzielenie kluczy:** wszystkie sekrety (klucz KSeF, HMAC wypisu, klucz serwisowy Supabase) są zmiennymi środowiskowymi tej samej aplikacji i workera; brak KMS i brak rozdzielenia ról (nie znaleziono w repo). Dla kopii (`pg_dump`) — klucz KSeF nie jest w zrzucie, więc szyfrogramy poświadczeń w kopii są chronione, o ile kopia nie leży obok zmiennych środowiskowych (lokalizacja: INW-04, niezweryfikowane).
- **Luka:** skróty bez klucza nazywane w kodzie i polityce ochroną/anonimizacją; brak szyfrowania kolumnowego dla PESEL.
- **Ryzyko:** niskie (poza PESEL — INW-05).
- **Rekomendacja:** (I) HMAC z osobnym kluczem zamiast gołego SHA-256 dla IP i e-maili; szyfrowanie kolumnowe albo jedna kopia PESEL; rejestr kluczy z właścicielem i procedurą rotacji (S).

### MIN-11. „Anonimizacja” dziennika audytu to pseudonimizacja

- **Stan:** częściowe. **Klasa:** P — motyw 26 i art. 4 pkt 5 RODO (różnica pseudonimizacja/anonimizacja), art. 17 [NZ]; O (opinia WP29 05/2014 o technikach anonimizacji [NZ]); I.
- **Dowód:** `anonymize_user_audit_logs` ustawia `user_id`, `ip_address`, `user_agent` na NULL i zastępuje `metadata` znacznikiem czasu (`00052_audit_logs_immutable_trigger.sql:95-121`). Zostają: `tenant_id`, `entity_type`, `entity_id`, `action`, `created_at` i **`details_json`** (kolumna z `00001…sql:169`, zapisywana przez RPC `ksef_send_audit`, `00131_ksef_send_lifecycle.sql:134`). Funkcja dotyczy tylko wierszy, w których osoba była **aktorem**; wpisy o niej zapisane przez innych zostają: e-mail zaproszonego (`app/actions/organizations.ts:710`), adres odbiorcy faktury (`components/invoices/actions-detail.ts:522`), `targetUserId` w akcjach operatora (`app/admin/users/actions.ts:287`), NIP usuniętego kontrahenta (`app/actions/contractors.ts:122`), NIP i nazwa firmy (`organizations.ts:518`). Uprawnienie wywołania odebrane `anon`/`authenticated` w `00069_audit_permission_hardening.sql:23-25` (SEC-C-06; stan produkcji nieznany). Ścieżka usunięcia przez operatora funkcji nie woła (INW-02).
- **Ocena reidentyfikacji:** w organizacji jednoosobowej (typowa JDG) `tenant_id` + czas + rodzaj akcji wskazują osobę bez `user_id`; organizacja nie jest usuwana razem z kontem, gdy zostaje inny członek albo faktury podlegają retencji. Wynik to dane spseudonimizowane, nadal osobowe.
- **Luka:** polityka obiecuje „zanonimizowanie” (`polityka-prywatnosci/page.tsx:183-188,221-224`), kod tego nie zapewnia.
- **Ryzyko:** średnie — rozjazd deklaracji i stanu dla żądań z art. 17.
- **Rekomendacja:** (I) zerowanie także `details_json` i wpisów, w których osoba występuje w metadanych (indeks po `metadata->>'email'`/`recipient` albo zapis identyfikatora zamiast e-maila); w polityce słowo „pseudonimizacja”, chyba że review prawne uzna inaczej; test na bazie (`tests/rls-*`) sprawdzający wszystkie kolumny po wywołaniu.

### MIN-12. Martwy kod z danymi osobowymi i korekty do inwentarza

- **Stan:** potwierdzone (kod). **Klasa:** I.
- **Dowód:**
  - Obrazy z `lh3.googleusercontent.com`: stałe w `components/dashboard/ff-assets.ts:2-6` i `lib/blog-marketing-data.ts:3-10` **nie mają importerów** (grep `FF_DASHBOARD_`, `BlogArticleCard`, `enrichBlogPost` — tylko definicje). **Korekta do INW-11:** obrazy Google nie są dziś ładowane; ładowany jest tylko arkusz fontu Material Symbols (`app/layout.tsx:114-125`). `next.config.ts:92-100` nadal dopuszcza ten host w `next/image`.
  - Formularze newslettera `BlogNewsletter` i `BlogNewsletterForm` nie są osadzone na żadnej stronie (grep importów — brak); `BlogNewsletter` ma atrapę „Zapisano — sprawdź skrzynkę” bez backendu (`components/marketing/blog-newsletter.tsx:6-10,25-36`).
  - `setSentryUserContext` z e-mailem — bez wywołań (INW-08); `getExperimentVariant` (flagi PostHog po stronie serwera) — bez wywołań (`lib/analytics/experiments.ts:35-48`, grep).
- **Luka:** kod gotowy do „cichego” włączenia przetwarzania bez oceny.
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) usunąć martwe moduły albo oznaczyć testem-strażnikiem (wzór: `tests/unit/flo-nieaktywne.test.ts`); usunąć `lh3.googleusercontent.com` z `remotePatterns`.

### B.2. Stan ustaleń SEC-D z `docs/security/audyt/REJESTR-USTALEN.md` w kodzie `3e5e00d`

| ID | Treść (skrót) | Stan w rejestrze | Stan w kodzie (nasza weryfikacja) | Dowód |
|---|---|---|---|---|
| SEC-D-01 | Nagrania PostHog nie maskowały tekstu | otwarte → „naprawy 10.09” | **zamknięte w kodzie**: nagrania wyłączone, `maskTextSelector: '*'`, brak ładowania rozszerzeń; ustawienia projektu PostHog (nagrania opt-in, heatmapy — PR #225) niespójne z kodem | `init-posthog-browser.ts:36-48`, `session-recording.js:78-79` |
| SEC-D-05 | OCR wysyła dokument do Anthropic — musi być w rejestrze i polityce | otwarte | **częściowe**: polityka wymienia Anthropic tylko dla OCR z deklaracją „nie są przechowywane” (niezweryfikowana); brak czatu pomocy i klasyfikacji KPiR; brak informacji w UI | `polityka-prywatnosci/page.tsx:106-109`, ZGD-08 |
| SEC-D-07 | Filtr Sentry pomijał transakcje, spany, logi i Edge | „naprawy 10.09” | **zamknięte w kodzie** (wspólne `sentryPrivacyOptions` w trzech konfiguracjach); ograniczenie: regex nie rozpoznaje całego PII | `scrub.ts:153-162`, MIN-07 |
| SEC-D-08 | Service worker zapisywał prywatne API/RSC/HTML | „naprawy 10.09” | **zamknięte w kodzie**: cache tylko `/_next/static/*` i `/favicon/*` bez parametrów, reszta `NetworkOnly`, stare cache usuwane przy aktywacji; stan cache w przeglądarkach użytkowników po aktualizacji — niezweryfikowane | `app/sw.ts:16-42`, `lib/security/service-worker-cache.ts:5-30` |

## Sekcja C — Podstawy, informacje, zgody i cookies (ZGD-NN)

Oznaczenia ról jak w `02-…` § 4: **FF-A** — FaktFlow jako administrator
(konta, billing, marketing, telemetria, support), **FF-P** — FaktFlow jako
podmiot przetwarzający dane w dokumentach klientów (nabywcy, kontrahenci,
dłużnicy, KPiR). Źródła prawa podajemy identyfikatorami z
`03-REJESTR-ZRODEL.md` (ZR-NN) i wymaganiami (WYM-NN); wszystkie
„niezweryfikowane online 2026-10-10 (egress zablokowany) — treść wg wiedzy
modelu” [NZ].

### C.0. Podsumowanie

| ID | Ustalenie (skrót) | Stan | Ryzyko | Klasa |
|---|---|---|---|---|
| ZGD-01 | Brak udokumentowanej mapy cel → podstawa; polityka podaje trzy podstawy ogólnie, bez zgody (analityka), bez marketingu, bez LIA | brak | wysokie | P, O |
| ZGD-02 | Rola procesora nieopisana: brak umowy powierzenia w regulaminie i w repo, polityka traktuje dane kontrahentów jak „Twoje dane” | brak | wysokie | P |
| ZGD-03 | Polityka prywatności: placeholder administratora, nieaktualni i pominięci odbiorcy, niepełne cele, sprzeczne okresy | brak zgodności | wysokie | P |
| ZGD-04 | Akceptacja regulaminu i polityki: tylko zdanie pod formularzem, brak zapisu wersji i chwili; rejestracja przez Google z ekranu logowania bez żadnej informacji; dokumenty bez wersji | brak | średnie | P, S, I |
| ZGD-05 | Zgoda na analitykę: brak startu przed zgodą i równorzędna odmowa — tak; **brak wycofania w UI**, brak dowodu i wersji, zgoda per przeglądarka | częściowe | średnie | P, O |
| ZGD-06 | Marketing: model „wypis zamiast zgody” dla kategorii `marketing` i `product_updates`; e-maile próbne z treścią promocyjną bez linku wypisu w treści; newsletter bez potwierdzenia i bez osadzonego formularza | częściowe | średnie | P, O |
| ZGD-07 | Zgody produktowe: „zgoda” na przypomnienia to polecenie klienta (żeton), działa zgodnie z dokumentem; push — świadome włączenie; brak przełącznika AI-kategoryzacji | częściowe | niskie | P, I |
| ZGD-08 | Funkcje AI (czat, OCR, kategoryzacja) bez informacji przy użyciu, że treść trafia do zewnętrznego modelu | brak | średnie | P, O |
| ZGD-09 | Osoby bez konta (nabywcy, dłużnicy, zaproszeni, księgowe): wiadomości bez żadnej informacji o przetwarzaniu i bez wsparcia klienta w obowiązku art. 14 | brak | średnie | P |
| ZGD-10 | Technologie przeglądarkowe bez zgody: arkusz fontu Google przy każdej wizycie, Sentry w przeglądarce, service worker rejestrowany każdemu odwiedzającemu | częściowe | średnie | P, O |
| ZGD-11 | Cookies sesji Supabase: 400 dni, dostępne dla skryptu; polityka deklaruje „do zamknięcia przeglądarki” | brak zgodności | niskie | P, I |
| ZGD-12 | Strona „RODO i bezpieczeństwo”: 7 z 9 deklaracji nieprawdziwych, nieweryfikowalnych albo mylących | brak zgodności | wysokie | P |

### ZGD-01. Brak mapy cel → podstawa i testów uzasadnionego interesu

- **Stan:** brak. **Klasa:** P — art. 5 ust. 2, art. 6 ust. 1, art. 13 ust. 1 lit. c–d RODO (ZR-01); O — EDPB 2/2019 o lit. b (ZR-51), TSUE C-252/21 (ZR-63), EDPB 1/2024 o lit. f — wersja konsultacyjna (ZR-42) [NZ]. Wymagania WYM-11, WYM-12.
- **Dowód:** polityka wymienia trzy podstawy bez przypisania do celów: lit. b „świadczenie usługi”, lit. c „archiwizacja faktur 10 lat”, lit. f „bezpieczeństwo, zapobieganie nadużyciom” (`legal/polityka-prywatnosci/page.tsx:58-72`). Analityka po zgodzie pojawia się tylko w sekcji cookies (`page.tsx:236-247`), bez wskazania lit. a; zdarzenia serwerowe opisano jako „uzasadniony interes … zgodnie z opisem w dokumentacji technicznej produktu” (`page.tsx:243-246`) — takiej dokumentacji LIA nie znaleziono w repo (grep `LIA`, `uzasadnion` w `docs/`). Nie znaleziono rejestru czynności przetwarzania (zakres `A3-…`).
- **Luka:** cele widoczne w kodzie (tabela niżej) nie mają przypisanej podstawy; lit. f bez testu trzech kroków i bez obsługi sprzeciwu; lit. c dla faktur dotyczy obowiązku **klienta**, nie FaktFlow (FF-P, WYM-68).
- **Ryzyko:** wysokie — bez mapy nie da się poprawnie napisać polityki, umowy powierzenia ani obsłużyć sprzeciwu.
- **Rekomendacja:** przyjąć tabelę „cel → proponowana podstawa” z tego pliku jako szkic rejestru; LIA dla: zdarzeń serwerowych PostHog, Sentry, audytu z IP/UA, eskalacji do Slacka, wspólnej pamięci podręcznej rejestrów (`validation_cache`); decyzje zatwierdza review prawne.

### ZGD-02. Rola podmiotu przetwarzającego bez umowy powierzenia

- **Stan:** brak. **Klasa:** P — art. 28 ust. 3, 4, 9 RODO (ZR-01); O — EDPB 07/2020 (ZR-32), opinia 22/2024 (ZR-41) [NZ]. WYM-41 – WYM-46.
- **Dowód:** regulamin nie zawiera postanowień o powierzeniu (`legal/regulamin/page.tsx:88-100` — tylko hosting i 30 dni na eksport); strona RODO: „oferujemy DPA dla każdej umowy. Pobierz pdf z [e-mail]” (`legal/rodo/page.tsx:54-58`) — wzoru umowy nie ma w repo (grep „umowa powierzenia”, „DPA” w `docs/` — tylko wzmianki w `docs/security/rto-rpo.md:144` i `PLAN-ODPORNOSCI-CYBER.md:113` „z prawnikiem ustalić”). Polityka opisuje faktury i kontrahentów jako dane zbierane „przy korzystaniu z usługi” (`polityka-prywatnosci/page.tsx:34-42`), czyli jak dane, których administratorem jest FaktFlow.
- **Luka:** brak instrukcji klienta (art. 28 ust. 3 lit. a), listy dalszych procesorów i zasad ich zmiany (art. 28 ust. 2), opisu dostępu operatora (MIN-05), pomocy w realizacji praw osób (art. 28 ust. 3 lit. e) i zasad zwrotu/usunięcia po zakończeniu umowy (lit. g).
- **Ryzyko:** wysokie przed startem z klientami — każdy klient-przedsiębiorca jest administratorem danych swoich kontrahentów i potrzebuje umowy.
- **Rekomendacja:** umowa powierzenia jako załącznik do regulaminu (wzór — np. klauzule z decyzji 2021/915, ZR-05), z listą dalszych procesorów z `04-…`; polityka rozdzielona na część FF-A i informację o roli FF-P.

### ZGD-03. Polityka prywatności nie opisuje faktycznego przetwarzania

- **Stan:** brak zgodności. **Klasa:** P — art. 13 ust. 1–2, art. 14 RODO (ZR-01); O — wytyczne WP260 (ZR-47) [NZ]. WYM-18, WYM-19. Rozszerza INW-17.
- **Dowód (wybór; pełne zestawienie w tabeli „Deklaracje…”):** administrator „[nazwa firmy], NIP [TWÓJ_NIP]” (`page.tsx:20-21`); odbiorcy: Supabase (Frankfurt), Cloudflare R2, Vercel, Inngest (`page.tsx:85-116`) — kod: self-hosted Supabase, MinIO, pg-boss, brak Vercela (`lib/feature-flags/global-flags.ts:4` — „ostatnia zależność od Vercela” zastąpiona); brak w polityce: PostHog jako odbiorca (tylko wzmianka w sekcji cookies), Slack (eskalacja z e-mailem, `lib/support/support-actions.ts:76-83`), Telegram (alerty), Google (OAuth i fonty), Cloudflare Email Routing (INW-07), GUS/VIES/biała lista (`lib/gus/client.ts`, `lib/validation/vies-client.ts`, `whitelist-client.ts`); Anthropic opisany tylko dla OCR z twierdzeniem „nie są przechowywane przez Anthropic” (`page.tsx:106-109`) — bez czatu pomocy i klasyfikacji KPiR; okresy: „Cookies sesji: do końca sesji” (`page.tsx:232`) vs 400 dni (ZGD-11), „Dane konta: do 30 dni po anulowaniu” (`page.tsx:229`) — brak mechanizmu (INW-02), „Faktury: 10 lat (art. 70 § 1 OP)” (`page.tsx:230`) — przepis wg ZR-14 daje 5 lat (WYM-68); prawa: „Sprzeciwu (możesz w każdej chwili zrezygnować)” (`page.tsx:199`) miesza sprzeciw z wycofaniem zgody, brak informacji o prawie wycofania zgody (art. 13 ust. 2 lit. c) i o źródle danych osób trzecich (art. 14 ust. 2 lit. f). Data „Ostatnia aktualizacja: 9 maja 2026” (`page.tsx:16`); historii zmian przed 2.10.2026 nie da się odczytać (klon płytki: `git rev-parse --is-shallow-repository` → `true`).
- **Luka:** osoby nie wiedzą, kto jest administratorem, kto dostaje ich dane i jak długo są przechowywane.
- **Ryzyko:** wysokie — obowiązek informacyjny jest warunkiem rzetelnego przetwarzania; dziś niespełniony co do tożsamości administratora.
- **Rekomendacja:** przepisać politykę po ustaleniu podmiotu (N-01 w `08-…`), z tabelą celów i podstaw z tego pliku, listą odbiorców z `04-…`, harmonogramem retencji z `A2-…`; wersjonowanie (ZGD-04).

### ZGD-04. Akceptacja regulaminu i polityki — brak zapisu, brak wersji

- **Stan:** brak. **Klasa:** P — art. 8 UŚUDE (udostępnienie regulaminu przed zawarciem umowy, ZR-12) [NZ]; art. 13 RODO (informacja w chwili zbierania); S — dowód akceptacji warunków (identyfikatory w `06-SOC2.md`); I. WYM-15, WYM-17.
- **Dowód:** pod formularzem rejestracji jest zdanie „Rejestrując się akceptujesz regulamin i politykę prywatności” (`app/(auth)/register/page.tsx:164-173`) — bez pola wyboru i bez zapisu; `signupWithEmail` nie zapisuje wersji ani chwili akceptacji (`register/actions.ts:22-123`); w migracjach brak kolumn `terms_*`, `policy_version`, `consent` (grep — brak trafień). Konto Google zakłada się także z ekranu logowania (`app/(auth)/login/page.tsx:66,91`; komentarz „pierwsze logowanie Google zakłada konto” — `register/page.tsx:49-50`), gdzie nie ma żadnej informacji o regulaminie ani polityce (grep `regulamin|polityk` w `login/page.tsx` — brak). Dokumenty mają tylko datę w treści, bez numeru wersji; regulamin zmienił się merytorycznie 1.10.2026 (okres próbny z kartą, cena — commit `a4529fb`), a nadal podaje „Ostatnia aktualizacja: 1 maja 2026” (`regulamin/page.tsx:18`). Strona RODO nie ma daty.
- **Luka:** nie da się wykazać, którą wersję regulaminu zaakceptował użytkownik, ani poinformować o zmianach; „akceptacja polityki prywatności” myli informację z oświadczeniem woli (O).
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) tabela `legal_acceptances` (użytkownik, dokument, wersja, skrót treści, chwila, kanał) zapisywana przy rejestracji e-mail i przy pierwszym logowaniu Google (ekran potwierdzenia przed utworzeniem organizacji); w treści: „Zapoznałem się z polityką” zamiast „akceptuję”; numer wersji i data na każdej stronie prawnej; procedura powiadamiania o zmianach regulaminu.

### ZGD-05. Zgoda na analitykę w przeglądarce

- **Stan:** częściowe. **Klasa:** P — art. 399–400 PKE (ZR-11), art. 5 ust. 3 dyr. 2002/58 (ZR-02), art. 4 pkt 11 i art. 7 ust. 1 i 3 RODO [NZ]; O — EDPB 05/2020 (ZR-31), raport Cookie Banner Taskforce (ZR-40), TSUE C-673/17 Planet49 (ZR-62) [NZ]. WYM-13, WYM-14, WYM-63 – WYM-65.
- **Dowód — co działa:**

| Wymóg | Stan w kodzie | Dowód |
|---|---|---|
| Brak inicjalizacji i żądań PostHog przed wyborem | potwierdzone (kod); zachowanie sieciowe — `A4-…` | `init-posthog-browser.ts:13-24,67-73` (bez zgody `syncPosthogConsent` kończy się przed `posthog.init`) |
| Odmowa równie łatwa jak zgoda | potwierdzone — „Akceptuję” i „Tylko niezbędne” na pierwszej warstwie, zamknięcie „X” = odmowa | `components/analytics/consent-banner.tsx:60-84` |
| Brak pól zaznaczonych domyślnie | potwierdzone | `consent-banner.tsx` — brak pól wyboru |
| Treść: cel, dostawca, region, link do polityki | częściowe — brak okresu przechowywania, informacji o powiązaniu z kontem (`identify`) i o wycofaniu | `consent-banner.tsx:47-57`, `analytics-identify.tsx:13-20` |
| Po zgodzie: brak nagrań, autocapture, ciasteczek | potwierdzone — `persistence: 'memory'`; w `localStorage` zostaje tylko flaga SDK `__ph_opt_in_out_<klucz>` | `init-posthog-browser.ts:28-38`; `node_modules/posthog-js/lib/src/consent.js:8,56-58` i domyślne `opt_out_capturing_persistence_type: 'localStorage'` (`posthog-core.js:120`) |

- **Dowód — luki:**
  - **Wycofanie niemożliwe z interfejsu.** `setAnalyticsConsent` wywołuje wyłącznie baner (`consent-banner.tsx:36,40`; grep w `app`, `components`, `lib`, `hooks`), a baner znika po pierwszym wyborze (`consent-banner.tsx:28-33` — widoczny tylko przy `unset`). Nie ma linku „ustawienia prywatności” w stopce ani w ustawieniach konta (grep `cookie|prywatno` w `components/marketing`, `components/dashboard`, `app/(dashboard)/settings` — brak). Polityka nie mówi, jak wycofać zgodę. Mechanizm wycofania w kodzie istnieje (`init-posthog-browser.ts:14-19` — `stopSessionRecording` i `opt_out_capturing`), ale nie ma go jak uruchomić poza ręcznym czyszczeniem danych witryny.
  - **Wycofanie nie czyści profilu.** Nawet po wycofaniu wcześniejsze zdarzenia i profil osoby (z `identify`) zostają w PostHog; `posthog.reset()` nie jest wywoływany (grep).
  - **Brak dowodu i wersji.** Zapis to tylko `granted`/`denied` w `localStorage` (`lib/analytics/consent.ts:2,27-37`), bez daty, wersji treści banera i bez zapisu po stronie serwera.
  - **Zakres per przeglądarka, nie per osoba.** Zgoda wyrażona anonimowo na stronie marketingowej obejmuje potem identyfikację zalogowanego konta (`analytics-identify.tsx:15-19`); na wspólnym komputerze dotyczy kolejnych użytkowników.
  - **Brak ponownego pytania** — decyzja nie wygasa (brak daty).
- **Ryzyko:** średnie — art. 7 ust. 3 RODO wprost wymaga wycofania tak łatwego jak udzielenie [NZ]; organy karały za utrudnianie wycofania zgody (ZR-21 a).
- **Rekomendacja:** (I) link „Ustawienia prywatności” w stopce i w `/settings` otwierający ten sam wybór; przy wycofaniu `opt_out_capturing()` + `reset()` + informacja, jak zażądać usunięcia danych z PostHog; zapis wyboru jako `{decyzja, wersja, data}` (opcjonalnie kopia na koncie po zalogowaniu); test e2e „zgoda → wycofanie → brak żądań `/ingest`” (`A4-…`).

### ZGD-06. Marketing e-mailowy i newsletter

- **Stan:** częściowe. **Klasa:** P — art. 398 PKE (marketing bezpośredni z użyciem poczty elektronicznej — numer i zakres do potwierdzenia, ZR-11), status art. 10 UŚUDE po PKE (ZR-12), art. 13 dyr. 2002/58 (ZR-02), art. 7 RODO [NZ]; O — EDPB 05/2020 (ZR-31). WYM-13, WYM-14, WYM-66.
- **Dowód:**
  - Preferencje działają w modelu „brak wiersza = zapisany” dla wszystkich kategorii, także `marketing` (`lib/email/preferences.ts:3-8,40-56`); `canSendTo` przepuszcza każdą kategorię, gdy brak `userId` (`preferences.ts:166-167`). Opis kategorii w ustawieniach: „Nowe funkcje, blog FaktFlow, kampanie re-engagement” (`settings/notifications/_components/email-preferences.tsx:47-52`). Dziś **nie znaleziono wysyłek** w kategorii `marketing` (grep `category: 'marketing'` — tylko wypis automatyczny w `app/api/email/resend-webhook/route.ts:185`).
  - Sekwencja próbna: dni 1, 4, 8 wysyłane automatycznie każdemu zarejestrowanemu jako `product_updates` (`lib/jobs/runners/email-sequence.ts:16-22`); e-mail z 8. dnia zawiera treść handlową („Subskrypcja kosztuje … Już teraz się zwróciła”, `email-sequence.ts:151-168`). Wypis: nagłówek `List-Unsubscribe` + one-click, ale **tylko gdy ustawiono `EMAIL_UNSUBSCRIBE_SECRET`** — bez sekretu e-mail idzie bez nagłówka (`lib/email/send.ts:178-195`); w treści e-maili dni 1/4/8 brak linku wypisu i stopki (stopka z linkiem do polityki tylko w powitaniu, `email-sequence.ts:92-94`). Opis kategorii `product_updates` w ustawieniach nie wspomina porad próbnych ani treści o cenie (`email-preferences.tsx:39-45`).
  - Mechanizmy wypisu, które działają: token HMAC 90 dni, GET z potwierdzeniem i POST one-click RFC 8058 (`app/api/email/unsubscribe/route.ts:1-14,130-147,177`), przełączniki w ustawieniach (`settings/notifications/email-actions.ts:11,26`), automatyczny wypis po twardym odbiciu i skardze (`resend-webhook/route.ts:171-230`). `RESEND_FROM_MARKETING` rozdziela nadawcę tylko dla reputacji (`send.ts:80-94`).
  - Newsletter: akcja zapisuje e-mail, źródło i datę (`app/actions/newsletter.ts:65-71`), bez potwierdzenia adresu (double opt-in), bez treści i wersji zgody; `unsubscribed_at` nigdzie nie jest ustawiane (INW-14); kodu wysyłki nie znaleziono; **żaden formularz nie jest osadzony** (MIN-12), a atrapa `BlogNewsletter` obiecuje „Zapisano — sprawdź skrzynkę” bez zapisu.
- **Luka:** model domyślnego zapisu na marketing jest sprzeczny z wymogiem uprzedniej zgody, jeśli ruszy pierwsza kampania; e-mail z 8. dnia może być marketingiem bezpośrednim wysyłanym bez zgody i bez wypisu w treści.
- **Ryzyko:** średnie (dziś ograniczone do sekwencji próbnej; rośnie z pierwszą kampanią).
- **Rekomendacja:** (I) kategoria `marketing` w modelu opt-in (wiersz zgody z wersją i datą, domyślnie brak wysyłki), `canSendTo` bez wyjątku „brak userId” dla kategorii innych niż transakcyjna; link wypisu w treści każdego e-maila nietransakcyjnego, a brak sekretu = brak wysyłki (fail-closed); treść handlową z e-maila 8. dnia oddzielić albo objąć zgodą — decyzja review; newsletter z potwierdzeniem adresu, zapisem treści zgody i wypisem.

### ZGD-07. Zgody produktowe: przypomnienia, FLO, push, AI

- **Stan:** częściowe. **Klasa:** P — art. 28 ust. 3 lit. a RODO (przetwarzanie na udokumentowane polecenie) [NZ]; I. WYM-67.
- **Dowód:**
  - **Przypomnienia do dłużników — weryfikacja dokumentu `docs/security/ZGODA-NA-PRZYPOMNIENIA-2026-09-23.md`.** „Zgoda” w tym dokumencie to zatwierdzenie wysyłki przez klienta (żeton w `flo_approvals`), nie zgoda dłużnika w rozumieniu RODO. Kod zgadza się z opisem: worker odrzuca wysyłkę bez `approvalId` (`lib/jobs/runners/send-reminder.ts:20-23`), czyta zamrożoną kopertę (`send-reminder.ts:33`) i wysyła ze stałym kluczem idempotencji (`send-reminder.ts:83`); przygotowanie pokazuje dokładny podgląd (`lib/reminders/prepare-delivery.ts:43-134`); „Od:” z domeny FaktFlow z nazwą klienta, Reply-To — adres klienta (`prepare-delivery.ts:85-94`); klient może wyłączyć przypomnienia dla faktury i kontrahenta (`app/actions/reminders.ts:171,245`); automatycznej wysyłki nie ma (`00062_reminders_opt_in.sql:1-25`). `reminder_settings.enabled` domyślnie `TRUE` (`00023_payment_reminder_settings.sql:12-20`) oznacza tylko propozycje do zatwierdzenia. Podstawą wobec dłużnika jest podstawa klienta (zwykle lit. f — dochodzenie należności), FaktFlow działa jako FF-P.
  - **FLO** — funkcje spoza listy zablokowanych są domyślnie włączone (INW-10, `lib/flo/flags.ts:39-91`); ocena domyślności w `02-…`.
  - **Push** — włączenie wymaga kliknięcia i zgody przeglądarki (`hooks/use-push-notifications.ts:72-110`), wyłączenie akcją `unsubscribePushAction` (`app/actions/push-subscriptions.ts:63`). Treść powiadomień idzie przez usługę push przeglądarki zaszyfrowana protokołem web push (wg wiedzy modelu [NZ]).
  - **AI-kategoryzacja kosztów** — uruchamiana automatycznie dla faktur ze skrzynki KSeF, ograniczona tylko budżetem (`lib/categorization/index.ts:69-75`, INW-06); brak przełącznika per organizacja (grep `ai_categor|auto_categor` — brak).
- **Luka:** brak przełącznika „wysyłaj dane do modelu AI” dla organizacji; brak w polityce opisu przypomnień i FLO.
- **Ryzyko:** niskie (przypomnienia i push działają zgodnie z deklaracją), średnie dla AI do czasu decyzji o instrukcji klienta.
- **Rekomendacja:** (I) ustawienie organizacji „Automatyczna kategoryzacja AI” (domyślnie zgodnie z decyzją review) i opis w umowie powierzenia jako polecenie klienta.

### ZGD-08. Funkcje AI bez informacji przy użyciu

- **Stan:** brak. **Klasa:** P — art. 13 ust. 1 lit. e i f RODO; art. 50 ust. 1 AI Act (od 2.08.2026, ZR-06 — do potwierdzenia, czy pakiet „Digital Omnibus” zmienił termin) [NZ]; O — WP260 (ZR-47). WYM-62. Uzupełnia SEC-D-05 i INW-06.
- **Dowód:** powitanie czatu: „Cześć! Jestem asystentem FaktFlow…” (`components/support/support-widget.tsx:334-335`) — bez informacji, że odpowiada model językowy zewnętrznego dostawcy, że rozmowa jest zapisywana (`support_messages`) i może trafić do zespołu (eskalacja); pole „Zadaj pytanie…” bez prośby o niewklejanie danych osobowych (`support-widget.tsx:295`). Ekrany kosztów i OCR (`components/expenses/capture-button.tsx`, `expense-edit-form.tsx`) nie wspominają przetwarzania przez model (grep `Anthropic|AI|sztuczn` — brak trafień). Polityka wymienia Anthropic tylko dla OCR (`polityka-prywatnosci/page.tsx:106-109`).
- **Luka:** osoba nie wie, że rozmawia z AI i że treść jest wysyłana do dostawcy spoza EOG (lokalizacja: `04-…`).
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) jedno zdanie pod polem czatu i przy przycisku OCR („Odpowiada model AI (Anthropic). Nie wklejaj danych osobowych kontrahentów.”); wpis w polityce i liście dalszych procesorów.

### ZGD-09. Osoby bez konta — brak informacji w wiadomościach

- **Stan:** brak. **Klasa:** P — art. 14 RODO; dla FF-P — obowiązek ciąży na kliencie, FaktFlow pomaga (art. 28 ust. 3 lit. e) [NZ]. WYM-20, WYM-67.
- **Dowód:**

| Wiadomość | Odbiorca | Informacja o przetwarzaniu | Dowód |
|---|---|---|---|
| Faktura e-mailem | nabywca (FF-P) | tylko „Wiadomość wysłana przez FaktFlow.”; Reply-To — skrzynka FaktFlow (INW-07) | `lib/email/send.ts:560-579` |
| Przypomnienie / wezwanie | dłużnik (FF-P) | brak; treść z szablonów klienta + stałe zdanie o płatności | `lib/reminders/templates.ts`, `prepare-delivery.ts:97-110` |
| Zaproszenie do organizacji | zaproszony (FF-A albo FF-P — do review) | brak; „Jeśli nie spodziewałeś/aś się tego maila, zignoruj go” | `app/actions/organizations.ts:690-699` |
| Paczka dla księgowej | księgowa i adresy CC (FF-P) | nie badano treści szablonu | `lib/jobs/runners/co-pilot-monthly.ts:563-579` |
| Prośba o dostęp | właściciel organizacji | — (użytkownik FaktFlow) | `components/onboarding/form.tsx:483` |

- **Luka:** żadna wiadomość do osoby trzeciej nie wskazuje, gdzie znaleźć informację o przetwarzaniu.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) stopka w wiadomościach do osób trzecich: kto jest nadawcą (klient), że FaktFlow przetwarza na jego zlecenie, link do krótkiej strony „Informacja dla odbiorców wiadomości FaktFlow”; wzór klauzuli art. 14 dla klientów w centrum pomocy.

### ZGD-10. Technologie przeglądarkowe działające bez zgody

- **Stan:** częściowe. **Klasa:** P — art. 399 PKE, art. 5 ust. 3 dyr. 2002/58 [NZ]; P — art. 6 i rozdział V RODO (przekazanie IP do USA); O — EDPB 2/2023 o zakresie art. 5 ust. 3 (ZR-34), WP29 04/2012 o wyjątkach (ZR-53) [NZ]; orzeczenie LG München I z 20.01.2022, sygn. 3 O 17493/20 (dynamiczne fonty Google) — wg wiedzy modelu, niezweryfikowane, sąd niemiecki, znaczenie pomocnicze. WYM-63.
- **Dowód:**
  - **Arkusz fontu Material Symbols** ładowany z `fonts.googleapis.com` (i plik fontu z `fonts.gstatic.com`) w głównym layoucie — na każdej stronie, także marketingowej i przed jakimkolwiek wyborem (`app/layout.tsx:114-125`). Pozostałe fonty `next/font/google` są samohostowane w czasie budowy (`app/layout.tsx:2-55` — mechanizm Next.js wg wiedzy modelu [NZ]). CSP dopuszcza oba hosty Google (`lib/security/csp.ts:30-32`).
  - **Sentry w przeglądarce** startuje bez bramki zgody na każdej stronie w produkcji (`components/sentry-client-init.tsx:9-13`, `instrumentation-client.ts:5-21`), wysyła przez tunel `/monitoring` (`next.config.ts:189`), `tracesSampleRate: 0.1`. Kodu zapisującego dane Sentry w przeglądarce nie znaleziono (brak integracji Replay).
  - **Service worker** rejestrowany automatycznie każdemu odwiedzającemu (`@serwist/next` — `register` domyślnie `true`, `node_modules/@serwist/next/dist/chunks/schema-BhRhcBIb.js`; konfiguracja `next.config.ts:11-20` nie wyłącza), zapisuje publiczne zasoby statyczne w Cache Storage na 7 dni (`app/sw.ts:23-34`).
  - **Turnstile** ładuje skrypt i ramkę Cloudflare tylko na formularzach logowania, rejestracji i resetu hasła (`components/auth/turnstile-widget.tsx:20-43`, użycia: `login/page.tsx:129`, `register/page.tsx:152`, `forgot-password/page.tsx:75`).
- **Luka:** fonty Google przekazują IP każdego odwiedzającego do Google bez potrzeby (font można hostować u siebie); dla Sentry i service workera brak udokumentowanej klasyfikacji „ściśle niezbędne”.
- **Ryzyko:** średnie (fonty — przekazanie do USA przy każdej wizycie; Sentry i SW — kwestia interpretacji).
- **Rekomendacja:** (I) samohostowanie Material Symbols i usunięcie hostów Google z CSP; Sentry w przeglądarce — albo za zgodą (razem z analityką), albo minimalnie (bez śledzenia wydajności, `tracesSampleRate: 0` w przeglądarce) z LIA i wpisem w polityce — decyzja review; rejestracja service workera dopiero w panelu (po zalogowaniu) albo po działaniu użytkownika (instalacja PWA, włączenie push). Klasyfikacja każdej technologii — tabela niżej.

### ZGD-11. Ciasteczka sesji: okres i dostępność dla skryptu

- **Stan:** brak zgodności z polityką. **Klasa:** P — art. 13 ust. 2 lit. a RODO, art. 399 PKE (informacja o okresie, Planet49 — ZR-62) [NZ]; I.
- **Dowód:** klienci Supabase nie nadpisują opcji ciasteczek (`lib/supabase/client.ts:8-19`, `lib/supabase/server.ts:32-48`, `lib/supabase/middleware.ts:134-152`), więc obowiązują domyślne `@supabase/ssr` 0.10.2: `maxAge` 400 dni, `httpOnly: false`, `sameSite: lax` (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11`). Ciasteczko aktywnej organizacji `ksef.active_org` — 30 dni, `httpOnly` (`app/actions/organizations.ts:34-44`, `lib/supabase/middleware.ts:330-338`). Polityka: „Cookies sesji: do końca sesji (browser close)”, „Cookies preferencji: 1 rok” (`polityka-prywatnosci/page.tsx:232-233`) — preferencje (motyw) są w `localStorage` bez terminu (`lib/theme/theme.ts:3,24`).
- **Luka:** rozjazd deklaracji; sesja dostępna dla skryptu strony zwiększa skutki ewentualnego XSS (opis jednym zdaniem — `BRIEF.md`).
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) świadomie ustawić `cookieOptions` (krótszy `maxAge` zgodny z polityką sesji); w polityce tabela technologii z nazwą, celem i okresem (tabela niżej jako szkic).

### ZGD-12. Strona „RODO i bezpieczeństwo” — deklaracje bez pokrycia

- **Stan:** brak zgodności. **Klasa:** P — art. 5 ust. 1 lit. a (rzetelność i przejrzystość), art. 12 ust. 1 RODO [NZ]; I. WYM-19.
- **Dowód:** szczegóły w tabeli „Deklaracje ze stron prawnych vs stan faktyczny” (pozycje D-01 – D-11). Najpoważniejsze: „Frankfurt (Hetzner, Vercel)” — serwery w NBG1 (Norymberga) wg `AGENTS.md`, Vercel nieużywany; „Brak cookies analitycznych” — sprzeczne z polityką (PostHog po zgodzie); „Audit logs — kto i kiedy uzyskał dostęp do Twoich danych” — odczyty nie są audytowane (MIN-05); „72 godzin (art. 33)” — art. 33 dotyczy zgłoszenia do organu, nie powiadomienia klienta; „SCC z każdym US-based subprocesorem” i „DPA dla każdej umowy” — brak dokumentów w repo.
- **Luka:** strona deklaruje stan, którego kod i dokumentacja nie potwierdzają; wszystkie pozycje oznaczono „✅”.
- **Ryzyko:** wysokie — deklaracje marketingowe o zgodności, które są nieprawdziwe, wprowadzają w błąd klientów-administratorów wybierających procesora.
- **Rekomendacja:** zdjąć stronę albo zastąpić listą faktów z datą weryfikacji i odnośnikami do dowodów; nie publikować deklaracji przed potwierdzeniem (umowy, ustawienia dostawców).

## Tabela: cel → proponowana podstawa → obowiązek informacyjny → gdzie w kodzie → status

Podstawy są **propozycjami do review prawnego**, nie ustaleniami. Zgodę (lit. a)
proponujemy tylko tam, gdzie wymaga jej przepis szczególny (art. 399 PKE —
dostęp do urządzenia; marketing elektroniczny — art. 398 PKE) albo gdzie nie
ma innej realnej podstawy. Dla FF-P podajemy podstawę **klienta**
(administratora) — FaktFlow przetwarza na jego polecenie (art. 28). „Status”
opisuje stan informacji i mechanizmu w kodzie.

| # | Cel (rola) | Proponowana podstawa | Obowiązek informacyjny | Gdzie w kodzie | Status |
|---|---|---|---|---|---|
| 1 | Konto: rejestracja, logowanie e-mail/Google, MFA (FF-A) | lit. b | art. 13 przy rejestracji — tylko link do polityki z placeholderem; brak informacji przy rejestracji Google z ekranu logowania | `app/(auth)/register/*`, `app/(auth)/login/*`, `app/(dashboard)/settings/security/actions.ts:172` | częściowe (ZGD-03, ZGD-04) |
| 2 | Ochrona przed botami i nadużyciami: Turnstile, limity prób, HIBP (FF-A) | lit. f (bezpieczeństwo usługi; motyw 49) + dla Turnstile wyjątek „ściśle niezbędne” z art. 399 PKE [NZ] | polityka sekcje 2, 7, 8 opisuje Turnstile i HIBP | `lib/security/turnstile.ts`, `lib/rate-limit/*`, `lib/auth/breach-check.ts:17-41` | częściowe — brak LIA; opis HIBP zgodny z kodem |
| 3 | Dziennik audytu z IP i user agent (FF-A i FF-P) | lit. f (rozliczalność, bezpieczeństwo); dla klienta — art. 32 | polityka sekcja 11 — retencja 12 mies.; brak informacji, że IP widzą wszyscy członkowie organizacji | `lib/audit/log.ts:4-19,146-168`, `00052…sql` | częściowe (INW-09, MIN-11) |
| 4 | Świadczenie usługi fakturowania: dane firmy klienta (FF-A) | lit. b | polityka sekcja 2 | `components/onboarding/actions.ts`, `lib/schemas/company-profile.ts` | potwierdzone co do celu; placeholder administratora |
| 5 | Wystawianie faktur i wysyłka do KSeF: dane nabywców (FF-P) | klient: lit. c (ustawa o VAT — obowiązek wystawienia faktury, ZR-13) | klient wobec nabywcy (art. 14 — wyjątek art. 14 ust. 5 lit. c do review); FaktFlow: umowa powierzenia — brak | `components/invoices/actions.ts`, `lib/xml/fa3-generator.ts`, `lib/jobs/runners/submit-invoice.ts` | brak umowy powierzenia (ZGD-02) |
| 6 | Przechowywanie faktur (FF-P) | klient: lit. c (art. 112 VAT, art. 86 OP — ZR-13, ZR-14) | polityka opisuje jako obowiązek FaktFlow, z błędnym przepisem | `lib/jobs/runners/archive-old-invoices.ts`, `retention-delete.ts` | brak zgodności (INW-18, ZGD-03) |
| 7 | Skrzynka KSeF — faktury zakupowe i ich kategoryzacja (FF-P) | klient: lit. c (ewidencja kosztów) | umowa powierzenia — brak | `lib/ksef/inbox.ts`, `lib/categorization/index.ts:69-75` | brak (ZGD-02, ZGD-07) |
| 8 | OCR dokumentów kosztowych przez model AI (FF-P) | klient: lit. c; Anthropic jako dalszy procesor | polityka wymienia Anthropic dla OCR; brak informacji w UI | `lib/ocr/engine.ts:144-158` | częściowe (SEC-D-05, ZGD-08) |
| 9 | Wysyłka faktury e-mailem do nabywcy (FF-P) | klient: lit. b wobec nabywcy (wykonanie umowy) albo lit. f | brak stopki informacyjnej; odpowiedzi nabywcy trafiają do FaktFlow | `lib/email/send.ts:550-581` | brak (ZGD-09, INW-07) |
| 10 | Przypomnienia i wezwania do zapłaty (FF-P) | klient: lit. f (dochodzenie należności) | klient wobec dłużnika (art. 14); wiadomość bez informacji | `lib/reminders/*`, `lib/jobs/runners/send-reminder.ts` | mechanizm potwierdzony; informacja — brak (ZGD-07, ZGD-09) |
| 11 | Portal i paczki dla księgowej (FF-P) | klient: polecenie udostępnienia (lit. c/f klienta) | klient; FaktFlow — brak informacji dla księgowej | `app/accountant/*`, `co-pilot-monthly.ts` | częściowe (MIN-06, INW-19) |
| 12 | Zespół: zaproszenia i prośby o dostęp (FF-A dla konta zaproszonego; FF-P dla organizacji — do review) | lit. b (zaproszony zakłada konto); lit. f organizacji przy wysłaniu zaproszenia | e-mail zaproszenia bez informacji (art. 14) | `app/actions/organizations.ts:575-714,817-935` | brak (ZGD-09) |
| 13 | Weryfikacja kontrahentów w rejestrach (GUS, VIES, biała lista) i wspólna pamięć `validation_cache` (FF-P; wspólna pamięć — FF-A?) | klient: lit. c/f (weryfikacja kontrahenta); wspólna pamięć — lit. f FaktFlow do review | brak w polityce | `lib/gus/client.ts`, `lib/validation/*`, `lib/validation/cache.ts` | brak (INW-16) |
| 14 | Płatności i subskrypcje Stripe (FF-A) | lit. b; dokumenty rozliczeń — lit. c (FF jako podatnik) | polityka wymienia Stripe | `lib/stripe/*`, `app/api/stripe/webhook/route.ts` | częściowe (INW-12) |
| 15 | E-maile transakcyjne (FF-A) | lit. b | polityka ogólnie | `lib/email/send.ts` | potwierdzone |
| 16 | Sekwencja e-maili próbnych dni 1/4/8 (FF-A) | lit. f dla porad dotyczących używanej usługi; dla treści handlowej — zgoda z art. 398 PKE [NZ] — do review | brak w polityce; wypis tylko nagłówkiem | `lib/jobs/runners/email-sequence.ts` | częściowe (ZGD-06) |
| 17 | Marketing i newsletter (FF-A) | lit. a + zgoda z art. 398 PKE [NZ] | brak treści zgody i informacji przy formularzu | `app/actions/newsletter.ts`, `lib/email/preferences.ts` | brak (ZGD-06); dziś uśpione |
| 18 | Analityka produktowa w przeglądarce (FF-A) | zgoda z art. 399 PKE dla dostępu do urządzenia; dalsze przetwarzanie — lit. a [NZ] | baner + polityka sekcja 13; brak wycofania | `lib/analytics/init-posthog-browser.ts`, `components/analytics/*` | częściowe (ZGD-05) |
| 19 | Zdarzenia analityczne po stronie serwera (FF-A) | lit. f z LIA i prawem sprzeciwu — albo objęcie zgodą z pkt 18 (decyzja review) | polityka sekcja 13 — „uzasadniony interes … z pseudonimizacją” | `lib/analytics/server.ts`, wywołania w MIN-08 | częściowe (MIN-08) |
| 20 | Monitorowanie błędów — serwer (FF-A i FF-P) | lit. f (integralność i dostępność, art. 32) | polityka wymienia Sentry | `sentry.server.config.ts`, `lib/observability/scrub.ts` | częściowe — brak LIA |
| 21 | Monitorowanie błędów — przeglądarka (FF-A) | do review: wyjątek „ściśle niezbędne” wątpliwy → zgoda (art. 399 PKE) albo minimalizacja + lit. f | jak wyżej | `instrumentation-client.ts`, `components/sentry-client-init.tsx` | do decyzji (ZGD-10) |
| 22 | Czat pomocy z modelem AI i eskalacja do zespołu (FF-A; treść o danych klienta — FF-P) | lit. b (pomoc w ramach usługi) / lit. f (eskalacja, Slack) | brak informacji przy czacie; Slack nie w polityce | `app/api/support/chat/route.ts`, `lib/support/*` | brak (ZGD-08, INW-08) |
| 23 | Skrzynka pomocy e-mail (FF-A) | lit. f (obsługa zapytań) | adres w polityce; brak informacji o przekierowaniu | `ops/poczta/worker.mjs`, `docs/runbooks/skrzynka-pomoc.md` | częściowe (INW-07) |
| 24 | Powiadomienia push (FF-A) | lit. b (funkcja żądana) + wyjątek art. 399 dla subskrypcji [NZ] | brak w polityce | `hooks/use-push-notifications.ts`, `lib/push/sender.ts` | częściowe |
| 25 | Agent FLO — propozycje i wykonanie działań (FF-P) | klient: polecenie (żeton zatwierdzenia) | brak w polityce i umowie | `lib/flo/*` | brak (INW-10) |
| 26 | Prawa osób: eksport, usunięcie, rejestr żądań (FF-A) | lit. c (art. 12–22 RODO) | polityka sekcje 9–10 | `lib/gdpr/*`, `app/api/gdpr/export/route.ts` | ocena w `A2-…` |
| 27 | Wypisy, odbicia i skargi e-mail — lista blokad (FF-A) | lit. c/f (respektowanie sprzeciwu, reputacja wysyłki) | brak | `lib/email/preferences.ts:63-80`, `app/api/email/resend-webhook/route.ts` | brak informacji |
| 28 | Panel operatora i notatki o kliencie (FF-A; dostęp do danych FF-P) | lit. f (obsługa klienta) / polecenie klienta (art. 28 ust. 3 lit. b) | brak | `app/admin/*`, `lib/admin/*` | częściowe (MIN-05) |
| 29 | Kopie zapasowe (FF-A i FF-P) | lit. f / art. 32 ust. 1 lit. c | polityka: „Backup: AWS Glacier” — nieprawdziwe | `scripts/hetzner/db-backup.sh`, `lib/backup/*` | brak zgodności (INW-04, ZGD-03) |
| 30 | Alerty operacyjne (Slack, Telegram, heartbeat) (FF-A) | lit. f | brak w polityce | `lib/alerts/*` | brak informacji |

## Tabela technologii przeglądarkowych

Klasyfikacja jest **propozycją** według kryterium „zapis lub dostęp ściśle
niezbędny do dostarczenia usługi wyraźnie żądanej przez użytkownika” (art. 5
ust. 3 dyr. 2002/58; art. 399 PKE — treść wg wiedzy modelu, niezweryfikowane
online 2026-10-10, egress zablokowany; pomocniczo WP29 04/2012, ZR-53, i EDPB
2/2023, ZR-34). Rzeczywiste zachowanie w przeglądarce (żądania, magazyny przed
wyborem i po nim) bada `A4-TEST-COOKIES-I-SIECI.md`; tutaj opisujemy kod.

| Technologia (nazwa) | Rodzaj, okres | Kiedy | Cel | Dostawca / przekazanie | Proponowana klasyfikacja | Uzasadnienie | Dowód |
|---|---|---|---|---|---|---|---|
| Sesja Supabase `sb-<ref>-auth-token` (dzielona na części `.0`, `.1`…) | cookie pierwszej strony, 400 dni, `httpOnly: false`, `SameSite=Lax` | po zalogowaniu | uwierzytelnienie | własna infrastruktura | **niezbędna** co do sesji; **trwałe logowanie 400 dni — do review** | ciasteczka uwierzytelnienia zwolnione na czas sesji; utrzymanie logowania ponad sesję bez wyboru użytkownika (np. „zapamiętaj mnie”) wg WP29 04/2012 nie jest oczywiście zwolnione [NZ] | `@supabase/ssr` `constants.js:4-11`; brak nadpisania w `lib/supabase/*` |
| Weryfikator PKCE `sb-<ref>-auth-token-code-verifier` | cookie, domyślne opcje SDK | logowanie Google | dokończenie OAuth | własna | **niezbędna** | żądane logowanie | klucz `${storageKey}-code-verifier` w `@supabase/auth-js` 2.103.3 (`dist/main/GoTrueClient.js:654`); przepływ `login/actions.ts:97-114` |
| `ksef.active_org` | cookie, 30 dni, `httpOnly` | wybór organizacji | aktywna organizacja | własna | **niezbędna** (wybór użytkownika) | zapamiętanie wyboru wprowadzonego przez użytkownika | `app/actions/organizations.ts:34-44`, `lib/supabase/middleware.ts:330-338` |
| `ff_analytics_consent` | `localStorage`, bez terminu | decyzja w banerze | zapamiętanie zgody/odmowy | własna | **niezbędna** | zapamiętanie wyboru zgody jest zwolnione (WP29 04/2012) [NZ] | `lib/analytics/consent.ts:2,27-37` |
| `theme` | `localStorage`, bez terminu | zmiana motywu | motyw jasny/ciemny | własna | **niezbędna (preferencja wybrana przez użytkownika)** | personalizacja interfejsu wybrana przez użytkownika [NZ] | `lib/theme/theme.ts:3,24,35`, `components/dashboard/theme-toggle.tsx:37` |
| `ff.banner.dismissed.ksef-cert`, `ff:ksef-banner-dismissed` (sessionStorage), `install-prompt-dismissed-at` | `localStorage`/`sessionStorage` | zamknięcie banera | nie pokazywać ponownie | własna | **niezbędna (wybór użytkownika)** | jw. | `components/dashboard/dismissible-banner.tsx:5,49,63`, `app/(dashboard)/_components/ksef-health-banner-client.tsx:31,73`, `hooks/use-install-prompt.ts:17,37,69` |
| PostHog — SDK, żądania `/ingest` → `eu.i.posthog.com`, flaga `__ph_opt_in_out_<klucz>` | pamięć + `localStorage` (flaga) | **dopiero po zgodzie** | analityka produktowa | PostHog (UE wg PR #225) | **wymaga zgody** — jest zgoda; brak wycofania (ZGD-05) | analityka nie jest ściśle niezbędna (WP29 04/2012, EDPB) [NZ] | `init-posthog-browser.ts:13-61`, `next.config.ts:140-155`, `posthog-js/lib/src/consent.js:8,56-58` |
| Sentry — SDK i tunel `/monitoring` | brak zapisu znalezionego w kodzie; żądania z danymi urządzenia i URL | każda strona w produkcji, bez zgody | błędy, 10% śladów wydajności | Sentry (UE wg PR #225) | **do decyzji review**: zgoda **albo** minimalizacja (bez śladów wydajności) + LIA | monitorowanie błędów zwykle nie jest „ściśle niezbędne” do usługi żądanej przez użytkownika; EDPB 2/2023 obejmuje też wysyłanie informacji z urządzenia [NZ] | `components/sentry-client-init.tsx:9-13`, `instrumentation-client.ts:5-21`, `next.config.ts:189` |
| Service worker `/sw.js` + Cache Storage `faktflow-public-static-v1` | rejestracja automatyczna; cache 7 dni, 128 pozycji | **każdy odwiedzający**, także stron marketingowych | PWA, push, szybsze ładowanie | własna | **niezbędna tylko w panelu/PWA/push**; dla odwiedzającego stronę marketingową — **nie** (proponujemy rejestrację po zalogowaniu albo po działaniu użytkownika) | przyspieszenie ładowania nie jest usługą wyraźnie żądaną [NZ] | `next.config.ts:11-20`, `@serwist/next` `register` = `true`, `app/sw.ts:16-42` |
| Subskrypcja push (PushManager) | w przeglądarce + wiersz w `push_subscriptions` | po kliknięciu i zgodzie przeglądarki | powiadomienia | usługa push przeglądarki (Google/Mozilla/Apple — dostawca zależny od przeglądarki) | **niezbędna** (usługa żądana) | użytkownik włącza świadomie | `hooks/use-push-notifications.ts:72-110` |
| Cloudflare Turnstile (skrypt i ramka `challenges.cloudflare.com`) | zapis w przeglądarce nieznany — do `A4-…` | formularze logowania, rejestracji, resetu hasła | ochrona przed botami | Cloudflare (USA wg polityki) | **niezbędna (bezpieczeństwo usługi żądanej)** — propozycja | ochrona formularza uwierzytelnienia; do potwierdzenia w review i dokumentacji Cloudflare | `components/auth/turnstile-widget.tsx:20-43` |
| Google Fonts: arkusz Material Symbols (`fonts.googleapis.com`, `fonts.gstatic.com`) | żądania przy każdej stronie (brak cookies w kodzie; IP i nagłówki do Google) | każda strona, bez zgody | ikony panelu | Google (USA) | **nie jest niezbędna** — do samohostowania | ten sam font można serwować z własnej domeny | `app/layout.tsx:114-125`, `lib/security/csp.ts:30-32` |
| Fonty `next/font/google` (Geist, Inter, Fraunces, IBM Plex Mono) | samohostowane w czasie budowy | — | typografia | brak żądań do Google w runtime (wg wiedzy modelu o Next.js) [NZ] | nie dotyczy | — | `app/layout.tsx:2-55` |
| Logowanie Google (`accounts.google.com`) | przekierowanie | po kliknięciu | logowanie | Google | **niezbędna** dla wybranej metody logowania | żądane przez użytkownika | `lib/security/csp.ts:11-14`, `login/actions.ts:97-114` |
| Stripe Checkout / portal (`checkout.stripe.com`, `billing.stripe.com`) | przekierowanie; Stripe.js **nie jest ładowany** | po kliknięciu | płatność | Stripe | nie dotyczy aplikacji (strona Stripe) | — | `lib/security/csp.ts:11-14`; brak `@stripe/stripe-js` w `package.json` |
| Supabase Realtime (WebSocket do originu Supabase) | połączenie | w panelu (lista faktur, szczegóły, import) | odświeżanie widoków | własna infrastruktura | **niezbędna** | funkcja panelu | `components/invoices/invoice-list.tsx:61`, `invoice-detail-view.tsx:147`, `components/onboarding/import-progress-view.tsx:80` |
| Obrazy z `lh3.googleusercontent.com` | dopuszczone w `next/image`, **nieużywane** | — | — | Google | nie dotyczy (martwy kod, MIN-12) | — | `next.config.ts:92-100` |
| Wideo i obrazy landingu | pliki lokalne `public/landing/*` | — | — | brak | nie dotyczy | — | `app/(landing)/_assets.ts:1-11` |

### CSP — lista domen (kod `3e5e00d`)

Polityka jest egzekwowana (`Content-Security-Policy`, nie `Report-Only`) —
`next.config.ts:46-47`, budowana w `lib/security/csp.ts:7-42`. SEC-E-02
zamknięte w kodzie.

| Dyrektywa | Źródła | Uwagi prywatności |
|---|---|---|
| `default-src` | `'self'` | — |
| `script-src` | `'self'` `'unsafe-inline'` `https://challenges.cloudflare.com` (+ `'unsafe-eval'` poza produkcją) | `unsafe-inline` osłabia ochronę przed XSS (jedno zdanie, `BRIEF.md`) |
| `style-src` | `'self'` `'unsafe-inline'` `https://fonts.googleapis.com` | host Google do usunięcia po samohostowaniu (ZGD-10) |
| `img-src` | `'self'` `blob:` `data:` `https:` | **dowolny host HTTPS** — umożliwia osadzenie piksela śledzącego z dowolnej domeny; zawęzić do potrzebnych hostów (I) |
| `font-src` | `'self'` `data:` `https://fonts.gstatic.com` | jw. (Google) |
| `connect-src` | `'self'` `https://challenges.cloudflare.com` + origin Supabase (`https` i `wss`) (+ `ws:`, `localhost` poza produkcją) | PostHog i Sentry przez własne ścieżki `/ingest`, `/monitoring` |
| `frame-src` | `'self'` `https://challenges.cloudflare.com` | Turnstile |
| `worker-src` | `'self'` `blob:` | service worker |
| `media-src` | `'self'` `blob:` | — |
| `form-action` | `'self'` `https://accounts.google.com` `https://checkout.stripe.com` `https://billing.stripe.com` + origin Supabase | — |
| `frame-ancestors` / `base-uri` / `object-src` | `'none'` / `'self'` / `'none'` | — |
| inne nagłówki | `Referrer-Policy: no-referrer`, `Permissions-Policy` wyłącza m.in. `browsing-topics` i `interest-cohort` | `next.config.ts:28-48` |

Odbiorcy pośredni przez przepisania po stronie serwera (przeglądarka ich nie
widzi w CSP): `eu-assets.i.posthog.com`, `eu.i.posthog.com` (`next.config.ts:140-155`)
i ingest Sentry (tunel `tunnelRoute`, `next.config.ts:189`). Czy przez proxy
trafia do nich adres IP przeglądarki (nagłówki `X-Forwarded-For` z proxy
Coolify) — niezweryfikowane.

## Deklaracje ze stron prawnych vs stan faktyczny

Ocena: **zgodne** (kod potwierdza), **niezgodne** (kod albo dokumentacja
w repo przeczy), **mylące** (formalnie prawdziwe, ale wprowadza w błąd),
**niezweryfikowane** (zależy od produkcji, umów lub ustawień dostawców),
**→ A2** (prawa osób i retencja — ocena w `A2-MECHANIZMY-PRAWA-RETENCJA.md`).
Lokalizację serwerów podajemy według `AGENTS.md` (Hetzner NBG1, Norymberga) —
deklaracja w repo, niezweryfikowana w tej sesji.

### Strona „RODO i bezpieczeństwo” (`app/(marketing)/legal/rodo/page.tsx`, bez daty)

| ID | Linia | Deklaracja | Stan faktyczny i dowód | Ocena |
|---|---|---|---|---|
| D-01 | `:20` | „Dane w UE — Frankfurt am Main (Hetzner, Vercel)” | serwery w NBG1 (Norymberga) wg `AGENTS.md`; Vercel nieużywany (`lib/feature-flags/global-flags.ts:4`, brak zależności `@vercel/*` w `package.json`); dane trafiają też do dostawców z USA (Anthropic, Stripe, Resend, Google, Cloudflare, Slack — `04-…`) | **niezgodne** |
| D-02 | `:23` | „Szyfrowanie at-rest — AES-256 (Supabase + R2)” | R2 nieużywany (MinIO, `lib/storage/r2-client.ts`); konfiguracji szyfrowania dysków bazy i MinIO nie ma w repo; lokalne zrzuty `pg_dump` bez szyfrowania (`scripts/hetzner/db-backup.sh`, INW-04) | **niezgodne** co do R2 i kopii; reszta **niezweryfikowane** |
| D-03 | `:26` | „TLS 1.3 dla wszystkich połączeń” | ruch publiczny: HSTS i `upgrade-insecure-requests` (`next.config.ts:50-58`, `csp.ts:41`); wersji TLS nie ustawia repo (proxy Coolify); połączenia wewnętrzne (Postgres, MinIO, Redis przez SRH) — TLS nie jest wymuszany w kodzie (adresy z env, `lib/storage/r2-client.ts:53-72`) | **niezweryfikowane**, „wszystkich” — prawdopodobnie zawyżone |
| D-04 | `:30` | „Eksport danych — pełny dostęp … (30 dni)” | `app/api/gdpr/export/route.ts`, `lib/gdpr/data-collector.ts` | **→ A2** |
| D-05 | `:34-36` | „Prawo do bycia zapomnianym — usunięcie najpóźniej w ciągu miesiąca” | ścieżka użytkownika `lib/gdpr/*`; ścieżka operatora bez wykonawcy (INW-02) | **→ A2** (częściowe) |
| D-06 | `:39-40` | „Audit logs — kto i kiedy uzyskał dostęp do Twoich danych” | dziennik zapisuje działania (logowania, zapisy, część pobrań: `invoice.xml_downloaded`, `invoice.upo_downloaded`, `accountant.access_used` — `lib/audit/log.ts:62-63,116`); odczyty w panelu operatora i zwykłe odczyty danych nie są rejestrowane (MIN-05) | **niezgodne** |
| D-07 | `:43-44` | „Standard Contractual Clauses z każdym US-based subprocesorem” | brak umów w repo; lista dostawców z USA niepełna (ZGD-03) | **niezweryfikowane** |
| D-08 | `:47` | „Brak cookies analitycznych” | PostHog działa po zgodzie (polityka `:238-241`, `init-posthog-browser.ts`); SDK nie tworzy ciasteczek (`persistence: 'memory'`), ale zapisuje flagę w `localStorage` | **mylące** i sprzeczne z polityką |
| D-09 | `:50` | „2FA dla kont (opcjonalnie, polecane)” | TOTP w ustawieniach (`app/(dashboard)/settings/security/actions.ts:172`), kody zapasowe ze scrypt (`lib/auth/backup-codes.ts:42-46`) | **zgodne** |
| D-10 | `:54-58` | „oferujemy DPA dla każdej umowy. Pobierz pdf z [e-mail]” | wzoru umowy nie ma w repo; link to `mailto:`, nie plik | **niezgodne** / niezweryfikowane (ZGD-02) |
| D-11 | `:62-64` | „powiadomimy Cię w ciągu 72 godzin (zgodnie z art. 33 RODO)” | art. 33 dotyczy zgłoszenia do organu nadzorczego; procesor zawiadamia administratora „bez zbędnej zwłoki” (art. 33 ust. 2), osoby — art. 34 [NZ]; procedura incydentu tylko wzmianką w `docs/runbooks/disaster-recovery.md:117` (ocena w `A3-…`) | **niezgodne** (błędne odesłanie) |
| D-12 | `:67-70` | „Kontakt RODO: [adres pomocy]” | adres wspólnej skrzynki pomocy, przekierowanej do skrzynek prywatnych (INW-07, `ops/poczta/worker.mjs`) | **zgodne** co do adresu; poufność kanału — niezweryfikowana |

### Polityka prywatności (`app/(marketing)/legal/polityka-prywatnosci/page.tsx`, „Ostatnia aktualizacja: 9 maja 2026”, `:16`)

| ID | Linia | Deklaracja | Stan faktyczny i dowód | Ocena |
|---|---|---|---|---|
| P-01 | `:20-21` | Administrator „[nazwa firmy], NIP [TWÓJ_NIP], z siedzibą w Poznaniu” | placeholder; podmiot nieustalony (`01-…` § 5) | **niezgodne** (brak administratora) |
| P-02 | `:31` | „Hasło (hashowane bcrypt)” | hasło przechowuje GoTrue (bcrypt wg wiedzy modelu o GoTrue [NZ]); konfiguracji GoTrue nie ma w repo | **niezweryfikowane** (prawdopodobnie zgodne) |
| P-03 | `:32` | „Imię (opcjonalnie)” | formularz wymaga „Imię i nazwisko” (MIN-02) | **niezgodne** |
| P-04 | `:46-50` | IP „do bezpieczeństwa”, user agent „do diagnostyki”, „Cookies (sesja, preferencje)” | IP i UA w `audit_logs`, widoczne dla wszystkich członków organizacji (INW-09); preferencje w `localStorage`, nie w ciasteczkach | **mylące** |
| P-05 | `:52-56`, `:134-160` | HIBP (k-anonymity, prefiks SHA-1) i Turnstile na wybranych formularzach | `lib/auth/breach-check.ts:4-41`; Turnstile na logowaniu, rejestracji, resecie (`turnstile-widget.tsx`) | **zgodne** |
| P-06 | `:58-72` | Trzy podstawy prawne bez przypisania celów | ZGD-01 | **niepełne** |
| P-07 | `:76-77` | „Hetzner, Frankfurt am Main … Wszystkie dane pozostają w UE” | NBG1 wg `AGENTS.md`; przekazania do USA (D-01) | **niezgodne** |
| P-08 | `:79` | „Backup: AWS Glacier, Frankfurt (eu-central-1)” | Glacier w kodzie to archiwum faktur zależne od zmiennych AWS (`lib/storage/glacier.ts:8-31`, INW-18); kopie zapasowe to lokalny `pg_dump` i snapshot JSON w MinIO (INW-04) | **niezgodne** |
| P-09 | `:81-120` | Procesorzy: Supabase (Frankfurt), Cloudflare R2, Turnstile, Vercel, Resend, Anthropic, Stripe, Inngest, Sentry | Supabase self-hosted (nie dostawca), R2 i Vercel nieużywane, Inngest odpięty 02.10.2026 (`AGENTS.md`); brak PostHog, Slack, Telegram, Google, Cloudflare Email Routing, rejestrów publicznych | **niezgodne** (szczegóły w `04-…`) |
| P-10 | `:106-109` | Anthropic — „zdjęcia … nie są przechowywane przez Anthropic” | warunki przechowywania u dostawcy — zakres `04-…`; brak czatu i kategoryzacji w opisie (ZGD-08) | **niezweryfikowane** i niepełne |
| P-11 | `:122-131` | Kody ratunkowe „wyłącznie w postaci zahashowanej” | scrypt z solą (`lib/auth/backup-codes.ts:42-46`) | **zgodne** |
| P-12 | `:162-181` | Usunięcie konta: 14 dni na wycofanie, najpóźniej miesiąc; faktury mogą zostać | `lib/gdpr/deletion.ts`; ścieżka operatora (INW-02) | **→ A2** |
| P-13 | `:183-188`, `:221-224` | Wpisy audytu „zostaną zanonimizowane” | pseudonimizacja, nie anonimizacja (MIN-11) | **mylące** |
| P-14 | `:206-213` | Odczyt dziennika dla organizacji; append-only | `settings/audit/page.tsx:34-38`; wyzwalacz niezmienności `00052…sql:16-41` | **zgodne** (bez informacji o IP współpracowników) |
| P-15 | `:215-218`, `:231` | Retencja dziennika 12 miesięcy | `00052…sql:53-74`, job czyszczący (INW-09); komentarz tabeli mówi „10 lat” (`00001…sql:174`) | **zgodne** z kodem; dokumentacja wewnętrzna sprzeczna |
| P-16 | `:194`, `:198` | Eksport „w 30 dni”, „JSON / CSV / JPK_FA” | `app/api/gdpr/export/route.ts` | **→ A2** |
| P-17 | `:199` | „Sprzeciwu (możesz w każdej chwili zrezygnować)” | brak mechanizmu sprzeciwu wobec zdarzeń serwerowych (MIN-08); brak informacji o wycofaniu zgody | **niezgodne** |
| P-18 | `:229` | „Dane konta: do 30 dni po anulowaniu subskrypcji” | brak mechanizmu usuwania po anulowaniu (INW-01, INW-02) | **niezgodne** / → A2 |
| P-19 | `:230` | „Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)” | art. 70 § 1 OP — 5 lat od końca roku (ZR-14, WYM-68) [NZ]; obowiązek ciąży na kliencie | **niezgodne** |
| P-20 | `:232-233` | „Cookies sesji: do końca sesji”, „Cookies preferencji: 1 rok” | sesja 400 dni; preferencje w `localStorage` bez terminu; `ksef.active_org` 30 dni (ZGD-11) | **niezgodne** |
| P-21 | `:236-247` | Niezbędne cookies (sesja, motyw); PostHog po zgodzie, domyślnie wyłączony; decyzja w `localStorage`; zdarzenia serwerowe na lit. f „z pseudonimizacją” | PostHog po zgodzie — **zgodne**; brak Sentry w przeglądarce, fontów Google i service workera; brak LIA i sprzeciwu dla zdarzeń serwerowych | **częściowo zgodne** |

### Regulamin (`app/(marketing)/legal/regulamin/page.tsx`, „Ostatnia aktualizacja: 1 maja 2026”, `:18`)

| ID | Linia | Deklaracja | Stan faktyczny i dowód | Ocena |
|---|---|---|---|---|
| R-01 | `:23` | Usługodawca „[nazwa firmy], NIP [TWÓJ_NIP]” | placeholder | **niezgodne** |
| R-02 | `:18` | Data „1 maja 2026” | treść zmieniona 1.10.2026 (commit `a4529fb`: okres próbny z kartą, cena) | **niezgodne** (brak wersjonowania, ZGD-04) |
| R-03 | `:90-91` | „Hetzner, Frankfurt (Niemcy), w ramach EU” | NBG1 wg `AGENTS.md` | **niezgodne** (miasto) |
| R-04 | `:93-96` | „Po anulowaniu … 30 dni na eksport, po czym [dane] są permanentnie usuwane” | brak mechanizmu (INW-02); sprzeczne z `:98-99` (faktury 10 lat) | **niezgodne** / → A2 |
| R-05 | — | Brak postanowień o powierzeniu przetwarzania, dalszych procesorach, funkcjach AI, FLO i przypomnieniach | ZGD-02 | **brak** |

### Inne publiczne deklaracje

| ID | Miejsce | Deklaracja | Ocena |
|---|---|---|---|
| X-01 | `components/marketing/landing-hero.tsx:38`; `app/(marketing)/vs/*/page.tsx` (np. `vs/inni/page.tsx:138`) | „dane w UE (Frankfurt)” | **niezgodne** co do miasta (NBG1) i mylące co do „wszystkie dane w UE” |
| X-02 | `consent-banner.tsx:49` | „PostHog, hostowane w EU” | **zgodne** z konfiguracją kodu (`eu.i.posthog.com`, `next.config.ts:150-153`); region konta — pomiar PR #225 |

## Niewiadome i ograniczenia

| ID | Niewiadoma | Czego dotyczy | Jak rozstrzygnąć | Co blokuje |
|---|---|---|---|---|
| NA1-01 | Podmiot prawny administratora (placeholder w polityce i regulaminie) | ZGD-03, ZGD-04, P-01, R-01 | decyzja właściciela (N-01 w `08-…`) | treść polityki, umowy powierzenia, klauzul |
| NA1-02 | Ustawienia projektu PostHog: odrzucanie IP, retencja, nagrania i heatmapy (PR #225: włączone po stronie projektu) | MIN-08, ZGD-05 | odczyt panelu przez operatora, zapis jako dowód | ocena, czy dane w PostHog są minimalne |
| NA1-03 | Ustawienia Sentry: przechowywanie IP, retencja, filtry po stronie serwera Sentry | MIN-07, ZGD-10 | odczyt panelu | LIA dla Sentry |
| NA1-04 | Czy przez przepisania `/ingest` i `/monitoring` trafia do dostawców IP przeglądarki (nagłówki `X-Forwarded-For` z proxy Coolify) | MIN-08, tabela technologii | test na produkcji albo odczyt konfiguracji proxy | ocena, czy telemetria jest pseudonimowa |
| NA1-05 | Konfiguracja GoTrue: zakres danych z Google OAuth, algorytm haseł, czas życia tokenów odświeżania, wymóg potwierdzenia e-mail | MIN-02, ZGD-11, P-02 | odczyt konfiguracji GoTrue na `db-1` | rzeczywisty czas trwania sesji (ciasteczko 400 dni to tylko górna granica przeglądarki) |
| NA1-06 | Zachowanie SDK w przeglądarce: zapisy Sentry i Turnstile, kolejność żądań przed wyborem i po wycofaniu | tabela technologii, ZGD-05, ZGD-10 | `A4-TEST-COOKIES-I-SIECI.md` (lokalny build) | ostateczna klasyfikacja Turnstile i Sentry |
| NA1-07 | Czy któryś z 10 NIP-ów z poprawną sumą kontrolną w testach należy do osoby fizycznej (JDG) | MIN-09 | sprawdzenie w rejestrze (zablokowany egress) | ocena, czy repo publiczne zawiera dane osobowe |
| NA1-08 | Szyfrowanie dysków (Hetzner), MinIO (SSE), TLS na połączeniach wewnętrznych | D-02, D-03, MIN-10 | odczyt konfiguracji serwerów | treść strony RODO |
| NA1-09 | Stan migracji `00068`, `00069`, `00072` na produkcji | MIN-04, MIN-10, MIN-11 | `schema_migrations` na `db-1` | zamknięcie SEC-C-04/05/06 w produkcji |
| NA1-10 | Czy na produkcji ustawiono `EMAIL_UNSUBSCRIBE_SECRET` | ZGD-06 | odczyt zmiennych w Coolify (bez wartości) | czy e-maile `product_updates` mają nagłówek wypisu |
| NA1-11 | Lista i historia zmian `ADMIN_EMAILS` | MIN-05 | operator | przegląd dostępów (S) |
| NA1-12 | Umowy z dostawcami (DPA, SCC, DPF) | D-07, D-10, P-09 | właściciel, panele dostawców (`04-…`) | deklaracje o transferach |
| NA1-13 | Historia polityki prywatności przed 2.10.2026 (klon płytki) | ZGD-03, ZGD-04 | pełna historia repo | czy data „9 maja 2026” odpowiada treści |
| NA1-14 | Treść e-maili paczek dla księgowej i szablonów React (`lib/email/templates/*`) pod kątem informacji o przetwarzaniu | ZGD-09 | przegląd szablonów | kompletność tabeli ZGD-09 |

Ograniczenia metodyczne: wyłącznie analiza statyczna kodu `3e5e00d` i
kodu zależności w `node_modules`; aplikacji nie uruchamiano; brak dostępu do
produkcji, paneli dostawców i umów; przepisy i stanowiska organów cytowane
z wiedzy modelu [NZ]. Ten plik nie przeszedł jeszcze niezależnego review
(R3 według `01-…` § 7).

## Pytania do końcowego review prawnego

| ID | Pytanie | Kontekst (ustalenie) |
|---|---|---|
| QA1-01 | Czy na fakturze dla konsumenta wysyłanej do KSeF identyfikator nabywcy (PESEL, nr dokumentu) jest wymagany, dozwolony czy zbędny — i czy domyślne „bez identyfikatora” jest właściwym ustawieniem (art. 25 ust. 2, art. 87 RODO)? | MIN-01, INW-05 |
| QA1-02 | Jaka jest rola FaktFlow (administrator / procesor) przy: zaproszeniach do organizacji, wspólnej pamięci wyników rejestrów `validation_cache`, czacie pomocy dotyczącym danych klienta, notatkach operatora? | tabela celów #12, #13, #22, #28 |
| QA1-03 | Czy e-maile sekwencji próbnej (szczególnie dzień 8 z treścią o cenie i opłacalności) są marketingiem bezpośrednim w rozumieniu art. 398 PKE i wymagają uprzedniej zgody; czy PKE przewiduje odpowiednik „soft opt-in” z art. 13 ust. 2 dyr. 2002/58? | ZGD-06 |
| QA1-04 | Czy model preferencji „brak wiersza = zapisany” dla kategorii `marketing` można utrzymać, jeśli żadne wysyłki nie ruszą bez osobnej zgody? | ZGD-06 |
| QA1-05 | Czy Sentry w przeglądarce (bez zapisu w urządzeniu, wysyłka danych o urządzeniu i URL) podlega art. 399 PKE i czy monitorowanie błędów może być uznane za „ściśle niezbędne”? | ZGD-10 |
| QA1-06 | Czy automatyczna rejestracja service workera na stronach marketingowych (cache zasobów publicznych na 7 dni) wymaga zgody? | ZGD-10 |
| QA1-07 | Czy utrzymanie zalogowania do 400 dni (ciasteczko sesji) mieści się w wyjątku art. 399 PKE bez wyboru „zapamiętaj mnie”? | ZGD-11 |
| QA1-08 | Czy zdarzenia serwerowe PostHog z UUID użytkownika mogą opierać się na lit. f niezależnie od odmowy w banerze, czy odmowa w przeglądarce powinna je wyłączać? | MIN-08, tabela celów #19 |
| QA1-09 | Czy akceptacja regulaminu wymaga aktywnego działania (pole wyboru) i zapisu wersji; jak sformułować zdanie o polityce prywatności (informacja, nie akceptacja); jak informować o zmianach regulaminu? | ZGD-04 |
| QA1-10 | Czy wyjątek z art. 14 ust. 5 lit. c RODO zwalnia klienta z informowania nabywców o danych na fakturach; czy FaktFlow powinien dodawać do wiadomości do osób trzecich stopkę informacyjną w imieniu klienta? | ZGD-09 |
| QA1-11 | Czy wobec nieprawdziwych deklaracji na stronie „RODO i bezpieczeństwo” należy ją zdjąć do czasu zawarcia umów i weryfikacji (ryzyko wprowadzenia w błąd — przepisy o nieuczciwej konkurencji i praktykach rynkowych, [NZ])? | ZGD-12 |
| QA1-12 | Czy czat pomocy wymaga informacji „rozmawiasz z systemem AI” na podstawie art. 50 ust. 1 AI Act (od 2.08.2026, z zastrzeżeniem ewentualnych zmian) i kto jest „dostawcą”, a kto „podmiotem stosującym”? | ZGD-08 |
| QA1-13 | Czy pseudonimizacja wpisów audytu po usunięciu konta (z pozostawieniem `tenant_id` i treści `details_json`) wystarcza wobec art. 17 i art. 17 ust. 3 lit. b/e; jak opisać to w polityce? | MIN-11 |
| QA1-14 | Czy ujawnianie zalogowanym użytkownikom nazw organizacji korzystających z FaktFlow pod danym NIP (zapobieganie duplikatom) jest uzasadnionym interesem, czy wymaga zmiany? | MIN-03 |
| QA1-15 | Czy domyślna ważność linku dla księgowej (90 dni, link-okaziciel) jest zgodna z art. 25 ust. 2 i art. 32? | MIN-06 |
| QA1-16 | Jaka podstawa i mechanizm transferu dla żądań do Google Fonts (IP każdego odwiedzającego) — czy wystarczy samohostowanie zamiast analizy? | ZGD-10 |

## Co sprawdziłem / czego nie mogłem sprawdzić

**Sprawdziłem (kod `3e5e00d`, odczyt plików i wyniki `grep`):**

- Formularze i schematy: rejestracja, logowanie, onboarding i wyszukanie NIP, dane firmy, faktura (nabywca firma/konsument/UE), kontrahenci, OCR, czat pomocy, kontakt, newsletter, push, link księgowej (`app/(auth)/*`, `components/onboarding/*`, `lib/schemas/*`, `components/invoices/invoice-form.tsx`, `app/actions/*`).
- Zakres odpowiedzi: wszystkie `select('*')` w `app/`, wybrane strony przekazujące wiersze do komponentów klienckich, zwracanie `error.message` w akcjach; lista 15 tras `app/api/**/route.ts` (trasy dev i Sentry — bramki środowiskowe).
- Panel operatora: `lib/auth/admin-guard.ts`, `lib/admin/*`, `app/admin/*` (brak impersonacji), `admin_user_notes`.
- Udostępnianie: portal księgowej, tokeny, podpisane URL, zaproszenia, share target, publiczne ścieżki w `lib/supabase/middleware.ts`.
- Logi i telemetria: `lib/observability/*`, `lib/jobs/logger.ts`, 58 wywołań `console.*`, konfiguracje Sentry (przeglądarka, Node, Edge), PostHog przeglądarka i serwer, allowlista `lib/analytics/privacy.ts`, zachowanie SDK posthog-js 1.374.3 (`consent.js`, `session-recording.js`, domyślne opcje), posthog-node 5.34.7 (GeoIP), `@supabase/ssr` 0.10.2 i `@supabase/auth-js` 2.103.3 (ciasteczka), `@serwist/next` 9.5.11 (rejestracja SW).
- Dane testowe: skan sum kontrolnych NIP i domen e-mail w `tests/`, `e2e/`, `scripts/`, `lib/xml/`.
- Szyfrowanie i skróty: `lib/ksef/credentials-crypto.ts`, `lib/auth/backup-codes.ts`, tokeny, `lib/rate-limit/index.ts`, `anonymize_user_audit_logs` (`00052`, `00069`), `00072`.
- Zgody i informacje: baner, `lib/analytics/consent.ts`, wszystkie wywołania `setAnalyticsConsent`, preferencje e-mail, wypis (`app/api/email/unsubscribe`, webhook Resend), sekwencja próbna, newsletter, przypomnienia (dokument z 23.09 vs kod), push, AI-kategoryzacja, treść e-maili do nabywcy i zaproszonego.
- Technologie przeglądarkowe: `localStorage`/`sessionStorage`/IndexedDB/`document.cookie` (grep), ciasteczka (`cookies.set`), service worker, Turnstile, fonty, obrazy i wideo, Stripe.js (brak), CSP (`lib/security/csp.ts`, `next.config.ts`).
- Strony prawne: pełna treść polityki, regulaminu i strony RODO; historia zmian w zakresie płytkiego klonu.
- Stan SEC-D-01, SEC-D-05, SEC-D-07, SEC-D-08 w kodzie.

**Nie mogłem sprawdzić:**

- Rzeczywistego zachowania w przeglądarce (żądania sieciowe, magazyny przed wyborem i po wycofaniu) — robi to agent RUNTIME (`A4-…`), na lokalnym buildzie.
- Produkcji: zmiennych środowiskowych, konfiguracji GoTrue, proxy Coolify, stanu migracji, logów, ustawień PostHog i Sentry, list operatorów (NA1-02 – NA1-11).
- Umów z dostawcami i treści DPA (nie ma ich w repo).
- Przynależności NIP-ów testowych (rejestry blokowane przez egress).
- Tekstów przepisów i wytycznych w źródłach pierwotnych (egress zablokowany; WebSearch odrzucony przez właściciela) — wszystkie odwołania prawne oznaczono [NZ].
- Historii polityki prywatności sprzed 2.10.2026 (klon płytki).
- Szablonów React e-maili (`lib/email/templates/*`) i treści e-maila paczki dla księgowej — przejrzane tylko pośrednio.
- Praw osób, retencji i usuwania w szczegółach — zakres `A2-…` (tu tylko odwołania „→ A2”).
