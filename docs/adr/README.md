# Architecture Decision Records

Krótkie zapisy "dlaczego tak, a nie inaczej". Czytaj, gdy zastanawiasz się
"czemu to działa w ten sposób" zanim zmienisz coś fundamentalnego.

Format: lekki MADR ([template](./0000-template.md)) — kontekst, decyzja,
konsekwencje, alternatywy. Numerujemy od 0001, statusy: Accepted /
Deprecated / Superseded by ADR-XXXX.

## Spis

| # | Decyzja | Status |
|---|---|---|
| [0001](./0001-rls-jako-single-source-of-truth.md) | RLS jako jedyna granica izolacji tenantów | Accepted |
| [0002](./0002-subscription-per-tenant.md) | Subscription per-tenant, nie per-user | Accepted |
| [0003](./0003-self-invoicing-przez-wlasny-ksef.md) | Self-invoicing przez własny pipeline KSeF | Accepted |
| [0004](./0004-ksef-retry-i-offline24.md) | KSeF retry schedule + Offline24 fallback | Accepted |
| [0005](./0005-2fa-supabase-mfa-native.md) | 2FA przez Supabase MFA native (nie custom) | Accepted |
| [0006](./0006-gdpr-14d-cooling-off.md) | GDPR delete = 14-dniowy cooling-off | Accepted |
| [0007](./0007-backup-free-tier-first.md) | Backup: free-tier R2 first (PITR odłożone) | Accepted |
| [0008](./0008-ocr-polling-nie-sse.md) | Polling statusu OCR (nie SSE) | Accepted |

## Kiedy pisać nowy ADR

- Wybór technologii (np. "czemu Supabase a nie Hasura")
- Wybór wzorca (np. "czemu eventy a nie REST między usługami")
- Świadoma rezygnacja z czegoś (np. "czemu nie wprowadzamy Redux")
- Trade-off, do którego ktoś wróci pytaniem "no ale czemu?"

Nie pisz ADR-a na drobnostki — formatowanie kodu, nazwy zmiennych, wybór
helpera npm. To zostaje w PR description.
