import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve as resolvePath, dirname, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Test architektoniczny: ŻADEN CRON NIE MOŻE DOSIĘGNĄĆ WYSYŁKI NA ZEWNĄTRZ
 * (krok 9 planu agenta FLO).
 *
 * Własność W1 brzmi: nic nie wychodzi na zewnątrz bez kliknięcia człowieka.
 * Kroki 6 i 8 wymusiły to w jednym miejscu (ponaglenia). Ten test pilnuje
 * całej reszty — i przede wszystkim przyszłości, bo naruszenie nie przyjdzie
 * ze złej woli, tylko ze zwykłego „dopiszę tu szybko wysyłkę, dane i tak mam”.
 *
 * DLACZEGO GRAF ZDARZEŃ, A NIE SAM GRAF IMPORTÓW: zadania w tym projekcie
 * rozmawiają przez kolejkę, nie przez importy. Cron `process-offline-queue`
 * nie importuje wysyłki do KSeF — emituje zdarzenie, które odbiera osobne
 * zadanie. Test oparty wyłącznie na importach byłby zawsze zielony i zawsze
 * bezużyteczny. Dlatego budujemy graf z dwóch rodzajów krawędzi:
 *   · import modułu,
 *   · emisja zdarzenia → zadanie, które to zdarzenie obsługuje.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['lib', 'app'];

/**
 * Ścieżka w jednej, przenośnej postaci.
 *
 * Na Windowsie `relative()` zwraca `lib\\ksef\\submit.ts`, a klucze
 * w `OUTGOING_SINKS` i `KNOWN_UNGATED` są zapisane ukośnikami zwykłymi —
 * bez tej normalizacji test przechodzi na macOS i Linuksie, a u kolegi
 * pada na czterech asercjach. Zgłoszone przez Masło, 25.08.2026.
 */
function toPosix(path: string): string {
  return path.split(sep).join('/');
}

/** Miejsca, w których coś naprawdę opuszcza nasz system. */
const OUTGOING_SINKS: Record<string, string> = {
  'lib/ksef/submit.ts': 'wysyłka faktury do KSeF',
  'lib/ksef/submit-invoice-full.ts': 'wysyłka faktury do KSeF',
  'lib/inngest/jobs/send-reminder.ts': 'wiadomość do kontrahenta',
  'lib/inngest/jobs/co-pilot-monthly.ts': 'paczka dokumentów do księgowej',
};

/**
 * Znane, świadomie tolerowane ścieżki — lista długu, nie lista wyjątków.
 * Każda ma powód i krok planu, który ją zamyka. Nowa ścieżka spoza tej listy
 * wywala test, czyli blokuje scalenie.
 */
const KNOWN_UNGATED: Record<string, string> = {
  // Faktury w kolejce offline zostały zatwierdzone przez człowieka PRZED
  // awarią Ministerstwa — dosłanie po jej ustaniu nie jest nową decyzją.
  // Brakuje jednak śladu tamtej zgody; dokłada go wykonawca propozycji.
  // ZAMYKA: krok 11 (lib/flo/execute.ts przekazuje approvalId przez kolejkę).
  'lib/inngest/jobs/process-offline-queue.ts':
    'Offline24 — dosyłka faktur zatwierdzonych przed awarią',

  // Paczka do księgowej wychodzi z crona, gdy tenant ustawił dzień miesiąca.
  // To jest zgoda przez ustawienie: ktoś włączył to raz i zapomniał — czyli
  // dokładnie ten model, który został odrzucony przy ponagleniach.
  // ZAMYKA: krok 41 (B-01 — propozycja „wysłać paczkę?” zamiast automatu).
  'lib/inngest/jobs/co-pilot-monthly.ts':
    'B-01 — automatyczna wysyłka paczki w dniu z ustawień',
};

// ═══════════════════════════════════════════════════════════════
// Budowa grafu
// ═══════════════════════════════════════════════════════════════

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(toPosix(relative(ROOT, full)));
      }
    }
  };
  walk(join(ROOT, dir));
  return out;
}

const sources = new Map<string, string>();
for (const dir of SCAN_DIRS) {
  for (const file of listSourceFiles(dir)) {
    sources.set(file, readFileSync(join(ROOT, file), 'utf8'));
  }
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

function resolveImport(spec: string, from: string): string | null {
  let candidate: string;
  if (spec.startsWith('@/')) {
    candidate = spec.slice(2);
  } else if (spec.startsWith('.')) {
    candidate = toPosix(relative(ROOT, resolvePath(ROOT, dirname(from), spec)));
  } else {
    return null; // pakiet z node_modules
  }
  for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
    if (sources.has(candidate + suffix)) return candidate + suffix;
  }
  return null;
}

/**
 * Nazwy stałych zdarzeń. Obsługujemy OBA sposoby deklaracji obecne w
 * `client.ts` — `eventType(` i `zodEvent(`. Pominięcie jednego z nich
 * (co przydarzyło się przy pierwszym podejściu) sprawia, że graf gubi
 * połowę krawędzi, a test staje się zawsze zielony i nic nie wart.
 */
