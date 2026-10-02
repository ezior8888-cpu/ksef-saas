-- 00108_flag_require_mfa_sensitive.sql
--
-- AUD-65 (decyzje B10, B13): flaga `requireMfaForSensitive` — gdy włączona,
-- właściciel i admin muszą mieć ukończony drugi krok (AAL2) przy wysyłce do
-- KSeF, wgraniu certyfikatu i płatnościach. Wiersz zakładamy WYŁĄCZONY:
-- włączenie dopiero po zapowiedzi do klientów (jednym UPDATE albo z panelu).
-- Tylko INSERT nowego wiersza, bez zmian istniejących.

INSERT INTO public.global_feature_flags (flag, enabled, note)
VALUES (
  'requireMfaForSensitive',
  false,
  'AAL2 dla owner/admin przy wysyłce KSeF, certyfikacie i płatnościach (AUD-65). Włączyć po zapowiedzi do klientów.'
)
ON CONFLICT (flag) DO NOTHING;
