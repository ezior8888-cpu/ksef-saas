# Bug Triage Process

Krótki playbook: jak klasyfikować bugi, kiedy fixować, gdzie zapisywać.

## Priorytety + SLA

| Priorytet | Definicja | SLA do fix | Przykład |
|---|---|---|---|
| **P0 — Critical** | Apka niedostępna lub utrata danych. Każdy bug uniemożliwiający użytkownikom korzystanie z core flow. | **< 4h** | KSeF submit nie działa dla nikogo. RLS leak (user widzi cudze dane). Login broken. |
| **P1 — High** | Krytyczna funkcja działa źle dla większości userów. Workaround jest, ale wymusza ręczne kroki. | **< 24h** | OCR pomylił NIP. PDF generuje błędne kwoty. Welcome modal się nie pokazuje. |
| **P2 — Medium** | Pojedyncza funkcja zachowuje się dziwnie. Większość userów nie zauważy. | **< 7 dni** | Animacja flickeruje na Safari. Empty state na rzadziej używanej stronie. |
| **P3 — Low** | Polish, nice-to-have, copy improvements. | **next sprint** | Literówka. Spacing 2px za duży. |

## Klasyfikacja — checklist

Dla każdego nowego buga zapytaj:

1. **Ile osób dotknie?**
   - Wszyscy → P0/P1
   - Konkretny segment (np. Safari users) → P2
   - Edge case → P3
2. **Czy jest workaround?**
   - Brak → +1 priorytet
   - Jest, ale nieoczywisty → bez zmian
   - Trywialny → -1 priorytet
3. **Czy dotyka pieniędzy lub danych?**
   - Tak (faktury, płatności, KSeF) → minimum P1
4. **Czy blocker dla launch?**
   - Tak → P0

## Tooling

- **Linear** (po Fazie 37 — przed firmą używamy GitHub Issues).
  - Projekt: `KSEF-SAAS`
  - Labels: `priority/p0`, `priority/p1`, `priority/p2`, `priority/p3`
  - Workflow: `Triaged → In Progress → In Review → Done`
- **Bug template** w `.github/ISSUE_TEMPLATE/bug.yml` — wymaga: kroków reprodukcji, oczekiwanego vs faktycznego zachowania, urządzenia/browser, screenshotu.
- **Sentry** (`@sentry/nextjs` w `instrumentation*.ts`) — auto-grouping podobnych errorów. Każdy nowy issue Sentry trafia do `#bugs` w Slack (Faza 27).

## Daily triage flow

1. **Rano (15 min)** — przegląd nowych issues w Linear + nowe alerty w Sentry.
2. **Przypisz priorytet** wg matrycy powyżej.
3. **P0** → drop everything, fix natychmiast.
4. **P1** → wstaw na czoło dzisiejszego sprintu.
5. **P2/P3** → groupuj w backlog, fixuj batch raz w tygodniu.

## Post-mortem dla P0

Po każdym fix P0 piszemy 1-paragrafowy post-mortem w `docs/incidents/YYYY-MM-DD-slug.md`:

- Co się stało? (1 zdanie)
- Co spowodowało? (root cause, nie objawy)
- Co naprawiliśmy? (PR link)
- Co zrobimy żeby nie powtórzyć? (test, alarm, runbook)

## Co NIE jest bugiem

- Feature request (zgłaszaj jako `kind/enhancement`).
- "Mi się nie podoba ten kolor" — design feedback w `#design` w Slacku.
- "Działa wolno" bez metryk — najpierw zmierz, dopiero potem buguj.
- Bug w third-party (Stripe, Anthropic, Resend) — zgłoś u nich, u nas tylko jeśli mamy workaround do dodania.
