# Unlock Account Runbook (Faza 35)

Kilka rzeczy może zablokować dostęp user-a do konta. Ten runbook listuje
najczęstsze + procedurę odblokowania.

## Macierz scenariuszy

| Symptom (ze strony user-a) | Przyczyna | Sekcja |
|---|---|---|
| "Hasło OK, ale nie wpuszcza" + komunikat "za dużo prób" | Rate limit auth (Faza 28) | §1 |
| "Zgubiłem 2FA, nie mogę się dostać" | TOTP factor — brak dostępu | §2 |
| "Pojawia się 'konto zostało zawieszone'" | Admin suspend albo dispute lost | §3 |
| "Próbuję anulować usunięcie konta" | GDPR deletion request pending | §4 |
| "Logowanie przez Google nie działa" | Account linking conflict | §5 |
| Konto nie istnieje, ale user "na pewno się zarejestrował" | Hard bounce email (Faza 26) | §6 |

---

## §1. Rate limit lockout (auth)

**Trigger:** Faza 28 wprowadziła sliding window rate limit:
- Login: 5 prób / 15 min per IP + email
- Register / forgot-password: podobne

Po przekroczeniu user dostaje 429 z `Retry-After`.

### Procedura

1. **Zwykle** — poczekaj okno wygasa (15 min), wszystko wraca.
2. **Awaryjnie** — reset w Upstash Redis:
   ```bash
   # CLI Upstash (https://console.upstash.com/redis/<id>/data)
   DEL "rl:auth:login:<email>"
   DEL "rl:auth:login:<ip>"
   ```
3. **Jeśli legit user (np. dyrektor zapomniał laptopa)** — zresetuj hasło
   z admin panelu: `/admin/users/<userId>` → "Send password reset". User dostanie
   email z linkiem (omija rate limit logowania).

### Co NIE robić

❌ Nie wyłączaj rate limit "tymczasowo" — ataki bruteforce wracają w 30 s.

## §2. 2FA lost — TOTP factor brakuje

**Trigger:** user zgubił telefon / odinstalował Authy. Login wymaga TOTP,
ale user nie ma generatora.

### Procedura

1. **Pierwszy krok — recovery codes.** Kiedy user enrollował 2FA (Faza 28),
   dostał 8 kodów scrypt-hashed w `mfa_recovery_codes`. Sprawdź czy ich
   nie ma w bezpiecznym miejscu (1Password, sejf).

2. **Jeśli ma recovery code** — wpisuje go zamiast TOTP. Działa raz, potem
   się "spala" (`used_at = now()`).

3. **Jeśli nie ma żadnego** — pełen recovery procedure:

   **a)** Weryfikuj tożsamość przez **dwa** kanały:
   - Email z którego się rejestrował (potwierdza dostęp do skrzynki).
   - Telefon/Slack/spotkanie wideo — pyta o szczegóły konta (NIP firmy,
     ostatnia faktura, kwota subskrypcji).

   **b)** W `/admin/users/<userId>` → "Disable 2FA". Backend:
   - Wywołuje `supabase.auth.admin.deleteFactor(...)` na TOTP factorze.
   - Anulowuje wszystkie `mfa_recovery_codes` (`used_at = now()`).
   - Loguje akcję w `audit_logs` z `actor_id = admin`.
   - Email do user-a: "2FA wyłączone na Twoją prośbę przez admina".

   **c)** Powiedz user-owi że **musi włączyć 2FA z nowych kodów po zalogowaniu**
   — middleware AAL (Faza 28) wymusi to przy próbie wejścia na sensitive route.

### Co NIE robić

❌ NIGDY nie disable 2FA bez weryfikacji tożsamości — to dokładnie ten wektor,
przed którym 2FA chroni.

## §3. Konto zawieszone (admin suspend / dispute lost)

**Trigger:** admin manualnie kliknął "Suspend" w `/admin/users` (np. fraud,
TOS violation) ALBO przegraliśmy dispute Stripe (zob.
[refund-and-disputes.md](./refund-and-disputes.md) §2).

