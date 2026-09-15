-- ═══════════════════════════════════════════════════════════════
-- 00072 — SEC-C-04: baza trzyma tylko SHA-256 tokenu anulowania
-- ═══════════════════════════════════════════════════════════════
--
-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  NIE WGRYWAĆ SAMODZIELNIE. NIEODWRACALNA.                     ║
-- ║  Wyłącznie w oknie wydania razem z kodem z PR #1.             ║
-- ║  Procedura: docs/security/PLAN-WYDANIA-GDPR.md                ║
-- ╚═══════════════════════════════════════════════════════════════╝
--
-- Źródło projektu: docs/security/PROPOZYCJE-SCHEMATU-GDPR.md (Astra/Masło).
--
-- ── Dlaczego NIE WOLNO tego wgrać przed kodem ───────────────────
-- To jest ZMIANA NAZWY KOLUMNY, a nie zmiana addytywna. Reguła
-- z AGENTS.md („baza może wyprzedzać aplikację") obowiązuje tylko dla
-- zmian addytywnych i TUTAJ NIE MA ZASTOSOWANIA.
--
-- Kod wdrożony dziś (b9c3703, lib/gdpr/deletion.ts) odwołuje się do
-- kolumny `cancel_token` w CZTERECH miejscach — linie 98, 118, 150, 175.
-- Po zmianie nazwy każde z tych zapytań padnie: użytkownik nie utworzy
-- żądania usunięcia konta ani go nie anuluje, a worker nie odczyta
-- kolejki. Wgranie tej migracji bez jednoczesnego wdrożenia nowego kodu
-- to awaria obsługi GDPR, a nie wyprzedzenie schematu.
--
-- ── Dlaczego nieodwracalna ──────────────────────────────────────
-- SHA-256 jest jednokierunkowy. Odwrócenie tej migracji NIE odtworzy
-- tokenów w postaci jawnej. W razie problemu po wdrożeniu: poprawiać
-- kod, ZACHOWUJĄC schemat z hashem. Nie odtwarzać jawnych tokenów
-- z kopii zapasowej — to cofnęłoby całą korzyść bezpieczeństwa.
--
-- ── Co się dzieje z już wysłanymi linkami ───────────────────────
-- Backfill zachowuje ich ważność: nowa aplikacja hashuje token z maila
-- dokładnie tak samo i porównuje z kolumną. SHA-256 liczony jest na
-- TEKŚCIE HEX tokenu, nie na bajtach po dekodowaniu HEX. Używamy
-- wbudowanej `sha256(bytea)` (PostgreSQL 11+), więc nie zależymy od
-- tego, w jakim schemacie zainstalowano pgcrypto.
--
-- ── Znane ograniczenie CHECK-a, żeby nikogo nie zaskoczyło ──────
-- Jawny token powstaje jako `randomBytes(32).toString('hex')`, czyli
-- również 64 znaki hex. Wzorzec '^[a-f0-9]{64}$' pasuje więc TAK SAMO
-- do tokenu jawnego, jak do skrótu SHA-256. Ten CHECK pilnuje formatu,
-- ale NIE JEST DOWODEM, że backfill się wykonał. Dowodem jest dopiero
-- porównanie wartości sprzed i po migracji — zob. plan wydania.
--
-- ── Kolejność w oknie wydania ───────────────────────────────────
--   1. wstrzymać obsługę żądań GDPR (worker down, ścieżka UI zamknięta)
--   2. kopia zapasowa tabeli gdpr_deletion_requests
--   3. ta migracja (--single-transaction)
--   4. wdrożenie aplikacji (id=1) i workera (id=2) z kodem PR #1
--   5. weryfikacja, wznowienie obsługi
--
-- Punkt 4 musi objąć OBIE aplikacje. Sam worker importuje szeroki
-- przekrój lib/**, więc pominięcie go zostawia produkcję w stanie
-- mieszanym: strona na nowym kodzie, joby na starym.

ALTER TABLE public.gdpr_deletion_requests
  RENAME COLUMN cancel_token TO cancel_token_hash;

UPDATE public.gdpr_deletion_requests
SET cancel_token_hash = encode(sha256(convert_to(cancel_token_hash, 'UTF8')), 'hex');

ALTER INDEX public.idx_gdpr_deletion_cancel_token
  RENAME TO idx_gdpr_deletion_cancel_token_hash;

ALTER TABLE public.gdpr_deletion_requests
  ADD CONSTRAINT gdpr_cancel_token_hash_format
  CHECK (cancel_token_hash ~ '^[a-f0-9]{64}$');

COMMENT ON COLUMN public.gdpr_deletion_requests.cancel_token_hash IS
  'SHA-256 jawnego tokenu z linku anulowania, lowercase hex (00072). Nigdy token do bezpośredniego użycia.';

-- ── Weryfikacja po wgraniu ──────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='gdpr_deletion_requests'
--     AND column_name IN ('cancel_token','cancel_token_hash');
--   -- oczekiwane: wyłącznie cancel_token_hash
--
-- SELECT count(*) FROM public.gdpr_deletion_requests
--   WHERE cancel_token_hash !~ '^[a-f0-9]{64}$';
--   -- oczekiwane: 0
