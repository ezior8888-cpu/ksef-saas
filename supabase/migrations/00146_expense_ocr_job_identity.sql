-- 00146_expense_ocr_job_identity.sql
--
-- B4 (#109, kod w #192): najwyżej jeden wydatek na jedno zadanie OCR w firmie.
-- Wzór: 00121 (to samo dla ksef_invoice_id). Kolumna expenses.ocr_job_id
-- (00034) to UUID bez indeksu i bez klucza obcego. Sprawdzenie w jobie
-- (process-ocr.ts, krok create-expense) obsługuje ponowienia po kolei, ale nie
-- dwa RÓWNOCZESNE przebiegi tego samego zadania (wygaśnięcie / utrata
-- heartbeatu w pg-boss) — te rozstrzyga dopiero indeks. Kod z #192 (na main
-- od 06.10.2026) przy przegranym wyścigu (23505) odczytuje wydatek zwycięzcy
-- i kończy job bez drugiego płatnego OCR.
--
-- Numer: kolejny wolny wg rejestru (reguła z 05.10.2026); #192 proponował
-- 00129/00130 — oba zajęte rezerwacjami szkiców.
--
-- WGRANIE: PRZED wdrożeniem (addytywna: sam indeks, bez zmian danych
-- i uprawnień). Kod z #192 jest już wdrożony — działa z indeksem i bez niego.
--
-- PRZED: liczenie dubli (tylko odczyt) musi dać 0 — inaczej preflight przerwie
-- migrację. Na produkcji 06.10.2026: 0 wierszy w expenses, 0 dubli. Duble
-- rozstrzygają Bartosz i księgowa (mogły trafić do eksportu KPiR / JPK_V7M),
-- nie ta migracja. Żaden wiersz nie jest zmieniany. Złożony FK
-- (tenant_id, ocr_job_id) → ocr_jobs świadomie pominięty: ocr_jobs nie ma
-- UNIQUE (tenant_id, id), a upload kasuje zadanie przy błędzie wysyłki
-- (app/actions/expenses.ts) — osobna decyzja.
--
-- BLOKADA: SHARE na public.expenses do końca transakcji — odczyty działają,
-- zapisy wydatków czekają na zbudowanie indeksu. lock_timeout 5 s: przy
-- zajętej tabeli migracja pada (55P03) zamiast ustawiać za sobą kolejkę —
-- powtórzyć później. Bez CONCURRENTLY (nie działa w transakcji). Ostrzeżenia
-- psql o transakcji przy --single-transaction są oczekiwane, jak przy 00121.
--
-- PO: schema_migrations ('00146','expense_ocr_job_identity'), NOTIFY pgrst,
-- weryfikacja:
--   SELECT indisunique, indisvalid, pg_get_indexdef(indexrelid)
--     FROM pg_index
--    WHERE indexrelid = 'public.uq_expenses_tenant_ocr_job'::regclass;
-- types/database.ts bez zmian (indeks nie zmienia typów).
--
-- Wycofanie (bez utraty danych, za zgodą Bartosza):
--   DROP INDEX public.uq_expenses_tenant_ocr_job;
BEGIN;

SET LOCAL lock_timeout = '5s';

LOCK TABLE public.expenses IN SHARE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT tenant_id, ocr_job_id
      FROM public.expenses
      WHERE ocr_job_id IS NOT NULL
      GROUP BY tenant_id, ocr_job_id
      HAVING count(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate OCR-job expenses require manual reconciliation before the OCR-job unique index';
  END IF;
END;
$$;

CREATE UNIQUE INDEX uq_expenses_tenant_ocr_job
  ON public.expenses (tenant_id, ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

COMMENT ON INDEX public.uq_expenses_tenant_ocr_job IS
  'At most one expense per OCR job within a tenant (B4).';

COMMIT;
