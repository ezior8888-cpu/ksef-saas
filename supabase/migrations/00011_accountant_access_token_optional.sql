-- Aplikacja zapisuje tylko token_hash (SHA-256), nie plaintext tokenu.
-- Jeśli wcześniej dodano kolumnę `token` jako NOT NULL (np. z innego SQL),
-- INSERT bez `token` się wywala — kolumnę czynimy opcjonalną albo usuwamy.

ALTER TABLE public.accountant_access
  DROP CONSTRAINT IF EXISTS accountant_access_token_key;

ALTER TABLE public.accountant_access
  DROP CONSTRAINT IF EXISTS accountant_access_token_unique;

DO $fix$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'accountant_access'
      AND column_name = 'token'
  ) THEN
    EXECUTE 'ALTER TABLE public.accountant_access ALTER COLUMN token DROP NOT NULL';
    EXECUTE 'COMMENT ON COLUMN public.accountant_access.token IS ' ||
      quote_literal(
        'Opcjonalne (deprecated). Źródło prawdy: token_hash. Nie wstawiaj plaintext.'
      );
  END IF;
END $fix$;
