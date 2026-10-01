-- 00099 — numery referencyjne wysyłki KSeF w historii prób (PROŚBA: wgrywa Bartosz).
--
-- Po co (AUD-01, AUD-17 z audytu 01.10.2026): KSeF po przyjęciu pliku nadaje
-- numer sesji i numer referencyjny faktury, a numer KSeF dopiero po
-- przetworzeniu. Kod je wyrzucał, więc niepewny wynik (timeout pollingu, 5xx,
-- padnięty worker) kończył się ponowną wysyłką i odpowiedzią 440 „duplikat”,
-- a UPO — dostępne w KSeF 2.0 wyłącznie w zasobach sesji — nie dało się pobrać.
--
-- `ksef_submissions` istnieje od 00001, zapisuje ją tylko service_role (00027),
-- klient ma SELECT przez RLS. Dotąd nikt do niej nie pisał.
--
-- Addytywna: dwie kolumny NULL i indeks; bez UPDATE istniejących wierszy
-- (tabela jest pusta). Kolejność: TA MIGRACJA PRZED wdrożeniem kodu — kod
-- zapisuje te kolumny przy każdej wysyłce.
-- Numer 00099: 00097 zajął Codex (#86), 00098 jest na db-1 z #90.

ALTER TABLE public.ksef_submissions
  ADD COLUMN IF NOT EXISTS session_reference_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_reference_number TEXT;

CREATE INDEX IF NOT EXISTS idx_ksef_submissions_tenant_invoice_attempted
  ON public.ksef_submissions (tenant_id, invoice_id, attempted_at DESC);

COMMENT ON COLUMN public.ksef_submissions.session_reference_number IS
  'Numer referencyjny sesji online KSeF, w której wysłano fakturę — potrzebny do statusu i UPO.';
COMMENT ON COLUMN public.ksef_submissions.invoice_reference_number IS
  'Numer referencyjny faktury w sesji KSeF — pozwala uzgodnić niepewny wynik bez ponownej wysyłki.';
