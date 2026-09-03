# Nagranie 2 — ponaglenie z podglądem

**Długość:** 40–60 sekund · **Format:** poziomy 16:9 i pionowy 9:16
**Urządzenie:** komputer

**Obietnica ujęcia:** agent napisał wiadomość do kontrahenta, ale nie wyśle
jej, dopóki człowiek nie przeczyta.

## Przygotowanie

Zasiej propozycję ponaglenia z podglądem wiadomości:

```
seedProposal({
  tenantId,
  kind: 'payment.chase',
  title: 'Nowak Sp. z o.o. — 4 300,00 zł, 8 dni po terminie',
  body: 'Napisałem wiadomość — przeczytaj ją i zdecyduj.',
  payload: { primaryLabel: 'Wyślij wiadomość', requiresPreview: true, preview: { ... } },
})
```

Pełny kształt ładunku: `e2e/tests/flo-critical.spec.ts`, test „ponaglenie”.

## Ujęcia

| Czas | Co widać | Co się dzieje |
|---|---|---|
| 0–6 s | dashboard, wątek agenta | karta ponaglenia, tytuł z kwotą i liczbą dni |
| 6–12 s | kursor nad „Wyślij wiadomość” | **przycisk jest szary**, pod spodem: „Najpierw otwórz podgląd” |
| 12–18 s | kliknięcie „Pokaż podgląd” | rozwija się treść wiadomości |
| 18–30 s | treść z bliska | widać ostatnie zdanie: „jeśli płatność już wyszła, proszę potraktować tę wiadomość jako nieaktualną” |
| 30–40 s | edycja treści | dopisujesz zdanie od siebie, przycisk staje się aktywny |
| 40–50 s | kliknięcie „Wyślij wiadomość” | karta znika, sprawa ląduje w „Zatwierdzone — czeka na wykonanie” ze śladem godziny |

## Napisy na ekranie

1. „Agent napisał ponaglenie.”
2. „Nie wyśle, dopóki nie przeczytasz.”
3. „Wysyła dokładnie to, co widzisz.”

## Czego pilnować

- **Zatrzymaj kamerę na szarym przycisku.** To jest najważniejsze ujęcie
  w całym materiale — pokazuje, że agent nie wysyła nic sam.
- **Pokaż panel po prawej po wysłaniu**, ze śladem zatwierdzenia. To odpowiedź
  na pytanie „a skąd wiem, że to ja kliknąłem”.
- Nie wycinaj zdania ratunkowego z treści wiadomości. Ono jest częścią
  produktu, nie ozdobnikiem.
