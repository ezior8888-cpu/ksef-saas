# Zwroty i spory Stripe — procedura operacyjna

Ten dokument opisuje ręczne uzgadnianie płatności, zwrotów i sporów. Zasady
biznesowe są w [polityce zwrotów](../support/refund-policy.md); jej ostateczną
wersję i skutki podatkowe musi zatwierdzić właściwa osoba. Przed użyciem
funkcji administracyjnej potwierdź, jaki obraz aplikacji i które migracje
faktycznie działają na serwerze. Samo scalenie kodu nie potwierdza wdrożenia
ani stanu bazy.

**Granica obecnej automatyzacji:** webhook obsługuje płatności i subskrypcje,
ale refund.created, refund.updated, refund.failed, charge.refunded oraz
charge.dispute.* pomija bez zapisu. Zwrot wykonany w Stripe Dashboard i spór
mogą więc nie pojawić się w lokalnych tabelach i nie wywołają obiecanego tu
wcześniej alertu, maila ani korekty. Do czasu odbioru osobnej obsługi tych
zdarzeń Stripe Dashboard i ręczne uzgodnienie są obowiązkowe. Nie zakładaj,
że migracja 00078 lub 00079 jest na produkcji bez potwierdzenia właściciela
bazy.

## Zasady przed każdą operacją

1. Ustal pełne identyfikatory: lokalny payment ID i tenant ID oraz identyfikatory
   Stripe invoice, PaymentIntent lub Charge. Sam email, ostatnie znaki numeru
   faktury albo metadata Stripe nie wystarczają do przypisania płatności.
2. Sprawdź w Stripe **aktualny** stan płatności, wszystkie refundy, ewentualny
   dispute, kwoty i walutę. W bazie porównaj stripe_payments, stripe_refunds,
   stripe_refund_operations oraz powiązaną fakturę VAT i jej status KSeF.
3. Jeżeli stan Stripe i bazy się różni, jest zwrot pending/requires_action,
   niepewny claim, spór lub faktura VAT, zatrzymaj nowy automatyczny zwrot.
   Zapisz sprawę do uzgodnienia z identyfikatorami i czasem odczytu; nie
   ponawiaj refunds.create ani nie usuwaj claimu lub rekordu webhooka.
4. Zwrotu nie uznawaj za wykonany tylko dlatego, że wysłano żądanie. Do sumy
   środków zwróconych wliczaj wyłącznie refundy ze statusem succeeded. Stany
   pending/requires_action wymagają obserwacji, a failed/canceled wyjaśnienia.
   Pełny i częściowy zwrot rozróżniaj po sumie potwierdzonych kwot w Stripe.
5. Nie zmieniaj ręcznie statusu płatności ani faktury na podstawie samego
   runbooka. Korektę danych i dokumentu VAT ustala uprawniona osoba na
   podstawie dowodów Stripe, księgowych i KSeF, z zapisem audytowym.

## Zwrot z panelu administratora

Panel administratora oferuje **pełny** zwrot płatności. Częściowy zwrot nie
jest jego funkcją. Przed kliknięciem sprawdź identyfikatory i historię jak
wyżej oraz upewnij się, że wdrożona wersja ma trwały claim zwrotu i zgodną
migrację. Jeżeli akcja pokazuje processing, reconciliation_required, brak
konfiguracji operatora lub istniejącą fakturę VAT, nie próbuj obejść blokady
w Stripe Dashboard bez odrębnej decyzji i planu uzgodnienia.

Po akcji zapisz identyfikator refundu z odpowiedzi, sprawdź jego bieżący
status w Stripe i porównaj z wpisem stripe_refunds, stanem
stripe_refund_operations i stripe_payments. Potwierdzenie dla klienta
przekaż dopiero po stanie succeeded i sprawdzeniu, czy wcześniejszy mail już
wyszedł. W razie błędu aplikacji lub niepewnej odpowiedzi Stripe najpierw
szukaj istniejącego refundu po PaymentIntent/Charge, kwocie i czasie
operacji; kolejny klik może oznaczać drugi przepływ finansowy.

## Zwrot wykonany poza aplikacją

Gdy uprawniony operator musi użyć Stripe Dashboard, najpierw sprawdza tam
wszystkie dotychczasowe refundy i dispute dla dokładnej płatności, zatwierdzoną
kwotę oraz potrzebę korekty VAT. Po operacji zapisuje pełny refund ID, kwotę,
walutę, status i czas. Następnie porównuje je z lokalnym payment ID,
stripe_refunds oraz stripe_refund_operations. **Nie oczekuj automatycznego
odzwierciedlenia zewnętrznego zwrotu w bazie ani automatycznego maila.**

Jeżeli lokalna płatność nadal ma status succeeded, nie traktuj go jako dowodu,
że pieniądze nie zostały zwrócone. Oznacz rozbieżność do ręcznego uzgodnienia;
powstrzymaj kolejne zwroty i przekaż identyfikator płatności osobie
obsługującej kolejkę, aby sprawdziła ewentualny job fakturowania przed
wysyłką do KSeF. Zaplanuj kontrolowaną korektę lokalnych danych, jeżeli
uprawniony właściciel bazy ją zatwierdzi. Gdy refund jest pending, sprawdzaj
go ponownie do stanu końcowego; nie dopisuj go jako potwierdzonej kwoty.
Poinformuj klienta o rzeczywistym stanie, bez obietnicy zakończenia zwrotu.

