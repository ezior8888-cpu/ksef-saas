-- 00137_invoice_special_data.sql
--
-- A4b, PR1 (plan „zero zgubionych faktur”): dane zdarzenia wysyłki dokumentu
-- specjalnego zapisane na wierszu faktury. Korekta (KOR) i faktura
-- rozliczeniowa (ROZ) mają treść, której nie da się odtworzyć z kolumn
-- `invoices` (typKorekty, „stan przed” policzony przez serwer, pozycje
-- z PKWiU, kompensata, wiersze rozliczenia zaliczek). Dotąd żyła tylko
-- w zleceniu pg-boss (kasowanym po 7 dniach), więc dokumentu specjalnego po
-- błędzie nie dało się wysłać ponownie z kopii — tylko „wróć do szkicu”.
--
-- Nowa kolumna `invoices.special_data` (jsonb, NULL):
--   KOR ('correction') → {"correctionData": {...}}
--   ROZ ('final')      → {"finalData": {...}, "finalAdvanceSettlementRows": [...]}
--   ZAL ('advance')    → NULL: koperta zaliczki jest już w fa3_data.advanceEnvelope
--                        (od 02.10.2026) i granica wysyłki ją porównuje
--   zwykła ('regular') → NULL
-- Pisze ją akcja w tym samym INSERT co wiersz (insertCorrection,
-- insertFinalDraft). Worker porównuje zapisaną kopię ze zdarzeniem
-- (submit-reference-boundary.ts); NULL = wiersz sprzed 00137, przyjmowany
-- jak dotąd. Ponowienie z kopii to A4b PR2 (bez migracji).
--
-- CHECK `invoices_special_data_shape` wiąże kształt z rodzajem dokumentu.
-- Każda gałąź jest dwuwartościowa (CASE + COALESCE): brakujący klucz daje
-- false, nie NULL — CHECK z wynikiem NULL Postgres by przepuścił.
--
-- Wyzwalacz `guard_invoice_special_data` (BEFORE UPDATE OF special_data) —
-- zapis jednorazowy:
--   - zapisanej kopii (OLD NOT NULL) nie zmienia ani nie kasuje nikt:
--     klient, serwis ani właściciel bazy — każde ponowienie wysyła treść
--     pierwszej próby;
--   - do wiersza sprzed 00137 (OLD NULL) dane może dopisać tylko serwer
--     (wyjście operatora dla starych dokumentów: odtworzenie ze zlecenia
--     pg-boss, potem porównanie na granicy wysyłki); klient — 42501.
-- Zmiana zapisanej kopii (np. przyszłe B2/C4) wymaga nowej migracji za zgodą
-- Bartosza, która ten wyzwalacz zastąpi. To celowe (fail-closed).
--
-- Czego NIE dotyka: listy ROW z 00132 (guard_invoice_pending_content,
-- guard_invoice_delivery_history), strażnik billingu 00079, 00118, 00125,
-- 00133/00135, RPC 00131 (requeue_ksef_send i reset_ksef_send nie piszą tej
-- kolumny). Brak nowych uprawnień: RLS wierszowe na invoices obejmuje kolumnę.
--
-- PRZED wdrożeniem kodu (addytywna). Stary kod kolumny nie zna: INSERT bez
-- niej daje NULL (CHECK przepuszcza), UPDATE jej nie zawiera (wyzwalacz
-- `UPDATE OF special_data` się nie odpala). Brak UPDATE i DELETE istniejących
-- wierszy, brak uzupełniania wstecz (koperty KOR/ROZ nie da się wyprowadzić
-- z kolumn). Kolejność obowiązkowa: najpierw ta migracja, potem kod — nowy
-- worker czyta special_data, więc bez kolumny każda wysyłka by padała.
--
-- Wycofanie: DROP TRIGGER, DROP FUNCTION, DROP CONSTRAINT — dozwolone;
-- DROP COLUMN tylko za zgodą Bartosza.

BEGIN;

-- ALTER czeka na blokadę za otwartymi transakcjami na invoices, a ruch
-- aplikacji czeka za nim. Bez blokady w 5 s migracja wycofuje się w całości
-- i można ją po prostu powtórzyć.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS special_data jsonb;

COMMENT ON COLUMN public.invoices.special_data IS
  'A4b (00137): dane zdarzenia wysyłki dokumentu specjalnego zapisane przy INSERT — KOR {correctionData}, ROZ {finalData, finalAdvanceSettlementRows}; ZAL w fa3_data.advanceEnvelope; zwykła NULL. NULL na KOR/ROZ = dokument sprzed 00137. Zapis jednorazowy (guard_invoice_special_data); kształt pilnuje CHECK invoices_special_data_shape.';

-- Kolumna jest nowa i cała NULL, więc sprawdzenie istniejących wierszy jest
-- natychmiastowe (bez NOT VALID).
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_special_data_shape;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_special_data_shape CHECK (
  special_data IS NULL
  OR CASE
    WHEN jsonb_typeof(special_data) IS DISTINCT FROM 'object' THEN false
    WHEN invoice_kind = 'correction' THEN COALESCE(
      jsonb_typeof(special_data -> 'correctionData') = 'object'
      AND (special_data - 'correctionData') = '{}'::jsonb,
      false)
    WHEN invoice_kind = 'final' THEN COALESCE(
      jsonb_typeof(special_data -> 'finalData') = 'object'
      AND (special_data - 'finalData' - 'finalAdvanceSettlementRows') = '{}'::jsonb
      AND CASE
        WHEN jsonb_typeof(special_data -> 'finalAdvanceSettlementRows') = 'array'
          THEN jsonb_array_length(special_data -> 'finalAdvanceSettlementRows') > 0
        ELSE false
      END,
      false)
    ELSE false
  END
);

COMMENT ON CONSTRAINT invoices_special_data_shape ON public.invoices IS
  'A4b (00137): special_data tylko na KOR ({correctionData: obiekt}) i ROZ ({finalData: obiekt, finalAdvanceSettlementRows: niepusta tablica}), bez innych kluczy; inne rodzaje NULL. Brak klucza = odmowa.';

CREATE OR REPLACE FUNCTION public.guard_invoice_special_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.special_data IS NOT DISTINCT FROM OLD.special_data THEN
    RETURN NEW;
  END IF;
  IF OLD.special_data IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice special data is written once (00137) and cannot change'
      USING ERRCODE = '42501';
  END IF;
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Invoice special data can be added to an existing invoice only by the server (00137)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_special_data() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_invoice_special_data ON public.invoices;
CREATE TRIGGER guard_invoice_special_data
  BEFORE UPDATE OF special_data ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_special_data();

COMMENT ON FUNCTION public.guard_invoice_special_data() IS
  'A4b (00137): special_data zapisane raz — zmiana zapisanej kopii odrzucona dla każdej roli; dopisanie do wiersza z NULL tylko przez serwer (nie authenticated/anon).';

COMMIT;
