import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { ACTION_FILE_LIMIT_BYTES, formatUploadSize } from '@/lib/upload-limit';

// Ten sam koder argumentów, którym przeglądarka wysyła Server Action
// (`encodeReply` z Reacta wkompilowanego w Next). Next nie publikuje do niego
// typów, więc podpis jednej funkcji opisujemy sami.
const { encodeReply } = createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node.js') as {
  encodeReply: (value: unknown, options: object) => Promise<FormData | string>;
};

/**
 * Sesja 4 planu skalowania: przeglądarka zatrzymuje plik większy niż
 * `ACTION_FILE_LIMIT_BYTES`. Ten limit musi zostawić zapas na resztę ciała
 * żądania (granice multipart, nagłówki pola z nazwą pliku, pole z argumentami),
 * bo Next liczy do 1 MB całe ciało, nie sam plik.
 */

const NEXT_ACTION_BODY_LIMIT = 1024 * 1024;

async function bodyBytes(file: File): Promise<number> {
  const form = new FormData();
  form.append('photo', file);
  const body = await encodeReply([form], {});
  return (await new Response(body).arrayBuffer()).byteLength;
}

describe('limit pliku wysyłanego przez Server Action', () => {
  it('plik równy limitowi, z najdłuższą nazwą, mieści się w 1 MB ciała żądania', async () => {
    // 255 znaków dwubajtowych — dłuższej nazwy system plików nie przepuści.
    const name = `${'ż'.repeat(251)}.pdf`;
    const file = new File([new Uint8Array(ACTION_FILE_LIMIT_BYTES)], name, { type: 'application/pdf' });

    const total = await bodyBytes(file);
    expect(total).toBeGreaterThan(ACTION_FILE_LIMIT_BYTES);
    expect(total).toBeLessThanOrEqual(NEXT_ACTION_BODY_LIMIT);
  });

  it('limit jest bliski 1 MB — zapas nie zjada pojemności', () => {
    expect(ACTION_FILE_LIMIT_BYTES).toBeGreaterThan(0.98 * NEXT_ACTION_BODY_LIMIT);
    expect(ACTION_FILE_LIMIT_BYTES).toBeLessThan(NEXT_ACTION_BODY_LIMIT);
  });

  it('rozmiar po polsku, z przecinkiem', () => {
    expect(formatUploadSize(2 * 1024 * 1024)).toBe('2,0 MB');
    expect(formatUploadSize(1.5 * 1024 * 1024)).toBe('1,5 MB');
    expect(formatUploadSize(300 * 1024)).toBe('300 KB');
  });
});
