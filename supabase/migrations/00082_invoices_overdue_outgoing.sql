-- ═══════════════════════════════════════════════════════════════
-- 00082 — widok zaległości filtruje po kierunku, który baza zna
-- ═══════════════════════════════════════════════════════════════
--
-- 00023 filtrowało `direction = 'issued'`, a `invoices.direction` ma od 00001
-- CHECK (direction IN ('outgoing', 'incoming')). 'issued' to nazwa z API KSeF,
-- więc widok nie pasował do niczego i strona „Zaległe płatności” była zawsze
-- pusta. Ustalenie: PR #41 (Masło), strażnik `tests/unit/invoice-direction.test.ts`.
--
-- Definicja identyczna z 00023 poza jednym warunkiem — CREATE OR REPLACE
-- wymaga tych samych kolumn w tej samej kolejności, a granty zostają.
-- `security_invoker = true` podane wprost: to naprawa wycieku między firmami
-- z 00068 (SEC-C-05) i nie może zniknąć przy podmianie definicji.
--
-- Addytywne wobec działającego kodu: te same kolumny, zmienia się tylko to,
-- które wiersze widok zwraca.

CREATE OR REPLACE VIEW public.invoices_overdue
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.tenant_id,
  i.internal_number,
  i.issue_date,
  i.payment_due_date,
  i.gross_total,
  i.paid_amount,
  i.gross_total - COALESCE(i.paid_amount, 0)::NUMERIC AS amount_due,
  i.payment_status,
  public.days_overdue(i.payment_due_date::DATE) AS days_overdue,
  COALESCE(i.buyer_data->>'name', '') AS buyer_name,
  COALESCE(i.buyer_nip, i.buyer_data->>'nip', '') AS buyer_nip,
  COALESCE(i.buyer_data->>'email', '') AS buyer_email,
  i.reminders_paused,
  (
    SELECT COUNT(*)::BIGINT
    FROM public.payment_reminders pr
    WHERE pr.invoice_id = i.id
      AND pr.status = 'sent'
  ) AS reminders_sent_count
FROM public.invoices i
WHERE i.direction = 'outgoing'
  AND i.payment_status IN ('unpaid', 'partial', 'overdue')
  AND i.payment_due_date IS NOT NULL
  AND i.payment_due_date < CURRENT_DATE
  AND i.ksef_status = 'accepted';

COMMENT ON VIEW public.invoices_overdue IS
  'Faktury wystawione (direction=outgoing), przyjęte w KSeF, po terminie. '
  'security_invoker=true (00068, SEC-C-05) — respektuje RLS invoices.';
