#!/usr/bin/env node
// Minimal gate for CodeQL SARIF 2.1.0, not a general SARIF validator.
// Exit 0: below threshold; 1: blocking findings; 2: incomplete/unsupported input.
// Never print report contents, filenames, locations, or exception messages.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

export function checkReport(report) {
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
      else if (severity !== undefined && severity >= 7) counts.high += 1;
      else if (severity === undefined && level === 'error') counts.errorsWithoutSeverity += 1;
    }
  }
  return counts;
}

export function checkDirectory(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.name.endsWith('.sarif'));
  requireValid(entries.length > 0 && entries.every((entry) => entry.isFile()));
  const counts = { files: 0, runs: 0, results: 0, high: 0, critical: 0, errorsWithoutSeverity: 0 };
  for (const entry of entries) {
    const current = checkReport(JSON.parse(readFileSync(join(directory, entry.name), 'utf8')));
    counts.files += 1;
    for (const key of Object.keys(current)) counts[key] += current[key];
  }
  return counts;
}

function main() {
  try {
    requireValid(process.argv.length === 3 && nonempty(process.argv[2]));
    const counts = checkDirectory(process.argv[2]);
    const blocked = counts.high + counts.critical + counts.errorsWithoutSeverity > 0;
    console.log(`CodeQL gate: files=${counts.files} runs=${counts.runs} results=${counts.results} high=${counts.high} critical=${counts.critical} errorsWithoutSeverity=${counts.errorsWithoutSeverity} inputErrors=0`);
    return blocked ? 1 : 0;
  } catch {
    console.error('CodeQL gate: inputErrors=1');
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
