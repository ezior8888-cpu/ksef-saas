# Stripe — dowód pary PaymentIntent–Charge przed VAT i zwrotem

> **Numeracja od 02.10.2026 (C-20):** migracje z tego dokumentu weszły do `main` pod nowymi numerami — 00083 → **00114**, 00084 → **00115**, 00085 → **00116**. Treść poniżej zostawiona w brzmieniu z 25.09.


Data: 2026-09-25. Stan: lokalny pakiet od roboczego stosu PR #46, bez publikacji,
SQL, Stripe test mode, merge lub wdrożenia. Według datowanego wpisu Bartka na
db-1 wykonano 00078–00082 (w tym produkcyjną 00082 widoku zaległości);
nie sprawdzono tego tu niezależnym odczytem bazy. Lokalne 00083–00085
pozostają niewykonane. Ten dokument nie jest poleceniem uruchomienia migracji.

## Powód i granica zmiany

Podpisane `invoice.payment_succeeded` mogło zapisać płatność tylko z
PaymentIntent. Zewnętrzny zwrot albo spór Stripe może przyjść tylko z Charge.
W takim stanie sprawa trafiała do kwarantanny bez lokalnego `payment_id`, a
blokada VAT i kolejnego zwrotu nie widziała jej po rozłącznych ID. Dwa zwykłe
ciągi ID na fakturze też nie dowodziły, że PI i Charge należą do tej samej
transakcji. To scenariusz wynikający z kodu i recenzji; nie ma dowodu
wystąpienia incydentu produkcyjnego.

Nowy handler dla opłaconej faktury pobiera aktualny PaymentIntent i Charge
przed zapisem `stripe_payments`. Wymaga wzajemnego związku
`PaymentIntent.latest_charge` ↔ `Charge.payment_intent`, tego samego
Customer, waluty, trybu test/live i potwierdzonej kwoty oraz braku zwrotu i
sporu na Charge. Gdy podpisany obiekt niesie tylko jeden ID, drugi można
wyprowadzić wyłącznie z aktualnego obiektu Stripe. Sprzeczność albo
nieobsługiwany kształt oznacza uzgodnienie bez zapisu płatności i bez joba VAT;
awaria odczytu przed skutkiem jest oznaczona do bezpiecznego ponowienia.
Faktura na zero bez referencji i bez wcześniejszej lokalnej płatności jest
potwierdzana bez faktury VAT; zerowa faktura z referencją lub wcześniejszym
wierszem trafia do uzgodnienia.

`00084` (niewykonany plik) dodaje `stripe_payment_refs_verified`, domyślnie
`false`, oraz warunek poprawnych obu pełnych ID. Funkcja blokady finansowej
traktuje każdą płatność inną niż `succeeded` albo bez potwierdzonej pary jako
`held`. Tej samej funkcji używają trigger faktury VAT, trigger claimu zwrotu
i ostatnia kontrola przed wywołaniem Stripe. Nadal obowiązują blokady
powiązanych spraw finansowych po pełnych ID. Historyczne wiersze pozostają
`false` — nie ma automatycznego backfillu z dwóch łańcuchów tekstowych.
Istniejące faktury VAT nie są cofane przez migrację, lecz nowe VAT/zwroty dla
historycznych płatności zostaną zatrzymane do uzgodnienia.

## Wersja webhooka — blokada odbioru dla Basil

`STRIPE_API_VERSION` w kliencie REST jest przypięty do Acacia, ale wersja
zdarzeń endpointu webhook jest konfigurowana oddzielnie w Stripe. Kod
`legacyInvoicePaymentReferences` odczytuje `invoice.payment_intent` i
`invoice.charge`. W Basil pola te usunięto, a `invoice.payments` jest polem
dodatkowym, którego zwykły obiekt faktury nie zwraca domyślnie. Podpisane
dodatnie `invoice.payment_succeeded` z Basil bez starych pól zostanie więc
zatrzymane do uzgodnienia, bez lokalnej płatności i bez joba VAT. To świadoma
blokada, ale z punktu widzenia dostępności rozliczeń jest przeszkodą wdrożenia.

Przed rolloutem Bartek musi odczytowo potwierdzić wersję **samego endpointu**
Stripe i `event.api_version` reprezentatywnej, podpisanej płatnej faktury
testowej, wraz z obecnością bezpośredniej referencji PI lub Charge. Jeżeli
endpoint wysyła Basil lub inny kształt bez tych pól, nie wdrażać tego obrazu
jako automatycznego rozliczania: trzeba najpierw osobno zaimplementować
paginowany odczyt InvoicePayment dla dokładnej faktury, sprawdzenie kwot,
waluty, trybu, statusów i jednoznacznej alokacji, a następnie przetestować
pełną sekwencję. Wiele częściowych płatności, płatność bez PI i customer
credit pozostają do ręcznego uzgodnienia, dopóki model jednej płatności na
fakturę nie zostanie świadomie rozszerzony. Nie wolno domniemywać, że
przypięcie wersji klienta REST zmieni payload istniejącego endpointu.

