import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkReport } from './check-codeql-results.mjs';

const script = fileURLToPath(new URL('./check-codeql-results.mjs', import.meta.url));
const rule = (severity, extra = {}) => ({ id: 'js/synthetic-rule', properties: severity === undefined ? {} : { 'security-severity': severity }, ...extra });
const result = (extra = {}) => ({ ruleId: 'js/synthetic-rule', ruleIndex: 0, message: { text: 'Synthetic finding' }, ...extra });
const report = (rules = [rule('7.5')], results = []) => ({
  version: '2.1.0',
  runs: [{ tool: { driver: { name: 'CodeQL', rules } }, invocations: [{ executionSuccessful: true }], results }],
});

// Mirrors the CodeQL pack layout observed in the JS/TS and Actions CI output.
// No raw report, source locations, or findings from CI are stored here.
const packReport = (language, results = []) => ({
  version: '2.1.0',
  runs: [{
    tool: {
      driver: { name: 'CodeQL', semanticVersion: '2.0.0' },
      extensions: [
        { name: 'codeql/util' },
        { name: `codeql/${language}-queries`, rules: [rule('8.1')] },
        { name: `codeql/${language}-all` },
        { name: 'pr-diff-range' },
      ],
    },
    results,
  }],
});

function cli(t, files, args) {
  const directory = mkdtempSync(join(tmpdir(), 'codeql-gate-test-'));
  t.after(() => {
    // The only recursive deletion target is this test's verified temp directory.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(directory.split(/[\\/]/).at(-1), /^codeql-gate-test-/);
    rmSync(directory, { recursive: true, force: true });
  });
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(directory, name), typeof contents === 'string' ? contents : JSON.stringify(contents));
  const execution = spawnSync(process.execPath, [script, ...(args ? args(directory) : [directory])], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(execution.error, undefined);
  return { ...execution, directory };
}

test('valid empty CodeQL results pass and produce only safe counters', (t) => {
  const actual = cli(t, { 'javascript.sarif': report(), 'ignored.txt': 'ignored' });
  assert.equal(actual.status, 0);
  assert.match(actual.stdout, /^CodeQL gate: files=1 runs=1 results=0 high=0 critical=0 errorsWithoutSeverity=0 inputErrors=0\r?\n$/);
  assert.equal(actual.stderr, '');
});

test('threshold is inclusive at 7 and combines every file/run', (t) => {
  const first = report([rule('6.9')], [result()]);
  const second = report([rule('7')], [result()]);
  second.runs.push(report([rule(9)], [result()]).runs[0]);
  const actual = cli(t, { 'javascript.sarif': first, 'actions.sarif': second });
  assert.equal(actual.status, 1);
  assert.match(actual.stdout, /files=2 runs=3 results=3 high=1 critical=1/);
});

test('below-threshold security severity is authoritative even with error level', (t) => {
  assert.equal(cli(t, { 'result.sarif': report([rule('6.9')], [result({ level: 'error' })]) }).status, 0);
});

test('error without a score blocks via result, rule default, or CodeQL metadata', () => {
  for (const [descriptor, finding] of [
    [rule(undefined), result({ level: 'error' })],
    [rule(undefined, { defaultConfiguration: { level: 'error' } }), result()],
    [rule(undefined, { properties: { 'problem.severity': 'error' } }), result()],
  ]) assert.equal(checkReport(report([descriptor], [finding])).errorsWithoutSeverity, 1);
});

test('rule-id-only and rule-index-only references are supported', () => {
  for (const finding of [result({ ruleIndex: undefined }), result({ ruleId: undefined })]) {
    assert.equal(checkReport(report([rule('8')], [finding])).high, 1);
  }
});

test('CodeQL pack rule metadata resolves through extension index', () => {
  const input = report([], [result({ rule: { id: 'js/synthetic-rule', index: 0, toolComponent: { index: 0, name: 'codeql/javascript-queries' } } })]);
  input.runs[0].tool.extensions = [{ name: 'codeql/javascript-queries', rules: [rule('9.8')] }];
  assert.equal(checkReport(input).critical, 1);
});

test('actual CodeQL layout permits driver and library extensions without rules', (t) => {
  const input = packReport('javascript');
  assert.equal(checkReport(input).results, 0);
  assert.equal(Object.hasOwn(input.runs[0].tool.driver, 'rules'), false);
  assert.equal(Object.hasOwn(input.runs[0].tool.extensions[0], 'rules'), false);
  const actual = cli(t, { 'javascript.sarif': input, 'actions.sarif': packReport('actions') });
  assert.equal(actual.status, 0);
  assert.match(actual.stdout, /files=2 runs=2 results=0 high=0 critical=0/);
});

test('high extension rule still blocks with no rules on the driver or libraries', (t) => {
  const finding = result({
    ruleIndex: undefined,
    rule: { id: 'js/synthetic-rule', index: 0, toolComponent: { index: 1, name: 'codeql/javascript-queries' } },
  });
  const actual = cli(t, { 'javascript.sarif': packReport('javascript', [finding]) });
  assert.equal(actual.status, 1);
  assert.match(actual.stdout, /results=1 high=1 critical=0/);
});

test('omitted rule tables cannot satisfy a result reference', (t) => {
  for (const finding of [
    result(),
    result({ rule: { index: 0, toolComponent: { index: 0 } } }),
  ]) assert.equal(cli(t, { 'javascript.sarif': packReport('javascript', [finding]) }).status, 2);
});

