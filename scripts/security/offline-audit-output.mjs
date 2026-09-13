/**
 * Local-only report output for static inventories. No environment files,
 * application imports, network requests, or vulnerability verdicts.
 */
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** @param {string[]} args */
export function parseOfflineAuditArgs(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  if (args.length !== 2 || args[0] !== '--output-dir' || !args[1].trim() || args[1].startsWith('--')) {
    throw new Error('Podaj dokładnie --output-dir <lokalny-katalog> albo --help.');
  }
  // Do not turn a mistyped URL or UNC share into filesystem/network access.
  if (/^(?:[/\\]{2}|[a-z][a-z0-9+.-]*:\/\/)/i.test(args[1])) {
    throw new Error('--output-dir musi wskazywać lokalny katalog, nie URL ani udział sieciowy.');
  }
  return args[1];
}

/** Resolve existing ancestors too, so a junction cannot alias the historic report directory.
 * @param {string} target
 * @returns {string}
 */
function canonicalPath(target) {
  try {
    return realpathSync(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const parent = dirname(target);
    if (parent === target) throw error;
    return join(canonicalPath(parent), basename(target));
  }
}

/** @param {string} parent @param {string} candidate */
function isWithin(parent, candidate) {
  const remainder = relative(parent, candidate);
  return remainder === '' || (remainder !== '..' && !remainder.startsWith('..' + sep) && !isAbsolute(remainder));
}

/** @param {string} message @param {number} code @returns {never} */
function fail(message, code) {
  console.error(message);
  process.exit(code);
}

/**
 * exit 0 means report generation only; analysis/read/write failures exit 1,
 * invalid arguments or the protected historical directory exit 2.
 * @param {{ args: string[], root: string, reportName: string, script: string }} options
 */
export function configureOfflineAudit({ args, root, reportName, script }) {
  let requested;
  try {
    requested = parseOfflineAuditArgs(args);
  } catch (error) {
    fail(error.message, 2);
  }
  if (requested === null) {
    console.log('Użycie: node scripts/security/' + script + ' --output-dir <lokalny-katalog>');
    console.log('Uruchom z katalogu głównego repo. Odczyt wyłącznie kodu i plików migracji; bez .env i połączeń z usługami.');
    console.log('Raporty muszą być nowe i poza docs/security/audyt. Istniejące pliki nie są nadpisywane.');
    console.log('Kod 0: raport wygenerowany, nie potwierdzenie braku podatności. Kod 1: błąd odczytu/zapisu. Kod 2: błędne argumenty.');
    process.exit(0);
  }

  let outputDir;
  try {
    outputDir = canonicalPath(resolve(root, requested));
    const historicDir = canonicalPath(join(root, 'docs/security/audyt'));
    if (isWithin(historicDir, outputDir)) {
      fail('Odmowa zapisu do historycznego docs/security/audyt. Wybierz osobny katalog wyników.', 2);
    }
  } catch {
    fail('Nie można sprawdzić lokalnego katalogu wyników.', 1);
  }

  const markdownPath = join(outputDir, reportName + '.md');
  const jsonPath = join(outputDir, reportName + '.json');

  const ensureNewReports = () => {
    if (lstatSync(markdownPath, { throwIfNoEntry: false }) || lstatSync(jsonPath, { throwIfNoEntry: false })) {
      fail('Raport już istnieje. Wybierz nowy katalog wyników; pliki nie zostały nadpisane.', 1);
    }
  };
  ensureNewReports();

  /** @param {string} markdown @param {string} json */
  const writeReports = (markdown, json) => {
    try {
      // Recheck both files before writing either; wx also protects against races
      // and existing symlinks. A failed pair must never be reported as successful.
      ensureNewReports();
      mkdirSync(outputDir, { recursive: true, mode: 0o700 });
      writeFileSync(markdownPath, markdown, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      writeFileSync(jsonPath, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch {
      fail('Nie udało się zapisać kompletnej pary raportów. Sprawdź katalog wyników; przebieg nie jest zaliczony.', 1);
    }
    console.log('Raport lokalny wygenerowany. Kod 0 nie oznacza braku podatności; klasyfikacje wymagają ręcznej weryfikacji.');
  };

  return { markdownPath, jsonPath, writeReports };
}
