'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Mail, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { EmailCategory } from '@/lib/email/preferences';

import { toggleEmailCategoryAction } from '../email-actions';

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
      'Nowe funkcje, blog FaktFlow, kampanie re-engagement (gdy długo nieaktywny).',
    examples:
      'Np. „Co nowego w FaktFlow w kwietniu", „Wracaj — Twoje konto czeka"',
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
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          Powiadomienia email
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wybierz które emaile chcesz otrzymywać. Możesz też wypisać się jednym
          kliknięciem z linku w mailu (każdy zawiera taki link).
        </p>
      </header>

      <ul className="space-y-2">
        {CATEGORIES.map((cat) => {
          const subscribed = !optimisticUnsubscribed.has(cat.id);
          const isLoading = pendingCategory === cat.id;
          return (
            <li
              key={cat.id}
              className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,var(--ff-on-surface)_4%,transparent)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{cat.title}</h3>
                    {cat.isLocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" />
                        Wymagane
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {cat.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground italic">
                    {cat.examples}
                  </p>
                  {cat.isLocked ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {cat.lockReason}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => handleToggle(cat.id, !subscribed)}
                  disabled={cat.isLocked || isLoading}
                  aria-pressed={subscribed}
                  className={cn(
                    'group inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                    subscribed
                      ? 'bg-emerald-500/80 dark:bg-emerald-500/60'
                      : 'bg-foreground/15',
                    (cat.isLocked || isLoading) && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-sm transition-transform',
                      subscribed ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : subscribed ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
