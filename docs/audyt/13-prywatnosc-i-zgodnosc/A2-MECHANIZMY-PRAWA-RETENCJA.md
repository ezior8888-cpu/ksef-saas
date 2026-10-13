# A2 — Mechanizmy: prawa osób, retencja i usuwanie, systemy AI

| | |
|---|---|
| Autor | agent MECHANIZMY-B (subagent audytu 13) |
| Data | 10.10.2026 |
| Wersja kodu | `origin/main` @ `3e5e00d` (gałąź robocza bez zmian kodu poza `docs/audyt/`) |
| Zakres | D. Prawa osób (art. 15–22 RODO), E. Retencja i usuwanie, systemy AI/OCR/support (pkt 5 D i E zadania, `00-ZADANIE.md`) |
| Źródła danych | kod aplikacji i workera, migracje `supabase/migrations/`, testy, `node_modules/pg-boss` (wersja 12.27.0), dokumentacja w repo (`docs/security/*`, `docs/runbooks/*`, `docs/adr/*`); niescalony PR #225 (gałąź `origin/codex/f0-runtime-inventory` @ `686a465`) jako dowód pośredni; **[R3]** fakty z @`a72b567` (odczyt SSH i paneli 10.10) wg `01-STAN-I-GRANICE.md` § 4; jeden test mechanizmu PostgreSQL na syntetycznej bazie lokalnej (opis w RET-03/PRA-03) |
| Ograniczenia | brak dostępu do produkcji (baza, Coolify, logi, kopie), paneli i umów dostawców; treść przepisów wg wiedzy modelu — egress do źródeł pierwotnych zablokowany, WebSearch odrzucony przez właściciela |
| Powiązane | `02-INWENTARZ-I-PRZEPLYWY.md` (INW-NN), `A1-MECHANIZMY-MINIMALIZACJA-ZGODY.md` (MIN-NN, ZGD-NN), `04-PROCESORZY-I-LOKALIZACJE.md` (PRC-NN), `docs/security/audyt/REJESTR-USTALEN.md` (SEC-NN) — odwołuję się do nich, nie powtarzam |
| Recenzja | R3 (osobny agent) — autor nie zatwierdza własnego etapu. **[R3]** Werdykt R3: wymaga poprawek; uwagi R3-U11 – R3-U20 naniesione przez redaktora poprawek 13.10.2026, miejsca oznaczone **[R3]** (lista w „Historia recenzji”) |

## 0. Konwencje

- **Stany:** potwierdzone / częściowe / brak / niezweryfikowane / nie dotyczy
  (z uzasadnieniem). „Nie znaleziono w repo” nie znaczy „nie istnieje”.
- **Klasy:** **P** obowiązek prawny, **O** interpretacja organu (EROD, UODO),
  **S** kryterium SOC 2, **I** praktyka inżynierska.
- **[NZ]** = przepis albo wytyczna podane z pamięci modelu: „niezweryfikowane
  online 2026-10-10 (egress zablokowany) — treść wg wiedzy modelu, do
  potwierdzenia w końcowym review”. Dotyczy wszystkich odwołań do RODO,
  Ordynacji podatkowej, ustawy o VAT i AI Act w tym pliku.
- **[PR225]** = „PR #225 (niescalony), plik:sekcja — pomiar/deklaracja
  operatora, niezweryfikowane w tej sesji”.
- **Ryzyko** (wysokie/średnie/niskie) opisuje skutek dla osób i dla
  rozliczalności administratora, nie prawdopodobieństwo kontroli.
- Role: **FF-A** — FaktFlow jako administrator (konta użytkowników,
  marketing, support, telemetria); **FF-P** — FaktFlow jako podmiot
  przetwarzający w imieniu klienta (faktury, kontrahenci, koszty). Podział
  wg `02-…` § role; tu stosuję go do praw osób.
- Repo jest publiczne: luki bezpieczeństwa opisuję jednym zdaniem.

---

## D. Prawa osób

### D.0. Podsumowanie

Aplikacja ma dwa realne mechanizmy praw osób z kontem: **pobranie kopii
danych konta** (JSON, sesja + MFA) i **usunięcie konta z 14-dniowym okresem
na wycofanie** (hasło, cron co godzinę, atomowe przejęcie). Oba są
przemyślane w szczegółach (fail-closed, liczniki pokrycia, brak tokenu
w bazie), ale **zakres** jest węższy niż deklaracje w polityce
prywatności. Trzy ścieżki usuwania dają trzy różne wyniki: ścieżka
użytkownika działa, ścieżka operatora **przerywa się na wyzwalaczu
dziennika audytu** (potwierdzone mechanizmem PostgreSQL na syntetycznej
bazie), a „usunięcie organizacji” tylko ustawia znacznik, którego nic nie
czyta. Nie ma mechanizmów dla sprostowania danych tożsamości (imię,
e-mail), ograniczenia przetwarzania ani dla osób bez konta (poza wypisem
z poczty) — te prawa idą e-mailem na `pomoc@faktflow.pl` bez rejestru
żądań i bez procedury wyszukiwania.

### D.1. Tabela praw

| Prawo | Mechanizm | Dowód | Stan | Luka | Ryzyko | Rekomendacja |
|---|---|---|---|---|---|---|
| Dostęp i kopia (art. 15) — osoba z kontem | `GET /api/gdpr/export` → `collectUserData` (JSON, 11 sekcji, liczniki `coverage`) | `app/api/gdpr/export/route.ts:12-47`; `lib/gdpr/data-collector.ts:148-257`; przycisk `settings/account/_components/gdpr-section.tsx:62-63` | częściowe | limit 1000 wierszy na sekcję bez dalszego stronicowania; brak: IP/UA z dziennika (`data-collector.ts:174-175`), notatek operatorów o osobie (`admin_user_notes`), wpisów audytu, w których osoba jest przedmiotem a nie aktorem, tożsamości/sesji/czynników MFA z GoTrue, danych u dostawców (PostHog, Sentry, Resend, Stripe); brak informacji z art. 15 ust. 1 lit. a–h (cele, odbiorcy, okresy) w pliku | średnie | PRA-01 |
| Dostęp — osoba bez konta (kontrahent, adresat przypomnienia, subskrybent) | brak narzędzia; e-mail `pomoc@faktflow.pl` | `polityka-prywatnosci/page.tsx:164-166,201`; `lib/site.ts:11`; `docs/runbooks/skrzynka-pomoc.md:10-20` | brak | brak wyszukiwania po e-mailu/NIP przez magazyny, brak weryfikacji tożsamości i rejestru; dla danych FF-P brak ścieżki przekazania do klienta | wysokie | PRA-09, PRA-10 |
| Przenoszenie (art. 20) | ten sam JSON konta; dane firmy — eksporty księgowe (JPK_FA, JPK_V7M, KPiR, CSV, formaty programów FK) | `data-collector.ts:245-248`; `types/database.ts:5630-5638` (`export_format_enum`); `app/actions/exports.ts:93-99` | częściowe | JSON konta to format strukturalny, ale dane „dostarczone” przez osobę w praktyce leżą w organizacji (faktury, kontrahenci, produkty) i nie mają eksportu kompletnego (np. kontrahenci, produkty, załączniki, XML/UPO zbiorczo); polityka obiecuje „JSON / CSV / JPK_FA” (`page.tsx:198`) | średnie | PRA-01, RET-11 |
| Sprostowanie (art. 16) | dane firmy: `app/actions/company-profile.ts`; kontrahenci: `updateContractorAction` | `app/actions/contractors.ts:24`; imię tylko przy rejestracji `app/(auth)/register/actions.ts:70`; brak `updateUser({ email })` w kodzie (grep: tylko zmiana hasła `settings/security/actions.ts:103`, reset `reset-password/actions.ts:53`) | częściowe | brak zmiany imienia i e-maila konta w UI; faktury po wysyłce do KSeF niezmienne — korekta zamiast edycji (wyjątek podatkowy, do review) | średnie | PRA-05 |
| Usunięcie (art. 17) — konto, ścieżka użytkownika | żądanie (sesja + MFA + hasło) → 14 dni → cron `cron.gdpr-process-deletions` co godzinę → blokady → pseudonimizacja audytu → `auth.admin.deleteUser` | `settings/account/actions.ts:35-85`; `lib/gdpr/deletion.ts:97-125,163-210`; `lib/jobs/queues.ts:105`; `lib/jobs/handlers/package-a.ts:47`; `lib/jobs/runners/gdpr-process-deletions.ts:24-61` | częściowe | zostają: treść czatu supportu, e-mail/IP/UA w rejestrze żądań, newsletter, odbicia, zaproszenia po e-mailu, dane u dostawców, kopie; konta tylko z Google nie przejdą ponownego uwierzytelnienia hasłem | wysokie | PRA-02 |
| Usunięcie — ścieżka operatora (`/admin/users`) | `deleteUserGdprAction` | `app/admin/users/actions.ts:133-217` | brak (nie działa dla kont z wpisem audytu) | wyzwalacz append-only blokuje `ON DELETE SET NULL` z `audit_logs`; częściowe skutki przed błędem | wysokie | PRA-03 |
| Usunięcie organizacji (koniec umowy, art. 28 ust. 3 lit. g) | formularz z NIP → `deleted_at`, `hard_delete_at = +30 dni`, wylogowanie | `components/settings/account-actions.ts:22-84`; `app/(dashboard)/settings/account/page.tsx:43-60` | brak (skutek deklarowany, niewykonywany) | `hard_delete_at` nie ma wykonawcy; organizacja dalej przetwarzana (np. odbiór skrzynki KSeF); brak eksportu przed odejściem | wysokie | PRA-04, RET-04 |
| Ograniczenie (art. 18) | brak mechanizmu (brak statusu „zamrożone” dla konta, kontrahenta, faktury) | grep `restrict|ogranicz` w `lib/`, `app/` — brak trafień w kontekście RODO; deklaracja `page.tsx:197` | brak | brak sposobu, by wstrzymać przetwarzanie danych osoby przy zachowaniu przechowywania (np. sporne dane kontrahenta w trakcie wyjaśniania) | średnie | PRA-06 |
| Sprzeciw (art. 21) — marketing bezpośredni | wypis per kategoria e-maili (token HMAC, one-click), przełączniki w ustawieniach, wypis po odbiciu/skardze | `app/api/email/unsubscribe/route.ts:14,130-177`; szczegóły i luki: A1 ZGD-06 | częściowe | newsletter bez wypisu (`newsletter_subscribers.unsubscribed_at` nigdzie nie ustawiane), e-mail bez sekretu wypisu wychodzi bez nagłówka (A1 ZGD-06) | średnie | PRA-07 |
| Sprzeciw (art. 21 ust. 1) — przetwarzanie na podstawie uzasadnionego interesu | brak mechanizmu; tylko e-mail | brak testów równowagi (A1 ZGD-01) | brak | nie wiadomo, które przetwarzania są na lit. f, więc nie ma czego „wyłączyć” | niskie–średnie | PRA-07 |
| Zautomatyzowane decyzje (art. 22) | nie znaleziono decyzji wywołujących skutki prawne wyłącznie automatycznie | `lib/categorization/ai-classifier.ts:91` (pewność 0.7) + `lib/jobs/runners/auto-categorize-inbox.ts:409` (próg 0.9 → `is_reviewed=false`); `lib/flo/flags.ts:41-49` (`payment.score` wyłączone z powodów prawnych) | nie dotyczy (wstępnie) | ocena terminowości kontrahenta JDG (FLO) i automatyczna kategoryzacja kosztów wymagają oceny przed włączeniem/zmianą progu | niskie | PRA-08 |
| Informacja o działaniach i terminy (art. 12 ust. 3–4) | 14 dni + cron (usunięcie), eksport natychmiast; brak rejestru żądań e-mailowych | `deletion.ts:6,107`; `queues.ts:105` | częściowe | brak potwierdzenia wykonania usunięcia dla osoby; brak ewidencji żądań spoza aplikacji; ślad w `audit_logs` znika po 12 mies. | średnie | PRA-11 |

### D.2. Ustalenia PRA-NN

#### PRA-01. Eksport danych konta: bezpieczny, ale niepełny względem art. 15 i deklaracji

- **Stan:** częściowe. **Klasa:** P — art. 15 ust. 1 i 3, art. 20 ust. 1,
  art. 12 ust. 1 i 3 RODO [NZ]; O — wytyczne EROD 01/2022 w sprawie prawa
  dostępu (zakres „wszystkie dane”, bez ograniczania do danych w UI) [NZ];
  S — Privacy (dostęp osób; identyfikator kryterium do potwierdzenia
  w `06-SOC2.md`); I.
- **Dowód — co działa:**
  - uwierzytelnienie zweryfikowaną sesją i wymóg dokończenia MFA, gdy osoba
    ma czynnik (`lib/auth/verified-user.ts:9-26`; mapowanie 401/403/503
    `route.ts:14-19`);
  - nagłówki `Cache-Control: no-store` i `Referrer-Policy: no-referrer`
    (`route.ts:6-9,35-42`); stały komunikat błędu bez treści SDK
    (`route.ts:43-46`);
  - wpis `gdpr.export_requested` w dzienniku z licznikami (`route.ts:21-31`);
  - kolumny wybrane ręcznie: bez kluczy push, skrótów tokenów, `invited_by`,
    `decided_by` innych osób (`data-collector.ts:80-114`);
  - licznik `coverage` z łącznym `count` i błąd, gdy liczby nie da się
    ustalić — plik nie udaje kompletności (`data-collector.ts:74-78`);
  - faktury jawnie wyłączone z uzasadnieniem (`data-collector.ts:245-248`).
- **Dowód — luki:**
  - limit `ROW_LIMIT = 1000` na sekcję i tylko 1000 najnowszych wpisów
    audytu (`data-collector.ts:5,174-177`); `coverage.truncated` informuje
    o ucięciu, ale nie ma drogi do reszty;
  - z dziennika pobierane są `id, action, entity_type, entity_id, metadata,
    created_at` — **bez `ip_address` i `user_agent`** (`data-collector.ts:175`),
    które aplikacja zapisuje przy każdym wpisie (`lib/audit/log.ts:5-17,158-159`);
  - wyszukiwanie po `user_id` = aktor; wpisy o osobie zapisane przez innych
    (np. akcje operatora z `entityId = userId`, `app/admin/users/actions.ts:199-205`)
    nie trafiają do pliku;
  - brak tabel: `admin_user_notes` (notatki operatorów o osobie,
    `00045_admin_panel.sql:19`, zapis `app/admin/users/actions.ts:232-237`),
    **[R3]** z `gdpr_deletion_requests` eksport zawiera status, daty,
    `cancel_reason`, IP i UA (`data-collector.ts:107-111`), bez `user_email`
    i bez `failure_reason`; e-mail osoby jest w części `user` (`:208-214`);
    dane GoTrue (`auth.identities` — np. powiązanie z Google, czynniki MFA,
    sesje, dziennik audytu GoTrue — N-INW-01 w `02-…`);
  - dane u dostawców poza bazą (PostHog: zdarzenia pod `distinctId = user.id`,
    `lib/analytics/server.ts:28,50`; **[R3]** Sentry: kod nie ustawia
    użytkownika (`setSentryUserContext` bez wywołań — A1 MIN-12;
    `scrub.ts:48-51` tylko przycina `user`, gdy jest); zdarzenia mogą
    zawierać `tenant_id` w tagach/`extra` (np. `cert-expiry-alert.ts:211`,
    `settings/billing/actions.ts:187`) i dane w treści błędu; Resend:
    historia wysyłek) — plik o nich milczy;
  - brak części informacyjnej art. 15 ust. 1 lit. a–h (cele, kategorie
    odbiorców, okresy, źródło, prawo skargi) — `notes` opisuje tylko zakres
    pliku (`data-collector.ts:249-255`);
  - metadane własnych wpisów audytu mogą zawierać dane innych osób
    (e-mail zaproszonego, adres odbiorcy faktury, NIP usuniętego kontrahenta —
    lista w A1 MIN-11); osoba sama je wprowadziła w ramach organizacji,
    więc ujawnienie jej samej jest niskiego ryzyka, ale nie jest
    przemyślane jawnie;
  - **brak limitu częstotliwości**: kubełek `gdpr_request` istnieje
    (`lib/rate-limit/index.ts:9`), ale nikt go nie używa (grep — jedno
    trafienie, definicja); brak ponownego potwierdzenia hasłem przed
    pobraniem (porównaj usunięcie: `settings/account/actions.ts:43`);
  - polityka obiecuje „export pełnych danych w 30 dni” i przenoszenie
    „w formacie JSON / CSV / JPK_FA” (`polityka-prywatnosci/page.tsx:194,198`).
