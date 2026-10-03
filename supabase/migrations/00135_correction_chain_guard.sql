-- 00135_correction_chain_guard.sql
--
-- K4, łańcuch korekt (docs/automation/13_REWIZJA_2026-10-03.md, K4): od tej
-- zmiany kolejna korekta liczy „stan przed” od stanu PO poprzednich
-- przyjętych korektach (akcje: `correctionBaseline`), więc przyjęta korekta
-- nie blokuje już następnej. Blokada z 00133 zostaje tylko dla korekty
-- W TOKU (szkic, kolejka, wysyłka, offline, błąd): dwie równoległe korekty
-- liczyłyby różnicę od tego samego stanu. Odrzucona przez KSeF nie liczy się.
--
-- CREATE OR REPLACE funkcji wyzwalacza z 00133; wyzwalacz, uprawnienia i dane
-- bez zmian. Bezpieczna PRZED wdrożeniem kodu (stary kod i tak odmawia przy
-- przyjętej korekcie po swojej stronie). Wycofanie: definicja z 00133.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_single_open_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_conflict_number text;
  v_conflict_status text;
BEGIN
  IF NEW.invoice_kind IS DISTINCT FROM 'correction'
     OR NEW.parent_invoice_id IS NULL
     OR NEW.ksef_status IN ('rejected', 'accepted') THEN
    RETURN NEW;
  END IF;

  -- Tylko zmiany, które mogą otworzyć drugą korektę w toku.
  IF TG_OP = 'UPDATE'
     AND OLD.invoice_kind IS NOT DISTINCT FROM NEW.invoice_kind
     AND OLD.parent_invoice_id IS NOT DISTINCT FROM NEW.parent_invoice_id
     AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
     AND OLD.ksef_status NOT IN ('rejected', 'accepted') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('single-open-correction:' || NEW.parent_invoice_id::text, 0)
  );

  SELECT i.internal_number, i.ksef_status
    INTO v_conflict_number, v_conflict_status
    FROM public.invoices i
   WHERE i.tenant_id = NEW.tenant_id
     AND i.parent_invoice_id = NEW.parent_invoice_id
     AND i.invoice_kind = 'correction'
     AND i.id <> NEW.id
     AND (i.ksef_status IS NULL OR i.ksef_status NOT IN ('accepted', 'rejected'))
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Faktura pierwotna ma korektę w toku: % (%). Dokończ ją albo wróć nią do szkicu i usuń, zanim wystawisz kolejną.',
      COALESCE(v_conflict_number, '?'), COALESCE(v_conflict_status, '?')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_single_open_correction() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.guard_single_open_correction() IS
  'K4 (00133/00135): faktura pierwotna ma najwyżej jedną korektę W TOKU; przyjęte korekty tworzą łańcuch (stan przed = stan po ostatniej), odrzucone nie liczą się.';

COMMIT;
