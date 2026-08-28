-- Migracja 00063: ciągłość pobierania skrzynki KSeF + widełki kwotowe reguł.
--
-- Dwie rzeczy potrzebne funkcjom W-02 i W-03 agenta FLO (kroki 19-20 planu).
--
-- 1. ksef_inbox_cursor — utrwalony kursor paginacji.
--    Pobieranie skrzynki chodzi po stronach przez `continuationToken`. Gdy
--    proces zginie w połowie (restart kontenera, timeout, 5xx z MF), dziś
--    zaczyna od zera przy następnym przebiegu — a jeśli okno dat już się
--    przesunęło, część faktur kosztowych NIGDY nie trafia do klienta.
--    Brakujący koszt to zawyżony podatek: klient traci pieniądze i nawet
--    nie wie, że ma czego szukać.
--
-- 2. widełki kwotowe w categorization_rules.
--    Reguła „Media Markt → towary handlowe" nauczona na jednym zakupie
--    zaczyna księgować tak samo laptop za osiem tysięcy. Reguła bez widełek
--    jest zgadywaniem na podstawie jednego przypadku.

CREATE TABLE IF NOT EXISTS public.ksef_inbox_cursor (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Token paginacji z ostatniej UDANEJ strony. NULL = zacznij od początku okna.
  continuation_token TEXT,
  -- Okno dat, którego dotyczy token. Zmiana okna unieważnia kursor —
  -- token z innego zapytania nie ma sensu.
  window_from TIMESTAMPTZ,
  window_to TIMESTAMPTZ,
  -- Ile pozycji KSeF zapowiedział, ile realnie zapisaliśmy. Rozjazd oznacza
  -- zgubione dokumenty i jest jedynym sygnałem, jaki dostaniemy.
  announced_count INTEGER NOT NULL DEFAULT 0,
  saved_count INTEGER NOT NULL DEFAULT 0,
  last_page_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ksef_inbox_cursor ENABLE ROW LEVEL SECURITY;

-- Dane operatorskie: klient nie ma powodu oglądać kursora paginacji.
-- RLS włączony bez polityki SELECT = odmowa dla wszystkich poza service_role.

REVOKE INSERT, UPDATE, DELETE ON public.ksef_inbox_cursor FROM authenticated;
REVOKE ALL ON public.ksef_inbox_cursor FROM anon;

-- ═══════════════════════════════════════════════════════════════
-- Widełki kwotowe reguł kategoryzacji
-- ═══════════════════════════════════════════════════════════════

-- NULL po obu stronach = reguła bez ograniczeń (tak działają wszystkie
-- istniejące). Nowe reguły uczone przez agenta zawsze dostają widełki.
ALTER TABLE public.categorization_rules
  ADD COLUMN IF NOT EXISTS min_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS max_amount NUMERIC(12, 2);

COMMENT ON COLUMN public.categorization_rules.min_amount IS
  'Dolna granica kwoty brutto, przy której reguła obowiązuje. NULL = bez granicy. '
  'Wydatek poza widełkami uruchamia pytanie MIMO istnienia reguły — reguła '
  'nauczona na zakupie za 200 zł nie ma prawa księgować sama zakupu za 8000 zł.';

COMMENT ON COLUMN public.categorization_rules.max_amount IS
  'Górna granica kwoty brutto. NULL = bez granicy.';
