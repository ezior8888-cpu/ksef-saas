/**
 * Warstwa modelu językowego (krok 15 planu, własność W2 i mechanizm M4).
 *
 * MODEL NIE PISZE LICZB. Dostaje NAZWY pól, którymi dysponuje, i ma ułożyć
 * z nich zdanie z placeholderami — a liczby podstawia kod z kroku 14. Dzięki
 * temu halucynacja kwoty nie jest „mało prawdopodobna”, tylko strukturalnie
 * niemożliwa: model nigdy nie widzi wartości i nigdy nie dotyka miejsca,
 * w którym trafia ona na ekran.
 *
 * Wyjście przechodzi przez trzy sita: schemat, zakaz cyfr, biała lista
 * placeholderów. Po pierwszym odrzuceniu jedna ponowna próba z informacją,
 * co było nie tak. Po drugim — deterministyczny szablon. Klient nigdy nie
 * zobaczy błędu modelu; najwyżej zdanie napisane sztywniej.
 *
 * KOLEJKA WSADOWA — świadomie NIE TERAZ. Plan przewiduje ją dla nocnych
 * wywołań z `flo.tick`, bo to połowa ceny za ten sam wynik. Dziś puls nie
 * generuje ŻADNYCH treści (reguły funkcji dochodzą od bloku 3), więc byłby
 * to potok bez nadawcy. Wraca jako osobne zadanie przy pierwszej funkcji,
 * która naprawdę produkuje propozycje nocą — razem z drugą połową, czyli
 * odbiorem wyników przed 07:30.
 */

import { getAnthropic } from '@/lib/anthropic/client';
import {
  assertBudget,
  recordUsage,
  type FloModel,
  type TokenUsage,
} from '@/lib/flo/budget';
import { FLO_TEMPLATES, placeholdersOf, renderCopy, type FloTemplate } from '@/lib/flo/copy';
import type { FloDbClient } from '@/lib/flo/db-types';
import { logger } from '@/lib/observability/logger';
import { redactForModel } from '@/lib/flo/redact';
import { isAnthropicMocked } from '@/lib/test-mode';
import type { FloProposalKind } from '@/types/flo';

// ═══════════════════════════════════════════════════════════════
// Wybór modelu
// ═══════════════════════════════════════════════════════════════

/**
 * Rodzaje, przy których wchodzi mocniejszy model.
 *
 * Kryterium nie brzmi „ważne”, tylko „dużo danych naraz, a wywołanie jedno”.
 * Domknięcie miesiąca streszcza kilkadziesiąt dokumentów, podsumowanie roku
 * — dwanaście miesięcy. Reszta to jedno zdanie o jednej fakturze, na co
 * Haiku wystarcza w zupełności i kosztuje trzykrotnie mniej.
 */
const HEAVY_KINDS: ReadonlySet<FloProposalKind> = new Set([
  'accountant.package',
  'wrapped.ready',
  'tax.simulate',
]);

export function modelFor(kind: FloProposalKind): FloModel {
  return HEAVY_KINDS.has(kind) ? 'claude-sonnet-5' : 'claude-haiku-4-5';
}

// ═══════════════════════════════════════════════════════════════
// Prompt
// ═══════════════════════════════════════════════════════════════

/**
 * Część stała promptu — kandydat do pamięci podręcznej.
 *
 * NIE MA TU ZNACZNIKA CZASU ANI NICZEGO ZMIENNEGO. Jedna data w tym miejscu
 * unieważnia cache przy każdym wywołaniu, czyli zamienia oszczędność
 * w dodatkowy koszt zapisu.
 *
 * UCZCIWA UWAGA: przy obecnej długości ten prompt jest ZA KRÓTKI, żeby
 * pamięć podręczna cokolwiek dała — próg opłacalności liczy się w tysiącach
 * tokenów. Znacznik zostaje, bo część stała urośnie, gdy dojdzie do niej
 * przewodnik po głosie agenta (`content/flo/GLOS.md`, tor interfejsu).
 * Do tego czasu to jest przygotowanie, nie oszczędność.
 */
