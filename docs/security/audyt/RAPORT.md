# Raport z audytu bezpieczeństwa FaktFlow

**Zakres:** wycieki danych — między najemcami i poza firmę.
**Okres:** 6–9 września 2026 (dni 0–5).
**Tryb:** tylko raport. Kod aplikacji (`app/`, `lib/`) nietknięty; powstały
narzędzia (`scripts/security/`), dokumentacja (`docs/security/`) i dwie
przygotowane, **niewdrożone** migracje naprawcze.
**Prowadzący:** Igor + Claude. Zapytania na produkcji odpalał Igor (klucz SSH
chroniony hasłem). Wdrożenia i migracje: Bartosz.

---

## Streszczenie na jedną stronę

Aplikacja jest **przedlaunchowa i w rdzeniu zdrowa**. Fundament izolacji między
najemcami — RLS, funkcja `get_current_tenant_id`, rola połączenia `authenticator`
— jest solidny i potwierdzony empirycznie: test na dwóch kontach przechodzi
w komplecie (sfałszowany identyfikator organizacji nie daje dostępu, obcej
faktury nie da się ani odczytać, ani zmienić). Sekrety nie wyciekły — ani do
pakietu przeglądarki, ani do historii gita. Poczta, portal księgowej, webhooki
i logi są zrobione starannie.

Znaleźliśmy **jeden wyciek między najemcami** (SEC-C-05) i garść rzeczy do
domknięcia przed launchem. Charakterystyczne dla całego audytu: **najgroźniejsze
ustalenia są dziś uśpione** — czekają na pierwszego realnego klienta. Wyciek
faktur wyzwoli się, gdy dwóch klientów będzie miało zaległość; luki maskowania —
gdy agent FLO zacznie pisać treści; brak kasowania plików — przy pierwszym
usunięciu konta. Aplikacja bez danych i bez ruchu nie krzyczy; wartość audytu
jest w złapaniu tego, zanim ruch się pojawi.

**Co blokuje launch (do naprawienia bezwarunkowo):**

1. **SEC-C-05** — widok `invoices_overdue` pokazuje faktury po terminie
   wszystkich najemców każdemu zalogowanemu. Migracja `00068` gotowa.
2. **SEC-C-06** — niezalogowany może zniszczyć cudze logi audytu przez `/rpc`.
   Migracja `00069` gotowa. Potwierdzone na żywo.
3. **SEC-D-04** — usunięcie konta nie kasuje plików w R2 (RODO art. 17).
   Wymaga decyzji prawnej (retencja 10 lat vs prawo do zapomnienia).
4. **SEC-A-03** — Next.js z dziewięcioma otwartymi podatnościami; podbicie
   łatki do 16.2.11.

**Skąd wyszły ustalenia — lekcja o metodzie:** wyciek między najemcami (C-05)
NIE był w kodzie aplikacji. Dzień czytania całego kodu (206 obejść RLS) dał
w tej kategorii zero. Wyciek był w definicji widoku w bazie i w uprawnieniu,
którego migracja miała nie nadać, a nadała. Znalazł go dopiero odczyt żywej
bazy. Wniosek na przyszłość: samo czytanie repozytorium nie wystarcza — trzeba
pytać produkcję o jej faktyczny stan.

---

## Ustalenia wg wagi

Pełne opisy, sposób odtworzenia i propozycje napraw: `REJESTR-USTALEN.md`.

### 🔴 Krytyczne (1)

| ID | Rzecz | Stan |
|---|---|---|
| SEC-C-05 | Widok `invoices_overdue` (DEFINER, bez filtra najemcy, grant `authenticated`) wynosi faktury po terminie wszystkich firm | migracja 00068 gotowa; dziś uśpione (brak danych po terminie) |

### 🟠 Wysokie (5)

| ID | Rzecz | Stan |
|---|---|---|
| SEC-C-06 | `anonymize_user_audit_logs` wywoływalna bez logowania — niszczy logi audytu | migracja 00069; **potwierdzone na żywo** |
| SEC-D-04 | Usunięcie konta i retencja nie kasują plików R2 (XML, UPO, paragony) — RODO art. 17 | wymaga decyzji prawnej |
| SEC-A-03 | Next.js 16.2.6 — dziewięć doradztw (m.in. cache confusion, ujawnienie akcji) | podbić do 16.2.11 |
| SEC-D-01 | PostHog nagrywa panel z danymi kontrahentów (maska `data-ph-mask` nieużywana) | naprawa w kodzie klienta |
| SEC-C-03 | Dwie tabele (`mfa_recovery_codes`, `gdpr_deletion_requests`) bez REVOKE SELECT dla `anon` | migracja 00069 |

