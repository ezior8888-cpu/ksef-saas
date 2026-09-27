-- 00094 — metoda kasowa VAT firmy (PROŚBA: wgrywa Bartosz).
--
-- Po co: mały podatnik rozliczający VAT metodą kasową (art. 21 ustawy o VAT)
-- MUSI mieć na każdej fakturze wyrazy „metoda kasowa” (art. 106e ust. 1
-- pkt 16; w FA(3) — P_16 = 1). Generator zna to pole, ale nic go nie
-- ustawiało: każda faktura szła z P_16 = 2. To cecha firmy, nie pojedynczej
-- faktury — stąd kolumna na firmie, jak zwolnienie z VAT (00091).
--
-- Addytywna: kolumna z wartością domyślną (w Postgresie 11+ bez przepisywania
-- tabeli), bez UPDATE istniejących wierszy — każda firma zostaje przy
-- metodzie memoriałowej, dopóki właściciel nie zmieni ustawienia.
--
-- Kolejność: TA MIGRACJA PRZED wdrożeniem kodu. Kod czyta kolumnę odpornie
-- (brak kolumny = metoda memoriałowa), ale zapis ustawienia wymaga kolumny.
-- Numer 00094: 00093 zajął Codex (#71).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS vat_cash_method BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.vat_cash_method IS
  'Metoda kasowa VAT (art. 21 ustawy o VAT) — na fakturach P_16 = 1 i wyrazy „metoda kasowa”. false = metoda memoriałowa.';
