'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  lookupNipAction,
  type OnboardingCompanyData,
} from '@/components/onboarding/actions';
import { completeCompanyNipAction } from '@/app/actions/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Uzupełnienie NIP-u organizacji-szkicu (BUG-007) — ten sam flow co w
 * onboardingu (GUS lookup → potwierdzenie), ale UPDATE istniejącego tenanta
 * zamiast tworzenia nowego. Renderowane na /settings/ksef, gdy nip = ''.
 */
export function CompleteNipForm() {
  const router = useRouter();
  const [nipInput, setNipInput] = useState('');
  const [company, setCompany] = useState<OnboardingCompanyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearching] = useTransition();
  const [isSaving, startSaving] = useTransition();

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
    startSaving(async () => {
      const result = await completeCompanyNipAction(company);
      if (result.success) {
        toast.success('NIP uzupełniony — możesz teraz wgrać certyfikat KSeF.');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label
          htmlFor="complete-nip"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          NIP firmy
        </Label>
        <div className="relative">
          <Input
            id="complete-nip"
            value={nipInput}
            onChange={(e) => setNipInput(e.target.value.replace(/\D/g, ''))}
            placeholder="Wpisz 10 cyfr NIP"
            maxLength={10}
            disabled={isSearching || !!company}
            className="h-14 pr-14 font-mono text-lg"
          />
          <Button
            onClick={handleLookup}
            variant="ghost"
            size="icon"
            disabled={nipInput.length !== 10 || isSearching || !!company}
            className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-xl"
          >
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pobierzemy dane firmy z bazy GUS REGON i przypiszemy je do Twojej
          organizacji.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {company && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <div className="mb-4 flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Znaleziono w bazie GUS</span>
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Nazwa firmy
                </dt>
                <dd className="mt-1 font-medium">{company.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Adres siedziby
                </dt>
                <dd className="mt-1 leading-relaxed">
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
            disabled={isSaving}
            className="w-full"
            size="lg"
            variant="glass-primary"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Zapisuję dane firmy...
              </>
            ) : (
              <>
                Przypisz NIP do organizacji
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setCompany(null);
              setNipInput('');
              setError(null);
            }}
            className="block w-full text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Wpisz inny NIP
          </button>
        </div>
      )}

      {!company && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--ff-glass-border)] bg-[var(--ff-surface-container-low)] p-4">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Twoja organizacja to na razie szkic bez NIP-u. Po przypisaniu NIP-u
            odblokujesz wgrywanie certyfikatu KSeF, wysyłkę faktur i Magiczny
            Import historii.
          </p>
        </div>
      )}
    </div>
  );
}
