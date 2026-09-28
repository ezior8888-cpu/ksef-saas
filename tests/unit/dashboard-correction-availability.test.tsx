import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrectionReconciliationError } from '@/lib/ksef/accounting-provenance';

const mocks = vi.hoisted(() => ({
  getPageContext: vi.fn(),
  getMonthlyFigures: vi.fn(),
  listProposals: vi.fn(),
  listScheduled: vi.fn(),
}));

vi.mock('@/lib/supabase/page-context', () => ({ getPageContext: mocks.getPageContext }));
vi.mock('@/lib/dashboard/monthly-figures', () => ({ getMonthlyFigures: mocks.getMonthlyFigures }));
vi.mock('@/app/actions/flo', () => ({
  listProposals: mocks.listProposals,
  listScheduled: mocks.listScheduled,
}));
vi.mock('@/app/(dashboard)/_components/dashboard-verification-banner', () => ({
  default: () => <div>Verification banner</div>,
}));
vi.mock('@/components/dashboard/monthly-figures-card', () => ({
  MonthlyFiguresCard: () => <div>Monthly figures</div>,
}));
vi.mock('@/components/dashboard/flo-welcome', () => ({
  FloWelcome: () => <div>Flo welcome</div>,
}));
vi.mock('@/components/flo/flo-composer', () => ({
  FloComposer: () => <div>Flo composer</div>,
}));
vi.mock('@/components/flo/scheduled-panel', () => ({
  FloScheduledPanel: () => <div>Flo schedule</div>,
}));
vi.mock('@/lib/security/environment', () => ({ isLocalDevEnv: () => false }));

import DashboardHomePage from '@/app/(dashboard)/dashboard/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPageContext.mockResolvedValue({ supabase: {}, tenantId: 'tenant-a' });
  mocks.listProposals.mockResolvedValue([]);
  mocks.listScheduled.mockResolvedValue([]);
});

describe('dashboard when accepted corrections need reconciliation', () => {
  it('keeps FLO available while withholding untrusted amounts', async () => {
    mocks.getMonthlyFigures.mockRejectedValue(new CorrectionReconciliationError());

    const html = renderToStaticMarkup(await DashboardHomePage());

    expect(html).toContain('Flo composer');
    expect(html).toContain('Kwoty wymagają uzgodnienia');
    expect(html).not.toContain('Monthly figures');
  });

  it('does not hide an unrelated database failure', async () => {
    mocks.getMonthlyFigures.mockRejectedValue(new Error('database offline'));

    await expect(DashboardHomePage()).rejects.toThrow('database offline');
  });

  it('shows the card when figures are reconciled', async () => {
    mocks.getMonthlyFigures.mockResolvedValue({ monthName: 'wrzesień' });

    const html = renderToStaticMarkup(await DashboardHomePage());

    expect(html).toContain('Monthly figures');
    expect(html).not.toContain('Kwoty wymagają uzgodnienia');
  });
});
