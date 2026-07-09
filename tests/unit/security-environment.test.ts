import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isBypassAllowedEnv, isProductionDeploy } from '@/lib/security/environment';

/**
 * SEC-1: testy fail-closed bramki środowiskowej. Krytyczne — od tego zależy,
 * czy auth-bypass (`/api/dev/load-test-session`, Turnstile bypass) może się
 * aktywować. Błąd tutaj = każdy może zalogować się jako dowolny user.
 */

const ENV_KEYS = [
  'VERCEL_ENV',
  'NEXT_PUBLIC_APP_ENV',
  'APP_ENV',
  'NODE_ENV',
] as const;

// process.env.NODE_ENV jest read-only w @types/node — mutowalny widok dla testów.
const env = globalThis.process.env as Record<string, string | undefined>;

describe('environment — fail-closed gate (SEC-1)', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = env[k];
    // Czysty start — usuwamy wszystkie markery.
    for (const k of ENV_KEYS) delete env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
  });

  describe('isProductionDeploy', () => {
    it('VERCEL_ENV=production ⇒ true', () => {
      env.VERCEL_ENV = 'production';
      expect(isProductionDeploy()).toBe(true);
    });

    it('NEXT_PUBLIC_APP_ENV=production ⇒ true', () => {
      env.NEXT_PUBLIC_APP_ENV = 'production';
      expect(isProductionDeploy()).toBe(true);
    });

    it('APP_ENV=production ⇒ true (nowy marker, Hetzner)', () => {
      env.APP_ENV = 'production';
      expect(isProductionDeploy()).toBe(true);
    });

    it('case-insensitive + trim (PRODUCTION, " prod ")', () => {
      env.APP_ENV = ' PRODUCTION ';
      expect(isProductionDeploy()).toBe(true);
      env.APP_ENV = 'prod';
      expect(isProductionDeploy()).toBe(true);
    });

    it('brak markerów ⇒ false (to nie deploy prod)', () => {
      expect(isProductionDeploy()).toBe(false);
    });
  });

  describe('isBypassAllowedEnv — kluczowa bramka', () => {
    it('REGRESJA SEC-1: goły Hetzner (NODE_ENV=production, brak APP_ENV) ⇒ FALSE', () => {
      // To jest dokładnie scenariusz, który był fail-OPEN przed naprawą:
      // VERCEL_ENV znika po migracji, nikt nie ustawił APP_ENV.
      env.NODE_ENV = 'production';
      expect(isBypassAllowedEnv()).toBe(false);
    });

    it('produkcja (dowolny marker) ⇒ false', () => {
      env.VERCEL_ENV = 'production';
      env.NODE_ENV = 'production';
      expect(isBypassAllowedEnv()).toBe(false);
    });

    it('NODE_ENV=development ⇒ true (lokalny dev)', () => {
      env.NODE_ENV = 'development';
      expect(isBypassAllowedEnv()).toBe(true);
    });

    it('NODE_ENV=test ⇒ true (Vitest/Playwright)', () => {
      env.NODE_ENV = 'test';
      expect(isBypassAllowedEnv()).toBe(true);
    });

    it('build prod + JAWNY APP_ENV=staging ⇒ true', () => {
      env.NODE_ENV = 'production';
      env.APP_ENV = 'staging';
      expect(isBypassAllowedEnv()).toBe(true);
    });

    it('build prod + APP_ENV=preview ⇒ true', () => {
      env.NODE_ENV = 'production';
      env.NEXT_PUBLIC_APP_ENV = 'preview';
      expect(isBypassAllowedEnv()).toBe(true);
    });

    it('produkcja wygrywa nawet gdy APP_ENV mówi staging (sprzeczność ⇒ fail-closed)', () => {
      env.VERCEL_ENV = 'production';
      env.APP_ENV = 'staging';
      expect(isBypassAllowedEnv()).toBe(false);
    });

    it('całkowicie puste env ⇒ false (fail-closed)', () => {
      expect(isBypassAllowedEnv()).toBe(false);
    });
  });
});
