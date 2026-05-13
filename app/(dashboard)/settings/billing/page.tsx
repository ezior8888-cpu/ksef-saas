import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { isStripeConfigured } from '@/lib/stripe/client';
import {
  getActiveSubscription,
  isInTrial,
  trialDaysRemaining,
  type ActiveSubscription,
} from '@/lib/stripe/subscription';
import { getPageContext } from '@/lib/supabase/page-context';
import { cn } from '@/lib/utils';

import { PlanCards } from './_components/plan-cards';
import { PortalButton } from './_components/portal-button';

export const dynamic = 'force-dynamic';

interface SearchParams {
  checkout?: 'success' | 'canceled';
  error?: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fmtPlan(plan: ActiveSubscription['plan']): string {
  return plan === 'monthly' ? 'Miesięczny (59 zł/mc)' : 'Roczny (49 zł/mc, 588 zł rocznie)';
}

function statusLabel(status: ActiveSubscription['status']): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'default';
} {
  switch (status) {
    case 'trialing':
      return { label: 'Trial', tone: 'success' };
    case 'active':
      return { label: 'Aktywna', tone: 'success' };
    case 'past_due':
      return { label: 'Płatność opóźniona', tone: 'warning' };
    case 'unpaid':
      return { label: 'Nieopłacona', tone: 'danger' };
    case 'canceled':
      return { label: 'Anulowana', tone: 'danger' };
    case 'incomplete':
    case 'incomplete_expired':
      return { label: 'Niedokończona', tone: 'warning' };
    case 'paused':
      return { label: 'Wstrzymana', tone: 'warning' };
    default:
      return { label: status, tone: 'default' };
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-configured':
    'Stripe nie jest skonfigurowany. Skontaktuj się z administratorem.',
  forbidden:
    'Tylko właściciel lub admin organizacji może zarządzać subskrypcją.',
  unexpected: 'Coś poszło nie tak. Spróbuj ponownie za chwilę.',
  'tenant-not-found': 'Nie znaleziono organizacji.',
};

export default async function BillingPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const ctx = await getPageContext();

  const stripeConfigured = isStripeConfigured();
  const subscription = stripeConfigured
    ? await getActiveSubscription(ctx.tenantId).catch(() => null)
    : null;

  const canManage = ctx.role === 'owner' || ctx.role === 'admin';
  const errorMsg = params.error ? ERROR_MESSAGES[params.error] : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tighter-display">
          Subskrypcja i rozliczenia
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zarządzaj planem, kartą, fakturami. Płatności obsługuje Stripe (PSD2 +
          3D-Secure).
        </p>
      </header>

      {/* Status banery */}
      {params.checkout === 'success' ? (
        <Banner
          icon={CheckCircle2}
          tone="success"
          title="Subskrypcja aktywna"
          description="Dziękujemy! Trial 30 dni właśnie się rozpoczął. Karta zostanie obciążona dopiero po jego zakończeniu."
        />
      ) : null}
      {params.checkout === 'canceled' ? (
        <Banner
          icon={AlertTriangle}
          tone="warning"
          title="Subskrypcja niedokończona"
          description="Anulowałeś Checkout. Możesz spróbować ponownie — żadne pieniądze nie zostały pobrane."
        />
      ) : null}
      {errorMsg ? (
        <Banner
          icon={AlertTriangle}
          tone="danger"
          title="Błąd"
          description={errorMsg}
        />
      ) : null}

      {!stripeConfigured ? (
        <Banner
          icon={ShieldAlert}
          tone="warning"
          title="Stripe nie skonfigurowany"
          description={
            'Aby włączyć subskrypcje, ustaw STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY i STRIPE_PRICE_ANNUAL w env vars. Po wdrożeniu odśwież stronę.'
          }
        />
      ) : null}

      {!canManage ? (
        <Banner
          icon={ShieldAlert}
          tone="default"
          title="Brak uprawnień do edycji"
          description="Subskrypcją zarządza właściciel lub admin organizacji. Możesz zobaczyć stan, ale nie zmienić planu."
        />
      ) : null}

      {/* Active subscription view */}
      {subscription ? (
        <ActiveSubscriptionCard
          subscription={subscription}
          canManage={canManage}
        />
      ) : stripeConfigured ? (
        // Brak subskrypcji + Stripe OK = pokaż plan selection
        <section className="space-y-4">
          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-4 backdrop-blur-glass">
            <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
              30 dni za darmo
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Wybierz plan. Karta wymagana, ale obciążymy ją dopiero po 30
              dniach trialu. Anulujesz kiedy chcesz.
            </p>
          </div>

          {canManage ? <PlanCards /> : null}
        </section>
      ) : null}
    </div>
  );
}

