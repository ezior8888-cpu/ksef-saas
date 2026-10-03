-- 00132_ksef_lifecycle_guard_tighten.sql
--
-- Cykl życia faktury wychodzącej w KSeF — PR 4a (zacieśnienie wyzwalaczy).
-- Projekt: docs/architecture/cykl-zycia-faktury-ksef.md
-- Plan:    docs/koordynacja/PR-CYKL-ZYCIA-FAKTURY.md (PR 4)
--
-- PO WDROŻENIU PR 3 (#205 kolejkowanie w transakcji RPC, #207 akcje klienta):
-- od tej pory żadna ścieżka webu nie pisze `ksef_status` z sesji klienta,
-- więc wyjątek „klient zmienia draft → queued” w 00119/00122 jest martwy
-- i zostaje usunięty (W2 z rewizji 03.10.2026). Stary kod webu z tym
-- wyzwalaczem dostałby 42501 przy kolejkowaniu — dlatego PO wdrożeniu.
--
-- Zmiany — wyłącznie CREATE OR REPLACE FUNCTION trzech funkcji wyzwalaczy;
-- same wyzwalacze, uprawnienia i dane bez zmian:
--   1. guard_invoice_pending_content (00119): rola kliencka nie zmienia
--      ksef_status NIGDY (dotąd wolno było draft → queued).
--   2. guard_invoice_delivery_history (00122): „historia dostawy”, która
--      zamraża treść prawną i blokuje DELETE, to stan failed/rejected albo pola
--      wysyłki na wierszu (znacznik wysyłki, numer KSeF, środowisko, akceptacja,
--      plik XML, Offline24). Diagnostyka — last_attempt_at, submission_attempts,
--      last_error* — przestaje zamrażać treść: to opis, nie dowód kontaktu.
--      Wpisy `ksef_submissions` są dla roli klienta niewidoczne (RLS), więc
--      dowód kontaktu po stronie serwisu sprawdzają RPC reset/release z 00131,
--      które jako jedyne zdejmują pola wysyłki z wiersza.
--      Klient nadal nie pisze diagnostyki ani nie zmienia stanu.
--   3. guard_historical_ksef_invoice_lines (00122): ta sama definicja
--      „historii” dla pozycji faktury.
--
-- Wycofanie: ponowne wykonanie definicji funkcji z 00119 i 00122 (bez zmian
-- danych). Brak DROP, UPDATE, DELETE.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. 00119: treść i stan dokumentu w drodze do KSeF
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_invoice_pending_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_locked boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('authenticated', 'anon') AND (
      NEW.ksef_status IS DISTINCT FROM 'draft'
      OR NEW.ksef_number IS NOT NULL
      OR NEW.ksef_environment IS NOT NULL
      OR NEW.ksef_accepted_at IS NOT NULL
      OR NEW.xml_storage_path IS NOT NULL
      OR NEW.offline_qr_offline IS NOT NULL
      OR NEW.offline_qr_certyfikat IS NOT NULL
      OR NEW.offline_idempotency_key IS NOT NULL
      OR NEW.submitted_to_ksef_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Client invoice must start as a draft without KSeF delivery evidence'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_locked := OLD.ksef_status IN ('queued', 'offline_queued', 'sending')
      OR OLD.offline_idempotency_key IS NOT NULL
      OR OLD.submitted_to_ksef_at IS NOT NULL
      OR (current_user IN ('authenticated', 'anon') AND OLD.ksef_status = 'accepted');
    IF v_locked THEN
      RAISE EXCEPTION 'KSeF document cannot be deleted by this role'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Incoming imports can be accepted without a local submission timestamp.
  -- Their trusted server-side enrichment remains possible; client edits do not.
  v_locked := OLD.ksef_status IN ('queued', 'offline_queued', 'sending')
    OR NEW.ksef_status IN ('queued', 'offline_queued', 'sending')
    OR OLD.offline_idempotency_key IS NOT NULL
    OR OLD.submitted_to_ksef_at IS NOT NULL
    OR (current_user IN ('authenticated', 'anon') AND
        (OLD.ksef_status = 'accepted' OR NEW.ksef_status = 'accepted'));
  IF v_locked AND ROW(
    NEW.tenant_id, NEW.direction, NEW.internal_number,
    NEW.invoice_type, NEW.invoice_kind, NEW.origin,
    NEW.issue_date, NEW.sale_date, NEW.seller_nip, NEW.buyer_nip,
    NEW.seller_data, NEW.buyer_data, NEW.payment_data,
    NEW.payment_due_date, NEW.currency, NEW.notes,
    NEW.net_total, NEW.vat_total, NEW.gross_total, NEW.fa3_data,
    NEW.is_b2c, NEW.buyer_id_type, NEW.buyer_pesel,
    NEW.buyer_id_number, NEW.parent_invoice_id,
    NEW.correction_reason, NEW.correction_type, NEW.advance_amount,
    NEW.advance_invoice_ids
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.direction, OLD.internal_number,
    OLD.invoice_type, OLD.invoice_kind, OLD.origin,
    OLD.issue_date, OLD.sale_date, OLD.seller_nip, OLD.buyer_nip,
    OLD.seller_data, OLD.buyer_data, OLD.payment_data,
    OLD.payment_due_date, OLD.currency, OLD.notes,
    OLD.net_total, OLD.vat_total, OLD.gross_total, OLD.fa3_data,
    OLD.is_b2c, OLD.buyer_id_type, OLD.buyer_pesel,
    OLD.buyer_id_number, OLD.parent_invoice_id,
    OLD.correction_reason, OLD.correction_type, OLD.advance_amount,
    OLD.advance_invoice_ids
  ) THEN
    RAISE EXCEPTION 'KSeF document content is immutable for this role'
      USING ERRCODE = '42501';
  END IF;

  -- 00132: stan dostawy zmienia wyłącznie serwer (RPC z 00131 i worker).
  -- Dawny wyjątek „klient: draft → queued” usunięty — kolejkowanie robi
  -- enqueue_ksef_send w transakcji ze zleceniem pg-boss.
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.ksef_status IS DISTINCT FROM OLD.ksef_status
    OR NEW.ksef_number IS DISTINCT FROM OLD.ksef_number
    OR NEW.ksef_environment IS DISTINCT FROM OLD.ksef_environment
    OR NEW.ksef_accepted_at IS DISTINCT FROM OLD.ksef_accepted_at
    OR NEW.xml_storage_path IS DISTINCT FROM OLD.xml_storage_path
    OR NEW.offline_qr_offline IS DISTINCT FROM OLD.offline_qr_offline
    OR NEW.offline_qr_certyfikat IS DISTINCT FROM OLD.offline_qr_certyfikat
    OR NEW.offline_idempotency_key IS DISTINCT FROM OLD.offline_idempotency_key
    OR NEW.submitted_to_ksef_at IS DISTINCT FROM OLD.submitted_to_ksef_at
  ) THEN
    RAISE EXCEPTION 'KSeF delivery state is server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_pending_content()
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2. 00122: historia dostawy zamraża treść prawną i blokuje DELETE
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_invoice_delivery_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_historical boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.last_attempt_at IS NOT NULL
       OR COALESCE(NEW.submission_attempts, 0) <> 0
       OR NEW.last_error IS NOT NULL
       OR NEW.last_error_code IS NOT NULL
       OR NEW.last_error_field IS NOT NULL
       OR NEW.last_error_suggestion IS NOT NULL THEN
      RAISE EXCEPTION 'Client cannot create KSeF delivery history'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- 00132: historia = stan failed/rejected albo pola wysyłki na wierszu.
  -- Diagnostyka (last_attempt_at, submission_attempts, last_error*) opisuje
  -- próby, nie dowodzi kontaktu — po reset_ksef_send (00131) szkic jest
  -- edytowalny, bo reset zdejmuje pola wysyłki tylko wtedy, gdy dowodu nie ma.
  v_historical := OLD.ksef_status IN ('failed', 'rejected')
    OR OLD.offline_idempotency_key IS NOT NULL
    OR OLD.submitted_to_ksef_at IS NOT NULL
    OR OLD.ksef_number IS NOT NULL
    OR OLD.ksef_environment IS NOT NULL
    OR OLD.ksef_accepted_at IS NOT NULL
    OR OLD.xml_storage_path IS NOT NULL
    OR OLD.offline_qr_offline IS NOT NULL
    OR OLD.offline_qr_certyfikat IS NOT NULL;

  IF TG_OP = 'DELETE' THEN
    IF OLD.ksef_status IS DISTINCT FROM 'draft' OR v_historical THEN
      RAISE EXCEPTION 'KSeF invoice with delivery history cannot be deleted by client'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF v_historical AND ROW(
    NEW.tenant_id, NEW.direction, NEW.internal_number,
    NEW.invoice_type, NEW.invoice_kind, NEW.origin,
    NEW.issue_date, NEW.sale_date, NEW.seller_nip, NEW.buyer_nip,
    NEW.seller_data, NEW.buyer_data, NEW.payment_data,
    NEW.payment_due_date, NEW.currency, NEW.notes,
    NEW.net_total, NEW.vat_total, NEW.gross_total, NEW.fa3_data,
    NEW.is_b2c, NEW.buyer_id_type, NEW.buyer_pesel,
    NEW.buyer_id_number, NEW.parent_invoice_id,
    NEW.correction_reason, NEW.correction_type, NEW.advance_amount,
    NEW.advance_invoice_ids
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.direction, OLD.internal_number,
    OLD.invoice_type, OLD.invoice_kind, OLD.origin,
    OLD.issue_date, OLD.sale_date, OLD.seller_nip, OLD.buyer_nip,
    OLD.seller_data, OLD.buyer_data, OLD.payment_data,
    OLD.payment_due_date, OLD.currency, OLD.notes,
    OLD.net_total, OLD.vat_total, OLD.gross_total, OLD.fa3_data,
    OLD.is_b2c, OLD.buyer_id_type, OLD.buyer_pesel,
    OLD.buyer_id_number, OLD.parent_invoice_id,
    OLD.correction_reason, OLD.correction_type, OLD.advance_amount,
    OLD.advance_invoice_ids
  ) THEN
    RAISE EXCEPTION 'KSeF legal content with delivery history is immutable'
      USING ERRCODE = '42501';
  END IF;

  -- 00132: żadne przejście stanu z sesji klienta (dawny wyjątek draft → queued usunięty).
  IF NEW.ksef_status IS DISTINCT FROM OLD.ksef_status THEN
    RAISE EXCEPTION 'KSeF delivery transition is server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF ROW(
    NEW.last_attempt_at, NEW.submission_attempts, NEW.last_error,
    NEW.last_error_code, NEW.last_error_field, NEW.last_error_suggestion
  ) IS DISTINCT FROM ROW(
    OLD.last_attempt_at, OLD.submission_attempts, OLD.last_error,
    OLD.last_error_code, OLD.last_error_field, OLD.last_error_suggestion
  ) THEN
    RAISE EXCEPTION 'KSeF delivery diagnostics are server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_delivery_history()
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 3. 00122: pozycje faktury z historią dostawy
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_historical_ksef_invoice_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_old_id uuid;
  v_new_id uuid;
  v_parent record;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Accounting-only update exception from 00088: columns outside the legal
  -- FA(3) content may be edited after a failure.
  IF TG_OP = 'UPDATE' AND ROW(
    NEW.id, NEW.invoice_id, NEW.ordinal, NEW.name, NEW.quantity,
    NEW.unit, NEW.unit_price_net, NEW.vat_rate,
    NEW.net_amount, NEW.vat_amount, NEW.gross_amount
  ) IS NOT DISTINCT FROM ROW(
    OLD.id, OLD.invoice_id, OLD.ordinal, OLD.name, OLD.quantity,
    OLD.unit, OLD.unit_price_net, OLD.vat_rate,
    OLD.net_amount, OLD.vat_amount, OLD.gross_amount
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old_id := OLD.invoice_id; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new_id := NEW.invoice_id; END IF;
  FOR v_parent IN
    SELECT i.ksef_status, i.offline_idempotency_key,
           i.submitted_to_ksef_at, i.ksef_number, i.ksef_environment,
           i.ksef_accepted_at, i.xml_storage_path,
           i.offline_qr_offline, i.offline_qr_certyfikat
      FROM public.invoices i
     WHERE i.id IN (v_old_id, v_new_id)
     ORDER BY i.id
     FOR SHARE
  LOOP
    -- 00132: ta sama definicja historii co w guard_invoice_delivery_history.
    IF v_parent.ksef_status IN ('failed', 'rejected')
       OR v_parent.offline_idempotency_key IS NOT NULL
       OR v_parent.submitted_to_ksef_at IS NOT NULL
       OR v_parent.ksef_number IS NOT NULL
       OR v_parent.ksef_environment IS NOT NULL
       OR v_parent.ksef_accepted_at IS NOT NULL
       OR v_parent.xml_storage_path IS NOT NULL
       OR v_parent.offline_qr_offline IS NOT NULL
       OR v_parent.offline_qr_certyfikat IS NOT NULL THEN
      RAISE EXCEPTION 'KSeF invoice lines with delivery history are immutable'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_historical_ksef_invoice_lines()
  FROM PUBLIC, anon, authenticated;

COMMIT;
