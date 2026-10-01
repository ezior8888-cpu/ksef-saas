# C-11 — kolejność wdrożenia granicy zapisu kosztów KSeF

To jest instrukcja dla właściciela wdrożenia. Codex przygotowuje pliki migracji, ale **nie uruchamia SQL**, nie scala PR i nie wdraża aplikacji. Stan kodu z PR nie dowodzi stanu db-1 ani uruchomionego webu.

## Bramka przed zmianą

Bartek potwierdza datą i SHA uruchomiony web oraz stan migracji `00099`, `00100` i `00101` na db-1. Sprawdza też, czy `00100` nie została już uruchomiona w poprzedniej wersji. Jeśli została, **nie uznawać edycji historycznego pliku za wdrożoną zmianę**: trzeba przygotować nową migrację instalującą RPC, a pełny guard odsunąć do kolejnego numeru. Bez tego nie przechodzić do następnego etapu. Weryfikacja uprawnień `service_role` i kopia zapasowa należą do zwykłej procedury wdrożeniowej Bartka.

## Etapy, w tej kolejności

1. **Baza, etap 1:** Bartek stosuje `00100_ksef_expense_provenance_guard.sql`. Zachowuje ona dotychczasową częściową ochronę bezpośrednich aktualizacji, blokuje klientowi tworzenie kosztów i instaluje `review_ksef_expense(...)`, po czym wysyła `NOTIFY pgrst, 'reload schema'`. Stary web może wciąż edytować koszty KSeF. Bartek potwierdza istnienie funkcji, uprawnienie wyłącznie `service_role` i brak błędów migracji. Przed webem sprawdza też widoczność RPC **przez PostgREST** z rolą serwisową, na nieistniejących identyfikatorach: oczekiwana jest odmowa członkostwa `42501` bez zapisu, a nie `PGRST202` (brak funkcji w cache). Klucza roli serwisowej nie wpisywać do raportu ani historii poleceń.
2. **Web:** po potwierdzeniu etapu 1 Bartek wdraża wersję webu, której akcja przeglądu używa RPC dla kosztów KSeF. Sprawdza edycję zwykłego kosztu, KSeF PLN, bezpieczne wyłączenie historycznego FX i ręczny przegląd FX z kursem. Sprawdza, że odmowa dostępu do obcej organizacji oraz nieaktualny formularz nie zmieniają kosztu. Każdy udany zapis KSeF ma odpowiadający mu wpis w `audit_logs`; nie przekazuje surowych danych faktur w raporcie z odbioru. Worker nie potrzebuje RPC do tworzenia kosztu.
3. **Baza, etap 2:** dopiero gdy nowy web działa, Bartek stosuje `00101_ksef_expense_full_update_guard.sql`. Teraz próba bezpośredniego `UPDATE`/`DELETE` kosztu KSeF przez `authenticated` musi dostać odmowę `42501`; zwykły koszt pozostaje edytowalny w granicy RLS. Weryfikuje ponownie legalną edycję KSeF przez RPC i jej atomowy audyt.

Nie stosować obu migracji hurtowo przed etapem web. Jeśli merge do `main` automatycznie uruchamia Coolify, Bartek musi świadomie ułożyć kolejność bazy i obrazu webu przed scaleniem. Brak potwierdzenia etapu oznacza wstrzymanie kolejnego, nie domniemanie powodzenia.

## Awaria i cofnięcie

Przed `00101` można wrócić do starego webu, bo `00100` nadal pozwala starej ścieżce na legalną edycję, choć częściowa luka księgowa pozostaje. Po `00101` stary web nie obsłuży edycji kosztu KSeF. Najpierw przywrócić działający web z RPC; jeśli to niemożliwe, właściciel przygotowuje osobną awaryjną migrację przywracającą częściowy guard z etapu 1, odnotowując czas ponownego otwarcia tej luki. Nie edytować ani nie ponawiać historycznych plików jako pozornego rollbacku.

Ta granica zapisu nie rozstrzyga zasad odliczenia VAT i historycznych przeliczeń FX. Pozostają do decyzji Igora i księgowej zgodnie z `KSEF-INBOX-WALUTA-ODBIOR-2026-10-01.md`.
