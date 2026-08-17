/**
 * Zaślepka `server-only` dla testów (vitest).
 *
 * Prawdziwy pakiet celowo rzuca wyjątek, gdy nie działa pod warunkiem
 * eksportu `react-server` (ustawianym normalnie przez Next.js). Testy jobów
 * importują kod serwerowy (analytics w submit-invoice), a runtime workera
 * rozwiązuje to flagą `--conditions=react-server` (patrz Dockerfile).
 * W testach wystarczy pusty moduł.
 */
export {};