const SYSTEM_PROMPT = `Jesteś FLO — asystentem w polskiej aplikacji do faktur.

Twoje zadanie: ułożyć KRÓTKI tytuł i treść karty dla przedsiębiorcy.

ZASADY BEZWZGLĘDNE:
- NIE WOLNO CI UŻYWAĆ ŻADNYCH CYFR. Wszystkie liczby wstawia system przez
  placeholdery w formacie {{nazwa}}. Wolno Ci użyć wyłącznie placeholderów
  z listy, którą dostaniesz.
- Nie wymyślaj faktów. Masz nazwy pól, nie masz wartości — i tak ma zostać.
- Piszesz po polsku, do właściciela małej firmy, po ludzku.
- Bez wykrzykników, bez emoji, bez korporacyjnego lukru.
- Tytuł: jedno zdanie, najwyżej kilka słów, konkret na początku.
- Treść: jedno, najwyżej dwa zdania. Zawsze mówi, co dalej.
- Nigdy nie obiecuj, że coś wyślesz albo zrobisz sam.

Odpowiadasz WYŁĄCZNIE obiektem JSON: {"title": "...", "body": "..."}`;

// ═══════════════════════════════════════════════════════════════
// Walidacja wyjścia (funkcja czysta)
// ═══════════════════════════════════════════════════════════════

export type CopyRejection =
  | 'not_json'
  | 'bad_shape'
  | 'contains_digits'
  | 'unknown_placeholder'
  | 'too_long';

export interface ValidationOk {
  ok: true;
  copy: FloTemplate;
}
export interface ValidationFail {
  ok: false;
  reason: CopyRejection;
  detail: string;
}

const MAX_TITLE = 120;
const MAX_BODY = 400;

export function validateModelCopy(
  raw: string,
  allowedPlaceholders: readonly string[],
): ValidationOk | ValidationFail {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, reason: 'not_json', detail: 'Odpowiedź nie jest JSON-em.' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).title !== 'string' ||
    typeof (parsed as Record<string, unknown>).body !== 'string'
  ) {
    return {
      ok: false,
      reason: 'bad_shape',
      detail: 'Oczekiwałem obiektu z polami title i body.',
    };
  }

  const copy = parsed as FloTemplate;
  const both = `${copy.title} ${copy.body}`;

  // Sito najważniejsze: model nie ma prawa napisać ŻADNEJ cyfry. Wszystkie
  // liczby przychodzą z danych, przez placeholdery.
  if (/\d/.test(both)) {
    return {
      ok: false,
      reason: 'contains_digits',
      detail: 'Użyłeś cyfry. Wszystkie liczby wstawia system przez placeholdery.',
    };
  }

  const used = [...placeholdersOf(copy.title), ...placeholdersOf(copy.body)];
  const unknown = used.filter((name) => !allowedPlaceholders.includes(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: 'unknown_placeholder',
      detail: `Nie mam wartości dla: ${unknown.join(', ')}. Użyj wyłącznie: ${allowedPlaceholders.join(', ')}.`,
    };
  }

  if (copy.title.length > MAX_TITLE || copy.body.length > MAX_BODY) {
    return { ok: false, reason: 'too_long', detail: 'Za długo. Skróć.' };
  }

  return { ok: true, copy };
}

/** Model bywa rozmowny — wyłuskujemy pierwszy obiekt JSON z odpowiedzi. */
function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

// ═══════════════════════════════════════════════════════════════
// Wywołanie
// ═══════════════════════════════════════════════════════════════

export interface ModelCallResult {
  text: string;
  usage: TokenUsage;
}

export type ModelCall = (req: {
  model: FloModel;
  system: string;
  user: string;
}) => Promise<ModelCallResult>;

export interface GenerateCopyInput {
  kind: FloProposalKind;
  tenantId: string;
  /** Gotowe, sformatowane wartości — model ich NIE widzi. */
  values: Record<string, string>;
  /** Kontekst słowny bez liczb i bez danych osobowych, np. „trzecie opóźnienie”. */
  hints?: string[];
}

export interface GenerateCopyResult {
  copy: FloTemplate;
  source: 'model' | 'template';
  /** Powód zejścia na szablon — do dziennika, nie dla klienta. */
  fallbackReason?: 'budget' | 'mocked' | 'no_key' | 'invalid_output' | 'error';
}

/**
 * Układa treść propozycji. NIGDY nie rzuca z powodu modelu — najgorsze,
 * co się może stać, to zdanie z szablonu.
 */
