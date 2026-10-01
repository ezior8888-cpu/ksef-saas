import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  evaluate,
  isAgentPr,
  lastLabeler,
  NO_TEST_LABEL,
  ownersFor,
  parseCodeowners,
  patternToRegExp,
  SENSITIVE_LABEL,
} from './agent-guard.mjs';

const RULES = parseCodeowners(`
# komentarz
/.github/        @ezior8888-cpu
/lib/ksef/       @ezior8888-cpu
/proxy.ts        @ezior8888-cpu
/lib/flo/        @ezior8888-cpu @masloigor
`);

const file = (filename, status = 'modified') => ({ filename, status });
const labeled = (name, login) => ({ event: 'labeled', label: { name }, actor: { login } });

test('wzorce CODEOWNERS: katalog, plik, gwiazdki', () => {
  assert.ok(patternToRegExp('/lib/ksef/').test('lib/ksef/submit.ts'));
  assert.ok(!patternToRegExp('/lib/ksef/').test('lib/ksef-old/a.ts'));
  assert.ok(!patternToRegExp('/lib/ksef/').test('tests/lib/ksef/a.ts'));
  assert.ok(patternToRegExp('/proxy.ts').test('proxy.ts'));
  assert.ok(!patternToRegExp('/proxy.ts').test('lib/proxy.ts'));
  assert.ok(patternToRegExp('*.sql').test('supabase/migrations/00100_x.sql'));
  assert.ok(patternToRegExp('/docs/**/agent*.md').test('docs/runbooks/agent-kodu.md'));
});

test('ostatnia pasująca reguła wygrywa', () => {
  const rules = parseCodeowners('/lib/ @a\n/lib/flo/ @b');
  assert.deepEqual(ownersFor('lib/flo/x.ts', rules), ['b']);
  assert.deepEqual(ownersFor('lib/ksef/x.ts', rules), ['a']);
  assert.equal(ownersFor('app/page.tsx', rules), null);
});

test('PR agenta: gałąź agent/* albo commit claude[bot]', () => {
  assert.equal(isAgentPr({ headRef: 'agent/issue-12', commits: [] }), true);
  assert.equal(isAgentPr({ headRef: 'claude/hamulce', commits: [{ commit: { author: { name: 'BartoszGierszewski' } } }] }), false);
  assert.equal(isAgentPr({ headRef: 'fix/x', commits: [{ author: { login: 'claude[bot]' } }] }), true);
  assert.equal(isAgentPr({ headRef: 'fix/x', commits: [{ commit: { committer: { name: 'claude[bot]' } } }] }), true);
});

test('PR człowieka przechodzi bez względu na ścieżki i testy', () => {
  const r = evaluate({ agent: false, files: [file('lib/ksef/submit.ts')], labels: [], events: [], rules: RULES });
  assert.equal(r.ok, true);
});

