'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { EmailCategory } from '@/lib/email/preferences';

import { toggleEmailCategoryAction } from '../email-actions';

/**
 * Kategorie e-maili. Wygląd: wiersze z przełącznikiem z Finory
 * (`notifications/quiet-hours-card.tsx` — etykieta i opis po lewej, `Switch`
 * po prawej). Tabeli „kategoria × kanał” z Finory nie bierzemy: e-mail ma
 * kategorie, a push osobne ustawienia na każdym urządzeniu.
 */

interface Props {
  unsubscribedCategories: EmailCategory[];
}

interface CategoryConfig {
  id: EmailCategory;
  title: string;
  description: string;
  examples: string;
  isLocked?: boolean;
  lockReason?: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: 'transactional',
    title: 'Powiadomienia transakcyjne',
    description:
      'Faktury KSeF, UPO, status wysyłki, password reset, billing. Wymagane prawnie i operacyjnie.',
    examples:
      'Np. „Faktura wysłana do KSeF ✓", „Nie udało się pobrać płatności", „Twój trial kończy się za 3 dni"',
    isLocked: true,
    lockReason:
      'Te emaile są krytyczne dla działania konta. Wyłączenie wymagałoby dezaktywacji konta.',
  },
  {
    id: 'product_updates',
    title: 'Powiadomienia produktowe',
    description:
      'Welcome po onboardingu, magic import zakończony, miesięczne paczki Co-Pilot dla księgowej.',
    examples:
      'Np. „Twoja historia z KSeF jest gotowa", „Paczka dla księgowej za marzec została wysłana"',
  },
  {
    id: 'marketing',
    title: 'Powiadomienia marketingowe',
    description:
      'Nowe funkcje, blog FaktWay, kampanie re-engagement (gdy długo nieaktywny).',
    examples:
      'Np. „Co nowego w FaktWay w kwietniu", „Wracaj — Twoje konto czeka"',
  },
];

export function EmailPreferences({ unsubscribedCategories }: Props) {
  const router = useRouter();
  const [optimisticUnsubscribed, setOptimisticUnsubscribed] = useState(
    () => new Set<EmailCategory>(unsubscribedCategories),
  );
  const [pendingCategory, setPendingCategory] = useState<EmailCategory | null>(null);
  const [, startTransition] = useTransition();

  const handleToggle = (category: EmailCategory, nextSubscribed: boolean) => {
    // Optimistic update.
    setOptimisticUnsubscribed((prev) => {
      const next = new Set(prev);
      if (nextSubscribed) next.delete(category);
      else next.add(category);
      return next;
    });
    setPendingCategory(category);

    startTransition(async () => {
      const result = await toggleEmailCategoryAction(category, nextSubscribed);
      setPendingCategory(null);
      if (!result.success) {
        // Rollback.
        setOptimisticUnsubscribed((prev) => {
          const next = new Set(prev);
          if (nextSubscribed) next.add(category);
          else next.delete(category);
          return next;
        });
        toast.error(result.error);
      } else {
        toast.success(
          nextSubscribed
            ? 'Subskrypcja włączona'
            : 'Wypisano z tej kategorii',
        );
        router.refresh();
      }
    });
  };

  return (
    <FieldGroup>
      <div>
        <FieldLabel>Powiadomienia email</FieldLabel>
        <FieldDescription>
          Wybierz które emaile chcesz otrzymywać. Możesz też wypisać się jednym
          kliknięciem z linku w mailu (każdy zawiera taki link).
        </FieldDescription>
      </div>

      {CATEGORIES.map((cat) => {
        const subscribed = !optimisticUnsubscribed.has(cat.id);
        const isLoading = pendingCategory === cat.id;
        const id = `email-category-${cat.id}`;
        return (
          <Field key={cat.id} orientation="horizontal" className="items-center!">
            <FieldContent>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor={id}>{cat.title}</FieldLabel>
                {cat.isLocked ? <Badge variant="secondary">Wymagane</Badge> : null}
              </div>
              <FieldDescription>{cat.description}</FieldDescription>
              <FieldDescription className="italic">{cat.examples}</FieldDescription>
              {cat.isLocked ? <FieldDescription>{cat.lockReason}</FieldDescription> : null}
            </FieldContent>
            <Switch
              id={id}
              checked={subscribed}
              disabled={cat.isLocked || isLoading}
              onCheckedChange={(checked) => handleToggle(cat.id, checked)}
            />
          </Field>
        );
      })}
    </FieldGroup>
  );
}
