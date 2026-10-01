#!/usr/bin/env node
// Bramka dla PR agenta kodu (krok 7 planu automatyzacji, docs/runbooks/agent-kodu.md).
//
// PR agenta = gałąź `agent/*` albo commit autorstwa claude[bot]. PR ludzi
// przechodzą bez zmian. Dla PR agenta:
//   1. zmiana ścieżki z .github/CODEOWNERS (czytanego z GAŁĘZI BAZOWEJ) wymaga
//      etykiety `zgoda:obszar-wrazliwy` nadanej przez właściciela tej ścieżki,
//   2. zmiana kodu w lib/, app/, components/ albo proxy.ts wymaga testu
//      w tests/ (albo etykiety `zgoda:bez-testu` od właściciela),
//   3. każdy nowy push zdejmuje etykiety zgody — zgoda dotyczy tego, co
//      człowiek widział.
//
// Tryby:
//   guard  — workflow agent-guard.yml (pull_request_target, kod z main, bez
//            uruchamiania kodu z PR). Exit 1 = PR zablokowany.
//   detect — job „Test-first (agent)” w ci.yml: wypisuje do GITHUB_OUTPUT,
//            czy uruchomić testy na kodzie bazowym i które.
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const AGENT_BRANCH_PREFIX = 'agent/';
export const AGENT_BOT = 'claude[bot]';
export const SENSITIVE_LABEL = 'zgoda:obszar-wrazliwy';
export const NO_TEST_LABEL = 'zgoda:bez-testu';

const TEST_FILE = /^tests\/.+\.test\.tsx?$/;
const CODE_FILE = /^(?:(?:lib|app|components)\/.+\.(?:ts|tsx|js|mjs)|proxy\.ts)$/;
// Ścieżki trafiają do GITHUB_OUTPUT i do wiersza poleceń — tylko bezpieczne znaki.
const SAFE_PATH = /^[A-Za-z0-9_./()[\]-]+$/;

/** Wzorzec CODEOWNERS → RegExp (obsługuje to, czego używamy: /katalog/, /plik, *, **). */
export function patternToRegExp(pattern) {
  const anchored = pattern.startsWith('/');
  let body = pattern.replace(/^\//, '');
  const directory = body.endsWith('/');
  if (directory) body = body.slice(0, -1);
  const escaped = body
    .split('**')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  const prefix = anchored ? '^' : '^(?:.*/)?';
  const suffix = directory ? '/.*$' : '(?:/.*)?$';
  return new RegExp(prefix + escaped + suffix);
}

export function parseCodeowners(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return {
        pattern,
        regex: patternToRegExp(pattern),
        owners: owners.map((o) => o.replace(/^@/, '').toLowerCase()),
      };
    });
}

/** Właściciele pliku wg CODEOWNERS (ostatnia pasująca reguła wygrywa) albo null. */
export function ownersFor(path, rules) {
  let owners = null;
  for (const rule of rules) if (rule.regex.test(path)) owners = rule.owners;
  return owners;
}

export function isAgentPr({ headRef, commits }) {
  if (headRef?.startsWith(AGENT_BRANCH_PREFIX)) return true;
  return (commits ?? []).some((c) =>
    [c.author?.login, c.committer?.login, c.commit?.author?.name, c.commit?.committer?.name]
      .some((who) => typeof who === 'string' && who.toLowerCase() === AGENT_BOT));
}

/** Kto ostatni nadał etykietę (zdarzenia issue w kolejności chronologicznej). */
export function lastLabeler(events, label) {
  let actor = null;
  for (const e of events ?? []) {
    if (e.event === 'labeled' && e.label?.name === label) actor = e.actor?.login?.toLowerCase() ?? null;
  }
  return actor;
}

/**
 * Decyzja dla PR. `files`: [{ filename, status }], `labels`: nazwy etykiet
 * obecnych na PR, `events`: zdarzenia issue, `rules`: CODEOWNERS z bazy.
 */
