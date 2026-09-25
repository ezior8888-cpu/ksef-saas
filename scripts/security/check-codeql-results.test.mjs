import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkDirectory, checkReport } from './check-codeql-results.mjs';

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
  assert.match(actual.stdout, /^CodeQL gate: files=1 runs=1 results=0 high=0 critical=0 errorsWithoutSeverity=0 acceptedReviewedFalsePositives=0 inputErrors=0\r?\n$/);
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

const reviewedRuleId = 'js/insufficient-password-hash';
const reviewedSourcePath = 'lib/auth/breach-check.ts';
const reviewedResult = (extra = {}) => result({
  ruleId: reviewedRuleId,
  locations: [{ physicalLocation: {
    artifactLocation: { uri: reviewedSourcePath, uriBaseId: '%SRCROOT%' },
    region: { startLine: 7 },
  } }],
  ...extra,
});
const reviewedReport = (results = [reviewedResult()], severity = '8.2') => report([rule(severity, { id: reviewedRuleId })], results);
const blockingCount = (counts) => counts.high + counts.critical + counts.errorsWithoutSeverity - counts.acceptedReviewedFalsePositives;

function reviewedFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'codeql-reviewed-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(directory.split(/[\\/]/).at(-1), /^codeql-reviewed-test-/);
    rmSync(directory, { recursive: true, force: true });
  });
  const sourceRoot = join(directory, 'source');
  const reports = join(directory, 'reports');
  const sourceFile = join(sourceRoot, reviewedSourcePath);
  mkdirSync(dirname(sourceFile), { recursive: true });
  mkdirSync(reports);
  // Synthetic bytes only. Time is fixed; a test run never renews the review.
  const source = '// Synthetic fixture\n\n\n\n\n\nprotocolHash();\n';
  writeFileSync(sourceFile, source);
  const manifest = {
    version: 1,
    ruleId: reviewedRuleId,
    path: reviewedSourcePath,
    startLine: 7,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    maxOccurrences: 1,
    reviewedAt: '2026-09-15',
    reviewBy: '2026-12-15',
    reason: 'Synthetic reviewed use of the HIBP range protocol, not password storage.',
    reference: 'https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange',
  };
  const manifestPath = join(directory, 'review.json');
  const saveManifest = (value = manifest) => writeFileSync(manifestPath, JSON.stringify(value));
  const saveReport = (value = reviewedReport(), name = 'javascript.sarif') => writeFileSync(join(reports, name), JSON.stringify(value));
  saveManifest();
  saveReport();
  const options = { manifestPath, sourceRoot, now: Date.parse('2026-09-16T12:00:00.000Z') };
  return { directory, sourceRoot, sourceFile, source, reports, manifestPath, manifest, options, saveManifest, saveReport };
}

test('one reviewed HIBP finding passes explicitly while all original counters remain visible', (t) => {
  const f = reviewedFixture(t);
  const counts = checkDirectory(f.reports, f.options);
  assert.deepEqual(counts, { files: 1, runs: 1, results: 1, high: 1, critical: 0, errorsWithoutSeverity: 0, acceptedReviewedFalsePositives: 1 });
  assert.equal(blockingCount(counts), 0);
  const ordinary = checkDirectory(f.reports);
  assert.equal(ordinary.high, 1);
  assert.equal(ordinary.acceptedReviewedFalsePositives, 0);
  assert.equal(blockingCount(ordinary), 1);
});

test('another source path, line, rule, missing location or multiple locations never matches', (t) => {
  const f = reviewedFixture(t);
  for (const mutate of [
    (input) => { input.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri = 'lib/auth/other.ts'; },
    (input) => { input.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri = '../lib/auth/breach-check.ts'; },
    (input) => { input.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri = 'file:///lib/auth/breach-check.ts'; },
    (input) => { input.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uriBaseId = 'OTHER_ROOT'; },
    (input) => { input.runs[0].results[0].locations[0].physicalLocation.region.startLine = 8; },
    (input) => { input.runs[0].results[0].locations[0].physicalLocation.region.startLine = '7'; },
    (input) => { input.runs[0].results[0].ruleId = 'js/other-rule'; input.runs[0].tool.driver.rules[0].id = 'js/other-rule'; },
    (input) => { delete input.runs[0].results[0].locations; },
    (input) => { input.runs[0].results[0].locations = [{}]; },
    (input) => { input.runs[0].results[0].locations.push(structuredClone(input.runs[0].results[0].locations[0])); },
  ]) {
    const input = reviewedReport(); mutate(input); f.saveReport(input);
    const counts = checkDirectory(f.reports, f.options);
    assert.equal(counts.acceptedReviewedFalsePositives, 0);
    assert.equal(blockingCount(counts), 1);
  }
});

