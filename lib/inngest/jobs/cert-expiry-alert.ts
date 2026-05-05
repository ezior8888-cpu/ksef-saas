import { cron } from 'inngest';

import { inngest } from '../client';
import {
  getTenantAdminEmail,
} from '@/lib/supabase/admin-queries';
import { sendCertExpiryAlert } from '@/lib/email/send';
import { sendPushToTenant } from '@/lib/push/sender';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Cron codziennie o 08:00 PL: sprawdza tenantów, którym certyfikat KSeF
 * wygasa w 30/14/7 dniach i wysyła alerty przez email.
 *
 * Progi (30/14/7) są tak dobrane, żeby user zobaczył alert trzy razy
 * z narastającą pilnością:
 *   - 30d: "odnów spokojnie"
 *   - 14d: "czas się ogarnąć"
 *   - 7d:  "ostatnie dni"
 *
 * Każdy próg filtruje tylko okno 1-dniowe [days-1, days], żeby jeden tenant
 * nie dostawał 3 emaili jednego dnia (dostanie 3 emaile przez tydzień).
 *
 * Pętla `for (days of thresholds)` iteruje sekwencyjnie - każdy próg jako
 * osobny step.run (audit trail w Inngest UI + memoizacja przy retry).
 */
export const certExpiryAlertJob = inngest.createFunction(
  {
    id: 'cert-expiry-alert',
    name: 'Alerty o wygasających certyfikatach KSeF',
    triggers: [cron('TZ=Europe/Warsaw 0 8 * * *')],
  },
  async ({ step, logger }) => {
    const now = new Date();
    const thresholds = [30, 14, 7] as const;
    let totalAlerts = 0;

    for (const days of thresholds) {
      const tenants = await step.run(`find-tenants-${days}d`, async () => {
        const supabase = await createAdminClient();

        // Okno 1-dniowe: [now + (days-1)d, now + days d].
        // Dzięki temu dokładnie jeden dzień tygodnia wpada w każdy próg,
        // więc dokładnie jeden email per próg per tenant.
        const lowerBound = new Date(
          now.getTime() + (days - 1) * 24 * 60 * 60 * 1000,
        );
        const upperBound = new Date(
          now.getTime() + days * 24 * 60 * 60 * 1000,
        );

        const { data, error } = await supabase
          .from('tenants')
          .select('id, nip, name, ksef_certificate_expiry')
          .gte('ksef_certificate_expiry', lowerBound.toISOString())
          .lte('ksef_certificate_expiry', upperBound.toISOString());

        if (error) {
          throw new Error(`Cert expiry query failed: ${error.message}`);
        }
        return data ?? [];
      });

      logger.info(
        `Znaleziono ${tenants.length} tenantów z certem wygasającym w ~${days}d`,
      );

      // Sekwencyjnie żeby nie DDOS-ować Resend - 3 progi × max kilkadziesiąt
      // tenantów każdy, nie ma sensu paralelizować.
      for (const tenant of tenants) {
        await step.run(`alert-${tenant.id}-${days}d`, async () => {
          let emailed = false as boolean;
          let emailReason: string | undefined;

          const email = await getTenantAdminEmail(tenant.id);
          if (!email) {
            emailReason = 'no-admin-email';
          } else {
            const result = await sendCertExpiryAlert(email, {
              tenantName: tenant.name,
              daysRemaining: days,
              expiryDate: tenant.ksef_certificate_expiry,
            });
            emailed = result.sent;
            emailReason = result.reason;
          }

          const push = await sendPushToTenant(tenant.id, 'cert_expiry', {
            title:
              days <= 7
                ? 'Certyfikat KSeF — pilne'
                : 'Certyfikat KSeF wkrótce wygaśnie',
            body: `${tenant.name ?? 'Firma'}: ok. ${days} dni do wygaśnięcia.`,
            url: '/settings/ksef',
            tag: `cert-expiry-${tenant.id}-${days}`,
          });

          return {
            emailed,
            reason: emailReason,
            push,
            skippedWithoutEmail: !email,
          };
        });
        totalAlerts += 1;
      }
    }

    return { totalAlerts };
  },
);