- **Luka:** plik nie jest „kopią danych” w rozumieniu art. 15 ust. 3 dla
  osoby z długą historią ani dla danych technicznych (IP/UA) i danych
  u dostawców; deklaracja „pełnych danych” jest nieprawdziwa.
- **Ryzyko:** średnie — mechanizm istnieje i chroni przed ujawnieniem
  danych innych osób, ale niekompletna odpowiedź na żądanie dostępu jest
  typowym przedmiotem skargi.
- **Rekomendacja:** (I) dodać IP/UA z dziennika, `admin_user_notes`
  (z oceną wyjątku dla notatek wewnętrznych — pytanie do review), wpisy
  audytu z `entity_id = userId`; zamiast limitu 1000 — eksport strumieniowy
  albo zadanie w tle z plikiem i krótkim linkiem; sekcja „informacje
  z art. 15” (cele, odbiorcy z listy procesorów, okresy z rejestru retencji,
  źródło); instrukcja dla danych u dostawców (PostHog/Sentry — eksport po
  ID na żądanie przez operatora); limit `gdpr_request` (np. kilka pobrań na
  godzinę na konto) i rozważenie ponownego hasła przy sesji starszej niż
  N minut; poprawić zdanie w polityce. Test: `tests/unit/gdpr-export-*`
  z kontraktem listy tabel (nowa tabela z `user_id` bez decyzji = czerwony
  test), wzorem `tests/unit/backup-readable-tables.test.ts`.

#### PRA-02. Usunięcie konta przez użytkownika: rdzeń poprawny, zakres i wyjątki niedomknięte

- **Stan:** częściowe. **Klasa:** P — art. 17 ust. 1 i 3 lit. b, art. 12
  ust. 3, art. 19 RODO [NZ]; **[R3]** I — usuwanie w kopiach i u procesorów
  jako proponowana praktyka (WYM-72 w `03-…`; O — do potwierdzenia
  w review, status raportu CEF 2025, ZR-45, nieznany; brak wskazanego
  stanowiska organu); S — Privacy (usuwanie).
- **Dowód — przebieg (ścieżka użytkownika):**
  1. żądanie wymaga zweryfikowanej sesji, MFA (gdy włączone) i aktualnego
     hasła (`settings/account/actions.ts:35-44`; `lib/auth/reauth.ts:25-80`
     z limitem prób `reauth.ts:42-46`);
  2. blokada, gdy osoba jest jedyną osobą z prawem do płatności w firmie
     z aktywną subskrypcją — komunikat z nazwami firm (`deletion-blockers.ts:42-87`,
     `actions.ts:80-81`); wyjście: anulować subskrypcję albo nadać rolę
     drugiej osobie (`deletion-blockers.ts:12-14`);
  3. zapis żądania z `scheduled_for = +14 dni`, skrótem SHA-256 tokenu
     anulowania, IP i UA (`deletion.ts:106-115`); e-mail z linkiem
     anulowania (`actions.ts:59-70`); jedno aktywne żądanie (`00071`,
     `deletion.ts:117-122`);
  4. cron co godzinę (`queues.ts:105`, rejestracja `package-a.ts:47`)
     przejmuje żądanie atomowo `pending → processing` (`deletion.ts:166-171`),
     sprawdza ponownie blokadę subskrypcji (`:178-180`) i klucze obce bez
     `ON DELETE` (`gdpr_user_deletion_blockers`, `00113…sql:39-74`;
     `deletion.ts:183-189`), pseudonimizuje wpisy audytu, w których osoba
     jest aktorem (`00052…sql:95-121`), usuwa konto w GoTrue (`deletion.ts:196`)
     i zamyka żądanie (`:198-201`); błąd → `failed` z powodem (`:203-208`);
  5. migracja `00072` (skrót tokenu) — `PLAN-WYDANIA-GDPR.md:16` mówi
     „WSTRZYMANA” (stan 15.09), ale późniejszy raport operatora podaje jej
     wykonanie na `db-1` (`docs/security/DZIENNIK-ODPORNOSCI-CYBER.md:727,757`);
     kod na `main` używa już `cancel_token_hash` (`deletion.ts:112,133`).
     Plan wydania jest więc nieaktualny; stanu bazy nie sprawdziłem.
- **Dowód — co znika kaskadą po `deleteUser`** (akcje kluczy obcych
  w migracjach): `public.users` (`00001…sql:37`, CASCADE), członkostwa
  (`00036…sql:19`), zaproszenia **wysłane** przez osobę (`00036…sql:59`,
  CASCADE — znikają też oczekujące zaproszenia innych osób), prośby
  o dołączenie (`00036…sql:87`), urządzenia push (`00032…sql:9`),
  preferencje e-mail (`00049…sql:41`), kody MFA (`00050…sql:17`),
  notatki operatorów (`00045…sql:19`); tabele `auth.*` sprząta GoTrue
  (zakres niezweryfikowany, N-INW-01).
- **Dowód — co zostaje** (poza danymi organizacji, które należą do klienta):
  - rozmowy i wiadomości supportu: `support_conversations.user_id ON DELETE
    SET NULL` (`00054…sql:43`) — pełna treść czatu zostaje bez właściciela
    i bez retencji (INW-01, INW-06);
  - `gdpr_deletion_requests`: `user_email`, `ip_address`, `user_agent`
    bezterminowo (`00051…sql:33-43`; `user_id` → NULL);
  - `newsletter_subscribers`, `email_bounces`, `organization_invitations`
    adresowane na e-mail osoby (wyszukiwane w eksporcie po e-mailu,
    `data-collector.ts:102-113`, ale nieusuwane);
  - wpisy audytu o osobie zapisane przez innych i `details_json` (A1 MIN-11);
  - dane u dostawców: PostHog (osoba i zdarzenia po `distinctId`; **[R3]**
    przy organizacji także zdarzenia serwerowe z `distinctId = tenantId`,
    `submit-invoice.ts:1933-1940`, i profil grupy `tenant`,
    `analytics-identify.tsx:19`), Sentry (**[R3]** kod nie ustawia
    użytkownika; `tenant_id` w tagach/`extra` i dane w treści błędu), Resend (historia wysyłek), Stripe (klient jest
    przypisany do firmy; e-mail rozliczeniowy może być e-mailem osoby,
    `lib/stripe/customer-email.ts:9-16`) — kod nie wywołuje żadnego API
    usuwania (grep `customers.del`, `persons`, `delete` w `lib/analytics`,
    `lib/stripe` — brak);
  - zadania pg-boss z payloadem do 7 dni po zakończeniu (RET-08), kopie
    (RET-09).
- **Dowód — luki procesowe:**
  - konta zarejestrowane wyłącznie przez Google nie mają hasła, a żądanie
    i anulowanie wymagają `signInWithPassword` (`reauth.ts:60-63`;
    pole hasła w `gdpr-section.tsx:85-86,101`); UI nie podpowiada drogi
    (np. najpierw ustawić hasło resetem) — czy reset ustawi hasło takiemu
    kontu, zależy od konfiguracji GoTrue (niezweryfikowane);
  - po `executed` osoba nie dostaje potwierdzenia (jedyny wysyłany e-mail
    RODO to zaplanowanie, `lib/email/send.ts:510`; szablon
    `sendAccountDeletionConfirmationEmail` istnieje, `send.ts:479`, ale nie
    ma wywołań — grep); po `failed` — tylko komunikat
    w Sentry (`gdpr-process-deletions.ts:47-56`), bez powiadomienia osoby,
    bez widoku w panelu operatora (grep `gdpr_deletion_requests` w
    `app/admin`, `lib/admin` — brak trafień), choć runbook opisuje zakładkę
    „GDPR” i przycisk „Cancel deletion” (`docs/runbooks/unlock-account.md:134-136`)
    oraz token „HMAC + 14d expiry” (`:125-126`) — opis nieaktualny;
  - „osierocony” `processing` wymaga ręcznej kontroli (komentarz
    `deletion.ts:158-162`, `00070…sql` sekcja „Semantyka”), ale nie ma
    runbooka ani zapytania kontrolnego;
  - wyścig: wpis audytu zapisany przez wciąż zalogowaną osobę między
    pseudonimizacją (`deletion.ts:190-195`) a `deleteUser` (`:196`)
    zatrzyma usunięcie na wyzwalaczu (mechanizm z PRA-03) po nieodwracalnej
    pseudonimizacji — prawdopodobieństwo niskie, skutek `failed`;
  - jedyny właściciel bez subskrypcji: konto znika, firma zostaje bez
    nikogo, kto może się zalogować (blokada dotyczy tylko płatności,
    `deletion-blockers.ts:42-87`) — dane firmy (faktury, kontrahenci)
    zostają bez dysponenta i bez wykonawcy usunięcia (RET-04).
- **Luka:** usunięcie nie obejmuje czatu, rejestru żądań, list e-mailowych
  i dostawców; brak potwierdzenia i ścieżki operatora dla `failed`/
  `processing`; osoby z logowaniem Google nie mają samoobsługi; los
  organizacji jedynego właściciela nie jest rozstrzygnięty.
- **Ryzyko:** wysokie — dotyczy kompletności art. 17 i treści swobodnych
  (czat), a firma bez właściciela to dane klienta bez administratora
  zdolnego wydać polecenie.
- **Rekomendacja:** (I) w `executeGdprRequest` przed `deleteUser`:
  usunięcie albo anonimizacja treści `support_messages` osoby, wypis
  i usunięcie wierszy po e-mailu (newsletter, odbicia, zaproszenia
  otrzymane), zadanie usunięcia osoby w PostHog i Sentry (lub udokumentowana
  procedura operatora z terminem), po wykonaniu e-mail potwierdzający;
  `gdpr_deletion_requests` — po wykonaniu zastąpić e-mail skrótem
  (z solą) i usunąć IP/UA po okresie rozliczalności (do review); widok
  i akcje w `/admin` dla `failed`/`processing` z runbookiem; dla kont
  Google — ponowne uwierzytelnienie przez dostawcę (reauth OAuth) albo
  potwierdzenie e-mailem; blokada lub decyzja dla jedynego właściciela
  bez subskrypcji (przekazanie firmy, usunięcie firmy z obowiązkowymi
  wyjątkami albo jawna zgoda na pozostawienie danych do końca retencji).
  Każdy krok z efektem zewnętrznym idempotentny (protokół w `AGENTS.md`).
  Testy na bazie (`tests/rls-*`): po wykonaniu żądania brak wierszy
  osoby w każdej tabeli z listy kontraktu.

#### PRA-03. Usunięcie konta przez operatora przerywa się na wyzwalaczu audytu, po częściowych skutkach

- **Stan:** brak (mechanizm nie osiąga celu). **Klasa:** P — art. 17,
  art. 5 ust. 2 RODO [NZ]; S — Processing Integrity/Privacy; I.
  Uszczegóławia INW-02 (`02-…`), gdzie skutek oznaczono jako
  „niezweryfikowany na bazie”.
- **Dowód:**
  - `deleteUserGdprAction` kolejno: oznacza firmy, w których osoba jest
    aktywnym właścicielem, jako usunięte (`app/admin/users/actions.ts:149-180`),
    odwołuje wszystkie członkostwa (`:182-189`), potem woła
    `auth.admin.deleteUser` (`:191-197`) — **bez** wywołania
    `anonymize_user_audit_logs` (porównaj `lib/gdpr/deletion.ts:190-195`)
    i bez sprawdzenia blokad (`gdpr_user_deletion_blockers`, subskrypcja);
  - `deleteUser` usuwa `auth.users` → kaskada usuwa `public.users`
    (`00001…sql:37`) → `audit_logs.user_id REFERENCES public.users ON
    DELETE SET NULL` (`00001…sql:165`) → `UPDATE` na `audit_logs` →
    wyzwalacz `trg_audit_logs_prevent_update` rzuca wyjątek bez flagi
    `app.allow_audit_purge` (`00052…sql:16-35`);
  - każde konto logujące się hasłem ma wpis `auth.login`
    (`app/(auth)/login/actions.ts:67-71`), więc dotyczy to praktycznie
    każdego konta;
  - **sprawdzenie mechanizmu:** lokalny PostgreSQL 16, syntetyczna baza
    `audyt_scratch` (utworzona i usunięta), dwie tabele odwzorowujące
    klucz `ON DELETE SET NULL` i wyzwalacz z `00052`; wynik dla wiersza
    z wpisem: `ERROR: append-only (UPDATE blocked)` w kontekście
    `UPDATE ONLY "public"."audit_t" SET "user_id" = NULL` (akcja klucza
    obcego), wiersz bez wpisu — `DELETE 1`. To potwierdza zachowanie
    PostgreSQL, **nie** stan produkcji (nie sprawdziłem, czy na `db-1`
    wyzwalacz i klucz mają tę postać; obie pochodzą z migracji w repo);
  - test jednostkowy ścieżki operatora mockuje bazę i nie obejmuje
    dziennika (`tests/unit/admin-gdpr-membership-scope.test.ts:3-13`);
    test na bazie usunięcia konta nie tworzy wpisów audytu
    (`tests/rls-uprawnienia.test.ts:143-175`).
- **Skutek:** operator widzi błąd z treścią z GoTrue (`actions.ts:194-196`),
  a firmy zostają oznaczone jako usunięte i członkostwa odwołane — konto
  żyje bez dostępu do firm; komunikat sukcesu („org-y w retencji 30 dni do
  hard delete”, `:215`) i tak obiecuje skutek, którego nie ma (RET-04).
  Ponadto oznaczenie obejmuje firmy, w których jest drugi właściciel —
  zapytanie wybiera tylko po roli osoby (`:152-158`).
- **Ryzyko:** wysokie — jedyna ścieżka operatora do realizacji żądania
  przyjętego e-mailem nie działa i zostawia niespójny stan.
- **Rekomendacja:** (I) usunąć osobną logikę: akcja operatora tworzy
  żądanie (bez 14 dni, z powodem i autorem) i woła tę samą funkcję co cron;
  przed naprawą czerwony test na bazie (`tests/rls-*`: konto z wpisem
  `auth.login` → `deleteUser` musi przejść po wspólnej ścieżce); rozważyć
  zmianę klucza `audit_logs.user_id` na brak klucza obcego albo funkcję
  `SECURITY DEFINER` ustawiającą flagę w tej samej transakcji (decyzja
  projektowa — dziennik bez klucza obcego to też wybór rozliczalności).

#### PRA-04. „Usuń organizację”: znacznik bez wykonawcy, firma dalej przetwarzana

- **Stan:** brak. **Klasa:** P — art. 28 ust. 3 lit. g (usunięcie albo
  zwrot danych po zakończeniu usług), art. 5 ust. 1 lit. e, art. 13
  (rzetelna informacja) RODO [NZ]; I.
