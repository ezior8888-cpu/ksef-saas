# Materiały do alfy — agent FLO

**Krok 40 toru B.** Trzy nagrania po 30–60 sekund i komplet zrzutów do bazy
wiedzy, do wykorzystania w mediach społecznościowych i przy zapraszaniu
testerów.

## Status — przeczytaj najpierw

| Element | Stan |
|---|---|
| Scenariusze trzech nagrań | **gotowe** (pliki obok) |
| Lista zrzutów do bazy wiedzy | **gotowa** (`zrzuty.md`) |
| Same nagrania (pliki wideo) | **do zrobienia przez człowieka** |
| Same zrzuty (pliki PNG) | **do zrobienia przez człowieka** |

Nagrań i zrzutów nie da się wyprodukować bez działającej aplikacji z danymi:
worktree, w którym powstał interfejs, nie ma `.env.local`, a wszystkie trasy
agenta siedzą za bramką logowania. Zamiast udawać, że materiały istnieją,
zostawiam scenariusze na tyle dokładne, żeby nagranie było odtworzeniem
instrukcji, a nie wymyślaniem ujęć.

## Zanim zaczniesz nagrywać

1. **Konto demonstracyjne, nie własne.** Na ekranie widać nazwy kontrahentów
   i kwoty. Materiał do sieci robimy z konta, którego dane możemy pokazać.
2. **Zasiej sprawy przed nagraniem**, żeby nie czekać na cron. Najprościej
   helperem z testów przeglądarkowych: `e2e/helpers/flo-seed.ts` →
   `seedProposal({ tenantId, kind, title, body, payload })`.
3. **Wyłącz powiadomienia systemowe** i schowaj paski narzędzi przeglądarki.
4. **Nagrywaj pionowo (9:16)** dla mediów społecznościowych i poziomo (16:9)
   dla bazy wiedzy — te same ścieżki, dwa ujęcia.

## Czego NIE pokazujemy

- Prawdziwych nazw kontrahentów i NIP-ów.
- Ekranu logowania z widocznym adresem e-mail.
- Panelu operatora (`/admin/flo`) — to jest narzędzie wewnętrzne.
- Funkcji zablokowanych (`lib/flo/flags.ts`): grupa podatkowa, ocena
  kontrahenta, odsetki. Nie ma ich u klientów i nie mogą trafić do materiału,
  który obiecuje coś, czego produkt nie robi.

## Ton materiału

Ten sam co ton agenta (`content/flo/GLOS.md`): liczba w pierwszym zdaniu,
zero wykrzykników, żadnego „rewolucja w księgowości”. Pokazujemy jedną
konkretną robotę zrobioną do końca — to jest cała obietnica produktu.
