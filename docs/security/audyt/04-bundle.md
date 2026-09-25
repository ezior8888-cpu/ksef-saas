# 04 — Sekrety w pakiecie przeglądarki

Wygenerowane przez `scripts/security/audit-client-bundle.ts`. **Nie edytuj ręcznie.**

> **Ten plik NIE ZAWIERA żadnych wartości sekretów** — wyłącznie nazwy zmiennych
> i ścieżki plików, w których ich wartości wystąpiły. Tak samo działa wyjście
> skryptu na ekranie.

Data przebiegu: 2026-09-07

## Samokontrola — czy ten test w ogóle działał

Zmiennych wczytanych z pliku: **45**
Wartości nadających się do szukania (min. 12 znaków, nie słownikowe): **36**
Plików przeszukanych (`.next/static` + `public`): **157**

✅ Test wiarygodny: znaleziono w pakiecie **6** zmiennych
`NEXT_PUBLIC_*`, czyli wyszukiwanie działa i patrzy we właściwe pliki.

Znalezione zmienne publiczne (obecność oczekiwana): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_KEY`

## Wynik

**Żadna zmienna serwerowa nie została znaleziona w plikach pobieranych przez przeglądarkę.**

## Zmienne bez przedrostka `NEXT_PUBLIC_`, które sekretami nie są

Trafienia na liście `NIE_SEKRETY` w skrypcie. Pokazujemy je, bo *obecność* jest
faktem, ale nie są znaleziskiem. Kolumna „kontekst" mówi, dlaczego wartość
znalazła się w pakiecie — czasem to celowe wstawienie, a czasem zwykła
zbieżność z tekstem, który i tak tam był.

| Zmienna | Plik | Kontekst w pakiecie |
|---|---|---|
| `AWS_REGION` | `.next/static/chunks/6898-1c92af52599b7daa.js` | `Southeast2="ap-southeast-2",i.CaCentral1="ca-central-1",i.EuCentral1="⟪AWS_REGION⟫",i.EuWest1="eu-west-1",i.EuWest2="eu-west-2"` |
| `VAPID_SUBJECT` | `.next/static/chunks/app/(landing)/page-c94d7e8848d38d7f.js` | `{icon:"986463349",value:"+48 22 123 45 67"},{icon:"4022663340",value:"⟪VAPID_SUBJECT⟫"},{icon:"1743809183",value:"ul. Piękna 15/3\` |
| `SENTRY_DSN` | `.next/static/chunks/main-3e7e6a3749775d48.js` | `ll:e};c.id="NextRedirectErrorFilter",eX().addEventProcessor(c)}({dsn:"⟪SENTRY_DSN⟫",integrations:[((e={})=>{let t=e.levels\|\|I;r` |

## Mapy źródeł

Znaleziono **1** plików `.map`. Mapa źródeł odtwarza oryginalny kod
wraz z komentarzami i nazwami zmiennych. Sama w sobie nie jest sekretem, ale
daje atakującemu czytelny kod zamiast zminifikowanego.

**Pytanie do dnia 5:** czy te pliki są dostępne publicznie na produkcji.
Obecność w lokalnym buildzie tego nie przesądza — sprawdza to `audit-headers.ts`.

- `public/sw.js.map`

## Czego ten test NIE sprawdza

- **Sekretów, których nie ma w podanym pliku `.env`.** Szukamy wartości, które
  znamy. Klucz wpisany na sztywno w kodzie źródłowym wykryje `audit-secrets.ts`.
- **Wartości krótszych niż 12 znaków** i słownikowych — dają za dużo fałszywych trafień.
- **Danych osobowych w pakiecie.** To osobna kategoria, krok 1.7.
- **Tego, co pakiet POBIERA w czasie działania.** Sekret może nie być wbudowany,
  a mimo to trafić do przeglądarki przez odpowiedź API. To dzień 2 i 5.
