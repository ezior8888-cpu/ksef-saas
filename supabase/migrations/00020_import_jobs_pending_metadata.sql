-- Rozszerzenie import_jobs: status pending, metadane pliku, kto uruchomił.

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_status_check;

ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_status_check
  CHECK (status IN (
    'pending',
    'queued',
    'parsing',
    'extracting',
    'deduplicating',
    'completed',
    'failed'
  ));

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS triggered_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_filename TEXT,
  ADD COLUMN IF NOT EXISTS source_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS source_file_path TEXT;

COMMENT ON COLUMN public.import_jobs.triggered_by IS 'Użytkownik, który uruchomił import (onboarding / UI).';
COMMENT ON COLUMN public.import_jobs.source_filename IS 'Oryginalna nazwa wgranego pliku (import z pliku).';
COMMENT ON COLUMN public.import_jobs.source_file_path IS 'Klucz obiektu w R2 po uploadzie.';
