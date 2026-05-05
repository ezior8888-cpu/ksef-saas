-- Audyt #11: unikalność numeru faktury per tenant.
--
-- `saveAndSendInvoiceAction` w `components/invoices/actions.ts` dotąd
-- pozwalał na DOUBLE-INSERT przy podwójnym kliknięciu „Wystaw i wyślij":
--   * frontend miał `disabled={isSending}` ale isSending jest ustawiane
--     dopiero PO async walidacji RHF/Zod — okno wyścigu kilka ms,
--   * brak unikalnego klucza w DB → drugi INSERT przechodził,
--   * rezultat: dwie faktury z tym samym `internal_number`, dwa eventy
--     Inngest, dwa potencjalne KSeF submit (drugi odrzucony, ale draft
--     i tak zostawał w bazie + audit log + wysłany event).
--
-- Defense-in-depth dwuwarstwowa:
--   1. (DB) Tu — UNIQUE INDEX na (tenant_id, internal_number).
--   2. (Frontend) `useRef`-based in-flight guard w `invoice-form.tsx` —
--      blokuje submit synchronicznie, zanim async-walidacja Zod zacznie się.
--   3. (Server action) Złapanie `code === '23505'` w `actions.ts` —
--      friendly message dla użytkownika zamiast technicznego błędu Postgresa.
--
-- WHERE internal_number IS NOT NULL: w schemacie 00001 kolumna jest NULLABLE
-- (faktury przychodzące z `inbox-polling` mogą nie mieć wewnętrznego numeru,
-- używają `ksef_number`). Partial index pomija je z constraint'u.

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_tenant_internal_number
  ON public.invoices (tenant_id, internal_number)
  WHERE internal_number IS NOT NULL;

COMMENT ON INDEX public.uq_invoices_tenant_internal_number IS
  'Idempotencja: jeden internal_number per tenant (chroni przed dubletami z double-click submit).';