test('explicitly malformed driver or extension rules still reject', (t) => {
  for (const target of ['driver', 'library', 'queries']) {
    const input = packReport('javascript');
    const tool = input.runs[0].tool;
    const component = target === 'driver' ? tool.driver : tool.extensions[target === 'library' ? 0 : 1];
    component.rules = null;
    assert.equal(cli(t, { 'javascript.sarif': input }).status, 2);
  }
});

test('suppression and baseline metadata cannot hide a high finding', () => {
  const actual = checkReport(report([rule('8')], [result({ level: 'none', baselineState: 'unchanged', suppressions: [{ kind: 'external', status: 'accepted' }] })]));
  assert.equal(actual.high, 1);
});

test('missing invocation is allowed by SARIF but malformed or failed invocations reject', () => {
  const without = report();
  delete without.runs[0].invocations;
  assert.equal(checkReport(without).runs, 1);
  for (const invocations of [null, [], [{}], [{ executionSuccessful: false }], [{ executionSuccessful: 'true' }], [{ executionSuccessful: true, exitCode: 1 }]]) {
    const input = report();
    input.runs[0].invocations = invocations;
    assert.throws(() => checkReport(input));
  }
});

test('error notifications reject even when tool claims successful execution', () => {
  for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
    const input = report();
    input.runs[0].invocations[0][key] = [{ level: 'error', message: { text: 'Do not print this' } }];
    assert.throws(() => checkReport(input));
    input.runs[0].invocations[0][key][0].level = 'warning';
    assert.equal(checkReport(input).runs, 1);
  }
});

test('missing, empty, malformed, or non-CodeQL report structures reject', () => {
  const invalid = [null, [], {}, { version: '2.1.0', runs: [] }, { version: '2.1.0', runs: [null] }, report()];
  invalid.at(-1).version = '2.0.0';
  for (const input of invalid) assert.throws(() => checkReport(input));
  for (const mutate of [
    (run) => { delete run.results; },
    (run) => { run.results = null; },
    (run) => { run.tool.driver.name = 'Other scanner'; },
    (run) => { run.tool.driver.rules = null; },
    (run) => { run.tool.driver.rules = [rule('8'), rule('2')]; },
    (run) => { run.tool.extensions = {}; },
    (run) => { run.tool.driver.rules[0].properties = null; },
  ]) {
    const input = report(); mutate(input.runs[0]);
    assert.throws(() => checkReport(input));
  }
});

test('unknown, missing, conflicting, and invalid rule references reject', () => {
  for (const finding of [
    result({ ruleId: 'js/unknown' }),
    result({ ruleId: undefined, ruleIndex: undefined }),
    result({ ruleIndex: -1 }),
    result({ ruleIndex: 1 }),
    result({ ruleIndex: '0' }),
    result({ rule: { id: 'js/conflicting' } }),
    result({ rule: null }),
    result({ rule: { toolComponent: { index: 0 } } }),
    result({ message: undefined }),
    result({ level: 'fatal' }),
  ]) assert.throws(() => checkReport(report([rule('8')], [finding])));
});

test('invalid security scores are errors, not implicit clean scans', () => {
  for (const score of [null, '', ' ', 'high', 'NaN', true, -1, 11, {}, '7 trailing']) {
    assert.throws(() => checkReport(report([rule(score)], [result()])));
  }
});

test('CLI returns 2 for absent directory, no SARIF, malformed JSON, or bad arguments', (t) => {
  for (const execution of [
    cli(t, {}, (directory) => [join(directory, 'missing')]),
    cli(t, {}),
    cli(t, { 'broken.sarif': '{not-json' }),
    cli(t, { 'invalid.sarif': {} }),
    cli(t, {}, () => []),
    cli(t, {}, (directory) => [directory, 'extra']),
  ]) {
    assert.equal(execution.status, 2);
    assert.equal(execution.stdout, '');
    assert.equal(execution.stderr, 'CodeQL gate: inputErrors=1\n');
  }
});

test('a directory named .sarif is not mistaken for a completed analysis', (t) => {
  const actual = cli(t, {}, (directory) => {
    mkdirSync(join(directory, 'nested.sarif'));
    return [directory];
  });
  assert.equal(actual.status, 2);
});

test('a malformed report takes precedence over another valid blocking report', (t) => {
  const actual = cli(t, { 'valid.sarif': report([rule('9.8')], [result()]), 'invalid.sarif': '{}' });
  assert.equal(actual.status, 2);
  assert.equal(actual.stdout, '');
});

test('CLI never discloses report contents, paths, messages, or parse errors', (t) => {
  const marker = 'SYNTHETIC_PRIVATE_CONTENT_29857';
  const input = report([rule('9.8')], [result({ message: { text: marker }, locations: [{ physicalLocation: { artifactLocation: { uri: `https://invalid.example/${marker}` }, region: { snippet: { text: marker } } } }] })]);
  const found = cli(t, { [`${marker}.sarif`]: input });
  const malformed = cli(t, { [`${marker}.sarif`]: `{"${marker}": malformed` });
  assert.equal(found.status, 1);
  assert.equal(malformed.status, 2);
  for (const actual of [found, malformed]) {
    assert.ok(!(actual.stdout + actual.stderr).includes(marker));
    assert.ok(!(actual.stdout + actual.stderr).includes(actual.directory));
  }
});
