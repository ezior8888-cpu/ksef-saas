import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { recordUsage } from '@/lib/flo/budget';

import { createFakeDb } from './flo-fake-db';

/**
 * AUD-116: `recordUsage` czytało wiersz dnia i zapisywało sumę. Dwa
 * równoległe wywołania (dwa OCR naraz) czytały to samo i jedno zużycie
 * znikało — budżet AI firmy liczył za mało. Teraz jedno atomowe
 * `INSERT … ON CONFLICT DO UPDATE` w bazie (RPC `flo_record_usage`, 00105).
 */

const NOW = new Date('2026-10-02T12:00:00.000Z');

describe('zużycie AI — zapis atomowy', () => {
  it('10 równoległych zapisów = 10 wywołań i pełna suma tokenów', async () => {
    const db = createFakeDb();

    await Promise.all(
      Array.from({ length: 10 }, () =>
        recordUsage('ten-1', 'claude-haiku-4-5', { inputTokens: 100, outputTokens: 10 }, NOW, db.client),
      ),
    );

    expect(db.tables.flo_usage).toHaveLength(1);
    expect(db.tables.flo_usage[0]).toMatchObject({ calls: 10, input_tokens: 1000, output_tokens: 100 });
  });

  it('migracja: dodawanie po stronie bazy, tylko dla service_role', () => {
    const sql = readFileSync('supabase/migrations/00105_flo_usage_increment.sql', 'utf8');
    expect(sql).toContain('ON CONFLICT (tenant_id, day) DO UPDATE');
    expect(sql).toContain('input_tokens = public.flo_usage.input_tokens + EXCLUDED.input_tokens');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.flo_record_usage(uuid, date, bigint, bigint, numeric) FROM PUBLIC, anon, authenticated;');
  });
});
