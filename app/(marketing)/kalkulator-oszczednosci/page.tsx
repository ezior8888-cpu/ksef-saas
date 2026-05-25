import type { Metadata } from 'next';

import { SavingsCalculatorPreview } from '@/components/marketing/savings-calculator-preview';

// Faza 22: kalkulator pełni interaktywny (state w komponencie), ale shell strony
// statyczny — cache na godzinę żeby SEO crawler dostawał konsystentny page.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Kalkulator oszczędności KSeF SaaS — sprawdź ile zaoszczędzisz',
  description:
    'Oblicz ile godzin i pieniędzy zaoszczędzisz z automatyczną kategoryzacją KPiR i OCR faktur. Bezpłatny kalkulator dla mikrofirm i freelancerów.',
};

export default function CalculatorPage() {
  return (
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Kalkulator oszczędności
          </p>
          <h1 className="mx-auto max-w-3xl font-editorial text-5xl leading-[1.1] font-semibold md:text-6xl">
            Sprawdź ile zaoszczędzisz w ciągu roku
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-zinc-500">
            Przesuń suwaki aby dopasować do swojej działalności
          </p>
        </div>

        <SavingsCalculatorPreview />

        <div className="mt-16 grid gap-6 text-center md:grid-cols-3">
          <div className="p-6">
            <p className="mb-2 font-editorial text-4xl font-bold">8 → 1.5</p>
            <p className="text-sm text-zinc-500">
              Minut na fakturę:
              <br />
              ręcznie vs z OCR
            </p>
          </div>
          <div className="p-6">
            <p className="mb-2 font-editorial text-4xl font-bold">80%</p>
            <p className="text-sm text-zinc-500">
              Mniej czasu
              <br />
              na księgowość
            </p>
          </div>
          <div className="p-6">
            <p className="mb-2 font-editorial text-4xl font-bold">11 dni</p>
            <p className="text-sm text-zinc-500">
              Średni DSO
              <br />
              z Wkurzaczem
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