### 🟡 Średnie (5)

| ID | Rzecz |
|---|---|
| SEC-C-04 | `cancel_token` RODO przechowywany plaintextem (portal księgowej trzyma hash) |
| SEC-D-02 | PostHog `autocapture` działa przed zgodą użytkownika (`unset`) |
| SEC-D-03 | Maskowanie FLO ma 5 luk (NIP z separatorami, IBAN z literami, adres, nazwisko) — uśpione do wpięcia FLO |
| SEC-E-02 | CSP w trybie Report-Only — nie egzekwuje, XSS nieblokowany |
| SEC-A-01 | Cztery route'y odsyłają treść wyjątku klientowi |

### ⚪ Niskie (8)

| ID | Rzecz |
|---|---|
| SEC-C-07 | Nadmiarowe granty `anon` na 5 obiektach (kryte RLS) — migracja 00069 |
| SEC-C-08 | Funkcje `admin_*` wywoływalne przez `anon` (rozpoznanie) — migracja 00069 |
| SEC-D-05 | OCR → Anthropic jako subprocessor — do rejestru czynności RODO |
| SEC-E-03 | `X-Powered-By: Next.js` ujawnia framework |
| SEC-A-02 | `owasp-top10-mapping.md` twierdzi „stack traces hidden", a nie są |
| SEC-A-04 | Ten sam dokument: „3 podatności", faktycznie 56 |
| SEC-E-01 | Ten sam dokument: dwie kontrole oparte na Vercelu, produkcja na Hetznerze |
| SEC-C-01 | Brak `FORCE ROW LEVEL SECURITY` — obrona w głąb (nieszkodliwe: `authenticator` nie jest właścicielem) |

### Obalone po sprawdzeniu

SEC-C-02 (funkcje DEFINER bez `search_path` — zero na produkcji). Rozjazd
migracji (67=67, zgodne). Widoki `mv_tenant_*` (bez grantu dla ról aplikacyjnych).
Pełna lista czystych obszarów: `REJESTR-USTALEN.md`, sekcja „Świadomie odrzucone".

---

## Co jest zdrowe (żeby nie utonęło w liście problemów)

- **Izolacja najemców na poziomie bazy** — 7/7 testów na dwóch kontach.
- **Sekrety** — czysto w drzewie i w 173 commitach historii; zero w pakiecie przeglądarki.
- **Portal księgowej** — token 256-bit, hash, wygaśnięcie, filtr najemcy wszędzie.
- **Poczta** — unsubscribe na HMAC z porównaniem stałoczasowym, adresat z bazy.
- **Webhooki** — podpis przed obsługą, idempotency przeciw powtórkom.
- **Logi** — `debug`/`info` wyciszone na produkcji, XML KSeF za podwójną bramką.
- **Nagłówki** — HSTS preload, X-Frame DENY, nosniff, Referrer, Permissions — komplet (poza CSP).

---

## Stan napraw

| Migracja | Ustalenia | Pilność | Kto wdraża |
|---|---|---|---|
| `00068_fix_invoices_overdue_cross_tenant_leak.sql` | SEC-C-05 | przed launchem | Bartosz |
| `00069_audit_permission_hardening.sql` | SEC-C-06/07/08 | przed launchem | Bartosz |

Naprawy w kodzie aplikacji (SEC-D-01 PostHog, SEC-A-01 błędy do klienta,
SEC-D-03 wzorce redakcji, SEC-A-03 podbicie Next, SEC-E-02 CSP enforce,
SEC-E-03 poweredByHeader) — **nie wprowadzone**, opisane w rejestrze,
do zrobienia osobno poza trybem tylko-raport.

SEC-D-04 (pliki R2 przy usuwaniu konta) — wymaga najpierw decyzji prawnej,
potem migracji/kodu.

---

## Czego audyt NIE obejmował

- **Aktywnych testów na produkcji** — wyłącznie GET-y i odczyt bazy. Błędu,
  który ujawnia się dopiero pod realnym ruchem, nie wykryjemy.
- **Infrastruktury** — konfiguracji Hetznera, Coolify, zapory, kluczy SSH,
  polityki bucketa MinIO (ta ostatnia dopisana jako do sprawdzenia).
- **Przeglądu kodu zależności** — tylko `pnpm audit`.
- **Pełnego przeczytania wszystkich 305 obejść RLS** — 78 pozycji „do
  przejrzenia" to granica analizy statycznej, nie potwierdzone problemy.
