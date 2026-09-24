#!/usr/bin/env node
// Minimal gate for CodeQL SARIF 2.1.0, not a general SARIF validator.
// Exit 0: below threshold; 1: blocking findings; 2: incomplete/unsupported input.
// Never print report contents, filenames, locations, or exception messages.
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const levels = new Set(['none', 'note', 'warning', 'error']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (object, key) => Object.hasOwn(object, key);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

function requireValid(condition) {
  if (!condition) throw new Error('Invalid or unsupported CodeQL report');
}

function validateLevel(value) {
  requireValid(levels.has(value));
  return value;
}

function severityFor(rule) {
  const properties = has(rule, 'properties') ? rule.properties : {};
  requireValid(isObject(properties));
  if (!has(properties, 'security-severity')) return undefined;
  const value = properties['security-severity'];
  requireValid(typeof value === 'number' || (typeof value === 'string' && /^(?:10(?:\.0+)?|[0-9](?:\.\d+)?)$/.test(value)));
  const severity = Number(value);
  requireValid(Number.isFinite(severity) && severity >= 0 && severity <= 10);
  return severity;
}

function validateRules(component) {
  requireValid(isObject(component) && nonempty(component.name));
  // CodeQL omits rules on the driver and on non-query pack extensions.
  // An omitted array is empty; an explicitly malformed array is not.
  const rules = has(component, 'rules') ? component.rules : [];
  requireValid(Array.isArray(rules));
  const seen = new Set();
  for (const rule of rules) {
    requireValid(isObject(rule) && nonempty(rule.id) && !seen.has(rule.id));
    seen.add(rule.id);
    severityFor(rule);
    if (has(rule, 'defaultConfiguration')) {
      requireValid(isObject(rule.defaultConfiguration));
      if (has(rule.defaultConfiguration, 'level')) validateLevel(rule.defaultConfiguration.level);
    }
    const problemSeverity = rule.properties?.['problem.severity'];
    if (problemSeverity !== undefined) requireValid(['error', 'warning', 'recommendation'].includes(problemSeverity));
  }
  return { ...component, rules };
}

function resolveRule(result, driver, extensions) {
  requireValid(isObject(result));
  let component = driver;
  const reference = has(result, 'rule') ? result.rule : {};
  requireValid(isObject(reference));
  if (has(reference, 'toolComponent')) {
    const ref = reference.toolComponent;
    requireValid(isObject(ref) && Number.isSafeInteger(ref.index) && ref.index >= 0 && ref.index < extensions.length);
    component = extensions[ref.index];
    if (has(ref, 'name')) requireValid(ref.name === component.name);
    if (has(ref, 'guid')) requireValid(nonempty(ref.guid) && ref.guid === component.guid);
  }
  const ids = [result.ruleId, reference.id].filter((value) => value !== undefined);
  const indices = [result.ruleIndex, reference.index].filter((value) => value !== undefined);
  requireValid(ids.length + indices.length > 0);
  requireValid(ids.every((id) => nonempty(id) && id === ids[0]));
  requireValid(indices.every((index) => Number.isSafeInteger(index) && index >= 0 && index < component.rules.length && index === indices[0]));
  const rule = indices.length ? component.rules[indices[0]] : component.rules.find((candidate) => candidate.id === ids[0]);
  requireValid(rule !== undefined && ids.every((id) => id === rule.id));
  return rule;
}

function validateInvocations(run) {
  // SARIF permits invocations to be omitted; analyze must succeed independently.
  if (!has(run, 'invocations')) return;
  requireValid(Array.isArray(run.invocations) && run.invocations.length > 0);
  for (const invocation of run.invocations) {
    requireValid(isObject(invocation) && invocation.executionSuccessful === true);
    if (has(invocation, 'exitCode')) requireValid(invocation.exitCode === 0);
    for (const key of ['toolExecutionNotifications', 'toolConfigurationNotifications']) {
      if (!has(invocation, key)) continue;
      requireValid(Array.isArray(invocation[key]));
      for (const notification of invocation[key]) {
        requireValid(isObject(notification));
        const level = has(notification, 'level') ? validateLevel(notification.level) : 'warning';
        requireValid(level !== 'error');
      }
    }
  }
}

function countReport(report, onHigh) {
  requireValid(isObject(report) && report.version === '2.1.0' && Array.isArray(report.runs) && report.runs.length > 0);
  const counts = { runs: 0, results: 0, high: 0, critical: 0, errorsWithoutSeverity: 0 };
  for (const run of report.runs) {
    requireValid(isObject(run) && isObject(run.tool) && run.tool.driver?.name === 'CodeQL' && Array.isArray(run.results));
    const driver = validateRules(run.tool.driver);
    requireValid(!has(run.tool, 'extensions') || Array.isArray(run.tool.extensions));
    const extensions = (run.tool.extensions ?? []).map(validateRules);
    validateInvocations(run);
    counts.runs += 1;
    for (const result of run.results) {
      const rule = resolveRule(result, driver, extensions);
      requireValid(isObject(result.message) && (nonempty(result.message.text) || nonempty(result.message.markdown)));
      const severity = severityFor(rule);
      const defaultLevel = rule.defaultConfiguration?.level ?? (rule.properties?.['problem.severity'] === 'error' ? 'error' : 'warning');
      const level = has(result, 'level') ? validateLevel(result.level) : defaultLevel;
      counts.results += 1;
      // Do not silently exempt suppressed, unchanged, or baseline findings.
      if (severity !== undefined && severity >= 9) counts.critical += 1;
      else if (severity !== undefined && severity >= 7) {
        counts.high += 1;
        onHigh?.(run, result, rule);
      }
      else if (severity === undefined && level === 'error') counts.errorsWithoutSeverity += 1;
    }
  }
  return counts;
}

export function checkReport(report) {
  return countReport(report);
}

// One reviewed HIBP protocol use, not a general suppression mechanism. The
// manifest and complete source fingerprint must be reviewed together in Git.
function loadReviewedFinding(manifestPath, sourceRoot, now) {
  const finding = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const keys = ['version', 'ruleId', 'path', 'startLine', 'sourceSha256', 'maxOccurrences', 'reviewedAt', 'reviewBy', 'reason', 'reference'];
  requireValid(isObject(finding) && Object.keys(finding).length === keys.length && keys.every((key) => has(finding, key)));
  requireValid(finding.version === 1 && finding.maxOccurrences === 1);
  requireValid(finding.ruleId === 'js/insufficient-password-hash' && finding.path === 'lib/auth/breach-check.ts');
  requireValid(typeof finding.sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(finding.sourceSha256));
  requireValid(nonempty(finding.reason) && finding.reason.length <= 1500);
  requireValid(finding.reference === 'https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange');
  requireValid(Number.isSafeInteger(finding.startLine) && finding.startLine > 0);
  const dates = [finding.reviewedAt, finding.reviewBy].map((date) => {
    requireValid(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date));
    const timestamp = Date.parse(date + 'T00:00:00.000Z');
    requireValid(Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date);
    return timestamp;
  });
  const today = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00.000Z');
  requireValid(dates[0] <= today && today <= dates[1]);
  const root = realpathSync(sourceRoot);
  const source = realpathSync(resolve(root, finding.path));
  requireValid(source === resolve(root, finding.path));
  const sourceRelative = relative(root, source);
  requireValid(sourceRelative !== '' && !isAbsolute(sourceRelative) && !sourceRelative.split(/[\\/]/).includes('..'));
  // Hash raw bytes: no whitespace or newline normalization that could conceal
  // a source change. The manifest must use the bytes of the committed LF blob.
  const sourceMatches = createHash('sha256').update(readFileSync(source)).digest('hex') === finding.sourceSha256;
  return { ...finding, sourceMatches };
}

