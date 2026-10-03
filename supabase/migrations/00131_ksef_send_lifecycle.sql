-- 00131_ksef_send_lifecycle.sql
--
-- Cykl życia faktury wychodzącej w KSeF — PR 1 (baza).
-- Projekt: docs/architecture/cykl-zycia-faktury-ksef.md
-- Plan:    docs/koordynacja/PR-CYKL-ZYCIA-FAKTURY.md
-- Powód:   rewizja 03.10.2026 (K3, W2, W3, W16, S1): każda nieudana wysyłka
--          zostawała zamrożona bez wyjścia, klient zapisywał `queued` z sesji,
--          a „dowodem kontaktu z KSeF” były różne pola w różnych warstwach.
--
-- PRZED wdrożeniem kodu (addytywna): nowe funkcje, nowa tabela referencyjna,
-- bez zmian w istniejących wyzwalaczach i bez UPDATE danych. Stary kod działa
-- z nią bez zmian. Zacieśnienie wyzwalaczy 00119/00122 przyjdzie w 00132
-- (PO wdrożeniu PR 3), gdy klient przestanie pisać `queued` z sesji.
--
-- Numeracja: 00129 zajęte przez szkic Codexa (codex/security-xml-evidence-
-- integrity), 00130 przez gałąź claude/roz-warunki — stąd 00131.
--
-- Definicja DOWODU KONTAKTU (jedna dla wyzwalaczy, RPC i strażnika):
--   faktura ma dowód kontaktu z KSeF, gdy ma numer KSeF albo wiersz
--   `ksef_submissions` o statusie sent / accepted / duplicate. Wiersz
--   `rejected` dowodem nie jest (KSeF odrzucił treść, dokument nie został
--   wystawiony). Faktura z dowodem nigdy nie wraca do `draft`.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Katalog kodów błędu `invoices.last_error_code`
-- ─────────────────────────────────────────────────────────────────
-- Klasa decyduje o dozwolonych wyjściach: terminal (treść — tylko powrót do
-- szkicu), transient (ponowienie automatyczne), hold (ponowienie po zdjęciu
-- hamulca), reconcile (tylko operator), setup (klient uzupełnia konfigurację).
-- Bez klucza obcego z `invoices`: historyczne wiersze mają dowolne teksty,
-- strażnik I4 zgłasza kody spoza katalogu.
CREATE TABLE IF NOT EXISTS public.ksef_error_codes (
  code text PRIMARY KEY,
  class text NOT NULL CHECK (class IN ('terminal', 'transient', 'hold', 'reconcile', 'setup')),
  auto_requeue boolean NOT NULL DEFAULT false,
  client_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ksef_error_codes IS
  'Katalog kodów invoices.last_error_code (cykl życia faktury, 00131): klasa błędu, czy cron ponawia automatycznie, komunikat dla klienta.';

ALTER TABLE public.ksef_error_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ksef_error_codes_read ON public.ksef_error_codes;
CREATE POLICY ksef_error_codes_read ON public.ksef_error_codes
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.ksef_error_codes FROM PUBLIC, anon;
GRANT SELECT ON public.ksef_error_codes TO authenticated;
GRANT SELECT ON public.ksef_error_codes TO service_role;

INSERT INTO public.ksef_error_codes (code, class, auto_requeue, client_message) VALUES
  ('XSD_INVALID',             'terminal',  false, 'Faktura nie przeszła walidacji schematu FA(3). Wróć do szkicu, popraw dane i wyślij ponownie.'),
  ('KSEF_REJECTED',           'terminal',  false, 'KSeF odrzucił fakturę. Wróć do szkicu, popraw dane i wyślij ponownie.'),
  ('INVALID_DOCUMENT',        'terminal',  false, 'Dokument wymaga poprawy (dane lub odwołania do innych faktur). Wróć do szkicu i popraw.'),
  ('KSEF_UNAVAILABLE',        'transient', true,  'KSeF nie odpowiada. Ponowimy wysyłkę automatycznie.'),
  ('KSEF_RATE_LIMIT',         'transient', true,  'KSeF ogranicza liczbę zapytań. Ponowimy wysyłkę automatycznie.'),
  ('KSEF_SESSION',            'transient', true,  'Sesja KSeF wygasła. Ponowimy wysyłkę automatycznie.'),
  ('INFRA',                   'transient', true,  'Chwilowy błąd po naszej stronie. Ponowimy wysyłkę automatycznie.'),
  ('CREDENTIALS_UNAVAILABLE', 'transient', false, 'Wysyłka wstrzymana po naszej stronie. Pracujemy nad tym.'),
  ('TRANSIENT_EXHAUSTED',     'transient', false, 'Wysyłka nie powiodła się przez dobę. Zajmujemy się tym.'),
  ('KSEF_PAUSED',             'hold',      false, 'Wysyłka wstrzymana przez operatora. Faktura wyjdzie automatycznie po przywróceniu.'),
  ('KOR_HOLD',                'hold',      false, 'Wysyłka faktur korygujących jest tymczasowo wstrzymana. Korekta wyjdzie automatycznie po przywróceniu.'),
  ('ROZ_HOLD_RECONCILE',      'hold',      false, 'Wysyłka faktur rozliczających jest tymczasowo wstrzymana. Dokument wyjdzie automatycznie po przywróceniu.'),
  ('KSEF_DUPLICATE_RECONCILE','reconcile', false, 'Faktura wymaga uzgodnienia z KSeF. Zajmujemy się tym i damy znać.'),
  ('RESULT_UNCERTAIN',        'reconcile', false, 'Czekamy na potwierdzenie z KSeF. Nie wystawiaj tej faktury ponownie.'),
  ('ENV_MISMATCH',            'reconcile', false, 'Faktura wymaga uzgodnienia środowiska KSeF. Zajmujemy się tym.'),
  ('INVALID_EVENT',           'reconcile', false, 'Zlecenie wysyłki wymaga uzgodnienia. Zajmujemy się tym.'),
  ('ENQUEUE_LOST',            'reconcile', false, 'Zlecenie wysyłki nie dotarło do kolejki. Zajmujemy się tym.'),
  ('NO_CERTIFICATE',          'setup',     false, 'Najpierw wgraj certyfikat KSeF w Ustawieniach → KSeF.'),
  ('NOT_VERIFIED',            'setup',     false, 'Najpierw zweryfikuj certyfikat KSeF w Ustawieniach → KSeF.')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2. Dowód kontaktu z KSeF
-- ─────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: klient widzi przez RLS tylko własne faktury i próby,
-- więc interfejs może pytać, czy pokazać przycisk „wróć do szkicu”.
CREATE OR REPLACE FUNCTION public.ksef_has_contact_evidence(
  p_invoice_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE i.id = p_invoice_id
       AND i.tenant_id = p_tenant_id
       AND i.ksef_number IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.ksef_submissions s
     WHERE s.invoice_id = p_invoice_id
       AND s.tenant_id = p_tenant_id
       AND s.status IN ('sent', 'accepted', 'duplicate')
  );
$$;
REVOKE ALL ON FUNCTION public.ksef_has_contact_evidence(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ksef_has_contact_evidence(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.ksef_has_contact_evidence(uuid, uuid) IS
  'Czy KSeF mógł dostać tę fakturę: numer KSeF albo wpis ksef_submissions sent/accepted/duplicate. Faktura z dowodem nigdy nie wraca do szkicu (00131).';

-- Klasa kodu błędu; NULL dla kodu spoza katalogu (historyczne wiersze).
CREATE OR REPLACE FUNCTION public.ksef_error_class(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.class FROM public.ksef_error_codes c WHERE c.code = p_code;
$$;
REVOKE ALL ON FUNCTION public.ksef_error_class(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ksef_error_class(text) TO authenticated, service_role;

-- Wpis audytu wspólny dla RPC niżej (SECURITY INVOKER — woła go service_role).
CREATE OR REPLACE FUNCTION public.ksef_send_audit(
  p_tenant_id uuid,
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, details_json)
  VALUES (p_tenant_id, p_actor_user_id, p_action, 'invoice', p_invoice_id, p_details);
END;
$$;
REVOKE ALL ON FUNCTION public.ksef_send_audit(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ksef_send_audit(uuid, uuid, uuid, text, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 3. draft → queued (serwer, w transakcji ze zleceniem pg-boss — PR 3)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_ksef_send(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_attempt_id text
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row public.invoices;
BEGIN
  IF current_user <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF enqueue is server-managed' USING ERRCODE = '42501';
  END IF;
  IF p_attempt_id IS NULL OR length(p_attempt_id) = 0 THEN
    RAISE EXCEPTION 'KSeF enqueue requires an attempt id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.invoices
     SET ksef_status = 'queued',
         ksef_send_owner = NULL
   WHERE id = p_invoice_id
     AND tenant_id = p_tenant_id
     AND direction = 'outgoing'
     AND ksef_status = 'draft'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktura nie jest szkicem albo nie należy do tej firmy'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.ksef_send_audit(p_tenant_id, p_invoice_id, NULL, 'invoice.send_enqueued',
    jsonb_build_object('attempt_id', p_attempt_id));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_ksef_send(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ksef_send(uuid, uuid, text) TO service_role;
COMMENT ON FUNCTION public.enqueue_ksef_send(uuid, uuid, text) IS
  'draft → queued po stronie serwera (00131). Wołana w jednej transakcji ze zleceniem pg-boss; klient nigdy nie zmienia ksef_status.';

-- ─────────────────────────────────────────────────────────────────
-- 4. queued → draft (zlecenie nie powstało albo zginęło — strażnik I1)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_ksef_enqueue(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_released boolean;
BEGIN
  IF current_user <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF enqueue release is server-managed' USING ERRCODE = '42501';
  END IF;
  IF public.ksef_has_contact_evidence(p_invoice_id, p_tenant_id) THEN
    RETURN false;
  END IF;

  UPDATE public.invoices
     SET ksef_status = 'draft',
         ksef_send_owner = NULL,
         submitted_to_ksef_at = NULL
   WHERE id = p_invoice_id
     AND tenant_id = p_tenant_id
     AND direction = 'outgoing'
     AND ksef_status = 'queued';
  v_released := FOUND;

  IF v_released THEN
    PERFORM public.ksef_send_audit(p_tenant_id, p_invoice_id, NULL, 'invoice.enqueue_released',
      jsonb_build_object('reason', p_reason));
  END IF;
  RETURN v_released;
END;
$$;
REVOKE ALL ON FUNCTION public.release_ksef_enqueue(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ksef_enqueue(uuid, uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 5. failed → queued („wyślij ponownie” / cron / operator)
-- ─────────────────────────────────────────────────────────────────
-- Dozwolone z `failed` dla kodu spoza klasy terminal (NULL = kod historyczny,
-- decyduje człowiek) oraz z `rejected` wyłącznie w trybie „tylko uzgodnij”
-- (job zaczyna od uzgodnienia po referencji i niczego nie wysyła ponownie bez
-- potwierdzenia). Blokada doradcza: dwa równoległe wywołania (klik + cron)
-- nie dadzą dwóch zleceń.
CREATE OR REPLACE FUNCTION public.requeue_ksef_send(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_attempt_id text,
  p_actor_user_id uuid,
  p_reconcile_only boolean DEFAULT false
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_current public.invoices;
  v_class text;
  v_row public.invoices;
BEGIN
  IF current_user <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF requeue is server-managed' USING ERRCODE = '42501';
  END IF;
  IF p_attempt_id IS NULL OR length(p_attempt_id) = 0 THEN
    RAISE EXCEPTION 'KSeF requeue requires an attempt id' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ksef_send:' || p_invoice_id::text));

  SELECT * INTO v_current
    FROM public.invoices
   WHERE id = p_invoice_id
     AND tenant_id = p_tenant_id
     AND direction = 'outgoing'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktura nie należy do tej firmy' USING ERRCODE = 'P0002';
  END IF;

  IF v_current.ksef_status = 'rejected' AND NOT p_reconcile_only THEN
    RAISE EXCEPTION 'Odrzuconej faktury nie wysyła się ponownie bez poprawy — wróć do szkicu'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_current.ksef_status NOT IN ('failed', 'rejected') THEN
    RAISE EXCEPTION 'Ponowić można tylko fakturę w stanie failed (albo rejected w trybie uzgodnienia)'
      USING ERRCODE = 'P0001';
  END IF;

  v_class := public.ksef_error_class(v_current.last_error_code);
  IF v_class = 'terminal' AND NOT p_reconcile_only THEN
    RAISE EXCEPTION 'Błąd treści dokumentu (%) — wróć do szkicu i popraw', v_current.last_error_code
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.invoices
     SET ksef_status = 'queued',
         ksef_send_owner = NULL,
         submission_attempts = COALESCE(submission_attempts, 0) + 1,
         last_error = NULL,
         last_error_code = NULL,
         last_error_field = NULL,
         last_error_suggestion = NULL
   WHERE id = p_invoice_id
     AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;

  PERFORM public.ksef_send_audit(p_tenant_id, p_invoice_id, p_actor_user_id, 'invoice.send_requeued',
    jsonb_build_object(
      'attempt_id', p_attempt_id,
      'previous_status', v_current.ksef_status,
      'previous_code', v_current.last_error_code,
      'previous_error', v_current.last_error,
      'reconcile_only', p_reconcile_only
    ));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.requeue_ksef_send(uuid, uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_ksef_send(uuid, uuid, text, uuid, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 6. failed / rejected → draft („wróć do szkicu”)
-- ─────────────────────────────────────────────────────────────────
-- Tylko bez dowodu kontaktu i poza klasą reconcile: prawnie dokument nie został
-- wystawiony, numer zostaje jego numerem. Poprzednia diagnostyka trafia do
-- audytu, z wiersza znikają pola wysyłki (treść i pozycje zostają).
-- `xml_storage_path` jest czyszczony — plik w R2 zostaje do czasu, aż PR 3
-- zacznie kluczować XML po `sendAttemptId` (decyzja D5).
CREATE OR REPLACE FUNCTION public.reset_ksef_send(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_actor_user_id uuid
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_current public.invoices;
  v_class text;
  v_row public.invoices;
BEGIN
  IF current_user <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'KSeF reset is server-managed' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ksef_send:' || p_invoice_id::text));

  SELECT * INTO v_current
    FROM public.invoices
   WHERE id = p_invoice_id
     AND tenant_id = p_tenant_id
     AND direction = 'outgoing'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktura nie należy do tej firmy' USING ERRCODE = 'P0002';
  END IF;
  IF v_current.ksef_status NOT IN ('failed', 'rejected') THEN
    RAISE EXCEPTION 'Do szkicu wraca tylko faktura w stanie failed albo rejected'
      USING ERRCODE = 'P0001';
  END IF;
  IF public.ksef_has_contact_evidence(p_invoice_id, p_tenant_id) THEN
    RAISE EXCEPTION 'Faktura mogła dotrzeć do KSeF — wymaga uzgodnienia, nie powrotu do szkicu'
      USING ERRCODE = 'P0001';
  END IF;
  v_class := public.ksef_error_class(v_current.last_error_code);
  IF v_class = 'reconcile' THEN
    RAISE EXCEPTION 'Faktura z kodem % wymaga uzgodnienia przez operatora', v_current.last_error_code
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.ksef_send_audit(p_tenant_id, p_invoice_id, p_actor_user_id, 'invoice.send_reset',
    jsonb_build_object(
      'previous_status', v_current.ksef_status,
      'previous_code', v_current.last_error_code,
      'previous_error', v_current.last_error,
      'previous_attempts', v_current.submission_attempts,
      'previous_last_attempt_at', v_current.last_attempt_at,
      'previous_submitted_to_ksef_at', v_current.submitted_to_ksef_at,
      'previous_xml_storage_path', v_current.xml_storage_path,
      'previous_xml_generated_at', v_current.xml_generated_at
    ));

  UPDATE public.invoices
     SET ksef_status = 'draft',
         ksef_send_owner = NULL,
         submitted_to_ksef_at = NULL,
         xml_storage_path = NULL,
         xml_generated_at = NULL,
         last_attempt_at = NULL,
         submission_attempts = 0,
         last_error = NULL,
         last_error_code = NULL,
         last_error_field = NULL,
         last_error_suggestion = NULL
   WHERE id = p_invoice_id
     AND tenant_id = p_tenant_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_ksef_send(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_ksef_send(uuid, uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 7. Naruszenia inwariantów I1–I9 (strażnik PR 4, panel /admin/ksef)
-- ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER jak funkcje ops.* z 00100, bo I1 czyta pgboss.job, do
-- którego service_role nie ma dostępu. plpgsql rozwiązuje tabele w czasie
-- wykonania, więc funkcja powstaje także tam, gdzie schemat pgboss jeszcze
-- nie istnieje (świeża baza w CI tworzy go przed migracjami).
CREATE OR REPLACE FUNCTION public.ksef_lifecycle_violations()
RETURNS TABLE (invariant text, invoice_id uuid, tenant_id uuid, detail jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- I1: queued > 15 min bez zlecenia w pg-boss.
  RETURN QUERY
    SELECT 'I1'::text, i.id, i.tenant_id,
           jsonb_build_object('updated_at', i.updated_at)
      FROM public.invoices i
     WHERE i.direction = 'outgoing'
       AND i.ksef_status = 'queued'
       AND i.updated_at < now() - interval '15 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM pgboss.job j
          WHERE j.name = 'invoice.submit.requested'
            AND j.state IN ('created', 'retry', 'active')
            AND j.data->>'invoiceId' = i.id::text
       );

  -- I2: sending dłużej niż dzierżawa (15 min) + 15 min, albo bez znacznika przejęcia.
  RETURN QUERY
    SELECT 'I2'::text, i.id, i.tenant_id,
           jsonb_build_object('submitted_to_ksef_at', i.submitted_to_ksef_at, 'owner', i.ksef_send_owner)
      FROM public.invoices i
     WHERE i.direction = 'outgoing'
       AND i.ksef_status = 'sending'
       AND (i.submitted_to_ksef_at IS NULL OR i.submitted_to_ksef_at < now() - interval '30 minutes');

  -- I3: accepted bez numeru / środowiska / pliku XML albo bez wiersza UPO.
  RETURN QUERY
    SELECT 'I3'::text, i.id, i.tenant_id,
           jsonb_build_object(
             'ksef_number', i.ksef_number IS NOT NULL,
             'ksef_environment', i.ksef_environment,
             'xml_storage_path', i.xml_storage_path IS NOT NULL,
             'upo', EXISTS (SELECT 1 FROM public.upo_receipts u WHERE u.invoice_id = i.id)
           )
      FROM public.invoices i
     WHERE i.direction = 'outgoing'
       AND i.ksef_status = 'accepted'
       AND (
         i.ksef_number IS NULL
         OR i.ksef_environment IS NULL
         OR i.xml_storage_path IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.upo_receipts u WHERE u.invoice_id = i.id)
       );

  -- I4: failed / rejected z kodem spoza katalogu albo z trzymanym przejęciem.
  RETURN QUERY
    SELECT 'I4'::text, i.id, i.tenant_id,
           jsonb_build_object('last_error_code', i.last_error_code, 'owner', i.ksef_send_owner)
      FROM public.invoices i
     WHERE i.direction = 'outgoing'
       AND i.ksef_status IN ('failed', 'rejected')
       AND (
         i.ksef_send_owner IS NOT NULL
         OR i.last_error_code IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.ksef_error_codes c WHERE c.code = i.last_error_code)
       );

  -- I5: otwarty wpis `sent` starszy niż 48 h, a faktura nie jest w sending.
  RETURN QUERY
    SELECT 'I5'::text, s.invoice_id, s.tenant_id,
           jsonb_build_object('attempted_at', s.attempted_at, 'session', s.session_reference_number,
                              'ksef_status', i.ksef_status)
      FROM public.ksef_submissions s
      JOIN public.invoices i ON i.id = s.invoice_id
     WHERE s.status = 'sent'
       AND s.attempted_at < now() - interval '48 hours'
       AND i.ksef_status <> 'sending';

  -- I9: failed / rejected z numerem KSeF — stan sprzeczny, nic automatycznie.
  RETURN QUERY
    SELECT 'I9'::text, i.id, i.tenant_id,
           jsonb_build_object('ksef_number', i.ksef_number)
      FROM public.invoices i
     WHERE i.direction = 'outgoing'
       AND i.ksef_status IN ('failed', 'rejected')
       AND i.ksef_number IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.ksef_lifecycle_violations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ksef_lifecycle_violations() TO service_role;
COMMENT ON FUNCTION public.ksef_lifecycle_violations() IS
  'Naruszenia inwariantów cyklu życia faktury I1–I5, I9 (docs/architecture/cykl-zycia-faktury-ksef.md). I6–I8 realizuje cron i indeks unikalny numeru.';

COMMIT;
