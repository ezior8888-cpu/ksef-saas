import { defineConfig } from 'vitest/config';
import localConfig from './vitest.config';

/** Jawne uruchomienie na osobnej bazie testowej; testy tworzą i usuwają dane. */
export default defineConfig({
  ...localConfig,
  test: {
    ...localConfig.test,
    include: ['tests/rls-isolation.test.ts'],
    exclude: [],
    setupFiles: ['./tests/setup-rls.ts'],
  },
});
