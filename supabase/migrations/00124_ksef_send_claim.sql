-- 00124_ksef_send_claim.sql
--
-- AUD-10 (część 2 przeniesienia #71, C-20): atomowe przejęcie wysyłki faktury
-- do KSeF z dzierżawą. Dotąd krok „mark-as-sending” ustawiał `sending` bez
-- wyłączności — dwa joby tej samej faktury mogły wysyłać naraz.
--
-- Zasada (decyzja Bartosza z 02.10.2026: przy awarii KSeF job ponawia):
--   * przejęcie wygrywa, gdy faktura nie jest przyjęta i: nikt jej nie
--     przejął, ALBO przejął ją ten sam właściciel (ponowienie tego samego
--     zdarzenia), ALBO dzierżawa poprzedniego właściciela wygasła;
--   * znacznik przejęcia = `submitted_to_ksef_at` z tego samego UPDATE —
--     wynik zapisuje tylko próba, która go trzyma (CAS w kodzie);
--   * ponowienie najpierw uzgadnia poprzednią próbę po numerze referencyjnym
--     (C-18, `reconcile-previous-submission`), więc nie wysyła drugi raz.
--
-- Nowa kolumna nullable bez wartości domyślnej, nowa funkcja i wyzwalacz —
-- bez zmian danych. Bezpieczna przed wdrożeniem kodu.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ksef_send_owner text;

COMMENT ON COLUMN public.invoices.ksef_send_owner IS
  'Identyfikator próby wysyłki (sendAttemptId zdarzenia), która trzyma przejęcie wysyłki do KSeF — AUD-10, 00124.';

-- Klient nie ustawia ani nie zmienia właściciela przejęcia (tylko serwer).
CREATE OR REPLACE FUNCTION public.guard_invoice_send_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    (TG_OP = 'INSERT' AND NEW.ksef_send_owner IS NOT NULL) OR
    (TG_OP = 'UPDATE' AND NEW.ksef_send_owner IS DISTINCT FROM OLD.ksef_send_owner)
  ) THEN
    RAISE EXCEPTION 'KSeF send claim is server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invoice_send_owner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a_guard_invoice_send_owner ON public.invoices;
CREATE TRIGGER a_guard_invoice_send_owner
  BEFORE INSERT OR UPDATE OF ksef_send_owner ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_send_owner();

-- Zwraca znacznik przejęcia albo NULL, gdy wysyłkę trzyma inna próba
-- (albo faktura jest przyjęta / nie istnieje w tej firmie).
CREATE OR REPLACE FUNCTION public.claim_ksef_send(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_owner text,
  p_lease_seconds integer
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_claimed timestamptz;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 60 THEN
    RAISE EXCEPTION 'KSeF send lease must be at least 60 seconds'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.invoices
     SET ksef_status = 'sending',
         submitted_to_ksef_at = v_now,
         last_attempt_at = v_now,
         ksef_send_owner = p_owner
   WHERE id = p_invoice_id
     AND tenant_id = p_tenant_id
     AND direction = 'outgoing'
     AND ksef_status IS DISTINCT FROM 'accepted'
     AND (
       submitted_to_ksef_at IS NULL
       OR (p_owner IS NOT NULL AND ksef_send_owner = p_owner)
       OR submitted_to_ksef_at < v_now - pg_catalog.make_interval(secs => p_lease_seconds)
     )
  RETURNING submitted_to_ksef_at INTO v_claimed;

  RETURN v_claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ksef_send(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ksef_send(uuid, uuid, text, integer) TO service_role;

COMMENT ON FUNCTION public.claim_ksef_send(uuid, uuid, text, integer) IS
  'Atomowe przejęcie wysyłki faktury do KSeF z dzierżawą (AUD-10, 00124): wolna, ten sam właściciel albo wygasła dzierżawa.';
