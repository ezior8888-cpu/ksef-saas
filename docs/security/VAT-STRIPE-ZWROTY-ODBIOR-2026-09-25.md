# Odbiór granicy faktura VAT – zwrot Stripe (00079)

Stan na 2026-09-25: kod i migracja są przygotowane lokalnie. Żaden SQL nie został uruchomiony przez Codex. Igor potwierdził, że 00078 jest scalona do release/2026-09-25-maslo, lecz nie ma potwierdzenia wykonania na db-1 i nie znajduje się na main. Do czasu dowodu należy traktować 00078 jako niewdrożoną. PR #34 i #35 skierowano celowo na main; ich otwarcie i konflikt w GitHubie nie dowodzą, jaki obraz działa na serwerze.

## Po co ta zmiana

Stary job tworzył nagłówek faktury, pozycję i link do płatności osobnymi zapisami. W tej luce admin mógł rozpocząć zwrot, choć automatyczna faktura VAT powstawała równolegle. Ponowienie webhooka bez wiarygodnego paid_at mogło użyć innego miesiąca i nadać drugą numerację tej samej płatności. Nowe RPC blokują ten sam wiersz stripe_payments, a pełny Stripe invoice ID jest unikalnym identyfikatorem faktury. Data zapłaty musi pochodzić z podpisanej faktury Stripe i utrwalonego wiersza. W razie konfliktu automat zatrzymuje się do uzgodnienia.

00079 zależy od 00075–00078, w tym tabeli stripe_subscription_sync_leases z 00078. Nie należy jej stosować przed potwierdzeniem wszystkich wcześniejszych migracji i wdrożenia zgodnego webu/workerów. Stary kod refundu wykonuje bezpośredni INSERT do stripe_refund_operations, którego 00079 zabrania. Należy zatem wyłączyć stare instancje i wejścia przed przełączeniem. SECURITY DEFINER wymaga uprzywilejowanego właściciela funkcji; nie stosować migracji jako service_role.

## Preflight Bartka na kopii bazy

1. Potwierdzić rzeczywisty obraz webu i workera, SHA wdrożenia PR #35, historię migracji, wartość FAKTFLOW_OPERATOR_TENANT_ID we wszystkich instancjach i obecność obiektów 00075–00078 na db-1. Sam merge do gałęzi release nie potwierdza wykonania SQL.
2. Wykonać i odtworzyć kopię bazy; zmierzyć czas tworzenia dwóch unikalnych indeksów z 00079 oraz sprawdzić granty i RLS. W razie duplikatów indeks ma zatrzymać migrację, nie naprawiać historii automatycznie.
3. Odczytowo wykryć powielone vat_invoice_id w stripe_payments, faktury operatora z pełnym Stripe ID tylko w notes/fa3_data i bez linku, faktury już powiązane z inną płatnością, brakujące paid_at, różnice kwoty/waluty/nabywcy/subskrypcji/Customer, istniejące refund claims oraz późne zwroty. Każdy przypadek rozliczyć z dowodem Stripe i istniejącym dokumentem KSeF; nie odtwarzać tożsamości z ostatnich 8 znaków numeru.
4. Na kopii sprawdzić uprawnienia anon/authenticated/service_role: bezpośredni zapis pełnego ID, zmiana chronionych pól i pozycji faktury, zmiana linku płatności oraz direct INSERT refund claim mają być odrzucane albo bezpiecznie ignorowane. Wewnątrz RPC poprawny zapis ma działać. Sprawdzić zachowanie ponowionego webhooka po wystawieniu faktury — nie może zniknąć vat_invoice_id.
5. Na dwóch sesjach Postgres przećwiczyć wyścig: faktura najpierw → refund zwraca invoice_exists, bez Stripe call; refund claim najpierw → VAT RPC odmawia. Sprawdzić też błąd po nagłówku/pozycji: rollback nie może zostawić osieroconego dokumentu. Są to testy na kopii, których hermetyczne testy TypeScript nie zastępują.
6. W Stripe test mode i KSeF TEST sprawdzić prawidłową datę paid_at, brak daty, ponowienie po zmianie miesiąca, kolizję krótkiego numeru przy dwóch pełnych ID, częściowy/zewnętrzny zwrot, chargeback, niepewny enqueue i statusy KSeF. Księgowy powinien zatwierdzić stałe 23% VAT oraz moment wystawienia/korekty.

## Kolejność wydania

Wstrzymać webhooki Stripe, nowe Checkout, admin refund i oba backendy jobów; doprowadzić stare instancje do końca. Potwierdzić 00078 na db-1 i przejść preflight. Właściciel stosuje 00079 na kopii, a po odbiorze na serwerze w kontrolowanym oknie. Wymienić komplet webu i workerów na dokładnie zatwierdzony obraz z nowymi RPC; dopiero potem otworzyć wejścia. Potwierdzić wyniki prób testowych, liczniki alertów oraz pełne ID w nowych fakturach. Nie mieszać starych i nowych instancji podczas tej zmiany.

Jeżeli link VAT jest zapisany, lecz vat_invoice_submitted_at pozostaje NULL ponad 15 minut od utworzenia faktury, monitor alarmuje. Operator ustala z kolejki i KSeF, czy event dotarł. Nie ponawia wysyłki automatycznie: po utracie odpowiedzi mogła już nastąpić. Starsze dokumenty mogły mieć znacznik zapisany przed emisją; ich stan trzeba sprawdzić osobno. Jeżeli konfiguracja operatora zniknie, automatyczny admin refund bezpiecznie odmówi i wymaga ręcznego uzgodnienia.

## Awaria i granice

Przy błędzie ponownie zamknąć wejścia, zachować webhook receipts, refund claims, logi jobów i faktury. Nie resetować claimów ani nie ponawiać refunds.create. Sam rollback obrazu aplikacji po 00079 nie przywróci starego INSERT refund claim; wybrać poprawkę do przodu lub wcześniej przećwiczony rollback bazy wykonany przez właściciela. Zewnętrzna wysyłka KSeF nie jest w tej zmianie transakcyjnym outboxem; alert i ręczne uzgodnienie są jawnie pozostającą granicą. Zewnętrzne refundy/chargebacki oraz trwały Checkout claim poza godziną wymagają osobnego etapu.