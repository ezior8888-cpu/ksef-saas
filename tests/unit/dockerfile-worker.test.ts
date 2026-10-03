import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUD-127: etap `worker` w Dockerfile startował proces jako root (USER był
 * tylko w etapie `runner`). Worker ma pełny dostęp do sekretów produkcji
 * i bazy — przejęcie procesu jako root dawało więcej niż trzeba.
 * Pilnujemy też pułapki z AGENTS.md: `runner` MUSI zostać ostatnim etapem.
 */

const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8').replace(/\r\n/g, '\n');
const stages = dockerfile.split(/^FROM /m).slice(1).map((s) => ({ name: /AS (\w+)/.exec(s)?.[1], body: s }));

describe('Dockerfile', () => {
  it('worker działa bez roota (USER przed CMD)', () => {
    const worker = stages.find((s) => s.name === 'worker')!.body;
    const user = worker.search(/^USER (?!root)\S+/m);
    expect(user).toBeGreaterThan(-1);
    expect(user).toBeLessThan(worker.search(/^CMD /m));
  });

  it('worker instaluje zamrożone zależności produkcyjne, bez narzędzi builda', () => {
    const worker = stages.find((s) => s.name === 'worker')!.body;
    const source = /^COPY --from=(\w+) \/app\/node_modules \.\/node_modules$/m.exec(worker)?.[1];
    expect(source).toBeDefined();
    const runtimeDeps = stages.find((s) => s.name === source)!.body;
    expect(runtimeDeps).toMatch(/^COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\/$/m);
    expect(runtimeDeps).toMatch(/pnpm install --prod --frozen-lockfile/);
    // Późniejsze COPY . . nie może wnieść lokalnego pełnego node_modules.
    const ignored = readFileSync(join(process.cwd(), '.dockerignore'), 'utf8').split(/\r?\n/);
    expect(ignored).toContain('node_modules');
    expect(ignored.some((line) => line.startsWith('!') && line.includes('node_modules'))).toBe(false);
  });

  it('CLI shadcn jest tylko do builda, a loader tsx należy do runtime', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies.shadcn).toBeUndefined();
    expect(manifest.devDependencies.shadcn).toBeTruthy();
    expect(manifest.dependencies.tsx).toBeTruthy();
    expect(manifest.devDependencies.tsx).toBeUndefined();
    const worker = stages.find((s) => s.name === 'worker')!.body;
    expect(worker).toContain('"--import", "tsx"');
  });

  it('runner nadal jest ostatnim etapem', () => {
    expect(stages.at(-1)?.name).toBe('runner');
  });
});
