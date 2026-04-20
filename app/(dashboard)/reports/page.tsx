import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const supabase = await createClient();

  const [
    { count: outgoingCount, error: errCount },
    { data: grossRows, error: errGross },
    { count: contractorsCount, error: errContr },
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outgoing'),
    supabase
      .from('invoices')
      .select('gross_total, currency')
      .eq('direction', 'outgoing')
      .limit(10_000),
    supabase
      .from('contractors')
      .select('*', { count: 'exact', head: true }),
  ]);

  const error = errCount || errGross || errContr;

  const grossPln =
    grossRows?.reduce((sum, row) => {
      const cur = (row.currency ?? 'PLN').trim() || 'PLN';
      if (cur !== 'PLN') return sum;
      return sum + Number(row.gross_total ?? 0);
    }, 0) ?? 0;

  const grossOther =
    grossRows?.filter((r) => (r.currency ?? 'PLN').trim() && (r.currency ?? 'PLN').trim() !== 'PLN')
      .length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Raporty</h1>
      <p className="text-sm text-gray-500 mb-6">
        Podsumowanie z bazy (faktury wystawione i kontrahenci). Szczegółowe eksporty
        CSV/PDF planowane w kolejnych iteracjach.
      </p>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Nie udało się wczytać danych: {error.message}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Faktury wystawione
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {outgoingCount ?? 0}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Suma brutto (PLN)
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {grossPln.toLocaleString('pl-PL', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              {grossOther > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  Część faktur ma inną walutę — suma tylko dla PLN.
                </p>
              )}
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Kontrahenci
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {contractorsCount ?? 0}
              </p>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Wskaźnik</th>
                  <th className="px-4 py-3 font-medium text-right">Wartość</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">Liczba faktur wystawionych (outgoing)</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {outgoingCount ?? 0}
                  </td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">Łączna kwota brutto w PLN</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {grossPln.toLocaleString('pl-PL', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    PLN
                  </td>
                </tr>
                <tr className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">Liczba kontrahentów w cache</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {contractorsCount ?? 0}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
