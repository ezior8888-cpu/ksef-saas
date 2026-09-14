# Odpowiedź właściciela na przekazanie z 2026-09-13

Adresat: Masło (Igor / Astra). Data wykonania: 2026-09-14.
Wykonawca: Bartosz, przez sesję agenta z uprawnieniami `admin` do repo
i dostępem SSH do Hetznera. Wartości kluczy i danych klientów nie są tu zapisane.

Odpowiada na [PRZEKAZANIE-BARTEK-2026-09-13.md](PRZEKAZANIE-BARTEK-2026-09-13.md).

---

## 1. Kontrola zależności GitHub — ZROBIONE

Dependency graph był wyłączony, co potwierdzało 404 na `dependency-graph/sbom`
i `dependency-graph/compare`. Włączony przez `PUT /repos/…/vulnerability-alerts`
(pociąga za sobą graf zależności). SBOM raportuje 1649 pakietów.

Nie usunięto zadania i nie ustawiono `continue-on-error`. Ponowiono nieudane
przebiegi na wszystkich trzech PR-ach i **dependency-review przechodzi**:

| PR | job | wynik |
|---|---|---|
| #1 | 104078486120 | pass, 11 s |
| #2 | 104078495352 | pass, 8 s |
| #3 | 104078497093 | pass, 8 s |

Przy okazji włączono skan sekretów GitHuba i ochronę przed pushem (darmowe dla
repo publicznych, były wyłączone). Uzupełniają Gitleaksa o ochronę *przed*
wypchnięciem, nie zastępują go.

**Uwaga do PR #1:** `Typecheck + Lint + Unit tests` nadal FAIL, ale nie z powodu
kodu. `ci.yml` na gałęzi PR #1 nie instaluje `libxml2-utils`, więc walidacja XSD
w `lib/xml/fa3-generator.test.ts` pada z `XSD validation failed: undefined`.
Naprawia to Twój `ci.yml` w PR #2. PR #1 jako baza dla #2 zostanie czerwony aż
do scalenia — to nie regres.

## 2. Vercel Preview — ZAMKNIĘTE PRZEZ USUNIĘCIE

Ustalenie: Preview i Production **dzieliły 42 identyczne zmienne**, w tym
`SUPABASE_SERVICE_ROLE_KEY`, `KSEF_CREDENTIALS_ENCRYPTION_KEY`, `RESEND_API_KEY`,
`R2_*`, `AWS_*`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY` i webhooki Slacka.
Podgląd nie był odizolowany. Twoje podejrzenie było trafne.

Jedno zastrzeżenie na korzyść: deploymenty Preview zwracały 302 (Vercel
Authentication), więc **nie były publicznie czytelne**. Ryzykiem była kopia
żywych kluczy w usłudze poza stackiem i buildy działające z produkcyjnymi
poświadczeniami — nie publiczny podgląd danych.

Ponieważ produkcja stoi na Hetznerze pod Coolify, integracja została odpięta
(`vercel git disconnect`), a projekt skasowany wraz ze zmiennymi. Vercel nie
buduje już nic przy PR-ach.

**Skutek uboczny, który trzeba odnotować uczciwie:** apex `faktflow.pl` był
nadal serwowany przez Vercela i robił przekierowanie na `www`. Po skasowaniu
projektu apex zwraca 404 (`x-vercel-error: DEPLOYMENT_NOT_FOUND`).
`www.faktflow.pl` działa bez zmian. Naprawa to jedna zmiana rekordu DNS —
opisana w sekcji „Do wykonania". Coolify ma już skonfigurowane oba hosty
(`fqdn = https://faktflow.pl,https://www.faktflow.pl`) i ważny certyfikat na apex.

Wartości zmiennych były oznaczone jako Sensitive, więc nie dało się ich odczytać
i **nie da się stwierdzić, czy celowały w obecną bazę self-hosted, czy w starą
Supabase Cloud**. Lista do rotacji jest w sekcji „Do wykonania" i rozstrzygnięcie
należy do właściciela.

## 3. Ruleset i przegląd PR — CZĘŚCIOWO, ŚWIADOMIE

Założono ruleset `main - ochrona podstawowa` (id `23339700`, `enforcement: active`)
z regułami `deletion` i `non_fast_forward`.

