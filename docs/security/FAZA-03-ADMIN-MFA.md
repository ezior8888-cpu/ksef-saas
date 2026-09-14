# F03 — administracja z MFA i granice odczytu

Data: 2026-09-14. Autor: Astra. Zakres zlecony przez Igora: kolejny pakiet stopniowej realizacji [planu](PLAN-ODPORNOSCI-CYBER.md). Stan wyjściowy: 2649cd0, lokalna gałąź codex/security-admin-mfa, oparta na PR #3. Dokument dotyczy kodu i lokalnych testów; nie potwierdza wdrożenia ani całej fazy 3.

## Co zmienia pakiet

### CYB-F03-01 — potwierdzenie administratora przy danych

[requireAdmin](../../lib/auth/admin-guard.ts) wymaga obecnego wpisu w ADMIN_EMAILS, potwierdzonego adresu email z Auth, zweryfikowanej sesji AAL2 i nadal aktywnego TOTP. Rola właściciela organizacji klienta nie jest rolą operatora platformy.

[Wspólny helper MFA](../../lib/auth/verified-mfa.ts) pobiera z ciasteczka wyłącznie access token. Ten sam token przekazuje do getUser(token) i getClaims(token), sprawdza zgodność sub z identyfikatorem użytkownika, a bieżący czynnik bierze z odpowiedzi Auth. Nie ufa session.user, samemu dekodowaniu JWT ani metadata ustawianym przez klienta. Brak weryfikacji blokuje operację. getAdminContext zwraca null przy odmowie/błędzie.

Wynik braku TOTP kieruje do ustawień z komunikatem o wymaganiu; AAL1 z istniejącym TOTP kieruje do challenge. Pierwsza rejestracja czynnika pozostaje dostępna z AAL1. Po potwierdzeniu użytkownik może wrócić do bezpiecznego lokalnego adresu; zapis administracyjny nie jest samoczynnie ponawiany.

Semantykę sprawdzono w zainstalowanym auth-js 2.103.3. [getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims) weryfikuje podpis, a [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) pobiera użytkownika z Auth. W lokalnym SDK getAuthenticatorAssuranceLevel() bez argumentu czyta lokalną sesję; nie jest samodzielnym dowodem w naszej bramce.

### CYB-F03-02 — boczne odczyty panelu

Dodano kontrole przed jedenastoma odczytami w lib/admin/flags.ts, support.ts, system.ts i backups.ts: listą organizacji/flag, pięcioma zestawieniami wsparcia, czterema zestawieniami systemu oraz przeglądem kopii. Cztery moduły danych mają server-only.

Strony flags, support, system i flo sprawdzają uprawnienia przed rozpoczęciem pracy. FLO zachowuje współdzielone odczyty silnika — kontrola na stronie poprzedza ich wywołanie, w tym utworzenie domyślnego klienta. Nie zmieniano jobów ani backendów JOBS_BACKEND.

Usunięto przechwytywanie błędów odczytów na stronach support/system jako pustych list lub zerowych statystyk. Strony nie połykają już odmowy autoryzacji z helperów. Wcześniejsze fallbacki statystyk DB, kopii i kolejki nadal istnieją i nie były przedmiotem tej zmiany. To uzupełnienie wczorajszych pięciu granic; nie deklaracja pełnego przeglądu wszystkich service_role. Nie wykonywano dowodu wycieku przez HTTP.

### CYB-F03-03 — ustawienia MFA i potwierdzenie hasła

Regeneracja kodów oraz wyłączenie TOTP wymagają zweryfikowanej sesji AAL2 jeszcze przed sprawdzeniem hasła i dostępem uprzywilejowanym. Bezpośrednie wywołanie Server Action nie może polegać na ochronie strony. Błąd listy czynników nie udaje udanego wyłączenia.

[Reautoryzacja](../../lib/auth/reauth.ts) sprawdza hasło osobnym klientem bez cookies, zapisu sesji i automatycznego odświeżania. Wiąże wynik z identyfikatorem bieżącego użytkownika, po czym odwołuje wyłącznie tymczasową sesję. Sesja AAL2 w przeglądarce pozostaje zachowana.

