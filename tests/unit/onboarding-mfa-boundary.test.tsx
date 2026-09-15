import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), cookies: vi.fn(), setCookie: vi.fn(),
  getSession: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(), from: vi.fn(), rpc: vi.fn(),
  audit: vi.fn(), gus: vi.fn(), stripe: vi.fn(), enqueue: vi.fn(), upload: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient, createAdminClient: mocks.createAdminClient }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error('redirect:' + path); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAudit: mocks.audit }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/dashboard-shell-data', () => ({
  getCachedMembershipRowsWithTenants: vi.fn(), getDashboardSessionUser: vi.fn(), mapMembershipRowsToOrgSwitcher: vi.fn(),
}));
vi.mock('@/lib/gus/client', () => ({ lookupCompanyByNip: mocks.gus }));
vi.mock('@/lib/xml/invoice-calculator', () => ({ validateNipChecksum: () => true }));
vi.mock('@/lib/stripe/customer', () => ({ ensureStripeCustomer: mocks.stripe }));
vi.mock('@/lib/stripe/client', () => ({ isStripeConfigured: () => true }));
vi.mock('@/lib/jobs/enqueue', () => ({ sendJobEvent: mocks.enqueue }));
vi.mock('@/lib/import/file-storage', () => ({ uploadImportFile: mocks.upload }));
vi.mock('@/lib/inngest/error-message', () => ({ formatInngestSendError: () => 'fixture failure' }));
vi.mock('@/lib/inngest/client', () => ({
  importKsefHistoryRequested: { create: (data: unknown) => ({ name: 'ksef', data }) },
  importFileUploaded: { create: (data: unknown) => ({ name: 'file', data }) },
}));
vi.mock('@/components/onboarding/form', () => ({ OnboardingForm: () => null }));
vi.mock('@/components/onboarding/import-source-selector', () => ({ ImportSourceSelector: () => null }));
vi.mock('@/components/onboarding/magic-import-form', () => ({ MagicImportForm: () => null }));
vi.mock('@/components/onboarding/import-progress-view', () => ({ ImportProgressView: () => null }));
vi.mock('@/components/invite/invite-accept-form', () => ({ InviteAcceptForm: () => null }));
vi.mock('@/components/brand/brand-wordmark', () => ({ BrandWordmark: () => null }));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('lucide-react', () => ({ ArrowLeft: () => null, CheckCircle2: () => null }));

import { createOrganizationAction, skipOnboardingWithoutNipAction, acceptInvitationAction, requestJoinAction } from '@/app/actions/organizations';
import { lookupNipAction } from '@/components/onboarding/actions';
import { startMagicImportAction, startFileImportAction } from '@/app/onboarding/magic-import/actions';
import OnboardingPage from '@/app/onboarding/page';
import ImportSourcePage from '@/app/onboarding/import-source/page';
import MagicImportPage from '@/app/onboarding/magic-import/page';
import ProgressPage from '@/app/onboarding/progress/[jobId]/page';
import InviteLandingPage from '@/app/invite/[token]/page';
import { getVerifiedUserContext } from '@/lib/auth/verified-user';
import { ACTIVE_ORG_COOKIE } from '@/lib/supabase/active-org';

const org = '11111111-1111-4111-8111-111111111111';
const foreignOrg = '22222222-2222-4222-8222-222222222222';
const userId = 'fixture-user';
const token = 'synthetic-access-token';
const inviteToken = 'synthetic-invitation-token';
const company = { nip: '1234567890', name: 'Fixture', city: 'Test', postalCode: '00-000', street: 'Test', buildingNumber: '1' };
let aal: string;
let factorType: string | null;
let selectedOrg: string | null;
let activeMember: boolean;
type QueryLog = { table: string; operation: string; filters: Record<string, unknown>; payload?: unknown };
let queries: QueryLog[];

