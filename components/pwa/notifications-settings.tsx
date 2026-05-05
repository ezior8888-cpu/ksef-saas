'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BellOff,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  unsubscribePushAction,
  updatePushPreferencesAction,
} from '@/app/actions/push-subscriptions';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import type { Tables } from '@/types/database';

type PushSubscription = Tables<'push_subscriptions'>;

const NOTIFICATION_TYPES = [
  {
    key: 'notify_invoice_accepted' as const,
    label: 'Faktura zaakceptowana',
    desc: 'Gdy KSeF zaakceptuje fakturę',
  },
  {
    key: 'notify_invoice_rejected' as const,
    label: 'Faktura odrzucona',
    desc: 'Gdy KSeF odrzuci fakturę z powodu błędu',
  },
  {
    key: 'notify_payment_received' as const,
    label: 'Otrzymana płatność',
    desc: 'Gdy klient zapłaci za fakturę',
  },
  {
    key: 'notify_cert_expiry' as const,
    label: 'Wygasanie certyfikatu',
    desc: 'Na 30 i 7 dni przed wygaśnięciem certyfikatu KSeF',
  },
  {
    key: 'notify_inbox_new' as const,
    label: 'Nowa faktura zakupowa',
    desc: 'Gdy ktoś wystawi fakturę na Twój NIP (może być spam)',
  },
] as const;

interface Props {
  subscriptions: PushSubscription[];
}

export function NotificationsSettings({ subscriptions }: Props) {
  const router = useRouter();
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-display font-semibold tracking-tighter-display">
          Powiadomienia
        </h1>
        <p className="mt-2 text-muted-foreground">
          Otrzymuj alerty bezpośrednio na telefon — bez konieczności otwierania
          apki
        </p>
      </div>

      {/* Status na tym urządzeniu */}
      <section className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                isSubscribed ? 'bg-green-500/10' : 'bg-foreground/5'
              }`}
            >
              {isSubscribed ? (
                <Bell className="h-6 w-6 text-green-600 dark:text-green-400" />
              ) : (
                <BellOff className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium">
                {!isSupported
                  ? 'Twoja przeglądarka nie wspiera powiadomień'
                  : isSubscribed
                    ? 'Powiadomienia włączone na tym urządzeniu'
                    : 'Powiadomienia wyłączone na tym urządzeniu'}
              </p>
              <p className="text-sm text-muted-foreground">
                {!isSupported
                  ? 'Spróbuj Chrome, Edge lub Safari 16.4+'
                  : permission === 'denied'
                    ? 'Powiadomienia są zablokowane w ustawieniach przeglądarki'
                    : isSubscribed
                      ? 'Otrzymasz alerty nawet gdy apka jest zamknięta'
                      : 'Włącz aby dostawać alerty na telefon'}
              </p>
            </div>
          </div>
          {isSupported && permission !== 'denied' && (
            <Button
              variant={isSubscribed ? 'glass' : 'glass-primary'}
              size="lg"
              type="button"
              onClick={isSubscribed ? unsubscribe : subscribe}
              disabled={isLoading}
            >
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isSubscribed ? 'Wyłącz' : 'Włącz powiadomienia'}
            </Button>
          )}
        </div>
      </section>

      {/* Lista urządzeń */}
      {subscriptions.length > 0 && (
        <section className="space-y-4 rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass p-7 lg:p-8">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tighter-text">
              Twoje urządzenia ({subscriptions.length})
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Każde urządzenie ma własne preferencje powiadomień
            </p>
          </div>

          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <DeviceRow
                key={sub.id}
                subscription={sub}
                onUpdate={() => router.refresh()}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DeviceRow({
  subscription,
  onUpdate,
}: {
  subscription: PushSubscription;
  onUpdate: () => void;
}) {
  const [isUpdating, startUpdate] = useTransition();
  const [isRemoving, startRemove] = useTransition();

  const Icon =
    subscription.device_type === 'mobile'
      ? Smartphone
      : subscription.device_type === 'tablet'
        ? Tablet
        : Monitor;

  const togglePref = (
    key: (typeof NOTIFICATION_TYPES)[number]['key'],
    current: boolean,
  ) => {
    startUpdate(async () => {
      await updatePushPreferencesAction(subscription.id, { [key]: !current });
      onUpdate();
    });
  };

  const remove = () => {
    if (!confirm('Wyłączyć powiadomienia na tym urządzeniu?')) return;
    startRemove(async () => {
      await unsubscribePushAction(subscription.endpoint);
      onUpdate();
      toast.success('Urządzenie usunięte');
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-glass-border/50 bg-foreground/2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {subscription.device_name ?? 'Urządzenie'}
            </p>
            <p className="text-xs text-muted-foreground">
              Dodane{' '}
              {new Date(subscription.created_at).toLocaleDateString('pl-PL')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={remove}
          disabled={isRemoving}
          className="rounded-lg hover:bg-red-500/10 hover:text-red-600"
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="space-y-1 border-t border-glass-border/50 pt-2">
        {NOTIFICATION_TYPES.map((type) => {
          const enabled = subscription[type.key];
          return (
            <button
              key={type.key}
              type="button"
              onClick={() => togglePref(type.key, enabled)}
              disabled={isUpdating}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-foreground/2 disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{type.label}</p>
                <p className="text-xs text-muted-foreground">{type.desc}</p>
              </div>
              {/* Toggle pill */}
              <div
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  enabled ? 'bg-foreground' : 'bg-foreground/15'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                    enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
