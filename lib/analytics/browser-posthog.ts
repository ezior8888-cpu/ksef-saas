import posthog from 'posthog-js';

/** @deprecated Użyj `initPosthogBrowser` z `init-posthog-browser.ts`. */
export { POSTHOG_INIT_DEFAULTS, initPosthogBrowser } from './init-posthog-browser';

export function getBrowserPosthog(): typeof posthog | undefined {
  if (typeof window === 'undefined') return undefined;
  return posthog.__loaded ? posthog : undefined;
}

export function isBrowserPosthogReady(): boolean {
  return Boolean(posthog.__loaded);
}