export function evaluate({ agent, files, labels, events, rules }) {
  if (!agent) return { agent: false, ok: true, reasons: [], sensitive: [], tests: [] };

  const reasons = [];
  const present = new Set(labels ?? []);
  const paths = files.map((f) => f.filename);

  const sensitive = paths.filter((p) => ownersFor(p, rules) !== null);
  if (sensitive.length > 0) {
    const approver = present.has(SENSITIVE_LABEL) ? lastLabeler(events, SENSITIVE_LABEL) : null;
    const notApproved = sensitive.filter((p) => !approver || !ownersFor(p, rules).includes(approver));
    if (notApproved.length > 0) {
      reasons.push(
        `Zmiana obszaru wrażliwego bez zgody właściciela (etykieta ${SENSITIVE_LABEL}): ${notApproved.join(', ')}`,
      );
    }
  }

  const tests = files
    .filter((f) => f.status !== 'removed' && TEST_FILE.test(f.filename))
    .map((f) => f.filename);
  const code = paths.filter((p) => CODE_FILE.test(p) && !TEST_FILE.test(p));
  // Zwolnienie z testu (np. sama zmiana tekstów) nadaje ktokolwiek z CODEOWNERS.
  const maintainers = new Set(rules.flatMap((r) => r.owners));
  const testWaived = present.has(NO_TEST_LABEL) && maintainers.has(lastLabeler(events, NO_TEST_LABEL) ?? '');
  if (code.length > 0 && tests.length === 0 && !testWaived) {
    reasons.push(
      `Zmiana kodu bez testu w tests/ (najpierw test, który pada bez poprawki; wyjątek: etykieta ${NO_TEST_LABEL}): ${code.join(', ')}`,
    );
  }

  const unsafe = tests.filter((t) => !SAFE_PATH.test(t));
  if (unsafe.length > 0) reasons.push(`Niedozwolone znaki w nazwach testów: ${unsafe.length} plik(ów)`);

  return {
    agent: true,
    ok: reasons.length === 0,
    reasons,
    sensitive,
    tests: tests.filter((t) => SAFE_PATH.test(t)),
    runTestFirst: code.length > 0 && tests.length > 0 && unsafe.length === 0,
  };
}

// ── GitHub API ───────────────────────────────────────────────────────────

async function gh(path, { method = 'GET', token, allow404 = false } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${method} ${path.split('?')[0]}: HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function paginate(path, token) {
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const batch = await gh(`${path}${sep}per_page=100&page=${page}`, { token });
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function loadContext(token) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = event.pull_request;
  if (!pr) throw new Error('To nie jest zdarzenie pull_request');
  const base = `/repos/${repo}`;
  const [files, commits] = await Promise.all([
    paginate(`${base}/pulls/${pr.number}/files`, token),
    paginate(`${base}/pulls/${pr.number}/commits`, token),
  ]);
  return { event, repo, pr, base, files, commits, agent: isAgentPr({ headRef: pr.head.ref, commits }) };
}

async function guard() {
  const token = process.env.GITHUB_TOKEN;
  const { event, pr, base, files, agent } = await loadContext(token);
  let labels = (pr.labels ?? []).map((l) => l.name);

  if (agent && event.action === 'synchronize') {
    for (const label of [SENSITIVE_LABEL, NO_TEST_LABEL].filter((l) => labels.includes(l))) {
      await gh(`${base}/issues/${pr.number}/labels/${encodeURIComponent(label)}`, { method: 'DELETE', token, allow404: true });
      console.log(`Nowy push — zdjęto etykietę ${label}; zgoda potrzebna ponownie.`);
    }
    labels = labels.filter((l) => l !== SENSITIVE_LABEL && l !== NO_TEST_LABEL);
  }

  // CODEOWNERS z bazy: PR nie może zmienić listy właścicieli, którą sam jest oceniany.
  const owners = await gh(
    `${base}/contents/.github/CODEOWNERS?ref=${encodeURIComponent(pr.base.sha)}`,
    { token, allow404: true },
  );
  const rules = owners ? parseCodeowners(Buffer.from(owners.content, 'base64').toString('utf8')) : [];
  const events = agent ? await paginate(`${base}/issues/${pr.number}/events`, token) : [];

  const result = evaluate({ agent, files, labels, events, rules });
  const summary = !result.agent
    ? 'PR człowieka — bramka agenta nie dotyczy.'
    : result.ok
      ? `PR agenta — zgody kompletne. Obszary wrażliwe: ${result.sensitive.length}, testy: ${result.tests.length}.`
      : `PR agenta — ZABLOKOWANY:\n- ${result.reasons.join('\n- ')}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (!result.ok) process.exitCode = 1;
}

async function detect() {
  const token = process.env.GITHUB_TOKEN;
  const { files, agent } = await loadContext(token);
  const result = evaluate({ agent, files, labels: [], events: [], rules: [] });
  const run = Boolean(result.agent && result.runTestFirst);
  const out = `run=${run}\ntests=${run ? result.tests.join(' ') : ''}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  console.log(agent ? `PR agenta; test-first: ${run ? result.tests.join(' ') : 'nie dotyczy'}` : 'PR człowieka — test-first nie dotyczy.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const run = mode === 'guard' ? guard : mode === 'detect' ? detect : null;
  if (!run) {
    console.error('Użycie: agent-guard.mjs guard|detect');
    process.exit(2);
  }
  run().catch((err) => {
    console.error(`agent-guard: ${err instanceof Error ? err.message : 'nieznany błąd'}`);
    process.exit(2);
  });
}
