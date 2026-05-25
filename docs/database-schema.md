# Database Schema (Faza 35)

Przegląd 49 tabel w `public`, pogrupowane domenowo. Referencja dla debugowania
("która tabela trzyma X?") + decyzji architektonicznych (RLS, retencja, indeksy).

**Konwencje:**
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `tenant_id uuid` w każdej tabeli należącej do tenanta — z polityką RLS (zob. [multi-tenant-rls](./architecture/multi-tenant-rls.md))
- `created_at timestamptz DEFAULT now()`, `updated_at timestamptz` z triggerem
- Soft delete: kolumna `deleted_at timestamptz NULL` (gdzie używamy)
- Nazwy: `snake_case`, plural

**Pełne definicje:** `supabase/migrations/*.sql` (źródło prawdy). Lokalne typy:
`types/database.ts` (regenerujemy ręcznie po wgraniu migracji).

---

## 1. Identity & multi-tenant

| Tabela | Po co | Klucze |
|---|---|---|
| `tenants` | Firma / JDG. Jeden tenant = jeden NIP = jedna subskrypcja. | `nip`, `stripe_customer_id`, `organization_id` |
| `users` | Konta Supabase Auth (mirror `auth.users` z metadanymi appki) | `email`, `id` |
| `memberships` | M:N user ↔ tenant z rolą (`owner`/`admin`/`accountant`/`member`) | `user_id`, `tenant_id`, `role` |
| `organization_invitations` | Pending invite (token, expiry) | `token`, `email`, `tenant_id` |
| `organization_join_requests` | Request to join (przed akceptacją owner) | `user_id`, `tenant_id`, `status` |
| `mfa_recovery_codes` | 8 kodów scrypt-hashed na 2FA recovery (Faza 28) | `user_id`, `code_hash`, `used_at` |

**RLS:** standardowa `tenant_id IN memberships` poza `users` (`auth.uid() = id`).

## 2. Invoicing (core)

| Tabela | Po co | Klucze |
|---|---|---|
| `invoices` | Faktura (wychodząca / przychodząca / korekta / zaliczkowa / końcowa) | `tenant_id`, `direction`, `ksef_status`, `ksef_number`, `internal_number` |
| `invoice_line_items` | Pozycje faktury (jedna do wielu) | `invoice_id`, `quantity`, `net_price`, `vat_rate` |
| `contractors` | Kontrahenci / odbiorcy (cache NIP→nazwa) | `tenant_id`, `nip`, `last_used_at`, `vat_status` |
| `products` | Katalog produktów/usług (autocomplete) | `tenant_id`, `code`, `name` |
| `xml_documents` | Faktyczne XML FA(3) — wiersz na każdą wersję | `invoice_id`, `r2_path`, `version` |

**Indeksy hot-path** (Faza 21 + Faza 34):
- `idx_invoices_tenant_direction_status_date` — listy filtrowane
- `idx_invoices_tenant_direction_created` (Faza 34, 00055) — `/invoices` page
- `idx_invoices_inbox` (Faza 34, 00055) — `/inbox` page
- `idx_invoices_tenant_payment_due` partial — overdue

## 3. KSeF infrastruktura

| Tabela | Po co | Klucze |
|---|---|---|
| `ksef_submissions` | Każda próba wysyłki faktury do KSeF (audit pełnego flow) | `invoice_id`, `reference_number`, `status`, `attempt_number` |
| `upo_receipts` | UPO XML z KSeF (potwierdzenia) | `invoice_id`, `upo_xml_path`, `received_at` |
| `ksef_sessions` | Aktywne sesje tokenów KSeF (auth challenge → session token) | `tenant_id`, `expires_at` |
| `ksef_offline_queue` | Faktury w trybie Offline24 (KSeF down > 1h) | `invoice_id`, `deadline`, `status` |
| `ksef_health_log` | Snapshoty zdrowia KSeF (cron co 30s, Faza 23) | `checked_at`, `status` |
| `error_translations` | Polskie tłumaczenia kodów błędów KSeF | `code`, `pl_message` |
| `validation_cache` | Cache wyników walidacji NIP (GUS / KSeF) | `nip`, `vat_status`, `checked_at` |

## 4. Expenses & KPiR

| Tabela | Po co | Klucze |
|---|---|---|
| `expenses` | Wydatek (paragon / faktura kosztowa) | `tenant_id`, `image_path`, `ocr_job_id`, `is_reviewed`, `kpir_column` |
| `ocr_jobs` | Stan jobu OCR (pending/processing/done/error) | `tenant_id`, `status`, `image_path` |
| `categorization_rules` | Reguły auto-kategoryzacji per-tenant | `tenant_id`, `seller_pattern`, `kpir_column` |
| `kpir_global_rules` | Wbudowane reguły (np. "Orlen" → paliwo) | `seller_pattern`, `kpir_column` |
| `kpir_entries` | Wpis do KPiR (księga przychodów i rozchodów) | `tenant_id`, `month`, `kpir_column`, `expense_id` |

## 5. Imports & exports

| Tabela | Po co | Klucze |
|---|---|---|
| `import_jobs` | Bulk import (CSV / Magic Import z Fakturowni etc.) | `tenant_id`, `source`, `status`, `progress` |
| `export_jobs` | Generowanie eksportu (KPiR, JPK, PDF zip) | `tenant_id`, `kind`, `status` |
| `export_files` | Plik wynikowy w R2 (czas życia limitowany) | `export_job_id`, `r2_path`, `expires_at` |
| `payment_imports` | Import wyciągów bankowych (CSV) | `tenant_id`, `bank_format`, `status` |

