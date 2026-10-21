import { DeleteAccountForm } from '@/components/settings/delete-account-form';
import { FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { getPageContext } from '@/lib/supabase/page-context';
import { getActiveGdprRequest } from '@/lib/gdpr/deletion';
import { SUPPORT_EMAIL } from '@/lib/site';
import { GdprSection } from './_components/gdpr-section';

export const dynamic = 'force-dynamic';

/**
 * Zakładka „Konto i dane (RODO)” = Privacy & Data z Finory
 * (`views/settings/privacy`): eksport danych (art. 15), usunięcie konta
 * (art. 17) i — jedyne miejsce w aplikacji — usunięcie firmy.
 */
export default async function AccountSettingsPage() {
  const { supabase, tenantId, role, user } = await getPageContext();
  const gdprRequest = await getActiveGdprRequest(supabase, user.id);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('nip')
    .eq('id', tenantId)
    .maybeSingle();

  const nip = String(tenant?.nip ?? '');
  const isOwner = role === 'owner';

  return (
    <FieldGroup>
      <div>
        <FieldLabel>Twoje dane (RODO)</FieldLabel>
        <FieldDescription>
          Prawo dostępu (art. 15) i prawo do bycia zapomnianym (art. 17).
        </FieldDescription>
      </div>

      <GdprSection initialRequest={gdprRequest ? {
        status: gdprRequest.status,
        scheduledFor: new Date(gdprRequest.scheduled_for).toLocaleDateString('pl-PL', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
      } : null} />

      <Separator />

      <div>
        <FieldLabel className="text-destructive">Usuń organizację (firmę)</FieldLabel>
        {/* Opis zgodny z regulaminem (§ 14 ust. 2 i 6) i umową powierzenia
            (§ 9). Usunięcie firmy idzie przez pomoc techniczną: aplikacja
            nie umie firmy wyłączyć ani usunąć (flag tenants.deleted_at /
            is_active nic nie sprawdza). Do 15.10.2026 opis obiecywał
            usunięcie i wyłączenie firmy, których nic nie wykonywało. */}
        <FieldDescription>
          Usunięcie firmy rozwiązuje umowę. Zlecasz je przez pomoc techniczną:
          napisz na {SUPPORT_EMAIL} z adresu właściciela i podaj NIP firmy. Do
          czasu wykonania zlecenia firma i abonament działają bez zmian.{' '}
          <strong>Najpierw pobierz kopię danych</strong> (Księgowość →
          Eksport). Faktury wysłane do KSeF przechowuje też Ministerstwo
          Finansów. To nie jest usunięcie Twojego konta — do tego służy sekcja
          &laquo;Twoje dane (RODO)&raquo; powyżej.
        </FieldDescription>
      </div>
      {!isOwner ? (
        <FieldDescription>
          Tylko właściciel konta może zlecić usunięcie firmy.
        </FieldDescription>
      ) : (
        <DeleteAccountForm tenantNipHint={nip} />
      )}
    </FieldGroup>
  );
}
