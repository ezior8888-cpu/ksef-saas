import * as Sentry from '@sentry/nextjs';
import { cron } from 'inngest';

import { inngest } from '../client';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import {
  getTenantAdminEmail,
} from '@/lib/supabase/admin-queries';
import { sendSlackAlert } from '@/lib/alerts/slack';
import { logAuditSystem } from '@/lib/audit/log-system';
import { sendCertExpiryAlert } from '@/lib/email/send';
import { createProposal } from '@/lib/flo/proposals';
import {
  buildCertProposal,
  dueCertThreshold,
  evaluateCert,
  WARN_THRESHOLDS,
} from '@/lib/flo/functions/ksef-cert';
import { sendPushToTenant } from '@/lib/push/sender';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Cron codziennie o 08:00 PL: ostrzega firmy, którym certyfikat KSeF
 * wygasa w ciągu 30/14/7 dni (progi z `ksef-cert.ts` — tego samego miejsca,
 * z którego korzysta karta agenta):
 *   - 30d: "odnów spokojnie"
 *   - 14d: "czas się ogarnąć"
 *   - 7d:  "ostatnie dni"
 *
 * Do 02.10 każdy próg był jednodniowym oknem — pominięty przebieg gubił
 * ostrzeżenie na dobre, a operator nie wiedział nic (AUD-53). Teraz:
 *   - próg to „wygasa za najwyżej N dni” (`dueCertThreshold`), więc
 *     pominięty dzień nadrabia następny przebieg;
 *   - wysłane progi zadanie pamięta w `audit_logs` (per data wygaśnięcia —
 *     nowy certyfikat zaczyna od nowa) i każdy wysyła raz;
 *   - po kilku pominiętych progach idzie JEDEN mail, z najpilniejszym;
 *   - niedostarczone ostrzeżenie nie jest zapisane (jutro kolejna próba),
 *     a operator dostaje listę niedostarczonych i tych na ostatnim progu.
 */

/** Rekord jednego dostarczonego ostrzeżenia w `audit_logs`. */
const ALERT_ACTION = 'ksef.cert_expiry_alert' as const;

/** Najwyższy próg — dalej zadanie nie patrzy. */
const HORIZON_DAYS = Math.max(...WARN_THRESHOLDS);

/** Ostatni (najpilniejszy) próg — o nim wie też operator. */
const LAST_THRESHOLD = Math.min(...WARN_THRESHOLDS);

/** Tyle identyfikatorów na jedno `.in()` — długość adresu zapytania PostgREST. */
const LOOKUP_CHUNK = 100;

const DAY = 86_400_000;

interface CertTenant {
  id: string;
  name: string;
  ksef_certificate_expiry: string;
}

/** Klucz progu wysłanego dla danej daty wygaśnięcia. */
function sentKey(tenantId: string, expiry: string, threshold: number): string {
  return `${tenantId}|${Date.parse(expiry)}|${threshold}`;
}

/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.cert-expiry-alert).
 */
