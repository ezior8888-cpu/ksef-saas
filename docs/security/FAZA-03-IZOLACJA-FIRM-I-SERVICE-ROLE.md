# F03 — izolacja firm i przegląd service_role

Data: 2026-09-16. Autor: Astra z pomocniczymi przeglądami AI. Gałąź: `codex/security-tenant-boundaries`, baza `36f2baeac39475fba2fbcbcb849d6c8bea5f8ca5` (PR #12). Status: **kod i testy lokalne zapisane; kompilacja nieukończona, odbiór bazy i środowiska otwarty**. Ten pakiet nie jest zgodą na wdrożenie.

## Zakres i dowody

Igor zatwierdził kontynuację prac. Osobny worktree chroni zastane zmiany w głównym checkout. Nie zmieniano migracji, produkcji, sekretów, ustawień usług ani głównej gałęzi. Testy korzystają z syntetycznych danych i atrap usług.

Historyczne „78 do przejrzenia” pochodzi z audytu 8.09. Baza dzisiejszego pakietu zawiera **305 zapytań: 216 ok według heurystyki, 77 do przejrzenia i 12 średnich**. Ręcznie rozliczamy wszystkie **89 pozostałych pozycji**; nie zmieniamy heurystyki, aby uzyskać korzystniejszy licznik. Rejestr zachowuje identyfikator zapytania z bazowego commitu, wejście, źródło tożsamości, kontrolę dostępu, test i ograniczenie. Numery linii dotyczą bazy, nie muszą odpowiadać późniejszemu kodowi.

[Rejestr pojedynczych zapytań](audyt/service-role-review-20260916.json) rozróżnia prześledzoną ścieżkę, naprawę, niepodłączony kod i otwarte zadanie. Ręczne rozliczenie nie oznacza 89 napraw ani 89 bezpiecznych ścieżek. Dwa sinki audytu nadal polegają na tożsamości od callerów; ten pakiet nie dowodzi poprawności wszystkich producentów metadanych. Nie przeprowadzono pełnego ponownego audytu 216 automatycznych „ok”; dodatkowe helpery oraz wejścia analizowano tam, gdzie prowadziły do nich sprawdzane ścieżki.

Odtworzenia przed poprawką używały rzeczywistego kodu TypeScript z bazą w pamięci. Potwierdziły obcy numer faktury nadrzędnej, wpływ obcych przypomnień na decyzję i zmianę statusu cudzej faktury przez przeterminowaną kolejkę. To dowody zachowania kodu, **nie potwierdzenie ataku ani faktycznych grantów serwera**.

## Wykonane poprawki

### CYB-F03-20 — dokumenty i powiązania między firmami

- Eksport ogranicza odczyt faktury nadrzędnej do firmy eksportu. Obce lub brakujące powiązanie zatrzymuje plik zamiast ujawniać numer albo produkować niepełną korektę.
- Naprawiono mapowanie kierunku eksportu na rzeczywiste wartości schematu `outgoing/incoming`. Przed tą korektą filtr `issued/received` maskował także podatną ścieżkę, zwracając pusty wynik.
- Licznik i etapy przypomnień filtrują równocześnie firmę i fakturę. Błąd odczytu nie daje zgody na kolejną wysyłkę.
- Kolejka offline sprawdza parę firma–faktura przy odczycie, konflikcie klucza i aktualizacji. Nie przyjmuje obcego rekordu jako udanego ponowienia.
- Zwykły eksport zachowuje obecną politykę: aktywne członkostwo i zweryfikowana sesja/MFA. Ręczny Co-Pilot ma owner/admin; portal wymaga ważnego tokenu z prawem pobierania. Nie rozszerzono ról.

### CYB-F03-21 — zadania w tle

- Wiarygodny transport nie stanowi dowodu, że dwa identyfikatory należą do tej samej firmy. Dodano kontrolę pary przed skutkami importów, kolejki offline, wysyłki do KSeF i powiadomień.
- Import sprawdza również zgodność źródła i pliku z zapisanym zadaniem. Obsługa wyczerpanych prób nie oznacza obcego importu/faktury jako nieudanego.
- Helpery pobierania i zmiany statusu faktury wymagają jawnej firmy; zaktualizowano ich wywołania.
- Przypomnienie sprawdza zgodność firmy własnego rekordu i złączonej faktury przed PDF/storage/pocztą.
- OCR sprawdza aktywne członkostwo odbiorcy, ponieważ pole `created_by` w rekordzie bazy nie jest samo dowodem uprawnienia.
- Globalne zadania utrzymaniowe pozostają globalne z uzasadnieniem w rejestrze. Nie dodano filtrów, które pozornie poprawiałyby skaner, a wyłączały działanie crona.

### CYB-F03-22 — wykonanie i cofnięcie działań FLO

- Firma jest wymagana przy wykonaniu, zatwierdzeniu, odczycie stanu i cofnięciu; zgoda jest powiązana także z użytkownikiem.
- Wykonanie ponownie sprawdza wyłącznik globalny i dostępność rodzaju funkcji dla firmy. Awaria odczytu bezpiecznika blokuje skutek, zamiast przyjmować domyślne „włączone”.
- Wybór faktury do potwierdzenia płatności musi pochodzić z zapisanej propozycji; saldo i firma są sprawdzane ponownie w bazie. Odrzucono dowolne obce ID oraz niepoprawne kwoty. Zapisy korzystają z pól istniejących w schemacie.
- Cofnięcie ogranicza dopuszczalne pola i chroni warunkową aktualizacją przed nadpisaniem późniejszej zmiany.
- Nie podłączono nieużywanego buildera `payment.confirm`. Odtworzony błąd handlera był **latentny**: brak produkcyjnego callera buildera i niezgodny fingerprint ograniczały jego osiągalność. Nie opisujemy go jako dokonanego odczytu/zmiany danych na serwerze.

### CYB-F03-23 — dane konta, opt-out i logi

- Eksport konta nie pyta już o nieistniejący autor-faktury ani fikcyjne kolumny. **JSON format_version=2** zawiera profil, własne członkostwa i maksymalnie 1000 ostatnich wpisów audytu, z dokładnymi licznikami i informacją o obcięciu wyników. Faktury organizacji mają osobny eksport; nie poszerzono uprawnień konta na wszystkie dane firm.
- Błędy Auth/bazy blokują plik zamiast udawać pusty sukces. Endpoint sam sprawdza zweryfikowaną sesję/MFA i zwraca no-store także dla błędów. Odebrana rola owner nie trafia do listy aktualnie posiadanych organizacji.
- Zapis preferencji poczty sprawdza rzeczywisty wynik bazy. Awaria odczytu blokad/opt-out nie pozwala wysyłać z pominięciem ustawień; błąd propaguje do wywołującego. Ustawienia nie pokazują domyślnej zgody, gdy ich odczyt się nie udał.
- Podpisany webhook ponawia opt-out po częściowym błędzie również wtedy, gdy receipt już istnieje. Błąd wyszukania konta w Auth daje możliwość retry zamiast HTTP 200.
- Przy awarii audytu log serwera zawiera stały kod, bez całego zdarzenia i surowego komunikatu SDK. Zamierzony zapis do kontrolowanej tabeli audytu pozostaje bez zmian.

## Nadal otwarte: baza, która samodzielnie przyjmuje zapisy

**Właściciel: Bartek. Priorytet wysoki przed uznaniem izolacji za odebraną.** Na podstawie schematu repo 00014/00015 oraz późniejszych migracji wykryto niezależne klucze obce i polityki sprawdzające tylko firmę dziecka. Istnienie FK na UUID faktury nie wymusza zgodności firm.

1. **Płatności i trigger salda.** Powiązanie payments–invoices wymaga zgodności firmy przy bezpośrednim INSERT/UPDATE; uprzywilejowany trigger przeliczający saldo też musi respektować tę granicę. Sama poprawka handlera FLO nie chroni bezpośredniego PostgREST.
2. **Przypomnienia.** Ochrona relacji firma–faktura i zasad zmiany pola invoice_id. Obecna unikalność invoice_id+stage może być zajęta przez nieprawidłowe powiązanie. Filtry w schedulerze nie usuwają tego ryzyka blokowania.
3. **Kolejka offline i powiązania korekt.** Ochrona relacji do faktury w samej bazie oraz kontrola pól wpływających na wykonanie uprzywilejowanego zadania. Poprawiony worker ogranicza skutki zatrutych rekordów, lecz nie uniemożliwia ich zapisu przez obecne polityki.
4. **OCR i tożsamość autora.** Potwierdzić niezmienność/pochodzenie created_by oraz zasady zapisu do powiązanych tabel. Kontrola aktywnego członkostwa ogranicza obce konta, ale nie stanowi dowodu, że dany członek wykonał upload.

Rozwiązanie wymaga przejrzenia faktycznych grantów, RLS, triggerów i danych istniejących. Preferowany warunek to spójność złożonej pary (tenant_id, invoice_id) egzekwowana przez bazę lub równoważna wąska operacja z odebraniem niepotrzebnych zapisów bezpośrednich. Uwzględnić UPDATE oraz oba końce relacji. Nie wykonywać automatycznej naprawy/usunięcia zastanych niespójnych rekordów: najpierw zabezpieczyć dowody i ustalić właściwego właściciela.

**Nie utworzono ani nie wykonano SQL/migracji.** Numery migracji nie są rezerwowane. Właściciel przygotowuje osobną, skoordynowaną zmianę schematu, plan sprawdzenia zgodności aplikacji/workera i wycofania.

## Pozostałości z przeglądu

- Stara 14-dniowa sekwencja pocztowa nadal używa usuniętego users.tenant_id; odroczone maile wymagają sprawdzenia aktualnego adresu, członkostwa i zgody. Nie naprawiono tego przez przypadkowe dodanie kolumny lub zmianę docelowego odbiorcy.
- Manualny żeton zgody na przypomnienie jest sprawdzany jako obecność identyfikatora; pełne trwałe powiązanie zgody z treścią/rekordem i ponowieniami pozostaje do zaprojektowania. Nie stwierdzamy, że dowolny użytkownik internetu może sam opublikować event do kolejki.
- Funkcje bez callerów oraz helpery zależne od kontekstu wywołującego są tak oznaczone w rejestrze. Nie stanowią ukończonej ochrony przyszłych funkcji.
- Admin refund pozostaje uprzywilejowanym, poprawnie bramkowanym wejściem; idempotencja Stripe i częściowy zapis po wykonanym zwrocie wymagają oddzielnego przeglądu niezawodności.
- Wyszukanie konta po adresie w webhooku obejmuje dotychczasową stronę 200 użytkowników. Trwała blokada samego adresu działa osobno; obsługa większej liczby kont wymaga docelowego mapowania/paginacji.
- Eksport konta jest ograniczonym zestawieniem technicznym, nie zapewnieniem kompletnej obsługi prawnej wniosku RODO. Retencja, pozostałe kategorie danych, odbiór dostawców i historyczne logi nadal wymagają decyzji właścicieli.
- Wcześniejsze zadania F03: rzeczywisty GoTrue/PKCE/MFA, SRH/Valkey, pełne recovery i odwołanie sesji innego konta pozostają otwarte.

## Odbiór przez Bartka na odseparowanym środowisku

Użyć dwóch firm i fikcyjnych kont z osobnymi JWT, bez prawdziwej poczty, płatności i KSeF. Potwierdzić commit aplikacji/workera i rzeczywisty schemat, nie tylko numer ostatniej migracji.

- Dla każdej wymienionej relacji poprawny zapis we własnej firmie działa, a obcy parent/invoice/user jest odrzucany przez **bezpośredni** INSERT i UPDATE PostgREST.
- Saldo i licznik/etapy faktury B pozostają niezmienione przy próbie działania A. Złośliwy rekord nie zajmuje unikalnego miejsca prawidłowemu przypomnieniu.
- Obie gałęzie offline, failure callback, ponowienie importu i job po odebraniu członkostwa kończą się bez obcego odczytu, modyfikacji, PDF, maila, push lub wysyłki KSeF.
- Sprawdzić rollback backendu Inngest oraz pg-boss, retry po awarii i cache kroków: wynik zapisany przez starą wersję workera nie może omijać nowych warunków.
- FLO odmawia po wyłączeniu funkcji, obcej zgodzie/fakturze i zmianie danych; poprawna własna operacja oraz bezpieczne cofnięcie działają.
- Wykonać negatywne kontrole awarii Auth/bazy, nie tylko scenariusz sukcesu. Udokumentować wynik i identyfikator środowiska bez kluczy ani danych klientów.

Nie zamykać F03 na podstawie samych zielonych testów lokalnych. Wdrożenie i decyzja o ograniczeniu funkcji na czas naprawy bazy należą do właściciela, po osobnej zgodzie.

## Końcowa walidacja i commity

- `9e5fd2bffa751f6a8625865146222d5602733a70` — security: bind exports reminders and offline records to tenant.
- `67eadab4ed950e8f0d944088c0af62cf9cf67dbf` — security: verify tenant ownership before background job effects.
- `ac3bc20138140363e2acef87d73231da88ca1d50` — security: bind FLO approvals execution and undo to tenant.
- `2874fa732f433a4eb958bdfc049b148a232afc98` — security: return an authenticated and bounded account export.
- `574abf6b97dd3b07996bd3a662a17a44b22cf46a` — security: preserve email opt-outs across database and Auth failures.
- `dd616a7e38c4af6cd1a2933ea2e53f49e94d5175` — security: keep audit write failures free of private event data.

- Pełny Vitest: **132 pliki / 2465 testów PASS**, zero pominiętych (o 133 więcej niż baza PR #12).
- XML **66/66 PASS**; narzędzia bezpieczeństwa **67/67 PASS**.
- Pełny typecheck PASS. Pełny lint: **0 błędów / 29 istniejących ostrzeżeń**; wszystkie 44 zmienione lub nowe pliki TS/TSX bez ostrzeżeń.
- Gitleaks kopii 46 przygotowanych plików: **0 trafień**. Odciski 44 plików kodu/testów potwierdzone po commitach; nie dodano wyjątków. Pełna historia do dd616a7:244 commity /10,10 MB, brak trafień. Końcowe dokumenty objęto osobnym skanem przed ich commitem.
- Rejestr 89 ma 89 unikalnych kluczy, brak pominięć i pozycji spoza bazowej listy. Historyczny raport audyt/02-service-role.md pozostał nietknięty.
- Odświeżona niezmieniona heurystyka: 305 zapytań, 217 ok / 64 do przejrzenia / 24 średnie; 103 wejścia / 36 sygnałów. Etykiety wynikają również ze składni, miejsca guardu i nowych helperów, nie z liczby potwierdzonych podatności. Skrypt nie rozpoznaje wszystkich konstrukcji klienta. Ręczny review diffa obejmuje także nowe kontrole.
- Dodatkowy przegląd AI wykrył błąd ignorowanego Auth error po zapisaniu webhooka oraz fikcyjny sukces po przegraniu CAS z odświeżeniem fingerprint. Oba poprawiono i objęto regresjami. Końcowy review bez nowych otwartych uwag w zmienionym zakresie; autor eksportów nie oceniał niezależnie własnego kodu — te trzy moduły osobno sprawdził root. To nie zewnętrzny pentest.

**Kompilacja: NIE POTWIERDZONA.** Cztery próby Next webpack compile w osobnych kopiach nie ukończyły się: dwie jawne awarie pamięci (exit 134), dwie awarie procesu Windows (3221226505). Odczyt systemu wykazał ok. 40 GB pamięci zadeklarowanej przy limicie 42,5 GB; ostatni crash nie dostarczył pełnej diagnozy, więc nie oznaczamy go jako potwierdzonej usterki ani poprawności aplikacji. Próby obejmowały wykonanie osobno, jeden worker/limit heap oraz ostatnią optymalizację webpackMemoryOptimizations wyłącznie w kopii testowej. Repo next.config.ts i ustawienia komputera pozostały nietknięte, nie zamykano cudzych procesów. **Wymagane dokończenie webpack build w środowisku z zasobami przed wydaniem.** Zielone typy/testy nie zastępują kompilacji produkcyjnej.

Dowody lokalne: faktflow-tenant-validation-3aDoO2, faktflow-tenant-offline-m1g3OJ, faktflow-tenant-scan-HlbAeI; próby kompilacji PejmNz/1lPvxI/Cjocm0/fTuEsF. Kopie kompilacji nie zawierały plików .env ani poświadczeń aplikacji. Nie uruchamiano rzeczywistych RLS, Auth, poczty, KSeF, płatności ani workerów.
