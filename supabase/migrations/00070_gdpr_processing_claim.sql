-- ═══════════════════════════════════════════════════════════════
-- 00070 — GDPR: atomowe przejęcie żądania przez worker
-- ═══════════════════════════════════════════════════════════════
--
-- Źródło projektu: docs/security/PROPOZYCJE-SCHEMATU-GDPR.md (Astra/Masło).
-- Przenumerowane z proponowanego 00071 na 00070, żeby kolejność plików
-- odpowiadała kolejności wgrywania: ta migracja idzie PRZED zmianą nazwy
-- kolumny tokenu, nie po niej.
--
-- ── Dlaczego to jest bezpieczne do wgrania PRZED kodem ──────────
-- Migracja jest czysto addytywna i została sprawdzona wobec kodu
-- faktycznie wdrożonego na produkcji (b9c3703, lib/gdpr/deletion.ts):
--
--   1. ŻADNE zapytanie nie używa `select('*')` — wszystkie mają jawne
--      listy kolumn, więc nowa kolumna jest dla działającego kodu
--      niewidoczna.
--   2. Status jest wyłącznie porównywany równościowo (`=== 'pending'`,
--      `.eq('status','pending')`). Nie ma wyczerpującego dopasowania,
--      które nowa wartość ENUM mogłaby rozsadzić.
--   3. Migracja NIE nadaje wartości `processing` żadnemu wierszowi.
--      Dopóki nie wjedzie nowy worker, nic tej wartości nie zapisze.
--
-- Stara aplikacja działa dalej bez zmian. Nowa wymaga obu obiektów.
--
-- ── Uwaga o transakcji ──────────────────────────────────────────
-- `ALTER TYPE ... ADD VALUE` wolno uruchomić w bloku transakcyjnym od
-- PostgreSQL 12 (produkcja: 15.8), ale nowej wartości NIE WOLNO użyć
-- w tej samej transakcji. Dlatego indeks częściowy, którego predykat
-- odwołuje się do `processing`, jest w OSOBNYM pliku 00071 i musi być
-- uruchomiony jako osobne wywołanie psql, po zatwierdzeniu tej migracji.
--
-- ── Semantyka, którą to włącza ──────────────────────────────────
-- Worker zmienia status warunkowym UPDATE wyłącznie dla `pending`
-- ze `scheduled_for <= now()`. Anulowanie również wymaga `pending`.
-- Jedna operacja wygrywa; drugi worker ani retry nie podejmie ponownie
-- żądania w stanie `processing`, `failed` czy `executed`.
--
-- Awaria procesu po przejęciu zostawia `processing` i znacznik czasu.
-- TAKI REKORD WYMAGA KONTROLI OPERATORA: sprawdzić, czy konto istnieje
-- jeszcze w Auth i w jakim stanie jest anonimizacja audytu, dopiero
-- potem ustalić stan końcowy. NIE automatyzować powrotu do `pending`
-- na podstawie samego wieku rekordu — usunięcie mogło się zakończyć
-- tuż przed awarią, a jego ponowienie wymaga osobnej decyzji.
--
-- ── Wycofanie ───────────────────────────────────────────────────
-- Kolumnę można usunąć (`DROP COLUMN processing_started_at`).
-- Wartości ENUM w PostgreSQL NIE DA SIĘ usunąć — `processing` zostaje
-- w typie na zawsze. Jest to nieszkodliwe, dopóki nic jej nie zapisuje,
-- ale trzeba to wiedzieć przed wgraniem.

ALTER TYPE public.gdpr_deletion_status ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE public.gdpr_deletion_requests
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gdpr_deletion_requests.processing_started_at IS
  'Czas atomowego przejęcia żądania przez worker (00070). Osierocony processing wymaga ręcznej kontroli operatora, bez automatycznego retry.';

-- ── Weryfikacja po wgraniu ──────────────────────────────────────
-- SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'gdpr_deletion_status' ORDER BY e.enumsortorder;
--   -- oczekiwane: pending, canceled, executed, failed, processing
--
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'gdpr_deletion_requests'
--     AND column_name = 'processing_started_at';
--   -- oczekiwane: timestamp with time zone, YES
