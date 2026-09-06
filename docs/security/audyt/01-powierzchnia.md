# 01 — Powierzchnia ataku

Wygenerowane przez `scripts/security/inventory-entrypoints.ts`.
**Nie edytuj ręcznie** — przy kolejnym przebiegu zmiany przepadną.
Wnioski i ustalenia idą do `REJESTR-USTALEN.md`.

Data przebiegu: 2026-09-06

## Podsumowanie

| Rodzaj wejścia | Ile |
|---|---|
| Route handlery (`route.ts`) | 19 |
| Pliki z akcjami serwerowymi | 22 |
| Strony z parametrem w URL | 8 |
| Pozostałe strony | 49 |
| **Razem wejść** | **99** |

| Ryzyko | Ile |
|---|---|
| 🔴 krytyczne | 1 |
| 🟠 wysokie | 3 |
| 🟡 średnie | 7 |
| ⚪ do przejrzenia | 4 |
| ✅ ok | 84 |

## Do przeczytania ręcznie

| Ryzyko | Plik | Kto powinien wejść | Ochrona | Klient bazy | Na czym polega podejrzenie |
|---|---|---|---|---|---|
| 🔴 krytyczne | `app/actions/newsletter.ts` | czlonek organizacji | — | **omija RLS** ×1 | OMIJA-RLS-BEZ-STRAŻNIKA: w pliku nie ma żadnego strażnika. Prześledzić, skąd bierze się `tenantId`.<br><br>AKCJA-BEZ-TOŻSAMOŚCI: akcja serwerowa bez `auth.getUser()` i bez strażnika. Układ strony jej NIE chroni — akcje wchodzą bezpośrednio po POST. |
| 🟠 wysokie | `app/(dashboard)/invoices/new/actions.ts` | czlonek organizacji | — | — | AKCJA-BEZ-TOŻSAMOŚCI: akcja serwerowa bez `auth.getUser()` i bez strażnika. Układ strony jej NIE chroni — akcje wchodzą bezpośrednio po POST. |
| 🟠 wysokie | `app/api/health/route.ts` | publiczny | — | **omija RLS** ×1 | OMIJA-RLS-BEZ-STRAŻNIKA: w pliku nie ma żadnego strażnika. Prześledzić, skąd bierze się `tenantId`.<br><br>ROUTE-BEZ-TOŻSAMOŚCI: route handler dotykający danych najemcy bez sprawdzenia sesji. |
| 🟠 wysokie | `app/api/status/components/route.ts` | publiczny | — | **omija RLS** ×1 | OMIJA-RLS-BEZ-STRAŻNIKA: w pliku nie ma żadnego strażnika. Prześledzić, skąd bierze się `tenantId`.<br><br>ROUTE-BEZ-TOŻSAMOŚCI: route handler dotykający danych najemcy bez sprawdzenia sesji. |
| 🟡 średnie | `app/accountant/[token]/download/[invoiceId]/route.ts` | token bez logowania | `token` | **omija RLS** ×1 | IDOR: identyfikator z URL-a (token, invoiceId) trafia do zapytania omijającego RLS. Sprawdzić, czy zapytanie filtruje po `tenant_id` ze strażnika. |
| 🟡 średnie | `app/admin/users/[userId]/billing-actions.ts` | operator platformy | `requireAdmin` `sprawdza members` | **omija RLS** ×2 | IDOR: identyfikator z URL-a (userId) trafia do zapytania omijającego RLS. Sprawdzić, czy zapytanie filtruje po `tenant_id` ze strażnika. |
| 🟡 średnie | `app/api/dev/posthog-test/route.ts` | publiczny | — | — | BŁĄD-DO-KLIENTA: treść wyjątku wraca w odpowiedzi HTTP. Komunikat potrafi zawierać nazwę tabeli, fragment zapytania albo ścieżkę na serwerze.<br><br>TRASA-DEWELOPERSKA: sprawdzić, czy odpowiada na produkcji (dzień 5). |
| 🟡 średnie | `app/api/email/resend-webhook/route.ts` | podpis webhooka | `podpis` | **omija RLS** ×4 | BŁĄD-DO-KLIENTA: treść wyjątku wraca w odpowiedzi HTTP. Komunikat potrafi zawierać nazwę tabeli, fragment zapytania albo ścieżkę na serwerze. |
| 🟡 średnie | `app/api/portal/exports/generate/route.ts` | publiczny | `token` | **omija RLS** ×1 | BŁĄD-DO-KLIENTA: treść wyjątku wraca w odpowiedzi HTTP. Komunikat potrafi zawierać nazwę tabeli, fragment zapytania albo ścieżkę na serwerze. |
| 🟡 średnie | `app/api/stripe/webhook/route.ts` | podpis webhooka | `podpis` | — | BŁĄD-DO-KLIENTA: treść wyjątku wraca w odpowiedzi HTTP. Komunikat potrafi zawierać nazwę tabeli, fragment zapytania albo ścieżkę na serwerze. |
| 🟡 średnie | `app/invite/[token]/page.tsx` | token bez logowania | `token` `auth.getUser` | **omija RLS** ×1 | IDOR: identyfikator z URL-a (token) trafia do zapytania omijającego RLS. Sprawdzić, czy zapytanie filtruje po `tenant_id` ze strażnika. |
| ⚪ do przejrzenia | `app/api/dev/load-test-session/route.ts` | publiczny | — | — | TRASA-DEWELOPERSKA: sprawdzić, czy odpowiada na produkcji (dzień 5). |
| ⚪ do przejrzenia | `app/api/sentry-example-api/route.ts` | publiczny | — | — | TRASA-DEWELOPERSKA: sprawdzić, czy odpowiada na produkcji (dzień 5). |
| ⚪ do przejrzenia | `app/api/sentry-test-log/route.ts` | publiczny | — | — | TRASA-DEWELOPERSKA: sprawdzić, czy odpowiada na produkcji (dzień 5). |
| ⚪ do przejrzenia | `app/sentry-example-page/page.tsx` | publiczny | — | — | TRASA-DEWELOPERSKA: sprawdzić, czy odpowiada na produkcji (dzień 5). |