function query(table: string) {
  const record: QueryLog = { table, operation: 'select', filters: {} };
  queries.push(record);
  const result = (many = false) => {
    let data: unknown = null;
    if (table === 'memberships') {
      data = activeMember ? { id: 'member', user_id: userId, role: 'owner', status: 'active', organization_id: org } : null;
    } else if (table === 'tenants') {
      data = { id: org, nip: company.nip, name: company.name, ksef_credentials_encrypted: 'fixture-encrypted' };
    } else if (table === 'import_jobs') {
      data = { id: 'job', tenant_id: org, status: 'pending', source: 'ksef_history' };
    } else if (table === 'organization_join_requests') {
      data = { id: 'join-request' };
    } else if (table === 'organization_invitations') {
      data = { email: 'user@example.test', role: 'member', organization_id: org, expires_at: '2099-01-01', tenants: { name: 'Fixture' } };
    }
    return { data: many ? [] : data, error: null };
  };
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn((payload: unknown) => { record.operation = 'insert'; record.payload = payload; return chain; }),
    update: vi.fn((payload: unknown) => { record.operation = 'update'; record.payload = payload; return chain; }),
    delete: vi.fn(() => { record.operation = 'delete'; return chain; }),
    eq: vi.fn((key: string, value: unknown) => { record.filters[key] = value; return chain; }),
    limit: vi.fn(async () => result(true)),
    single: vi.fn(async () => result()),
    maybeSingle: vi.fn(async () => result()),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return chain;
}
beforeEach(() => {
  vi.resetAllMocks();
  aal = 'aal2'; factorType = 'totp'; selectedOrg = org; activeMember = true; queries = [];
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: token, user: { id: 'forged', factors: [] } } }, error: null });
  mocks.getUser.mockImplementation(async () => ({ data: { user: {
    id: userId, email: 'user@example.test',
    factors: factorType ? [{ id: 'factor', factor_type: factorType, status: 'verified' }] : [],
  } }, error: null }));
  mocks.getClaims.mockImplementation(async () => ({ data: { claims: { sub: userId, aal } }, error: null }));
  mocks.from.mockImplementation(query);
  mocks.createClient.mockResolvedValue({ auth: {
    getSession: mocks.getSession, getUser: mocks.getUser, getClaims: mocks.getClaims,
  }, from: mocks.from, rpc: mocks.rpc });
  mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  mocks.cookies.mockResolvedValue({
    get: (key: string) => key === ACTIVE_ORG_COOKIE && selectedOrg ? { value: selectedOrg } : undefined,
    set: mocks.setCookie,
  });
  mocks.rpc.mockResolvedValue({ data: org, error: null });
  mocks.upload.mockResolvedValue('fixture/import.csv');
  mocks.gus.mockResolvedValue({ kind: 'success', data: company });
});

function uploadForm(tenantId = org) {
  const form = new FormData();
  form.set('file', new File(['fixture,csv'], 'fixture.csv', { type: 'text/csv' }));
  form.set('source', 'fakturownia_csv'); form.set('tenantId', tenantId);
  return form;
}
const actions = [
  { name: 'create organization', invoke: () => createOrganizationAction(company) },
  { name: 'skip NIP', invoke: () => skipOnboardingWithoutNipAction() },
  { name: 'accept invitation', invoke: () => acceptInvitationAction(inviteToken) },
  { name: 'request membership', invoke: () => requestJoinAction({ organizationId: org }) },
  { name: 'GUS lookup', invoke: () => lookupNipAction(company.nip) },
  { name: 'KSeF import', invoke: () => startMagicImportAction(org, 3) },
  { name: 'file import', invoke: () => startFileImportAction(uploadForm()) },
];
function expectNoEffects() {
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.gus).not.toHaveBeenCalled();
  expect(mocks.stripe).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.setCookie).not.toHaveBeenCalled();
}

