# ADR-0001: RLS jako jedyna granica izolacji tenantów

- **Status:** Accepted
- **Data:** 2026-01-15
- **Faza:** 1

## Kontekst

Aplikacja multi-tenant — każda firma (tenant) ma własne faktury, kontrahentów,
KSeF credentials. Wymóg podstawowy: tenant A NIGDY nie zobaczy danych tenanta B,
nawet przy błędzie w kodzie aplikacji. Mamy ~50 route handlerów / Server
Actions / RSC pages — szansa na pominięcie `.eq('tenant_id', ...)` w jednym
miejscu przy najlepszym code review jest > 0.

## Decyzja

**RLS (Row Level Security) Postgres jest jedynym źródłem prawdy dla izolacji
tenantów.** Każda tabela z `tenant_id` ma politykę:

```sql
USING (tenant_id IN (
  SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
))
```

W kodzie aplikacji korzystamy z klienta `@supabase/ssr` z aktywną sesją —
RLS działa. Klient `service_role` (omijający RLS) — TYLKO w Inngest jobs
(które same wymuszają `tenant_id`) i admin endpointach (za `ADMIN_EMAILS`
allowlistem).

## Konsekwencje

### Pozytywne

- Błąd w kodzie aplikacji = brak wycieku. Postgres odmówi.
- Audyt bezpieczeństwa zaczyna się od `pg_policies` — jedno miejsce.
- `tests/rls-isolation.test.ts` symuluje 2 tenantów i weryfikuje izolację w CI.

### Negatywne / koszty

- Każde zapytanie ma overhead RLS check (subquery na `memberships`). Mitigant:
  indeks na `memberships(user_id, tenant_id)`, planner zwykle zwija.
- Inngest jobs i admin endpointy MUSZĄ pamiętać o `.eq('tenant_id', ...)` —
  RLS ich nie chroni. Code review na każdy nowy admin endpoint.
- Migracje RLS są kruche — `ALTER TABLE` na produkcji może źle interakcjonować
  z aktywnymi politykami.

### Wymaga

- Każda nowa tabela z `tenant_id` MUSI dostać politykę RLS przed merge
  (PR template ma checklist).
- Wszystkie tabele z `tenant_id` mają RLS włączony (`ENABLE ROW LEVEL SECURITY`).

## Rozważane alternatywy

- **Filtrowanie tylko w aplikacji** — ryzyko jednego błędu = wyciek. Odrzucone.
- **Oddzielny schemat per tenant** — Postgres ma limit ~10k schematów, problemy
  z migracjami across-schema, ORM-y słabo wspierają. Odrzucone.
- **Oddzielna DB per tenant** — koszt nieskalowalny przy MVP (płatne tiery DB).
  Możliwe rozważenie post-launch dla enterprise tier.

## Linki

- [docs/architecture/multi-tenant-rls.md](../architecture/multi-tenant-rls.md)
- Migracje: `00002_rls_policies.sql`, `00037_rls_membership_based.sql`
- Test: `tests/rls-isolation.test.ts`
