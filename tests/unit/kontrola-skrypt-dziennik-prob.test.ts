import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `scripts/ops/kontrola-faktur-ksef.sh`, sekcja 12: dziennik prób wysyłki
 * (A5, `ksef_send_attempts` z 00150) — błędy i odmowy z 24 h, wykonania
 * przerwane (`started` bez wyniku po 20 min, jak `/admin/centrum/bledy`)
 * i nieudane zapisy dziennika w logach.
 *
 * Uruchamiany jest PRAWDZIWY skrypt. Atrapa `ssh` pomija opcje i host,
 * a komendę zdalną wykonuje `bash -c` — tak jak sshd po stronie serwera,
 * więc SQL przechodzi przez obie powłoki jak na produkcji. Atrapa `docker`
 * zapisuje, co faktycznie dostał `psql -c`, i odpowiada na sondę tabeli.
 * Semantykę zapytań sprawdza się na bazie z 00150 (opis PR); tu: gałęzie
 * skryptu, komunikaty i to, że żadne zapytanie nie zmienia się po drodze.
 */

const SCRIPT = resolve(__dirname, '../../scripts/ops/kontrola-faktur-ksef.sh');
const LEDGER_TABLE = 'ksef_send_attempts';
const WORKER = 'workertest-abc123';
const APP = 'apptest-def456';

const FAKE_SSH = `#!/usr/bin/env bash
# Atrapa ssh: opcje i host pominięte; reszta złączona spacją idzie do powłoki (jak sshd).
while [ $# -gt 0 ]; do
  case "$1" in
    -i|-o|-p|-l|-F) shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
host=$1; shift
if [ -n "\${FAKE_SSH_FAIL_HOST:-}" ] && [ "$host" = "$FAKE_SSH_FAIL_HOST" ]; then exit 255; fi
exec bash -c "$*"
`;

