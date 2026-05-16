# Backup Restore Runbook (Faza 29)

Pełna procedura odzyskania bazy z snapshotu R2. Stosować gdy:
- Supabase DB unrecoverable (Scenario A3 z [disaster-recovery.md](disaster-recovery.md))
- Data corruption confirmed (np. failed migration zostawił zbity stan)
- Monthly DR drill (testuj na staging env)

**RTO target: < 2h** od decyzji do restored production.

---

## Pre-requirements

- Dostęp do **Cloudflare R2** (account z bucketem `R2_BACKUPS_BUCKET` lub
  głównym z prefixem `backups/`).
- Dostęp do **Supabase project** (lub fresh project do staging drill).
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`).
- Node.js 20+ lokalnie.
- `pnpm-lock.yaml` + repo checkout (do uruchomienia helper scripts).

---

## Step 0 — Decyzja: PITR czy R2 snapshot?

| Sytuacja | Wybór |
|---|---|
| Mamy Supabase Pro + PITR enabled, point-in-time < 7d | **PITR** (5 min RTO) |
| Brak PITR (free tier) lub PITR > 7d | **R2 snapshot** (1-2h RTO, RPO 24h) |
| Cały Supabase project lost (rzadko) | **R2 snapshot do fresh projektu** |

Aktualny stan (Maj 2026): brak Pro → R2 snapshot only. Po launch + upgrade
→ PITR preferred.

---

## Step 1 — Znajdź najnowszy zweryfikowany snapshot

```bash
# Na lokalnej maszynie z .env.local skonfigurowanym
cd ~/dev/ksef-saas
pnpm tsx scripts/list-backups.ts
```

Script zwróci listę z `backup_log`:
```
id        kind    status   size      r2_key                              started_at
abc12345  daily   success  4.2 MB    db/2026/05/15/02-00-00.json.gz     2026-05-15 02:00
def67890  daily   success  4.1 MB    db/2026/05/14/02-00-00.json.gz     2026-05-14 02:00
...
```

**Wybierz najnowszy `status=success` snapshot**. Jeśli ostatni jest failed,
weź przedostatni i zaakceptuj większy RPO.

> **Helper script `scripts/list-backups.ts` jeszcze nie istnieje** — TODO:
> przed pierwszym DR drill (Krok 7.1, do dodania w Fazie 35 docs phase).
> Tymczasem: query SQL z Supabase dashboard:
> ```sql
> SELECT id, kind, size_bytes/1024/1024 as size_mb, r2_key, started_at
> FROM backup_log
> WHERE status = 'success'
> ORDER BY started_at DESC
> LIMIT 10;
> ```

---

## Step 2 — Verify integralność wybranego snapshotu

```bash
pnpm tsx scripts/verify-backup.ts <backup_id>
```

Wywołuje `lib/backup/verify.ts → verifySnapshot()` z `backup_log` data:
- Download z R2
- SHA-256 vs `backup_log.checksum`
- Gunzip + JSON parse
- Row counts vs current DB (jeśli current DB jeszcze action, opcjonalne)

**Akceptujemy:** `errors=[]`, warnings OK.
**Odrzucamy:** errors zawierają `checksum_mismatch` lub `parse_failed` →
weź następny snapshot.

---

## Step 3 — Decyzja: in-place vs fresh project?

### Option A: Restore in-place (do tego samego Supabase project)

- **Plus:** zachowujemy auth.users (sesje + 2FA factors)
- **Minus:** ryzyko częściowego stanu jeśli błąd w trakcie restore
- Używamy gdy DB istnieje ale dane są skorumpowane.

### Option B: Fresh project (cały Supabase nowy)

- **Plus:** czysta tabula rasa
- **Minus:** auth.users trzeba re-tworzyć (userzy muszą reset password)
- Używamy gdy cały Supabase project lost.

---

## Step 4A — Restore in-place

```bash
# Backup CURRENT state przed nadpisaniem (paranoja)
pnpm tsx scripts/snapshot-now.ts --kind=manual --label=pre-restore-${DATE}

