# Manual QA Checklist — 50-point pre-launch verification

> Wykonujesz CO TYDZIEŃ (i przed każdym deploy do prod). Cel: złapać regressje
> których E2E nie pokrywa (multi-step user flows, perception issues, edge cases).
> Jeden pełny przebieg ≈ 90 min na desktop + 30 min mobile.

**Skala wyniku per punkt:** ✅ pass · ⚠️ minor issue (zapisz do triażu) · ❌ blocker (Linear P0/P1).

## A. Auth + Onboarding (1-10)

1. **Rejestracja przez email + hasło** → email aktywacyjny dostaje się do skrzynki w < 60s. Link aktywacyjny logiuje, redirect na `/onboarding`.
2. **Logowanie Google OAuth** — popup nie blocked, redirect po sukcesie na `/dashboard` lub `/onboarding`.
3. **Forgot password** — email z linkiem reset w < 60s, nowe hasło działa, stare nie.
4. **Onboarding "Załóż firmę"** — wpisanie NIP → GUS lookup zwraca dane firmy < 5s. "Załóż" tworzy organizację.
5. **Onboarding "Mam zaproszenie"** — token z maila przyjęty, user dostaje membership.
6. **Onboarding "Poproś o dostęp"** — wybranie org → wysłanie prośby → email do owner-a.
7. **Welcome modal** po onboardingu — 3 ścieżki widoczne, każda działa, "Pominę" zamyka i czyści URL.
8. **Magic Import z KSeF** — Inngest job startuje, progress page pokazuje % real-time, sukces redirectuje na dashboard.
9. **Import CSV** (Fakturownia / inFakt / wFirma / iFirma) — drag-and-drop pliku, preview, import bez błędów.
10. **Wylogowanie** — sesja usuwana, `/dashboard` redirectuje na `/login`.

## B. Faktury wystawione (11-20)

11. **Wystawienie zwykłej faktury** — formularz przyjmuje wszystkie pola, walidacja NIP-u live, kalkulacja netto/VAT/brutto poprawna.
12. **Submit do KSeF (test env)** — status zmienia się queued → sending → accepted w < 30s. UPO pobrane.
13. **Korekta faktury (CRP)** — wybór faktury pierwotnej, formularz pokazuje "PRZED → PO", wysłanie generuje korektę.
14. **Faktura zaliczkowa** — formularz z `advance_amount`, zaliczka się wysyła, pojawia się w liście.
15. **Faktura finalna** powiązana z zaliczkową — automatyczne odjęcie kwoty zaliczki.
16. **Faktura B2C** (bez NIP) — formularz przyjmuje brak NIP, `is_b2c=true`, walidacja PESEL/dowód.
17. **Stawki VAT** — 23%, 8%, 5%, 0%, zw, oo, np — wszystkie kalkulują się poprawnie.
18. **PDF faktury** — download generuje czytelny PDF z QR codem dla offline.
19. **Empty state** na `/invoices` (nowy user) — widoczny, CTA "Wystaw pierwszą fakturę" działa.
20. **Realtime update** — wystawienie faktury w drugiej karcie → pojawia się w liście bez refresh.

## C. KSeF compliance + Offline24 (21-25)

21. **UPO download** — przycisk "Pobierz UPO" generuje PDF z poprawnym layoutem.
22. **KSeF outage simulation** — wymuszony fail w `lib/ksef/client.ts` → faktura wpada do queue Offline24.
23. **Offline24 QR codes** — generowany OFFLINE QR + CERTIFICATE QR, obraz czytelny.
24. **Auto-resume** — gdy KSeF wraca, queue automatycznie wysyła zaległe faktury (Inngest retry).
25. **Error translation** — błąd P_13_1 z KSeF → komunikat po polsku z linkiem do problematycznego pola.

## D. OCR + KPiR (26-30)

26. **Skan paragonu** z aparatu PWA — zdjęcie → upload → Claude Vision wraca strukturalne dane.
27. **Auto-kategoryzacja KPiR** — sprzedawca rozpoznany, kolumna KPiR (10/11/13) przypisana automatycznie.
28. **Manual override kategorii** — user zmienia kolumnę → algorytm zapamiętuje na kolejne razy.
29. **KSeF inbox → KPiR auto-sync** — faktura zakupowa z KSeF inbox automatycznie w KPiR po 15 min.
30. **Export KPiR Excel** — kolumny zgodne z rozporządzeniem MF, kwoty się sumują.

## E. Płatności + Wkurzacz (31-35)

31. **Wkurzacz Dłużników Etap 1** (3 dni po terminie) — email "uprzejmy" wysłany.
32. **Wkurzacz Etap 2** (7 dni) — email firmer + opcjonalnie SMS.
33. **Wkurzacz Etap 3** (14 dni) — formalne wezwanie do zapłaty w PDF.
34. **Mark as paid** — po manualnym oznaczeniu, kolejka przypomnień zatrzymuje się.
35. **Dashboard należności** — sumuje niezapłacone faktury poprawnie.

## F. Co-Pilot Księgowego (36-38)

36. **JPK_FA export** — XML zgodny z schemą MF, walidacja przechodzi.
37. **Eksport KPiR Excel** dla księgowej — kolumny + sumy zgodne z formatem.
38. **Co-Pilot automatic email** — 5. dnia miesiąca pakiet wysłany na adres księgowej (Inngest cron).

## G. PWA + Mobile (39-44)

39. **Install prompt** na mobile — pojawia się po 30s na pierwszej wizycie, "Dodaj do ekranu" działa.
40. **PWA standalone mode** — odpalona z home screen ma własną ikonę, full-screen, brak browser chrome.
41. **Push notifications** — po akceptacji w KSeF user dostaje notyfikację (push).
42. **Pull-to-refresh** na `/invoices` mobile — gest działa, lista się odświeża.
43. **Swipe actions** na fakturze — swipe-left "Download XML", swipe-right "Resend".
44. **Camera access** w PWA — `<input capture>` otwiera aparat, nie galerię.

## H. Multi-org + Settings (45-48)

45. **Switch organizacji** — dropdown w header, zmiana aktywnej org → cookie + redirect.
46. **Zaproszenia członków** — invite link, role (owner/admin/member/accountant), revoke.
47. **Settings KSeF** — upload certyfikatu, walidacja .pem, status zielony po akceptacji.
48. **Audit log** — każda krytyczna akcja widoczna w `/settings/audit`.

## I. Cross-cutting (49-50)

49. **Performance** — Lighthouse Performance > 85, FCP < 1.5s, TTI < 3s.
50. **Accessibility** — Lighthouse Accessibility > 95, keyboard-only navigation działa na całej apce.

---

## Workflow

1. Otwórz świeży incognito w Chrome desktop.
2. Wykonaj sekcję A (1-10) — najwięcej regressji tu występuje (auth flow zmiany pociągają najwięcej).
3. Sekcje B + C — krytyczne dla launch.
4. Sekcje D-F — feature-specific, możesz pominąć jeśli te obszary nie były dotykane w sprincie.
5. Sekcje G — wykonaj na realnym urządzeniu (iPhone Pro + Samsung Galaxy minimum).
6. Sekcja I — Lighthouse audit raz w tygodniu.

## Wyniki

Zapisuj w Notion (template: "Weekly QA Run"):

| Sekcja | Pass | Minor | Blocker |
|---|---|---|---|
| A. Auth + Onboarding | / 10 | | |
| B. Faktury wystawione | / 10 | | |
| ... | | | |

Blockery (❌) → osobna Linear issue z priorytetem P0/P1 (zob. `docs/bug-triage.md`).