// The entry points, optional MFA helper and tenant guard are real; only IO is mocked.
describe.each(actions)('$name', ({ invoke }) => {
  it.each(['totp', 'phone', 'webauthn'])('denies AAL1 with verified %s before any IO or account mutation', async (factor) => {
    aal = 'aal1'; factorType = factor;
    await expect(invoke()).resolves.toMatchObject({ success: false, error: 'Wymagana weryfikacja dwuetapowa' });
    expectNoEffects();
    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(mocks.getClaims).toHaveBeenCalledWith(token);
  });
  it('denies a missing session before IO', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(invoke()).resolves.toMatchObject({ success: false, error: 'Niezalogowany' });
    expectNoEffects();
  });
  it('fails closed without exposing an Auth outage', async () => {
    mocks.getClaims.mockRejectedValue(new Error('internal-sensitive-error'));
    await expect(invoke()).resolves.toMatchObject({ success: false, error: 'Nie udało się zweryfikować sesji. Zaloguj się ponownie.' });
    expectNoEffects();
  });
});
it.each(['aal2', 'no-factor'])('bootstrap works without an organization for %s', async (state) => {
  selectedOrg = null;
  if (state === 'no-factor') { aal = 'aal1'; factorType = null; }
  await expect(createOrganizationAction(company)).rejects.toThrow('redirect:/onboarding/import-source');
  expect(queries).toContainEqual(expect.objectContaining({ table: 'memberships', operation: 'insert', payload: expect.objectContaining({ user_id: userId, organization_id: org }) }));
  expect(mocks.stripe).toHaveBeenCalledWith(expect.objectContaining({ tenantId: org, email: 'user@example.test' }));
  expect(mocks.setCookie).toHaveBeenCalledWith(expect.objectContaining({ value: org }));
  expect(mocks.getClaims.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAdminClient.mock.invocationCallOrder[0]!);
});
it('skip NIP works without an organization for an account without MFA', async () => {
  selectedOrg = null; aal = 'aal1'; factorType = null;
  await expect(skipOnboardingWithoutNipAction()).rejects.toThrow('redirect:/dashboard');
  expect(queries).toContainEqual(expect.objectContaining({ table: 'tenants', operation: 'insert' }));
});
it('an authenticated GUS lookup remains available without an organization', async () => {
  selectedOrg = null; aal = 'aal1'; factorType = null;
  await expect(lookupNipAction(company.nip)).resolves.toMatchObject({ success: true, data: company, existingOrgs: [] });
  expect(mocks.gus).toHaveBeenCalledExactlyOnceWith(company.nip);
});
it('accepts an invitation without requiring existing membership and preserves the RPC token check', async () => {
  selectedOrg = null;
  await expect(acceptInvitationAction(inviteToken)).rejects.toThrow('redirect:/dashboard');
  expect(mocks.rpc).toHaveBeenCalledWith('accept_organization_invitation', { p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(mocks.setCookie).toHaveBeenCalledWith(expect.objectContaining({ value: org }));
});
describe.each(['ksef', 'file'])('%s import', (kind) => {
  const invoke = (tenantId = org) => kind === 'ksef' ? startMagicImportAction(tenantId, 3) : startFileImportAction(uploadForm(tenantId));
  it.each(['aal2', 'no-factor'])('works for a verified active member with %s', async (state) => {
    if (state === 'no-factor') { aal = 'aal1'; factorType = null; }
    await expect(invoke()).resolves.toEqual({ success: true, importJobId: 'job' });
    expect(queries[0]).toMatchObject({ table: 'memberships', filters: { user_id: userId, organization_id: org, status: 'active' } });
    expect(queries).toContainEqual(expect.objectContaining({ table: 'import_jobs', operation: 'insert', payload: expect.objectContaining({ tenant_id: org, triggered_by: userId }) }));
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledTimes(kind === 'file' ? 1 : 0);
  });
  it('rejects a revoked or missing membership before import IO', async () => {
    activeMember = false;
    await expect(invoke()).resolves.toMatchObject({ success: false, error: 'Brak dostępu do aktywnej organizacji' });
    expect(queries.every((entry) => entry.table === 'memberships')).toBe(true);
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects a submitted tenant different from the verified active organization', async () => {
    await expect(invoke(foreignOrg)).resolves.toMatchObject({ success: false, error: 'Brak uprawnień' });
    expect(queries.every((entry) => entry.table === 'memberships')).toBe(true);
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
});

const pages = [
  { name: 'onboarding', invoke: () => OnboardingPage({ searchParams: Promise.resolve({ invite: inviteToken, action: 'invite' as const }) }), returnTo: '/onboarding?invite=' + inviteToken + '&action=invite' },
  { name: 'import source', invoke: () => ImportSourcePage(), returnTo: '/onboarding/import-source' },
  { name: 'magic import', invoke: () => MagicImportPage({ searchParams: Promise.resolve({ tenantId: org }) }), returnTo: '/onboarding/magic-import?tenantId=' + org },
  { name: 'progress', invoke: () => ProgressPage({ params: Promise.resolve({ jobId: 'job' }) }), returnTo: '/onboarding/progress/job' },
  { name: 'invitation', invoke: () => InviteLandingPage({ params: Promise.resolve({ token: inviteToken }) }), returnTo: '/invite/' + inviteToken },
];
describe.each(pages)('$name page', ({ invoke, returnTo }) => {
  it.each(['totp', 'phone'])('requires %s challenge before revealing account data and keeps the return path', async (factor) => {
    aal = 'aal1'; factorType = factor;
    await expect(invoke()).rejects.toThrow('redirect:/login/two-factor?redirect=' + encodeURIComponent(returnTo));
    expectNoEffects();
  });
  it('fails closed before any account data on a verification failure', async () => {
    mocks.getClaims.mockRejectedValue(new Error('private-error'));
    await expect(invoke()).rejects.toThrow('Nie udało się zweryfikować sesji.');
    expectNoEffects();
  });
  it.each(['aal2', 'no-factor'])('renders for %s', async (state) => {
    if (state === 'no-factor') { aal = 'aal1'; factorType = null; }
    await expect(invoke()).resolves.toBeTruthy();
  });
});
it('the bootstrap helper does not read an organization or instantiate service-role', async () => {
  selectedOrg = null; aal = 'aal1'; factorType = null;
  await expect(getVerifiedUserContext()).resolves.toMatchObject({ ok: true, user: { id: userId } });
  expect(mocks.cookies).not.toHaveBeenCalled();
  expectNoEffects();
});
it('progress explicitly scopes the job to the active organization', async () => {
  await ProgressPage({ params: Promise.resolve({ jobId: 'job' }) });
  expect(queries).toContainEqual(expect.objectContaining({ table: 'import_jobs', filters: { id: 'job', tenant_id: org } }));
});
