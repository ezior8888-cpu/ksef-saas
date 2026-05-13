import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  // Path alias `@/*` zgodny z tsconfig.json (`baseUrl: ".", paths: { "@/*": ["./*"] }`).
  // Bez tego testy nie mogą importować z `@/lib/...` — vitest sam tego nie czyta z tsconfig.
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    // Vitest 4.1+: brak `poolOptions` w typach InlineConfig — serializacja pod RLS:
    fileParallelism: false,
    maxWorkers: 1,
  },
});