## Faktura VAT a zwrot

Zwrot nie kasuje wystawionej faktury VAT ani wysyłki do KSeF. Sprawdź, czy
stripe_payments.vat_invoice_id prowadzi do dokumentu, czy dokument mógł
powstać bez linku oraz jaki ma stan KSeF. Decyzję o potrzebie, zakresie i
momencie korekty podejmuje księgowy lub uprawniony operator na podstawie
rzeczywistego zwrotu. Nie twórz automatycznie drugiej faktury ani korekty
bez potwierdzenia tożsamości płatności i dokumentu. Przy niepewnej wysyłce
do KSeF najpierw uzgodnij kolejkę i KSeF; ponowne wysłanie mogłoby zdublować
dokument.

## Dispute / chargeback

Nie polegaj na webhooku ani alercie Slack jako jedynym źródle zgłoszeń.
Sprawdzaj powiadomienia i listę sporów bezpośrednio w Stripe Dashboard,
szczególnie po zgłoszeniu klienta lub rozbieżności salda. Dla każdego sporu
zapisz dispute ID, Charge/PaymentIntent, kwotę, walutę, aktualny status,
termin odpowiedzi i dostępne dowody. Termin, opłata i wpływ na saldo są
zależne od konkretnej sprawy — odczytaj je w Stripe, zamiast używać stałych
kwot lub dni z dawnej instrukcji.

Właściciel sprawy decyduje, czy przedstawić dowody czy zaakceptować spór.
Zbieraj tylko potrzebne, wiarygodne materiały i ogranicz dane osobowe.
Zweryfikuj rozliczenie płatności, refundy i fakturę VAT przed działaniem.
Nie blokuj konta ani nie anuluj subskrypcji automatycznie wyłącznie z powodu
otwarcia sporu; oceń ryzyko dostępu i podejmij udokumentowaną decyzję.
Po zamknięciu sprawdź w Stripe ostateczny status i przepływ środków, a
następnie uzgodnij bazę i decyzję o ewentualnej korekcie księgowej. Spór
nie jest zwykłym wpisem stripe_refunds i nie należy go tak oznaczać.

## Warunek wdrożenia mapowania płatności

Przed wdrożeniem kodu, który wymaga PaymentIntent lub Charge dla opłaconej
faktury subskrypcyjnej, Bartek sprawdza wersję API endpointu Stripe oraz
reprezentatywne podpisane invoice.payment_succeeded w test mode i danych
historycznych. Jeśli brak starszych pól payment_intent i charge, automat
celowo zatrzyma zapis płatności i faktury VAT z kodem
payment_reference_missing_or_invalid. Wpis webhooka failed nie odzyska claimu
samoczynnie; trzeba ręcznie ustalić pełną referencję przez Invoice Payments,
naprawić mapowanie, a potem kontrolowanie uzgodnić lokalną płatność, job i
dokument VAT. Nie kasuj wpisu evt_* ani nie ponawiaj KSeF bez dowodu skutków.
Sprawdź także, czy monitor działa i czy alarm rzeczywiście dociera do
dyżurującego operatora; sam zapis do Sentry lub Slack nie dowodzi dostarczenia.
## Lista uzgodnienia Stripe ↔ baza

Dla każdej rozbieżności osoba prowadząca sprawę zapisuje poza publicznym repo:

- źródło zgłoszenia, datę/czas i pełne identyfikatory Stripe oraz lokalnego
  payment/tenant; dane klienta ogranicza do niezbędnego minimum;
- stan Stripe: płatność, każdy refund osobno (ID, kwota, waluta, status)
  oraz dispute; sumę wyłącznie refundów succeeded;
- stan bazy: stripe_payments.status i referencje Stripe,
  stripe_refunds, stripe_refund_operations, odpowiednie
  stripe_webhook_events oraz powiązaną fakturę i stan KSeF;
- różnicę, osobę odpowiedzialną, uzgodnioną decyzję, dowód jej wykonania
  i ponowną kontrolę po zmianie stanu Stripe.

Webhook ze stanem processing lub failed może mieć już skutki uboczne. Nie
kasuj jego wpisu i nie wymuszaj replay bez sprawdzenia bazy, kolejki,
Stripe i KSeF. Cyklicznie porównuj nowe refundy i spory w Stripe z lokalnymi
płatnościami do czasu potwierdzonego odbioru automatycznej synchronizacji.

## Powiązany kod i dokumenty

- [Polityka zwrotów](../support/refund-policy.md) — zasady robocze,
  wymagające przeglądu prawnego.
- [Odbiór granicy faktura–zwrot](../security/VAT-STRIPE-ZWROTY-ODBIOR-2026-09-25.md)
  — warunki migracji 00079 i testów.
- [Akcja admina](../../app/admin/users/[userId]/billing-actions.ts) oraz
  [obsługa refundu](../../lib/admin/refunds.ts) — pełny zwrot z aplikacji.
- [Endpoint Stripe](../../app/api/stripe/webhook/route.ts) — aktualną listę
  obsługiwanych zdarzeń sprawdź przed poleganiem na synchronizacji.
