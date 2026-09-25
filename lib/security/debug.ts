import { isProductionDeploy } from './environment';

/** Sensitive diagnostics are allowed only in an explicit local development/test runtime. */
export function isSensitiveDebugAllowed(): boolean {
  return !isProductionDeploy() &&
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');
}