function matchesReviewedFinding(run, result, rule, finding) {
  if (!finding.sourceMatches || rule.id !== finding.ruleId) return false;
  if (!Array.isArray(result.locations) || result.locations.length !== 1) return false;
  const physical = result.locations[0]?.physicalLocation;
  if (!isObject(physical) || !isObject(physical.artifactLocation) || !isObject(physical.region)) return false;
  const { artifactLocation, region } = physical;
  if (artifactLocation.uri !== finding.path) return false;
  if (has(artifactLocation, 'uriBaseId') && artifactLocation.uriBaseId !== '%SRCROOT%') return false;
  // If the SARIF also supplies an artifact index, its reference must agree.
  if (has(artifactLocation, 'index')) {
    const index = artifactLocation.index;
    if (!Number.isSafeInteger(index) || index < 0 || !Array.isArray(run.artifacts)) return false;
    const indexed = run.artifacts[index]?.location;
    if (!isObject(indexed) || indexed.uri !== artifactLocation.uri || indexed.uriBaseId !== artifactLocation.uriBaseId) return false;
  }
  return region.startLine === finding.startLine;
}

export function checkDirectory(directory, options) {
  const finding = options === undefined ? undefined : loadReviewedFinding(options.manifestPath, options.sourceRoot, options.now ?? Date.now());
  const entries = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.name.endsWith('.sarif'));
  requireValid(entries.length > 0 && entries.every((entry) => entry.isFile()));
  const counts = { files: 0, runs: 0, results: 0, high: 0, critical: 0, errorsWithoutSeverity: 0, acceptedReviewedFalsePositives: 0 };
  let reviewedMatches = 0;
  for (const entry of entries) {
    const current = countReport(JSON.parse(readFileSync(join(directory, entry.name), 'utf8')), (run, result, rule) => {
      if (finding && matchesReviewedFinding(run, result, rule, finding)) reviewedMatches += 1;
    });
    counts.files += 1;
    for (const key of Object.keys(current)) counts[key] += current[key];
  }
  // Duplicate findings anywhere in the input invalidate this single exception.
  if (reviewedMatches === 1) counts.acceptedReviewedFalsePositives = 1;
  return counts;
}

function main() {
  try {
    requireValid((process.argv.length === 3 || process.argv.length === 7) && nonempty(process.argv[2]));
    let options;
    if (process.argv.length === 7) {
      requireValid(process.argv[3] === '--reviewed-findings' && nonempty(process.argv[4]));
      requireValid(process.argv[5] === '--source-root' && nonempty(process.argv[6]));
      options = { manifestPath: process.argv[4], sourceRoot: process.argv[6] };
    }
    const counts = checkDirectory(process.argv[2], options);
    const blocked = counts.high + counts.critical + counts.errorsWithoutSeverity - counts.acceptedReviewedFalsePositives > 0;
    console.log(`CodeQL gate: files=${counts.files} runs=${counts.runs} results=${counts.results} high=${counts.high} critical=${counts.critical} errorsWithoutSeverity=${counts.errorsWithoutSeverity} acceptedReviewedFalsePositives=${counts.acceptedReviewedFalsePositives} inputErrors=0`);
    return blocked ? 1 : 0;
  } catch {
    console.error('CodeQL gate: inputErrors=1');
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
