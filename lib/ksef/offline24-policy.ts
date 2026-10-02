/**
 * Czy wolno automatycznie przejść w tryb Offline24 (AUD-14, decyzja B3
 * z 02.10.2026).
 *
 * Na KSeF produkcyjnym — nie. Kody QR kolejki offline nie są zgodne ze
 * specyfikacją MF (KOD II wymaga certyfikatu KSeF typu Offline — poprawka
 * w #122), a tryb włączał się już po jednym nieudanym pingu. Faktura z kodami,
 * których nikt nie zweryfikuje, jest gorsza niż faktura, która poczeka:
 * na produkcji zostaje w zwykłej kolejce z ponowieniami. Na KSeF TEST
 * Offline24 działał do 02.10.2026 — patrz decyzja w funkcji niżej.
 */

import type { KsefEnvironment } from '@/types/ksef';

export function isOffline24Enabled(_env: KsefEnvironment): boolean {
  // DECYZJA Bartosza z 02.10.2026 (przeniesienie #71 Codexa): automatyczny
  // Offline24 wstrzymany WSZĘDZIE, także na KSeF TEST — do zgodnych kodów QR
  // (#122) i trwałej tożsamości każdej próby wysyłki. Przy awarii KSeF job
  // ponawia zwykłą wysyłkę; stare wpisy kolejki idą do ręcznego uzgodnienia.
  return false;
}