test('agent w obszarze wrażliwym bez zgody — blokada', () => {
  const r = evaluate({
    agent: true,
    files: [file('lib/ksef/submit.ts'), file('tests/unit/a.test.ts', 'added')],
    labels: [], events: [], rules: RULES,
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons[0], /lib\/ksef\/submit\.ts/);
});

test('zgoda od właściciela ścieżki odblokowuje', () => {
  const r = evaluate({
    agent: true,
    files: [file('lib/ksef/submit.ts'), file('tests/unit/a.test.ts', 'added')],
    labels: [SENSITIVE_LABEL],
    events: [labeled(SENSITIVE_LABEL, 'ezior8888-cpu')],
    rules: RULES,
  });
  assert.deepEqual(r.reasons, []);
  assert.equal(r.runTestFirst, true);
  assert.deepEqual(r.tests, ['tests/unit/a.test.ts']);
});

test('zgody nie nada bot ani ktoś spoza właścicieli tej ścieżki', () => {
  for (const login of ['claude[bot]', 'masloigor']) {
    const r = evaluate({
      agent: true,
      files: [file('lib/ksef/submit.ts'), file('tests/unit/a.test.ts', 'added')],
      labels: [SENSITIVE_LABEL],
      events: [labeled(SENSITIVE_LABEL, login)],
      rules: RULES,
    });
    assert.equal(r.ok, false, login);
  }
});

test('liczy się OSTATNIE nadanie etykiety', () => {
  const events = [labeled(SENSITIVE_LABEL, 'ezior8888-cpu'), { event: 'unlabeled', label: { name: SENSITIVE_LABEL } }, labeled(SENSITIVE_LABEL, 'claude[bot]')];
  assert.equal(lastLabeler(events, SENSITIVE_LABEL), 'claude[bot]');
});

test('etykieta zdjęta (np. po nowym pushu) = brak zgody, nawet przy starym zdarzeniu', () => {
  const r = evaluate({
    agent: true,
    files: [file('lib/flo/x.ts'), file('tests/unit/a.test.ts', 'added')],
    labels: [],
    events: [labeled(SENSITIVE_LABEL, 'ezior8888-cpu')],
    rules: RULES,
  });
  assert.equal(r.ok, false);
});

test('współwłaściciel ścieżki (lib/flo) może nadać zgodę', () => {
  const r = evaluate({
    agent: true,
    files: [file('lib/flo/x.ts'), file('tests/unit/a.test.ts', 'added')],
    labels: [SENSITIVE_LABEL],
    events: [labeled(SENSITIVE_LABEL, 'masloigor')],
    rules: RULES,
  });
  assert.equal(r.ok, true);
});

test('kod bez testu — blokada; zwolnienie od właściciela odblokowuje', () => {
  const base = { agent: true, files: [file('components/x.tsx')], rules: RULES };
  assert.equal(evaluate({ ...base, labels: [], events: [] }).ok, false);
  assert.equal(evaluate({ ...base, labels: [NO_TEST_LABEL], events: [labeled(NO_TEST_LABEL, 'claude[bot]')] }).ok, false);
  const waived = evaluate({ ...base, labels: [NO_TEST_LABEL], events: [labeled(NO_TEST_LABEL, 'masloigor')] });
  assert.equal(waived.ok, true);
  assert.equal(waived.runTestFirst, false);
});

test('usunięty test się nie liczy; sama dokumentacja nie wymaga testu', () => {
  const removed = evaluate({ agent: true, files: [file('lib/utils/a.ts'), file('tests/unit/a.test.ts', 'removed')], labels: [], events: [], rules: RULES });
  assert.equal(removed.ok, false);
  const docs = evaluate({ agent: true, files: [file('docs/help/a.md')], labels: [], events: [], rules: RULES });
  assert.equal(docs.ok, true);
  assert.equal(docs.runTestFirst, false);
});

test('niebezpieczna nazwa pliku testu nie trafia do wiersza poleceń', () => {
  const r = evaluate({ agent: true, files: [file('lib/utils/a.ts'), file('tests/unit/a$(id).test.ts', 'added')], labels: [], events: [], rules: RULES });
  assert.equal(r.ok, false);
  assert.deepEqual(r.tests, []);
  assert.equal(r.runTestFirst, false);
});

test('prawdziwy .github/CODEOWNERS: kluczowe ścieżki są wrażliwe, zwykłe nie', () => {
  const rules = parseCodeowners(readFileSync(new URL('../../.github/CODEOWNERS', import.meta.url), 'utf8'));
  for (const p of ['.github/workflows/ci.yml', 'scripts/ci/agent-guard.mjs', 'lib/ksef/submit.ts', 'supabase/migrations/00100_x.sql', 'AGENTS.md', 'pnpm-lock.yaml', 'docs/runbooks/agent-kodu.md']) {
    assert.notEqual(ownersFor(p, rules), null, p);
  }
  for (const p of ['components/ui/button.tsx', 'tests/unit/a.test.ts', 'docs/help/faktury.md']) {
    assert.equal(ownersFor(p, rules), null, p);
  }
});
