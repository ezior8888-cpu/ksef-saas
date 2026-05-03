-- Realtime dla import_jobs (postgres_changes w onboardingu).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'import_jobs już w supabase_realtime - skip';
END
$$;
