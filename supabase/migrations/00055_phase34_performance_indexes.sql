-- ═══════════════════════════════════════════════════════════════
-- Faza 34 — Load Testing: indeksy pod hot-path listy faktur
-- ═══════════════════════════════════════════════════════════════
-- Cel: domknąć dwa zapytania listujące, które przy 1000 concurrent users
-- robiły sort w pamięci, bo istniejące indeksy (Faza 21, 00044) nie pokrywały
-- ich klauzul ORDER BY.
--
-- Audyt indeksów Fazy 34 potwierdził, że schemat jest poza tym dobrze
-- zaindeksowany — to jedyne realne braki na ścieżkach bitych przez loadtest.
-- Indeksy `IF NOT EXISTS`, plain CREATE (tabele przed launchem są małe,
-- krótki lock akceptowalny) — spójnie z konwencją 00044.
--
--   1. /invoices  — WHERE tenant_id, direction='outgoing' ORDER BY created_at DESC
--   2. /inbox     — WHERE tenant_id, direction='incoming'
--                   ORDER BY ksef_accepted_at DESC NULLS LAST, created_at DESC
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Lista faktur wychodzących (app/(dashboard)/invoices/page.tsx) ──
-- Istniejący idx_invoices_tenant_created (tenant_id, created_at) nie zawiera
-- `direction`, więc Postgres skanuje też faktury przychodzące i odfiltrowuje
-- je po fakcie. Dołożenie `direction` daje czysty index range scan + LIMIT.
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_direction_created
  ON public.invoices (tenant_id, direction, created_at DESC);

-- ─── 2. Skrzynka faktur przychodzących (app/(dashboard)/inbox/page.tsx) ──
-- ORDER BY jest po `ksef_accepted_at` (NULLS LAST) — żaden istniejący indeks
-- tego nie pokrywał, stąd sort 200 wierszy przy każdym wejściu na /inbox.
-- Kolejność NULLS LAST w indeksie musi zgadzać się z zapytaniem, inaczej
-- planner i tak dorzuci sort.
CREATE INDEX IF NOT EXISTS idx_invoices_inbox
  ON public.invoices (
    tenant_id,
    direction,
    ksef_accepted_at DESC NULLS LAST,
    created_at DESC
  );