export async function runCertExpiryAlert({ step, logger }: JobContext) {
    const now = new Date();
    let totalAlerts = 0;

    const tenants = await step.run('find-tenants', async (): Promise<CertTenant[]> => {
      const supabase = await createAdminClient();
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, ksef_certificate_expiry')
        .gt('ksef_certificate_expiry', now.toISOString())
        .lte('ksef_certificate_expiry', new Date(now.getTime() + HORIZON_DAYS * DAY).toISOString());

      if (error) {
        throw new Error(`Cert expiry query failed: ${error.message}`);
      }
      return (data ?? []) as CertTenant[];
    });

    // Które progi już poszły. Błąd odczytu rzuca: „nie wiem, co wysłałem”
    // to nie „nic nie wysłałem” — inaczej każda firma dostałaby mail ponownie.
    const sent = await step.run('read-sent-alerts', async (): Promise<string[]> => {
      if (tenants.length === 0) return [];
      const supabase = await createAdminClient();
      const keys: string[] = [];
      const ids = tenants.map((t) => t.id);
      for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('tenant_id, metadata')
          .eq('action', ALERT_ACTION)
          .in('tenant_id', ids.slice(i, i + LOOKUP_CHUNK))
          // Progi jednego certyfikatu mieszczą się w horyzoncie; zapas na nadrabianie.
          .gte('created_at', new Date(now.getTime() - 2 * HORIZON_DAYS * DAY).toISOString());
        if (error) throw new Error(`Nie można odczytać wysłanych ostrzeżeń: ${error.message}`);
        for (const row of (data ?? []) as Array<{ tenant_id: string; metadata: unknown }>) {
          const meta = (row.metadata ?? {}) as { threshold?: unknown; expiry?: unknown };
          if (typeof meta.threshold === 'number' && typeof meta.expiry === 'string') {
            keys.push(sentKey(row.tenant_id, meta.expiry, meta.threshold));
          }
        }
      }
      return keys;
    });
    const sentSet = new Set(sent);

    const forOperator: Array<{ tenantId: string; days: number; delivered: boolean }> = [];

    // Sekwencyjnie, żeby nie DDOS-ować Resend — kilkadziesiąt firm dziennie.
    for (const tenant of tenants) {
      const due = dueCertThreshold(tenant.ksef_certificate_expiry, now);
      if (due === null) continue;
      // Ten próg albo pilniejszy już poszedł dla tej daty wygaśnięcia.
      const alreadySent = WARN_THRESHOLDS.some(
        (t) => t <= due && sentSet.has(sentKey(tenant.id, tenant.ksef_certificate_expiry, t)),
      );
      if (alreadySent) continue;

      const daysRemaining = Math.ceil(
        (Date.parse(tenant.ksef_certificate_expiry) - now.getTime()) / DAY,
      );

      // Najpierw mail i push — to jest ostrzeżenie krytyczne. Karta Flo
      // idzie po nich i jej awaria nie może zatrzymać ani tych kanałów,
      // ani kolejnych firm.
      const delivery = await step.run(`alert-${tenant.id}-${due}d`, async () => {
        let emailed = false as boolean;
        let emailReason: string | undefined;

        const email = await getTenantAdminEmail(tenant.id);
        if (!email) {
          emailReason = 'no-admin-email';
        } else {
          const result = await sendCertExpiryAlert(email, {
            tenantName: tenant.name,
            daysRemaining,
            expiryDate: tenant.ksef_certificate_expiry,
          });
          emailed = result.sent;
          emailReason = result.reason;
        }

        const push = await sendPushToTenant(tenant.id, 'cert_expiry', {
          title:
            due <= LAST_THRESHOLD
              ? 'Certyfikat KSeF — pilne'
              : 'Certyfikat KSeF wkrótce wygaśnie',
          body: `${tenant.name ?? 'Firma'}: ok. ${daysRemaining} dni do wygaśnięcia.`,
          url: '/settings/ksef',
          tag: `cert-expiry-${tenant.id}-${due}`,
        });

        const delivered = emailed || push.sent > 0;
        // Zapis tylko po dostarczeniu: niedostarczone ostrzeżenie jutro
        // pójdzie jeszcze raz, zamiast zostać „odhaczone” w ciemno.
        if (delivered) {
          await logAuditSystem({
            action: ALERT_ACTION,
            tenantId: tenant.id,
            entityType: 'tenant',
            entityId: tenant.id,
            metadata: {
              threshold: due,
              expiry: tenant.ksef_certificate_expiry,
              days_remaining: daysRemaining,
              emailed,
              push_sent: push.sent,
            },
          });
        }

        return { delivered, emailed, reason: emailReason, push };
      });

      if (!delivery.delivered || due <= LAST_THRESHOLD) {
        forOperator.push({ tenantId: tenant.id, days: daysRemaining, delivered: delivery.delivered });
      }

      // Karta agenta (X-03). Stan z daty w polu: logowania KSeF nie mają
      // śladu per firma (`ksef_health_log` jest globalny dla środowiska),
      // więc „nie mogę się zalogować Twoim certyfikatem” jest tu nieznane.
      await step.run(`flo-cert-card-${tenant.id}-${due}d`, async () => {
        try {
          const verdict = evaluateCert(
            {
              lastAuthOk: null,
              lastAuthAt: null,
              expiresAt: tenant.ksef_certificate_expiry,
            },
            now,
          );

          // Próg przekazany wprost: przy nadrabianiu `verdict.daysLeft`
          // bywa dowolną liczbą poniżej progu, a karta odzywa się na progach.
          const proposal = buildCertProposal({
            tenantId: tenant.id,
            verdict,
            now,
            threshold: due,
          });
          if (proposal) await createProposal(proposal);
          return { card: proposal ? ('asked' as const) : ('none' as const) };
        } catch (e) {
          Sentry.captureException(e, {
            tags: { job: 'cert-expiry-alert', kind: 'flo-card', tenant_id: tenant.id },
          });
          logger.error('Karta Flo o certyfikacie nie powstała', {
            tenantId: tenant.id,
            error: e instanceof Error ? e.message : String(e),
          });
          return { card: 'failed' as const };
        }
      });
      totalAlerts += 1;
    }

    // Operator: firmy na ostatnim progu i te, do których nic nie dotarło.
    if (forOperator.length > 0) {
      await step.run('notify-operator', async () => {
        const undelivered = forOperator.filter((f) => !f.delivered);
        await sendSlackAlert({
          channel: 'urgent',
          text:
            `Certyfikat KSeF: ${forOperator.length} firm wymaga uwagi` +
            (undelivered.length > 0 ? ` (${undelivered.length} bez dostarczonego ostrzeżenia)` : ''),
          context: Object.fromEntries(
            forOperator.slice(0, 20).map((f) => [
              f.tenantId,
              `${f.days} dni${f.delivered ? '' : ' — niedostarczone'}`,
            ]),
          ),
        });
      });
    }

    logger.info(`Ostrzeżenia o certyfikacie: ${totalAlerts}, dla operatora: ${forOperator.length}`);
    return { totalAlerts, forOperator: forOperator.length };
}

export const certExpiryAlertJob = inngest.createFunction(
  {
    id: 'cert-expiry-alert',
    name: 'Alerty o wygasających certyfikatach KSeF',
    triggers: [cron('TZ=Europe/Warsaw 0 8 * * *')],
  },
  async ({ step, logger, attempt }) =>
    runCertExpiryAlert(toJobContext({ step, logger, attempt })),
);