## Pełna mapa

| Plik | URL | Rodzaj | Parametry | Eksporty | Kto powinien wejść | Ochrona | Klient bazy |
|---|---|---|---|---|---|---|---|
| `app/(auth)/forgot-password/actions.ts` | /forgot-password | server-action | — | requestPasswordReset | publiczny | — | RLS ×1 |
| `app/(auth)/forgot-password/page.tsx` | /forgot-password | page | — | — | publiczny | — | — |
| `app/(auth)/gdpr/cancel/page.tsx` | /gdpr/cancel | page | — | — | publiczny | — | — |
| `app/(auth)/login/actions.ts` | /login | server-action | — | loginWithEmail, loginWithGoogle, signOut | publiczny | `auth.getUser` | RLS ×3 |
| `app/(auth)/login/page.tsx` | /login | page | — | — | publiczny | — | — |
| `app/(auth)/login/two-factor/actions.ts` | /login/two-factor | server-action | — | verifyMfaChallengeAction | publiczny | `auth.getUser` | RLS ×1 |
| `app/(auth)/login/two-factor/page.tsx` | /login/two-factor | page | — | — | publiczny | `auth.getUser` | RLS ×1 |
| `app/(auth)/register/actions.ts` | /register | server-action | — | signupWithEmail | publiczny | — | RLS ×1 |
| `app/(auth)/register/page.tsx` | /register | page | — | — | publiczny | — | — |
| `app/(dashboard)/contractors/page.tsx` | /contractors | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/dashboard/page.tsx` | /dashboard | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/expenses/[id]/page.tsx` | /expenses/[id] | page-dynamic | id | — | czlonek organizacji | `układ: auth.getUser` | RLS ×1 |
| `app/(dashboard)/expenses/page.tsx` | /expenses | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/flo/page.tsx` | /flo | page | — | — | czlonek organizacji | `układ: auth.getUser` | — |
| `app/(dashboard)/flo/wrapped/page.tsx` | /flo/wrapped | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/import-danych/page.tsx` | /import-danych | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/inbox/page.tsx` | /inbox | page | — | — | czlonek organizacji | `układ: auth.getUser` | RLS ×1 |
| `app/(dashboard)/invoices/[id]/page.tsx` | /invoices/[id] | page-dynamic | id | — | czlonek organizacji | `układ: auth.getUser` | RLS ×1 |
| `app/(dashboard)/invoices/[id]/upo-actions.ts` | /invoices/[id] | server-action | id | getUpoPdfAction, getUpoXmlAction | czlonek organizacji | `auth.getUser` | RLS ×2 |
| `app/(dashboard)/invoices/new/actions.ts` | /invoices/new | server-action | — | — | czlonek organizacji | — | — |
| `app/(dashboard)/invoices/new/advance/page.tsx` | /invoices/new/advance | page | — | — | czlonek organizacji | `układ: auth.getUser` | — |
| `app/(dashboard)/invoices/new/correction/page.tsx` | /invoices/new/correction | page | — | — | czlonek organizacji | `układ: auth.getUser` | RLS ×1 |
| `app/(dashboard)/invoices/new/final/page.tsx` | /invoices/new/final | page | — | — | czlonek organizacji | `układ: auth.getUser` | RLS ×1 |
| `app/(dashboard)/invoices/new/page.tsx` | /invoices/new | page | — | — | czlonek organizacji | `układ: auth.getUser` | — |
| `app/(dashboard)/invoices/new/regular/page.tsx` | /invoices/new/regular | page | — | — | czlonek organizacji | `układ: auth.getUser` | — |
| `app/(dashboard)/invoices/page.tsx` | /invoices | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/payments/overdue/page.tsx` | /payments/overdue | page | — | — | czlonek organizacji | `układ: auth.getUser` `auth.getUser` | RLS ×1 |
| `app/(dashboard)/przeplywy/page.tsx` | /przeplywy | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/reports/exports/page.tsx` | /reports/exports | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/reports/kpir/page.tsx` | /reports/kpir | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/reports/page.tsx` | /reports | page | — | — | czlonek organizacji | `układ: auth.getUser` | — |
| `app/(dashboard)/settings/account/actions.ts` | /settings/account | server-action | — | requestGdprDeletionAction | czlonek organizacji | `auth.getUser` | RLS ×1 |
| `app/(dashboard)/settings/account/page.tsx` | /settings/account | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/settings/accountant/page.tsx` | /settings/accountant | page | — | — | czlonek organizacji | `getPageContextWithRole` `układ: auth.getUser` | — |
| `app/(dashboard)/settings/audit/page.tsx` | /settings/audit | page | — | — | czlonek organizacji | `układ: auth.getUser` | RLS ×1 |
| `app/(dashboard)/settings/billing/actions.ts` | /settings/billing | server-action | — | startCheckoutAction, openCustomerPortalAction | czlonek organizacji | `getPageContext` | **omija RLS** ×2 |
| `app/(dashboard)/settings/billing/page.tsx` | /settings/billing | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/settings/flo/page.tsx` | /settings/flo | page | — | — | czlonek organizacji | `układ: auth.getUser` | — |
| `app/(dashboard)/settings/ksef/page.tsx` | /settings/ksef | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/settings/notifications/email-actions.ts` | /settings/notifications | server-action | — | toggleEmailCategoryAction | czlonek organizacji | `auth.getUser` | RLS ×1 |
| `app/(dashboard)/settings/notifications/page.tsx` | /settings/notifications | page | — | — | czlonek organizacji | `układ: auth.getUser` `auth.getUser` | RLS ×1 |
| `app/(dashboard)/settings/page.tsx` | /settings | page | — | — | czlonek organizacji | `getPageContext` `układ: auth.getUser` | — |
| `app/(dashboard)/settings/reminders/page.tsx` | /settings/reminders | page | — | — | czlonek organizacji | `getPageContextWithRole` `układ: auth.getUser` | — |
| `app/(dashboard)/settings/security/actions.ts` | /settings/security | server-action | — | changePasswordAction, enrollTotpAction, verifyTotpEnrollmentAction, unenrollTotpAction, regenerateRecoveryCodesAction | czlonek organizacji | `auth.getUser` | RLS ×5 |
| `app/(dashboard)/settings/security/page.tsx` | /settings/security | page | — | — | czlonek organizacji | `układ: auth.getUser` `auth.getUser` | RLS ×1 |
| `app/(dashboard)/settings/team/page.tsx` | /settings/team | page | — | — | czlonek organizacji | `getPageContextWithRole` `układ: auth.getUser` | **omija RLS** ×1 |
| `app/(landing)/about/page.tsx` | /about | page | — | — | publiczny | — | — |
| `app/(landing)/blog/page.tsx` | /blog | page | — | — | publiczny | — | — |
| `app/(landing)/page.tsx` | / | page | — | — | publiczny | — | — |
| `app/(marketing)/blog/[slug]/page.tsx` | /blog/[slug] | page-dynamic | slug | — | publiczny | — | — |
| `app/(marketing)/pomoc/[slug]/page.tsx` | /pomoc/[slug] | page-dynamic | slug | — | publiczny | — | — |
| `app/accountant/[token]/download/[invoiceId]/route.ts` | /accountant/[token]/download/[invoiceId] | route-handler | token, invoiceId | GET | token bez logowania | `token` | **omija RLS** ×1 |
| `app/accountant/[token]/page.tsx` | /accountant/[token] | page-dynamic | token | — | token bez logowania | — | — |
| `app/actions/expenses.ts` | /actions | server-action | — | uploadExpensePhotoAction, getOcrJobStatusAction, reviewExpenseAction, deleteExpenseAction | czlonek organizacji | `requireUserAndActiveOrg` `⚠ getActiveOrgIdFromCookies` | mieszane (RLS ×2, omija ×1) |
| `app/actions/exports.ts` | /actions | server-action | — | startExportAction, downloadExportFileAction, updateAccountantSettingsAction, triggerCoPilotNowAction | czlonek organizacji | `requireUserAndTenant` `requireOrgRole` | — |
| `app/actions/flo.ts` | /actions | server-action | — | listProposals, listScheduled, approveProposal, dismissProposal, undoAction, cancelScheduled, getPrefs, savePrefs | czlonek organizacji | `requireUserAndActiveOrg` | — |
| `app/actions/newsletter.ts` | /actions | server-action | — | subscribeNewsletterAction | czlonek organizacji | — | **omija RLS** ×1 |
| `app/actions/organizations.ts` | /actions | server-action | — | setActiveOrganizationAction, createOrganizationAction, skipOnboardingWithoutNipAction, completeCompanyNipAction, inviteMemberAction, revokeInvitationAction, acceptInvitationAction, requestJoinAction, approveJoinRequestAction, denyJoinRequestAction, revokeMembershipAction, changeMembershipRoleAction, markPostRegisterMagicImportConsumedAction, listMyOrganizations | czlonek organizacji | `requireOrgRole` `sprawdza members` `token` | mieszane (RLS ×3, omija ×5) |
| `app/actions/push-subscriptions.ts` | /actions | server-action | — | subscribePushAction, unsubscribePushAction, updatePushPreferencesAction | czlonek organizacji | `auth.getUser` `⚠ getActiveOrgIdFromCookies` | RLS ×3 |
| `app/actions/reminders.ts` | /actions | server-action | — | triggerManualReminderAction, toggleInvoiceRemindersAction, updateReminderSettingsAction, toggleContractorRemindersAction | czlonek organizacji | `requireUserAndTenant` `requireOrgRole` | — |
| `app/actions/validation.ts` | /actions | server-action | — | validateNipLiveAction, validateBankAccountAction, bulkValidateContractorsAction, getContractorVatStatusAction | czlonek organizacji | `auth.getUser` `⚠ getActiveOrgIdFromCookies` | RLS ×4 |
| `app/admin/audit/page.tsx` | /admin/audit | page | — | — | operator platformy | `układ: requireAdmin` | — |
| `app/admin/flags/actions.ts` | /admin/flags | server-action | — | toggleTenantFlagAction | operator platformy | `requireAdmin` | **omija RLS** ×1 |
| `app/admin/flags/page.tsx` | /admin/flags | page | — | — | operator platformy | `układ: requireAdmin` | — |
| `app/admin/flo/page.tsx` | /admin/flo | page | — | — | operator platformy | `układ: requireAdmin` | — |
| `app/admin/page.tsx` | /admin | page | — | — | operator platformy | `układ: requireAdmin` | — |
| `app/admin/support/page.tsx` | /admin/support | page | — | — | operator platformy | `układ: requireAdmin` | — |
| `app/admin/system/page.tsx` | /admin/system | page | — | — | operator platformy | `układ: requireAdmin` | — |
| `app/admin/users/[userId]/billing-actions.ts` | /admin/users/[userId] | server-action | userId | issueRefundAction, listUserPayments | operator platformy | `requireAdmin` `sprawdza members` | **omija RLS** ×2 |
| `app/admin/users/[userId]/page.tsx` | /admin/users/[userId] | page-dynamic | userId | — | operator platformy | `układ: requireAdmin` | — |
| `app/admin/users/actions.ts` | /admin/users | server-action | — | suspendUserAction, unsuspendUserAction, forceLogoutAction, sendPasswordResetAction, deleteUserGdprAction, addUserNoteAction, archiveUserNoteAction | operator platformy | `requireAdmin` `sprawdza members` | **omija RLS** ×7 |
| `app/admin/users/page.tsx` | /admin/users | page | — | — | operator platformy | `układ: requireAdmin` | — |
| `app/api/dev/load-test-session/route.ts` | /api/dev/load-test-session | route-handler | — | POST | publiczny | — | — |
| `app/api/dev/posthog-test/route.ts` | /api/dev/posthog-test | route-handler | — | GET | publiczny | — | — |
| `app/api/email/resend-webhook/route.ts` | /api/email/resend-webhook | route-handler | — | POST | podpis webhooka | `podpis` | **omija RLS** ×4 |
| `app/api/email/unsubscribe/route.ts` | /api/email/unsubscribe | route-handler | — | GET, POST | publiczny | — | — |
| `app/api/gdpr/export/route.ts` | /api/gdpr/export | route-handler | — | GET | zalogowany | `auth.getUser` | RLS ×1 |
| `app/api/health/route.ts` | /api/health | route-handler | — | GET | publiczny | — | **omija RLS** ×1 |
| `app/api/inngest/route.ts` | /api/inngest | route-handler | — | — | wewnetrzny (Inngest) | — | — |
| `app/api/invoices/[id]/pdf/route.ts` | /api/invoices/[id]/pdf | route-handler | id | GET | zalogowany | `resolveApiUserAndActiveOrg` | — |
| `app/api/invoices/batch-pdf/route.ts` | /api/invoices/batch-pdf | route-handler | — | GET | zalogowany | `resolveApiUserAndActiveOrg` | **omija RLS** ×1 |
| `app/api/ksef/health/route.ts` | /api/ksef/health | route-handler | — | GET | publiczny | — | — |
| `app/api/portal/exports/generate/route.ts` | /api/portal/exports/generate | route-handler | — | POST | publiczny | `token` | **omija RLS** ×1 |
| `app/api/sentry-example-api/route.ts` | /api/sentry-example-api | route-handler | — | GET | publiczny | — | — |
| `app/api/sentry-test-log/route.ts` | /api/sentry-test-log | route-handler | — | GET | publiczny | — | — |
| `app/api/status/components/route.ts` | /api/status/components | route-handler | — | GET | publiczny | — | **omija RLS** ×1 |
| `app/api/stripe/webhook/route.ts` | /api/stripe/webhook | route-handler | — | POST | podpis webhooka | `podpis` | — |
| `app/api/support/chat/route.ts` | /api/support/chat | route-handler | — | POST | zalogowany | `auth.getUser` `⚠ getActiveOrgIdFromCookies` | RLS ×1 |
| `app/auth/callback/route.ts` | /auth/callback | route-handler | — | GET | publiczny | — | RLS ×1 |
| `app/auth/finish/page.tsx` | /auth/finish | page | — | — | publiczny | — | RLS ×1 |
| `app/invite/[token]/page.tsx` | /invite/[token] | page-dynamic | token | — | token bez logowania | `token` `auth.getUser` | **omija RLS** ×1 |
| `app/onboarding/import-source/page.tsx` | /onboarding/import-source | page | — | — | zalogowany | `sprawdza members` `auth.getUser` `⚠ getActiveOrgIdFromCookies` | **omija RLS** ×1 |
| `app/onboarding/magic-import/actions.ts` | /onboarding/magic-import | server-action | — | startMagicImportAction, skipMagicImportAction, startFileImportAction | zalogowany | `auth.getUser` `⚠ getActiveOrgIdFromCookies` | RLS ×2 |
| `app/onboarding/magic-import/page.tsx` | /onboarding/magic-import | page | — | — | zalogowany | `sprawdza members` `auth.getUser` `⚠ getActiveOrgIdFromCookies` | **omija RLS** ×1 |
| `app/onboarding/page.tsx` | /onboarding | page | — | — | zalogowany | `auth.getUser` | RLS ×1 |
| `app/onboarding/progress/[jobId]/page.tsx` | /onboarding/progress/[jobId] | page-dynamic | jobId | — | publiczny | — | RLS ×1 |
| `app/sentry-example-page/page.tsx` | /sentry-example-page | page | — | — | publiczny | — | — |
| `app/share-target/route.ts` | /share-target | route-handler | — | POST | zalogowany | `auth.getUser` | RLS ×1 |
| `proxy.ts` | — | proxy | — | — | publiczny | — | — |

