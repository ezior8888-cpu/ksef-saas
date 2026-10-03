-- C-16 — kwota do zapłaty faktury rozliczeniowej (ROZ, invoice_kind='final').
--
-- `gross_total` ROZ to PEŁNE zamówienie (#82); nabywca płaci resztę po
-- zaliczkach, zapisaną przy wystawieniu w `payment_data.amountDue`
-- (art. 106f ust. 3 — `components/invoices/final-actions.ts`). Do tej
-- migracji wyzwalacz i widok liczyły „do zapłaty" od całego `gross_total`,
-- więc ROZ nigdy nie stawała się `paid` i 00126 wykluczał ją z zaległości
-- jako bezpiecznik (patrz tam, sekcja C-16/C-06). Rejestr migracji:
-- docs/koordynacja/CLAUDE-DO-CODEXA.md.
--
-- PRZED wdrożeniem: addytywna — CREATE OR REPLACE funkcji, przebindowanie
-- wyzwalacza (CREATE OR REPLACE TRIGGER, bez DROP) i CREATE OR REPLACE
-- widoku. Bez DROP/TRUNCATE/DELETE, bez zmiany danych — na produkcji 0 ROZ,
-- więc bez backfillu.

-- 1. Wyzwalacz: dla ROZ do zapłaty to LEAST(amountDue, gross_total), a nie
--    samo gross_total. Regex PRZED rzutowaniem na numeric — ::numeric na
--    dowolnym tekście z payment_data wywaliłby wyzwalacz na każdym
--    INSERT/UPDATE tej faktury; brak/ujemna/nieliczbowa wartość = ta sama
--    zasada fail-safe co w `lib/invoices/amount-due.ts`: liczymy od całego
--    gross_total. Reszta funkcji — bez zmian względem 00073.
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_amount_due_text TEXT;
  v_due NUMERIC;
BEGIN
  v_amount_due_text := NEW.payment_data ->> 'amountDue';

  IF NEW.invoice_kind = 'final'
     AND NEW.gross_total IS NOT NULL
     AND v_amount_due_text IS NOT NULL
     AND v_amount_due_text ~ '^[0-9]+(\.[0-9]+)?$'
  THEN
    v_due := LEAST(v_amount_due_text::numeric, NEW.gross_total);
  ELSE
    v_due := NEW.gross_total;
  END IF;

  -- ROZ w całości pokryta zaliczkami (do zapłaty 0) jest rozliczona od
  -- wystawienia — gałąź „paid” niżej, nie „unpaid/overdue”.
  IF NEW.paid_amount = 0 AND NOT (NEW.invoice_kind = 'final' AND v_due = 0) THEN
    NEW.paid_at := NULL;
    IF NEW.payment_due_date IS NOT NULL AND NEW.payment_due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'unpaid';
    END IF;
  ELSIF v_due IS NOT NULL AND NEW.paid_amount >= v_due THEN
    NEW.payment_status := 'paid';
    IF NEW.paid_at IS NULL THEN NEW.paid_at := NOW(); END IF;
  ELSE
    NEW.payment_status := 'partial';
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Przebindowanie: 00012 wiązał wyzwalacz tylko do paid_amount/
--    payment_due_date/gross_total, więc zapis ROZ (payment_data z amountDue
--    przy wystawieniu) nigdy go nie odpalał. CREATE OR REPLACE TRIGGER
--    (PG 14+) — ta sama nazwa, timing i poziom co w 00012, bez DROP.
CREATE OR REPLACE TRIGGER trigger_update_payment_status
  BEFORE INSERT OR UPDATE OF paid_amount, payment_due_date, gross_total, payment_data, invoice_kind
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_payment_status();

-- 3. Widok zaległości (00126) wykluczał ROZ jako bezpiecznik do tej
--    migracji. CREATE OR REPLACE zachowuje nazwy, kolejność i typy kolumn
--    z 00082/00126 — `amount_due` dalej NUMERIC, zmienia się tylko wzór
--    (ten sam LEAST/regex co w wyzwalaczu wyżej, żeby baza liczyła to samo
--    w dwóch miejscach tą samą drogą).
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
  (
    CASE
      WHEN i.invoice_kind = 'final'
           AND i.gross_total IS NOT NULL
           AND (i.payment_data ->> 'amountDue') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN LEAST((i.payment_data ->> 'amountDue')::numeric, i.gross_total)
      ELSE i.gross_total
    END
  ) - COALESCE(i.paid_amount, 0)::NUMERIC AS amount_due,
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
  AND i.origin = 'app'
  AND (
    (i.invoice_kind = 'regular' AND i.invoice_type IN ('VAT', 'UPR')) OR
    (i.invoice_kind = 'advance' AND i.invoice_type = 'ZAL') OR
    (i.invoice_kind = 'final' AND i.invoice_type = 'ROZ')
  )
  AND i.payment_status IN ('unpaid', 'partial', 'overdue')
  AND i.payment_due_date IS NOT NULL
  AND i.payment_due_date < CURRENT_DATE
  AND i.ksef_status = 'accepted'
  AND (i.currency IS NULL OR i.currency = 'PLN')
  AND i.gross_total > 0
  AND i.paid_amount >= 0
  AND i.paid_amount < (
    CASE
      WHEN i.invoice_kind = 'final'
           AND i.gross_total IS NOT NULL
           AND (i.payment_data ->> 'amountDue') ~ '^[0-9]+(\.[0-9]+)?$'
      THEN LEAST((i.payment_data ->> 'amountDue')::numeric, i.gross_total)
      ELSE i.gross_total
    END
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.invoices child
    WHERE child.tenant_id = i.tenant_id
      AND (child.parent_invoice_id = i.id OR i.id = ANY(child.advance_invoice_ids))
  );

REVOKE ALL ON public.invoices_overdue FROM anon;
GRANT SELECT ON public.invoices_overdue TO authenticated;

COMMENT ON VIEW public.invoices_overdue IS
  'Zaległe pozycje do przypomnienia: app, bez powiązanych dokumentów, '
  'z security_invoker=true. ROZ liczona od payment_data.amountDue (reszta '
  'po zaliczkach, C-16/00130), nie od całego gross_total. Nie jest pełnym '
  'saldem należności po korektach ani po imporcie.';
