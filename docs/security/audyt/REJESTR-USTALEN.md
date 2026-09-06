# Rejestr ustaleń — audyt bezpieczeństwa

Jeden wiersz = jedno znalezisko. Plik jest jedynym źródłem prawdy o tym,
co znaleźliśmy. Przebieg audytu i zadania dla Bartosza są w dzienniku:
`docs/security/DZIENNIK-AUDYT.md`.

**Tryb audytu: TYLKO RAPORT.** Kolumna „Propozycja naprawy" to opis, nie
wykonana zmiana. Ani jedna linijka w `app/` i `lib/` nie została ruszona.

## Numeracja

| Prefiks | Kategoria | Dzień |
|---|---|---|
| `SEC-A-nn` | sekrety, granica przeglądarka/serwer | 1 |
| `SEC-B-nn` | izolacja najemców w kodzie (obejścia RLS) | 2 |
| `SEC-C-nn` | baza: RLS, polityki, uprawnienia, funkcje | 3 |
| `SEC-D-nn` | wycieki na zewnątrz (model, poczta, logi, RODO) | 4 |
| `SEC-E-nn` | konfiguracja produkcji | 5 |

## Wagi

| Waga | Znaczenie | Co z tym robimy |
|---|---|---|
| **krytyczna** | dane wychodzą poza najemcę albo poza firmę **już teraz**, bez żadnych warunków | stop audytu, zgłoszenie do Igora tego samego dnia |
| **wysoka** | wyciek możliwy, ale wymaga warunku (znajomość identyfikatora, wyścig, konkretna konfiguracja) | blokuje launch |
| **średnia** | nie wycieka, ale osłabia obronę albo ułatwia rozpoznanie atakującemu | naprawa przed launchem, bez pośpiechu |
| **niska** | higiena, dług, dokumentacja rozjechana z kodem | backlog |

Osobna waga **„do ustalenia"** — dla rzeczy, których nie da się rozstrzygnąć
bez wyniku od Bartosza albo bez decyzji produktowej. Każdy taki wpis musi
mieć w kolumnie „Jak odtworzyć" zapisane, **czego konkretnie brakuje**.

---

## Ustalenia

| ID | Waga | Gdzie | Na czym polega | Jak odtworzyć | Co się może stać | Propozycja naprawy | Status |
|---|---|---|---|---|---|---|---|
| SEC-A-01 | **średnia** | `app/api/portal/exports/generate/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/email/resend-webhook/route.ts`, `app/api/dev/posthog-test/route.ts` | Blok `catch` odsyła treść wyjątku w ciele odpowiedzi HTTP (`e.message`). | `node scripts/security/inventory-entrypoints.ts`, kolumna `errorToClient` w `01-powierzchnia.json`. Ręcznie: koniec pliku `portal/exports/generate/route.ts`. | Komunikat błędu Postgresa potrafi zawierać nazwę tabeli, fragment zapytania i ścieżkę na serwerze. Atakujący dostaje mapę środka aplikacji za darmo, wysyłając celowo błędne żądanie. | Zwracać klientowi stały komunikat i identyfikator zdarzenia; szczegóły wyłącznie do Sentry. Wzorzec jest już w repo — reszta route-ów tak robi. | otwarte |
| SEC-A-02 | **niska** | `docs/security/owasp-top10-mapping.md:84` | Dokument twierdzi: „Stack traces hidden — `console.error` nie leci do response body". SEC-A-01 pokazuje, że w czterech miejscach leci. | Porównać wiersz 84 dokumentu z wynikiem SEC-A-01. | Nieprawdziwy dokument bezpieczeństwa jest gorszy niż jego brak: następny przegląd pominie ten obszar, bo „już sprawdzone". | Poprawić po zamknięciu SEC-A-01. Do rozważenia: przy każdej kontroli dopisać datę i sposób weryfikacji, nie samą nazwę fazy. | otwarte |
| SEC-C-01 | **do ustalenia** | wszystkie 60 tabel, `supabase/migrations/*.sql` | Żadna tabela nie ma `FORCE ROW LEVEL SECURITY`. Postgres nie stosuje polityk RLS do właściciela tabeli. | `grep -ric "force row level security" supabase/migrations/*.sql` → zero trafień. **Brakuje odpowiedzi na pytanie: jaką rolą łączy się PostgREST** — rozstrzyga to `05-postgrest-i-schematy.sql`, punkt 5.4a. | Jeżeli PostgREST łączy się rolą będącą właścicielem tabel, wszystkie polityki RLS są dekoracją i izolacja między klientami nie istnieje. Jeżeli łączy się `authenticated`, ustalenie schodzi do niskiej wagi (obrona w głąb). | Zależna od wyniku. Przy złym wariancie: `ALTER TABLE ... FORCE ROW LEVEL SECURITY` na wszystkich 60 tabelach — migracja, czyli działka Bartosza. | czeka na Bartosza |
| SEC-C-02 | **do ustalenia** | `00014`, `00033`, `00036`, `00046`, `00037`, `00038`, `00053`, `00058` w `supabase/migrations/` | Pliki zawierają więcej deklaracji `SECURITY DEFINER` niż `SET search_path`. Funkcja DEFINER bez przypiętej ścieżki wyszukiwania może wykonać cudzy kod z uprawnieniami właściciela. | Zliczenie wystąpień w plikach migracji. **Stan faktyczny na produkcji sprawdza `04-funkcje-definer.sql`, punkt 4.1** — zliczanie w plikach nie odróżnia funkcji redefiniowanej od nowej. | Podniesienie uprawnień: użytkownik podstawia własną funkcję w schemacie przeszukiwanym wcześniej i wykonuje ją jako właściciel bazy. | `ALTER FUNCTION ... SET search_path = public, pg_temp` dla każdej z listy 4.1. Migracja — działka Bartosza. | czeka na Bartosza |
| SEC-E-01 | **niska** | `docs/security/owasp-top10-mapping.md:35,86` | Dwie kontrole („TLS — Vercel auto-managed", „Disabled directory listing — Vercel default") opierają się na platformie, na której produkcja nie stoi. `AGENTS.md` opisuje Hetzner + Coolify. | Porównać sekcję „Infrastruktura i dostępy" w `AGENTS.md` z wierszami 35 i 86 dokumentu. W repo nadal jest `vercel.json`. | Dwie kontrole bezpieczeństwa uznane za zapewnione przez dostawcę, który ich nie zapewnia, bo go nie używamy. Nikt tego nie sprawdził na Hetznerze. | Zweryfikować obie na produkcji (dzień 5, `audit-headers.ts`) i przepisać wiersze na stan faktyczny. | otwarte |

