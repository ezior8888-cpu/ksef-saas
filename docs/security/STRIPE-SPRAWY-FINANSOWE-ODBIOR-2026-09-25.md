# Stripe: odbiór zewnętrznych zwrotów i sporów (00080)

**Status:** pakiet kodu i migracji przygotowany lokalnie. Codex nie uruchomił SQL, Stripe test mode ani produkcji. Stan 00078 na db-1 jest niepotwierdzony; traktujemy ją i zależną 00079 jako niewdrożone. Merge do gałęzi release nie jest dowodem wykonania migracji.

## Zachowanie

Podpisany webhook przejmuje zdarzenia refund.created, refund.updated, refund.failed, charge.refund.updated oraz charge.dispute.created, updated, closed, funds_withdrawn i funds_reinstated. Pobiera aktualny obiekt Refund lub Dispute ze Stripe i zapisuje go po pełnym ID w stripe_financial_cases. Dopasowanie do płatności wymaga pełnego PaymentIntent lub Charge, jednej jednoznacznej płatności i zgodnej kwoty oraz waluty. Metadane, e-mail i skrócone numery nie ustalają firmy. Brak lub konflikt danych, a także nieznany status, trafia do kwarantanny. Webhook może być processed po trwałym zapisaniu sprawy, chociaż sprawa nadal wymaga człowieka.

Brama bazy utrzymuje hold także dla sprawy otrzymanej przed lokalną płatnością. Faktura VAT i nowy zwrot administratora sprawdzają hold pod blokadą płatności oraz pełnych referencji. Ręczny przegląd zamyka alarm, ale nie usuwa historycznego hold. Późniejsze dopasowanie płatności ponownie otwiera reviewed, tak samo nowe zdarzenie funds_withdrawn lub funds_reinstated, nawet gdy status sporu się nie zmienił. Spór nie jest refundem; nie ma automatycznej korekty VAT ani drugiego refunds.create. Poprawny zwrot administratora może zostać automatycznie oznaczony settled tylko po zgodnym lokalnym zapisie i stanie Stripe. Bezpośrednio przed refunds.create osobny preflight ponownie sprawdza aktywny hold pod blokadą płatności i pełnych referencji; wynik inny niż clear kończy lokalną operację stanem do uzgodnienia. Blokada kończy się przed sieciowym wywołaniem Stripe, więc późniejsze zdarzenie nadal może się z nim ścigać.

Sygnał charge.refunded nie jest subskrybowany w tym pakiecie. Jedno zdarzenie może dotyczyć wielu częściowych zwrotów; kilka osobnych zapisów mogłoby skończyć się częściowym wynikiem i zablokowanym receipt. Pokrycie dają pojedyncze refund.*. Okresowe porównanie historii Stripe z bazą pozostaje osobnym zadaniem.

## Odczytowy preflight Bartka

1. Potwierdzić dokładny SHA webu i workera w Coolify, migracje 00075–00079 faktycznie wykonane na db-1, zwłaszcza 00078, oraz działającą kopię i próbę restore.
2. W Stripe sprawdzić aktywny endpoint, subskrybowane typy, event.api_version i reprezentatywne podpisane invoice.payment_succeeded z pełnym PaymentIntent lub Charge. Klient REST jest przypięty do 2024-11-20.acacia; wersja snapshotu webhooka jest osobna. Basil+ ma inny model Invoice Payments, którego lokalny wiersz jednej płatności na fakturę nie obsługuje automatycznie.
3. Odczytowo policzyć płatności bez obu referencji, niejednoznaczne stripe_charge_id, zwroty częściowe, wcześniejsze faktury VAT, niepewne operacje zwrotu i historyczne spory. Porównać pełne ID z obiektami Stripe.
4. Na kopii potwierdzić uprawnienia: anon i authenticated nie widzą spraw; service_role może odczytać sprawy i wywołać wyłącznie przewidziane RPC; ręczny przegląd dostępny jest tylko właścicielowi bazy. Historię przeglądów trzeba sprawdzić jako append-only.

## Próba przed produkcją

W dwóch sesjach osobnego Postgresa przetestować oba porządki: zwrot/spór przed lokalną płatnością i po niej, równoległy zapis sprawy i faktury VAT oraz claim administracyjnego zwrotu. Zatrzymać transakcję po znalezieniu referencji, przed commit, i dowieść, że drugi tor nie wystawi faktury ani nowego zwrotu. Objąć dwa identyfikatory naraz, Charge bez unikalnego indeksu, konflikt PI/Charge, brak referencji i historyczne wiersze.