## Jak to czytać

### Kolumna „Ochrona"

- `requireUserAndActiveOrg` i pokrewne — **strażnik mocny**: waliduje członkostwo w organizacji i zwraca `tenantId`.
- `requireAdmin` — operator platformy, lista z `ADMIN_EMAILS`.
- `układ: <nazwa>` — strażnik odziedziczony z `layout.tsx` wyżej w drzewie.
  **Dotyczy wyłącznie stron.** Akcja serwerowa i route handler wchodzą do aplikacji
  bezpośrednio po `POST`, z pominięciem układu — dla nich ta ochrona nie istnieje.
- `auth.getUser` — sprawdzone, KTO to jest, ale nie do której organizacji ma prawo.
- `⚠ getActiveOrgIdFromCookies` — czyta ciasteczko i sprawdza tylko format UUID.

### Kolumna „Klient bazy" — to jest właściwe pytanie

- `RLS ×n` — `createClient()`. Ochrona leży w bazie: nawet jeśli kod poda obcy identyfikator
  organizacji, `public.get_current_tenant_id()` zwróci `NULL` i polityki odmówią. Dlatego
  słaby odczyt ciasteczka w parze z tym klientem **nie jest** znaleziskiem.
- `**omija RLS** ×n` — `createAdminClient()`, czyli `service_role`. Baza nie sprawdza już
  niczego. Cała izolacja najemców zależy od tego, czy programista dopisał filtr `tenant_id`
  i czy wartość tego filtra pochodzi ze strażnika, a nie z danych od użytkownika.
- `mieszane` — plik używa obu. Wymaga przeczytania: liczy się to, którym klientem idzie
  zapytanie dotykające danych.

### Czego ten plik NIE mówi

Skrypt widzi obecność wywołań w pliku, nie kolejność wykonania. Nie odróżni strażnika
wywołanego przed zapytaniem od wywołanego po nim, ani strażnika, którego wynik jest
ignorowany. Kolumna „ok" znaczy „brak przesłanek do czytania w pierwszej kolejności",
nie „sprawdzone i bezpieczne".
