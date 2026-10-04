<!-- Protokół naprawy: AGENTS.md → „Protokół naprawy błędu”. Wypełnij każdą sekcję; „n/d” też jest odpowiedzią. -->

## Co naprawia

<!-- Kod ustalenia (AUD-NN, P-NN, K/W/S z rewizji) i jedno zdanie, co widział klient. -->

## Zmiana

<!-- Plik → co. Jedna naprawa, bez refaktorów przy okazji. -->

## Najpierw test

<!-- Który test był CZERWONY na main przed naprawą (nazwa pliku, ile przypadków) i co pokazuje po naprawie.
     Wyzwalacze / RPC / przejścia statusów: test na bazie (tests/rls-*.test.ts), nie w pamięci. -->

## Ponowienie od zera

<!-- Worker pg-boss wykonuje cały handler ponownie. Co się stanie przy ponowieniu po każdym kroku z efektem zewnętrznym? Jaki klucz / warunek to zabezpiecza? Jeśli PR nie dotyka jobów: n/d. -->

## Weryfikacja

| Sprawdzenie | Wynik |
|---|---|
| `pnpm typecheck` | |
| `eslint` na zmienionych plikach | |
| Vitest obszar | |
| `pnpm vitest run` całość | |
| `pnpm build` (gdy zmiany w `app/`) | |

## Migracje

<!-- Brak / numer z rejestru (docs/koordynacja/CLAUDE-DO-CODEXA.md) + „przed” czy „PO wdrożeniu” + co sprawdzić po wgraniu. -->

## Po wdrożeniu

<!-- Co operator ma zobaczyć (log workera, alarm, który się NIE odezwie, zapytanie kontrolne). -->
