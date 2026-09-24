import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { diagnosticRecords, MAX_RECORDS } from './print-codeql-locations.mjs';

const script = fileURLToPath(new URL('./print-codeql-locations.mjs', import.meta.url));
const marker = 'SYNTHETIC_PRIVATE_CONTENT_89342';
const finding = (path = 'lib/example.ts', startLine = 42) => ({
  ruleId: 'js/synthetic-rule',
  rule: { index: 0, toolComponent: { index: 1 } },
  message: { text: marker, markdown: marker },
  locations: [{ physicalLocation: { artifactLocation: { uri: path, uriBaseId: '%SRCROOT%' }, region: { startLine, snippet: { text: marker } } } }],
  relatedLocations: [{ message: { text: marker } }],
  codeFlows: [{ message: { text: marker } }],
});
const report = (results = [finding()]) => ({
  version: '2.1.0',
  runs: [{
    tool: {
      driver: { name: 'CodeQL' },
      extensions: [
        { name: 'codeql/util' },
        { name: 'codeql/javascript-queries', rules: [{ id: 'js/synthetic-rule', properties: { 'security-severity': '8.1' } }] },
      ],
    },
    results,
  }],
});

function cli(t, files, args) {
  const directory = mkdtempSync(join(tmpdir(), 'codeql-locations-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(directory.split(/[\\/]/).at(-1), /^codeql-locations-test-/);
    rmSync(directory, { recursive: true, force: true });
  });
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(directory, name), typeof contents === 'string' ? contents : JSON.stringify(contents));
  const actual = spawnSync(process.execPath, [script, ...(args ? args(directory) : [directory])], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(actual.error, undefined);
  return actual;
}

test('CLI prints only rule ID, relative path, positive line and bounded counters', (t) => {
  const actual = cli(t, { [marker + '.sarif']: report() });
  assert.equal(actual.status, 0);
  assert.equal(actual.stderr, '');
  const lines = actual.stdout.trim().split(/\r?\n/);
  assert.equal(lines[0], 'CodeQL locations: records=1 limit=100');
  assert.deepEqual(JSON.parse(lines[1]), { ruleId: 'js/synthetic-rule', path: 'lib/example.ts', startLine: 42 });
  assert.ok(!actual.stdout.includes(marker));
});

test('valid empty report passes; diagnostics do not replace the blocking gate', (t) => {
  const actual = cli(t, { 'clean.sarif': report([]) });
  assert.equal(actual.status, 0);
  assert.equal(actual.stdout.trim(), 'CodeQL locations: records=0 limit=100');
});

test('encoded Next.js route groups and brackets become relative paths', () => {
  assert.equal(diagnosticRecords(report([finding('app/%28dashboard%29/invoices/%5Bid%5D/page.tsx')]))[0].path, 'app/(dashboard)/invoices/[id]/page.tsx');
});

test('absolute paths, URLs, traversal, control characters and oversized paths reject', () => {
  for (const path of [
    'https://example.test/private', 'file:///private.ts', '/etc/private', 'C:/private.ts', 'C:\\private.ts',
    '../private.ts', 'lib/../private.ts', './private.ts', 'lib//private.ts',
    '%2e%2e/private.ts', 'lib/%2e%2e/private.ts', '%252e%252e/private.ts',
    'lib/a.ts?private=value', 'lib/a.ts#private', 'lib/a\n.ts', 'lib/a%0A.ts',
    'lib/a\u0000.ts', 'lib/a%7F.ts', 'a'.repeat(513), '%invalid',
  ]) assert.throws(() => diagnosticRecords(report([finding(path)])));
});

test('invalid line numbers and absent locations reject', () => {
  for (const line of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => diagnosticRecords(report([finding('lib/example.ts', line)])));
  }
  for (const locations of [undefined, [], [null], [{}]]) {
    const item = finding(); item.locations = locations;
    assert.throws(() => diagnosticRecords(report([item])));
  }
});

test('only bounded js/actions rule IDs are emitted', () => {
  for (const id of ['python/rule', 'js/../rule', 'js//rule', 'js/rule\ncommand', 'js/' + 'a'.repeat(200)]) {
    const input = report(); input.runs[0].tool.extensions[1].rules[0].id = id; input.runs[0].results[0].ruleId = id;
    assert.throws(() => diagnosticRecords(input));
  }
  const actions = report();
  actions.runs[0].tool.extensions[1].rules[0].id = 'actions/synthetic-rule';
  actions.runs[0].results[0].ruleId = 'actions/synthetic-rule';
  assert.equal(diagnosticRecords(actions)[0].ruleId, 'actions/synthetic-rule');
});

test('driver rules referenced only by index resolve without exposing metadata', () => {
  const input = report();
  input.runs[0].tool.driver.rules = input.runs[0].tool.extensions[1].rules;
  delete input.runs[0].results[0].ruleId;
  input.runs[0].results[0].rule = { index: 0 };
  assert.equal(diagnosticRecords(input)[0].ruleId, 'js/synthetic-rule');
});

test('limit applies across results and across all input files', (t) => {
  assert.equal(diagnosticRecords(report(Array.from({ length: MAX_RECORDS }, () => finding()))).length, MAX_RECORDS);
  assert.throws(() => diagnosticRecords(report(Array.from({ length: MAX_RECORDS + 1 }, () => finding()))));
  const actual = cli(t, { 'one.sarif': report(Array.from({ length: MAX_RECORDS }, () => finding())), 'two.sarif': report() });
  assert.equal(actual.status, 2);
  assert.equal(actual.stdout, '');
});

test('missing, malformed and unrecognized reports fail without disclosing content', (t) => {
  for (const actual of [
    cli(t, {}),
    cli(t, {}, (directory) => [join(directory, 'missing')]),
    cli(t, { 'invalid.sarif': '{' + marker }),
    cli(t, { 'invalid.sarif': { version: '2.1.0', runs: [] } }),
    cli(t, { 'valid.sarif': report(), 'invalid.sarif': report([finding('https://invalid.test/' + marker)]) }),
  ]) {
    assert.equal(actual.status, 2);
    assert.equal(actual.stdout, '');
    assert.equal(actual.stderr.trim(), 'CodeQL locations: inputErrors=1 limit=100');
    assert.ok(!actual.stderr.includes(marker));
  }
});

test('existing SARIF validation still rejects tool failures and unresolved rules', () => {
  const failed = report(); failed.runs[0].invocations = [{ executionSuccessful: false }];
  assert.throws(() => diagnosticRecords(failed));
  const unknown = report(); unknown.runs[0].results[0].rule.ruleId = 'unknown';
  unknown.runs[0].results[0].rule.index = 100;
  assert.throws(() => diagnosticRecords(unknown));
});
