# Przegląd całości dotychczasowych prac bezpieczeństwa — 16.09.2026

Stan kodu: f3ca0d4c3b90b1eeaeb61d91cc78aa520206dd04, gałąź codex/security-tenant-boundaries. Autor: Astra, dwa zakończone pomocnicze przeglądy AI oraz własna weryfikacja źródeł i reprodukcja FLO. Zakres zgody: przegląd dotychczasowych prac. **Nie wykonano nowych napraw kodu, SQL, merge, zmian konfiguracji ani wdrożenia. Nowy raport i wpis dziennika są lokalne, nieopublikowane.**

> Aktualizacja 23.09: wykonane naprawy i nowe testy opisuje [odrębny raport](NAPRAWY-PRZEGLADU-2026-09-23.md). Poniżej zachowano stan i ustalenia z dnia przeglądu.

## Wniosek

Zabezpieczenia zapisane w dotychczasowych pakietach nadal są obecne, a ich istniejące testy przechodzą. Przegląd wykrył jednak dodatkowe problemy. **Nie uznajemy całego pakietu za gotowy do wydania.** Nowe ustalenia oznaczają luki w poprzednim pokryciu przeglądem/testami, nie dowód incydentu na produkcji. Część pochodzi ze starszego kodu; wskazano to osobno.

## Zakres i rzeczywisty stan publikacji

Sprawdzono łańcuch ośmiu roboczych PR: #1 → #2 → #3 → #4 → #10 → #11 → #12 → #13. Odczyt oficjalnego API GitHuba 16.09: wszystkie pozostają otwarte, draft, merged=false. Main ma b9c3703b6997d6623ba30f889c5f0c5ff267218b. Praca w PR nie oznacza wdrożenia. Skumulowany diff od początku napraw 7576a08 zawiera 327 plików, w tym później dołączone prace zespołu; to miara zakresu integracji, nie deklaracja osobnego audytu każdej linii każdego pliku.

Przegląd objął przepływy i granice w obszarach: storage/PDF/portal/cache, PostHog/Sentry/logi, GDPR, CI i narzędzia audytu, admin/JWT/MFA/reauth/recovery, callback/finish, onboarding, prywatne API, eksporty/importy i zadania, FLO execution/approval/undo, znane relacje SQL. Historyczne raporty i rejestr 89 zapytań porównano z kodem. Nie wykonano pentestu ani pełnego przeglądu wszystkich funkcji aplikacji poza tym zakresem.

## Dodatkowe ustalenia, w kolejności prac

P1 oznacza pilne przed wydaniem danej funkcji; P2 — konkretną usterkę do naprawy. Poziomy nie są wynikiem CVSS.

### REV-01 / P1 — UPO wymaga tej samej kontroli firmy co pozostałe joby

Źródła: lib/inngest/jobs/download-upo.ts:43, :138–172; lib/inngest/jobs/upo-retry-stale.ts:49–54, :97–100; supabase/migrations/00015_ksef_compliance.sql:30–74.

Worker UPO odczytuje rekord potwierdzenia tylko po invoice_id, a fakturę tylko po id. Następnie używa tenantId zdarzenia przy zapisie pliku. Cron pobiera tenant_id z upo_receipts, bez porównania z firmą dołączonej faktury. Schemat repo daje authenticated zapis upo_receipts, sprawdza jedynie tenant_id dziecka, ma niezależny FK faktury i UNIQUE(invoice_id).

Potwierdzone statycznie: niespójne powiązanie może zakłócić pobranie UPO innej firmy; worker nie odrzuca sprzecznego zestawu identyfikatorów przed uprzywilejowanym odczytem i zapisem. Skutek wygenerowania PDF zależy dodatkowo od powodzenia KSeF. Akcja pobrania UPO w app/(dashboard)/invoices/[id]/upo-actions.ts sprawdza dostęp do faktury — **nie potwierdzono kompletnego zewnętrznego wycieku pliku**. Nie sprawdzano faktycznych grantów serwera ani nie wysyłano spreparowanych rekordów.

To starsza luka, wcześniej pominięta: heurystyka oznaczała download-upo jako bezpieczniejszy kontekst joba; nie było go w ręcznej puli 89. Fakt uruchomienia przez cron nie jest dowodem wiarygodności danych rekordu.

Naprawa: kontrola zgodności firmy, faktury i UPO przed każdym skutkiem; porównanie złączenia w cron; ograniczenie odczytów i zapisów workera; osobno spójność relacji i grantów w bazie przez Bartka. Testy dwóch firm oraz retry z niespójnym rekordem. Nie tworzyć migracji automatycznie.

