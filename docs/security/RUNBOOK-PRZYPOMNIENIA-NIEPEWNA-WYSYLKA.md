# Przypomnienie z niepewnym wynikiem wysyłki

Dotyczy alarmu Sentry `jobs-watchdog: stuck payment_reminders`. Watchdog sprawdza rekordy `pending` starsze niż 30 minut co 15 minut. Alarm zawiera tylko ID przypomnienia, etap, czas zlecenia i `recoveryState`; nie zawiera odbiorcy, treści ani PDF. To alarm do rozliczenia, a nie dowód niedostarczenia wiadomości.

Gdy alarm pokazuje truncated=true, pole totalPending jest większe od liczby pokazanych identyfikatorów albo niezweryfikowane. Limit 50 szczegółów wybiera te same najstarsze rekordy przy kolejnych uruchomieniach; pozostałe nie pojawią się automatycznie. Operator musi osobnym, ograniczonym do organizacji odczytem ustalić całą pulę pending. countVerified=false lub totalPending=null oznacza nieznaną liczność i także wymaga sprawdzenia; nie interpretuj pustych szczegółów jako braku problemu.

## Pierwsze kroki operatora

1. Zachowaj ID, etap, czas alarmu i stan kolejki w zgłoszeniu incydentu. Sprawdź wyłącznie odczytem, czy wiersz `payment_reminders` nadal jest `pending` oraz czy ID zgadza się z `flo_approvals.id`. Nie zmieniaj statusu ani nie usuwaj wiersza.
2. Potwierdź wersję działającej aplikacji i workera oraz backend kolejki. Starszy worker nie zna trwałego `reminderDispatch` i może wysłać inną wiadomość. Przy niepewnej wersji zatrzymaj ręczne ponawianie.
3. Odczytaj znacznik dispatch/receipt w `flo_approvals.snapshot` i sprawdź powiązanie z fakturą, firmą, etapem oraz zgodą. Samo wystąpienie pola w JSON jest tylko wskazówką dla alarmu; pełną walidację robi `readReminderDispatch` w workerze. Nie kopiuj snapshotu ani PDF do Sentry, czatu lub zgłoszenia.

## Decyzja według recoveryState

- `receipt_marker_recorded`: Potwierdzenie przyjęcia przez Resend może już być zapisane, choć historia faktury nadal pokazuje `pending`. Po sprawdzeniu poprawności znacznika i wersji workera ponów **ten sam job** z niezmienionym `reminderId = approvalId`. Worker odczyta zapisane potwierdzenie i dokończy archiwizację/status bez kolejnego `emails.send`. Jeżeli walidacja nie przejdzie, zachowaj stan i wyjaśnij przyczynę przed działaniem.
- `dispatch_without_receipt`: Dostawca mógł przyjąć mail, a odpowiedź lub zapis potwierdzenia mogły zawieść. Sprawdź historię Resend w odpowiednim projekcie i oknie czasu, porównując stały klucz `reminder/<approvalId>` oraz dane zatwierdzonej koperty. Po upływie zgody **nie zlecaj** nowej wysyłki, nie twórz nowego klucza ani nowej zgody. Zarówno potwierdzone przyjęcie, jak i nierozstrzygnięty wynik wymagają kontrolowanego rozliczenia przez właściciela; obecny kod nie ma bezpiecznej operacji ręcznego wpisania receipt.
- `missing_dispatch_or_legacy`: Brak zatwierdzonego dispatch lub starszy rekord. Nie wznawiaj go nowym workerem ani nie kasuj, by zwolnić etap. Sprawdź historyczny job i konto Resend; starsza wersja mogła już wysłać wiadomość.
- `approval_lookup_unavailable`: Nie udało się odczytać rejestru zgód. Potwierdź dostępność bazy i ponów sam odczyt. Nie wyciągaj wniosku o stanie poczty z błędu bazy.

Zapisz w zgłoszeniu źródło i czas potwierdzenia od dostawcy, rozstrzygnięcie oraz osobę podejmującą decyzję. Przyjęcie przez Resend nie jest dowodem doręczenia do skrzynki. Gdy nie można rozstrzygnąć wyniku, zachowaj blokadę etapu i przekaż sprawę właścicielowi. Nigdy nie ustawiaj ręcznie samego `payment_reminders.status = sent`: ten wiersz nie jest autorytatywnym potwierdzeniem wysyłki.

## Ograniczenia

Klasyfikacja watchdoga sprawdza tylko obecność znaczników JSON. Uprawnienia `payment_reminders` i `flo_approvals`, relacje firm oraz działanie Resend/obu backendów kolejki wymagają odbioru na rzeczywistym środowisku przez Bartka. Opis architektury i lista odbioru: [Trwała zgoda na przypomnienia](ZGODA-NA-PRZYPOMNIENIA-2026-09-23.md).
