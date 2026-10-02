import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUD-127: etap `worker` w Dockerfile startował proces jako root (USER był
 * tylko w etapie `runner`). Worker ma pełny dostęp do sekretów produkcji
 * i bazy — przejęcie procesu jako root dawało więcej niż trzeba.
 * Pilnujemy też pułapki z AGENTS.md: `runner` MUSI zostać ostatnim etapem.
 */

const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8');
const stages = dockerfile.split(/^FROM /m).slice(1).map((s) => ({ name: /AS (\w+)/.exec(s)?.[1], body: s }));

describe('Dockerfile', () => {
  it('worker działa bez roota (USER przed CMD)', () => {
    const worker = stages.find((s) => s.name === 'worker')!.body;
    const user = worker.search(/^USER (?!root)\S+/m);
    expect(user).toBeGreaterThan(-1);
    expect(user).toBeLessThan(worker.search(/^CMD /m));
  });

  it('runner nadal jest ostatnim etapem', () => {
    expect(stages.at(-1)?.name).toBe('runner');
  });
});
