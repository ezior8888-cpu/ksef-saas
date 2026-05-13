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
 */

export function isAnthropicMocked(): boolean {
  return process.env.E2E_MOCK_ANTHROPIC === '1';
}

export function isResendMocked(): boolean {
  return process.env.E2E_MOCK_RESEND === '1';
}

export function isKsefMocked(): boolean {
  return process.env.E2E_MOCK_KSEF === '1';
}

export function isGusMocked(): boolean {
  return process.env.E2E_MOCK_GUS === '1';
}
