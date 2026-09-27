-- 00091 — zwolnienie z VAT na poziomie firmy (PROŚBA: wgrywa Bartosz).
--
-- Po co: firma zwolniona z VAT (art. 113 — typowa mikrofirma do 200 000 zł,
-- albo zwolnienie przedmiotowe art. 43) nie mogła wystawić poprawnej faktury:
-- formularz nie miał stawki „zw”, a generator FA(3) rzucał błędem, bo nie znał
-- podstawy prawnej (P_19A). Podstawa jest cechą firmy, nie pojedynczej faktury,
-- więc trzymamy ją tutaj; faktura dostaje ją przy zapisie.
--
-- NULL = czynny podatnik VAT (stan każdej istniejącej firmy — zmiana jest
-- czysto addytywna, nic się nie zmienia, dopóki właściciel nie ustawi pola).
--
-- Kolejność: TA MIGRACJA PRZED wdrożeniem kodu. Kod czyta kolumnę odpornie
-- (brak kolumny = „nie zwolniona”), ale zapis ustawienia wymaga kolumny.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS vat_exemption_basis TEXT;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_vat_exemption_basis_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_vat_exemption_basis_check
  CHECK (
    vat_exemption_basis IS NULL
    OR (char_length(vat_exemption_basis) BETWEEN 3 AND 256
        AND vat_exemption_basis = btrim(vat_exemption_basis))
  );

COMMENT ON COLUMN public.tenants.vat_exemption_basis IS
  'Podstawa prawna zwolnienia z VAT (FA(3) P_19A), np. „art. 113 ust. 1 ustawy o VAT”. NULL = czynny podatnik VAT.';