- **Dowód:**
  - właściciel wpisuje NIP; akcja ustawia `deleted_at`, `hard_delete_at =
    +30 dni`, `is_active = false`, zapisuje `retention.deletion_requested`
    i wylogowuje (`components/settings/account-actions.ts:22-84`); UI:
    „Operacja jest nieodwracalna po 30 dniach (zgodnie z harmonogramem
    retencji)” (`settings/account/page.tsx:47-52`);
  - `hard_delete_at` nie czyta żaden job (grep: tylko ta akcja, akcja
    operatora i `00009_retention.sql:31`); `retention-delete` czyta wyłącznie
    `invoices.scheduled_deletion_at` (`lib/jobs/runners/retention-delete.ts:29-36`);
  - `deleted_at`/`is_active` filtrują tylko FLO, metryki i flagi operatora
    (`lib/flo/tick.ts:305-306`, `lib/analytics/platform-metrics.ts:70-71`,
    `lib/admin/flags.ts:59`); np. odbiór skrzynki KSeF wybiera firmy tylko po
    certyfikacie i środowisku (`lib/jobs/runners/inbox-polling.ts:136-144`),
    a automatyczna kategoryzacja tych faktur wysyła dane sprzedawców do
    Anthropic (AI-02); nie znalazłem też filtra w kontekście sesji
    (`lib/supabase/middleware.ts`, `auth-context.ts` — grep `deleted_at`
    bez trafień), więc członkowie po ponownym zalogowaniu najpewniej
    nadal pracują w firmie (niezweryfikowane w przeglądarce);
  - brak propozycji pełnego eksportu przed odejściem i brak anulowania
    subskrypcji w tej ścieżce; cofnięcie — „skontaktuj się z pomocą”
    (`page.tsx:50-51`), bez narzędzia w `/admin`;
  - polityka: „usunięcie konta / organizacji z poziomu aplikacji
    (właściciel, po weryfikacji m.in. NIP) … najpóźniej w ciągu miesiąca”
    (`polityka-prywatnosci/page.tsx:166-174`) oraz „Dane konta: do 30 dni po
    anulowaniu subskrypcji” (`:229`) — żadnego z tych skutków kod nie
    realizuje.
- **Luka:** klient nie może zakończyć powierzenia z usunięciem danych;
  deklaracja w UI i polityce jest nieprawdziwa; dane po „usunięciu” są
  dalej pobierane z KSeF i wysyłane do AI.
- **Ryzyko:** wysokie — dotyczy wszystkich danych klienta (faktury,
  kontrahenci, koszty, pliki) i jego kontrahentów.
- **Rekomendacja:** (I) natychmiast: każdy cron i kontekst sesji pomija
  firmy z `deleted_at` (wspólny filtr + test kontraktu listy jobów);
  zmienić tekst UI do czasu wdrożenia wykonawcy; docelowo job
  `hard_delete_at` z podziałem: dane objęte obowiązkiem przechowania
  (faktury i dowody księgowe — decyzja review, czy FaktFlow ma je
  przechowywać po zakończeniu umowy, czy zwrócić klientowi i usunąć),
  reszta usuwana z plikami S3; przed usunięciem — pełny eksport (ZIP z XML,
  UPO, PDF, JSON kontrahentów/produktów/kosztów) z linkiem ważnym krótko;
  anulowanie subskrypcji w tej samej ścieżce. **[R3]** Kaskadę z `tenants`
  zablokują dwa wyzwalacze: audytu (`audit_logs.tenant_id`, INW-02)
  i faktur (`b_guard_invoice_pending_content`, `00132…sql:63-72` — `DELETE`
  faktury wysłanej do KSeF odrzucany dla każdej roli, RET-02) — rozwiązać
  razem.

#### PRA-05. Sprostowanie: dane firmy i kontrahentów tak, tożsamość konta nie; faktury — korekta

- **Stan:** częściowe. **Klasa:** P — art. 16 RODO [NZ]; ustawa o VAT
  art. 106j (faktura korygująca) i art. 112 [NZ]; I.
- **Dowód:**
  - imię zapisywane raz, w metadanych GoTrue przy rejestracji
    (`app/(auth)/register/actions.ts:70`); `public.users` aktualizowane tylko
    w polu `last_active_tenant_id` (`app/actions/organizations.ts:176-179,232-235`);
    brak formularza profilu na `settings/account/page.tsx`;
  - brak zmiany adresu e-mail (grep `updateUser(` — tylko hasło:
    `settings/security/actions.ts:103`, `reset-password/actions.ts:53`);
  - dane firmy edytowalne (`app/actions/company-profile.ts:39`,
    `tax-office.ts`, `vat-exemption.ts`), kontrahenci — edycja i usunięcie
    (`app/actions/contractors.ts:24,95-125`; usunięcie nie zmienia kopii
    danych nabywcy na fakturach, `:90-93`);
  - faktury: po przyjęciu w KSeF treść jest zamrożona wyzwalaczami
    (np. `00119_invoice_pending_content_freeze.sql`, `00122_invoice_delivery_history_guard.sql`),
    a błąd poprawia się fakturą korygującą (`00118`, `00133`, `00135`).
- **Interpretacja (do review):** faktura jest dokumentem podatkowym;
  sprostowanie danych nabywcy na fakturze wystawionej odbywa się przez
  fakturę korygującą, a oryginał zostaje w KSeF i w archiwum — art. 16
  RODO realizuje się wtedy przez korektę, nie przez edycję. To założenie,
  nie potwierdzona wykładnia [NZ].
- **Luka:** osoba nie poprawi imienia ani e-maila konta bez pomocy
  operatora (który też nie ma do tego narzędzia — `app/admin/users/actions.ts`
  nie ma akcji edycji); brak notyfikacji odbiorców o sprostowaniu (art. 19)
  — np. Stripe ma kopię e-maila rozliczeniowego (`lib/stripe/customer-email.ts:9-16`
  istnieje, ale nie jest spięte ze zmianą e-maila konta, bo zmiany nie ma).
- **Ryzyko:** średnie (e-mail jest identyfikatorem logowania i adresem
  wszystkich powiadomień).
- **Rekomendacja:** (I) formularz „Imię i nazwisko” oraz zmiana e-maila
  przez GoTrue z potwierdzeniem na oba adresy, wpis w audycie,
  synchronizacja do Stripe (`syncStripeCustomerEmail`); w polityce zdanie
  o korekcie faktur jako formie sprostowania (po review).

#### PRA-06. Ograniczenie przetwarzania: brak mechanizmu

- **Stan:** brak. **Klasa:** P — art. 18 RODO [NZ]; I.
- **Dowód:** brak statusu „ograniczone” dla konta, kontrahenta czy
  faktury; jedyne „zamrożenie” to blokady integralności faktur (PRA-05)
  i ręczne odblokowanie/zawieszenie konta opisane w
  `docs/runbooks/unlock-account.md` (cel: bezpieczeństwo, nie RODO).
  Polityka deklaruje prawo (`polityka-prywatnosci/page.tsx:197`).
- **Luka:** nie da się wstrzymać np. przypomnień, kategoryzacji AI,
  wysyłki do dostawców dla danych spornej osoby przy zachowaniu
  przechowywania.
- **Ryzyko:** średnie — żądania z art. 18 są rzadkie, ale bez mechanizmu
  jedyną odpowiedzią byłoby usunięcie albo nic.
- **Rekomendacja:** (I) minimalnie: procedura operatora (runbook) z listą
  przełączników, które już istnieją — wyłączenie przypomnień dla
  kontrahenta (`app/actions/reminders.ts:171,245`), dezaktywacja konta,
  wyłączenie analityki; docelowo flaga `processing_restricted` na
  kontrahencie i koncie respektowana przez joby (decyzja po review, czy
  w roli FF-P to w ogóle zadanie FaktFlow, czy klienta).

#### PRA-07. Sprzeciw: marketing częściowo, uzasadniony interes bez mechanizmu

- **Stan:** częściowe. **Klasa:** P — art. 21 ust. 1–3 RODO; przepisy
  o marketingu elektronicznym (PKE) [NZ]; I. Szczegóły marketingu i zgód:
  A1 ZGD-06 (nie powtarzam).
- **Dowód:** wypis per kategoria z tokenem i one-click
  (`app/api/email/unsubscribe/route.ts:14,130-177`), ustawienia
  powiadomień (`settings/notifications/`), automatyczny wypis po skardze
  (A1 ZGD-06); newsletter bez wypisu i bez wysyłki (`app/actions/newsletter.ts:65-71`,
  INW-14); wycofanie zgody analitycznej — A1 ZGD-05.
- **Luka:** brak mechanizmu sprzeciwu wobec przetwarzań na lit. f
  (dziennik audytu z IP, analityka serwerowa, monitoring) — najpierw
  potrzebna mapa podstaw (A1 ZGD-01).
- **Ryzyko:** niskie–średnie.
- **Rekomendacja:** (I) po mapie podstaw — procedura obsługi sprzeciwu
  (kto ocenia, jakie wyłączenia są technicznie możliwe), wypis z newslettera
  przed pierwszą wysyłką.

#### PRA-08. Zautomatyzowane decyzje (art. 22): nie znaleziono; dwie funkcje wymagają oceny przed zmianą

- **Stan:** nie dotyczy (wstępnie — brak decyzji wyłącznie
  zautomatyzowanych o skutkach prawnych dla osób w kodzie `3e5e00d`).
  **Klasa:** P — art. 22, art. 13 ust. 2 lit. f RODO; AI Act (systemy
  wysokiego ryzyka — ocena zdolności kredytowej osób fizycznych) [NZ]; I.
- **Dowód:**
  - kategoryzacja kosztów: wynik modelu ma stałą pewność 0.7
    (`lib/categorization/ai-classifier.ts:91`), a koszt z KSeF jest
    oznaczany jako przejrzany tylko przy pewności > 0.9
    (`auto-categorize-inbox.ts:409`) — wynik AI zawsze wymaga przeglądu
    człowieka; kolumna KPiR wpływa jednak na rozliczenie podatkowe klienta
    (JDG = osoba fizyczna), więc zmiana progu albo pewności zmieniłaby ocenę;
  - FLO: `payment.score` (ocena terminowości kontrahenta, przy JDG —
    osoby fizycznej) wyłączone z powodów prawnych (`lib/flo/flags.ts:41-49`);
    pozostałe działania FLO to propozycje do zatwierdzenia przez klienta
    (żeton w `flo_approvals`, A1 ZGD-07);
  - eskalacja czatu (`ai_uncertain`) i kategoria rozmowy ustawiane przez
    model (`app/api/support/chat/route.ts` — blok „Auto-kategoryzacja +
    eskalacja”) nie są decyzją o osobie;
  - wyłącznik rejestracji działa globalnie, nie per osoba
    (`00102_signup_gate_hook.sql:1-11`).
- **Luka:** brak; ryzyko pojawi się przy włączeniu `payment.score` albo
  automatycznym zatwierdzaniu kategorii AI.
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) test kontraktu: wynik AI nigdy nie ustawia
  `is_reviewed = true`; wpis w rejestrze funkcji AI z warunkiem oceny
  art. 22/AI Act przed włączeniem `payment.score`.

#### PRA-09. Osoby bez konta: kanał e-mailowy bez procedury, weryfikacji i wyszukiwania

- **Stan:** brak. **Klasa:** P — art. 12 ust. 2, 3 i 6, art. 15–17 RODO
  [NZ]; O — wytyczne EROD 01/2022 (weryfikacja tożsamości proporcjonalna,
  bez nadmiarowych dokumentów) [NZ]; S — Privacy; I.
- **Dowód:**
  - kanał: `pomoc@faktflow.pl` (`polityka-prywatnosci/page.tsx:164-166,201`,
    `lib/site.ts:11`); poczta przez Cloudflare Email Routing do prywatnych
    skrzynek i powiadomienie w Telegramie z kategorią „RODO”
    (`docs/runbooks/skrzynka-pomoc.md:16-20`; PRC-08); runbook z 1.10
    odnotowywał brak rekordów MX (`skrzynka-pomoc.md:10-11`) — czy kanał
    działa dziś, niezweryfikowane;
  - kategorie osób bez konta i miejsca ich danych (wg `02-…`): kontrahenci
    i nabywcy (`contractors`, `invoices.buyer_data`, pliki XML/PDF w S3,
    Glacier), adresaci faktur i przypomnień (`payment_reminders`,
    `flo_approvals`, metadane audytu), **[R3]** księgowe z linkiem dostępu
    (`accountant_access` — imię/nazwa i e-mail, `export_jobs.emailed_to`
    — adresy księgowej i CC), subskrybenci (`newsletter_subscribers`),
    zaproszeni (`organization_invitations`), adresy z odbić
    (`email_bounces`), osoby z formularza kontaktowego (nie znaleziono
    formularza — INW-14), czat bez konta (nie istnieje — czat wymaga
    logowania, `app/api/support/chat/route.ts:62-68`);
  - brak narzędzia operatora do wyszukania osoby po e-mailu/NIP przez te
    magazyny (grep w `app/admin`, `lib/admin`, `scripts/` — brak; panel
    `/admin/users` listuje tylko konta, `app/admin/users/page.tsx:44-145`), brak
    rejestru żądań (jedynym rejestrem jest `gdpr_deletion_requests`, tylko
    dla kont), brak procedury weryfikacji tożsamości i terminów (runbooki:
    `docs/runbooks/` — żaden nie opisuje żądań osób).
- **Luka:** żądanie osoby bez konta zależy od pamięci operatora; nie da
  się wykazać terminu miesiąca (art. 12 ust. 3) ani kompletności
  przeszukania.
- **Ryzyko:** wysokie — kontrahenci klientów to największa grupa osób
  w systemie i nie mają z FaktFlow żadnej relacji.
- **Rekomendacja:** (I) runbook „Żądanie osoby” (przyjęcie, rola FF-A
  czy FF-P, weryfikacja, termin, odpowiedź, wpis do rejestru); skrypt
  operatora `scripts/ops/` (zgodnie z `AGENTS.md` pkt 9) wyszukujący
  e-mail/NIP we wskazanych tabelach i prefiksach S3 i zwracający tylko
  liczniki per magazyn/organizację; tabela rejestru żądań z datami
  przyjęcia, przedłużenia i zamknięcia (bez treści). Dla danych FF-P —
  przekazanie klientowi (PRA-10).

#### PRA-10. FaktFlow jako procesor: narzędzia klienta są, kanał przekazania żądań nie

- **Stan:** częściowe. **Klasa:** P — art. 28 ust. 3 lit. e (pomoc
  administratorowi w realizacji praw), art. 28 ust. 3 lit. g RODO [NZ]; I.
- **Dowód:** klient może edytować i usuwać kontrahentów (`contractors.ts:24,95`),
  wyłączyć przypomnienia dla kontrahenta (`app/actions/reminders.ts:245`),
  eksportować dane księgowe (`app/actions/exports.ts`); nie może usunąć
  faktury wystawionej w KSeF (wyzwalacze integralności, PRA-05), co jest
  zgodne z obowiązkiem przechowania [NZ]; kosztów usuniętych przez klienta
  — mechanizm istnieje (`app/actions/expenses.ts`, zakres plików: RET-06).
  Brak: umowy powierzenia (A1 ZGD-02), procedury „żądanie dotyczy danych
  klienta → przekaż klientowi w N dni”, eksportu danych jednej osoby
  (np. wszystkie faktury i przypomnienia dla danego NIP-u/e-maila) dla
  klienta, który musi odpowiedzieć swojemu kontrahentowi.
- **Luka:** klient nie ma narzędzia do odpowiedzi na art. 15 swojego
  kontrahenta poza ręcznym filtrowaniem list; FaktFlow nie ma procedury
  przekierowania żądań.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) w umowie powierzenia — termin powiadomienia
  klienta o żądaniu; w aplikacji — widok kontrahenta z listą dokumentów
  i e-maili do niego oraz eksport tego zestawu.

#### PRA-11. Ewidencja i terminy: rozliczalność wygasa z dziennikiem

- **Stan:** częściowe. **Klasa:** P — art. 5 ust. 2, art. 12 ust. 3–4
  RODO [NZ]; S — Privacy (rejestr żądań); I.
