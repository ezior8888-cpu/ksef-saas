import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from '@/components/onboarding/form';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (userData?.tenant_id) redirect('/invoices');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-bold mb-2">Witaj w KSeF SaaS</h1>
        <p className="text-gray-600 mb-6">
          Zanim wystawisz pierwszą fakturę, podaj NIP swojej firmy — uzupełnimy
          resztę z bazy GUS.
        </p>
        <OnboardingForm />
      </div>
    </div>
  );
}