W Stripe test mode sprawdzić zwrot pełny i częściowy, pending przechodzący w succeeded/failed, status null, duplikaty, odwróconą kolejność, spór won/lost, funds_withdrawn/funds_reinstated przy niezmienionym statusie, webhook przed odpowiedzią admina i po niej, preflight odmawiający przy nowym hold, błędy po lokalnym zapisie oraz oba backendy jobów. Na kopii sprawdzić review ze starym candidate count/ID, późną płatność po review i równoległy review z nową płatnością. Kwarantanna z webhookiem processed nadal musi uruchomić licznikowy alarm Slack/Sentry; sprawdzić realne doręczenie, nie tylko test jednostkowy.

Gdy obiekt Stripe nie ma żadnego pełnego PI/Charge, nie ma bezpiecznego klucza do zablokowania konkretnej obcej płatności. Taka sprawa wymaga natychmiastowego ręcznego porównania i, jeśli nie da się jej zawęzić, decyzji o wstrzymaniu automatycznego fakturowania. Nie włączać globalnej blokady wszystkich firm bez decyzji właściciela.

## Uzgodnienie i rollout

Operator sprawdza pełne re_ lub du_ w Stripe, aktualny status, PI/Charge, kwotę, walutę, lokalną płatność, wcześniejsze zwroty oraz VAT/KSeF. Dowód i decyzję przechowuje poza publicznym repo. Właściciel bazy może użyć review_stripe_financial_case z rzeczywistym reviewer_user_id, oczekiwanym statusem, ID ostatniego podpisanego zdarzenia, oczekiwaną liczbą kandydatów i ID płatności (ID tylko przy dokładnie jednym kandydacie), odwołaniem do dowodu i uzasadnieniem. Kolejność argumentów RPC: stripe_object_id, reviewer_user_id, expected_stripe_status, expected_last_event_id, expected_candidate_count, expected_candidate_payment_id, evidence_reference, reason. Wyniki match_changed lub observation_changed oznaczają, że po preflightcie zmieniła się płatność albo obserwacja Stripe: trzeba odczytać sprawę ponownie i ponowić ocenę, a nie zamykać alarm. RPC zapisuje append-only historię, pozostawia hold i nie poprawia faktury. Nowa materialna zmiana ponownie otwiera sprawę. Korektę VAT zatwierdza księgowy. Nie resetować failed/processing webhooka ani nie ponawiać refunds.create bez uzgodnienia skutków. Jeśli finansowy receipt jest failed/processing bez trwałej sprawy, alert nie stanowi hold dla konkretnej płatności: Bartek musi pilnie porównać pełne ID w Stripe i bazie oraz wstrzymać automatyczne fakturowanie/zwroty do czasu ustalenia zakresu. Niepewna odpowiedź po RPC celowo nie jest automatycznie ponawiana; potrzebny jest osobny, audytowalny mechanizm odzyskiwania takiego receiptu.

Po potwierdzeniu wcześniejszych migracji, testu dwóch sesji i restore Bartek wdraża 00080 ze zgodnym webem oraz workerem w kontrolowanym oknie, a dopiero potem włącza nowe typy webhooka. Stary obraz ignorujący te typy nie jest bezpiecznym rollbackiem po zmianie bazy. Po wznowieniu porównać liczniki spraw, receiptów i alarmów ze Stripe. Bez dowodu zgodnego formatu endpointu pakiet pozostaje nieodebrany.

## Granice

Stripe i Postgres nie mają wspólnej transakcji. Faktura VAT powstała przed dostarczeniem refundu wymaga oceny księgowej; 00080 jej nie cofa. Migracja nie odtwarza historycznych zdarzeń. Kod nie dowodzi, że produkcyjny endpoint subskrybuje typy albo że otrzymał dawne eventy. Odczytowy sweep historii Stripe i procedura brakujących dostaw pozostają do zrobienia.

Źródła: [typy zdarzeń](https://docs.stripe.com/api/events/types), [webhooki](https://docs.stripe.com/webhooks), [Refund](https://docs.stripe.com/api/refunds/object), [Dispute](https://docs.stripe.com/api/disputes/object), [zmiana Invoice Payments w Basil](https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices).