- **Dowód:** eksport i żądania usunięcia zapisują się w `audit_logs`
  (`route.ts:21-31`, `settings/account/actions.ts:72-75,100-103`,
  `gdpr/cancel/actions.ts:19-22`), a dziennik jest kasowany w całości po
  12 miesiącach (`lib/jobs/runners/cleanup-audit-logs.ts:19,40`,
  `00052…sql:53-74`); `gdpr_deletion_requests` zostaje bezterminowo
  (RET-12). Brak ewidencji żądań przyjętych e-mailem (PRA-09).
- **Luka:** po roku nie da się wykazać, że eksport wydano; odwrotnie —
  e-mail osoby usuniętej zostaje na zawsze.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) jeden rejestr żądań (konto i e-mail) z okresem
  przechowania ustalonym w review (np. okres przedawnienia roszczeń),
  bez kopiowania treści danych; wpisy RODO w audycie wyłączone z
  12-miesięcznego czyszczenia albo przeniesione do rejestru.

---

## E. Retencja i usuwanie

### E.0. Podsumowanie

W kodzie są **cztery działające reguły z wykonawcą**: dziennik audytu
(12 miesięcy, całość), log przebiegów jobów (3 miesiące), pamięć podręczna
walidacji kontrahentów (24 h + 7 dni) i przycinanie surowych zdarzeń Stripe
(90 dni). Do tego **biblioteczne** reguły pg-boss (7/14 dni) i TTL w Redisie.
Reguła dla faktur („10 lat”) jest zaimplementowana jako „2 lata do
archiwum + 8 lat od dnia archiwizacji”, zależy od niewdrożonego Glaciera
i ma dwie wady, które ujawnią się przy pierwszym realnym przebiegu
(RET-01, RET-02); **[R3]** do tego wyzwalacz `b_guard_invoice_pending_content`
(`00132…sql:63-72`) odrzuca `DELETE` każdej faktury wysłanej do KSeF dla
każdej roli, więc usunięcie takich faktur po terminie dziś nie może się
udać (RET-02). Większość pozostałych danych — koszty, kontrahenci,
czat, rejestr żądań RODO, newsletter, zdjęcia dokumentów, eksporty,
organizacje „usunięte” — **nie ma reguły ani wykonawcy** (zgodnie
z INW-01/INW-03 w `02-…`; tu uzupełniam o dowody wykonawców i bieg okresu).
Kopie nie mają procedury ponownego usunięcia po odtworzeniu (INW-04).

### E.1. Tabela retencji

Rodzaje: **TD** — twarde usunięcie wiersza/pliku; **PS** — pseudonimizacja
(zerowanie części kolumn); **SD** — soft delete (znacznik); **TTL** —
wygaśnięcie klucza/linku; **brak**.

**[R3]** Kolumna „Podstawa” (wymóg pkt 5E zadania) podaje, co w repo
uzasadnia regułę (deklaracja, komentarz, dokument decyzji), a gdy nic —
„brak podstawy w repo”; podstawy proponowane są propozycją do końcowego
review, nie ustaleniem prawnym. Wiersze `accountant_access`,
`export_jobs.emailed_to`, `payment_reminders`, Slack i logi `_supabase`
dopisano po recenzji R3.

| Dane / magazyn | Reguła w kodzie | Podstawa (w repo / proponowana do review) **[R3]** | Początek biegu | Rodzaj | Dowód | Stan | Luka |
|---|---|---|---|---|---|---|---|
| Faktury: wiersz `invoices` (+ kaskadą `invoice_line_items`, `ksef_submissions`, `xml_documents`) i pliki XML, próby XML, PDF, UPO, PDF wezwań, kopie w Glacier | archiwizacja XML do Glacier dla faktur z `issue_date` < dziś − 2 lata i z `xml_storage_path`; `scheduled_deletion_at = dzień archiwizacji + 8 lat`; cron 04:00 usuwa pliki, potem wiersze (paczki po 100) | deklaracja projektu 10 lat (`AGENTS.md`) i polityka „10 lat (art. 70 § 1 OP)” (`polityka-prywatnosci/page.tsx:230`); proponowana: przepisy podatkowe klienta [NZ] — RET-01 | **dzień wykonania joba archiwizacji** (nie koniec roku podatkowego, nie termin płatności podatku) | TD (pliki + wiersz) | `lib/jobs/runners/archive-old-invoices.ts:20-33,97-108`; `lib/jobs/runners/retention-delete.ts:26-85`; `lib/retention/invoice-files.ts:41-108`; crony `lib/jobs/queues.ts:89,123` | częściowe | `tenants.retention_years` nieużywane; faktury bez XML nigdy nie dostają terminu; bez AWS nic nie dostaje terminu; DELETE wsadowy pada na kluczach obcych (RET-01, RET-02); **[R3]** `DELETE` wysłanych faktur blokowany wyzwalaczem `00132` dla każdej roli (RET-02) |
| Faktury Stripe (sprzedaż FaktFlow) | usunięcie tylko przez serwis po terminie | jak wyżej; dla faktur sprzedaży FaktFlow — obowiązek własny FF jako podatnika [NZ] (RET-01) | jak wyżej | TD | `00079_stripe_vat_invoice_atomicity.sql:73-84` | częściowe | jak wyżej (termin ustawia ten sam job) |
| Koszty `expenses`, `kpir_entries`, `ocr_jobs` | brak | brak reguły; deklaracja „10 lat” dotyczy „danych fakturowych” (`AGENTS.md`); proponowana: przepisy podatkowe klienta [NZ] — RET-05 | — | brak; usunięcie kosztu przez klienta — TD wiersza | `app/actions/expenses.ts:413-444`; grep `expenses|kpir_entries` w `lib/jobs/runners/retention-delete.ts`, `lib/retention/` — brak | brak | dowody księgowe klienta bez reguły i bez terminu (RET-05) |
| Zdjęcia/PDF dokumentów kosztowych `tenants/{t}/expenses/…` | usuwane tylko przy nieudanym zapisie | jak koszty (RET-05, RET-06) | — | TD (wyjątkowo) | `app/actions/expenses.ts:171,185`; usunięcie kosztu nie woła `deleteExpensePhoto` (`:413-444`) | brak | plik zostaje po usunięciu kosztu i po „usunięciu” firmy (RET-06) |
| Kontrahenci, produkty, płatności, importy płatności | brak (kontrahent — usunięcie ręczne przez klienta) | brak podstawy w repo | — | TD ręczne | `app/actions/contractors.ts:95-125`; INW-01 | brak | RET-05 |
| Eksporty `export_jobs`, `export_files` + pliki `exports/{t}/…` | komentarz „Pliki usuwane po 90 dniach z R2”, brak kodu | brak podstawy w repo (komentarz o 90 dniach bez uzasadnienia) | — | brak | `supabase/migrations/00024_accountant_copilot.sql:211`; INW-03 | brak | deklaracja bez wykonawcy (RET-06, RET-07) |
| Importy `imports/{t}/…` | „tymczasowe”, brak usuwania | brak podstawy w repo | — | brak | `lib/import/file-storage.ts:1-3`; grep `DeleteObjectCommand` — brak wywołań dla importów | brak | RET-06 |
| Linki podpisane do plików | 300 s (domyślnie), 3600 s (zdjęcie kosztu), **7 dni** (paczka księgowa e-mailem) | techniczna (I), bez dokumentu | wygenerowanie | TTL linku | `lib/storage/r2.ts:498-517`; `lib/storage/expenses.ts:101`; `lib/jobs/runners/co-pilot-monthly.ts:491-495` | potwierdzone (kod) | link-okaziciel 7 dni w poczcie (RET-07, INW-19) |
| `audit_logs` | DELETE wszystkiego starszego niż 12 mies. (minimum 6), cron 1. dnia miesiąca 03:00 | brak udokumentowanej; polityka 12 mies. (`polityka-prywatnosci/page.tsx:215,231`); [PR225] decyzja 13 mies./10 lat — RET-03 | `created_at` wpisu | TD | `lib/jobs/runners/cleanup-audit-logs.ts:19,38-40`; `00052_audit_logs_immutable_trigger.sql:53-74`; `queues.ts:91` | potwierdzone (kod) | jeden okres dla zdarzeń dostępowych, finansowych i RODO; sprzeczne deklaracje (RET-03) |
| `audit_logs` — wpisy osoby przy usunięciu konta | zerowanie `user_id`, `ip_address`, `user_agent`, `metadata` | żądanie usunięcia (art. 17 RODO [NZ]); zakres pseudonimizacji — decyzja projektu bez dokumentu | wykonanie żądania | PS | `00052…sql:95-121`; `lib/gdpr/deletion.ts:190-195` | częściowe | tylko wpisy, gdzie osoba jest aktorem; `details_json` zostaje (A1 MIN-11) |
| `inngest_run_log` (przebiegi jobów, bez payloadu, błąd po scrubbingu) | DELETE > 3 mies. (ten sam przebieg) | techniczna (I), bez dokumentu | `created_at` | TD | `00052…sql:77-78`; `lib/jobs/run-log.ts:2-10,33-41` | potwierdzone (kod) | — |
| `ksef_health_log` (bez danych osobowych) | komentarz „Retencja 3mc”, brak kodu | techniczna (I), tylko komentarz | — | brak | `00046_system_dashboard.sql:15-18,44-45`; funkcja czyszcząca nie dotyka tabeli (`00052…sql:53-86`) | brak | rozjazd komentarza i kodu (niskie) |
| `validation_cache` (wyniki VIES/biała lista po NIP, wspólne dla klientów) | `expires_at` 24 h; DELETE 7 dni po wygaśnięciu, cron 04:00 | techniczna (I), bez dokumentu | zapis | TD | `00022_validation_infrastructure.sql:45,110-121`; `lib/validation/cache.ts:165`; `lib/jobs/runners/nightly-validation-recheck.ts:20-24`; `queues.ts:120` | potwierdzone (kod) | — |
| `stripe_webhook_events` | po 90 dniach od przetworzenia `payload` przycinany do id i typu; wiersz zostaje | minimalizacja (I), `00109…sql:7-10` | przetworzenie | PS (minimalizacja) | `00109_stripe_webhook_retention.sql:7-10,102-123`; `cleanup-audit-logs.ts:64-81` | potwierdzone (kod) | wiersze bezterminowo; `stripe_payments.last_webhook_payload` bez reguły (INW-12); przycinanie zależy od powodzenia czyszczenia audytu w tym samym przebiegu |
| `email_bounces` | `raw_payload = NULL` (jednorazowo i w webhooku) | brak podstawy w repo (przycięcie `raw_payload` — minimalizacja, I) | — | PS jednorazowa | `00113_user_deletion_foreign_keys.sql:82-83` | częściowe | e-mail, typ, powód bez okresu (RET-12) |
| `newsletter_subscribers` | brak | brak podstawy w repo | — | brak | INW-14; `app/actions/newsletter.ts:65-71` | brak | RET-12 |
| `support_conversations`, `support_messages` | brak; po usunięciu konta `user_id = NULL` | brak podstawy w repo | — | brak | `00054_support_conversations.sql:43`; grep `.delete()` w `lib/support` — brak | brak | treść czatu bezterminowo (RET-12, AI-03) |
| `flo_*` (m.in. `flo_approvals` z treścią wiadomości) | brak (poza cofaniem pojedynczych działań); **[R3]** propozycje po `expires_at` dostają `status = 'expired'` bez usuwania | brak podstawy w repo | — | **[R3]** SD (wygaszanie propozycji, `lib/flo/proposals.ts:243-260`, wywołanie `lib/flo/tick.ts:197`); wiersze bez usuwania | INW-10; `lib/flo/undo.ts:310` | brak | RET-12 |
| `gdpr_deletion_requests` | brak; pominięte w snapshocie | brak podstawy w repo | — | brak | `00051_gdpr_deletion_requests.sql:29-44`; `lib/backup/snapshot-tables.ts:15-20` | brak | e-mail, IP, UA osoby usuniętej bezterminowo (RET-12) |
| `organization_invitations`, `organization_join_requests` | `expires_at` blokuje użycie; wiersze zostają | brak podstawy w repo | — | brak | INW-01 | brak | RET-12 |
| **[R3]** `accountant_access` (imię/nazwa i e-mail księgowej) | brak; `expires_at`/`revoked_at` blokują użycie, wiersz zostaje (odwołanie = `UPDATE revoked_at`, `components/settings/accountant-actions.ts:116`) | brak podstawy w repo | — | brak (kaskada tylko przy usunięciu organizacji) | `00001_initial_schema.sql:200-208`, `00010_accountant_access.sql:9-21` | brak | dane osoby bez konta bez okresu (RET-12) |
| **[R3]** `export_jobs.emailed_to` (adresy księgowej i CC) | brak | brak podstawy w repo | — | brak | `00024_accountant_copilot.sql:137` | brak | RET-07, RET-12 |
| **[R3]** `payment_reminders` (temat i treść wiadomości do dłużnika, ścieżka PDF) | kaskada z fakturą; PDF usuwany przez `retention-delete` | jak faktura | jak faktura | TD z fakturą | `00014_payments_and_reminders.sql:140-160` (`invoice_id … ON DELETE CASCADE` `:143`, treść `:151-152`); `lib/retention/invoice-files.ts:76-77` | częściowe | zależne od RET-01/RET-02 (w tym wyzwalacza `00132`) |
| `push_subscriptions` | dezaktywacja przy 404/410 i wypisie; wiersz zostaje (kaskada przy usunięciu konta) | techniczna (I) — dezaktywacja nieważnej subskrypcji; okres wiersza — brak podstawy w repo | — | SD | `lib/push/sender.ts:125-128`; `app/actions/push-subscriptions.ts:70`; `00032_push_subscriptions.sql:9` | częściowe | endpoint i UA nieaktywnych urządzeń bez okresu |
| `mfa_recovery_codes` | usuwane przy regeneracji/wyłączeniu i kaskadą z kontem | techniczna (I) — cykl życia funkcji MFA | — | TD | `lib/auth/mfa-recovery.ts:36,118`; `00050_mfa_recovery_codes.sql:17` | potwierdzone (kod) | — |
| `tenants` (organizacja) | `deleted_at`, `hard_delete_at = +30 dni` — bez wykonawcy i bez filtrów | UI: „nieodwracalna po 30 dniach (zgodnie z harmonogramem retencji)” (`settings/account/page.tsx:47-52`) — harmonogramu nie ma w repo; proponowana: art. 28 ust. 3 lit. g RODO [NZ] (PRA-04) | żądanie właściciela/operatora | SD (tylko znacznik) | `components/settings/account-actions.ts:55-65`; `app/admin/users/actions.ts:164-176`; grep `hard_delete_at` — brak czytelnika | brak | PRA-04, RET-04 |
| Konto po anulowaniu subskrypcji | polityka: „do 30 dni po anulowaniu subskrypcji”; brak kodu | polityka „do 30 dni” (`polityka-prywatnosci/page.tsx:229`) bez uzasadnienia | — | brak | `polityka-prywatnosci/page.tsx:229`; grep po `subscriptions` w `lib/jobs/runners` — brak usuwania kont | brak | RET-13 |
| Konto użytkownika (`auth.users`, `public.users` i tabele z kaskadą) | żądanie + 14 dni + cron co godzinę | żądanie osoby (art. 17 RODO [NZ]); 14 dni na wycofanie — `docs/adr/0006-gdpr-14d-cooling-off.md` | `scheduled_for` | TD + PS dziennika | PRA-02 | częściowe | PRA-02, PRA-03 |
| `auth.*` (sesje, tokeny odświeżania, tożsamości, dziennik GoTrue) | zarządza GoTrue | konfiguracja GoTrue (niezweryfikowana) | — | ? | brak w repo (schemat GoTrue poza migracjami) | niezweryfikowane | N-INW-01 w `02-…` |
| Kolejka pg-boss (`pgboss.job`, payloady zdarzeń, np. identyfikatory faktur) | biblioteka: zakończone (`completed/failed/cancelled`) usuwane 7 dni po `completed_on`; nieuruchomione — po `keep_until` = 14 dni; aplikacja nie nadpisuje | domyślna biblioteki (I), nieudokumentowana | zakończenie zadania / utworzenie | TD | `node_modules/pg-boss/dist/plans.js:46-55,2058-2066` (wersja 12.27.0, `package.json:77`); grep `deleteAfterSeconds|retentionSeconds` w `lib/jobs` — brak | potwierdzone (kod biblioteki) | reguła nieudokumentowana w repo; stan produkcyjnej tabeli niezweryfikowany (RET-08) |
| Redis (lokalny wg [PR225]) | TTL 60 s – 24 h; klucze NIP jawne (GUS, walidacja), limity prób — skróty | techniczna (I), bez dokumentu | zapis | TTL | `lib/cache/keys.ts:18-37,48-52`; `lib/cache/index.ts:55`; `lib/rate-limit/index.ts:22-24` | potwierdzone (kod) | trwałość Redisa (RDB/AOF) nieznana (RET-10) |
| **[R3]** Zrzut `pg_dump` bazy `postgres` na `db-1` (bez bazy `_supabase` — [PR225 @a72b567], `db-backup.sh:77`) | 14 ostatnich kompletnych zrzutów; kopia poza serwer tylko przez `rclone crypt` | decyzja [PR225] `data-policy.md`, niewdrożona; obecna rotacja bez dokumentu | wykonanie zrzutu | TD (rotacja) | `scripts/hetzner/db-backup.sh:17-21,41,92-96,109-112`; [PR225] — off-host niewdrożony | częściowe | bez szyfrowania lokalnie, bez ponowienia usunięć po odtworzeniu (RET-09) |
| Snapshot JSON tabel `public` w S3 (`backups/`) | dzienne 30 dni, tygodniowe 56 dni; pomija `audit_logs`, `inngest_run_log`, `ksef_health_log`, `gdpr_deletion_requests` | decyzja [PR225] `data-policy.md`, niewdrożona; obecne 30/56 dni bez dokumentu | wykonanie snapshotu | TD (cron 04:00) | `lib/jobs/runners/cleanup-old-backups.ts:4-5,20-21`; `lib/backup/snapshot-tables.ts:15-20`; `queues.ts:92,96` | potwierdzone (kod) | RET-09 |
| Obrazy dysku hosta (Hetzner) | 7 obrazów `db-1`, brak dla hostów aplikacji i MinIO aplikacji | decyzja [PR225] `data-policy.md`, niewdrożona | — | rotacja dostawcy | [PR225] | niezweryfikowane | RET-09 |
| MinIO aplikacji (pliki) — kopia | brak kopii | decyzja [PR225] `data-policy.md`, niewdrożona (kopia planowana) | — | — | [PR225] | brak | utrata, nie retencja (PRC-14) |
| Logi kontenerów Docker | brak konfiguracji w repo; decyzja: 10 MiB × 5, maks. 7 dni | decyzja [PR225] `data-policy.md` (7 dni), niewdrożona | — | ? | grep `max-size|max-file|logging:` — brak; [PR225] `data-policy.md` § „Wybrana retencja” | niezweryfikowane | RET-10 |
| **[R3]** Logi usług Supabase w bazie `_supabase` (Vector → Logflare; ok. 676 MB) | nieznana | brak podstawy w repo | — | ? | [PR225 @a72b567] (`01-STAN-I-GRANICE.md` § 4); stos z Logflare: `docs/migration/PRZEPROWADZKA-HETZNER.md:262,270`; `scripts/hetzner/db-backup.sh:77` (zrzut obejmuje tylko bazę `postgres`) | niezweryfikowane | zawartość (zapytania, logowania, adresy) i retencja nieznane; poza kopią (N-A2-12) |
| Sentry | **[R3]** kod nie ustawia użytkownika (`setSentryUserContext` bez wywołań); `tenant_id` w tagach/`extra`; retencja w panelu nieodczytana; decyzja: błędy 90 dni (Team EU); **[R3]** [PR225 @a72b567]: plan Developer, retencja 30 dni wg dokumentacji dostawcy, aktywny TTL nieodczytany | decyzja [PR225] `data-policy.md`, niewdrożona; ustawienie dostawcy | — | panel dostawcy | **[R3]** `lib/observability/sentry-context.ts:24,42` (bez importów), `lib/jobs/runners/cert-expiry-alert.ts:211`, `app/(dashboard)/settings/billing/actions.ts:187`; [PR225] `data-policy.md` | niezweryfikowane | brak usuwania na żądanie (RET-10) |
| PostHog | konto: analityka 1 rok, replay 1 mies. (odczyt 6.10); kod nie usuwa osoby; **[R3]** [PR225 @a72b567]: w panelu nagrania, konsola i czasy sieci włączone, retencja nagrań 30 dni (kod wyłącza nagrania) | decyzja [PR225] `data-policy.md` (analityka 1 rok); ustawienie dostawcy | — | panel dostawcy | [PR225]; `lib/analytics/server.ts:28,50` | niezweryfikowane | RET-10 |
| Resend | aplikacja nie przechowuje treści wysłanych e-maili; retencja u dostawcy nieznana | brak podstawy w repo (ustawienie dostawcy) | — | panel dostawcy | `lib/email/send.ts` (wysyłka bez zapisu treści); PRC-11 | niezweryfikowane | RET-10 |
| **[R3]** Slack (kanał zespołu: e-mail użytkownika przy prośbie o kontakt z człowiekiem, alerty operacyjne) | retencja w ustawieniach przestrzeni Slack | brak podstawy w repo (ustawienie dostawcy) | — | panel dostawcy | `lib/support/support-actions.ts:76-83`, `lib/alerts/slack.ts` | niezweryfikowane | RET-10 |
| Anthropic (OCR, klasyfikacja, czat) | po stronie aplikacji — jak `support_messages`, `ocr_jobs`, `expenses.ocr_extracted_data`; u dostawcy wg umowy | umowa dostawcy (niezweryfikowana, `04-…` R-06) | — | — | AI-03; `04-…` R-06 | niezweryfikowane | AI-03 |

