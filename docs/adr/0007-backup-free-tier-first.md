# ADR-0007: Backup — free-tier R2 first (PITR odłożone)

- **Status:** Accepted
- **Data:** 2026-04-22
- **Faza:** 29

## Kontekst

Wymóg DR: RPO < 24 h, RTO < 2 h. Opcje:
1. **Supabase PITR** (Point-In-Time Recovery) — wymaga planu Pro+ Supabase
   (~$25/mies. add-on), RPO ~minuty, RTO ~minuty.
2. **AWS Glacier** — odległy, taniego storage, RTO godziny.
3. **Własny daily snapshot do R2** — free-tier R2 ma 10 GB, gzip cały DB
   raz dziennie, sami zarządzamy lifecycle.

Pre-launch (solo founder, brak płacących klientów) — minimalizujemy koszty.

## Decyzja

**Faza 1 (pre-launch): własny daily snapshot do R2.** Cron `dailyDbSnapshotJob`
(02:00 PL) dumpuje wszystkie tabele `public.*` (z RPC `list_public_tables`),
gzipuje, oblicza SHA-256, uploaduje do R2 z prefixem `backups/`. Retencja:
30 d daily + 8 w weekly.

Weekly `verifyBackupJob` (ndz 03:00 PL) — pobiera ostatni snapshot,
weryfikuje checksum, parsuje, sprawdza row drift vs current DB.

**Faza 2 (post-launch / pierwszy płacący klient):** włączamy Supabase PITR
(plan Pro) + AWS Glacier dla archive 1y+. PITR redukuje RPO z 24 h do minut.

## Konsekwencje

### Pozytywne

- Zero kosztów backup pre-launch (R2 free tier wystarcza).
- Pełna kontrola nad lifecycle, retencją, weryfikacją.
- Snapshot przez RPC = nie potrzebujemy `pg_dump` access (nie mamy go
  na Supabase free tier).
- W razie corrupted Supabase project — mamy własne dane w R2.

### Negatywne / koszty

- **RPO ~24 h** w razie awarii — możemy stracić cały dzień transakcji
  klientów. Dla pre-launch akceptowalne (brak klientów), post-launch
  blokujemy upgrade'em do PITR.
- Snapshot przez RPC ma 10 GB limit w jednej transakcji — przy dużej DB
  trzeba rozbić na batches. Na razie nie problem.
- Restore wymaga ręcznej procedury (`docs/runbooks/backup-restore.md`),
  nie one-click jak PITR.

### Wymaga

- Tabela `backup_log` + RPC `list_public_tables` (migracja 00053).
- Cron `dailyDbSnapshotJob`, `verifyBackupJob`, `cleanupOldBackupsJob`.
- Env: `R2_BACKUPS_BUCKET` (opcjonalny — fallback na główny z prefixem).

## Rozważane alternatywy

- **PITR od razu** — koszt ~$25/mies. add-on przed pierwszym klientem.
  Pre-launch nieuzasadniony. Włączymy w Fazie 2.
- **Tylko Glacier** — odległy storage, RTO godziny, ryzyko że nigdy nie
  zweryfikujemy restore. Odrzucone na ten etap.
- **Brak backup** — nieakceptowalne dla SaaS z fakturami klientów.

## Linki

- [docs/runbooks/backup-restore.md](../runbooks/backup-restore.md)
- [docs/runbooks/disaster-recovery.md](../runbooks/disaster-recovery.md)
- [docs/security/rto-rpo.md](../security/rto-rpo.md)
- Migracja `00053_backup_log.sql`
- `lib/inngest/jobs/daily-db-snapshot.ts`, `verify-backup.ts`
