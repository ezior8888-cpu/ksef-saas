/**
 * Best-effort masking of recognizable identifiers in display text.
 * This is NOT an anonymity guarantee: names and arbitrary prose cannot be
 * reliably detected by regular expressions. FLO's outbound prompt uses a
 * closed vocabulary instead of sending redacted document descriptions.
 */

const MASK = {
  account: '[konto]',
  pesel: '[pesel]',
  nip: '[nip]',
  email: '[email]',
  phone: '[telefon]',
  address: '[adres]',
  postal: '[kod]',
  digits: '[liczba]',
} as const;

const PATTERNS: Array<{ name: keyof typeof MASK; re: RegExp }> = [
  // IBAN permits letters in the BBAN (e.g. GB, NL), not just digits.
  { name: 'account', re: /\b[A-Z]{2}\s?\d{2}(?:[ \u00a0-]?[A-Z0-9]){11,30}\b/gi },
  { name: 'account', re: /\b\d{2}(?:[ \u00a0-]?\d{4}){6}\b/g },
  { name: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { name: 'pesel', re: /\b\d{11}\b/g },
  // Ten digits, with optional separators and the Polish country prefix.
  // Before phone matching, so a formatted NIP cannot be partially masked.
  { name: 'nip', re: /\b(?:PL[ \u00a0-]?)?\d(?:[ \u00a0-]?\d){9}\b/gi },
  { name: 'phone', re: /(?:\+48[\s-]?)?\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g },
  {
    name: 'address',
    re: /\b(?:ul\.|al\.|os\.|pl\.|ulica|aleja|osiedle)\s*[^,.;]{2,60}/gi,
  },
  // A street/locality plus a building number, even without "ul.".
  // Conservative by design: it can also remove non-address phrases.
  {
    name: 'address',
    re: /(?<!\p{L})\p{Lu}[\p{L}\p{M}.-]*(?:[ \t]+[\p{L}\p{M}.-]+){0,4}[ \t]+\d{1,5}[a-zA-Z]?(?:\s*\/\s*\d{1,5}[a-zA-Z]?)?(?!\d)/gu,
  },
  { name: 'postal', re: /\b\d{2}-\d{3}\b/g },
  { name: 'digits', re: /\b\d{9,}\b/g },
];

export interface RedactOptions {
  /** Explicit exception for local use; model-bound prompts never enable it. */
  allowNip?: boolean;
}

export function redactText(text: string, opts: RedactOptions = {}): string {
  let out = text;
  for (const { name, re } of PATTERNS) {
    if (name === 'nip' && opts.allowNip) continue;
    if (name === 'digits' && opts.allowNip) {
      out = out.replace(re, (match) => match.length === 10 ? match : MASK.digits);
      continue;
    }
    out = out.replace(re, MASK[name]);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Masks recognized patterns in values; keys and unknown names remain intact. */
export function redactForModel<T>(value: T, opts: RedactOptions = {}): T {
  if (typeof value === 'string') return redactText(value, opts) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((item) => redactForModel(item, opts)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = redactForModel(item, opts);
    return out as unknown as T;
  }
  return value;
}

/** Detects known patterns only; false does not certify arbitrary prose as safe. */
export function containsSensitive(text: string): boolean {
  return PATTERNS.some(({ re }) => new RegExp(re.source, re.flags.replace('g', '')).test(text));
}
