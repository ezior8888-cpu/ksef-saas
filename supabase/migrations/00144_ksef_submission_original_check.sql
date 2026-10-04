-- 00144_ksef_submission_original_check.sql
--
-- D-A4-1b-3, PR A (plan „zero zgubionych faktur”): dane oryginału przy
-- nierozstrzygniętym duplikacie 440. Gdy KSeF ma już fakturę firmy o tym
-- numerze, a automat (D-A4-1a) nie rozstrzygnął, czyja to treść, faktura
-- zostaje `failed KSEF_DUPLICATE_RECONCILE`, a wpis próby — otwarty ze
-- znacznikiem 440 (00142). Dotąd dane oryginału (numer, data, nabywca,
-- kwota, program) trafiały tylko do treści błędu i alarmu; klient nie miał
-- na czym podjąć decyzji „ta sama sprzedaż” / „inna” (decyzja Bartosza 3).
--
-- Nowa kolumna `ksef_submissions.original_check` (jsonb) na tym wpisie:
-- powód braku rozstrzygnięcia, skrót i klucz archiwum bajtów oryginału,
-- dane z faktury, data nadania numeru, środowisko. Pisze tylko serwer
-- (00027: klient ma SELECT własnej firmy, bez INSERT/UPDATE/DELETE).
--
-- PRZED wdrożeniem kodu (addytywna): kolumna NULL, bez UPDATE danych, bez
-- DROP; stary kod jej nie zna. Wycofanie: DROP COLUMN (za zgodą), gdy nic
-- jej nie czyta.

BEGIN;

ALTER TABLE public.ksef_submissions
  ADD COLUMN IF NOT EXISTS original_check jsonb;

COMMENT ON COLUMN public.ksef_submissions.original_check IS
  'D-A4-1b-3 (00144): wynik weryfikacji duplikatu 440, którego automat nie rozstrzygnął — {v, env, checkedAt, reason (known-number | download-refused | download-pending | storage-pending | faktflow-original | same-content-other-program | no-own-file | archive-conflict), sha256, archivePath, sizeBytes, summary {systemInfo, number, issueDate, buyerNip, buyerName, gross, currency}, sameContentExceptHeader, ownHistory, acquiredAt, httpStatus, knownInvoice}. Tylko na otwartym wpisie ze znacznikiem 440; pisze serwer.';

COMMIT;
