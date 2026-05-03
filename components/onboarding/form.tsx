'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  lookupNipAction,
  completeOnboardingAction,
  type OnboardingCompanyData,
} from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Search } from 'lucide-react';

export function OnboardingForm() {
  const [nipInput, setNipInput] = useState('');
  const [company, setCompany] = useState<OnboardingCompanyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearching] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();
  const router = useRouter();

  const handleLookup = () => {
    setError(null);
    setCompany(null);
    startSearching(async () => {
      const result = await lookupNipAction(nipInput);
      if (result.success) {
        setCompany(result.data);
      } else {
        setError(result.error);
      }
    });
  };

  const handleConfirm = () => {
    if (!company) return;
    startSubmitting(async () => {
      const result = await completeOnboardingAction(company);
      if (result.success) {
        router.push('/onboarding/import-source');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nip" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          NIP firmy
        </Label>
        <div className="relative">
          <Input
            id="nip"
            value={nipInput}
            onChange={(e) => setNipInput(e.target.value.replace(/\D/g, ''))}
            placeholder="Wpisz 10 cyfr NIP"
            maxLength={10}
            disabled={isSearching || !!company}
            className="pr-14 font-mono text-lg h-14"
          />
          <Button
            onClick={handleLookup}
            variant="ghost"
            size="icon"
            disabled={nipInput.length !== 10 || isSearching || !!company}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl"
          >
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pobierzemy dane firmy z bazy GUS REGON
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-[12px] p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{error}</p>
        </div>
      )}

      {company && (
        <div className="space-y-5 pt-2">
          <div className="rounded-2xl border border-green-500/20 bg-green-500/5 backdrop-blur-[24px] p-5">
            <div className="flex items-center gap-2.5 text-green-700 dark:text-green-400 mb-4">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium text-sm">Znaleziono w bazie GUS</span>
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Nazwa firmy
                </dt>
                <dd className="font-medium mt-1">{company.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Adres siedziby
                </dt>
                <dd className="text-foreground mt-1 leading-relaxed">
                  {company.street} {company.buildingNumber}
                  {company.localNumber ? `/${company.localNumber}` : ''}
                  <br />
                  {company.postalCode} {company.city}
                </dd>
              </div>
            </dl>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full"
            size="lg"
            variant="glass-primary"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tworzę konto firmowe...
              </>
            ) : (
              <>
                Potwierdź i kontynuuj
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => { setCompany(null); setNipInput(''); setError(null); }}
            className="block w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Wpisz inny NIP
          </button>
        </div>
      )}
    </div>
  );
}
