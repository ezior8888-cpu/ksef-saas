# Cross-Browser + Mobile Device Matrix

> Co testujemy, na czym, i jak często. Cel: KSeF SaaS musi działać na wszystkim,
> co używają polskie mikrofirmy — od Chrome na 5-letnim Lenovo po Safari na
> iPhone SE. To nie jest pełne pokrycie — to praktyczne minimum przed launchem.

## Desktop browsers

| Browser | Wersja | Auto (Playwright) | Manual QA | Notatki |
|---|---|---|---|---|
| **Chrome** | latest stable | ✅ chromium project | weekly | Główna platforma — 70% userów. |
| **Edge** | latest stable | ✅ chromium engine (Playwright `channel: 'msedge'` opcjonalny) | bi-weekly | W praktyce identyczne z Chrome. |
| **Firefox** | latest stable | ✅ firefox project | weekly | Sprawdź: SVG charts, IndexedDB (PWA cache), Resize observer. |
| **Safari** | latest stable | ✅ webkit project | weekly | NAJWIĘCEJ regressji. Date pickery, flexbox quirks, Service Workers. |
| **Brave** | latest | ❌ | spot-check | Tracking blockers — sprawdź czy PostHog ładuje się. |

### Co konkretnie sprawdzamy per browser

**Chrome:**
- PWA install prompt (`beforeinstallprompt` event)
- Push notifications API
- Service Worker `serwist`

**Firefox:**
- IndexedDB pojemność (PWA cache faktur)
- CSS `backdrop-filter` (glassmorphism) — Firefox potrzebuje `-moz-` w niektórych wersjach
- Flexbox `gap` w `flex-direction: column`

**Safari:**
- Date inputs (native picker, nie biblioteka)
- File upload z aparatu (`<input capture="environment">`)
- Service Worker — Safari ma restrictive APIs
- ⚠️ Cookie behavior: `SameSite=None; Secure` wymagane dla iframe (jeśli kiedyś)
- Cache-Control quirks w server actions

## Mobile devices (real, nie emulator)

| Device | OS | Auto | Manual | Trigger |
|---|---|---|---|---|
| **iPhone 14 Pro** | iOS 18 | ✅ Playwright `iPhone 14` | weekly | Reference iOS device |
| **iPhone SE (3rd gen)** | iOS 17 | ❌ (small viewport tylko w Playwright) | bi-weekly | Małe ekrany 4.7" — większość polskich seniorów ma SE |
| **Samsung Galaxy S22** | Android 14 | ❌ | weekly | Reference Android |
| **Pixel 7** | Android 14 | ✅ Playwright `Pixel 7` | bi-weekly | Stock Android, dobry baseline |
| **Xiaomi Redmi Note 12** | Android 13 + MIUI | ❌ | spot-check | Najpopularniejszy budget phone w PL |

### Co konkretnie sprawdzamy per device

**iPhone:**
- PWA "Dodaj do ekranu początkowego" — manual flow, nie native prompt
- Aparat dostęp przez `<input capture>` (paragony)
- Pull-to-refresh nie kolizyjny z bounce-scroll iOS
- Safe area insets dla notch / Dynamic Island
- VoiceOver z głównymi flow (login, faktury)

**Android:**
- PWA native install prompt (`beforeinstallprompt`)
- Push notifications z home screen (po install)
- Back button (hardware/gesture) — czy zamyka modal czy navigatuje?
- Tap target sizes — Material Guidelines 48dp minimum
- TalkBack z głównymi flow

## Viewports do sprawdzenia w Playwright

```ts
// e2e/devices.ts (już w playwright.config.ts jako projekty)
- chromium @ 1280x720 (desktop default)
- firefox @ 1280x720
- webkit @ 1280x720
- mobile-iphone @ 390x844 (iPhone 14)
- mobile-pixel @ 412x915 (Pixel 7)
```

Dla edge cases (tablet, ultra-wide) — uruchamiamy ręcznie w DevTools, nie blokujemy CI.

## Automation vs Manual rule-of-thumb

| Test rodzaj | Auto (Playwright) | Manual |
|---|---|---|
| Funkcjonalność (klik X → stan Y) | ✅ | spot-check |
| Wizualne (czy wygląda OK) | częściowe (screenshot diff) | ✅ |
| UX / "czy to intuicyjne" | ❌ | ✅ |
| Performance (FCP, TTI) | Lighthouse CI (Faza 31+) | ad-hoc |
| Accessibility (screen reader) | częściowe (axe-core) | ✅ |
| Network conditions (3G, offline) | ✅ Playwright `context.setOffline()` | spot-check |

## Co NIE testujemy

- **IE11** — Microsoft EOL od 2022, polska księgowość już migrowała.
- **Opera Mini** — < 0.5% udziału w PL.
- **Linux desktop** — testujemy Chrome/Firefox z założenia identycznymi jak na Windows.
- **Tablet** (iPad/Android tablets) — landing działa, dashboard mobile-first ma działać; pełny QA nie.

## Bug-rate per browser (z prior data — Faza 28+)

Po pierwszych 2 miesiącach launch zbierzemy bug-rate per browser (Sentry breakdowns).
Z prior projektów: Safari ≈ 3× więcej bugów per user niż Chrome. Plan to capacity
test budget odpowiednio: 1h Safari QA / week = 20 min Chrome QA.