test('a change anywhere in the complete source, including line endings, restores the block', (t) => {
  const f = reviewedFixture(t);
  for (const source of [f.source + '// change after the finding\n', f.source.replace('Synthetic', 'Changed'), f.source.replaceAll('\n', '\r\n')]) {
    writeFileSync(f.sourceFile, source);
    const counts = checkDirectory(f.reports, f.options);
    assert.equal(counts.high, 1);
    assert.equal(counts.acceptedReviewedFalsePositives, 0);
    assert.equal(blockingCount(counts), 1);
  }
});

test('duplicates within one run, across runs, or across files invalidate the entire exception', (t) => {
  const f = reviewedFixture(t);
  const duplicateRun = reviewedReport();
  duplicateRun.runs.push(structuredClone(duplicateRun.runs[0]));
  for (const input of [reviewedReport([reviewedResult(), reviewedResult()]), duplicateRun]) {
    f.saveReport(input);
    const counts = checkDirectory(f.reports, f.options);
    assert.equal(counts.high, 2);
    assert.equal(counts.acceptedReviewedFalsePositives, 0);
    assert.equal(blockingCount(counts), 2);
  }
  f.saveReport(); f.saveReport(reviewedReport(), 'duplicate.sarif');
  const counts = checkDirectory(f.reports, f.options);
  assert.equal(counts.files, 2);
  assert.equal(counts.high, 2);
  assert.equal(counts.acceptedReviewedFalsePositives, 0);
});

test('a second high, a critical, or an unscored error still blocks with one accepted finding', (t) => {
  const f = reviewedFixture(t);
  for (const severity of ['7.0', '9.8', undefined]) {
    const input = reviewedReport();
    input.runs[0].tool.driver.rules.push(rule(severity));
    input.runs[0].results.push(result({ ruleIndex: 1, level: 'error', baselineState: 'unchanged', suppressions: [{ kind: 'external', status: 'accepted' }] }));
    f.saveReport(input);
    const counts = checkDirectory(f.reports, f.options);
    assert.equal(counts.acceptedReviewedFalsePositives, 1);
    assert.equal(blockingCount(counts), 1);
    assert.equal(counts.results, 2);
  }
});

test('a critical score on the reviewed rule can never use the high-only exception', (t) => {
  const f = reviewedFixture(t);
  f.saveReport(reviewedReport([reviewedResult()], '9.0'));
  const counts = checkDirectory(f.reports, f.options);
  assert.equal(counts.critical, 1);
  assert.equal(counts.acceptedReviewedFalsePositives, 0);
  assert.equal(blockingCount(counts), 1);
});

test('SARIF suppressions and baseline metadata do not grant an exception or alter raw counts', (t) => {
  const f = reviewedFixture(t);
  f.saveReport(reviewedReport([reviewedResult({ baselineState: 'unchanged', suppressions: [{ kind: 'external', status: 'accepted' }], level: 'none' })]));
  const without = checkDirectory(f.reports);
  assert.equal(without.high, 1);
  assert.equal(blockingCount(without), 1);
  const reviewed = checkDirectory(f.reports, f.options);
  assert.equal(reviewed.high, 1);
  assert.equal(reviewed.acceptedReviewedFalsePositives, 1);
});

test('an indexed SARIF artifact must resolve to the same source and root', (t) => {
  const f = reviewedFixture(t);
  const input = reviewedReport();
  const location = input.runs[0].results[0].locations[0].physicalLocation.artifactLocation;
  input.runs[0].artifacts = [{ location: structuredClone(location) }];
  location.index = 0;
  f.saveReport(input);
  assert.equal(checkDirectory(f.reports, f.options).acceptedReviewedFalsePositives, 1);
  for (const index of [-1, 1, '0']) {
    location.index = index; f.saveReport(input);
    assert.equal(checkDirectory(f.reports, f.options).acceptedReviewedFalsePositives, 0);
  }
  location.index = 0;
  input.runs[0].artifacts[0].location.uri = 'lib/other.ts'; f.saveReport(input);
  assert.equal(checkDirectory(f.reports, f.options).acceptedReviewedFalsePositives, 0);
});

test('extension rules retain the same exact match requirements', (t) => {
  const f = reviewedFixture(t);
  const input = packReport('javascript', [reviewedResult({ rule: { id: reviewedRuleId, index: 0, toolComponent: { index: 1 } } })]);
  input.runs[0].tool.extensions[1].rules = [rule('8.2', { id: reviewedRuleId })];
  f.saveReport(input);
  assert.equal(checkDirectory(f.reports, f.options).acceptedReviewedFalsePositives, 1);
});

