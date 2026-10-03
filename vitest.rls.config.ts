import { defineConfig } from 'vitest/config';
import localConfig from './vitest.config';

/** Jawne uruchomienie na osobnej bazie testowej; testy tworzą i usuwają dane. */
export default defineConfig({
  ...localConfig,
  test: {
    ...localConfig.test,
    include: [
      'tests/rls-isolation.test.ts',
      'tests/rls-uprawnienia.test.ts',
      'tests/rls-cykl-faktury.test.ts',
      'tests/rls-kolejkowanie-wysylki.test.ts',
      'tests/rls-cykl-wyzwalacze.test.ts',
      'tests/rls-korekta-jedna-otwarta.test.ts',
    ],
    exclude: [],
    setupFiles: ['./tests/setup-rls.ts'],
  },
});
