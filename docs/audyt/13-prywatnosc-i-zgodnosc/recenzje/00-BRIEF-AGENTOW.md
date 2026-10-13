# BRIEF dla agentów — audyt „13. Prywatność i zgodność” (FaktFlow / ksef-saas)

Koordynator: główna sesja. Data: 2026-10-07. Repo: /home/user/ksef-saas,
gałąź `claude/gallant-faraday-ypjokp`, kod = `origin/main` @ 3e5e00d (wcześniej 7c0097f; 15 commitów różnicy dotyczy KSeF)
(2026-10-10, merge PR #245). Drzewo czyste.

## Pierwotne wymagania
Przeczytaj CAŁY plik `docs/audyt/13-prywatnosc-i-zgodnosc/00-ZADANIE.md`.
To jest punkt odniesienia dla wszystkich etapów.

## Zasady twardych granic (obowiązują każdego agenta)
1. To etap BADAWCZY. NIE zmieniasz kodu aplikacji, migracji, konfiguracji,
   testów w repo. Piszesz WYŁĄCZNIE plik(i) wskazane w twoim zadaniu
   w `docs/audyt/13-prywatnosc-i-zgodnosc/` (albo w scratchpadzie, jeśli tak
   powiedziano). Nie commitujesz i nie pushujesz — robi to koordynator.
2. Repo jest PUBLICZNE. W raportach: żadnych sekretów, adresów IP, nazw
   kontenerów, prefiksów Coolify, e-maili realnych osób, danych klientów,
   pełnych payloadów. Luki bezpieczeństwa opisuj jednym zdaniem (plik +
   rodzaj problemu), bez kroków wykorzystania. Nie czytaj i nie twórz
   `docs/automation/` ani `.agents/` (nie ma ich w tym klonie).
3. Brak dostępu do produkcji (SSH, Coolify, baza produkcyjna, panele
   dostawców, umowy) — to OGRANICZENIE DOWODOWE. Nie udajesz, że coś
   sprawdziłeś. Rozróżniasz „nie znaleziono w repo” od „nie istnieje”.
4. Sieć: egress jest filtrowany polityką organizacji. ZABLOKOWANE (403):
   eur-lex.europa.eu, edpb.europa.eu, uodo.gov.pl, isap.sejm.gov.pl,
   api.sejm.gov.pl, eli.gov.pl, aicpa-cima.com, gov.pl, ec.europa.eu,
   supabase.com, posthog.com, sentry.io, stripe.com, resend.com,
   hetzner.com, upstash.com, cloudflare.com i inne. Nie próbuj obchodzić
   blokad (403 = polityka; nie ponawiaj, nie szukaj mirrorów jako
   „obejścia”). DZIAŁA: raw.githubusercontent.com i github.com (publiczne
   repozytoria, np. oficjalne repozytoria dokumentacji dostawców),
   www.anthropic.com (strony /legal/*), registry.npmjs.org.
   WŁAŚCICIEL ODRZUCIŁ UŻYCIE WebSearch — NIE UŻYWAJ WebSearch.
   WebFetch na zablokowane domeny zwróci EGRESS_BLOCKED — nie ponawiaj.
5. Wiedza prawna z pamięci modelu (do 06.2026) NIE jest weryfikacją
   w źródle pierwotnym. Jeśli podajesz przepis bez odczytu źródła w tej
   sesji, oznacz: „niezweryfikowane online 2026-10-07 (egress zablokowany);
   treść wg wiedzy modelu — do potwierdzenia w końcowym review”.
6. Statusy wymagań: potwierdzone / częściowe / brak / niezweryfikowane /
   nie dotyczy (z uzasadnieniem).
7. Dowody: konkretne `ścieżka:linia` (linia albo zakres), nazwa migracji,
   nazwa testu, wynik komendy. Bez samych opinii.
8. Oddzielaj: (P) obowiązek prawny, (O) interpretacja organu/EDPB/UODO,
   (S) kryterium SOC 2, (I) proponowana praktyka inżynierska.
9. Język raportów: polski. Styl repo: rzeczowy, krótkie akapity, tabele.

## Fakty z rozpoznania (koordynator, do sprawdzenia przez ciebie w kodzie)
- Stos faktyczny: Next.js 16.3 App Router (`proxy.ts` zamiast middleware),
  Supabase self-hosted (Postgres+RLS, GoTrue z e-mail/hasło + Google OAuth +
  MFA, PostgREST, Kong) na Hetzner NBG1 (`db-1`), MinIO (API S3,
  `lib/storage/r2.ts`, zmienne `R2_*`) na `db-1`, pg-boss worker (druga
  aplikacja Coolify, `lib/jobs/`), hosting Hetzner + Coolify (app-1, ops-1,
  db-1). Część dokumentacji (np. `docs/architecture/system-overview.md`)
  jest NIEAKTUALNA (Vercel/Inngest/R2/Supabase Cloud) — nie traktuj jej jako
  stanu obecnego bez potwierdzenia w kodzie.
- Zmienne w `.env.example` wskazują integracje: Sentry, PostHog, Resend,
  Stripe, Anthropic (support + OCR), Upstash Redis, GUS API, KSeF (MF),
  web push (VAPID), Slack webhooki, Telegram bot (alerty), OPS heartbeat,
  AWS (AWS_ARCHIVE_BUCKET, AWS_GLACIER_BUCKET), Google OAuth (GoTrue).
  Możliwe też: Cloudflare Turnstile, Google Fonts, VIES, biała lista VAT,
  NBP (sprawdź w kodzie i CSP w `next.config.ts`).
- Tabele (z migracji `supabase/migrations/`, 131 plików): accountant_access,
  accountant_settings, admin_user_notes, audit_logs, backup_log,
  billing_*, categorization_rules, contractors, email_bounces,
  email_preferences, expenses, export_files, export_jobs, flo_* (agent AI,
  poza produkcją?), gdpr_deletion_requests, global_feature_flags,
  import_jobs, inngest_run_log, invoice_line_items, invoices, kpir_*,
  ksef_* , memberships, mfa_recovery_codes, newsletter_subscribers,
  ocr_jobs, organization_invitations, organization_join_requests,
  payment_imports, payment_reminders, payments, products,
  push_subscriptions, reminder_settings, reminder_templates, stripe_*,
  subscriptions, support_conversations, support_messages,
  tenant_feature_flags, tenants, upo_receipts, users, validation_cache,
  xml_documents (+ tabele auth.* GoTrue, pgboss.*, storage w MinIO).
- Istniejące materiały RODO: `lib/gdpr/*`, `app/api/gdpr/export/route.ts`,
  `app/gdpr/cancel`, ADR `docs/adr/0006-gdpr-14d-cooling-off.md`,
  `docs/security/PLAN-WYDANIA-GDPR.md`, `docs/security/ZGODA-NA-PRZYPOMNIENIA-2026-09-23.md`,
  `lib/retention/invoice-files.ts`, `lib/analytics/{consent,privacy}.ts`,
  `lib/observability/scrub*`, strony `app/(marketing)/legal/{polityka-prywatnosci,regulamin,rodo}`.
  Polityka prywatności ma placeholder administratora („[nazwa firmy], NIP
  [TWÓJ_NIP]”) — `app/(marketing)/legal/polityka-prywatnosci/page.tsx:20`.
- Wcześniejsze audyty: `docs/security/audyt/*` (bezpieczeństwo, ustalenia
  SEC-*), `docs/audyt/blok-1/*` (funkcjonalność), `docs/security/rto-rpo.md`,
  ADR 0007/0009 (backupy), `docs/runbooks/*`. Odwołuj się do nich, nie
  dubluj; sprawdzaj w kodzie, czy to, co deklarują, jest prawdą.
- `ai_todo.md` mówi „przed założeniem firmy” — podmiot prawny operatora
  może jeszcze nie istnieć (niewiadoma).
- Agent AI „FLO” (`lib/flo/`) — wg `docs/audyt/blok-1/KONTEKST-REPO.md`
  niewdrożony; ustal, czy przetwarza dane osobowe i czy może być włączony.

## Format pliku wynikowego
- Nagłówek: tytuł, autor (rola agenta), data, wersja kodu (3e5e00d),
  zakres, źródła danych, ograniczenia.
- Ustalenia z ID (prefiks podany w zadaniu), każdy: stan, dowód
  (ścieżka:linia), luka, ryzyko (wysokie/średnie/niskie + dlaczego),
  rekomendacja.
- Sekcja „Niewiadome i ograniczenia” oraz „Pytania do końcowego review
  prawnego” (jeśli dotyczy).
- Na końcu: krótka lista „co sprawdziłem / czego nie mogłem sprawdzić”.

## ADDENDUM 1 (koordynator, 2026-10-07 ~19:15 UTC) — dowody z otwartego PR #225

Otwarty, NIESCALONY PR #225 (Codex, „F0: wybory właściciela, dowody
i bezpieczny inwentarz”), gałąź `origin/codex/f0-runtime-inventory`
@ 65c3978 — już pobrana lokalnie (`git show origin/codex/f0-runtime-inventory:<plik>`).
Pliki: docs/observability/{runtime-inventory,data-policy,ownership,contracts,acceptance-plan}.md
oraz docs/observability/evidence/*.json. Zawiera DEKLAROWANY pomiar operatora
z 04.10.2026 i odczyty API dostawców z 06.10. Cytuj jako: „PR #225
(niescalony), plik:sekcja — pomiar/deklaracja operatora, niezweryfikowane
w tej sesji”. Najważniejsze fakty z tych dokumentów:
- MinIO APLIKACJI (zmienne R2_*) jest na ops-1, a NIE na db-1 (na db-1 jest
  osobny MinIO jako backend Supabase Storage). AGENTS.md jest tu nieaktualny.
- Redis: lokalny redis:7.2 + SRH (serverless-redis-http) na app-1, NIE Upstash.
  Zmienne UPSTASH_REDIS_REST_* to tylko konwencja nazw. => Upstash najpewniej
  NIE jest odbiorcą danych (do potwierdzenia, czy nigdzie indziej nie jest
  skonfigurowany).
- Sentry i PostHog: intake w regionie EU potwierdzony pomiarem 04.10.
  PostHog (konto): retencja Product Analytics 1 rok, replay 1 miesiąc;
  projekt PostHog ma replay opt-in WŁĄCZONY i heatmaps WŁĄCZONE po stronie
  ustawień projektu, podczas gdy kod ustawia disable_session_recording:true,
  autocapture:false, capture_heatmaps:false. Retencja Sentry nieodczytana.
  Deklaracja 07.10: brak płatnych planów Sentry/PostHog.
- Kopie: nocny pełny pg_dump LOKALNIE na hoście bazy (db-1); BRAK pełnej
  kopii bazy poza hostem; snapshot JSON schematu public (bez auth i pg-boss)
  w MinIO na drugim hoście; BRAK kopii MinIO aplikacji; brak WAL/PITR;
  funkcja backupów Hetznera włączona dla db-1 (7 obrazów), wyłączona dla
  app-1 i ops-1. Decyzja 07.10 (niewdrożona): restic na Hetzner Storage Box
  BX11 w HEL1 (Helsinki), 7 dziennych/4 tygodniowe/12 miesięcznych,
  miesięczny test restore.
- Staging NIE istnieje (jest tylko produkcja). Produkcja ma KSEF_ENV=test
  (celowo, przed startem; brak prawdziwych klientów — deklaracja).
- Worker: 52 kolejki, 27 cronów (pomiar 04.10).
- data-policy.md: PRZYJĘTA (nie wdrożona) polityka retencji telemetrii:
  logi lokalne do 7 dni (10 MiB × 5 plików), błędy Sentry 30 dni, product
  analytics 1 rok, audit dostępu/admin 13 mies., audit finansowy 10 lat,
  attempts 90 dni. Status: decyzja, nie implementacja.
- Role: Igor — monitoring, koordynacja, odbiór; Bartosz — operator/
  właściciel produktu; Codex — dokumentacja/dowody.
Używaj tych faktów z właściwym oznaczeniem poziomu dowodu; nie kopiuj
identyfikatorów kont ani szczegółów zapór.

## ADDENDUM 2 (koordynator, 2026-10-10) — wznowienie po limicie użycia

- Pierwsze podejście agentów (7.10) przerwał limit użycia API; żaden raport
  nie został zapisany. Zaczynasz od nowa (możesz korzystać z plików, które
  już są w `docs/audyt/13-prywatnosc-i-zgodnosc/`, ale ich nie nadpisuj,
  chyba że są twoje).
- Kod audytu: `origin/main` @ `3e5e00d` (10.10.2026). Gałąź robocza zawiera
  już scalenie tego `main`. Różnica względem 7c0097f to 15 commitów KSeF
  (decyzja klienta przy duplikacie 440, ponowienia KOR/ZAL/ROZ, migracja
  00148); w obszarze prywatności zmieniły się tylko `lib/audit/log.ts`
  (+6 linii) i `lib/email/send.ts` (+40 linii) — sprawdź je, jeśli dotyczą
  twojego zakresu.
- PR #225 został zaktualizowany 10.10 (gałąź `origin/codex/f0-runtime-inventory`
  @ 686a465, już pobrana): nowa decyzja (niewdrożona) — docelowo płatny
  Sentry Team EU (historia błędów 90 dni, spans 30 dni), pełna historia
  błędów faktur 10 lat we własnej bazie, planowany przyszły agent
  deweloperski z dostępem tylko do odczytu zredagowanej diagnostyki.
  Próba odczytu serwerów 10.10 nieudana (brak dostępu SSH) — brak nowego
  pomiaru runtime.
- Zapisuj wynik do pliku WCZEŚNIE i uzupełniaj przyrostowo (najpierw
  szkielet z sekcjami, potem kolejne sekcje), żeby przerwanie nie zniszczyło
  całej pracy.

## ADDENDUM 3 (koordynator, 2026-10-13) — fakty z recenzji R1 i R2

- PR #225 przesunął się 10.10 do `a72b567` (tytuł „F0: prepare complete
  backup execution with bounded adapters”). Według niego operator uzyskał
  10.10 od 14:23 UTC dostęp SSH i odczytał: produkcja (web, worker) na
  `43091e7`; MinIO Supabase 1 bucket/0 obiektów, MinIO aplikacji 1 bucket/
  31 obiektów; druga baza `_supabase` ok. 676 MB (logi Supabase przez
  Vector → Logflare), poza nocnym `pg_dump` (tylko baza `postgres`);
  PostHog (panel): replay ON, console ON, network timings ON, retencja
  replay 30 dni (kod wyłącza replay); Sentry: plan Developer, retencja
  zdarzeń 30 dni wg dokumentacji. `main` 10.10 = `face09c` (PR #246, #247,
  przebudowa importu). Audyt czyta nadal `3e5e00d`. Oznaczaj: [PR225 @a72b567].
- R2 ustalił (sprawdzone w node_modules): opcja `ip: false` w PostHog
  (`lib/analytics/init-posthog-browser.ts:52`) NIE DZIAŁA w SDK 1.374.3
  (`@posthog/types/dist/posthog-config.d.ts:1490-1494`: „THIS OPTION HAS NO
  EFFECT”). Jeśli jakiś raport przedstawia ją jako środek minimalizacji
  (prawdopodobnie `A1-…` ok. linii 138) — recenzent R3 ma to wskazać.
- R2: kod domyślnie wybiera `KSEF_ENV=test` (`lib/jobs/runners/submit-invoice.ts:628`,
  `lib/invoices/ksef-submit-enqueue.ts:127`); produkcja ma `test` [PR225] —
  ryzyko wysyłki prawdziwych danych do testowego KSeF (`04` PRC-17).
- R1: druga ścieżka usuwania organizacji przez właściciela
  (`components/settings/account-actions.ts:58-65`) też ustawia
  `hard_delete_at` bez wykonawcy; wyzwalacz `b_guard_invoice_pending_content`
  (`00132…sql:63-73`) blokuje `DELETE` faktur wysłanych do KSeF także dla
  `service_role` (sprawdzone na schemacie syntetycznym) — retencja faktur
  nie zadziała.
