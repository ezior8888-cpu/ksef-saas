import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/exports', () => ({
  startExportAction: vi.fn(),
  downloadExportFileAction: vi.fn(),
}));

import { ExportsCenter } from '@/components/exports/exports-center';

/** Centrum eksportu: JPK_V7M nie do wyboru, a klient widzi dlaczego. */
describe('Centrum eksportu — JPK_V7M wstrzymany', () => {
  const html = renderToStaticMarkup(<ExportsCenter recentJobs={[]} />);

  it('nie ma przycisku JPK_V7M, reszta formatów jest', () => {
    expect(html).not.toContain('JPK_V7M (ewidencja + deklaracja VAT)');
    expect(html).toContain('JPK_FA(4)');
    expect(html).toContain('KPiR Excel');
  });

  it('notka wyjaśnia powód wyłączenia', () => {
    expect(html).toContain('JPK_V7M jest chwilowo wyłączony');
    expect(html).toContain('JPK_V7M(3)');
  });
});