**Wymaganych checków celowo NIE ustawiono.** `security.yml` i `e2e-staging.yml`
istnieją tylko na gałęziach codex, nie na `main`. Wpisanie dziś wymagań
`Secret scan`, `CodeQL (…)` czy `Offline security inventory` sprawiłoby, że PR #1
nigdy się nie scali — te zadania na jego gałęzi w ogóle nie wystartują. To
zakleszczenie, nie ochrona.

Lista do wpisania **po scaleniu #1→#2→#3**, nazwami dokładnie jak raportują się
w Actions: `Typecheck + Lint + Unit tests`, `dependency-review`, `Secret scan`,
`CodeQL (javascript-typescript)`, `CodeQL (actions)`, `Offline security inventory`.

Wymogu review nie ustawiono — zespół jest jednoosobowy, więc zablokowałby
wszystkie własne PR-y właściciela. Do zmiany, gdy pojawi się druga osoba.

## 4. Environment `security-staging` — SZKIELET GOTOWY, BEZ SEKRETÓW

Utworzony. Polityka gałęzi: wyłącznie `main`. Wymagany recenzent: właściciel repo.

**Odstępstwo od Twojej specyfikacji, świadome.** Prosiłeś o „brak samodzielnego
zatwierdzania przez uruchamiającego" (`prevent_self_review`). Przy jednoosobowym
zespole to zakleszczenie: właściciel odpala workflow, jest jedynym recenzentem
i nie mógłby zatwierdzić własnego uruchomienia. Ustawione na `false`. Do
włączenia, gdy będzie druga osoba z dostępem.

Czterech sekretów `STAGING_*` nie wprowadzono — wymagają najpierw postawienia
osobnej bazy staging z fikcyjnymi danymi dwóch firm, zgodnie z Twoim warunkiem
odbioru. **Mutujących E2E nie uruchamiano.**

## 5. Zgodność środowiska — SPRAWDZONE, Z DWOMA NIESPODZIANKAMI

### Wdrożone wersje

| | stan na 2026-09-14 |
|---|---|
| aplikacja (Coolify id=1) | `13a7d81`, wdrożona 2026-09-05, healthy |
| worker pg-boss (id=2) | `13a7d81`, wdrożony 2026-09-05, healthy |
| `main` | `69d2a6d` — **4 commity przed produkcją** (mobile/PWA niewdrożone) |
| schemat przed zmianą | `00067` |

Kod wdrożony i schemat były zgodne. Rozjazd dotyczy `main` względem produkcji,
nie kodu względem bazy.

### 00068 i 00069 — były NIEWGRANE, oba ustalenia potwierdzone na żywej bazie

Sprawdzono bezpośrednio na `db-1` przed wgraniem:

- **SEC-C-05 potwierdzone.** `public.invoices_overdue` miał `reloptions = NULL`
  (bez `security_invoker`), właściciel `postgres` ma `rolbypassrls = t`, rola
  `authenticated` miała `SELECT`. Widok omijał RLS `invoices` i nie filtrował po
  `tenant_id`. Każde zalogowane konto czytało faktury po terminie wszystkich firm.
- **SEC-C-06 potwierdzone.** `anonymize_user_audit_logs` miała `anon=X` i była
  wystawiona przez PostgREST (obecna w OpenAPI). Niezalogowany mógł skasować
  cudze logi audytu; RLS nie chroni, bo `SECURITY DEFINER` omija trigger
  niezmienności.

**Korekta do SEC-C-07 — ustalenie jest łagodniejsze, niż zakładał opis migracji.**
`anon` miał granty na `global_feature_flags`, `newsletter_subscribers`,
`gdpr_deletion_requests`, `mfa_recovery_codes` i `tenant_verification_status`,
ale **RLS jest włączony na wszystkich tych tabelach, a polityki obejmują
wyłącznie `authenticated`**. `anon` dostawał 0 wierszy mimo grantu. To higiena
głębokiej obrony, nie czynny wyciek. `REVOKE` i tak wykonano.

Skala w chwili sprawdzenia: 2 faktury, 1 firma, 28 wierszy audytu, widok zwracał
0 wierszy. Dziury były otwarte, ale nie było czego wynieść.

### Obie migracje wgrane 2026-09-14

Kontrola przed wgraniem: brak `DROP`, `TRUNCATE`, `DELETE FROM`, `UPDATE`.
Sprawdzono też, że `REVOKE` na `authenticated` niczego nie psuje — wszystkie
cztery wywołania (`lib/gdpr/deletion.ts:223`, `lib/admin/system.ts:155-156`,
`lib/backup/db-snapshot.ts:128`) idą przez `createAdminClient()` na
`SUPABASE_SERVICE_ROLE_KEY`, a `service_role` zachowuje `EXECUTE` z 00052.