### E.2. Ustalenia RET-NN

#### RET-01. „10 lat” dla faktur: założenie projektu, zaimplementowane jako 2 + 8 lat od dnia joba

- **Stan:** częściowe. **Klasa:** P — art. 5 ust. 1 lit. e RODO; art. 112
  ustawy o VAT i art. 86 § 1 w zw. z art. 70 § 1 Ordynacji podatkowej
  (przechowywanie do upływu terminu przedawnienia zobowiązania
  podatkowego, liczonego od końca roku kalendarzowego) [NZ]; art. 28 ust. 3
  lit. g RODO (dla FF-P okres wyznacza administrator-klient) [NZ]; I.
  **Ocena podstawy prawnej należy do innego agenta / końcowego review;
  tu ustalam, gdzie i jak to zaimplementowano.**
- **Dowód — gdzie jest „10 lat”:**
  - `AGENTS.md` § „Compliance”: „RODO — retencja 10 lat dla danych
    fakturowych” (deklaracja projektu, bez źródła);
  - kolumna `tenants.retention_years INT NOT NULL DEFAULT 10 CHECK 1–50`
    (`00009_retention.sql:7-9`) — **żaden kod jej nie czyta** (grep
    `retention_years` w `lib`, `app`: tylko komentarz
    `cleanup-audit-logs.ts:5` i seed `e2e/helpers/db-seed.ts:86`);
  - archiwizacja: faktury z `issue_date` sprzed 2 lat i z XML
    (`archive-old-invoices.ts:21-33`) → `scheduled_deletion_at = teraz +
    8 lat` (`:97-108`); usunięcie loguje powód „10-year retention expired”
    (`retention-delete.ts:59`);
  - polityka: „Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)”
    (`polityka-prywatnosci/page.tsx:230`); komentarz `00051…sql:13-14`
    („art. 17 ust. 3 lit. b”); `docs/security/rto-rpo.md:142`;
    [PR225] `data-policy.md` („10 lat według instrukcji projektu … nie
    opinia o ustawowych terminach”).
- **Jak naprawdę biegnie okres:** start = dzień, w którym job zarchiwizował
  fakturę (pierwszy przebieg po 2 latach od daty wystawienia), więc koniec
  ≈ data wystawienia + 10 lat + opóźnienie joba — **nie** koniec roku
  kalendarzowego, nie termin płatności podatku, nie data korekty.
  Korekta wystawiona później ma własny termin, wcześniejszy dla oryginału
  (RET-02).
- **Kiedy reguła nie zadziała:**
  - faktura bez `xml_storage_path` (szkic, odrzucona, import bez XML,
    faktura w trybie offline bez pliku) nigdy nie dostaje terminu
    (`archive-old-invoices.ts:32`) — bezterminowo;
  - bez zmiennych AWS krok Glacier rzuca (`lib/storage/glacier.ts:12-14,24-30`),
    przebieg pada przed `schedule-deletion` (`archive-old-invoices.ts:45-108`),
    więc **żadna** faktura nie dostaje terminu; zmienne AWS są oznaczone
    jako „deferred … do ~2028” (`scripts/check-env.ts:132-135`); stan
    produkcji nieznany (N-INW-04);
  - faktury sprzed 2 lat mogą dziś pochodzić tylko z importu historii KSeF
    (`02-…` § Glacier) — wtedy ten problem dotyczy ich od razu;
  - **[R3]** nawet z terminem faktura wysłana do KSeF nie zostanie usunięta:
    wyzwalacz `b_guard_invoice_pending_content` odrzuca jej `DELETE` dla
    każdej roli (RET-02).
- **Luka:** jeden okres na sztywno dla wszystkich klientów, liczony od
  zdarzenia technicznego; kolumna per klient martwa; reguła zależna od
  infrastruktury, której nie ma.
- **Ryzyko:** średnie — dziś uśpione (brak faktur starszych niż 2 lata
  poza importem), ale po wdrożeniu decyduje o całej treści faktur
  i plikach; ryzyko „za długo” (art. 5 ust. 1 lit. e) i „za krótko”
  (obowiązek klienta) jednocześnie, bo bieg nie odpowiada przepisom.
- **Rekomendacja:** (I) oddzielić archiwizację od terminu usunięcia:
  `scheduled_deletion_at` liczone przy akceptacji/wystawieniu z reguły
  „koniec roku + N lat” z `tenants.retention_years` (N i moment startu
  z review prawnego; dla FF-P — z instrukcji klienta w umowie); termin
  dla każdej faktury niezależnie od XML i Glaciera; test na bazie z datami
  granicznymi (31.12/1.01).

#### RET-02. Usuwanie faktur po terminie: pliki znikają, zanim baza potwierdzi usunięcie wierszy

- **Stan:** **[R3]** brak (wada pewna dla faktur wysłanych do KSeF, uśpiona
  do pierwszego terminu). **Klasa:** P — art. 5 ust. 1 lit. d i f
  (integralność), art. 5 ust. 2 RODO [NZ]; S — Processing Integrity; I.
- **Dowód — wyzwalacz faktur [R3]:** wyzwalacz `b_guard_invoice_pending_content`
  (`00119_invoice_pending_content_freeze.sql:109-111`, funkcja w ostatniej
  postaci `00132_ksef_lifecycle_guard_tighten.sql:63-72`; `00137` wspomina
  ją tylko w komentarzu) odrzuca `DELETE` każdej faktury z
  `submitted_to_ksef_at` lub `offline_idempotency_key` (oraz w stanie
  `queued`/`offline_queued`/`sending`) **dla każdej roli, także
  `service_role`** — `DELETE` w `retention-delete.ts:80` padnie dla każdej
  faktury wysłanej do KSeF (test R3 na bazie syntetycznej z funkcją
  skopiowaną z migracji: `ERROR: KSeF document cannot be deleted by this
  role`, także przy kaskadzie z `tenants` — `R3.md` § 6, T1, T3). Paczka
  jest usuwana jednym zapytaniem (`.delete().in('id', purged)`, `:80`), więc
  jedna taka faktura blokuje usunięcie wszystkich wierszy paczki, także
  faktur przychodzących (sprawdzenie redaktora). Te same warunki zamrażają
  dane nabywcy (`buyer_data`, `buyer_pesel`, `buyer_id_number` —
  `00132…sql:76-107`), więc nie da się ich też spseudonimizować bez zmiany
  wyzwalacza. Pozostałe wyzwalacze faktur z `00132`
  (`guard_invoice_delivery_history`, `guard_historical_ksef_invoice_lines`)
  przepuszczają role spoza `authenticated`/`anon` (sprawdzenie redaktora,
  `00132…sql:146-148`, `:250-251`).
- **Dowód — kolejność kroków:** job najpierw usuwa pliki każdej faktury z paczki
  (`retention-delete.ts:46-74`), potem jednym zapytaniem usuwa wszystkie
  wiersze paczki (`:78-82`). Wiersz faktury jest wskazywany kluczami obcymi
  bez kaskady: `expenses.ksef_invoice_id REFERENCES public.invoices(id)`
  (NO ACTION, `00034_expenses_kpir_ocr.sql:53`; złożony klucz
  `00121_expense_ksef_invoice_identity.sql:44-47`) — koszt utworzony
  z faktury przychodzącej z KSeF (`auto-categorize-inbox.ts:369`);
  `parent_invoice_id … ON DELETE RESTRICT` (`00012_invoice_types_extension.sql:60`,
  `00118_correction_parent_boundary.sql:8-11`) — korekta wskazuje oryginał;
  a koszty nie mają żadnej reguły retencji (RET-05). Jeden zablokowany
  wiersz wywraca całe zapytanie, job rzuca (`:81`), a pliki wszystkich
  faktur z paczki są już usunięte; następny przebieg wybierze te same
  wiersze (brak `ORDER BY`, `:31-36`), „usunie” nieistniejące pliki
  (brak obiektu to nie błąd, `invoice-files.ts:95`) i znów padnie.
  Wpis `retention.deletion_executed` powstaje przed usunięciem wiersza
  (`:52-63`), więc dziennik twierdzi, że usunięcie wykonano.
- **Luka:** stan pośredni „wiersz faktury bez pliku XML/UPO” — przy
  obowiązku przechowania to utrata dowodu, przy jego braku — nieusunięte
  dane; blokada całej paczki.
- **Ryzyko:** **[R3]** średnie dziś; wysokie od pierwszego terminu —
  nieodwracalne usunięcie XML/UPO bez usunięcia wiersza z danymi nabywcy
  i trwała blokada joba (wcześniej: „średnie, uśpione do pierwszego
  terminu; natychmiast przy imporcie historii z kosztami”).
- **Rekomendacja:** (I) usuwać fakturę po fakturze w transakcji
  z rekordem „do usunięcia plików” (outbox) i dopiero po zatwierdzeniu
  wiersza kasować pliki; wspólny termin dla faktury przychodzącej i jej
  kosztu oraz dla korekty i oryginału (najpóźniejszy z łańcucha); wpis
  audytu po skutku; czerwony test na bazie z kosztem z KSeF i z korektą.
  **[R3]** Decyzja projektowa, czy FaktFlow fizycznie usuwa wiersze
  dokumentów KSeF, czy po terminie zeruje dane osobowe (wymaga jawnej
  ścieżki serwisowej w wyzwalaczu, np. funkcja `SECURITY DEFINER` z flagą
  transakcji); czerwony test na bazie (`tests/rls-*`) z fakturą
  z `submitted_to_ksef_at`.

#### RET-03. Dziennik audytu: jeden okres 12 miesięcy dla wszystkiego i wyzwalacz, który blokuje usuwanie innych danych

- **Stan:** częściowe. **Klasa:** P — art. 5 ust. 1 lit. e i ust. 2
  RODO [NZ]; S — CC (monitorowanie, ślad zmian) — identyfikatory
  w `06-SOC2.md`; I.
