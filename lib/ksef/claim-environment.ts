import type { KsefEnvironment } from '@/types/ksef';
import { getKsefBaseUrl } from './client';

const OFFICIAL_PRODUCTION_URL = 'https://api.ksef.mf.gov.pl/v2';

/**
 * Security boundary for claims and tenant credentials. There is deliberately no
 * implicit test fallback: an unset or mistyped environment must stop KSeF I/O.
 * Production ownership proof must come from the official KSeF API, not an
 * operator-supplied URL that could return a forged Owner token.
 */
export function configuredKsefEnvironment(): KsefEnvironment | null {
  const env = process.env.KSEF_ENV;
  if (env !== 'test' && env !== 'demo' && env !== 'production') return null;
  try {
    if (env === 'production' && getKsefBaseUrl(env) !== OFFICIAL_PRODUCTION_URL) return null;
    if (env !== 'production') getKsefBaseUrl(env);
  } catch {
    return null;
  }
  return env;
}

/** Interpret a stored marker only in the actively configured, trusted environment. */
export function hasConfiguredKsefProof(
  verifiedAt: string | null | undefined,
  verifiedEnvironment: string | null | undefined,
): boolean {
  const env = configuredKsefEnvironment();
  return Boolean(env && verifiedAt && verifiedEnvironment === env);
}

export function requireConfiguredKsefEnvironment(): KsefEnvironment {
  const env = configuredKsefEnvironment();
  if (!env) throw new Error('KSeF environment is not safely configured');
  return env;
}

export function requireMatchingKsefEnvironment(requested?: KsefEnvironment): KsefEnvironment {
  const configured = requireConfiguredKsefEnvironment();
  if (requested !== undefined && requested !== configured) {
    throw new Error('KSeF environment does not match configured environment');
  }
  return configured;
}
