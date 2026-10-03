-- WGRANIE: PRZED wdrożeniem kodu. Nie zmienia istniejących dowodów XML.
-- Jeden autorytatywny dokument XML na (tenant_id, invoice_id), także gdy
-- dwa workery równocześnie nie znajdują jeszcze wiersza i próbują INSERT.
-- Duplikaty wymagają osobnego przeglądu dowodów; migracja niczego nie usuwa
-- i nie wybiera arbitralnie najnowszego wiersza.

BEGIN;

-- Zatrzymuje INSERT/UPDATE/DELETE aż do końca transakcji, aby między
-- preflightem a utworzeniem indeksu nie powstał kolejny duplikat.
LOCK TABLE public.xml_documents IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.xml_documents
    GROUP BY tenant_id, invoice_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'xml_documents contains multiple XML records for an invoice; evidence review required before 00129'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX uq_xml_documents_tenant_invoice
  ON public.xml_documents (tenant_id, invoice_id);

COMMENT ON INDEX public.uq_xml_documents_tenant_invoice IS
  'One authoritative XML evidence row per tenant and invoice; retries compare evidence instead of overwriting.';

COMMIT;