export async function generateCopy(
  input: GenerateCopyInput,
  now: Date = new Date(),
  db?: FloDbClient,
  call: ModelCall = callAnthropic,
): Promise<GenerateCopyResult> {
  const template = FLO_TEMPLATES[input.kind];
  if (!template) {
    throw new Error(`Brak szablonu dla rodzaju: ${input.kind}`);
  }

  const fallback = (
    reason: GenerateCopyResult['fallbackReason'],
  ): GenerateCopyResult => ({
    copy: renderCopy(input.kind, input.values),
    source: 'template',
    fallbackReason: reason,
  });

  if (isAnthropicMocked()) return fallback('mocked');

  const verdict = await assertBudget(input.tenantId, now, db);
  if (!verdict.allowed) {
    // Nie alarmujemy klienta. Dla niego nic się nie zmienia poza tym, że
    // zdania są sztywniejsze.
    logger.info('[flo/llm] budżet wyczerpany — szablon', {
      tenantId: input.tenantId,
      reason: verdict.reason,
      spentPln: verdict.spentPln.toFixed(2),
    });
    return fallback('budget');
  }

  if (verdict.alert) {
    logger.info('[flo/llm] konto powyżej dwukrotności celu kosztowego', {
      tenantId: input.tenantId,
      spentPln: verdict.spentPln.toFixed(2),
    });
  }

  const model = modelFor(input.kind);
  const allowed = Object.keys(input.values);
  const userPrompt = buildUserPrompt(input, allowed, template);

  let lastDetail = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: ModelCallResult;
    try {
      result = await call({
        model,
        system: SYSTEM_PROMPT,
        user: attempt === 0 ? userPrompt : `${userPrompt}\n\nPOPRAW: ${lastDetail}`,
      });
    } catch (e) {
      // Brak sieci, brak klucza, przeciążenie dostawcy — wszystko jedno.
      // Propozycja i tak powstanie.
      logger.info('[flo/llm] wywołanie nieudane — szablon', {
        kind: input.kind,
        error: e instanceof Error ? e.message : 'nieznany',
      });
      return fallback('error');
    }

    await recordUsage(input.tenantId, model, result.usage, now, db);

    const validated = validateModelCopy(result.text, allowed);
    if (validated.ok) {
      return {
        copy: {
          title: renderTemplateSafely(validated.copy.title, input.values),
          body: renderTemplateSafely(validated.copy.body, input.values),
        },
        source: 'model',
      };
    }

    lastDetail = validated.detail;
    logger.info('[flo/llm] wyjście odrzucone', {
      kind: input.kind,
      attempt,
      reason: validated.reason,
    });
  }

  return fallback('invalid_output');
}

function buildUserPrompt(
  input: GenerateCopyInput,
  allowed: string[],
  template: FloTemplate,
): string {
  // Kontekst słowny idzie przez minimalizację (krok 17). Podpowiedź bywa
  // budowana z danych dokumentu, a stamtąd do prompta jest jeden nieuważny
  // szablon — numer konta kontrahenta nie ma czego szukać u dostawcy modelu.
  const safeHints = redactForModel(input.hints ?? []);
  const hints = safeHints.length ? `\nKontekst: ${safeHints.join('; ')}` : '';
  return [
    `Rodzaj sprawy: ${input.kind}`,
    `Dostępne placeholdery: ${allowed.map((n) => `{{${n}}}`).join(', ')}`,
    hints,
    '',
    'Wzór, który masz ulepszyć (zachowaj sens i placeholdery):',
    `title: ${template.title}`,
    `body: ${template.body}`,
  ].join('\n');
}

/**
 * Podstawienie wartości. Placeholder bez wartości jest tu niemożliwy —
 * walidacja przepuszcza wyłącznie nazwy z białej listy — ale zostawiamy
 * jawne zachowanie zamiast polegać na tym, że wcześniejszy krok nie ma błędu.
 */
function renderTemplateSafely(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => values[name] ?? '');
}

// ═══════════════════════════════════════════════════════════════
// Domyślne wywołanie SDK
// ═══════════════════════════════════════════════════════════════

async function callAnthropic(req: {
  model: FloModel;
  system: string;
  user: string;
}): Promise<ModelCallResult> {
  const response = await getAnthropic().messages.create({
    model: req.model,
    max_tokens: 400,
    // Znacznik pamięci podręcznej na części stałej. Patrz uwaga przy
    // SYSTEM_PROMPT: dziś jeszcze za krótkie, żeby cokolwiek dało.
    system: [
      {
        type: 'text',
        text: req.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: req.user }],
  });

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');

  return {
    text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
