-- Apply only after 00073 and after the web/worker release has switched the
-- reminder pause action to set_invoice_reminders_paused. This separate step
-- avoids breaking the old web version while both app instances are rolling.
-- No data is deleted or rewritten here.

-- These rows are evidence and dispatch state, not client-editable records.
REVOKE ALL ON TABLE public.payments, public.payment_imports,
  public.payment_reminders FROM PUBLIC, anon, authenticated;
-- The overdue screen needs reminder status; the app currently has no
-- authenticated read path for payment or bank-import rows.
GRANT SELECT ON TABLE public.payment_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments,
  public.payment_imports, public.payment_reminders TO service_role;

DROP POLICY IF EXISTS payments_tenant_isolation ON public.payments;
CREATE POLICY payments_tenant_isolation ON public.payments
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS payment_imports_tenant_isolation ON public.payment_imports;
CREATE POLICY payment_imports_tenant_isolation ON public.payment_imports
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS payment_reminders_tenant_isolation ON public.payment_reminders;
CREATE POLICY payment_reminders_tenant_isolation ON public.payment_reminders
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());
