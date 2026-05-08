-- Idempotent: po restore z kopii lub rozjazdzie historii migracji mógł zostać
-- stary UNIQUE(nip) jako tenants_nip_key — wtedy INSERT drugiej org z tym samym
-- NIP kończy się 23505 (mimo że kod zakłada model z migracji 00035).
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_nip_key;

NOTIFY pgrst, 'reload schema';
