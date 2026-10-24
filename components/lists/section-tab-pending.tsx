'use client';

import { useLinkStatus } from 'next/link';

/**
 * Znacznik w dotkniętej zakładce `SectionTabs`, dopóki jej strona nie
 * przyjdzie z serwera. Sam niczego nie rysuje — podkreślenie przenosi CSS
 * (`.ff-section-tabs` w `app/globals.css`), więc zakładka reaguje na dotyk
 * od razu, a nie dopiero po kilkuset milisekundach sieci telefonu.
 *
 * Gdy strona jest już w pamięci (prefetch), Next nie zgłasza stanu
 * oczekiwania i znacznik się nie pojawia — przełączenie i tak jest natychmiast.
 */
export function SectionTabPending() {
  const { pending } = useLinkStatus();
  return pending ? <span data-link-pending="" hidden /> : null;
}