function ActiveSubscriptionCard({
  subscription,
  canManage,
}: {
  subscription: ActiveSubscription;
  canManage: boolean;
}) {
  const status = statusLabel(subscription.status);
  const inTrial = isInTrial(subscription);
  const trialLeft = trialDaysRemaining(subscription);

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-glass-border bg-foreground/3 p-6 backdrop-blur-glass">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Bieżący plan</h2>
              <Badge
                variant={
                  status.tone === 'success'
                    ? 'secondary'
                    : status.tone === 'danger'
                      ? 'destructive'
                      : 'outline'
                }
                className={cn(
                  'text-xs',
                  status.tone === 'warning' &&
                    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                )}
              >
                {status.label}
              </Badge>
              {subscription.cancel_at_period_end ? (
                <Badge variant="outline" className="text-xs">
                  Anulowana, wygasa {fmtDate(subscription.current_period_end)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmtPlan(subscription.plan)}
            </p>
          </div>
          {canManage ? <PortalButton /> : null}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {inTrial && trialLeft !== null ? (
            <Stat
              icon={Sparkles}
              label="Trial kończy się za"
              value={`${trialLeft} dni`}
              sublabel={fmtDate(subscription.trial_end)}
              tone={trialLeft <= 3 ? 'warning' : 'default'}
            />
          ) : (
            <Stat
              icon={CalendarDays}
              label="Następne odnowienie"
              value={fmtDate(subscription.current_period_end)}
              sublabel={
                subscription.cancel_at_period_end
                  ? 'Subskrypcja wygaśnie po tej dacie'
                  : `Karta zostanie obciążona automatycznie`
              }
            />
          )}
          <Stat
            icon={CreditCard}
            label="Plan"
            value={subscription.plan === 'monthly' ? 'Miesięczny' : 'Roczny'}
            sublabel={
              subscription.plan === 'monthly'
                ? '59 zł / mc + VAT'
                : '588 zł / rok + VAT'
            }
          />
          <Stat
            icon={CalendarDays}
            label="Okres bieżący"
            value={fmtDate(subscription.current_period_start)}
            sublabel={`do ${fmtDate(subscription.current_period_end)}`}
          />
        </div>

        {subscription.status === 'past_due' || subscription.status === 'unpaid' ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              Płatność nie została pobrana
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Stripe ponowi próbę automatycznie. Możesz też zaktualizować kartę
              w panelu klienta.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Banner({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'success' | 'warning' | 'danger' | 'default';
  title: string;
  description: string;
}) {
  const palette = {
    success:
      'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
    warning:
      'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
    danger: 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300',
    default: 'border-glass-border bg-foreground/3 text-foreground',
  }[tone];

  return (
    <div className={cn('rounded-2xl border p-4 backdrop-blur-glass', palette)}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="mt-0.5 text-sm opacity-90">{description}</p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-glass-border bg-foreground/3 p-3 backdrop-blur-glass',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/5',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 font-medium text-sm">{value}</p>
      {sublabel ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>
      ) : null}
    </div>
  );
}