### REV-02 / P1 — Stripe webhook nie dociera do kontroli podpisu

Źródła: lib/supabase/middleware.ts:40–48 i :214; proxy.ts:33; app/api/stripe/webhook/route.ts:76.

Prawidłowe powiadomienie Stripe nie ma cookies użytkownika. Trasa jest objęta proxy i nie znajduje się na liście publicznych wejść; otrzymuje 401 przed handlerem sprawdzającym podpis. Może to wstrzymać obsługę subskrypcji i rozliczeń. To starsza usterka: poprzednio był redirect do loginu, po zmianie middleware jest 401.

Dowód: 3/3 testy reproduktora z realnym proxy i oficjalnym matcherem Next; Stripe odrzucony, kontrolny Resend przepuszczony. Auth jest atrapą, bez prawdziwego Stripe.

Naprawa: dokładny wyjątek dla /api/stripe/webhook, z zachowaniem obowiązkowego podpisu Stripe; regresja przez proxy oraz kontrola złego podpisu. Nie otwierać całego /api/stripe.

### REV-03 / P1 przed szerszym użyciem FLO — zgoda nie jest związana z wersją propozycji

Źródła: app/actions/flo.ts:132–161; lib/flo/approval.ts:123–165 i :177–200; lib/flo/proposals.ts:137–150; lib/flo/execute.ts:66–72 i :183–220.

Zgoda zapisuje snapshot, lecz wykonanie ponownie czyta propozycję po ID i nie porównuje jej treści z zatwierdzoną wersją. Odświeżenie nadal otwartej propozycji pomiędzy utworzeniem zgody a odczytem wykonawcy pozwala użyć zgody A do wersji B. Nowa kontrola fingerprint przy przejęciu chroni późniejszy wyścig, ale nie zamyka tego wcześniejszego okna.

Dowód: realne createApproval → createProposal (odświeżenie tego samego ID) → executeProposal na syntetycznej bazie. Wynik ok:true; snapshot wskazuje A, payload przekazany wykonawcy B. Atrapa wykonawcy nie wysyła niczego; test nie dowodzi faktycznej wysyłki wiadomości. To pozostałość starszego projektu zgody, niezamknięta w ac3bc20.

Naprawa: niezmienna wersja/skrót całej zatwierdzanej operacji, uwzględniający payload, adresata, input i istotne fakty; przekazanie wersji z widoku, związanie tokenu i atomowego przejęcia z tą wersją. Sam odcisk faktów z bazy nie jest odciskiem zgody. Dodać regresję obu okien wyścigu i ponownego użycia niezrealizowanej zgody.

### REV-04 / P1 procesu wydania — zielone kontrole nie są wymagane na main

Oficjalne API 16.09: aktywny ruleset 23339700 dla domyślnej gałęzi zawiera wyłącznie deletion i non_fast_forward. Efektywne rules/branches/main zwróciło dokładnie te dwie reguły; klasyczna ochrona branches/main/protection zwróciła 404 przez istniejące logowanie Git. Nie ma wymaganych kontroli ani wymaganego PR/review w odczytanych regułach.

