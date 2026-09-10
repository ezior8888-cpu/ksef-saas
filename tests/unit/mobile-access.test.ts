import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isMobilePanelAllowed, mobilePanelMode } from '@/lib/mobile-access';

/**
 * Bramka wpuszczania telefonów do panelu (BUG-008). Najważniejszy przypadek to
 * BRAK zmiennych: obraz zbudowany bez nich musi zachowywać się dokładnie tak
 * jak przed wprowadzeniem przełącznika, czyli blokować.
 */

const ENV_KEYS = [
  'NEXT_PUBLIC_MOBILE_PANEL',
  'NEXT_PUBLIC_MOBILE_PANEL_ALLOWLIST',
] as const;

const env = globalThis.process.env as Record<string, string | undefined>;

const BARTOSZ = '11111111-1111-4111-8111-111111111111';
const OBCY = '22222222-2222-4222-8222-222222222222';

describe('mobile-access — bramka telefonu', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = env[k];
      delete env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
  });

  describe('mobilePanelMode', () => {
    it('brak zmiennej ⇒ off (fail-closed)', () => {
      expect(mobilePanelMode()).toBe('off');
    });

    it('śmieci w zmiennej ⇒ off, a nie wyjątek', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = 'wlacz-wszystko';
      expect(mobilePanelMode()).toBe('off');
    });

    it('wielkość liter i spacje nie mają znaczenia', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = '  AllowList ';
      expect(mobilePanelMode()).toBe('allowlist');
    });
  });

  describe('isMobilePanelAllowed', () => {
    it('bez zmiennych nie wpuszcza nikogo — nawet zalogowanego', () => {
      expect(isMobilePanelAllowed({ userId: BARTOSZ })).toBe(false);
    });

    it('tryb on wpuszcza także niezalogowanego', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = 'on';
      expect(isMobilePanelAllowed({ userId: null })).toBe(true);
    });

    it('allowlist wpuszcza wypisanego', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = 'allowlist';
      env.NEXT_PUBLIC_MOBILE_PANEL_ALLOWLIST = `${OBCY}, ${BARTOSZ}`;
      expect(isMobilePanelAllowed({ userId: BARTOSZ })).toBe(true);
    });

    it('allowlist odbija niewypisanego', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = 'allowlist';
      env.NEXT_PUBLIC_MOBILE_PANEL_ALLOWLIST = BARTOSZ;
      expect(isMobilePanelAllowed({ userId: OBCY })).toBe(false);
    });

    it('allowlist odbija niezalogowanego', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = 'allowlist';
      env.NEXT_PUBLIC_MOBILE_PANEL_ALLOWLIST = BARTOSZ;
      expect(isMobilePanelAllowed({ userId: null })).toBe(false);
    });

    it('pusta lista przy trybie allowlist nie wpuszcza nikogo', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = 'allowlist';
      env.NEXT_PUBLIC_MOBILE_PANEL_ALLOWLIST = '  ,  ,';
      expect(isMobilePanelAllowed({ userId: BARTOSZ })).toBe(false);
    });

    it('pusty wpis na liście nie zamienia się w przepustkę dla pustego id', () => {
      env.NEXT_PUBLIC_MOBILE_PANEL = 'allowlist';
      env.NEXT_PUBLIC_MOBILE_PANEL_ALLOWLIST = `${BARTOSZ},,`;
      expect(isMobilePanelAllowed({ userId: '' })).toBe(false);
    });

    it('środowisko dewelopera wpuszcza bez żadnych zmiennych', () => {
      expect(isMobilePanelAllowed({ userId: null, isDevEnv: true })).toBe(true);
    });
  });
});
