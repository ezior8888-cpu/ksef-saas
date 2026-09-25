import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  // Vite też potrafi ładować pliki .env; testy lokalne nie dziedziczą sekretów apki.
  envDir: false,
  // Path alias `@/*` zgodny z tsconfig.json (`baseUrl: ".", paths: { "@/*": ["./*"] }`).
  // Bez tego testy nie mogą importować z `@/lib/...` — vitest sam tego nie czyta z tsconfig.
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // `server-only` rzuca wyjątek poza warunkiem `react-server` (ustawianym
      // przez Next.js, a w workerze flagą `--conditions` — patrz Dockerfile).
      // Testy jobów importują kod serwerowy, więc podstawiamy pusty moduł.
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/rls-isolation.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    // Jeden worker utrzymuje stabilny profil pamięci testów lokalnych.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
