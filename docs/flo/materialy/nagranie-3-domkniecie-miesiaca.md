# Nagranie 3 — domknięcie miesiąca

**Długość:** 40–60 sekund · **Format:** poziomy 16:9
**Urządzenie:** komputer

**Obietnica ujęcia:** pierwszego dnia miesiąca paczka dla księgowej jest już
spakowana; człowiek podaje adres i potwierdza.

## Przygotowanie

Zasiej propozycję paczki (`kind: 'accountant.package'`, `inputKind: 'email'`,
podgląd typu `file`) — kształt w `e2e/tests/flo-critical.spec.ts`, test
„paczka do księgowej”.

Przygotuj adres, który możesz pokazać na ekranie. Nie własny.

## Ujęcia

| Czas | Co widać | Co się dzieje |
|---|---|---|
| 0–6 s | wątek agenta | karta: „Sierpień domknięty — wysłać paczkę księgowej?” z zawartością |
| 6–14 s | kliknięcie „Pokaż, co jest w środku” | nazwa pliku, rozmiar, przycisk pobrania |
| 14–22 s | pole adresu | wpisujesz adres księgowej |
| 22–32 s | zdanie potwierdzenia | „Wysyłam do anna@biuro.pl — zgadza się?” i przycisk potwierdzenia |
| 32–40 s | kliknięcie „Popraw” | **przycisk wysyłki znów jest szary** |
| 40–50 s | potwierdzenie i wysyłka | paczka ląduje w kolejce zatwierdzonych |

## Napisy na ekranie

1. „Miesiąc domknięty.”
2. „Paczka spakowana.”
3. „Adres potwierdzasz Ty.”

## Czego pilnować

- **Ujęcie z „Popraw” jest kluczowe.** Pokazuje, że poprawka adresu zamyka
  przycisk z powrotem — czyli że potwierdzenie nie jest formalnością.
- Nie pokazuj zawartości paczki z prawdziwymi fakturami.
- Jeśli w materiale pada słowo „podatek”, sprawdź `content/flo/GLOS.md`:
  agent przygotowuje pliki, rozlicza księgowa albo podatnik. Nagranie nie może
  obiecywać więcej niż produkt.