const clientSource = sources.get('lib/inngest/client.ts') ?? '';
const eventNames = [
  ...clientSource.matchAll(
    /export const (\w+)\s*=\s*(?:eventType|zodEvent)\s*[<(]/g,
  ),
].map((m) => m[1]!);

const graph = new Map<string, Set<string>>();
for (const [file, source] of sources) {
  const edges = new Set<string>();
  for (const match of source.matchAll(IMPORT_RE)) {
    const target = resolveImport(match[1]!, file);
    if (target) edges.add(target);
  }
  graph.set(file, edges);
}

// Krawędzie przez kolejkę: kto emituje zdarzenie → kto je obsługuje.
let queueEdgeCount = 0;
for (const name of eventNames) {
  const emitters: string[] = [];
  const handlers: string[] = [];
  for (const [file, source] of sources) {
    if (file === 'lib/inngest/client.ts') continue;
    if (new RegExp(`\\b${name}\\.create\\s*\\(`).test(source)) {
      emitters.push(file);
    }
    if (new RegExp(`triggers:\\s*\\[[^\\]]*\\b${name}\\b`).test(source)) {
      handlers.push(file);
    }
  }
  for (const emitter of emitters) {
    for (const handler of handlers) {
      graph.get(emitter)?.add(handler);
      queueEdgeCount++;
    }
  }
}

const cronFiles = [...sources.entries()]
  .filter(([, source]) => /cron\(\s*['"]/.test(source))
  .map(([file]) => file);

function pathToSink(start: string): string[] | null {
  const queue: Array<[string, string[]]> = [[start, [start]]];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const [node, path] = queue.shift()!;
    for (const next of graph.get(node) ?? []) {
      if (next in OUTGOING_SINKS) return [...path, next];
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([next, [...path, next]]);
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Testy
// ═══════════════════════════════════════════════════════════════

describe('graf zależności — sanity', () => {
  // Bez tych trzech asercji test potrafi po cichu zzielenieć na zawsze:
  // wystarczy zmiana nazwy katalogu albo sposobu deklarowania zdarzeń.
  it('widzi źródła projektu', () => {
    expect(sources.size).toBeGreaterThan(200);
  });

  it('rozpoznaje wszystkie zdarzenia kolejki', () => {
    expect(eventNames.length).toBeGreaterThanOrEqual(20);
    expect(eventNames).toContain('invoiceSubmitRequested');
    expect(eventNames).toContain('remindersSendRequested');
  });

  it('zbudował krawędzie przez kolejkę, nie tylko importy', () => {
    expect(queueEdgeCount).toBeGreaterThan(10);
  });

  it('zna wszystkie miejsca wysyłki na zewnątrz', () => {
    for (const sink of Object.keys(OUTGOING_SINKS)) {
      expect(sources.has(sink), `brak pliku ${sink}`).toBe(true);
    }
  });

  it('znajduje crony', () => {
    expect(cronFiles.length).toBeGreaterThan(15);
  });
});

describe('W1 — nic nie wychodzi bez kliknięcia człowieka', () => {
  it('żaden cron nie dosięga wysyłki na zewnątrz poza znanym długiem', () => {
    const violations: string[] = [];

    for (const cronFile of cronFiles) {
      const path = pathToSink(cronFile);
      if (!path) continue;
      if (cronFile in KNOWN_UNGATED) continue;

      violations.push(
        `${path.join(' → ')}  [${OUTGOING_SINKS[path[path.length - 1]!]}]`,
      );
    }

    expect(
      violations,
      'Nowa ścieżka z crona do wysyłki na zewnątrz. Wysyłka musi iść przez ' +
        'wykonawcę propozycji, który sprawdza żeton zgody (lib/flo/approval.ts). ' +
        'Jeśli to świadomy, tymczasowy dług — dopisz go do KNOWN_UNGATED razem ' +
        'z powodem i krokiem planu, który go zamyka.',
    ).toEqual([]);
  });

  it('lista znanego długu nie rośnie po cichu', () => {
    // Wpis, który przestał być prawdą, ma zniknąć z listy — inaczej lista
    // przestaje być długiem, a staje się wymówką.
    for (const file of Object.keys(KNOWN_UNGATED)) {
      expect(sources.has(file), `nieistniejący plik w KNOWN_UNGATED: ${file}`).toBe(
        true,
      );
      expect(
        pathToSink(file),
        `${file} już nie dosięga wysyłki — usuń go z KNOWN_UNGATED`,
      ).not.toBeNull();
    }
    expect(Object.keys(KNOWN_UNGATED).length).toBeLessThanOrEqual(2);
  });

  it('cron ponagleń jest odcięty od wysyłki', () => {
    // To jest wynik kroku 6. Gdyby ktoś przywrócił stare zachowanie, ta
    // asercja pada jako pierwsza i wskazuje dokładnie ten plik.
    expect(pathToSink('lib/inngest/jobs/reminder-scheduler.ts')).toBeNull();
  });
});
