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
import { Loader2, Search, CheckCircle2 } from 'lucide-react';

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
        router.push('/settings/ksef?onboarding=1');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nip">NIP firmy</Label>
        <div className="flex gap-2">
          <Input
            id="nip"
            value={nipInput}
            onChange={(e) => setNipInput(e.target.value.replace(/\D/g, ''))}
            placeholder="1234567890"
            maxLength={10}
            disabled={isSearching || !!company}
          />
          <Button
            onClick={handleLookup}
            disabled={nipInput.length !== 10 || isSearching || !!company}
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-500">10 cyfr, bez myślników</p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {company && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Znaleziono w GUS</span>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Nazwa</dt>
              <dd className="font-medium">{company.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Adres</dt>
              <dd>
                {company.street} {company.buildingNumber}
                {company.localNumber ? `/${company.localNumber}` : ''}
                <br />
                {company.postalCode} {company.city}
              </dd>
            </div>
          </dl>

          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Tworzę konto firmowe...
              </>
            ) : (
              'Potwierdź i kontynuuj'
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setCompany(null);
              setNipInput('');
              setError(null);
            }}
            className="text-sm text-gray-600 hover:underline"
          >
            Wpisz inny NIP
          </button>
        </div>
      )}
    </div>
  );
}
