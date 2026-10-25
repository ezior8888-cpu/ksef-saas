import type { ReactNode } from 'react';

import { KsiegowoscTabs } from '@/components/reports/ksiegowosc-tabs';
import { Card } from '@/components/ui/card';

import { RecentExports } from './export-history';
import type { ManualExportJobWithFiles } from './export-formats';
import { NewExportForm, type NewExportFormProps } from './new-export-form';

/**
 * Ekran Eksport — zakładka „Eksport” Księgowości (poprawka Bartosza
 * 21.10.2026: przeprojektowanie Księgowości). Układ jak Koszty: tytuł tylko
 * dla czytników, karta „Nowy plik”, a pod nią karta z zakładkami KPiR |
 * Eksport i historią, sięgająca stopki (`ff-page-fill`).
 *
 * Formularz i historia mieszkają w `new-export-form.tsx` i `export-history.tsx`;
 * ten plik je składa (bez `'use client'`) i eksportuje dalej dla testów
 * i lokalnego podglądu.
 */

export { NewExportForm, RecentExports };
export type { ManualExportJobWithFiles, NewExportFormProps };

export function ExportsHeading() {
  return <h1 className="sr-only">Eksport danych księgowych</h1>;
}

/** Powłoka strony: karta z zakładkami jest bezpośrednim dzieckiem korzenia `flex-col`. */
export function ExportsScreen({ form, history }: { form: ReactNode; history: ReactNode }) {
  return (
    <div className="ff-page-fill flex flex-col gap-6">
      <ExportsHeading />
      {form}
      <Card className="flex-1 pt-0">
        <KsiegowoscTabs active="eksport" />
        <div className="flex w-full flex-1 flex-col pt-2">{history}</div>
      </Card>
    </div>
  );
}

/** Ten sam układ co strona — testy sprawdzają prawdziwy ekran, nie osobną kompozycję. */
export function ExportsCenter({
  recentJobs,
  ...formProps
}: { recentJobs: ManualExportJobWithFiles[] } & NewExportFormProps) {
  return <ExportsScreen form={<NewExportForm {...formProps} />} history={<RecentExports jobs={recentJobs} />} />;
}
