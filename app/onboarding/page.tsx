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

  if (userData?.tenant_id) redirect('/');

  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/62 dark:bg-[rgba(15,10,30,0.62)] backdrop-blur-[40px] shadow-[0_16px_48px_0_rgba(31,38,135,0.12)] p-8 lg:p-12">
          <h1 className="text-3xl font-semibold tracking-tight mb-3">
            Witaj w KSeF SaaS
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Zanim wystawisz pierwszą fakturę, podaj NIP swojej firmy — uzupełnimy resztę z bazy GUS.
          </p>
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
