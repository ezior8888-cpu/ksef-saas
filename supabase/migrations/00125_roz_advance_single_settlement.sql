-- 00125_roz_advance_single_settlement.sql
--
-- AUD-67 (partia 15 audytu): ta sama faktura zaliczkowa nie może być
-- rozliczona w dwóch fakturach ROZ tej samej firmy. Dotąd formularz ROZ
-- pokazywał każdą przyjętą zaliczkę, a akcja nie sprawdzała, czy inna ROZ
-- już ją wskazuje — druga ROZ odejmowała tę samą zaliczkę drugi raz.
--
-- Zasada:
--   * zaliczkę trzyma każda ROZ poza odrzuconą przez KSeF (`rejected`) —
--     także szkic i `failed`, bo mogą jeszcze trafić do KSeF;
--   * jedna ROZ nie wskazuje tej samej zaliczki dwa razy;
--   * zapisy ROZ jednej firmy są serializowane blokadą doradczą transakcji,
--     więc dwa równoległe zapisy nie przejdą obok siebie.
--
-- Wyzwalacz sprawdza tylko zmiany, które mogą stworzyć dublet: nowa ROZ,
-- zmiana listy zaliczek / rodzaju / firmy oraz powrót z `rejected`. Zwykłe
-- przejścia statusu istniejących wierszy (job wysyłki) go nie dotyczą.
--
-- Funkcja działa jako wywołujący: klient widzi przez RLS tylko faktury swojej
-- firmy (`get_current_tenant_id()`), a serwis — wszystkie, ale filtr i tak
-- jest po `tenant_id` wiersza.
--
-- Nowa funkcja i wyzwalacz, bez zmian danych. Bezpieczna przed wdrożeniem kodu.

CREATE OR REPLACE FUNCTION public.guard_roz_advance_single_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_conflict text;
BEGIN
  IF NEW.invoice_kind IS DISTINCT FROM 'final'
     OR NEW.ksef_status = 'rejected'
     OR COALESCE(pg_catalog.cardinality(NEW.advance_invoice_ids), 0) = 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.advance_invoice_ids IS NOT DISTINCT FROM OLD.advance_invoice_ids
     AND NEW.invoice_kind IS NOT DISTINCT FROM OLD.invoice_kind
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND OLD.ksef_status IS DISTINCT FROM 'rejected' THEN
    RETURN NEW;
  END IF;

  IF pg_catalog.cardinality(NEW.advance_invoice_ids) <> (
    SELECT pg_catalog.count(DISTINCT a) FROM pg_catalog.unnest(NEW.advance_invoice_ids) AS a
  ) THEN
    RAISE EXCEPTION 'Final invoice lists the same advance invoice twice'
      USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('roz-advance-settlement:' || NEW.tenant_id::text, 0)
  );

  SELECT i.internal_number INTO v_conflict
    FROM public.invoices i
   WHERE i.tenant_id = NEW.tenant_id
     AND i.id <> NEW.id
     AND i.invoice_kind = 'final'
     AND i.ksef_status IS DISTINCT FROM 'rejected'
     AND i.advance_invoice_ids && NEW.advance_invoice_ids
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Advance invoice is already settled by final invoice %', v_conflict
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_roz_advance_single_settlement() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_roz_advance_single_settlement ON public.invoices;
CREATE TRIGGER guard_roz_advance_single_settlement
  BEFORE INSERT OR UPDATE OF advance_invoice_ids, invoice_kind, tenant_id, ksef_status
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_roz_advance_single_settlement();

COMMENT ON FUNCTION public.guard_roz_advance_single_settlement() IS
  'Zaliczka rozliczona najwyżej jedną ROZ firmy (poza odrzuconą przez KSeF) — AUD-67, 00125.';
