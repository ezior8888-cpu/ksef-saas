# 03 — Sekrety w kodzie i w historii

Wygenerowane przez `scripts/security/audit-secrets.ts`. **Nie edytuj ręcznie.**

> **Ten plik NIE ZAWIERA żadnych sekretów.** Każde trafienie jest zamaskowane
> do trzech pierwszych znaków i długości. Żeby zobaczyć wartość, trzeba wejść
> we wskazane miejsce w repozytorium — i to jest zamierzone.

Data przebiegu: 2026-09-07
Przeszukano: 1104 plików w drzewie, 173 commitów w historii

## Podsumowanie

| Gdzie | Trafień prawdziwych | Rozpoznanych jako atrapy |
|---|---|---|
| Drzewo robocze | **0** | 7 |
| Historia gita | **0** | 7 |

## Pliki `.env` dodane kiedykolwiek do repozytorium

- `.env.example` — ✅ wzorzec bez wartości, w porządku
- `app/.env.example` — ✅ wzorzec bez wartości, w porządku

Plik inny niż `.env.example` na tej liście znaczy, że prawdziwe wartości
są w historii — nawet jeśli plik został potem usunięty. Usunięcie commitem
NIE usuwa go z historii; trzeba przyjąć, że sekrety wyciekły, i je wymienić.

## Drzewo robocze

_Brak trafień poza rozpoznanymi atrapami._

## Historia gita

_Brak trafień poza rozpoznanymi atrapami._

## Trafienia rozpoznane jako atrapy

Skrypt uznaje trafienie za atrapę, gdy w otoczeniu jest słowo w rodzaju
`example`, `placeholder`, `your-`, `xxx`, albo gdy plik jest wzorcem,
dokumentacją, testem lub atrapą danych. **To jest heurystyka** — przy
wątpliwości należy zajrzeć do pliku.

Zwinięto 14 trafień do 4 pozycji:

- Klucz Resend `re_…[33 znaków]` ×4 — np. `.env.example`
- Adres bazy z hasłem `pos…[36 znaków]` ×6 — np. `.env.example`
- Adres bazy z hasłem `pos…[34 znaków]` ×2 — np. `scripts/supabase-push-production.sh`
- Klucz prywatny (PEM) `---…[25 znaków]` ×2 — np. `tests/unit/credentials-crypto.test.ts`

## Czego ten skrypt NIE wykryje

- **Sekretu bez rozpoznawalnego kształtu** — hasła w rodzaju `Kot2024!` nie
  odróżnimy od zwykłego tekstu. Wzorce łapią klucze dostawców i ciągi
  o wysokiej entropii, nie wszystko, co jest tajne.
- **Sekretu w pliku binarnym** — obrazy, PDF-y, archiwa są pomijane.
- **Sekretu, który nigdy nie był w gicie** — np. wklejonego do panelu Coolify.
  Zmienne środowiskowe na produkcji to osobny temat (dzień 5).
- **Tego, czy klucz nadal działa.** Znaleziony ≠ ważny. Ale przy braku
  pewności zakładamy, że działa.
