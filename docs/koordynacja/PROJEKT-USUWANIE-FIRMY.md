# Projekt: prawdziwe usuwanie firmy (organizacji)

> **Dla Bartosza, do decyzji.** Dokument nie zmienia kodu ani bazy. Stan:
> `origin/main` 1ded2147 oraz PR #264 (regulamin, umowa powierzenia) i #271
> (wstrzymanie samoobsługi). Przygotowane 15.10.2026 w sesji Igora z Claude.
> Każde twierdzenie ma plik:linia albo nazwę migracji — sprawdzaj w kodzie,
> nie w tym pliku.

## 0. W skrócie

| | |
|---|---|
| **Dziś** | Aplikacja nie umie ani wyłączyć, ani usunąć firmy. Flagi `tenants.deleted_at`, `hard_delete_at`, `is_active` stawiała akcja „Usuń konto” (do #271) i panel admina, ale nikt ich nie czyta przy dostępie ani w jobach. Od #271 usunięcie firmy zleca się mailem do pomocy, a operator nie ma do tego narzędzia. |
| **Cel** (#264: regulamin § 14 ust. 2 i 6, umowa powierzenia § 9) | wypowiedzenie → **30 dni** dostępu na eksport → mail o planowanym usunięciu → usunięcie danych **w ciągu kolejnych 30 dni**, kopie zapasowe w cyklu **≤ 30 dni** → potwierdzenie na żądanie. Wcześniejsze usunięcie na polecenie klienta. Konta użytkowników zostają. |
| **Propozycja** | Cztery stany firmy (`active` → `closing` → `purging` → `purged`). Przełącza je operator akcją w `/admin`, a przejścia po terminie robi cron. Dostęp, joby, Stripe, KSeF i pliki pilnują stanu. |
| **Wymaga migracji** | kolumny stanu, zmiany `is_member_of`/`get_current_tenant_id`, funkcji usuwającej (obejście strażników), zmiany FK billingu. Wszystko po stronie Bartosza. |
| **Znalezione przy okazji** | (1) `DELETE FROM tenants` dziś się wywróci na `audit_logs` (§ 4.7). (2) Usunięcie firmy skasowałoby kaskadowo **nasze** zapisy płatności Stripe (§ 4.4). (3) Kopie zapasowe żyją do 56 dni i dłużej, a umowa obiecuje ≤ 30 dni (§ 4.8). |

## 1. Stan dziś — kto czyta flagi firmy

| Miejsce | Czyta `is_active` / `deleted_at` / `hard_delete_at`? |
|---|---|
| `is_member_of()`, `get_current_tenant_id()` (00037) — podstawa RLS | nie, tylko `memberships.status` |
| `lib/supabase/auth-context.ts`, `lib/dashboard-shell-data.ts` | nie |
| `lib/jobs/runners/**` (40 plików) | nie — żaden |
| `cron.retention-delete` | nie — usuwa **faktury** po `invoices.scheduled_deletion_at` (10 lat), firm nie dotyka |
| portal księgowej (`lib/accountant/load-accountant-portal.ts`, `app/api/portal/exports/generate/route.ts`) | nie — tylko `revoked_at` i `expires_at` linku |
| `lib/flo/tick.ts` | tak — Flo pomija firmę |
| `lib/analytics/platform-metrics.ts`, `lib/admin/flags.ts`, `mv_tenant_dashboard_summary` (00044) | tak — tylko liczniki i widoki |

Skutek: „usunięta” firma działała dalej dla wszystkich członków, joby (KSeF, przypomnienia do kontrahentów, paczki dla księgowej) chodziły, Stripe pobierał opłaty.

## 2. Cel — co obiecują dokumenty (#264)

- **Regulamin § 14 ust. 2:** wypowiedzenie Umowy e-mailem, „w tym zlecając usunięcie Organizacji”; usunięcie Konta nie rozwiązuje Umowy.
- **Regulamin § 14 ust. 6:** po rozwiązaniu 30 dni na eksport, Organizacja **pozostaje dostępna**, chyba że klient zleci wcześniejsze usunięcie; mail o planowanym usunięciu; konta zostają aktywne.
- **Umowa powierzenia § 9:** 30 dni na eksport (na żądanie przekazujemy dane), potem usunięcie w ciągu 30 dni, kopie w cyklu ≤ 30 dni, potwierdzenie na żądanie; wcześniejsze usunięcie na polecenie (e-mail).
- **Regulamin § 7 ust. 6:** obowiązek przechowywania faktur ciąży na kliencie; KSeF przechowuje faktury niezależnie.

## 3. Proponowany cykl życia firmy

```
 active ──(operator: wypowiedzenie)──► closing ──(export_until minął
   ▲                                     │       albo polecenie klienta)──► purging ──► purged
   └──────(operator: cofnięcie ≤ 30 dni)─┘                                  (job)       (nagrobek)
```

| Stan | Członkowie | Joby z efektem zewnętrznym | Stripe | KSeF | Dane |
|---|---|---|---|---|---|
| `active` | pełny dostęp | działają | aktywny | działa | są |
| `closing` (do `export_until` = +30 dni) | **odczyt i eksport**, bez zapisu | **stop** (lista w § 4.3) | `cancel_at_period_end` | dane uwierzytelniające skasowane, wysyłka i skrzynka stop | są |
| `purging` | brak dostępu (RLS) | stop | — | — | job usuwa (§ 4.6–4.7) |
| `purged` | brak | — | zapisy płatności **zostają** (nasze) | — | został tylko nagrobek: `id`, stan, daty, bez nazwy i NIP |

**Decyzja 1 — gdzie trzymać stan:** (a) nowa kolumna `lifecycle_state` z CHECK + `export_until` + `purge_requested_at` (czytelne, polecam), albo (b) dotychczasowe `is_active`/`deleted_at`/`hard_delete_at` z nowym znaczeniem (mniej migracji, ale `is_active` już czytają Flo i metryki w innym sensie).

**Decyzja 2 — „tylko odczyt” w `closing`:** (a) w aplikacji: `requireUserAndActiveOrg`/`getPageContext` zwracają tryb, akcje serwera odmawiają zapisu, a RLS odcina dopiero w `purging` (mniej polityk do zmiany — polecam), albo (b) w RLS: osobne warunki dla SELECT i INSERT/UPDATE/DELETE w każdej polityce (szczelniej, ale dziesiątki polityk).

## 4. Co musi pilnować stanu

### 4.1 Dostęp z sesją

| Miejsce | `closing` | `purging`/`purged` | Migracja? |
|---|---|---|---|
| `is_member_of()`, `get_current_tenant_id()` (00037) | bez zmian (decyzja 2a) | zwracają FALSE/NULL | **tak** |
| `lib/supabase/auth-context.ts` (`requireUserAndActiveOrg`, `requireOrgRole`), `lib/supabase/page-context.ts` | tryb tylko-odczyt, odmowa zapisów z komunikatem „firma w trakcie zamykania — eksport w Księgowość → Eksport” | odmowa | nie |
| `lib/dashboard-shell-data.ts` (przełącznik firm) | baner z datą `export_until` | firma znika z listy | nie |
| zaproszenia (`organization_invitations`, `app/invite/[token]`) | odwołać przy przejściu | — | nie |

### 4.2 Dostęp bez sesji

| Miejsce | Co zrobić |
|---|---|
| portal księgowej (`lib/accountant/load-accountant-portal.ts:49`, `app/api/portal/exports/generate/route.ts:48`) — link z tokenem, klient service-role | `closing`: zostawić odczyt albo odwołać (**decyzja 3**); `purging`: `accountant_access.revoked_at = now()` |
| `accountant_settings.co_pilot_enabled` | wyłączyć przy `closing` |

### 4.3 Joby (crony z `lib/jobs/queues.ts`)

Joby zdarzeniowe (`submit-invoice`, `notify-user`, `process-ocr`, `bulk-import`, `exports-generate`, `magic-import-ksef`, `download-upo`, `auto-categorize-inbox`, `cancel-reminders-on-payment`, `self-invoice-payment`) startują po akcji w firmie. Po odcięciu zapisów nowe nie powstaną, ale **już zakolejkowane** muszą sprawdzić stan na starcie (jedna funkcja `assertTenantOperational(tenantId)`).

| Cron | Wybiera firmy przez | Efekt zewnętrzny | W `closing`/`purging` |
|---|---|---|---|
| `inbox-polling` (co 15 min) | `tenants` z `ksef_credentials_encrypted` (`inbox-polling.ts:139`) | KSeF | pominąć (i tak brak danych uwierzytelniających po § 4.5) |
| `inbox-backfill` | faktury `ksef_inbox` | KSeF | pominąć |
| `process-offline-queue` (co 5 min) | faktury w kolejce offline | **wysyłka do KSeF** | `closing`: **decyzja 4** (dokończyć czy wstrzymać); `purging`: pominąć |
| `ksef-lifecycle-reconcile`, `upo-retry-stale` | faktury w toku | KSeF | `closing`: dokończyć (UPO to dowód dla klienta); `purging`: pominąć |
| `reminder-scheduler` (co godzinę) | `reminder_settings.enabled` (`reminder-scheduler.ts:149`) | **maile do kontrahentów** | pominąć |
| `co-pilot-monthly` | `accountant_settings.co_pilot_enabled` (`co-pilot-monthly.ts:154`) | **maile do księgowej** | pominąć |
| `cert-expiry-alert` | `ksef_certificate_expiry` (`cert-expiry-alert.ts:75`) | push/mail | pominąć |
| `trial-countdown-emails` | `subscriptions.status = trialing` | mail | pominąć |
| `email-sequence` | członkostwa | mail | pominąć |
| `nightly-validation-recheck`, `archive-old-invoices` | kontrahenci / faktury | GUS / Glacier | pominąć |
| `flo-tick` | już filtruje `is_active` i `deleted_at` (`lib/flo/tick.ts:305`) | — | dostosować do nowego stanu |
| `retention-delete`, `cleanup-*`, `daily-*`, `weekly-*`, `ksef-health-check`, `jobs-watchdog`, `verify-backup`, `critical-alerts-monitor` | operacyjne / wszystkie firmy | wewnętrzne | bez zmian (sprawdzić liczniki) |

Strażnik testowy: test, że **każdy** cron z rejestru jest na liście „sprawdza stan” albo „operacyjny” — nowy cron nie przejdzie bez decyzji.

### 4.4 Stripe i nasze zapisy finansowe

- Przy `closing`: subskrypcja `cancel_at_period_end` (regulamin § 6: bez zwrotu za rozpoczęty okres, z wyjątkami z § 12–15). Zwroty zostają ręczne (`docs/support/refund-policy.md`).
- **Problem:** `subscriptions`, `stripe_payments`, `stripe_refunds` mają `tenant_id … REFERENCES tenants(id) ON DELETE CASCADE` (00047:70, :142, :202). Usunięcie wiersza `tenants` skasowałoby **nasze** zapisy sprzedaży i zwrotów. Potrzebujemy ich do własnej księgowości przez 5 lat. Do tego `stripe_payments` ma strażnika `BEFORE DELETE` (00080:360).
- **Propozycja (migracja):** FK billingu → `ON DELETE SET NULL` (albo `RESTRICT` i odpięcie w funkcji usuwającej), dane nabywcy zostają w naszych fakturach za abonament.

### 4.5 KSeF

- Przy `closing`: wyczyścić `tenants.ksef_credentials_encrypted`, certyfikat i tokeny (regulamin § 7 ust. 1: upoważnienie tylko do świadczenia Usług). Klientowi podpowiedzieć cofnięcie uprawnień w KSeF.
- Faktury w toku (`queued`/`sending`/wysłane bez UPO): **decyzja 4**. Polecam: przejście do `closing` odmawia, dopóki są faktury w toku, z komunikatem dla operatora (fail-closed z wyjściem: lista faktur + „poczekaj na UPO albo oznacz ręcznie”).

### 4.6 Pliki (R2/MinIO, Glacier)

| Klucze | Źródło |
|---|---|
| `${tenantId}/${rok}/${miesiąc}/${invoiceId}.xml`, `.upo.xml`, PDF | generatory XML/UPO/PDF, `lib/retention/invoice-files.ts` |
| `${tenantId}/ksef-import/${numer}.xml` | import z KSeF |
| `tenants/${tenantId}/expenses/${rok}/${mc}/${ocrJobId}.${ext}` | OCR wydatków |
| `${tenantId}/${rok}${mc}/` | eksporty |
| `archive_storage_path` (S3 Glacier Deep Archive) | `archive-old-invoices` |

Usuwanie: po prefiksach `${tenantId}/` i `tenants/${tenantId}/` (lista + `DeleteObject`, idempotentnie) oraz po `archive_storage_path`. Glacier Deep Archive liczy minimum 180 dni przechowywania, więc wcześniejsze usunięcie i tak kosztuje.

### 4.7 Baza — kolejność usuwania i strażnicy

Większość tabel ma `tenant_id … ON DELETE CASCADE`, więc `DELETE FROM tenants WHERE id = …` usuwa resztę. Po drodze odbije się od:

| Strażnik | Skutek przy kaskadzie | Co zrobić |
|---|---|---|
| `audit_logs.tenant_id … ON DELETE SET NULL` (00001) + `trg_audit_logs_prevent_update` (00052) | akcja FK SET NULL to UPDATE na `audit_logs`, który odpala wyzwalacze tabeli → wyjątek „append-only” → **cały DELETE się wywraca** (wniosek z czytania migracji — potwierdzić testem na bazie) | funkcja usuwająca robi `SET LOCAL app.allow_audit_purge = 'true'`; wpisy zostają bez `tenant_id` do `cleanup-audit-logs` (12 mies.) |
| `c_guard_ksef_retired_draft_delete` (00148) — szkice z zajętym numerem | może odmówić | sprawdzić, czy przepuszcza `service_role`; w razie potrzeby flaga sesji jak wyżej |
| strażnik kosztów KSeF `BEFORE UPDATE OR DELETE ON expenses` (00127) | może odmówić | jw. |
| `u_guard_stripe_payment_financial_refs_delete` (00080) | blokada referencji | rozwiązuje § 4.4 (FK bez kaskady) |
| `users.last_active_tenant_id`, `support_conversations.tenant_id` — SET NULL | bez strażników | ok |

**Propozycja (migracja):** `public.purge_tenant(p_tenant_id uuid)` — `SECURITY DEFINER`, tylko `service_role`, jedna transakcja, ustawia flagi strażników, usuwa wiersz `tenants` (kaskada), zostawia nagrobek. Pliki usuwa job **przed** wywołaniem funkcji (jak `retention-delete`: najpierw pliki, potem wiersze — AUD-45). Test na bazie (`tests/rls-*.test.ts`, job CI „RLS isolation”) na firmie z fakturą wysłaną, szkicem wycofanym, kosztem KSeF, wpisami audytu i płatnością Stripe.

### 4.8 Kopie zapasowe — rozjazd z umową

`lib/jobs/runners/cleanup-old-backups.ts:20-29`: dzienne 30 dni, **tygodniowe 56 dni**, **ręczne bez limitu**, a 7 ostatnich udanych zostaje **niezależnie od wieku**. Umowa powierzenia § 9 ust. 2 (#264): „kopie zapasowe — w cyklu nadpisywania kopii, nie dłuższym niż 30 dni”. **Decyzja 5:** skrócić retencję (tygodniowe ≤ 30 dni, ręczne z datą ważności) albo zmienić tekst umowy (np. „nie dłuższym niż 60 dni”). Do tego kopie na poziomie Hetznera/Supabase na `db-1` — do sprawdzenia.

### 4.9 Ścieżka operatora i komunikacja

- `/admin` → firma: „Rozwiąż umowę” (`active → closing`, data `export_until`, mail do właściciela z datą usunięcia i instrukcją eksportu), „Cofnij” (`closing → active` przed terminem), „Usuń teraz” (`closing → purging` na polecenie klienta). Każde przejście w `audit_logs` i z potwierdzeniem jak „DELETE”.
- Cron `cron.tenant-lifecycle` (raz dziennie): `closing` po `export_until` → `purging` → pliki → `purge_tenant()` → `purged`; mail „dane usunięte” na żądanie (umowa § 9 ust. 2).
- Szablony maili: „planowane usunięcie” (regulamin § 14 ust. 6) i „potwierdzenie usunięcia”.
- Po wdrożeniu: zamiast instrukcji „napisz do pomocy” (#271) można przywrócić samoobsługowe zlecenie — przejście do `closing` z potwierdzeniem NIP — bo wtedy obietnica ma pokrycie.

### 4.10 Ponowienie od zera (pg-boss)

| Krok joba | Ponowienie po kroku |
|---|---|
| usunięcie plików po prefiksie | idempotentne (brak obiektu = ok) |
| `purge_tenant()` | jedna transakcja; drugi raz: firma już `purged` → nic |
| mail „dane usunięte” | `singletonKey = tenantId` |

## 5. Migracje — prośby do Bartosza

| # | Co | Przed / PO wdrożeniu |
|---|---|---|
| M1 | stan firmy (kolumna + CHECK) — decyzja 1 | przed |
| M2 | `is_member_of()` / `get_current_tenant_id()` odcinają `purging`/`purged` | przed (addytywne: stare firmy są `active`) |
| M3 | FK `subscriptions`, `stripe_payments`, `stripe_refunds` → bez kaskady | przed |
| M4 | `purge_tenant()` (SECURITY DEFINER, tylko service_role) | przed |
| M5 | (opcjonalnie) RLS tylko-odczyt w `closing` — decyzja 2b | przed |

Numery z rejestru w `docs/koordynacja/CLAUDE-DO-CODEXA.md` przy pisaniu migracji.

## 6. Kolejność prac (każdy punkt = osobny PR od `main`)

1. M1–M4 + testy na bazie (`tests/rls-*`): odcięcie dostępu, kaskada z `purge_tenant()` przez wszystkich strażników.
2. Kod: stan w `auth-context`/`page-context`, baner, odmowa zapisów w `closing`.
3. Joby: `assertTenantOperational()` + filtr w cronach z § 4.3 + strażnik testowy „każdy cron sklasyfikowany”.
4. Operator: akcje w `/admin`, maile, `cron.tenant-lifecycle`, KSeF i Stripe przy przejściach.
5. Kopie zapasowe — decyzja 5.
6. (opcjonalnie) samoobsługa w `/settings` zamiast „napisz do pomocy”.

## 7. Decyzje do podjęcia (Bartosz)

1. Gdzie trzymać stan: nowa kolumna czy stare flagi (§ 3)?
2. „Tylko odczyt” w `closing`: w aplikacji czy w RLS (§ 3)?
3. Portal księgowej w `closing`: zostawić odczyt czy od razu odwołać (§ 4.2)?
4. Faktury w toku przy wypowiedzeniu: blokować przejście czy dokończyć wysyłki (§ 4.3, 4.5)?
5. Kopie zapasowe: skrócić retencję czy zmienić umowę (§ 4.8)?
6. Firmy oznaczone dotąd flagami (`SELECT id, deleted_at FROM tenants WHERE deleted_at IS NOT NULL`): napisać do właścicieli, czy firmę zamknąć według nowej procedury, czy przywrócić?
