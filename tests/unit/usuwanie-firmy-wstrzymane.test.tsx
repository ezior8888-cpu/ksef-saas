import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Przegląd prawny 15.10.2026: „Usuń konto” w /settings (i „Usuń firmę”
// w /settings/account) woła `requestAccountDeletionAction`, które ustawiało
// `tenants.deleted_at`, `hard_delete_at` (+30 dni) i `is_active = false`,
// po czym wylogowywało właściciela. Tych kolumn nie sprawdza logowanie, RLS
// (`is_member_of`, `get_current_tenant_id`) ani żaden job, a subskrypcji
// Stripe nikt nie anulował — firma działała dalej, abonament się pobierał,
// a ekran logowania obiecywał „konto zostanie trwale usunięte (30 dni)”.
// Do czasu prawdziwego usuwania firmy akcja niczego nie zapisuje i kieruje
// do pomocy technicznej.

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(), from: vi.fn(), update: vi.fn(), signOut: vi.fn(),
  logAudit: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn(), getPageContext: vi.fn(),
}));
vi.mock('@/lib/supabase/auth-context', () => ({ requireOwner: mocks.requireOwner }));
vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: mocks.getPageContext }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/app/(auth)/login/actions', () => ({ loginWithEmail: vi.fn(), loginWithGoogle: vi.fn() }));
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => null }));
vi.mock('@/lib/invoices/vat-exemption', () => ({ readTenantVatExemption: async () => null }));
vi.mock('@/lib/invoices/cash-method', () => ({ readTenantCashMethod: async () => false }));
vi.mock('@/components/settings/vat-exemption-form', () => ({ VatExemptionForm: () => null }));
vi.mock('@/components/settings/cash-method-form', () => ({ CashMethodForm: () => null }));
vi.mock('@/components/settings/company-profile-form', () => ({ CompanyProfileForm: () => null }));

import LoginPage from '@/app/(auth)/login/page';
import { settingsTabsForRole } from '@/components/settings/finora/settings-tabs';
import { requestAccountDeletionAction } from '@/components/settings/account-actions';
import { SUPPORT_EMAIL } from '@/lib/site';

const TENANT_NIP = '1234567890';

/** Atrapa zapytań, które akcja wykonywała przed 15.10 (odczyt NIP, UPDATE tenants). */
function tenantsChain() {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: { nip: TENANT_NIP }, error: null })),
    update: vi.fn((values: unknown) => { mocks.update(values); return chain; }),
    then: (resolve: (value: { data: null; error: null }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return chain;
}

/**
 * Formularze wysyłały `nipConfirm` do 15.10. Akcja go już nie przyjmuje, ale
 * test woła ją tak jak dawniej — inaczej na starym kodzie odpadłby na
 * walidacji NIP, zanim dotarł do zapisu, i nie dowodziłby niczego.
 */
const callAction = requestAccountDeletionAction as (form?: FormData) => ReturnType<typeof requestAccountDeletionAction>;

function nipForm(nip = TENANT_NIP) {
  const form = new FormData();
  form.set('nipConfirm', nip);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation(tenantsChain);
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.requireOwner.mockResolvedValue({
    supabase: { from: mocks.from, auth: { signOut: mocks.signOut } },
    tenantId: '00000000-0000-4000-8000-000000000001',
    user: { id: '00000000-0000-4000-8000-000000000002' },
    role: 'owner',
  });
});

describe('usuwanie firmy wstrzymane do czasu prawdziwego mechanizmu', () => {
  it('właściciel z poprawnym NIP: nic nie zapisujemy, nie wylogowujemy, kierujemy do pomocy', async () => {
    const result = await callAction(nipForm());

    expect(result).toEqual({ success: false, error: expect.stringContaining(SUPPORT_EMAIL) });
    expect(result.error).toContain('nic nie zostało usunięte');
    expect(result.error).toContain('Twoje dane (RODO)');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('nie-właściciel dostaje odmowę uprawnień, bez zapisu', async () => {
    mocks.requireOwner.mockRejectedValue(new Error('Tylko właściciel'));

    expect(await callAction(nipForm())).toEqual({
      success: false,
      error: 'Tylko właściciel',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('ekran logowania nie obiecuje usunięcia konta ani firmy po „okresie retencji”', async () => {
    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ success: 'account_deleted' }) }),
    );

    // Kontrola, że strona się wyrenderowała (strażnik nie przechodzi na pustym HTML).
    expect(html).toContain('Zaloguj się');
    expect(html).not.toContain('trwale usunięte');
    expect(html).not.toContain('okresu retencji');
    expect(html).not.toContain('żądanie usunięcia firmy');
  });

  // Komunikat odmowy kieruje do „Ustawienia → Konto i dane (RODO)” (sekcja
  // RODO, jedyne prawdziwe usunięcie konta). Do 15.10 do `/settings/account`
  // nie prowadził żaden link — wskazówka byłaby drogą donikąd. Od planu
  // Finora (P14) nawigacja ustawień to zakładki liczone z roli w layoucie,
  // nie kafelki na stronie `/settings` — sprawdzamy zakładki.
  it.each(['member', 'admin', 'owner', 'accountant'] as const)(
    'zakładki ustawień (%s) prowadzą do „Konto i dane (RODO)”, a komunikat odmowy podaje tę nazwę',
    async (role) => {
      const tab = settingsTabsForRole(role).find((t) => t.href === '/settings/account');
      expect(tab?.label).toBe('Konto i dane (RODO)');

      const result = await requestAccountDeletionAction();
      expect(result.error).toContain(`Ustawienia → ${tab?.label}`);
    },
  );
});
