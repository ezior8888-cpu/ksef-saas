-- Audyt #14: idempotentny INSERT export_files.
--
-- W `lib/inngest/jobs/exports-generate.ts` step `persist` używa
--   .upsert(..., { onConflict: 'export_job_id,filename' })
-- by wytrzymać at-least-once retry Inngestu — bez UNIQUE INDEX
-- Postgres nie wie, na czym ma robić ON CONFLICT, i zwraca błąd
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Jeden wiersz `export_files` per (export_job_id, filename) — natural key,
-- bo każdy job generuje plik z deterministyczną nazwą per format
-- (`JPK_FA_<nip>_<period>.xml`, `KPiR_<nip>_<period>.xlsx`, ...).
--
-- Po zaaplikowaniu tej migracji, ponowne wykonanie `persist` po crashu między
-- INSERT-em a UPDATE-em export_jobs nie wybucha 23505 — UPSERT idempotentnie
-- aktualizuje wiersz tymi samymi metadanymi (deterministyczny generator
-- gwarantuje ten sam SHA-256, więc UPDATE jest no-opem).

CREATE UNIQUE INDEX IF NOT EXISTS uq_export_files_job_filename
  ON public.export_files (export_job_id, filename);

COMMENT ON INDEX public.uq_export_files_job_filename IS
  'Idempotencja UPSERT w Inngest jobie exports-generate (krok persist).';