---

## Świadomie odrzucone

Rzeczy, które wyglądały na znalezisko, a nie są. Zapisujemy, żeby nie
sprawdzać ich drugi raz za pół roku.

| Co | Dlaczego to NIE jest problem |
|---|---|
| `app/onboarding/import-source/page.tsx` i `magic-import/page.tsx` — `createAdminClient()` w parze z `getActiveOrgIdFromCookies()` | Obie strony przed sięgnięciem po dane sprawdzają członkostwo własnym zapytaniem: `from('memberships').eq('user_id', user.id).eq('organization_id', tenantId).eq('status','active')` i przekierowują, gdy wiersza nie ma. Identyfikator z ciasteczka jest więc zweryfikowany zanim cokolwiek wyjdzie z bazy. Komentarz w pliku wyjaśnia, czemu w ogóle omijają RLS: tuż po założeniu organizacji PostgREST zwracał `null` z powodu cache schematu i onboarding wpadał w pętlę przekierowań. |
| `app/actions/newsletter.ts` — akcja bez strażnika, omija RLS | Zapisuje wyłącznie adres e-mail na listę newslettera. Nie dotyka żadnych danych najemcy, jest limitowana po IP (5 na 10 minut). Oflagowana, bo leży w `app/actions/`, któremu narzędzie z definicji przypisuje „członek organizacji" — to błąd klasyfikacji narzędzia, nie kodu. |
| `app/api/portal/exports/generate/route.ts` — publiczny route z `createAdminClient()` | Autoryzacja tokenem: skrót tokenu → wiersz `accountant_access` → sprawdzenie `revoked_at`, `expires_at`, `access_level`, a na końcu jawne `if (tenantId !== accessRow.tenant_id) return 403`. Wzorzec poprawny. Osobno zgłoszone SEC-A-01 dotyczy tylko bloku `catch` w tym pliku. |
| `app/api/email/resend-webhook/route.ts` — webhook bez strażnika sesji | Weryfikuje podpis Svix (HMAC-SHA256) z `timingSafeEqual` i odrzuca żądanie, gdy `RESEND_WEBHOOK_SECRET` nie jest ustawiony. Dla webhooka podpis JEST uprawnieniem. **Do sprawdzenia osobno w dniu 3:** czy weryfikowana jest też tolerancja znacznika czasu — bez niej podpisane żądanie da się powtórzyć. |
| 8 stron w `app/admin/**` bez `requireAdmin()` w pliku | `app/admin/layout.tsx` woła `requireAdmin()`, a w App Routerze układ renderuje się przed stroną. **Zastrzeżenie:** dotyczy to wyłącznie stron. Akcje serwerowe i route handlery wchodzą z pominięciem układu — dla nich to rozumowanie nie działa i każda z nich musi mieć własne sprawdzenie. |