# Restore
pnpm tsx scripts/restore-backup.ts <backup_id>
```

Script `scripts/restore-backup.ts` (TODO: napisać przed first drill):
1. Pobierz snapshot z R2
2. Verify checksum
3. Gunzip + parse
4. Begin transaction
5. Dla każdej tabeli (w kolejności respect FK):
   - `TRUNCATE <table> CASCADE`
   - `INSERT INTO <table> SELECT * FROM jsonb_to_recordset(snapshot.tables.<table>)`
6. Commit
7. Verify row counts match snapshot

**Kolejność TRUNCATE** (respect FK dependencies — najpierw "liście" drzewa):
```
1. mfa_recovery_codes
2. push_subscriptions
3. email_bounces, email_preferences
4. accountant_tokens
5. payment_reminders, payments
6. invoice_positions, xml_documents
7. invoices, expenses
8. memberships, invitations, join_requests
9. tenants
10. users   (← public.users, auth.users zostaje)
```

UWAGA: `auth.users` NIE jest w snapshocie (Supabase managed schema). Po
restore in-place sesje istniejących userów dalej działają, ale ich
`public.users` row jest z snapshotu — może być desync z `auth.users` jeśli
ktoś zarejestrował się po snapshocie.

---

## Step 4B — Restore do fresh project

1. **Stwórz nowy Supabase project** w EU region (eu-central-1).
2. **Wykonaj migracje** od początku:
   ```bash
   pnpm db:push:prod  # ale z URLem nowego projektu
   ```
3. **Restore** jak w 4A ale do nowego projektu.
4. **Wyślij broadcast email** do userów: "Wymagany reset hasła z powodu
   migracji systemu".
5. **Zmień DNS/env** Vercel: `NEXT_PUBLIC_SUPABASE_URL` i klucze na nowy project.
6. **Redeploy** Vercel.

---

## Step 5 — Post-restore verification

```bash
pnpm tsx scripts/verify-restore.ts
```

Sprawdza:
- Liczność każdej tabeli == snapshot row_counts
- 10 random invoices: NIP + amount + status check
- 5 random users: email + created_at check
- Aktywne subskrypcje Stripe match `subscriptions` table

Manual smoke test:
- Zaloguj się jako admin → `/admin/dashboard` → wszystkie metryki sensowne
- Zaloguj się jako test tenant → `/dashboard` → faktury widoczne
- Wystaw test invoice w env=test → KSeF flow działa

---

## Step 6 — Communication po restore

Jeśli restore wpłynął na userów (utrata danych z RPO window 24h):

1. **Email do affected tenants** (queries: `INSERT INTO invoices WHERE created_at > snapshot.created_at` przed restore — utracone faktury):
   - Lista utraconych faktur (numer + data + odbiorca + kwota)
   - Prośba o ponowne wystawienie
   - Przeprosiny + credit (np. miesiąc gratis)

2. **Status page update**: "Resolved. Data restored from <snapshot date>. Affected: <N> users. Patrz post-mortem."

3. **Post-mortem** w `docs/incidents/YYYY-MM-DD-restore.md`:
   - Co się stało
   - Co zrobiliśmy
   - Co zmieniamy żeby zapobiec
   - RTO/RPO actuals vs target

---

## Failure modes

### Snapshot corrupted (checksum mismatch)

→ Weź **przedostatni** snapshot z `backup_log`. Każdy starszy zwiększa RPO
o ~24h. Po Day-3 trafiamy w weekly snapshot (jeśli był).

### R2 niedostępny w trakcie restore

→ Czekamy. Snapshot to pojedynczy plik 5-50 MB, nie ma alternative source
(do Phase 2 gdy będzie Glacier).

### Restore zajmuje > 2h (RTO breached)

→ Zwykle: zbyt duża tabela `invoices` (1M+ rows). Optymalizacja: batch
INSERT 10k rows/batch zamiast jednego dużego JSON.

### Auth user desync po in-place restore

→ Backfill: `INSERT INTO public.users (id, email) SELECT id, email FROM auth.users WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.users.id)`.
