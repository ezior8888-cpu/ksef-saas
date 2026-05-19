# Typowe scenariusze wsparcia (Faza 30)

Najczęstsze sprawy i jak je rozwiązywać. Uzupełniaj w trakcie bety na
podstawie realnych eskalacji.

## „Faktura została odrzucona przez KSeF"

1. Otwórz fakturę w `/admin` → sprawdź komunikat błędu KSeF.
2. Typowe: nieaktywny NIP nabywcy, brak daty sprzedaży, niespójne kwoty.
3. Skieruj usera do poprawienia konkretnego pola i ponownej wysyłki.
4. Artykuł: `/pomoc/najczestsze-bledy-ksef`.

## „Nie mogę wystawić faktury — KSeF nie działa"

1. Sprawdź `/admin/system` → KSeF health.
2. Jeśli KSeF down — faktury idą do Offline24 automatycznie. Uspokój
   usera: faktura jest ważna z kodem QR, wyśle się sama gdy KSeF wróci.
3. Artykuł: `/pomoc/tryb-offline24`.

## „Magic Import nie pobrał moich faktur"

1. Sprawdź, czy certyfikat KSeF jest poprawnie skonfigurowany.
2. Import historii działa w tle — user dostaje email po zakończeniu.
   Sprawdź status joba w `/admin/system` (Inngest).
3. Artykuł: `/pomoc/magic-import-z-innych-programow`.

## „Płatność się nie powiodła"

1. Najczęściej wygasła karta. User aktualizuje ją w portalu klienta Stripe.
2. FaktFlow ponawia płatność automatycznie (dunning).
3. Jeśli user twierdzi, że karta jest OK — sprawdź `/admin` → billing.
4. Artykuł: `/pomoc/platnosci-i-faktury-za-faktflow`.

## „Chcę zwrot pieniędzy"

Patrz `docs/support/refund-policy.md`. W okresie gwarancji — zwracamy
bez przepytywania.

## „Nie mam dostępu do konta / zgubiłem 2FA"

1. Jeśli ma kody ratunkowe — niech użyje jednego zamiast kodu z aplikacji.
2. Jeśli stracił też kody — zweryfikuj tożsamość (email z konta, dane
   firmy) i pomóż zresetować 2FA przez panel admin.
3. Artykuł: `/pomoc/weryfikacja-dwuetapowa-2fa`.

## „Jak przekazać dane księgowej?"

1. Portal księgowego (token, tylko odczyt) albo Co-Pilot (auto-wysyłka).
2. Albo dodać księgową jako użytkownika z rolą.
3. Artykuły: `/pomoc/portal-ksiegowego`, `/pomoc/eksport-kpir-dla-ksiegowego`.

## Pytanie podatkowe / prawne

Nie odpowiadamy merytorycznie. Uprzejmie odsyłamy do księgowego lub
doradcy podatkowego. FaktFlow jest narzędziem, nie doradcą.

## Sprawa, której nie ma na liście

Eskaluj (`escalated`), oznacz priorytet wg `escalation-matrix.md`. Po
rozwiązaniu — jeśli sprawa może się powtórzyć, dopisz scenariusz tutaj
i rozważ artykuł w KB.
