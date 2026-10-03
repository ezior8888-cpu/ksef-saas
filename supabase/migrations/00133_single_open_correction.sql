-- 00133_single_open_correction.sql
--
-- K4 z rewizji 03.10.2026: druga korekta tej samej faktury liczyła różnicę od
-- stanu PIERWOTNEGO, nie po poprzedniej korekcie (FV 10×100; KOR1 10→8 daje
-- −246; KOR2 „8→7” wysyłała −369 zamiast −123 — łącznie −615 zamiast −369).
-- Formularz pokazywał każdą przyjętą fakturę jako rodzica, akcja brała
-- „stan przed” z pozycji pierwotnej, a 00118 nie ograniczało liczby korekt.
-- Na KSeF TEST wychodziło; na PROD chronił tylko hamulec KOR_HOLD.
--
-- Zasada (do czasu łańcucha korekt, który liczy „stan przed” po ostatniej
-- przyjętej KOR): faktura pierwotna ma najwyżej JEDNĄ korektę poza odrzuconą
-- przez KSeF (`rejected`). Szkic, `queued`, `sending`, `failed` i `accepted`
-- blokują kolejną, bo mogą trafić (albo trafiły) do KSeF. Odrzucona nie
-- blokuje — dokument nie został wystawiony.
--
-- Wyzwalacz sprawdza tylko zmiany, które mogą stworzyć drugą otwartą korektę:
-- nowa korekta, zmiana rodzica / rodzaju / firmy oraz powrót z `rejected`
-- (np. reset do szkicu). Przejścia statusu workera go nie dotyczą. Zapisy
-- korekt jednego rodzica są serializowane blokadą doradczą transakcji.
--
-- SECURITY INVOKER jak 00125: klient widzi przez RLS tylko swoją firmę;
-- serwis — wszystkie, ale filtr i tak jest po `tenant_id` wiersza. Dotyczy
-- także roli serwisowej (worker, RPC), bo błąd jest w danych, nie w roli.
--
-- Nowa funkcja i wyzwalacz, bez zmian danych. Bezpieczna PRZED wdrożeniem
-- kodu: stary kod przy drugiej korekcie dostaje czytelny wyjątek zamiast
-- zapisać błędny dokument. Wycofanie: DROP TRIGGER + DROP FUNCTION.

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
     OR NEW.ksef_status = 'rejected' THEN
    RETURN NEW;
  END IF;

  -- Tylko zmiany, które mogą otworzyć drugą korektę.
  IF TG_OP = 'UPDATE'
     AND OLD.invoice_kind IS NOT DISTINCT FROM NEW.invoice_kind
     AND OLD.parent_invoice_id IS NOT DISTINCT FROM NEW.parent_invoice_id
     AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
     AND OLD.ksef_status IS DISTINCT FROM 'rejected' THEN
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
     AND i.ksef_status IS DISTINCT FROM 'rejected'
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Faktura pierwotna ma już korektę % (%). Kolejna korekta tej samej faktury wymaga łańcucha korekt — zgłoś się do operatora.',
      COALESCE(v_conflict_number, '?'), COALESCE(v_conflict_status, '?')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_single_open_correction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_single_open_correction ON public.invoices;
CREATE TRIGGER guard_single_open_correction
  BEFORE INSERT OR UPDATE OF parent_invoice_id, invoice_kind, tenant_id, ksef_status
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_single_open_correction();

COMMENT ON FUNCTION public.guard_single_open_correction() IS
  'K4 (00133): faktura pierwotna ma najwyżej jedną korektę poza odrzuconą przez KSeF — do czasu łańcucha korekt liczącego stan przed po ostatniej KOR.';

COMMIT;