Ważna korekta po dodatkowym przeglądzie: auth.signOut ukrywa HTTP 401/403/404. Cleanup korzysta z auth.admin.signOut(temporaryToken, 'local') na tym samym izolowanym kliencie anon, wyłącznie z właśnie utworzonym tokenem. Ten wariant SDK zachowuje błąd. Nazwa admin w SDK nie oznacza użycia service_role ani wylogowania operatora. Odmowa zamknięcia tymczasowej sesji blokuje powodzenie operacji.

### CYB-F03-04 — jednorazowość kodu awaryjnego

[consumeRecoveryCode](../../lib/auth/mfa-recovery.ts) wykonuje warunkowy UPDATE po id, user_id i used_at IS NULL. Sukces wymaga dokładnie jednego zwróconego wiersza. Test z barierą wymusza dwa równoczesne odczyty nieużytego kodu, ale tylko jedna próba może go zużyć. Nie dodano RPC ani migracji.

To naprawa jednorazowości, nie pełnego procesu odzyskania MFA. Obecna akcja challenge po recovery code tylko zapisuje audyt i przekierowuje; nie wystawia AAL2. Nie dodano ciasteczka ani przełącznika pozwalającego ominąć MFA. Odbiór odzyskiwania pozostaje otwarty.

### CYB-F03-05 — aktywne właścicielstwo przy usuwaniu konta

deleteUserGdprAction wybiera organizacje po user_id, roli owner oraz statusie active. Historyczne członkostwo revoked zachowuje rolę w migracji 00038, dlatego sama rola nie dowodzi bieżącego właścicielstwa.

Błąd odczytu zatrzymuje działanie przed zapisami. Błędy aktualizacji organizacji/członkostw przerywają dalsze usuwanie i raportowanie sukcesu. Nie zmieniono retencji ani polityki usuwania; operacja nadal jest wieloetapowa i nie jest transakcją. Późniejszy błąd może pozostawić wcześniejszy zapis. To nie zamyka przeglądu GDPR, współwłaścicieli ani zgodności przechowywania danych.

## Dowody lokalne

Testy nie czytają .env, nie używają prawdziwych kont, bazy ani usług. Aktualne łączne wyniki i commity znajdują się w [dzienniku](DZIENNIK-ODPORNOSCI-CYBER.md).

- admin-mfa-assurance: odmowa przy błędzie weryfikacji claims (SDK jest atrapą), zgodność tożsamości, email, usunięcie allowlisty/czynnika, brak i błędy sesji.
- admin-audit-access oraz admin-user-metrics-access: rzeczywisty guard przed uprzywilejowanymi odczytami; w tym bezpośrednia Server Action płatności z AAL1.
- admin-operational-access: odmowa i oczekiwanie na guard przed DB/API/backup/FLO oraz poprawne wyniki po zezwoleniu.
- mfa-settings-authorization: AAL1 i awaria nie dotykają kodów/czynników; pierwsze enrollment nadal działa.
- password-reauth-session: rzeczywiste SDK z atrapą transportu potwierdza adres logout, scope local, tymczasowy JWT oraz odmowę HTTP 401/403/404. Te trzy regresje najpierw wykazały błędny sukces starego wariantu.
- mfa-recovery-consumption: prawdziwy hash i verifier; współbieżność, powtórzenie, cudzy użytkownik, zmiana właściciela i błędy DB.
- admin-gdpr-membership-scope: aktywne/odwołane/cudze członkostwa i zatrzymanie przy błędach.
- mfa-challenge-routing: poprawny powrót, odrzucenie zewnętrznego adresu, brak ukrycia nieudanej weryfikacji jako przekierowania.

## Odbiór środowiska — Bartek

Igor potwierdził 2026-09-14, że czynności z [wczorajszego przekazania](PRZEKAZANIE-BARTEK-2026-09-13.md) nie zostały jeszcze wykonane. Dotyczy to Dependency graph, ochrony zmian, Vercel Preview, stagingu i potwierdzenia schematu.

Przed wydaniem tego pakietu:

