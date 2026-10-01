# ADR-0009: Kopie bazy po przeprowadzce — pg_dump na db-1 i Storage Box

- **Status:** Proposed (do zatwierdzenia przez Bartosza; Storage Box wymaga zakupu)
- **Data:** 2026-10-01
- **Faza:** krok 6 planu automatyzacji (`docs/automation`, poza repo)
- **Zastępuje częściowo:** [ADR-0007](./0007-backup-free-tier-first.md) — „Faza 2: Supabase PITR”

## Kontekst

ADR-0007 zakładał Supabase Cloud: bez dostępu do `pg_dump`, z PITR jako
następnym krokiem. Od sierpnia 2026 baza to Supabase self-hosted na `db-1`
(Hetzner), więc PITR z planu Pro nie istnieje, a `pg_dump` jest dostępny.

Nocny snapshot aplikacji (JSON przez REST) czyta tylko schemat `public`,
stronami, bez punktu w czasie. Pomija `auth.*` (konta, MFA) i `pgboss.*`
(AUD-08). Leży w MinIO na `ops-1`, w tym samym buckecie co pliki faktur
(AUD-38). Odtworzenia nikt nie przećwiczył.

## Decyzja

1. **Główna kopia: `pg_dump` całej bazy na `db-1`.** Cron co noc uruchamia
   `scripts/hetzner/db-backup.sh`. Skrypt robi zrzut w formacie custom
   i role, sprawdza spis treści i sumy, trzyma 14 ostatnich kompletnych
   zrzutów i pinguje Healthchecks.
2. **Kopia poza serwerem: Hetzner Storage Box.** Zrzuty idą przez
   `rclone copy` (nie `sync`) na zdalny typu `crypt`. Skrypt odmawia wysłania
   niezaszyfrowanego zrzutu. Przed skasowaniem z serwera chronią automatyczne
   snapshoty Storage Boxa, których klucz SFTP z `db-1` nie może usunąć.
3. **Snapshot JSON zostaje jako warstwa pomocnicza** z alarmem świeżości
   (AUD-37). Nie jest drogą odtwarzania.
4. **Próba odtworzenia co miesiąc** na hoście innym niż `db-1`
   (`scripts/hetzner/restore-drill.sh`), z protokołem w
   `docs/runbooks/backup-restore.md`.

## Konsekwencje

### Pozytywne

- Kompletny i spójny zrzut (jedna transakcja) z kontami i MFA.
- Odtworzenie sprawdzone na obrazie identycznym z produkcją.
- Kopia przeżywa utratę `db-1`, a po zakupie Storage Boxa także utratę
  całego projektu Hetzner Cloud.

### Negatywne / koszty

- RPO nadal ~24 h (jeden zrzut na dobę). Mniej da archiwizacja WAL
  (np. pgBackRest/WAL-G) — osobna decyzja przy pierwszych klientach.
- Storage Box ~4–5 €/mies. i jedno hasło `crypt` do przechowania poza
  serwerami (menedżer haseł). Bez tego hasła kopii poza serwerem nie da się
  odczytać.
- Zrzut zawiera hashe haseł ról i dane osobowe — katalog `700`, pliki `600`,
  poza serwerem tylko zaszyfrowane.

### Wymaga

- Instalacji crona i `/etc/faktflow-backup.env` na `db-1` (runbook § 2).
- Zakupu Storage Boxa i konfiguracji `rclone` (runbook § 3) — Bartosz.
- Pliki w MinIO na `ops-1` (XML, UPO, PDF) potrzebują własnej kopii na
  Storage Box, gdy pojawią się faktury klientów (runbook § 3).

## Rozważane alternatywy

- **Tylko backup Hetznera (obraz dysku)** — zależny od tego samego konta
  i dostawcy, odtworzenie całej maszyny zamiast bazy. Dobra warstwa
  dodatkowa, nie jedyna.
- **`pg_dump` w workerze pg-boss** — wymaga binarki Postgresa w obrazie
  workera i trzyma zrzut w pamięci procesu, który obsługuje joby (AUD-84).
  Cron na hoście bazy jest prostszy i niezależny od aplikacji.
- **WAL-G / pgBackRest z PITR** — właściwy kierunek przy realnym ruchu,
  ale wymaga zmian w kontenerze Postgresa zarządzanym przez Coolify.
  Odłożone.