- **Dowód:**
  - `cleanup_old_audit_logs` usuwa **wszystkie** wpisy starsze niż 12
    miesięcy, bez rozróżnienia klas zdarzeń (`00052…sql:53-74`,
    `cleanup-audit-logs.ts:19,38-40`), w tym wpisy RODO (`gdpr.*`),
    retencji (`retention.*`), wystawienia i wysyłki faktur;
  - deklaracje: komentarz tabeli „Retencja 10 lat” (`00001_initial_schema.sql:174` **[R3]**),
    polityka „12 miesięcy” (`polityka-prywatnosci/page.tsx:214-219,231`),
    [PR225] „audit finansowy 10 lat, dostęp/admin 13 miesięcy”
    (decyzja niewdrożona);
  - wyzwalacz append-only (`00052…sql:16-41`) blokuje każdy `UPDATE`
    i `DELETE` bez flagi sesji, także wykonywany przez akcję klucza obcego:
    `audit_logs.user_id … ON DELETE SET NULL` (`00001…sql:165`) i
    `audit_logs.tenant_id` (`00008_audit_logs_refinements.sql:18-21`).
    **Test mechanizmu (syntetyczna baza, PostgreSQL 16 lokalnie):** tabela
    z kluczem `ON DELETE SET NULL` i wyzwalaczem odwzorowanym z `00052` —
    usunięcie wiersza nadrzędnego z wpisem kończy się
    `ERROR: append-only (UPDATE blocked)` z kontekstem akcji klucza obcego;
    bez wpisu — `DELETE 1`. Skutki: PRA-03 (usunięcie konta przez
    operatora), przyszłe twarde usunięcie organizacji (RET-04).
    Stanu wyzwalacza na produkcji nie sprawdziłem.
- **Luka:** zdarzenia, które mają dowodzić rozliczalności (RODO, retencja,
  faktury), giną po roku; wyzwalacz bez wyjątku dla akcji kluczy obcych
  zamienia każde usunięcie powiązanych danych w błąd.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) klasy zdarzeń z różnymi okresami (decyzja review;
  [PR225] proponuje 13 mies./10 lat); pseudonimizacja zamiast usuwania dla
  klas długich; wpisy RODO do rejestru żądań (PRA-11); dla kluczy obcych —
  albo usunąć klucze z `audit_logs` (identyfikatory jako wartości), albo
  funkcja usuwania ustawiająca flagę w tej samej transakcji; test na bazie.

#### RET-04. Organizacje „usunięte”: znacznik bez wykonawcy i bez skutku w przetwarzaniu

- **Stan:** brak. **Klasa:** P — art. 28 ust. 3 lit. g, art. 5 ust. 1
  lit. b i e RODO [NZ]; I. Dowody i rekomendacja: PRA-04 (ścieżka klienta)
  i PRA-03 (ścieżka operatora); INW-02 w `02-…`. **[R3]** Twarde
  usunięcie organizacji zablokuje nie tylko wyzwalacz audytu, ale też
  wyzwalacz faktur `b_guard_invoice_pending_content` (`00132…sql:63-72`,
  RET-02) przy kaskadzie `tenants` → `invoices`.
- **Uzupełnienie:** organizacja, której ostatni członek usunął konto
  (PRA-02), nie dostaje nawet znacznika — zostaje aktywna bez nikogo,
  kto może wydać polecenie, a joby (np. odbiór skrzynki KSeF, jeśli
  certyfikat jest ważny, `inbox-polling.ts:136-144`) dalej ją
  przetwarzają. Brak raportu operatora „organizacje bez aktywnego
  właściciela”.
- **Ryzyko:** wysokie.
- **Rekomendacja:** (I) jak PRA-04 oraz cykliczny raport/cron dla
  organizacji bez aktywnych członków (wstrzymanie jobów, powiadomienie,
  decyzja o usunięciu po terminie z umowy).

#### RET-05. Dane księgowe i podpowiedzi klienta bez reguły retencji

- **Stan:** brak. **Klasa:** P — art. 5 ust. 1 lit. e RODO; dla dowodów
  księgowych — przepisy podatkowe (okres jak dla faktur) [NZ]; I.
- **Dowód:** brak joba dla `expenses`, `kpir_entries`, `ocr_jobs`,
  `contractors`, `products`, `payments`, `payment_imports`,
  `categorization_rules` (lista crona: `lib/jobs/queues.ts:89-127` — jedyne
  czyszczące to `cleanup-audit-logs`, `cleanup-old-backups`,
  `retention-delete`, `nightly-validation-recheck`, `gdpr-process-deletions`);
  usunięcie kosztu przez klienta odmawia dla kosztu z KSeF
  (`app/actions/expenses.ts:430-436`) i nie zapisuje audytu.
- **Luka:** koszty i KPiR (dowody klienta zawierające dane sprzedawców,
  także JDG) żyją dłużej niż faktury sprzedaży i blokują ich usunięcie
  (RET-02); kontrahenci (podpowiedzi) — bezterminowo, nawet bez faktur.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) dla kosztów i KPiR — ten sam mechanizm terminu co
  faktury (RET-01); dla kontrahentów i produktów — usunięcie z organizacją
  oraz reguła „brak dokumentów i brak użycia przez N lat” (do decyzji
  klienta/review).

#### RET-06. Pliki w S3 poza fakturami: zdjęcia, eksporty, importy bez końca życia

- **Stan:** brak. **Klasa:** P — art. 5 ust. 1 lit. c i e RODO [NZ]; I.
  Dowody podstawowe: INW-03 (`02-…`). Uzupełnienie:
  - usunięcie kosztu nie usuwa zdjęcia/PDF (`app/actions/expenses.ts:413-444`
    — brak wywołania `deleteExpensePhoto`, które istnieje w
    `lib/storage/expenses.ts:130` **[R3]** i jest używane tylko przy błędzie zapisu,
    `expenses.ts:171,185`); `ocr_jobs.expense_id … ON DELETE SET NULL`
    (`00034…sql:140`) zostawia ścieżkę pliku w `ocr_jobs.source_file_path`;
  - `deleteInvoiceXml` (`lib/storage/r2.ts:578-584`) nie ma wywołań;
  - jedyny kod usuwający obiekty: `invoice-files.ts:96-107`, `expenses.ts:171,185`,
    `glacier.ts:70`, `r2-backup-client.ts:93` (grep `DeleteObjectCommand`).
- **Ryzyko:** wysokie (zgodnie z INW-03) — zdjęcia dokumentów i pełne
  zestawienia JPK.
- **Rekomendacja:** (I) jak INW-03; dodatkowo test „inwentarz prefiksów S3
  vs wiersze” uruchamiany cyklicznie (sieroty = alarm).

#### RET-07. Linki do pobrania i TTL eksportów

- **Stan:** częściowe. **Klasa:** P — art. 32 RODO [NZ]; I. Uzupełnia
  INW-19 i A1 MIN-06.
- **Dowód:** linki podpisane — domyślnie 300 s, z nagłówkiem
  `private, no-store` (`lib/storage/r2.ts:498-517`); zdjęcie kosztu 1 h
  (`lib/storage/expenses.ts:101`); paczka miesięczna dla księgowej powyżej
  limitu załączników — linki ważne **7 dni** w treści e-maila
  (`co-pilot-monthly.ts:476-495`); `export_jobs.expires_at` deklaruje
  90 dni dla plików (`00024…sql:211`) bez kodu usuwającego.
- **Luka:** link-okaziciel 7 dni w skrzynce (także adresów CC, INW-19);
  plik eksportu żyje bezterminowo mimo deklaracji.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) link do strony portalu z uwierzytelnieniem
  zamiast podpisanego adresu S3 w e-mailu albo TTL ≤ 24 h z ponownym
  wygenerowaniem; job usuwający pliki po `expires_at`.

#### RET-08. Kolejka pg-boss i log przebiegów: reguły działają z biblioteki, ale nie są zapisane

- **Stan:** potwierdzone (kod biblioteki i migracji; produkcja
  niezweryfikowana). **Klasa:** I; S (zarządzanie danymi w kolejkach).
- **Dowód:** pg-boss 12.27.0 (`package.json:77`), domyślnie
  `deletion_seconds = 7 dni` i `retention_seconds = 14 dni`
  (`node_modules/pg-boss/dist/plans.js:46-55`), usuwanie
  `completed_on + deletion_seconds < now()` lub nieuruchomione po
  `keep_until` (`plans.js:2058-2066`); aplikacja nie nadpisuje opcji
  (grep `deleteAfterSeconds|retentionSeconds` w `lib/jobs` — brak;
  `lib/jobs/boss.ts:72-73` ustawia tylko heartbeat i wygaśnięcie);
  `inngest_run_log` bez payloadu (`lib/jobs/run-log.ts:2-10`), 3 miesiące
  (`00052…sql:77-78`).
- **Luka:** payloady zdarzeń (np. `invoice/submit.requested`, `02-…` D-08)
  zostają do 7 dni po zakończeniu i trafiają do `pg_dump` (RET-09); reguła
  nie jest nigdzie opisana, więc aktualizacja biblioteki może ją zmienić
  bez wiedzy zespołu.
- **Ryzyko:** niskie.
- **Rekomendacja:** (I) jawne `deleteAfterSeconds`/`retentionSeconds`
  w konfiguracji kolejek i wpis w rejestrze retencji.

#### RET-09. Kopie zapasowe: okresy znane z kodu, propagacja usunięć — brak

- **Stan:** częściowe. **Klasa:** P — art. 17, art. 32 ust. 1 lit. c
  RODO [NZ]; **[R3]** I — proponowana praktyka: dopuszczalne wygaśnięcie
  danych usuniętych w kopiach z rotacją przy wyłączeniu z użycia (WYM-72
  w `03-…`; O — do potwierdzenia w review: status raportu CEF 2025,
  ZR-45, nieznany; brak wskazanego stanowiska organu); S — Availability. Dowody podstawowe: INW-04 (`02-…`), PRC-14 (`04-…`).
- **Okresy (kod):** `pg_dump` — 14 ostatnich zrzutów (`db-backup.sh:41,109-112`),
  snapshot JSON — 30/56 dni (`cleanup-old-backups.ts:20-21`), obrazy hosta
  — 7 ([PR225]); decyzja docelowa 7 dziennych/4 tygodniowe/12 miesięcznych
  w Helsinkach ([PR225] `data-policy.md` § „Kopie”) wydłuży maksymalny
  okres obecności danych usuniętych w kopiach do ~12 miesięcy.
- **Uzupełnienie:** runbook anulowania usunięcia konta każe po terminie
  „pełen restore z R2 snapshotu” (`docs/runbooks/unlock-account.md:138-140`) —
  snapshot nie zawiera schematu `auth` ani `gdpr_deletion_requests`
  (`snapshot-tables.ts:15-20`, `02-…` INW-04), więc konta nie przywróci,
  a częściowe odtworzenie tabel `public` przywróci dane osoby usuniętej
  na jej żądanie; [PR225] zapisuje zasadę „po restore stosuje się ponownie
  … rejestr zrealizowanych żądań” (`data-policy.md`, akapit po „Kontrola TTL”)
  — bez implementacji.
- **Luka:** brak dziennika usunięć poza kopiowaną bazą i kroku „ponów
  usunięcia” w runbooku odtworzenia; okres przechowania danych usuniętych
  w kopiach nieopisany dla osób.
- **Ryzyko:** wysokie (zgodnie z INW-04).
- **Rekomendacja:** (I) jak INW-04; poprawić `unlock-account.md` § 4
  (nie odtwarzać danych osoby usuniętej; po terminie — nowe konto);
  w polityce zdanie o okresie wygaśnięcia danych w kopiach po wdrożeniu
  decyzji o Storage Box.

#### RET-10. Telemetria i dostawcy: retencja ustawiana w panelach, brak usuwania na żądanie

- **Stan:** niezweryfikowane (panele) / brak (usuwanie na żądanie).
  **Klasa:** P — art. 5 ust. 1 lit. e, art. 17, art. 28 ust. 3 lit. g
  RODO [NZ]; I.
- **Dowód:** **[R3]** kod nie ustawia użytkownika w Sentry
  (`setSentryUserContext`, `lib/observability/sentry-context.ts:24,42`, bez
  wywołań — A1 MIN-12); identyfikacja możliwa po `tenant_id` w tagach/`extra`
  (np. `cert-expiry-alert.ts:211`, `settings/billing/actions.ts:187`) i po
  treści błędu; do PostHog kod wysyła `distinctId = user.id`
  (`lib/analytics/server.ts:28,50`), a **[R3]** zdarzenie przyjęcia faktury
  z `distinctId = tenantId` (`submit-invoice.ts:1933-1940`) i — po zgodzie —
  grupę `tenant` (`analytics-identify.tsx:19`); żadne
  wywołanie API usuwające osobę/zdarzenia (grep — brak); logi kontenerów
  bez konfiguracji w repo; Redis z TTL (`lib/cache/keys.ts:18-37`),
  trwałość nieznana. Odczyty [PR225]: PostHog 1 rok/replay 1 mies.,
  Sentry — nieodczytane, decyzja 90 dni; logi — decyzja 7 dni.
  **[R3]** [PR225 @a72b567] (odczyt 10.10, `01-STAN-I-GRANICE.md` § 4):
  Sentry — plan Developer, retencja 30 dni wg dokumentacji dostawcy
  (aktywny TTL nieodczytany); PostHog — nagrania, konsola i czasy sieci
  włączone w panelu, retencja nagrań 30 dni; druga baza `_supabase`
  (logi usług Supabase, ok. 676 MB) poza nocnym `pg_dump`
  (`db-backup.sh:77`), retencja nieznana (N-A2-12). **[R3]** Slack: przy
  prośbie o kontakt z człowiekiem do kanału zespołu trafia e-mail
  użytkownika (`lib/support/support-actions.ts:76-83`); retencja
  w ustawieniach przestrzeni Slack — niezweryfikowana.
- **Luka:** usunięcie konta nie dociera do PostHog, Sentry **[R3]** ani
  Slacka; okresy logów i Sentry to decyzje, nie stan; **[R3]** retencja
  logów w `_supabase` nieopisana.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) krok w `executeGdprRequest` (albo kolejka
  zadań operatora z terminem) — usunięcie osoby w PostHog po `distinctId`
  **[R3]** oraz — przy usunięciu organizacji — profilu i zdarzeń
  z `distinctId = tenantId` i grupy `tenant`; dla Sentry — **[R3]**
  procedura wyszukania zdarzeń po `tenant_id`/identyfikatorach z treści
  albo okres ≤ 90 dni jako uzasadnienie wygaśnięcia; **[R3]** dla Slacka —
  bez e-maila w alercie (identyfikator rozmowy wystarcza) albo retencja
  kanału; dla `_supabase` — odczyt konfiguracji i okres zapisany jako kod; konfiguracja logów
  Docker w repo (`max-size`, `max-file`) jako kod.

#### RET-11. Brak pełnego eksportu danych organizacji przed odejściem

- **Stan:** brak. **Klasa:** P — art. 28 ust. 3 lit. g (zwrot danych
  administratorowi), art. 20 RODO [NZ]; I.
- **Dowód:** eksporty organizacji to formaty księgowe (`export_format_enum`:
  JPK_FA, JPK_V7M, KPiR, CSV, Optima, Subiekt, Symfonia, Wapro —
  `types/database.ts:5630-5638`), część formatów może być wstrzymana
  (`lib/exports/suspended-formats.ts`, `app/actions/exports.ts:96-99`);
  nie ma eksportu kontrahentów, produktów, plików XML/UPO/PDF zbiorczo
  ani danych kosztów ze zdjęciami jako jednego pakietu; ścieżka „Usuń
  organizację” nie proponuje eksportu (PRA-04).
- **Luka:** klient nie może odebrać kompletu swoich danych przed
  zakończeniem umowy bez operatora.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) „Pobierz wszystkie dane firmy” — zadanie w tle,
  ZIP (XML, UPO, PDF faktur, zdjęcia kosztów, JSON kontrahentów/produktów/
  płatności), link z uwierzytelnieniem, krótki TTL; wymagany krok przed
  usunięciem organizacji.

