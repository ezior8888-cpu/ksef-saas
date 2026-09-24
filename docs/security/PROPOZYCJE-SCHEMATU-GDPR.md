# Propozycje zmian schematu dla właściciela repo

Stan: 2026-09-10. To dokument projektowy, nie migracje do automatycznego uruchomienia.

Kod GDPR w tej gałęzi wymaga zmian opisanych poniżej. Bartosz powinien przygotować własne pliki migracji, uzgodnić ich numery z aktualną bazą i skoordynować wydanie aplikacji oraz workera. Nie uruchomiono SQL ani nie wdrożono kodu. Po zmianie na hash stara wersja aplikacji nie obsługuje nowej kolumny.

Wcześniejsze numery 00070/00071 są tylko roboczymi odwołaniami z dziennika — nie rezerwują numeracji. Pliki powstały przed otrzymaniem nowej instrukcji Igora zakazującej tworzenia migracji; zostały przeniesione tutaj, poza katalog wykonywalnych migracji.

## 00070_gdpr_cancel_token_hash.sql

```sql
-- SEC-C-04: baza przechowuje tylko SHA-256 tokenu anulowania usunięcia konta.
-- PRZYGOTOWANE, NIE WYKONANE. Wdrożenie należy do właściciela repo.
--
-- Zmiana wymaga skoordynowanego wydania lib/gdpr/deletion.ts. Na czas
-- transakcyjnej migracji i wymiany aplikacji/workera należy wstrzymać
-- obsługę żądań GDPR. Stara aplikacja używa kolumny cancel_token i po
-- migracji nie obsłuży tych żądań; nowa wymaga cancel_token_hash.
--
-- Backfill zachowuje ważność już wysłanych linków: aplikacja hashuje token
-- z maila w dokładnie ten sam sposób. Nie zostawiamy kopii plaintext.
-- SHA-256 działa na tekście HEX tokenu, nie na bajtach po dekodowaniu HEX.
-- Używamy wbudowanego sha256(bytea), więc nie zależymy od schematu pgcrypto.
--
-- UWAGA: rollback aplikacji do wersji plaintext nie jest możliwy przez
-- odwrócenie tej migracji (SHA-256 jest jednokierunkowy). W razie problemu
-- poprawić kod zachowując schemat hash; nie odtwarzać plaintext z backupu.

ALTER TABLE public.gdpr_deletion_requests
  RENAME COLUMN cancel_token TO cancel_token_hash;

UPDATE public.gdpr_deletion_requests
SET cancel_token_hash = encode(sha256(convert_to(cancel_token_hash, 'UTF8')), 'hex');

ALTER INDEX public.idx_gdpr_deletion_cancel_token
  RENAME TO idx_gdpr_deletion_cancel_token_hash;

ALTER TABLE public.gdpr_deletion_requests
  ADD CONSTRAINT gdpr_cancel_token_hash_format
  CHECK (cancel_token_hash ~ '^[a-f0-9]{64}$');

COMMENT ON COLUMN public.gdpr_deletion_requests.cancel_token_hash IS
  'SHA-256 plaintext tokenu z linku anulowania, lowercase hex. Nigdy token do bezpośredniego użycia.';

```

## 00071_gdpr_processing_claim.sql

```sql
-- GDPR: atomowe przejęcie pending -> processing przed usuwaniem konta.
-- PRZYGOTOWANE, NIE WYKONANE. Wdrożenie należy do właściciela repo.
--
-- Migracja addytywna. Wdrożyć po 00070 i przed nową wersją aplikacji/workera.
-- Transakcję należy zatwierdzić przed pierwszym użyciem nowej wartości ENUM.
-- Sama migracja nie wpisuje wartości processing do żadnego rekordu.
--
-- Worker zmienia status warunkowym UPDATE wyłącznie dla pending oraz
-- scheduled_for <= now. Anulowanie też wymaga pending; jedna operacja wygrywa.
-- Drugi worker / retry nie podejmie processing, failed ani executed ponownie.
--
-- Awaria procesu po przejęciu pozostawia processing_started_at do diagnostyki.
-- TAKI REKORD WYMAGA KONTROLI OPERATORA: sprawdzić obecność konta Auth i stan
-- anonimizacji audytu, dopiero potem ustalić stan końcowy. Nie automatyzować
-- cofania do pending na podstawie samego wieku rekordu — usunięcie mogło
-- zakończyć się przed awarią, a jego ponowienie wymaga osobnej decyzji.
--
-- Rollback: zatrzymać nowe joby, zachować processing i kolumnę diagnostyczną.
-- Stary kod nie może bezpiecznie obsługiwać tych żądań: nie ma atomowego claimu.

ALTER TYPE public.gdpr_deletion_status ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE public.gdpr_deletion_requests
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gdpr_deletion_requests.processing_started_at IS
  'Czas atomowego przejęcia żądania przez worker. Osierocony processing wymaga ręcznej kontroli, bez automatycznego retry.';

```

## Jedno aktywne żądanie na użytkownika — wymagana część zmiany

Kod `createGdprRequest` wymaga poniższego ograniczenia. Bez niego równoległe
zgłoszenia mogłyby utworzyć dwa żądania, a anulowanie jednego nie powstrzymałoby
drugiego. Konflikt `23505` aplikacja obsługuje odczytem istniejącego żądania;
nie podmienia jego tokenu ani terminu. Stan `processing` również zajmuje miejsce
aktywnego żądania i blokuje tworzenie kolejnego podczas usuwania konta.

Przed przygotowaniem migracji właściciel powinien ocenić ewentualne istniejące
duplikaty. Odczyt diagnostyczny po dodaniu i zatwierdzeniu wartości `processing`:

```sql
SELECT user_id, count(*) AS active_requests
FROM public.gdpr_deletion_requests
WHERE user_id IS NOT NULL AND status IN ('pending', 'processing')
GROUP BY user_id
HAVING count(*) > 1;
```

Nie proponujemy automatycznego kasowania ani wyboru „najnowszego” duplikatu.
Trzeba uwzględnić wcześniejsze anulowania i faktyczną decyzję użytkownika.
Nierozstrzygnięte duplikaty blokują wydanie; nowy kod przy wielokrotnym wyniku
odczytu odmawia utworzenia następnego żądania.

Po rozstrzygnięciu duplikatów — propozycja dla właściciela, nie wykonany SQL:

```sql
CREATE UNIQUE INDEX idx_gdpr_one_active_request_per_user
ON public.gdpr_deletion_requests (user_id)
WHERE user_id IS NOT NULL AND status IN ('pending', 'processing');
```

Wartość ENUM `processing` musi być zatwierdzona w osobnej wcześniejszej
transakcji, zanim zostanie użyta w predykacie indeksu. Całość (hash, processing,
kolumna diagnostyczna i powyższa unikalność) jest wymaganą zależnością nowego kodu.

Istniejącego tokenu nie obracamy przy ponownym żądaniu. Jeśli nowy email nie
zostanie wysłany, UI pokazuje ten fakt i zapewnia anulowanie w ustawieniach
przez zweryfikowaną sesję oraz aktualne hasło. Awaria poczty nie odbiera więc
użytkownikowi możliwości wycofania decyzji.