Wgrane procedurą z `AGENTS.md`, osobno, `--single-transaction`, z wpisem do
`supabase_migrations.schema_migrations` i `NOTIFY pgrst`.

Weryfikacja po wgraniu:

| kontrola | wynik |
|---|---|
| `reloptions` widoku | `{security_invoker=true}` |
| ACL czterech funkcji | `anon=X` zniknęło, zostało `postgres` + `service_role` |
| granty `anon` na pięciu tabelach | 0 wierszy |
| widok jako `authenticated` bez kontekstu org | 0 wierszy |
| PostgREST `/invoices_overdue` | `42501` (nie `PGRST205` — cache przeładowany) |
| `schema_migrations` | `00069`, `00068`, `00067` |
| regres: zapis `service_role` do `newsletter_subscribers` | `INSERT 0 1`, w transakcji z `ROLLBACK`; tabela nadal 0 wierszy |

### Zależności GDPR — żadna niespełniona, ale blocker duplikatów jest pusty

`gdpr_deletion_requests` ma nadal kolumnę `cancel_token` (plaintext), brak
`processing_started_at`, brak wartości `processing` w ENUM, brak UNIQUE na
aktywnym żądaniu. Twoje trzy zależności z `PROPOZYCJE-SCHEMATU-GDPR.md`
pozostają warunkiem wydania PR #1.

**Dobra wiadomość:** tabela ma **0 wierszy**. Krok „ocena i rozstrzygnięcie
duplikatów", który oznaczyłeś jako możliwy blocker wydania, jest pusty —
zapytanie diagnostyczne nie ma czego zwrócić. Nie tworzono żadnych migracji
GDPR; `00070` jest nieodwracalna (SHA-256) i wymaga skoordynowanego wydania
z przerwą w obsłudze żądań. To osobna decyzja.

---

## Czego nie zrobiono

- **Żadnego merge'a.** Publikacja draftu nie jest zgodą na scalenie.
- **Żadnych migracji GDPR.**
- **Żadnego wdrożenia kodu.** Produkcja zostaje na `13a7d81`.
- **Żadnej rotacji kluczy** — to zmiany w usługach zewnętrznych, należą do właściciela.
- **Żadnych sekretów** wprowadzonych do GitHuba.
- **Mutujących E2E nie uruchamiano**, zgodnie z Twoim warunkiem odbioru.

## Do wykonania przez właściciela

1. **PILNE — przywrócić apex.** W Cloudflare zmienić rekord `A` dla `faktflow.pl`
   ze wskazania na Vercela na adres `app-1` (zob. `.agents/infra.env`), tryb
   „DNS only", tak samo jak działający `www`. Coolify ma już oba hosty w `fqdn`
   i ważny certyfikat na apex.
2. **Rozważyć rotację** kluczy, które leżały w skasowanym projekcie Vercel:
   `RESEND_API_KEY`, `R2_*`, `AWS_*`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`,
   `SLACK_WEBHOOK_*`, `RESEND_WEBHOOK_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`. **`KSEF_CREDENTIALS_ENCRYPTION_KEY` to osobna
   sprawa** — jego zmiana wymaga odszyfrowania i przeszyfrowania zapisanych
   poświadczeń KSeF, więc nie jest pozycją na liście „zmień klucz".
3. **Dodać sekrety `STAGING_*`** do environmentu `security-staging` po
   postawieniu odizolowanej bazy staging.
4. **Wpisać sześć wymaganych checków** do rulesetu po scaleniu #1→#2→#3.
5. **Usunąć osierocone environmenty** `Preview` i `Production` po Vercelu
   (0 sekretów, 0 zmiennych, brak reguł — kosmetyka).

## Zmiany w repo w tym pakiecie

- `supabase/migrations/00068…`, `00069…` — skopiowane z `codex/security-leak-fixes`,
  żeby repo odzwierciedlało stan bazy.
- `AGENTS.md` — adresy IP, nazwy kontenerów i prefiksy Coolify zastąpione
  zmiennymi z `.agents/infra.env` (poza gitem). Procedury bez zmian. Repo jest
  publiczne; adresy zostają w historii, więc to ograniczenie dalszego wycieku,
  nie jego cofnięcie.
- `.gitignore` — dodane `.agents/`.
- `vercel.json` — usunięty, projekt Vercel nie istnieje.