const FAKE_DOCKER = `#!/usr/bin/env bash
# Atrapa docker: psql zapisuje SQL (rozdzielone NUL), sonda tabeli odpowiada FAKE_REGCLASS.
case "$1" in
  ps) [ -n "\${FAKE_CONTAINERS:-}" ] && printf '%s\\n' $FAKE_CONTAINERS; exit 0 ;;
  logs) name=\${!#}; [ -f "$FAKE_DIR/log-$name" ] && cat "$FAKE_DIR/log-$name"; exit 0 ;;
  exec)
    [ "$3" = psql ] || exit 0
    sql=""; prev=""
    for a in "$@"; do [ "$prev" = "-c" ] && sql=$a; prev=$a; done
    printf '%s\\0' "$sql" >> "$FAKE_DIR/sql"
    case "$sql" in
      *"to_regclass('public.${LEDGER_TABLE}')"*)
        [ -n "\${FAKE_REGCLASS:-}" ] || exit 1
        printf '%s\\n' "$FAKE_REGCLASS" ;;
    esac
    exit 0 ;;
esac
exit 0
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kontrola-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'ssh'), FAKE_SSH);
  writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER);
  chmodSync(join(dir, 'bin', 'ssh'), 0o755);
  chmodSync(join(dir, 'bin', 'docker'), 0o755);
  writeFileSync(
    join(dir, 'infra.env'),
    [
      'K=/nie/ma/klucza',
      'APP=app.example.test',
      'DB=db.example.test',
      'PGC=pgc-test',
      'RESTC=rest-test',
      'APP_PREFIX=apptest',
      'WORKER_PREFIX=workertest',
    ].join('\n'),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  stdout: string;
  sql: string[];
  status: number | null;
}

function runScript(env: Record<string, string> = {}): Run {
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
      HOME: dir,
      LANG: 'C.UTF-8',
      FAKTFLOW_INFRA_ENV: join(dir, 'infra.env'),
      FAKE_DIR: dir,
      ...env,
    },
  });
  const log = join(dir, 'sql');
  const sql = existsSync(log) ? readFileSync(log, 'utf8').split('\0').slice(0, -1) : [];
  return { stdout: result.stdout, sql, status: result.status };
}

/** Część wyjścia od nagłówka sekcji 12 do następnej sekcji. */
function section12(stdout: string): string {
  const start = stdout.indexOf('\n=== 12.');
  expect(start, 'brak sekcji 12 w wyjściu skryptu').toBeGreaterThanOrEqual(0);
  const next = stdout.indexOf('\n=== ', start + 1);
  return stdout.slice(start, next === -1 ? undefined : next);
}

const ledgerQueries = (sql: string[]) =>
  sql.filter((q) => q.includes(LEDGER_TABLE) && !q.includes('to_regclass'));

describe('kontrola-faktur-ksef.sh — sekcja 12: dziennik prób wysyłki', () => {
  it('z tabelą: zakres dziennika, stany z 24 h, błędy wg kodu ze stanem faktur teraz i lista ostatnich', () => {
    const run = runScript({ FAKE_REGCLASS: 't' });
    expect(run.status).toBe(0);
    const out = section12(run.stdout);

    expect(out).toContain('dziennik prób wysyłki');
    expect(out).toContain('zakres dziennika');
    expect(out).toContain('wykonania z 24 h wg stanu');
    expect(out).toContain('błędy, odmowy i przerwane z 24 h wg kodu');
    expect(out).toContain('ostatnie błędy, odmowy i przerwane z 24 h');
    expect(out).not.toContain('BRAK TABELI');

    const queries = ledgerQueries(run.sql);
    expect(queries).toHaveLength(4);
    // Te same progi co /admin/centrum/bledy: okno 24 h, przerwane po 20 min,
    // „utknęła” po 30 min w `sending` (I2).
    for (const q of queries) expect(q).toContain("interval '24 hours'");
    expect(queries.filter((q) => q.includes("interval '20 minutes'"))).toHaveLength(3);
    expect(queries.some((q) => q.includes("interval '30 minutes'"))).toBe(true);
    // Tylko odczyt.
    for (const q of queries) expect(q.trimStart()).toMatch(/^SELECT /);
  });

  it('bez tabeli (00150 niewgrana): jeden komunikat zamiast serii „zapytanie nieudane”, bez zapytań do dziennika', () => {
    const run = runScript({ FAKE_REGCLASS: 'f' });
    expect(run.status).toBe(0);
    const out = section12(run.stdout);

    expect(out).toContain('BRAK TABELI ksef_send_attempts');
    expect(out).toContain('00150');
    expect(out).not.toContain('zapytanie nieudane');
    expect(ledgerQueries(run.sql)).toEqual([]);
    expect(run.stdout).toContain('Koniec. Skrypt niczego nie zmienił.');
  });

  it('sonda tabeli nieudana: „nie wiadomo”, a nie pusty dziennik', () => {
    const run = runScript();
    expect(run.status).toBe(0);
    const out = section12(run.stdout);

    expect(out).toContain('nie wiadomo');
    expect(out).not.toContain('BRAK TABELI');
    expect(ledgerQueries(run.sql)).toEqual([]);
  });

  it('brak połączenia z db-1: skrypt kończy się i mówi „nie wiadomo”', () => {
    const run = runScript({ FAKE_REGCLASS: 't', FAKE_SSH_FAIL_HOST: 'root@db.example.test' });
    expect(run.status).toBe(0);
    expect(section12(run.stdout)).toContain('nie wiadomo');
    expect(run.stdout).toContain('Koniec. Skrypt niczego nie zmienił.');
  });

  it('logi: wpisy ksef.send.attempt i nieudane zapisy dziennika osobno dla workera i aplikacji', () => {
    writeFileSync(
      join(dir, `log-${WORKER}`),
      [
        '[worker] ksef.send.attempt {"status":"succeeded","stage":"finalize"}',
        '[worker] ksef.send.attempt {"status":"failed","stage":"credentials","code":"NO_CERTIFICATE"}',
        '[worker] WARN Dziennik prób wysyłki KSeF: zapis nieudany (wysyłka trwa dalej) {"op":"start"}',
        '[worker] WARN Dziennik prób wysyłki KSeF: opis porażki nieudany (wysyłka bez zmian) {}',
        '[worker] cron.ops-heartbeat ok',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, `log-${APP}`),
      [
        // Odmowa przed kolejką zapisuje akcja serwera (aplikacja); `[ksef.send-attempts]`
        // to nie jest wpis wyniku wykonania.
        '[ksef.send-attempts] zapis odmowy przed kolejką nieudany { code: "MFA_REQUIRED" }',
      ].join('\n'),
    );
    const run = runScript({ FAKE_REGCLASS: 't', FAKE_CONTAINERS: `${WORKER} ${APP}` });
    const out = section12(run.stdout);

    expect(out).toContain(`${WORKER}: ksef.send.attempt 2, zapis nieudany 2`);
    expect(out).toContain(`${APP}: ksef.send.attempt 0, zapis nieudany 1`);
  });
});

describe('kontrola-faktur-ksef.sh — zapytania przechodzą przez dwie powłoki bez zmian', () => {
  /** `sql "etykieta" "zapytanie"` ze źródła skryptu, w kolejności (zmienna okna sekcji 9 rozwinięta). */
  function declaredQueries(): string[] {
    const source = readFileSync(SCRIPT, 'utf8');
    const re = /^\s*sql "(?:[^"\\]|\\.)*"\s*(?:\\\n\s*)?"((?:[^"\\]|\\.)*)"/gm;
    return [...source.matchAll(re)].map((m) => m[1].replaceAll('$A4B_HOURS', '24'));
  }

  it('psql dostaje każde zapytanie dokładnie tak, jak jest w skrypcie (bez cudzysłowów, $ i ` po drodze)', () => {
    const run = runScript({ FAKE_REGCLASS: 't' });
    const declared = declaredQueries();
    const received = run.sql.filter((q) => !q.includes('to_regclass'));

    expect(declared.length).toBeGreaterThan(30);
    expect(received).toEqual(declared);
    for (const q of declared) expect(q.trimStart()).toMatch(/^SELECT /);
  });
});
