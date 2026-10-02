import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUD-128: zależności bez importu w kodzie (`bir1` — klient GUS ma własną
 * implementację, `xml-crypto` — podpis KSeF idzie przez xadesjs,
 * `@mdx-js/react` — opcjonalny peer `@next/mdx`, nieużywany) zwiększały
 * powierzchnię ataku. `@types/node` ma odpowiadać Node z obrazu (Dockerfile).
 */

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const all = { ...pkg.dependencies, ...pkg.devDependencies };
const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8');

describe('zależności', () => {
  it.each(['bir1', 'xml-crypto', '@types/xml-crypto', '@mdx-js/react'])('%s usunięta', (name) => {
    expect(all[name]).toBeUndefined();
  });

  it('@types/node w wersji Node z obrazu', () => {
    const nodeMajor = /FROM node:(\d+)/.exec(dockerfile)?.[1];
    expect(nodeMajor).toBeDefined();
    expect(all['@types/node']).toMatch(new RegExp(`^\\^?${nodeMajor}(\\.|$)`));
  });
});
