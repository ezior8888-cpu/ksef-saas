import { describe, expect, it } from 'vitest';

import { containsSensitive, redactText } from '@/lib/flo/redact';
import { FLO_HINTS, generateCopy, type FloHint } from '@/lib/flo/llm';
import { createFakeDb } from './flo-fake-db';

const NOW = new Date('2026-08-26T12:00:00Z');
const values = { kontrahent: 'Jan Kowalski', kwota: '12,34 zł', dni: 'trzy dni', numer: 'TEST/2026' };
const identifiers = [
  '1234567890', '123-456-78-90', '123 456 78 90', '123-45-67-890', 'PL1234567890',
  'GB29NWBK60161331926819', 'GB29 NWBK 6016 1331 9268 19', 'gb29nwbk60161331926819',
  'NL91ABNA0417164300', 'Marszałkowska 12/34, 00-950', 'Łąkowa 7a',
];

describe('FLO recognizable identifier masking', () => {
  it.each(identifiers)('detects and masks %s', (identifier) => {
    expect(containsSensitive(identifier)).toBe(true);
    expect(redactText(identifier)).not.toContain(identifier);
    expect(containsSensitive(redactText(identifier))).toBe(false);
  });
  it('does not claim regular expressions can recognize every name', () => {
    expect(redactText('faktura dla Jana Kowalskiego')).toContain('Jana Kowalskiego');
  });
});

describe('FLO outbound prompt allowlist', () => {
  it('does not transmit free-text hints, field values, or unreviewed placeholder names', async () => {
    const prompts: string[] = [];
    const db = createFakeDb();
    const hints = [
      ...identifiers, 'faktura dla Jana Kowalskiego', 'prywatna notatka medyczna',
      'marszałkowska siedem', 'constructor', '__proto__', 'repeated_delay',
    ] as FloHint[]; // Simulates untyped input; runtime enforcement must also hold.
    const result = await generateCopy({
      kind: 'payment.chase', tenantId: 'tenant-test', hints,
      values: { ...values, 'private@example.invalid': 'never-transmitted' },
    }, NOW, db.client, async (request) => {
      prompts.push(request.user);
      return {
        text: JSON.stringify({ title: '{{kontrahent}}', body: 'Faktura {{numer}} czeka.' }),
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });
    expect(result.source).toBe('model');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(FLO_HINTS.repeated_delay);
    for (const sensitive of [...identifiers, ...Object.values(values), 'Jana Kowalskiego', 'private@example.invalid', 'notatka medyczna', 'marszałkowska siedem']) {
      expect(prompts[0]).not.toContain(sensitive);
    }
    expect(result.copy.title).toBe('Jan Kowalski');
  });

  it('never copies unknown placeholder text from the model into the retry prompt', async () => {
    const prompts: string[] = [];
    await generateCopy({ kind: 'payment.chase', tenantId: 'tenant-test', values }, NOW, createFakeDb().client, async (request) => {
      prompts.push(request.user);
      return {
        text: JSON.stringify({ title: '{{private_personal_data}}', body: 'Faktura czeka.' }),
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('POPRAW');
    expect(prompts[1]).not.toContain('private_personal_data');
  });
});
