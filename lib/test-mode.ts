/**
 * Detekcja trybu testowego E2E. Używane przez klienty zewnętrznych API
 * (Anthropic OCR, Resend, ewentualnie KSeF jeśli kiedyś zmockujemy) żeby
 * zwracać deterministyczne stuby zamiast hitować realne usługi.
 *
 * Aktywacja: w `playwright.config.ts` ustawiamy `webServer.env.E2E_MOCK_*=1`.
 * Wszystkie flagi są opt-in per integracja, żeby pomyłkowe włączenie nie
 * zepsuło testów innych integracji.
 *
 * Nigdy NIE używaj `process.env.NODE_ENV === 'test'` jako triggera — Next.js
 * server-side często ustawia to też w development, plus migracje testowe
 * Vitestu mają inny scope niż Playwright E2E.
 *
 * Krok 5 planu automatyzacji (AUD-20): sama zmienna nie wystarcza — mock działa
 * tylko poza produkcją (`isBypassAllowedEnv`, fail-closed). Pomyłka w zmiennych
 * Coolify nie może sprawić, że faktury „przyjmuje” atrapa zamiast KSeF.
 */

import { isBypassAllowedEnv } from '@/lib/security/environment';

function mockEnabled(name: string): boolean {
  return process.env[name] === '1' && isBypassAllowedEnv();
}

export function isAnthropicMocked(): boolean {
  return mockEnabled('E2E_MOCK_ANTHROPIC');
}

export function isResendMocked(): boolean {
  return mockEnabled('E2E_MOCK_RESEND');
}

export function isKsefMocked(): boolean {
  return mockEnabled('E2E_MOCK_KSEF');
}

export function isGusMocked(): boolean {
  return mockEnabled('E2E_MOCK_GUS');
}
