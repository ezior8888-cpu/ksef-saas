-- 00113_user_deletion_foreign_keys.sql
--
-- AUD-41: usunięcie konta (art. 17 RODO) padało na kluczach obcych bez
-- ON DELETE. Kto dodał wydatek, uruchomił OCR albo udostępnił dane
-- księgowej, tego konta nie dało się usunąć — a anonimizacja dziennika
-- audytu wykonywała się wcześniej i jest nieodwracalna.
--
-- 1. Wydatki, zadania OCR i dostępy księgowych należą do firmy i zostają
--    (retencja dokumentów księgowych). Po usunięciu konta autor = NULL.
--    Zmiana akcji klucza obcego wymaga zdjęcia i założenia ograniczenia —
--    dane zostają bez zmian. Produkcja 02.10.2026: 0 wierszy w każdej
--    z trzech tabel.
-- 2. gdpr_user_deletion_blockers(uuid) — lista „tabela.kolumna”, w których
--    klucz obcy bez ON DELETE dalej wskazuje użytkownika (np. celowo
--    nienaruszalne przeglądy spraw finansowych Stripe). Wołana PRZED
--    anonimizacją: niepusta lista = odmowa, konto i dziennik nietknięte.
-- 3. AUD-81: surowe payloady odbić poczty — webhook zapisuje już NULL,
--    tu czyścimy stare. Produkcja 02.10.2026: 0 wierszy.

-- 1. Autor wydatku, zadania OCR i dostępu księgowej: NULL po usunięciu konta.
ALTER TABLE public.expenses ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.expenses DROP CONSTRAINT expenses_created_by_fkey;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ocr_jobs ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.ocr_jobs DROP CONSTRAINT ocr_jobs_created_by_fkey;
ALTER TABLE public.ocr_jobs ADD CONSTRAINT ocr_jobs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.accountant_access DROP CONSTRAINT accountant_access_created_by_user_id_fkey;
ALTER TABLE public.accountant_access ADD CONSTRAINT accountant_access_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Sprawdzenie przed anonimizacją: co jeszcze zatrzyma usunięcie konta.
--    Klucze obce do auth.users i public.users (ten drugi znika kaskadą
--    z auth.users) z akcją NO ACTION / RESTRICT, poza schematem auth
--    (GoTrue sprząta swoje tabele sam).
CREATE OR REPLACE FUNCTION public.gdpr_user_deletion_blockers(p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  r record;
  v_found boolean;
  v_out text[] := '{}';
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid IN ('auth.users'::regclass, 'public.users'::regclass)
      AND c.confdeltype IN ('a', 'r')
      AND pg_catalog.array_length(c.conkey, 1) = 1
      AND n.nspname <> 'auth'
    ORDER BY 1, 2
  LOOP
    EXECUTE pg_catalog.format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', r.tbl, r.col)
      INTO v_found
      USING p_user_id;
    IF v_found THEN
      v_out := v_out || (r.tbl::text || '.' || r.col::text);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gdpr_user_deletion_blockers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_user_deletion_blockers(uuid) TO service_role;

COMMENT ON FUNCTION public.gdpr_user_deletion_blockers(uuid) IS
  'Tabele z kluczem obcym bez ON DELETE, które wskazują użytkownika — sprawdzane przed anonimizacją (AUD-41, 00113).';

-- 3. AUD-81: stare surowe payloady odbić poczty.
UPDATE public.email_bounces SET raw_payload = NULL WHERE raw_payload IS NOT NULL;