test('strict manifest validation rejects broader rules, paths, wildcards, counts and malformed fields', (t) => {
  const f = reviewedFixture(t);
  for (const value of [null, [], {}, { ...f.manifest, extra: true }, { ...f.manifest, version: 2 },
    { ...f.manifest, maxOccurrences: 2 }, { ...f.manifest, ruleId: 'js/*' }, { ...f.manifest, path: '../breach-check.ts' },
    { ...f.manifest, startLine: 0 }, { ...f.manifest, startLine: '7' }, { ...f.manifest, sourceSha256: 'short' },
    { ...f.manifest, sourceSha256: 'A'.repeat(64) }, { ...f.manifest, reason: '' }, { ...f.manifest, reference: 'https://example.test' },
    { ...f.manifest, reviewedAt: '2026-02-30' }, { ...f.manifest, reviewBy: 'never' },
  ]) {
    f.saveManifest(value);
    assert.throws(() => checkDirectory(f.reports, f.options));
  }
});

test('review dates are checked with injected UTC time and cannot silently renew or precede review', (t) => {
  const f = reviewedFixture(t);
  for (const now of ['2026-09-14T23:59:59.999Z', '2026-12-16T00:00:00.000Z']) {
    assert.throws(() => checkDirectory(f.reports, { ...f.options, now: Date.parse(now) }));
  }
  for (const now of ['2026-09-15T00:00:00.000Z', '2026-12-15T23:59:59.999Z']) {
    assert.equal(checkDirectory(f.reports, { ...f.options, now: Date.parse(now) }).acceptedReviewedFalsePositives, 1);
  }
});

test('missing source, manifest or malformed report fails closed despite an otherwise valid exception', (t) => {
  const f = reviewedFixture(t);
  assert.throws(() => checkDirectory(f.reports, { ...f.options, manifestPath: join(f.directory, 'missing.json') }));
  f.saveReport({});
  assert.throws(() => checkDirectory(f.reports, f.options));
  f.saveReport();
  rmSync(f.sourceFile);
  assert.throws(() => checkDirectory(f.reports, f.options));
});

test('a source directory junction or symlink is rejected even inside the chosen repository', (t) => {
  const f = reviewedFixture(t);
  const original = dirname(f.sourceFile);
  const target = join(f.sourceRoot, 'other-source');
  renameSync(original, target);
  symlinkSync(target, original, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => checkDirectory(f.reports, f.options));
});

test('CLI opt-in prints only safe counters and requires both exact flags', (t) => {
  const f = reviewedFixture(t);
  // Wide fixed fixture dates keep the CLI test deterministic without changing
  // the production manifest or adding a way to override its clock in CI.
  f.saveManifest({ ...f.manifest, reviewedAt: '2000-01-01', reviewBy: '9999-12-31' });
  const args = [script, f.reports, '--reviewed-findings', f.manifestPath, '--source-root', f.sourceRoot];
  const actual = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 10_000 });
  assert.equal(actual.status, 0);
  assert.match(actual.stdout, /^CodeQL gate: files=1 runs=1 results=1 high=1 critical=0 errorsWithoutSeverity=0 acceptedReviewedFalsePositives=1 inputErrors=0\r?\n$/);
  assert.equal(actual.stderr, '');
  for (const badArgs of [args.slice(0, -2), [...args, 'extra'], [script, f.reports, '--ignore', f.manifestPath, '--source-root', f.sourceRoot]]) {
    const invalid = spawnSync(process.execPath, badArgs, { encoding: 'utf8', timeout: 10_000 });
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    assert.equal(invalid.stderr, 'CodeQL gate: inputErrors=1\n');
  }
});

test('CLI never prints malformed manifest data or a source read error', (t) => {
  const f = reviewedFixture(t);
  const marker = 'SYNTHETIC_PRIVATE_REVIEW_MARKER_6543';
  const args = [script, f.reports, '--reviewed-findings', f.manifestPath, '--source-root', f.sourceRoot];
  f.saveManifest({ ...f.manifest, sourceSha256: marker, reason: marker });
  const execution = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 10_000 });
  assert.equal(execution.status, 2);
  assert.equal(execution.stdout, '');
  assert.equal(execution.stderr, 'CodeQL gate: inputErrors=1\n');
  assert.ok(!(execution.stdout + execution.stderr).includes(marker));
  assert.ok(!(execution.stdout + execution.stderr).includes(f.directory));
});