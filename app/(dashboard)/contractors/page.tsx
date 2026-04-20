import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ContractorRow = {
  id: string;
  nip: string;
  name: string;
  address: {
    countryCode?: string;
    addressLine1?: string;
    addressLine2?: string;
  } | null;
  email: string | null;
  phone: string | null;
  last_used_at: string | null;
  created_at: string;
};

function formatAddress(addr: ContractorRow['address']): string {
  if (!addr) return '—';
  const line1 = addr.addressLine1?.trim();
  const line2 = addr.addressLine2?.trim();
  if (!line1 && !line2) return '—';
  return [line1, line2].filter(Boolean).join(', ');
}

export default async function ContractorsPage() {
  const supabase = await createClient();

  const { data: contractors, error } = await supabase
    .from('contractors')
    .select('id, nip, name, address, email, phone, last_used_at, created_at')
    .order('last_used_at', { ascending: false, nullsFirst: true })
    .order('name', { ascending: true })
    .limit(500);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Kontrahenci</h1>
      <p className="text-sm text-gray-500 mb-6">
        Lista zapisana przy wystawianiu faktur — używana do podpowiedzi NIP i
        danych adresowych.
      </p>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Nie udało się pobrać kontrahentów: {error.message}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">NIP</th>
                <th className="px-4 py-3 font-medium">Nazwa</th>
                <th className="px-4 py-3 font-medium">Adres</th>
                <th className="px-4 py-3 font-medium">Kontakt</th>
                <th className="px-4 py-3 font-medium">Ostatnio użyty</th>
              </tr>
            </thead>
            <tbody>
              {(contractors as ContractorRow[] | null)?.length ? (
                (contractors as ContractorRow[]).map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{c.nip}</td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      {formatAddress(c.address)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="text-xs">{c.email ?? '—'}</div>
                      <div className="text-xs">{c.phone ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {c.last_used_at
                        ? new Date(c.last_used_at).toLocaleDateString('pl-PL')
                        : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Brak zapisanych kontrahentów — dodadzą się przy pierwszej fakturze z
                    podanym NIP nabywcy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