## 6. Payments & reminders

| Tabela | Po co | Klucze |
|---|---|---|
| `payments` | Płatność powiązana z fakturą (auto-match po kwocie+NIP) | `invoice_id`, `amount`, `paid_at` |
| `payment_reminders` | Wysłane upomnienia o płatność | `invoice_id`, `kind`, `sent_at` |
| `reminder_settings` | Konfiguracja per-tenant (kiedy/komu/jak przypominać) | `tenant_id`, `days_before`, `days_after` |
| `reminder_templates` | Szablony emaili (custom per-tenant) | `tenant_id`, `kind`, `subject`, `body` |

## 7. Billing (Stripe — Faza 25)

| Tabela | Po co | Klucze |
|---|---|---|
| `subscriptions` | Aktywna subskrypcja per-tenant | `tenant_id`, `stripe_subscription_id`, `status`, `trial_ends_at` |
| `stripe_payments` | Każda płatność | `tenant_id`, `stripe_payment_intent_id`, `amount` |
| `stripe_refunds` | Zwroty (admin akcje) | `stripe_payment_id`, `amount`, `reason` |
| `stripe_webhook_events` | Idempotency log webhooków Stripe | `stripe_event_id` PK, `processed_at` |
| `billing_notifications` | Idempotency dla emaili billing (trial countdown, dunning) | `tenant_id`, `kind`, `entity_id` |

## 8. Komunikacja

| Tabela | Po co | Klucze |
|---|---|---|
| `email_preferences` | Opt-in/out per kategoria (transactional zawsze ON) | `user_id`, `category`, `subscribed` |
| `email_bounces` | Bounce log z Resend webhook (auto-deactivate po hard bounce) | `email`, `kind`, `received_at` |
| `support_conversations` | Konwersacje AI support chat (Faza 30) | `tenant_id`, `user_id`, `status`, `category` |
| `support_messages` | Wiadomości w konwersacji (user/assistant) | `conversation_id`, `role`, `content` |
| `push_subscriptions` | Web Push subscriptions (PWA) | `user_id`, `endpoint`, `keys` |
| `accountant_access` | Token-based portal księgowej (zewnętrzny dostęp) | `tenant_id`, `token`, `expires_at` |
| `accountant_settings` | Konfiguracja portalu (uprawnienia, eksporty) | `tenant_id`, `permissions` |

## 9. Admin & compliance

| Tabela | Po co | Klucze |
|---|---|---|
| `admin_user_notes` | Notatki admina o userze (CRM-light) | `user_id`, `note`, `created_by` |
| `audit_logs` | Każda istotna akcja (przed-/po-, hash, immutable) | `tenant_id`, `actor_id`, `event`, `created_at` |
| `gdpr_deletion_requests` | Żądania usunięcia konta (14-d cooling-off, Faza 28) | `user_id`, `status`, `scheduled_for` |
| `backup_log` | Każdy snapshot DB (Faza 29) | `started_at`, `status`, `r2_path`, `sha256` |
| `tenant_feature_flags` | Flagi per-tenant (override globalnego Edge Config) | `tenant_id`, `flag_key`, `enabled` |

**Ważne:** `audit_logs` ma trigger blokujący UPDATE/DELETE (Faza 28 / 00052). Anonimizacja przez RPC `anonymize_user_audit_logs`.

## 10. Background jobs

| Tabela | Po co | Klucze |
|---|---|---|
| `inngest_run_log` | Każdy run Inngest (dla debugu + monitoringu) | `function_id`, `run_id`, `status`, `created_at` |

**Indeks BRIN** na `created_at` (Faza 21) — append-only, BRIN > B-tree dla zapytań po zakresie czasu.

---

## Materialized views (Faza 21)

| MV | Po co | Refresh |
|---|---|---|
| `mv_tenant_dashboard_summary` | Pre-agregaty dla `/dashboard` (1 wiersz / tenant) | hourly cron + Redis cache 5 min |
| `mv_tenant_monthly_stats` | Statystyki miesięczne (wykresy YTD) | hourly cron |

Refresh przez `refresh_dashboard_materialized_views()` RPC,
cron `refreshMaterializedViewsJob` (Inngest).

## ENUM-y

| Enum | Wartości |
|---|---|
| `categorization_method` | `manual` / `auto_rule` / `auto_ai` |
| `expense_source` | `manual` / `ocr_photo` / `ksef_invoice` / `import` |
| `kpir_column` | 7-16 kolumn KPiR (towary, koszty, wynagrodzenia, ...) |
| `ocr_status` | `pending` / `processing` / `done` / `error` |
| `validation_source_enum` | `gus` / `ksef` / `vies` / `cache` |
| `vat_status_enum` | `active` / `inactive` / `unknown` |
| + ENUM-y Stripe/email | dodane w 00047, 00049 |

## Retencja

| Domena | Polityka |
|---|---|
| Faktury (`invoices`, `xml_documents`, `upo_receipts`) | **10 lat** (prawo RP) |
| `audit_logs` | **10 lat** (prawo) — cleanup tylko anonimizacja po deletion request |
| `ocr_jobs` (oryginał zdjęcia) | 10 lat (dokument KPiR) |
| `ksef_health_log` | 90 dni |
| `inngest_run_log` | 30 dni (cleanup cron Faza 21) |
| `stripe_webhook_events` | 90 dni |
| `backup_log` | 30 dni (rotated) |

Cleanup runs: `cleanupAuditLogsJob`, `cleanupOldBackupsJob`, `retentionDelete` (Inngest crony).
