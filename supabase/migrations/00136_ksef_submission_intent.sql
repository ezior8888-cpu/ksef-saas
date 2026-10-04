-- 00136_ksef_submission_intent.sql
--
-- A2 z planu „zero zgubionych faktur” (docs/koordynacja/PLAN-ZERO-ZGUBIONYCH-FAKTUR.md):
-- okno między wysłaniem pliku do KSeF a zapisem numeru referencyjnego.
-- Worker zapisuje teraz w `ksef_submissions` wpis `intent` z numerem sesji
-- PO otwarciu sesji, a PRZED wysłaniem pliku. Gdy odpowiedź na wysyłkę
-- zginie, ponowienie zamyka tamtą sesję i pyta KSeF o jej faktury, zamiast
-- wysyłać fakturę drugi raz. Statusy wpisu (kolumna `status` bez CHECK):
--   intent → sent → accepted | rejected | duplicate,  intent → abandoned.
--
-- Zmiany — wyłącznie CREATE OR REPLACE dwóch funkcji z 00131:
--   1. `ksef_has_contact_evidence`: `intent` jest dowodem kontaktu (KSeF mógł
--      dostać plik — treści nie wolno zmienić, powrót do szkicu zablokowany).
--      `abandoned` nie jest (KSeF potwierdził, że pliku z tej próby nie ma).
--      Wyjście z blokady: „Wyślij ponownie” / cron / operator „Tylko uzgodnij”
--      — runner rozstrzyga zamiar w KSeF (sent albo abandoned).
--   2. `ksef_lifecycle_violations` I5: także zamiar starszy niż 48 h.
--
-- PRZED wdrożeniem kodu (addytywna): stary kod nie zapisuje `intent`, więc
-- obie zmiany nic dla niego nie zmieniają. Bez UPDATE danych, bez DROP.
-- Sygnatury, uprawnienia i SECURITY bez zmian. Wycofanie: definicje z 00131.

BEGIN;

-- 1. Dowód kontaktu z KSeF (00131 + intent)
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
       AND s.status IN ('intent', 'sent', 'accepted', 'duplicate')
  );
$$;
REVOKE ALL ON FUNCTION public.ksef_has_contact_evidence(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ksef_has_contact_evidence(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.ksef_has_contact_evidence(uuid, uuid) IS
  'Czy KSeF mógł dostać tę fakturę: numer KSeF albo wpis ksef_submissions intent/sent/accepted/duplicate. Faktura z dowodem nigdy nie wraca do szkicu (00131, intent: 00136).';

-- 2. Strażnik: I5 także dla zamiaru (00131 + intent)
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

  -- I5: otwarty wpis `sent` albo zamiar `intent` starszy niż 48 h, a faktura nie jest w sending.
  RETURN QUERY
    SELECT 'I5'::text, s.invoice_id, s.tenant_id,
           jsonb_build_object('attempted_at', s.attempted_at, 'session', s.session_reference_number,
                              'ksef_status', i.ksef_status, 'submission_status', s.status)
      FROM public.ksef_submissions s
      JOIN public.invoices i ON i.id = s.invoice_id
     WHERE s.status IN ('sent', 'intent')
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
