import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), client: vi.fn(), configured: vi.fn() }));
vi.mock('@/lib/cache/redis', () => ({ getRedis: redis.client, isRedisConfigured: redis.configured }));
import { checkPasswordBreach } from '@/lib/auth/breach-check';

const fixture = 'password'; // Public test vector only; never submitted to a real service.
const prefix = '5BAA6';
const suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
const other = 'A'.repeat(35);
const url = 'https://api.pwnedpasswords.com/range/' + prefix;
const unavailable = { breached: false, occurrences: 0, fallback: true };
const warning = '[breach-check] Password breach check unavailable';
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected external request'));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  redis.configured.mockReturnValue(true);
  redis.client.mockReturnValue(redis);
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HIBP privacy boundary', () => {
  it('does not query for an empty input', async () => {
    expect(await checkPasswordBreach('')).toEqual({ breached: false, occurrences: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the known five-character prefix and matches locally', async () => {
    fetchMock.mockResolvedValue(new Response(other + ':0\r\n' + suffix + ':42\r\n'));
    expect(await checkPasswordBreach(fixture)).toEqual({ breached: true, occurrences: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, options] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe(url);
    expect(options).toEqual({
      headers: { 'Add-Padding': 'true', 'User-Agent': 'ksef-saas-password-check' },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal),
    });
    expect(JSON.stringify(options)).not.toContain(suffix);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('ignores padding records with count zero', async () => {
    fetchMock.mockResolvedValue(new Response(suffix + ':0\n' + other + ':7'));
    expect(await checkPasswordBreach(fixture)).toEqual({ breached: false, occurrences: 0 });
  });

  it('returns no match only after validating a nonempty response', async () => {
    fetchMock.mockResolvedValue(new Response(other + ':123\n'));
    expect(await checkPasswordBreach(fixture)).toEqual({ breached: false, occurrences: 0 });
  });

  it('does not read or write password-derived cache entries, including repeated checks', async () => {
    redis.get.mockResolvedValue(0);
    fetchMock.mockResolvedValueOnce(new Response(suffix + ':7'));
    fetchMock.mockResolvedValueOnce(new Response(suffix + ':8'));
    expect(await checkPasswordBreach(fixture)).toEqual({ breached: true, occurrences: 7 });
    expect(await checkPasswordBreach(fixture)).toEqual({ breached: true, occurrences: 8 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const mock of Object.values(redis)) expect(mock).not.toHaveBeenCalled();
  });

  it('accepts a range larger than the current padding range', async () => {
    const rows = Array.from({ length: 1500 }, (_, index) => index.toString(16).toUpperCase().padStart(35, '0') + ':0');
    rows.push(suffix + ':19');
    fetchMock.mockResolvedValue(new Response(rows.join('\n')));
    expect(await checkPasswordBreach(fixture)).toEqual({ breached: true, occurrences: 19 });
  });

  it.each([
    '', ' ', '\n', other + ':-1', other + ':NaN', other + ':1.5',
    other + ':9007199254740992', other + ':01', other + ':1junk', other + ':',
    other.slice(1) + ':1', 'G'.repeat(35) + ':1', other + ':1\n\n',
    suffix + ':1\n' + suffix + ':2', suffix + ':1\nprivate malformed tail',
    '<html>service unavailable</html>',
  ])('marks a malformed response as unavailable (%#)', async (body) => {
    fetchMock.mockResolvedValue(new Response(body));
    expect(await checkPasswordBreach(fixture)).toEqual(unavailable);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(warning);
  });

  it.each([204, 206, 301, 429, 500])('rejects HTTP %i, including partial responses and redirects', async (status) => {
    fetchMock.mockResolvedValue(new Response(status === 204 ? null : suffix + ':1', { status }));
    expect(await checkPasswordBreach(fixture)).toEqual(unavailable);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(warning);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not disclose exception details', async () => {
    fetchMock.mockRejectedValue(new Error('private password ' + fixture + ' ' + suffix + ' ' + url));
    expect(await checkPasswordBreach(fixture)).toEqual(unavailable);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(warning);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('handles a rejected redirect through the same safe fallback', async () => {
    fetchMock.mockRejectedValue(new TypeError('redirect to https://private.example.test/'));
    expect(await checkPasswordBreach(fixture)).toEqual(unavailable);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error');
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(warning);
  });

  it('handles invalid UTF-8 without returning a clean result', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0xc3, 0x28])));
    expect(await checkPasswordBreach(fixture)).toEqual(unavailable);
  });

  it('cancels an oversized response while reading, without trusting Content-Length', async () => {
    const cancel = vi.fn();
    let index = 0;
    const chunks = [new Uint8Array(128 * 1024), new Uint8Array(128 * 1024 + 1)];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]);
      },
      cancel,
    });
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'Content-Length': '1' } }));
    expect(await checkPasswordBreach(fixture)).toEqual(unavailable);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(warning);
  });

  it('handles records split across stream chunks', async () => {
    const text = suffix + ':123\r\n' + other + ':0';
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of [bytes.slice(0, 7), bytes.slice(7, 38), bytes.slice(38)]) controller.enqueue(part);
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(new Response(body));
    expect(await checkPasswordBreach(fixture)).toEqual({ breached: true, occurrences: 123 });
    expect(body.locked).toBe(false);
  });

  it('aborts a connection that never returns headers', async () => {
    fetchMock.mockImplementation((_request, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const result = checkPasswordBreach(fixture);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toEqual(unavailable);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('keeps the deadline active after headers, until the body is complete', async () => {
    let responseBody: ReadableStream<Uint8Array> | undefined;
    fetchMock.mockImplementation(async (_request, options) => {
      responseBody = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(suffix + ':1\n'));
          options?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
        },
      });
      return new Response(responseBody);
    });
    const result = checkPasswordBreach(fixture);
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(unavailable);
    expect(responseBody?.locked).toBe(false);
  });

  it('never trusts an early match before a later stream error', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(suffix + ':2\n')); },
      pull(controller) { controller.error(new Error('private response details')); },
    });
    fetchMock.mockResolvedValue(new Response(body));
    expect(await checkPasswordBreach(fixture)).toEqual(unavailable);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(warning);
    expect(body.locked).toBe(false);
  });
});
