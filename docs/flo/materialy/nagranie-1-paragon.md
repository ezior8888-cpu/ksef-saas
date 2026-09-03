# Nagranie 1 — paragon z telefonu

**Długość:** 30–40 sekund · **Format:** pionowy 9:16 · **Urządzenie:** telefon

**Obietnica ujęcia:** od zdjęcia paragonu do gotowego kosztu, bez wchodzenia
w żadne menu.

## Przygotowanie

- Telefon z zainstalowaną aplikacją (PWA) i zalogowanym kontem
  demonstracyjnym.
- Papierowy paragon, na którym nie ma nic prywatnego. Stacja paliw jest
  najlepsza: kwota mała, kategoria jednoznaczna.
- **Blokada BUG-008**: aplikacja przekierowuje telefony na `/mobile`. Do
  nagrania trzeba ją zdjąć albo nagrywać w przeglądarce desktopowej
  z emulacją telefonu. Sprawdź `lib/supabase/middleware.ts` przed sesją.

## Ujęcia

| Czas | Co widać | Co się dzieje |
|---|---|---|
| 0–4 s | paragon w ręce, aparat telefonu | robisz zdjęcie |
| 4–8 s | systemowy arkusz udostępniania | wybierasz FaktFlow |
| 8–12 s | wątek agenta, pasek u góry | „Mam Twoje zdjęcie. Czytam paragon” |
| 12–20 s | ten sam ekran, pasek znika | pojawia się karta kosztu |
| 20–30 s | karta z bliska | „Orlen, 312,40 zł — zaksięgowałem jako paliwo, kolumna 13” plus pasek cofnięcia |
| 30–35 s | palec nad „Zgadza się” | jedno kliknięcie, karta znika |

## Napisy na ekranie

1. „Zdjęcie paragonu.”
2. „Reszta dzieje się sama.”
3. „Zostaje jedno kliknięcie.”

## Czego pilnować

- **Pokaż pasek cofnięcia.** To jest połowa obietnicy: agent zrobił coś sam,
  ale zostawił drogę powrotną.
- **Nie przyspieszaj odczytu w montażu tak, żeby wyglądał na natychmiastowy.**
  Kilkanaście sekund to prawda; udawanie zera kończy się rozczarowaniem przy
  pierwszym prawdziwym paragonie.
- Jeśli odczyt się nie uda, to też jest dobry materiał — karta mówi wtedy, że
  zdjęcie zostało w archiwum. Uczciwość sprzedaje lepiej niż idealne ujęcie.
