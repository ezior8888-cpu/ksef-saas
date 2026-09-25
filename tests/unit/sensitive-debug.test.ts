import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSensitiveDebugAllowed } from '@/lib/security/debug';
import { logger } from '@/lib/observability/logger';

describe('sensitive diagnostics fail closed', () => {
  beforeEach(() => {
    for (const key of ['APP_ENV', 'NEXT_PUBLIC_APP_ENV', 'VERCEL_ENV', 'NODE_ENV']) vi.stubEnv(key, '');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it.each(['production', '', 'unknown'])('blocks debug/info in runtime %s without deploy markers', (runtime) => {
    vi.stubEnv('NODE_ENV', runtime);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(isSensitiveDebugAllowed()).toBe(false);
    logger.debug('private invoice');
    logger.info('client@example.test');
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('does not allow sensitive debug in a staging production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'staging');
    expect(isSensitiveDebugAllowed()).toBe(false);
  });

  it.each(['development', 'test'])('allows explicit local runtime %s', (runtime) => {
    vi.stubEnv('NODE_ENV', runtime);
    expect(isSensitiveDebugAllowed()).toBe(true);
    vi.stubEnv('APP_ENV', 'production');
    expect(isSensitiveDebugAllowed()).toBe(false);
  });
});
