-- 00142_ksef_error_code_number_taken.sql
--
-- D-A4-1 (decyzja Bartosza 04.10.2026, plan „zero zgubionych faktur”): cudzy
-- 440 — KSeF ma już fakturę tej firmy o tym numerze, a sesji oryginału nie
-- ma w historii tej faktury. Runner pobiera oryginał
-- (`GET /invoices/ksef/{ksefNumber}`) i porównuje z naszymi plikami. Gdy
-- oryginał pochodzi z innego programu (SystemInfo), werdykt to nowy kod
-- `KSEF_NUMBER_TAKEN`: numer zajęty, klient wraca do szkicu i wystawia
-- fakturę z nowym numerem (albo, przy tej samej sprzedaży, nie wystawia jej).
--
-- Klasa `terminal` (dokument wymaga zmiany — numeru), bez automatu.
-- Wszystkie wpisy `ksef_submissions` tej faktury z tym duplikatem dostają
-- status `number_taken` (kolumna `status` bez CHECK), który NIE jest na liście
-- `ksef_has_contact_evidence` (00136: intent, sent, accepted, duplicate) —
-- więc `reset_ksef_send` przepuszcza powrót do szkicu (terminal + brak dowodu).
--
-- Znacznik 440 na otwartej próbie: kolumny `original_ksef_number`
-- i `original_session_reference_number`. Runner zapisuje je, zanim zacznie
-- weryfikację; wpis zostaje otwarty (`sent`, dowód kontaktu) do werdyktu,
-- a każde kolejne uzgodnienie weryfikuje treść od nowa zamiast pytać o starą
-- sesję — bez tego po 48 h wpis zamykał się jako STALE i faktura dostawała
-- fałszywe NOT_IN_KSEF (ustalenie z recenzji D-A4-1a).
--
-- PRZED wdrożeniem kodu (addytywna): jeden wiersz w tabeli referencyjnej
-- i dwie kolumny NULL, bez UPDATE danych klientów, bez DROP. Nowy kod bez
-- tej migracji dostałby I4 (kod spoza katalogu) i błąd zapisu znacznika.
-- Wycofanie: DELETE wiersza katalogu i DROP COLUMN (za zgodą), gdy żadna
-- faktura nie ma tego kodu ani znacznika.

BEGIN;

INSERT INTO public.ksef_error_codes (code, class, auto_requeue, client_message) VALUES
  ('KSEF_NUMBER_TAKEN', 'terminal', false,
   'W KSeF jest już faktura Twojej firmy o tym numerze, wystawiona w innym programie. Jeśli to ta sama sprzedaż — nie wystawiaj jej ponownie. Jeśli inna — wróć do szkicu, usuń go i wystaw fakturę z nowym numerem.')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.ksef_submissions
  ADD COLUMN IF NOT EXISTS original_ksef_number text,
  ADD COLUMN IF NOT EXISTS original_session_reference_number text;

COMMENT ON COLUMN public.ksef_submissions.original_ksef_number IS
  'D-A4-1 (00142): KSeF odpowiedział na tę próbę 440 — numer KSeF oryginału. Przy otwartym wpisie (sent) uzgodnienie weryfikuje treść oryginału zamiast pytać o starą sesję.';
COMMENT ON COLUMN public.ksef_submissions.original_session_reference_number IS
  'D-A4-1 (00142): sesja KSeF oryginału z odpowiedzi 440 (extensions.originalSessionReferenceNumber).';

COMMENT ON COLUMN public.ksef_submissions.status IS
  'Próba wysyłki: intent (sesja otwarta, plik w drodze — 00136), sent, accepted, rejected, duplicate (440), abandoned (KSeF nie ma pliku z tej próby), number_taken (440, oryginał z innego programu — 00142). Dowód kontaktu: intent, sent, accepted, duplicate.';

COMMIT;
