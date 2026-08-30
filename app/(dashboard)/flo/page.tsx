import { FLO_FIXTURES, FLO_SCHEDULED_FIXTURES } from '@/lib/flo/fixtures';

import { FloScreen } from './_components/flo-screen';

/**
 * Ekran agenta FLO (krok 2 toru B — szkielet).
 *
 * DANE SĄ ATRAPAMI. To jest celowe i tymczasowe: tor interfejsu nie czeka
 * na silnik, tylko buduje wszystko na `lib/flo/fixtures.ts`. Podmiana na
 * prawdziwe dane to dwie linijki poniżej — `listOpen()` z
 * `lib/flo/proposals.ts` zwraca dokładnie ten sam kształt (`FloProposalView`).
 *
 * Dopóki tak jest, ekran nie trafia do menu bocznego. Wchodzi się na niego
 * z ręki, adresem `/flo`.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Flo',
};

export default function FloPage() {
  return (
    <FloScreen
      proposals={FLO_FIXTURES}
      scheduled={FLO_SCHEDULED_FIXTURES}
      usingFixtures
    />
  );
}