### Procedura

1. **Sprawdź powód** — `admin_user_notes` powinno mieć notatkę z czasem
   i actor.
2. **Jeśli legit (fraud, TOS)** — nie odblokowujemy. User dostaje email z
   referencem do TOS i opcją appeal przez `support@faktflow.pl`.
3. **Jeśli pomyłka admin-a** — `/admin/users/<userId>` → "Unsuspend". User
   dostaje email "konto przywrócone".

### Specjalny przypadek — dispute lost

Suspend był automatyczny po `dispute.lost` webhook (Faza 25/35). Nie
odblokowuj bez:
- Zapłaty disputed kwoty + opłaty Stripe ($15-25).
- Pisemnego zobowiązania że to się nie powtórzy.

## §4. GDPR deletion pending — user chce anulować

**Trigger:** user kliknął "Usuń konto" w `/settings/account`, ale chce się
rozmyślić w trakcie 14-dniowego cooling-off ([ADR-0006](../adr/0006-gdpr-14d-cooling-off.md)).

### Procedura — kanonicznie

1. User dostał email z linkiem `/gdpr/cancel?token=<HMAC>` — klika.
2. Walidacja tokenu (HMAC + 14d expiry) → UPDATE `gdpr_deletion_requests`
   `status = canceled`.
3. User widzi "Konto przywrócone, dziękujemy że zostajesz".

### Procedura — awaryjnie (link nie działa)

Jeśli token wygasł / email zgubiony:

1. `/admin/users/<userId>` → tab "GDPR" → znajdź pending request.
2. "Cancel deletion" → status = `canceled`, audit log.
3. Email do user-a manualnie z `/admin`.

**Czas krytyczny:** po `scheduled_for` cron drenuje request — nie da się
już cofnąć. Wtedy pełen restore z R2 snapshotu (zob.
[backup-restore.md](./backup-restore.md)).

## §5. Google OAuth conflict

**Trigger:** user zarejestrował się email+password, próbuje teraz Google OAuth
tym samym emailem. Supabase Auth łączy je tylko gdy email jest verified.

### Procedura

1. Sprawdź w Supabase Dashboard → Auth → Users → wyszukaj po email.
2. Jeśli `email_confirmed_at` jest null:
   - User powinien dostać welcome email z linkiem verify.
   - Awaryjnie: `/admin/users/<userId>` → "Send verification email".
3. Po verify — Google OAuth zaczyna działać.

## §6. Hard bounce — user "nie istnieje"

**Trigger:** Faza 26 — Resend webhook `email.hard_bounced` deaktywuje konto
(emaile do niego nie idą, więc i tak user się nie zaloguje przez password reset).

### Procedura

1. `/admin/users` → wyszukaj — flag "bounced".
2. Zapytaj user-a o **inny adres email** (różny od bouncującego).
3. `/admin/users/<userId>` → "Change email" (Server Action zmienia w
   `auth.users` + wysyła verify do nowego).
4. Po verify — odznacz bounce flag, konto żyje.

---

## Co loguje audit_logs

Każda akcja "unlock/suspend/disable 2FA/cancel GDPR" zapisuje:
- `actor_id` — admin który zrobił
- `event` — typ akcji
- `target_user_id` — kogo dotyczy
- `metadata` — kontekst (powód, IP, oryginalny stan)

Audit jest **immutable** (trigger Faza 28, migracja 00052) — nie da się go
zatrzeć.

## Powiązane

- [refund-and-disputes.md](./refund-and-disputes.md) — refundy / chargeback
- [docs/support/escalation-matrix.md](../support/escalation-matrix.md) — kiedy eskalować
- [ADR-0005](../adr/0005-2fa-supabase-mfa-native.md) — dlaczego 2FA Supabase native
- [ADR-0006](../adr/0006-gdpr-14d-cooling-off.md) — dlaczego 14d cooling-off
