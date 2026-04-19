-- ═══════════════════════════════════════════════════════════════
-- KSEF SAAS — ROW LEVEL SECURITY POLICIES
-- Migration: 00002
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- HELPER: get_current_tenant_id()
-- Zwraca tenant_id aktualnie zalogowanego użytkownika.
-- SECURITY DEFINER: uruchamia się z uprawnieniami właściciela funkcji
-- (bypassuje RLS na public.users), dzięki czemu nie mamy nieskończonej rekurencji.
-- STABLE: wynik cache'owany w ramach jednego zapytania.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_current_tenant_id IS
  'Zwraca tenant_id zalogowanego usera. Używane w politykach RLS.';

-- ---------------------------------------------------------------
-- WŁĄCZ RLS na wszystkich tabelach
-- Bez tego polityki nie działają!
-- ---------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ksef_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ksef_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xml_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpir_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_access ENABLE ROW LEVEL SECURITY;

-- Zabezpieczenie: odmów wszystkiego roli `anon` (niezalogowani)
-- na wszystkich tabelach. Domyślnie SELECT/INSERT byłby dostępny.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- POLITYKI: tenants
-- Widzisz tylko SWÓJ tenant.
-- Modyfikować może tylko owner.
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "tenants_select_own"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (id = public.get_current_tenant_id());

CREATE POLICY "tenants_update_own_owner"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (
    id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'owner'
    )
  )
  WITH CHECK (id = public.get_current_tenant_id());

-- INSERT na tenants robimy przez trigger przy rejestracji,
-- więc nie potrzebujemy polityki INSERT dla authenticated.
-- DELETE też zablokowany (soft-delete przez UI).

-- ═══════════════════════════════════════════════════════════════
-- POLITYKI: users
-- Widzisz siebie i kolegów z tego samego tenanta.
-- Edytujesz tylko siebie (poza owner, który może edytować role).
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "users_select_same_tenant"
  ON public.users FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "users_update_self"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT: tylko przez trigger handle_new_user (niżej)

-- ═══════════════════════════════════════════════════════════════
-- POLITYKI: invoices
-- Widzisz/modyfikujesz TYLKO faktury swojego tenanta.
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "invoices_select_own_tenant"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "invoices_insert_own_tenant"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "invoices_update_own_tenant"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "invoices_delete_own_tenant_draft_only"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND ksef_status = 'draft'  -- nie można usuwać wysłanych faktur!
  );

-- ═══════════════════════════════════════════════════════════════
-- POLITYKI: invoice_line_items
-- Dziedziczą dostęp z faktury rodzica (JOIN przez invoice_id).
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "line_items_select_via_invoice"
  ON public.invoice_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.tenant_id = public.get_current_tenant_id()
    )
  );

CREATE POLICY "line_items_insert_via_invoice"
  ON public.invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.tenant_id = public.get_current_tenant_id()
    )
  );

CREATE POLICY "line_items_update_via_invoice"
  ON public.invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.tenant_id = public.get_current_tenant_id()
    )
  );

CREATE POLICY "line_items_delete_via_invoice"
  ON public.invoice_line_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.tenant_id = public.get_current_tenant_id()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- POLITYKI: pozostałe tabele (wszystkie mają tenant_id)
-- ═══════════════════════════════════════════════════════════════

-- ksef_sessions
CREATE POLICY "ksef_sessions_own_tenant"
  ON public.ksef_sessions FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- ksef_submissions (tylko odczyt - INSERT robią Inngest jobs przez service_role)
CREATE POLICY "ksef_submissions_select_own_tenant"
  ON public.ksef_submissions FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- xml_documents (tylko odczyt)
CREATE POLICY "xml_documents_select_own_tenant"
  ON public.xml_documents FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- audit_logs (tylko SELECT - INSERT robi backend przez service_role)
CREATE POLICY "audit_logs_select_own_tenant"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- kpir_entries
CREATE POLICY "kpir_entries_own_tenant"
  ON public.kpir_entries FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- accountant_access (tylko owner może zarządzać zaproszeniami)
CREATE POLICY "accountant_access_select_own_tenant"
  ON public.accountant_access FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "accountant_access_manage_by_owner"
  ON public.accountant_access FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'owner'
    )
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'owner'
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- TRIGGER: handle_new_user
-- Po rejestracji nowego użytkownika w auth.users:
-- 1. Stwórz pusty wiersz w public.users (bez tenant_id jeszcze)
-- Uzupełnienie tenant_id i tworzenie tenants robimy
-- w Server Action po zalogowaniu (user wybiera NIP firmy).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'owner'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS
  'Po rejestracji w Supabase Auth - tworzy wiersz w public.users.';