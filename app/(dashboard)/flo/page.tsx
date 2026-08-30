import { listProposals, listScheduled } from '@/app/actions/flo';

import { FloScreen } from './_components/flo-screen';

/**
 * Ekran agenta FLO.
 *
 * Dane są PRAWDZIWE — `listProposals` i `listScheduled` czytają propozycje
 * tej organizacji. Atrapy z `lib/flo/fixtures.ts` zostają tam, gdzie ich
 * miejsce: w testach i w podglądach przy budowie kolejnych wariantów.
 *
 * Oba odczyty idą równolegle, bo nie zależą od siebie. Pobrane szeregowo
 * dokładałyby do ekranu czas drugiego zapytania bez żadnego powodu.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Flo',
};

export default async function FloPage() {
  const [proposals, scheduled] = await Promise.all([
    listProposals(),
    listScheduled(),
  ]);

  return <FloScreen proposals={proposals} scheduled={scheduled} />;
}
