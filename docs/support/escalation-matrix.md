# Macierz eskalacji wsparcia (Faza 30)

Kiedy konwersacja support trafia od AI do człowieka i jak szybko reagujemy.

## Jak powstaje eskalacja

Konwersacja `support_conversations` dostaje status `escalated`, gdy:

1. **AI niepewne** — odpowiedź zaczyna się od „Nie mam pewności" / META
   `uncertain=true`. Backend automatycznie ustawia `escalation_reason =
   'ai_uncertain'` i wysyła alert na Slack `#bugs`.
2. **User prosi o człowieka** — klik „Połącz z człowiekiem" w widgecie.
   `escalation_reason = 'user_requested'`, alert na Slack `#bugs`.

Eskalowane konwersacje widać w **/admin/support**.

## Priorytety i czasy reakcji

| Priorytet | Co | Czas reakcji |
|---|---|---|
| **P0** | User zablokowany — nie może wystawić faktury, awaria płatności, utrata dostępu | < 2h (w godzinach pracy) |
| **P1** | Funkcja nie działa, ale jest obejście; pytanie blokujące onboarding | < 24h |
| **P2** | Pytanie ogólne, prośba o wyjaśnienie, drobny błąd UI | < 3 dni robocze |
| **P3** | Sugestia, feature request | backlog, bez SLA |

Priorytet ocenia człowiek przy przeglądaniu eskalacji — AI go nie ustala.

## Ścieżka eskalacji

1. **AI** — pierwsza linia, ~80% pytań.
2. **Założyciel / zespół** — eskalacje z Slack `#bugs`. Codzienny przegląd
   rano i po południu.
3. **Specjalista zewnętrzny** — sprawy podatkowe/prawne (księgowy, prawnik),
   incydenty KSeF wymagające kontaktu z MF.

## Sprawy szczególne

- **Bezpieczeństwo / wyciek danych** — natychmiast, niezależnie od pory.
  Patrz `docs/runbooks/key-rotation.md` sekcja „Co po incydencie breach".
- **Zwroty / reklamacje płatności** — patrz `docs/support/refund-policy.md`.
- **Żądania RODO** (eksport, usunięcie konta) — user robi to sam w
  ustawieniach. Eskalacja tylko, gdy user stracił dostęp do konta.

## Po rozwiązaniu

Człowiek ustawia status konwersacji na `resolved` (lub `closed`, jeśli
porzucona). Jeśli pytanie było częste — rozważ dopisanie artykułu do KB
(`content/help/`), żeby AI obsłużył je następnym razem.
