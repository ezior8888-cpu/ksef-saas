/**
 * Vercel Edge Config — global feature flags + instant kill-switch.
 *
 * Edge Config to lekka, edge-cache'owana baza KV od Vercela. Replikacja po
 * wszystkich regionach < 1s, read latency < 15ms (vs Supabase request
 * z EU latency ~80-150ms). Idealne na:
 *   - Kill-switch całej apki (`maintenanceMode = true`)
 *   - Blokada konkretnych integracji (`killAllKsefSubmissions = true`)
 *   - Globalne overrides feature flags na incident response
 *
 * Setup:
 *   1. Vercel dashboard → Project → Edge Config → Connect
 *   2. EDGE_CONFIG env var dostaje URL `https://edge-config.vercel.com/...`
 *   3. Zapis flag przez Vercel UI lub `@vercel/edge-config` REST API
 *
 * Fail-soft: gdy EDGE_CONFIG nie ustawione lub Edge Config padnie, wszystkie
 * globalne flagi traktujemy jako FALSE (default-off). Aplikacja działa
 * normalnie — utracony tylko kill-switch.
 */

import { get } from '@vercel/edge-config';
import * as Sentry from '@sentry/nextjs';

import type { GlobalFlag } from './index';

function isEdgeConfigConfigured(): boolean {
  const url = process.env.EDGE_CONFIG?.trim();
  return Boolean(url && url.startsWith('https://'));
}

export async function getGlobalFlag(flag: GlobalFlag): Promise<boolean> {
  if (!isEdgeConfigConfigured()) return false;

  try {
    const value = await get<boolean>(flag);
    return value === true;
  } catch (err) {
    // Edge Config padło - nie blokujemy aplikacji, ale chcemy wiedzieć.
    Sentry.addBreadcrumb({
      category: 'feature-flags.edge-config',
      level: 'warning',
      message: 'Edge Config read failed',
      data: { flag, error: (err as Error).message },
    });
    return false;
  }
}

/**
 * Pobiera wszystkie znane globalne flagi naraz — przydatne dla server-side
 * gating w jednym requesście (np. middleware blokujące cały dashboard
 * gdy `maintenanceMode=true`).
 */
export async function getAllGlobalFlags(): Promise<Record<GlobalFlag, boolean>> {
  const flags: GlobalFlag[] = [
    'killAllKsefSubmissions',
    'maintenanceMode',
    'disableSignups',
  ];

  const entries = await Promise.all(
    flags.map(async (f) => [f, await getGlobalFlag(f)] as const),
  );

  return Object.fromEntries(entries) as Record<GlobalFlag, boolean>;
}