#### RET-12. Rejestry i dane osób bez relacji bez okresu przechowania

- **Stan:** brak. **Klasa:** P — art. 5 ust. 1 lit. e, art. 5 ust. 2
  RODO [NZ]; I. Uzupełnia INW-01 i INW-14.
- **Dowód:** `gdpr_deletion_requests` (e-mail, IP, UA — `00051…sql:29-44`;
  po wykonaniu `user_id = NULL`), `newsletter_subscribers` (bez wypisu),
  `email_bounces` (adres, typ, powód), `organization_invitations` (e-mail
  zaproszonego), `support_conversations/messages` (treść czatu, także po
  usunięciu konta — `00054…sql:43`), `flo_approvals` (treść wiadomości do
  kontrahentów, INW-10), **[R3]** `accountant_access` (imię/nazwa i e-mail
  księgowej — `00001…sql:203`, `00010…sql:9`; po odwołaniu i wygaśnięciu
  wiersz zostaje, odwołanie to `UPDATE revoked_at`,
  `components/settings/accountant-actions.ts:116`), `export_jobs.emailed_to`
  (`00024…sql:137`) — brak joba (lista cronów `queues.ts:89-127`).
- **Luka:** paradoks: rejestr usunięć przechowuje dane osoby usuniętej
  dłużej niż jakiekolwiek inne jej dane.
- **Ryzyko:** średnie (wysokie dla czatu — treść swobodna, AI-03).
- **Rekomendacja:** (I) okresy z review: np. rejestr żądań — przez okres
  przedawnienia roszczeń, z e-mailem zastąpionym skrótem z solą po
  wykonaniu; zaproszenia — usunięcie N dni po wygaśnięciu; odbicia —
  do czasu zmiany adresu/N miesięcy; czat — N miesięcy od zamknięcia
  rozmowy; `flo_approvals` — treść po wysyłce skracana do metadanych;
  **[R3]** `accountant_access` — usunięcie N dni po odwołaniu/wygaśnięciu.

#### RET-13. „Dane konta do 30 dni po anulowaniu subskrypcji” — deklaracja bez kodu

- **Stan:** brak. **Klasa:** P — art. 13 ust. 2 lit. a RODO (informacja
  o okresie) [NZ]; I.
- **Dowód:** `polityka-prywatnosci/page.tsx:229`; brak joba reagującego na
  `subscriptions.status = canceled` usunięciem konta lub organizacji
  (lista cronów `queues.ts:89-127`; `lib/jobs/runners/dunning-payment-failed.ts`
  i `trial-countdown-emails.ts` wysyłają e-maile, nie usuwają danych —
  nazwy i rejestracja w `package-*.ts`).
- **Luka:** okres podany osobom nie ma odpowiednika w systemie; konta
  i firmy po rezygnacji żyją bezterminowo.
- **Ryzyko:** średnie (rzetelność informacji).
- **Rekomendacja:** (I) decyzja: albo reguła „konto/organizacja nieaktywne
  N miesięcy po końcu subskrypcji → powiadomienie → usunięcie z wyjątkami
  podatkowymi”, albo poprawa polityki na stan faktyczny.

## AI. Systemy AI, OCR i support

### AI.0. Przepływy do modeli (stan `3e5e00d`)

Jeden dostawca modeli: Anthropic, klient SDK bez własnego `baseURL`
(`lib/anthropic/client.ts:13-21`), model domyślny z `ANTHROPIC_OCR_MODEL`
(`client.ts:3`). Lokalizacja, umowa i retencja po stronie dostawcy —
`04-…` R-06, PRC-06 (nie powtarzam).

| Funkcja | Wyzwalacz | Co trafia do modelu | Zapis w aplikacji (retencja) | Człowiek w pętli | Dowód |
|---|---|---|---|---|---|
| OCR dokumentu kosztowego | użytkownik wgrywa zdjęcie/PDF | **pełny obraz/PDF** (base64) + stały prompt | plik w S3 `tenants/{t}/expenses/…` (brak reguły), `ocr_jobs` (brak), `expenses.ocr_extracted_data` (z kosztem) | tak — wynik do przeglądu (`reviewExpenseAction`, `app/actions/expenses.ts:253`) | `lib/ocr/engine.ts:144-158`; `lib/jobs/runners/process-ocr.ts:309,373` |
| Klasyfikacja KPiR | **automatycznie**: każda faktura kosztowa z KSeF i każdy OCR, gdy reguły NIP/nazwy/słów kluczowych nie trafią i firma ma budżet AI | nazwa i NIP sprzedawcy, numer faktury, nazwy pozycji, kwota brutto (w bloku „dane, nie polecenia”) | `expenses.kpir_column`, `categorization_method`, `categorization_confidence` (z kosztem) | tak — wynik AI zawsze `is_reviewed = false` (PRA-08) | `lib/categorization/ai-classifier.ts:34-52`; `lib/categorization/index.ts:69-76`; `auto-categorize-inbox.ts:369-409` |
| Czat pomocy | zalogowany użytkownik pisze | do 20 ostatnich tur rozmowy (treść swobodna, do 2000 znaków na wiadomość) + baza wiedzy w prompcie systemowym | `support_conversations`, `support_messages` — **bez retencji**, zostają po usunięciu konta | eskalacja do zespołu przy `ai_uncertain` (**[R3]** Slack: przy eskalacji AI — ID rozmowy i kategoria, `route.ts:178-185`; przy prośbie o człowieka — także e-mail użytkownika, `lib/support/support-actions.ts:76-83`) | `app/api/support/chat/route.ts:38-45,62-195`; `lib/support/chat.ts:75-84`; `00054…sql:43` |
| FLO — reguły (propozycje, przypomnienia) | cron `cron.flo-tick` 07:30, `cron.flo-shadow-settle` pon. 06:00 | **nic** — bez modelu | `flo_proposals`, `flo_approvals` (treść wiadomości), `flo_decisions`, `flo_shadow` — bez retencji (INW-10) | tak — wysyłka tylko z żetonem zatwierdzenia klienta (A1 ZGD-07) | `lib/jobs/queues.ts:100,104`; `lib/jobs/handlers/flo-tick.ts:14-32`; `lib/flo/tick.ts:305-306` |
| FLO — generowanie treści modelem | brak (moduł nieaktywny) | — | — | — | `lib/flo/llm.ts:1-3`; `lib/flo/redact.ts:1-3`; `tests/unit/flo-nieaktywne.test.ts:22-41` |
| Agent kodu w CI | issue z etykietą `agent:napraw` | treść issue i kod repo (nie dane klientów, o ile nikt ich nie wklei) | — | przegląd PR | `.github/workflows/agent.yml`; `04-…` R-23 |

### AI.1. Ustalenia AI-NN

#### AI-01. Automatyczna klasyfikacja wysyła dane sprzedawców bez działania użytkownika i bez wyboru organizacji

- **Stan:** częściowe. **Klasa:** P — art. 28 ust. 3 lit. a (przetwarzanie
  na udokumentowane polecenie klienta), art. 5 ust. 1 lit. c RODO,
  rozdział V (transfer — `04-…` PRC-06) [NZ]; I. Uzupełnia INW-06
  i A1 ZGD-07.
- **Dowód:** łańcuch kategoryzacji kończy się wywołaniem modelu dla każdej
  faktury, której nie rozpoznały reguły, jedynie w granicach budżetu
  tokenów firmy (`lib/categorization/index.ts:69-76`); job uruchamia się
  dla każdej faktury przychodzącej ze skrzynki KSeF (`auto-categorize-inbox.ts:1-3`)
  — także dla organizacji oznaczonych jako usunięte (PRA-04: odbiór
  skrzynki nie filtruje `deleted_at`); prompt zawiera NIP sprzedawcy
  (`ai-classifier.ts:46-52`), choć klasyfikacja do kolumny KPiR opiera
  się na nazwie i pozycjach, a NIP służy regułom lokalnym przed modelem
  (`index.ts:44-51`); brak ustawienia organizacji (grep
  `ai_categor|auto_categor` — brak, A1 ZGD-07).
- **Luka:** przekazanie danych osób trzecich (sprzedawcy-JDG) do
  zewnętrznego dostawcy jest domyślne, ciche i nieprzełączalne.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) usunąć NIP z promptu (test kontraktu na treść
  promptu); przełącznik organizacji „kategoryzacja AI” (domyślna wartość
  z review); filtr organizacji usuniętych w jobach (PRA-04).

#### AI-02. OCR: pełny dokument do modelu — nieodłączne, ale bez informacji i bez końca życia pliku

- **Stan:** częściowe. **Klasa:** P — art. 13 ust. 1 lit. e, art. 5
  ust. 1 lit. e RODO [NZ]; I. Uzupełnia SEC-D-05 (otwarte) i A1 ZGD-08.
- **Dowód:** obraz/PDF w całości (`lib/ocr/engine.ts:144-158`); przy
  przycisku OCR brak informacji o modelu i dostawcy (A1 ZGD-08); plik
  źródłowy bez retencji i zostaje po usunięciu kosztu (RET-06); wynik
  rozpoznania w `expenses.ocr_extracted_data` żyje z kosztem (RET-05).
- **Luka:** jak wyżej; dodatkowo brak minimalizacji (np. kadrowania)
  — decyzja produktowa (SEC-D-05).
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) informacja przy przycisku; usunięcie pliku
  razem z kosztem i z organizacją; reguła retencji kosztów (RET-05).

#### AI-03. Czat pomocy: treść swobodna bez retencji i bez usunięcia z kontem

- **Stan:** brak (retencja) / częściowe (dostęp). **Klasa:** P — art. 5
  ust. 1 lit. e, art. 17 RODO [NZ]; I.
- **Dowód:** zapis wiadomości przed wywołaniem modelu (`route.ts:124-131` —
  „Zapis wiadomości usera PRZED streamem”), odpowiedź po strumieniu;
  historia do 20 tur wraca do modelu przy każdej wiadomości
  (`route.ts:45,103-112`); brak reguły usuwania (RET-12); po usunięciu
  konta rozmowa zostaje z `user_id = NULL` (`00054…sql:43`); eksport konta
  zawiera rozmowy i wiadomości (`data-collector.ts:92-96,190-203`) — dostęp
  zrealizowany; w Sentry trafia tylko ID rozmowy w tagach
  (`route.ts:144-146,188-190`).
- **Luka:** użytkownicy wklejają do czatu dane kontrahentów i fragmenty
  faktur (pole bez ostrzeżenia — A1 ZGD-08); treść żyje bezterminowo.
- **Ryzyko:** wysokie dla rozliczalności art. 17 (dane zostają po
  usunięciu konta), średnie ogólnie.
- **Rekomendacja:** (I) usunięcie rozmów razem z kontem; retencja N
  miesięcy od zamknięcia (review); ostrzeżenie przy polu; opcjonalnie
  maskowanie NIP/IBAN/PESEL przed zapisem i wysyłką (wzorce z
  `lib/flo/redact.ts` po uzupełnieniu, SEC-D-03).

#### AI-04. FLO: część z modelem nieaktywna i strzeżona testem; część regułowa aktywna i przetwarza dane

- **Stan:** potwierdzone (kod). **Klasa:** I; P — art. 25 RODO (gotowość
  przed włączeniem) [NZ].
- **Dowód:** `llm.ts` i `redact.ts` oznaczone „NIEAKTYWNE (AUD-115)”,
  test sprawdza brak importera z kodu produkcyjnego
  (`tests/unit/flo-nieaktywne.test.ts:22-41`); `redact.ts` opisuje się
  jako maskowanie „best-effort”, nie gwarancję (`redact.ts:5-10`),
  a SEC-D-03 jest w rejestrze bezpieczeństwa opisane jako poprawione
  (`docs/security/audyt/REJESTR-USTALEN.md:111`) — skuteczności wzorców
  nie testowałem; aktywne: crony FLO (`queues.ts:100,104`), funkcje
  domyślnie włączone poza listą zablokowanych (`lib/flo/flags.ts:39-91`),
  w tym przypomnienia do kontrahentów po zatwierdzeniu przez klienta;
  `payment.score` (ocena kontrahenta JDG) zablokowane z powodów prawnych
  (`flags.ts:41-49`).
- **Luka:** brak reguły retencji `flo_*` (RET-12); dla przyszłego
  włączenia modelu — brak bramki „zawiera dane osobowe → odmowa”
  w ścieżce wysyłki (SEC-D-03 rekomenduje `containsSensitive`,
  `redact.ts:79-81`).
- **Ryzyko:** niskie (dziś), średnie przy włączeniu modelu.
- **Rekomendacja:** (I) przed zdjęciem znacznika: DPIA-lite dla FLO
  z modelem (dane, dostawca, informacja), test bramki odmowy, retencja
  `flo_approvals`.

#### AI-05. Informacja dla osób i rejestr systemów AI

- **Stan:** brak. **Klasa:** P — art. 13–14 RODO; art. 50 AI Act
  (obowiązki przejrzystości, termin stosowania do potwierdzenia) [NZ];
  O — wytyczne WP260 (przejrzystość) [NZ]; I.
- **Dowód:** A1 ZGD-08 (czat i OCR bez informacji); polityka wymienia
  Anthropic tylko przy OCR (`polityka-prywatnosci/page.tsx:106-109`
  wg A1), nie wspomina klasyfikacji KPiR ani czatu; brak w repo rejestru
  funkcji AI (wyszukane: `docs/` — brak dokumentu z listą funkcji AI,
  danych i dostawcy poza planami FLO).
- **Luka:** osoba nie wie, że rozmawia z modelem ani że dokument i dane
  sprzedawcy trafiają do dostawcy spoza EOG.
- **Ryzyko:** średnie.
- **Rekomendacja:** (I) tabela AI.0 jako żywy rejestr w `docs/`
  (aktualizowany w PR zmieniającym przepływ); zdanie informacyjne
  w UI czatu i OCR; sekcja w polityce.

## Najważniejsze ryzyka i proponowana kolejność

| Kolejność | Ustalenia | Dlaczego najpierw |
|---|---|---|
| 1 | PRA-04 / RET-04 (filtr `deleted_at` w jobach i sesji, poprawa tekstu UI) | dziś „usunięta” firma jest dalej przetwarzana i wysyłana do AI; zmiana mała, bez migracji |
| 2 | PRA-03 (ścieżka operatora → wspólna funkcja usuwania) + RET-03 (wyzwalacz vs klucze obce) | jedyna droga realizacji żądań e-mailowych nie działa; czerwony test na bazie najpierw |
| 3 | PRA-02 / AI-03 / RET-12 (czat, rejestr żądań, listy e-mail, dostawcy w usunięciu konta) | kompletność art. 17 |
| 4 | PRA-09 / PRA-11 (runbook, skrypt wyszukiwania, rejestr żądań) | osoby bez konta to największa grupa; terminy art. 12 |
| 5 | RET-01 / RET-02 / RET-05 (termin faktur i kosztów od decyzji prawnej, kolejność plik/wiersz; **[R3]** ścieżka serwisowa w wyzwalaczu `00132` albo zerowanie danych osobowych zamiast `DELETE`) | uśpione do pierwszego terminu albo importu historii; wymaga decyzji review; **[R3]** od pierwszego terminu ryzyko wysokie — usunięcie plików bez usunięcia wiersza i trwała blokada joba |
| 6 | PRA-01, PRA-05, RET-06, RET-07, RET-11, AI-01 | uzupełnienia zakresu i minimalizacji |

## Niewiadome i ograniczenia