Źródła Stripe: [zmiana Basil](https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices),
[pole payments faktury](https://docs.stripe.com/api/invoices/object?api-version=2025-07-30.basil),
[InvoicePayment](https://docs.stripe.com/api/invoice-payment/object?api-version=2025-07-30.basil),
[wersja endpointu](https://docs.stripe.com/api/webhook_endpoints).
## Odbiór na kopii bazy i w Stripe test mode

Bartek najpierw ustala datowany stan migracji db-1 i SHA webu/workera w
Coolify, szczególnie `00078`, oraz potwierdza kopię i odtworzenie. Należy
odczytowo policzyć: `succeeded` z samym PI, samym Charge, obiema referencjami,
bez żadnej; wiersze z VAT, refundem, otwartą sprawą finansową i failed receipt.
Raport liczb bez NIP-ów, danych klientów, sekretów ani payloadów. Trzeba
ustalić, które historyczne płatności i joby zatrzyma nowy domyślny `false`;
brak możliwości rozliczenia takiego backlogu jest warunkiem zatrzymania
rolloutu, nie powodem do masowego ustawienia flagi.

Na odizolowanej kopii i przy fikcyjnych identyfikatorach sprawdzić:
- `failed` z Charge A → kolejne `failed` B → `succeeded` z PI/Charge B:
  referencje rotują tylko przed sukcesem, stare sprawy/refundy/VAT nie tracą
  powiązania, flaga staje się `true` dopiero po sprawdzeniu Stripe.
- Płatność PI-only oraz zewnętrzny spór/zwrot Charge-only przed jobem VAT:
  brak nowej faktury VAT i brak claimu kolejnego zwrotu. Analogicznie dla
  Charge-only/PI-only i dwóch zwykłych, ale sprzecznych ID.
- Brak/dysfunkcja jednego odczytu Stripe przed pierwszym zapisem: brak
  `stripe_payments` i joba, receipt może bezpiecznie ponowić zdarzenie.
  Niezgodność PI–Charge albo Customer/kwoty jest zatrzymana do ręcznej oceny.
- Zdarzenie po powstaniu lokalnej płatności, równoległy upsert i zapis sprawy
  Charge-only/PI-only: blokady referencji nie dopuszczają nowego VAT/zwrotu.
  To wymaga prawdziwego PostgreSQL w dwóch sesjach; testy jednostkowe tego
  nie dowodzą.
- Zerowa faktura trial/rabat bez historii nie wytwarza płatności ani VAT.
  Zerowa faktura z dawną nieudaną płatnością nie ukrywa tej historii.
- Rolą `authenticated` nie można ustawić flagi ani zmienić finansowych
  referencji. Weryfikacja pary przez operatora nie polega na zgodności
  prefiksów ID: potrzebny jest aktualny dowód Stripe i zgodność z fakturą.

Przed rolloutem odciąć stare instancje zapisujące `stripe_payments`, wstrzymać
webhook i joby VAT/zwrotów, wdrożyć zgodny obraz i migracje w kolejności
potwierdzonej na kopii, odświeżyć cache schematu PostgREST dla nowej kolumny,
a potem sprawdzić test mode oraz stopniowo wznowić odbiór. `00084` i
`00085` są jawnie transakcyjnymi plikami, lecz sama kontrola składni i
testy mockowane nie zastępują próby na PostgreSQL. Starszy obraz z nową
kolumną może zapisywać płatności jako `false` i zatrzymać ich VAT; nie należy
traktować rollbacku obrazu jako bezpiecznego przywrócenia działania.

## Uzgadnianie i granice

Historyczne `succeeded` wymagają porównania pełnego ID faktury, PI i Charge
z aktualnymi obiektami Stripe oraz lokalnymi refundami, sporami, VAT i
receiptami. Dopiero udokumentowany dowód pary uzasadnia kontrolowane
ustawienie flagi dla konkretnej płatności; nie robić masowej aktualizacji,
nie usuwać `evt_*` i nie odtwarzać jobów w ciemno. Jeśli źródła się różnią,
zatrzymać dalszy zwrot/VAT i przekazać sprawę operatorowi oraz księgowemu.
Sam kod nie koryguje automatycznie już wystawionej faktury, a Stripe i
Postgres nie mają wspólnej transakcji. Nie potwierdzono faktycznego formatu
webhooków ani wyniku test mode na tym serwerze.

Źródła kontraktu Stripe:
[PaymentIntent i latest_charge](https://docs.stripe.com/api/payment_intents/object),
[Charge i payment_intent](https://docs.stripe.com/api/charges/object),
[Dispute i nullable payment_intent](https://docs.stripe.com/api/disputes/object).