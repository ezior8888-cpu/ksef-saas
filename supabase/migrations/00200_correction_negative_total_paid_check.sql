-- ═══════════════════════════════════════════════════════════════
-- 00200: korekta zmniejszająca kwotę daje się zapisać (audyt bloku 1, F-004)
--
-- Od commita aed95eb (AUD-21, 02.10.2026) suma faktury korygującej to
-- RÓŻNICA (spójnie z P_13/P_15 w FA(3) KOR), czyli liczba ujemna dla każdej
-- korekty w dół i dla anulowania. CHECK `check_paid_amount_valid` z 00012
-- wymagał `paid_amount <= gross_total`, a `paid_amount` ma DEFAULT 0 —
-- warunek `0 <= -246` jest fałszywy, więc INSERT takiej korekty padał
-- surowym błędem Postgresa.
--
-- Teraz: przy `gross_total < 0` jedyna dopuszczalna wartość `paid_amount`
-- to 0 (`GREATEST(gross_total, 0)`); dokumentu do zwrotu nie „opłaca” się
-- wpłatą. Dla `gross_total >= 0` warunek bez zmian. Istniejące wiersze
-- spełniały stary warunek, więc spełniają i nowy — walidacja przy ADD
-- CONSTRAINT nie odrzuci danych.
--
-- Bez DROP/TRUNCATE/DELETE danych. UPDATE: brak.
-- Kolejność: najpierw ta migracja, potem kod (kod już zapisuje różnicę —
-- bez migracji korekty w dół nie zapiszą się wcale).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_paid_amount_valid;

ALTER TABLE public.invoices ADD CONSTRAINT check_paid_amount_valid
  CHECK (
    paid_amount >= 0
    AND (
      gross_total IS NULL
      OR paid_amount <= GREATEST(gross_total, 0)
    )
  );

COMMENT ON CONSTRAINT check_paid_amount_valid ON public.invoices IS
  'Wpłata nie większa niż brutto; przy brutto ujemnym (korekta w dół) wpłata = 0 (00200, F-004).';
