import { cron } from 'inngest';

import { inngest } from '../client';
import { toJobContext } from '@/lib/jobs/inngest-adapter';
import type { JobContext } from '@/lib/jobs/registry';
import {
  getTenantAdminEmail,
} from '@/lib/supabase/admin-queries';
import { sendCertExpiryAlert } from '@/lib/email/send';
import { createProposal } from '@/lib/flo/proposals';
import { buildCertProposal, evaluateCert } from '@/lib/flo/functions/ksef-cert';
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
/**
 * Runner (Etap 7): wspólne ciało dla Inngest i workera pg-boss.
 * Rejestracja pg-boss: lib/jobs/handlers/package-a.ts (kolejka cron.cert-expiry-alert).
 */
export async function runCertExpiryAlert({ step, logger }: JobContext) {
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
        // Karta agenta (X-03). Stan liczony z REALNEJ próby autoryzacji,
        // nie z pola z datą: klient, który odnowił certyfikat u wystawcy,
        // ale go nie wgrał, dalej ma o tym słyszeć — bo wysyłka i tak nie
        // zadziała. A ten, który wgrał, przestaje słyszeć natychmiast.
        await step.run(`flo-cert-card-${tenant.id}-${days}d`, async () => {
          const supabase = await createAdminClient();
          const { data: probe } = await supabase
            .from('ksef_health_log')
            .select('status, checked_at')
            .eq('tenant_id', tenant.id)
            .order('checked_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const verdict = evaluateCert(
            {
              lastAuthOk:
                probe?.status === undefined ? null : probe.status === 'ok',
              lastAuthAt: (probe?.checked_at as string | undefined) ?? null,
              expiresAt: tenant.ksef_certificate_expiry as string | null,
            },
            now,
          );

          const proposal = buildCertProposal({ tenantId: tenant.id, verdict, now });
          if (proposal) await createProposal(proposal);
        });

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
