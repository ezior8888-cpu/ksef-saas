# 05 — Co baza oddaje niezalogowanemu

Wygenerowane przez `scripts/security/audit-postgrest-exposure.ts`. **Nie edytuj ręcznie.**

> Skrypt **nie pobiera danych**: pyta z `limit=0` i czyta wyłącznie kod odpowiedzi
> oraz liczbę wierszy z nagłówka. Żaden rekord nie opuszcza bazy.

Data przebiegu: 2026-09-07
Badany projekt: `utuzzxstfcnglppplvlw`
Sprawdzono tabel: 60 (lista wyciągnięta z plików migracji)

## Wynik

| Werdykt | Ile | Co znaczy |
|---|---|---|
| 🔴 OTWARTA | 0 | odpowiedziała danymi niezalogowanemu |
| 🟡 PUSTA-ODPOWIEDŹ | 2 | wpuściła, ale wierszy nie ma (patrz niżej) |
| ✅ ODMOWA | 47 | odmówiła — zachowanie poprawne |
| ⚪ BRAK-TABELI | 11 | nie istnieje albo nie jest wystawiona |
| ⚠ BŁĄD | 0 | nie udało się rozstrzygnąć |

## 🟡 Wpuściła, ale zwróciła zero wierszy

**To jest niejednoznaczne i wymaga rozstrzygnięcia ręcznego.** Zero wierszy może
znaczyć jedno z dwóch, a różnica jest zasadnicza:

1. **Polityka RLS działa** i odfiltrowała wszystko — zachowanie poprawne.
2. **Tabela jest po prostu pusta**, a polityki nie ma wcale. Wtedy pierwszy
   wiersz, który tam trafi, będzie publiczny — i nikt się nie dowie.

Rozróżnia je zapytanie 02 z `scripts/security/sql/` (treść polityk).

| Tabela | Wrażliwa |
|---|---|
| `gdpr_deletion_requests` | nie |
| `mfa_recovery_codes` | nie |

## Pełne zestawienie

| Tabela | Werdykt | HTTP | Kod |
|---|---|---|---|
| `accountant_access` | ODMOWA | 401 | 42501 |
| `accountant_settings` | ODMOWA | 401 | 42501 |
| `admin_user_notes` | ODMOWA | 401 | 42501 |
| `audit_logs` | ODMOWA | 401 | 42501 |
| `backup_log` | ODMOWA | 401 | 42501 |
| `billing_notifications` | ODMOWA | 401 | 42501 |
| `categorization_rules` | ODMOWA | 401 | 42501 |
| `contractors` | ODMOWA | 401 | 42501 |
| `email_bounces` | ODMOWA | 401 | 42501 |
| `email_preferences` | ODMOWA | 401 | 42501 |
| `error_translations` | ODMOWA | 401 | 42501 |
| `expenses` | ODMOWA | 401 | 42501 |
| `export_files` | ODMOWA | 401 | 42501 |
| `export_jobs` | ODMOWA | 401 | 42501 |
| `flo_approvals` | BRAK-TABELI | 404 | PGRST205 |
| `flo_decisions` | BRAK-TABELI | 404 | PGRST205 |
| `flo_kind_flags` | BRAK-TABELI | 404 | PGRST205 |
| `flo_prefs` | BRAK-TABELI | 404 | PGRST205 |
| `flo_proposals` | BRAK-TABELI | 404 | PGRST205 |
| `flo_rollout` | BRAK-TABELI | 404 | PGRST205 |
| `flo_shadow` | BRAK-TABELI | 404 | PGRST205 |
| `flo_usage` | BRAK-TABELI | 404 | PGRST205 |
| `gdpr_deletion_requests` | PUSTA-ODPOWIEDŹ | 200 | — |
| `global_feature_flags` | BRAK-TABELI | 404 | PGRST205 |
| `import_jobs` | ODMOWA | 401 | 42501 |
| `inngest_run_log` | ODMOWA | 401 | 42501 |
| `invoice_line_items` | ODMOWA | 401 | 42501 |
| `invoices` | ODMOWA | 401 | 42501 |
| `kpir_entries` | ODMOWA | 401 | 42501 |
| `kpir_global_rules` | ODMOWA | 401 | 42501 |
| `ksef_health_log` | ODMOWA | 401 | 42501 |
| `ksef_inbox_cursor` | BRAK-TABELI | 404 | PGRST205 |
| `ksef_offline_queue` | ODMOWA | 401 | 42501 |
| `ksef_sessions` | ODMOWA | 401 | 42501 |
| `ksef_submissions` | ODMOWA | 401 | 42501 |
| `memberships` | ODMOWA | 401 | 42501 |
| `mfa_recovery_codes` | PUSTA-ODPOWIEDŹ | 200 | — |
| `newsletter_subscribers` | BRAK-TABELI | 404 | PGRST205 |
| `ocr_jobs` | ODMOWA | 401 | 42501 |
| `organization_invitations` | ODMOWA | 401 | 42501 |
| `organization_join_requests` | ODMOWA | 401 | 42501 |
| `payment_imports` | ODMOWA | 401 | 42501 |
| `payment_reminders` | ODMOWA | 401 | 42501 |
| `payments` | ODMOWA | 401 | 42501 |
| `products` | ODMOWA | 401 | 42501 |
| `push_subscriptions` | ODMOWA | 401 | 42501 |
| `reminder_settings` | ODMOWA | 401 | 42501 |
| `reminder_templates` | ODMOWA | 401 | 42501 |
| `stripe_payments` | ODMOWA | 401 | 42501 |
| `stripe_refunds` | ODMOWA | 401 | 42501 |
| `stripe_webhook_events` | ODMOWA | 401 | 42501 |
| `subscriptions` | ODMOWA | 401 | 42501 |
| `support_conversations` | ODMOWA | 401 | 42501 |
| `support_messages` | ODMOWA | 401 | 42501 |
| `tenant_feature_flags` | ODMOWA | 401 | 42501 |
| `tenants` | ODMOWA | 401 | 42501 |
| `upo_receipts` | ODMOWA | 401 | 42501 |
| `users` | ODMOWA | 401 | 42501 |
| `validation_cache` | ODMOWA | 401 | 42501 |
| `xml_documents` | ODMOWA | 401 | 42501 |

## Jak czytać kody

- **`42501 permission denied`** — odpowiedź POPRAWNA. Tabela istnieje, a odmowa
  nastąpiła na autoryzacji. Dokładnie tego oczekujemy.
- **`PGRST205`** — PostgREST nie widzi tabeli. Albo jej nie ma, albo nie jest
  w wystawionym schemacie, albo cache schematu nie został przeładowany.
- **`200` z wierszami** — tabela oddaje dane komuś, kto się nie zalogował.

## Ograniczenie tego testu

Test pokazuje, co widzi **niezalogowany gość**. Nie odpowiada na pytanie,
czy zalogowany klient A widzi dane klienta B — do tego potrzeba dwóch kont
i to jest osobne narzędzie (`probe-idor.ts`, dzień 5).

Wynik dotyczy **tego projektu**, którego adres podano w pliku `.env`.
Przeniesienie wniosków na inną instalację wymaga powtórzenia przebiegu
z jej zmiennymi — instalacja produkcyjna jest osobna i może się różnić.
