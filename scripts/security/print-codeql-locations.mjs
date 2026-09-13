#!/usr/bin/env node
// Narrow diagnostic projection of raw CodeQL SARIF. No messages or source text.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReport } from './check-codeql-results.mjs';

export const MAX_RECORDS = 100;
const MAX_PATH_LENGTH = 512;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireValid(condition) {
  if (!condition) throw new Error('Invalid CodeQL diagnostic input');
}

function safePath(uri) {
  requireValid(typeof uri === 'string' && uri.length > 0 && uri.length <= MAX_PATH_LENGTH);
  // SARIF paths may percent-encode route groups, brackets, and spaces.
  const path = decodeURIComponent(uri);
  requireValid(path.length > 0 && path.length <= MAX_PATH_LENGTH);
  requireValid(/^[A-Za-z0-9_./()[\]@ -]+$/.test(path));
  requireValid(!path.startsWith('/') && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'));
  return path;
}

function safeRuleId(run, result) {
  const reference = result.rule ?? {};
  const component = reference.toolComponent === undefined
    ? run.tool.driver
    : run.tool.extensions[reference.toolComponent.index];
  const id = result.ruleId ?? reference.id ?? component.rules[result.ruleIndex ?? reference.index].id;
  requireValid(typeof id === 'string' && id.length <= 200 && /^(?:js|actions)\/[a-z0-9][a-z0-9._/-]*$/.test(id));
  requireValid(id.split('/').every((part) => part !== '' && part !== '.' && part !== '..'));
  return id;
}

export function diagnosticRecords(report) {
  checkReport(report);
  const records = [];
  for (const run of report.runs) {
    for (const result of run.results) {
      const ruleId = safeRuleId(run, result);
      requireValid(Array.isArray(result.locations) && result.locations.length > 0);
      for (const location of result.locations) {
        requireValid(isObject(location) && isObject(location.physicalLocation));
        const { artifactLocation, region } = location.physicalLocation;
        requireValid(isObject(artifactLocation) && isObject(region));
        const path = safePath(artifactLocation.uri);
        requireValid(Number.isSafeInteger(region.startLine) && region.startLine > 0);
        records.push({ ruleId, path, startLine: region.startLine });
        requireValid(records.length <= MAX_RECORDS);
      }
    }
  }
  return records;
}

export function directoryRecords(directory) {
  const files = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.name.endsWith('.sarif'));
  requireValid(files.length > 0 && files.every((entry) => entry.isFile()));
  const records = [];
  for (const file of files) {
    records.push(...diagnosticRecords(JSON.parse(readFileSync(join(directory, file.name), 'utf8'))));
    requireValid(records.length <= MAX_RECORDS);
  }
  return records;
}

function main() {
  try {
    requireValid(process.argv.length === 3);
    // Validate every report before printing anything, including metadata.
    const records = directoryRecords(process.argv[2]);
    console.log(`CodeQL locations: records=${records.length} limit=${MAX_RECORDS}`);
    for (const record of records) console.log(JSON.stringify(record));
    return 0;
  } catch {
    console.error(`CodeQL locations: inputErrors=1 limit=${MAX_RECORDS}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