To konkretny wynik wcześniej otwartego pytania, nie regresja YAML. Naprawa po stronie właściciela GitHuba: wymagany PR, przegląd i odpowiednie statusy z istniejących workflow; potwierdzić próbą z nieudaną kontrolą. Nie zmieniano ustawień. [Reguły repo](https://github.com/ezior8888-cpu/ksef-saas/rules/23339700). [Dokumentacja GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

### REV-05 / P2 — bezczynność resetuje własny termin wylogowania

Źródło: hooks/use-inactivity-timeout.ts:65–82 i :94–118; rzeczywiste użycie przez IdleWatcher w dashboardzie.

Po 59 minutach setIsWarning(true) zmienia zależność efektu. Cleanup usuwa właściwy timeout, a ponowne scheduleTimers ustawia ostrzeżenie na false i zaczyna kolejne 60 minut. Brak aktywności w normalnie wykonującej timery karcie nie prowadzi do oczekiwanego logout. Usterka sprzed pakietu, 6f54bf4.

Dowód statyczny cyklu efektu; nie uruchomiono testu React/fake timers. Naprawa: oddzielić rejestrację listenerów/timerów od stanu ostrzeżenia, zachować faktyczny deadline. Odbiór: upływ 59 i 60 minut z renderem po ostrzeżeniu, bez interakcji; dokładnie jedno wylogowanie, a jawne przedłużenie sesji działa.

### REV-06 / P2 — pozorne wylogowanie przy awarii Auth

Źródła: app/(auth)/login/actions.ts:129–137 i lib/auth/inactivity-logout.ts:29–39.

Obie akcje zapisują auth.logout, ignorują error z signOut i przekierowują. Rzeczywisty SDK przy HTTP 500 pozostawia cookie; użytkownik może uznać wspólne urządzenie za wylogowane. To starszy błąd, odrębny od znanej niedostępnej administracyjnej revokacji po ID.

Dowód: rzeczywisty zainstalowany SDK/SSR i funkcje akcji z atrapą HTTP. Dla obu przy 500: jedno cookie nadal obecne, zero czyszczeń, zapis logout i redirect. Kontrola 204 usuwa cookie.

Naprawa: oddzielić lokalne usunięcie sesji od potwierdzenia unieważnienia upstream, obsłużyć błędy i prawdziwy status w UI/audycie. Sam redirect albo scope local bez sprawdzenia zachowania SDK nie wystarcza. [Supabase signOut](https://supabase.com/docs/reference/javascript/auth-signout).

### REV-07 / P2 — stary finish pozwala podstawić inne konto

Źródła: lib/auth/finish-sign-in.ts:35 i app/auth/finish/page.tsx:34–43.

Finish akceptuje parę tokenów z fragmentu linku bez związania z rozpoczęciem logowania w tej przeglądarce. Ważna sesja innego konta może nadpisać aktualną. Ryzyko dotyczy danych, które odbiorca później wprowadzi na podstawione konto, **nie przejęcia istniejących tokenów lub danych odbiorcy**. Czyszczenie fragmentu i zakaz zewnętrznego next działają, ale tego nie rozwiązują.

Dowód: realny helper i SDK, atrapiony Auth: istniejąca sesja syntetyczna A → sesja B z fragmentu, sukces i wewnętrzny next. Zachowana ścieżka legacy implicit, przeniesiona do helpera w 5446b19; ryzyko nie było dotąd jawnie rozliczone.

Naprawa: powiązany z inicjatorem PKCE dla właściwych przepływów; przegląd szablonów/redirectów przed wycofaniem starego wejścia. Nie usuwać go w ciemno bez odbioru istniejących linków. [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

### REV-08 / P2 — potwierdzenie hasła GDPR omija wspólny budżet prób

Źródło: app/(dashboard)/settings/account/actions.ts:26 i :75.

Żądanie/anulowanie usunięcia konta wywołuje reauth bez limitera aplikacyjnego stosowanego przy zmianie hasła i TOTP. Dla już uwierzytelnionej sesji zaakceptowanej przez MFA guard tworzy to dodatkowy kanał zgadywania hasła. Nie twierdzimy, że GoTrue nie ma własnych limitów.

Dowód: 12 błędnych prób rzeczywistej akcji anulowania przy atrapach reauth/Auth → 12 wywołań sprawdzenia hasła. Pozostałość wcześniejszego GDPR; samo późniejsze dołożenie MFA jej nie zamyka.

Naprawa: ten sam atomowy budżet prób konta we wszystkich wejściach reauth, poprawne zachowanie przy awarii magazynu. Regresja równoczesnych prób przez kilka różnych akcji.

## Potwierdzone istniejące zabezpieczenia

- Strażnicy wiążą user i claims z tym samym tokenem, administracja wymaga aktualnego MFA/TOTP i listy operatorów; odczyty administracyjne mają własne kontrole. Onboarding i akcje formularzy otrzymały kontrole MFA/członkostwa.
- Storage odrzuca ścieżki poza namespace firmy; PDF/portal i podpisy mają no-store. Service worker dopuszcza wyłącznie publiczne zasoby, nie prywatne HTML/API/RSC, i czyści stare cache.
- PostHog startuje po zgodzie przeglądarkowej; zamknięte listy danych, wyłączone replay/autocapture. Sentry stosuje wspólne filtry browser/Node/Edge. Nie są to uniwersalne klasyfikatory danych osobowych.
- GDPR ma atomowe pending→processing i anulowanie przez świadomą akcję; kod wymaga zgodnego schematu. Preferencje poczty przy błędzie nie udają sukcesu.
- Przeglądnięte joby eksportu/importu/offline/przypomnień mają dodatkowe kontrole relacji tenant–rekord. UPO pokazuje, dlaczego nie rozciągamy tego wniosku na wszystkie joby.
- CI skanuje sekrety, zależności, CodeQL i generuje inwentarz. Nie obniżano progów ani nie poszerzano wyjątków w tym przeglądzie.

## Weryfikacja i dowody

Nowy lokalny przebieg: **132 pliki / 2465 Vitest PASS, typecheck PASS, lint 0 błędów / 29 wcześniejszych ostrzeżeń**. Środowisko allowlist, envDir:false, bez sekretów aplikacji. Dowód TEMP: faktflow-tenant-validation-ybvnVv.

Dokładny HEAD f3ca0d4 ma nadal **7/7 GitHub checks SUCCESS**. [CI](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35120892202): także 66 XML PASS, produkcyjny audit bez znanych podatności; dependency review PASS. [Security](https://github.com/ezior8888-cpu/ksef-saas/actions/runs/35120892103): 245 commitów bez trafień Gitleaks; oba CodeQL po 0 wyników i 0 zastosowanych wyjątków. To odczyt istniejących świeżych przebiegów, nie nowe uruchomienie całego CI. 67 unikalnych testów narzędzi, bez sumowania duplikatów macierzy.

Dodatkowe dowody lokalne poza repo, wszystkie syntetyczne:
- FLO: TEMP/faktflow-overall-review-sg9bx2 — 1 test potwierdzający rozbieżność zgody i wykonania.
- Stripe: TEMP/faktflow-stripe-proxy-20260916 — 3 testy zachowania proxy.
- Auth: TEMP/faktflow-auth-cumulative-review-20260916/reproductions.json — logout500/204, podstawienie sesji, 12 prób reauth.

Test odtwarzający wadliwe zachowanie może być zielony właśnie dlatego, że wykazał wadę. Przy naprawie dodać regresje wymagające bezpiecznego wyniku; nie traktować reproduktorów jako potwierdzenia bezpieczeństwa.

## Nadal otwarte i ograniczenia tego przeglądu

- Pełny build aktualnego HEAD pozostaje niepotwierdzony po wcześniejszych awariach pamięci/procesu. Obecne CI nie uruchamia Next build. Nie powtarzano piątej identycznej próby bez zmiany warunków.
- Znane relacje DB: payments/trigger salda, reminders/UNIQUE, offline queue, parent faktury, OCR created_by; teraz także UPO. Bezpośredni PostgREST wymaga osobnego testu dwóch firm i odbioru rzeczywistego schematu przez Bartka.
- GoTrue/PKCE/TOTP, SRH/Valkey EVAL/TTL, pełne recovery MFA, unieważnianie sesji innego konta — nadal odbiór środowiska.
- Nie sprawdzono serwera, WAF, origin/proxy-IP, publiczności MinIO, kopii i odtworzenia, kluczy Coolify ani wdrożonego commitu. Nie potwierdzono operacyjnych RPO/RTO ani zgodności prawnej RODO. Zewnętrzny pentest pozostaje osobnym zadaniem.
- CSP zawiera unsafe-inline, brak kompletnego odbioru raportowania; starsze limitery i zachowanie bez Redis wymagają dalszej fazy.
- Historyczne „Logi i PII — czysto” w audyt/REJESTR-USTALEN.md:79 jest zbyt szerokie: worker lib/jobs/logger.ts:26–28 nie wyłącza info, a inbox-polling.ts:175 przekazuje NIP. Nie stwierdzono nowego zewnętrznego wycieku; poprawić zakres twierdzenia, bez kasowania historii dowodów.
- Pomocniczy przegląd jobów został przerwany przez narzędzie przed raportem końcowym. Główny agent niezależnie dokończył odczyt wskazanych ścieżek UPO; nie dopisano nieprzeprowadzonej reprodukcji. Całość jest przeglądem AI, nie niezależnym pentestem ludzkim.

## Kolejność dalszych prac

1. Naprawić i przetestować UPO wraz z osobnym odbiorem relacji DB przez Bartka; usunąć blokadę poprawnych webhooków Stripe.
2. Związać zgodę FLO z wersją operacji; domknąć logout, bezczynność, stare finish i wspólny budżet reauth.
3. Właściciel włącza wymagane kontrole/PR w GitHub; zespół potwierdza pełny build, izolowane E2E, GoTrue/Valkey i testy DB.
4. Dopiero osobny, skoordynowany odbiór aplikacja–worker–schema może poprzedzać decyzję o połączeniu i wdrożeniu. Ten raport niczego nie wdraża i nie zamyka F03.