| ID | Niewiadoma | Od czego zależy | Jak rozstrzygnąć | Wpływ |
|---|---|---|---|---|
| N-A2-01 | Czy na produkcji wyzwalacz `trg_audit_logs_prevent_update` i klucz `audit_logs.user_id … ON DELETE SET NULL` mają postać z migracji (test wykonano na bazie syntetycznej) | stan `db-1` | `\d public.audit_logs` i lista wyzwalaczy na `db-1` (tylko odczyt) albo test w jobie CI „RLS isolation” | PRA-03, RET-03 |
| N-A2-02 | Stan `00072` na produkcji (plan wydania mówi „wstrzymana”, dziennik operatora — „wykonana”) | `schema_migrations` na `db-1` | odczyt `SELECT version FROM supabase_migrations.schema_migrations WHERE version='00072'` | PRA-02 |
| N-A2-03 | Czy zmienne AWS (Glacier) są ustawione i czy job archiwizacji kiedykolwiek przeszedł | konfiguracja Coolify, `inngest_run_log` | lista nazw zmiennych (bez wartości), wpisy przebiegów `cron.archive-old-invoices` | RET-01 |
| N-A2-04 | Czy na produkcji są faktury z `scheduled_deletion_at` albo starsze niż 2 lata (import historii) | dane produkcyjne | `SELECT count(*) … WHERE scheduled_deletion_at IS NOT NULL` / `issue_date < now() - '2 years'` | RET-01, RET-02 |
| N-A2-05 | Czy istnieją organizacje z `deleted_at` lub bez aktywnego członka | dane produkcyjne | dwa zapytania licznikowe | PRA-04, RET-04 |
| N-A2-06 | Zakres sprzątania GoTrue przy `deleteUser` (sesje, tożsamości, `auth.audit_log_entries`) i jego retencja | wersja i konfiguracja GoTrue | odczyt schematu `auth` i konfiguracji (N-INW-01) | PRA-01, PRA-02 |
| N-A2-07 | Czy reset hasła ustawia hasło kontu założonemu przez Google (droga do samodzielnego usunięcia) | konfiguracja GoTrue | test na koncie testowym | PRA-02 |
| N-A2-08 | Czy skrzynka `pomoc@faktflow.pl` przyjmuje pocztę (runbook z 1.10 mówił o braku MX) | DNS, Cloudflare | odczyt rekordów MX, mail testowy | PRA-09 |
| N-A2-09 | Retencja Sentry, Resend, trwałość Redisa, konfiguracja logów Docker | panele, serwery | odczyty operatora (kontynuacja [PR225]) | RET-10 |
| N-A2-10 | Czy tryb „soft-deleted” organizacji blokuje logowanie/pracę członków w przeglądarce | brak testu e2e | test e2e na środowisku z danymi syntetycznymi | PRA-04 |
| N-A2-11 | Skuteczność aktualnych wzorców `lib/flo/redact.ts` (SEC-D-03 oznaczone w rejestrze jako poprawione) | kod nieaktywny | uruchomić `scripts/security/audit-redaction.ts` (plik jest w repo; nie uruchamiałem) | AI-04 |
| N-A2-12 **[R3]** | Zawartość i retencja drugiej bazy `_supabase` (logi usług Supabase zbierane przez Vector → Logflare; ok. 676 MB wg [PR225 @a72b567]) i to, że jest poza nocnym `pg_dump` (`db-backup.sh:77`) | konfiguracja stosu Supabase na `db-1` | odczyt konfiguracji Logflare/Vector (okres przechowania, zakres pól) i liczników tabel — bez treści logów | RET-09, RET-10, E.1 |
| N-A2-13 **[R3]** | Czy na produkcji wyzwalacz `b_guard_invoice_pending_content` ma postać z `00132` (test R3 wykonano na bazie syntetycznej) i ile faktur z `submitted_to_ksef_at` ma już `scheduled_deletion_at` | stan `db-1`, dane produkcyjne | `pg_get_functiondef` funkcji na `db-1` i zapytanie licznikowe (bez treści) — sesja z dostępem do produkcji | RET-02, PRA-04 |
| N-A2-14 **[R3]** | Retencja kanału Slack zespołu, do którego trafiają e-maile użytkowników przy prośbie o kontakt (`support-actions.ts:76-83`) | ustawienia przestrzeni Slack | odczyt ustawień przez operatora | RET-10 |

Ograniczenia dowodowe tego pliku: brak dostępu do produkcji, paneli
dostawców i umów (`01-STAN-I-GRANICE.md` § 5); przepisy i wytyczne
oznaczone [NZ] podane z pamięci modelu; jedyny test wykonawczy to
syntetyczny test mechanizmu PostgreSQL (PRA-03/RET-03), uruchomiony na
lokalnym PostgreSQL 16 w bazie tymczasowej, usuniętej po teście; nie
uruchamiałem testów repo ani aplikacji.

## Pytania do końcowego review prawnego

1. **Okres i początek biegu dla faktur i dowodów księgowych** (RET-01,
   RET-05): czy właściwą regułą jest „koniec roku kalendarzowego, w którym
   upłynął termin płatności podatku + 5 lat” (art. 70 § 1 w zw. z art. 86
   § 1 OP, art. 112 ustawy o VAT [NZ]) zamiast „10 lat”; czy 10 lat
   wynika z innego przepisu (np. przechowywanie faktur w KSeF przez MF,
   rachunkowość) i czy dotyczy podatnika, czy tylko MF; czy FaktFlow
   jako procesor może ustalić okres sam, czy musi wynikać z umowy
   powierzenia (art. 28 ust. 3 lit. g). **[R3]** Czy po upływie okresu FaktFlow ma usuwać
   wiersz faktury przesłanej do KSeF, czy wystarczy usunięcie danych
   osobowych z kopii lokalnej (oryginał pozostaje w KSeF) — dziś usunięcie
   wiersza jest niemożliwe przez wyzwalacz `00132` (RET-02).
2. **Usunięcie konta a dane organizacji** (PRA-02, RET-04): kto jest
   administratorem danych firmy jednoosobowej po usunięciu konta jej
   jedynego właściciela; czy FaktFlow może (lub musi) przechowywać faktury
   klienta po zakończeniu umowy, skoro obowiązek przechowania ciąży na
   podatniku; czy wystarczy zwrot danych (eksport) i usunięcie.
3. **Dziennik audytu** (RET-03, PRA-11): czy pseudonimizacja wpisów
   (zerowanie identyfikatora i IP przy zachowaniu `tenant_id`) spełnia
   art. 17 przy organizacji jednoosobowej; jaki okres dla klas zdarzeń
   (dostęp, finanse, RODO); czy rejestr wykonanych żądań RODO może
   zawierać e-mail osoby usuniętej i jak długo.
4. **Sprostowanie faktur** (PRA-05): czy realizacja art. 16 przez fakturę
   korygującą (bez edycji oryginału) jest wystarczająca i jak to opisać
   w polityce.
5. **Zakres kopii z art. 15** (PRA-01): czy notatki operatorów
   (`admin_user_notes`) i wpisy dziennika o osobie zapisane przez innych
   podlegają wydaniu; czy plik musi obejmować dane u procesorów
   (PostHog, Sentry) czy wystarczy informacja o nich.
6. **Kopie zapasowe** (RET-09): czy dopuszczalne jest wygasanie danych
   usuniętych wraz z rotacją kopii (14 dni dziś, do ~12 miesięcy po
   decyzji o Storage Box) przy procedurze ponownego usunięcia po
   odtworzeniu, i jak to opisać osobom.
7. **AI** (AI-01, AI-05, PRA-08): czy automatyczna klasyfikacja AI
   faktur kosztowych wymaga polecenia klienta w umowie powierzenia
   albo przełącznika; czy obowiązki przejrzystości AI Act (art. 50)
   obejmują czat pomocy i od kiedy; czy `payment.score` (ocena
   terminowości JDG) wchodzi w zakres art. 22 RODO lub systemów
   wysokiego ryzyka.
8. **Osoby bez konta** (PRA-09, PRA-10): które żądania FaktFlow obsługuje
   sam (FF-A: newsletter, odbicia, zaproszenia), a które przekazuje
   klientowi (FF-P: kontrahenci, adresaci faktur i przypomnień); termin
   przekazania do wpisania w umowie powierzenia; proporcjonalna
   weryfikacja tożsamości dla żądań e-mailowych.
9. **Deklaracje w polityce** (PRA-01, PRA-04, RET-13): „export pełnych
   danych w 30 dni”, „usunięcie organizacji … najpóźniej w ciągu
   miesiąca”, „dane konta do 30 dni po anulowaniu subskrypcji”,
   „zanonimizowane” — czy poprawić tekst do stanu faktycznego przed
   wdrożeniem mechanizmów.
10. **[R3] Zamrożenie danych nabywcy na wysłanej fakturze** (RET-02,
   z `R3.md` § 8): czy zamrożenie danych nabywcy (w tym PESEL) na fakturze
   wysłanej do KSeF także dla operatora mieści się w wyjątku art. 17
   ust. 3 lit. b RODO na cały okres przechowania i jak to opisać
   w odpowiedzi na żądanie usunięcia [NZ].

## Co sprawdziłem / czego nie mogłem sprawdzić

**Sprawdziłem (kod `3e5e00d`, odczyt plików i grep):**

- eksport konta: `app/api/gdpr/export/route.ts`, `lib/gdpr/data-collector.ts`,
  `lib/auth/verified-user.ts`, `lib/rate-limit/index.ts`;
- usuwanie konta: `lib/gdpr/deletion.ts`, `lib/gdpr/deletion-blockers.ts`,
  `app/(dashboard)/settings/account/actions.ts`, `lib/auth/reauth.ts`,
  `app/(auth)/gdpr/cancel/actions.ts`, runner i rejestracja crona
  (`lib/jobs/runners/gdpr-process-deletions.ts`, `lib/jobs/handlers/package-a.ts:47`,
  `lib/jobs/queues.ts:105`), migracje `00051`, `00052`, `00069`, `00070`,
  `00072` (nagłówek), `00113`, akcje kluczy obcych do `auth.users`
  i `public.users` we wszystkich migracjach (grep `REFERENCES`);
  `docs/security/PLAN-WYDANIA-GDPR.md`, `docs/security/DZIENNIK-ODPORNOSCI-CYBER.md`
  (wpisy o 00072);
- ścieżka operatora `app/admin/users/actions.ts`, „Usuń organizację”
  `components/settings/account-actions.ts`, filtry `deleted_at`/`is_active`
  (grep), odbiór skrzynki KSeF;
- sprostowanie (grep `updateUser`, edycja firmy i kontrahentów), sprzeciw
  (wypis e-mail — przez A1), art. 22 (klasyfikator, FLO flags);
- wszystkie crony z `lib/jobs/queues.ts:89-127` pod kątem retencji; runnery
  `retention-delete`, `archive-old-invoices`, `cleanup-audit-logs`,
  `cleanup-old-backups` (fragment), `nightly-validation-recheck` (fragment);
  `lib/retention/invoice-files.ts`, `lib/storage/glacier.ts`,
  `lib/storage/r2.ts` (linki), klucze obce do `invoices`;
- domyślne reguły pg-boss 12.27.0 w `node_modules/pg-boss/dist/plans.js`;
- Redis: `lib/cache/keys.ts`; kopie: `scripts/hetzner/db-backup.sh` (fragment),
  `lib/backup/snapshot-tables.ts`; runbooki `unlock-account.md`,
  `skrzynka-pomoc.md`; polityka prywatności § 9–12;
- AI: `lib/anthropic/client.ts`, `lib/ocr/engine.ts` (fragment),
  `lib/categorization/{index,ai-classifier}.ts` (fragmenty),
  `app/api/support/chat/route.ts`, `lib/support/chat.ts` (fragment),
  `lib/flo/{flags,redact}.ts` (fragmenty), `tests/unit/flo-nieaktywne.test.ts`;
- dowód pośredni [PR225] `docs/observability/data-policy.md` (gałąź
  `origin/codex/f0-runtime-inventory`);
- test mechanizmu: klucz obcy `ON DELETE SET NULL` + wyzwalacz append-only
  na syntetycznej bazie lokalnego PostgreSQL 16 (wynik w PRA-03).

**Nie mogłem sprawdzić:** stanu produkcji (migracje, wyzwalacze, liczba
żądań, organizacje usunięte, zmienne AWS), działania aplikacji
w przeglądarce za logowaniem, konfiguracji GoTrue i schematu `auth`,
paneli i retencji Sentry, PostHog, Resend, Anthropic, zawartości kopii,
skrzynki `pomoc@`, treści umów; przepisów w źródłach pierwotnych (egress
zablokowany, WebSearch odrzucony). Nie czytałem w całości:
`lib/jobs/runners/process-ocr.ts`, `lib/flo/**` poza wskazanymi plikami,
`lib/exports/**`, pełnej treści polityki i regulaminu (zakres A1).

**Redakcja poprawek R3 (13.10.2026) — co sprawdzono przed naniesieniem:**
wyzwalacz `b_guard_invoice_pending_content` — `00119…sql:109-111`,
`00132…sql:37-129` (gałąź `DELETE` `:63-72` bez warunku roli dla
`submitted_to_ksef_at`/`offline_idempotency_key`), brak późniejszej
redefinicji (`grep guard_invoice_pending_content supabase/migrations` →
`00119`, `00132`, w `00137` tylko komentarz), pozostałe wyzwalacze faktur
z `00132` przepuszczają `service_role` (`:146-148`, `:250-251`);
`retention-delete.ts:29-36,80` (jedno zapytanie `DELETE … IN` na paczkę);
`Sentry.setUser` tylko w `lib/observability/sentry-context.ts:24,42`, bez
importów w `app`, `lib`, `components`, `hooks` i konfiguracjach Sentry;
tagi `tenant_id` (`cert-expiry-alert.ts:211`, `settings/billing/actions.ts:187`);
kolumny `accountant_access` (`00001…sql:200-208`, `00010…sql:9-21`),
`export_jobs.emailed_to` (`00024…sql:137`), `payment_reminders`
(`00014…sql:140-160`); PDF wezwań w `lib/retention/invoice-files.ts:76-77`
(R3 podał `:36-37`); kolumny eksportu `gdpr_deletion_requests`
w `data-collector.ts:107-111` (R3 podał `:104-107`); `support-actions.ts:76-83`
(`user_email`) i `chat/route.ts:178-185`; `00001…sql:174`;
`lib/storage/expenses.ts:130`; `lib/flo/proposals.ts:243-260`,
`lib/flo/tick.ts:197`; `submit-invoice.ts:1933-1940`; `db-backup.sh:77`
(`pg_dump … -d postgres`); `03-REJESTR-ZRODEL.md` WYM-72 i ZR-45 (klasa I,
O do potwierdzenia); `01-STAN-I-GRANICE.md` § 4 (fakty @`a72b567`).
Testu na bazie syntetycznej redaktor nie powtarzał — wynik z `R3.md` § 6.

## Historia recenzji

| Recenzent | Data | Werdykt | Uwagi | Przyjęte | Odrzucone | Plik recenzji |
|---|---|---|---|---|---|---|
| R3 — niezależny agent-recenzent (grupa: `A1` + `A2` + `A4`) | 10.10.2026 (recenzja wykonana w sesji 13.10.2026) | wymaga poprawek (27 kontroli punktowych, 23 potwierdzone, 4 z błędem: `user_email` w eksporcie, linia komentarza audytu, ścieżki Slacka, `user.id` w Sentry; rdzeń potwierdzony także testem na bazie syntetycznej) | 10 uwag do tego pliku (R3-U11 – R3-U20; 5 istotnych, 5 drobnych) | wszystkie 10 — naniesione przez redaktora poprawek 13.10.2026 po sprawdzeniu w kodzie i migracjach; miejsca oznaczone **[R3]**. Korekty względem propozycji recenzenta: U13 — linie PDF wezwań `invoice-files.ts:76-77`; U16 — linie eksportu `data-collector.ts:107-111`; U11 — dopisano, że jedno zapytanie `DELETE … IN` blokuje całą paczkę. Dodano N-A2-12 – N-A2-14 i pytanie 10 do review (z `R3.md` § 8) | — | `recenzje/R3.md` (streszczenie w `10-REVIEW.md`) |