1. Potwierdzić wersję GoTrue oraz włączone enrollment/verification TOTP w rzeczywistym środowisku. Lokalny supabase/config.toml ma oba wyłączone; nie jest to dowód stanu serwera. Nie zmieniano go automatycznie.
2. Sprawdzić imienną listę ADMIN_EMAILS i potwierdzone emaile. Operator bez TOTP zostanie skierowany do konfiguracji. Operator bez organizacji może napotkać istniejące wymaganie onboarding/dashboard; przetestować właściwy dostęp do ustawień, nie nadawać członkostwa w firmie klienta jako obejścia.
3. Na odizolowanym stagingu przejść: pierwsze TOTP → AAL2 → panel → nowa sesja AAL1 → challenge → panel. Sprawdzić strony i bezpośrednie akcje, także brak/błąd Auth i cofnięcie roli/faktora. Utracony czynnik ma blokować stare AAL2.
4. Przećwiczyć odzyskanie dostępu z drugą osobą. Obecne recovery codes nie przywracają AAL2; zatwierdzona i sprawdzona ścieżka odzyskiwania jest warunkiem odbioru obowiązkowego MFA. Do tego czasu nie deklarować zakończonej ochrony/recovery administracji.
5. Sprawdzić ustawienie secure_password_change i zmianę hasła ze starą sesją. Jeśli serwer wymaga nonce, formularz będzie potrzebował obsługi tej ścieżki — izolowane sprawdzenie hasła celowo nie odnawia sesji przeglądarki. Nie wyłączać ustawienia serwera dla dopasowania testu. [Opis Supabase](https://supabase.com/docs/guides/auth/password-security#require-reauthentication-when-changing-password).
6. Potwierdzić obecność tabeli i uprawnienia z istniejącej migracji 00050 oraz warunkowe zużycie kodu na fikcyjnych danych. Nie uruchamiano migracji ani prawdziwego testu RLS/Postgres.
7. Powiązać potwierdzenia z konkretnymi commitami aplikacji/workera i schematu oraz poprzednimi PR 1→2→3. Nowa publikacja może uruchomić automatyczny Vercel Preview. Kod tego pakietu pozostaje lokalny do odrębnej zgody na publikację z tym skutkiem.

## Pozostałe konkretne ustalenia

**CYB-F03-06 — odwołanie sesji po ID: częściowo ograniczone, mechanizm otwarty.** Przegląd wykrył przekazywanie userId do auth.admin.signOut, podczas gdy API wymaga JWT, oraz fałszywy komunikat/audyt o usunięciu wszystkich sesji. Usunięto oba błędne wywołania. forceLogoutAction po autoryzacji jawnie odmawia, bez operacji Auth i audytu sukcesu. suspendUserAction potwierdza tylko wykonaną blokadę konta, a komunikat i audyt oznaczają odwołanie sesji jako niepotwierdzone. Testy admin-session-revocation-status obejmują odmowę, oczekiwanie na guard, brak wywołania z UUID i prawidłowe raportowanie.

Skuteczne wymuszenie wylogowania pozostaje zadaniem właściciela dla wdrożonej wersji GoTrue; potrzebny test aktualnego access tokenu i refresh tokenu. Nie używać JWT operatora, nie zbierać tokenów klientów ani nie tworzyć im sesji. [Kontrakt SDK](https://supabase.com/docs/reference/javascript/auth-admin-signout).

Pozostają też: pełna kontrola MFA dla zwykłych kont/API/RLS, limit prób odporny na zmianę IP i awarię Redis, pełne recovery, transakcyjność/retencja GDPR oraz reszta inwentarza service_role. Ochrona w tym pakiecie nie jest dowodem ich zamknięcia.

## Wycofanie i zakres zmian

Zmiany są w oddzielnych lokalnych commitach. Brak zmian schematu, kluczy, nazw R2_*/UPSTASH_* i przełącznika jobów. Wycofanie kodu guarda ponownie osłabia kontrolę administracji — po wydaniu wymaga świadomej decyzji operatora i ochrony zastępczej. Nie dodano domyślnego przełącznika wyłączającego wymaganie MFA.
