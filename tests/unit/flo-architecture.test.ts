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
 * rozmawiają przez kolejkę, nie przez importy. Dawniej cron
 * `process-offline-queue` emitował zdarzenie wysyłki KSeF, choć nie importował
 * jej kodu bezpośrednio. Automatyczne dosyłanie Offline24 jest wstrzymane,
 * a test musi wykryć każdą przyszłą zmianę tego stanu. Dlatego budujemy graf:
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
  'lib/jobs/runners/send-reminder.ts': 'wiadomość do kontrahenta',
  'lib/jobs/runners/co-pilot-monthly.ts': 'paczka dokumentów do księgowej',
};

/**
 * Znane, świadomie tolerowane ścieżki — lista długu, nie lista wyjątków.
 * Każda ma powód i krok planu, który ją zamyka. Nowa ścieżka spoza tej listy
 * wywala test, czyli blokuje scalenie.
 */
const KNOWN_UNGATED: Record<string, string> = {
  // Paczka do księgowej wychodzi z crona, gdy tenant ustawił dzień miesiąca.
  // To jest zgoda przez ustawienie: ktoś włączył to raz i zapomniał — czyli
  // dokładnie ten model, który został odrzucony przy ponagleniach.
  // ZAMYKA: krok 41 (B-01 — propozycja „wysłać paczkę?” zamiast automatu).
  'lib/jobs/runners/co-pilot-monthly.ts':
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

/**
 * Trzy formy importu: `from '…'`, `import('…')` i GOŁE `import '…'`.
 *
 * Trzecia doszła 17.09.2026 (plan FLO 2, zadanie 1.1). Tak właśnie rejestrują
 * się wykonawcy agenta (`lib/flo/functions/index.ts`), a bez niej graf nie
 * widział krawędzi rejestr → wykonawca ponagleń → wysyłka. Po dopisaniu W1
 * nadal jest zielony — ale od teraz z powodu kodu, a nie ślepej plamki.
 */
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|^import\s+)['"]([^'"]+)['"]/gm;

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
 * `events.ts` — `jobEvent<` i `zodEvent(`. Pominięcie jednego z nich
 * (co przydarzyło się przy pierwszym podejściu) sprawia, że graf gubi
 * połowę krawędzi, a test staje się zawsze zielony i nic nie wart.
 */
const clientSource = sources.get('lib/jobs/events.ts') ?? '';
const eventNames = [
  ...clientSource.matchAll(
    /export const (\w+)\s*=\s*(?:jobEvent|zodEvent)\s*[<(]/g,
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
// Od etapu 10 (Inngest odpięty) wyzwalacz to rejestracja pg-boss:
//   stała zdarzenia → nazwa zdarzenia (`lib/jobs/events.ts`)
//   → kolejki (`EVENT_QUEUE_MAP` w `lib/jobs/queues.ts`)
//   → runner zarejestrowany na kolejce (`lib/jobs/handlers/*`)
//   → plik, który ten runner eksportuje.
const eventStringByConst = new Map(
  [...clientSource.matchAll(/export const (\w+)\s*=\s*(?:zodEvent\(\s*|jobEvent<[\s\S]*?>\(\s*)'([^']+)'/g)]
    .map((m) => [m[1]!, m[2]!] as const),
);
const queuesSource = sources.get('lib/jobs/queues.ts') ?? '';
const mapBody = queuesSource.slice(
  queuesSource.indexOf('EVENT_QUEUE_MAP = {'),
  queuesSource.indexOf('} as const', queuesSource.indexOf('EVENT_QUEUE_MAP = {')),
);
const queuesByEvent = new Map(
  [...mapBody.matchAll(/'([a-z]+\/[a-z0-9.-]+)':\s*\[([^\]]*)\]/g)].map((m) => [
    m[1]!,
    [...m[2]!.matchAll(/'([a-z0-9.-]+)'/g)].map((q) => q[1]!),
  ] as const),
);
const runnerByQueue = new Map<string, string>();
for (const [file, source] of sources) {
  if (!file.startsWith('lib/jobs/handlers/')) continue;
  for (const m of source.matchAll(/\b\w+Job\(\s*'([a-z0-9.-]+)',\s*(run\w+)/g)) {
    runnerByQueue.set(m[1]!, m[2]!);
  }
  for (const m of source.matchAll(/queue:\s*'([a-z0-9.-]+)'[\s\S]*?handler:[^\n]*?\b(run\w+)\(/g)) {
    runnerByQueue.set(m[1]!, m[2]!);
  }
}
const fileByRunner = new Map<string, string>();
for (const [file, source] of sources) {
  for (const m of source.matchAll(/export (?:async )?function (run\w+)\s*[<(]/g)) {
    fileByRunner.set(m[1]!, file);
  }
}
const handlerFileByQueue = new Map(
  [...runnerByQueue].flatMap(([queue, runner]) => {
    const file = fileByRunner.get(runner);
    return file ? [[queue, file] as const] : [];
  }),
);

let queueEdgeCount = 0;
for (const name of eventNames) {
  const emitters: string[] = [];
  for (const [file, source] of sources) {
    if (file === 'lib/jobs/events.ts') continue;
    if (new RegExp(`\\b${name}\\.create\\s*\\(`).test(source)) {
      emitters.push(file);
    }
  }
  const eventString = eventStringByConst.get(name);
  const handlers = (eventString ? queuesByEvent.get(eventString) ?? [] : [])
    .map((queue) => handlerFileByQueue.get(queue))
    .filter((file): file is string => Boolean(file));
  for (const emitter of emitters) {
    for (const handler of handlers) {
      graph.get(emitter)?.add(handler);
      queueEdgeCount++;
    }
  }
}

const cronFiles = [
  ...new Set(
    [...handlerFileByQueue]
      .filter(([queue]) => queue.startsWith('cron.'))
      .map(([, file]) => file),
  ),
];

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
    expect(pathToSink('lib/jobs/runners/reminder-scheduler.ts')).toBeNull();
  });

  it('puls agenta jest odcięty od wysyłki', () => {
    // `cron.flo-tick` chodzi wyłącznie na pg-boss (`lib/jobs/queues.ts`), więc
    // nie ma w nim `cron(` i pętla po `cronFiles` go nie widzi. A to właśnie
    // tu dopisujemy producentów kart (plan FLO 2, faza 1) — jeden nieostrożny
    // import wykonawcy wychodzącego i puls wysyłałby sam.
    expect(pathToSink('lib/flo/tick.ts')).toBeNull();
  });

  it('rozstrzyganie trybu cichego jest odcięte od wysyłki', () => {
    // Ten sam powód co wyżej: `cron.flo-shadow-settle` chodzi tylko na pg-boss.
    // Porównuje i zapisuje wynik — nie ma prawa niczego wysłać.
    expect(pathToSink('lib/flo/shadow-settle.ts')).toBeNull();
  });
});
