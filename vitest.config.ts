import { defineConfig } from 'vitest/config';

export default defineConfig({
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
