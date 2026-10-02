/**
 * Czy wolno automatycznie przejść w tryb Offline24 (AUD-14, decyzja B3
 * z 02.10.2026).
 *
 * Na KSeF produkcyjnym — nie. Kody QR kolejki offline nie są zgodne ze
 * specyfikacją MF (KOD II wymaga certyfikatu KSeF typu Offline — poprawka
 * w #122), a tryb włączał się już po jednym nieudanym pingu. Faktura z kodami,
 * których nikt nie zweryfikuje, jest gorsza niż faktura, która poczeka:
 * na produkcji zostaje w zwykłej kolejce z ponowieniami. Na KSeF TEST
 * Offline24 działa jak dotąd, żeby dało się sprawdzić poprawkę.
 */

import type { KsefEnvironment } from '@/types/ksef';

export function isOffline24Enabled(env: KsefEnvironment): boolean {
  return env !== 'production';
}
