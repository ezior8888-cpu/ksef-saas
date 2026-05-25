-- Migracja 00057: dodaje JPK_V7M do formatów eksportu (Faza 33 Krok 6).
--
-- ALTER TYPE ... ADD VALUE musi być poza blokiem transakcyjnym z innymi
-- DDL — dlatego osobna, minimalna migracja.

ALTER TYPE public.export_format_enum ADD VALUE IF NOT EXISTS 'jpk_v7m';
