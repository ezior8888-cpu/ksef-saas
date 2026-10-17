import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Szkielet panelu (plan Finora P0, E2): pasek boczny, nagłówek, menu avatara
 * i stopka. Renderujemy prawdziwe komponenty; podstawiamy tylko router Next
 * (poza aplikacją nie istnieje), akcję wylogowania (`'use server'` ciągnie
 * backend) i paletę ⌘K (ma własny test i woła akcję wyszukiwania).
 */

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ prefetch: () => {}, push: () => {}, refresh: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/(auth)/login/actions', () => ({ signOut: async () => {} }));

vi.mock('@/components/dashboard/command-menu', () => ({
  CommandMenu: () => <button type="button">Szukaj lub przejdź…</button>,
}));

const { AppSidebar } = await import('@/components/dashboard/app-sidebar');
const { AppHeader } = await import('@/components/dashboard/app-header');
const { Footer } = await import('@/components/dashboard/footer');
const { ProfileMenu, initialsFromEmail } = await import('@/components/dashboard/profile-menu');
const { SidebarProvider } = await import('@/components/ui/sidebar');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { dashboardNavSections, dashboardSettingsNavItem } = await import('@/lib/dashboard-nav-config');

function renderSidebar(pathname: string): string {
  nav.pathname = pathname;
  return renderToStaticMarkup(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

/** Pozycja menu (`<a data-slot="sidebar-menu-button">`) prowadząca pod `href`. */
function anchorFor(html: string, href: string): string {
  const tags = html.match(/<a\s[^>]*>/g) ?? [];
  const hit = tags.filter(
    (tag) => tag.includes('data-slot="sidebar-menu-button"') && tag.includes(` href="${href}"`),
  );
  if (hit.length !== 1) throw new Error(`pozycja menu ${href}: ${hit.length} trafień`);
  return hit[0];
}

/** Atrybut stanu `data-active` (nie klasa `data-active:…` w `class`). */
const ACTIVE_ATTR = /\sdata-active(?:=""|\s|>)/;

describe('AppSidebar — pasek boczny Finory', () => {
  it('rysuje wszystkie sekcje i pozycje z poprawnymi adresami', () => {
    const html = renderSidebar('/dashboard');

    for (const section of dashboardNavSections) {
      expect(html).toContain(`>${section.title}</div>`);
      for (const item of section.items) {
        expect(html).toContain(`>${item.label}</span>`);
        anchorFor(html, item.href);
      }
    }
    expect(html).toContain(`>${dashboardSettingsNavItem.label}</span>`);
    anchorFor(html, dashboardSettingsNavItem.href);
  });

  it('podgląd faktury podświetla „Faktury”, a kreator nie', () => {
    const podglad = renderSidebar('/invoices/abc');
    expect(anchorFor(podglad, '/invoices')).toMatch(ACTIVE_ATTR);
    expect(anchorFor(podglad, '/invoices/new')).not.toMatch(ACTIVE_ATTR);

    const kreator = renderSidebar('/invoices/new/regular');
    expect(anchorFor(kreator, '/invoices')).not.toMatch(ACTIVE_ATTR);
    expect(anchorFor(kreator, '/invoices/new')).toMatch(ACTIVE_ATTR);
  });

  it('Ustawienia w stopce paska świecą na podstronach ustawień', () => {
    const html = renderSidebar('/settings/ksef');
    expect(anchorFor(html, '/settings')).toMatch(ACTIVE_ATTR);
    expect(anchorFor(html, '/dashboard')).not.toMatch(ACTIVE_ATTR);
  });

  it('wariant inset ze zwijaniem do ikon (stałe z D2)', () => {
    const html = renderSidebar('/dashboard');
    expect(html).toContain('data-variant="inset"');
    expect(html).toContain('data-state="expanded"');
  });
});

describe('Footer — stopka panelu', () => {
  it('nosi nazwę FaktWay, linki prawne i Pomoc', () => {
    const html = renderToStaticMarkup(<Footer />);

    expect(html).toMatch(/^<footer[^>]*class="ff-shell-footer"/);
    expect(html).toContain('FaktWay');
    expect(html).toContain(String(new Date().getFullYear()));
    expect(html).toContain('href="/legal/regulamin"');
    expect(html).toContain('href="/legal/polityka-prywatnosci"');
    expect(html).toContain('>Pomoc</button>');
  });
});

describe('ProfileMenu — menu avatara', () => {
  it('przycisk pokazuje inicjały z adresu e-mail', () => {
    const html = renderToStaticMarkup(<ProfileMenu email="jan.kowalski@example.test" />);

    expect(html).toContain('aria-label="Menu konta"');
    expect(html).toContain('>JK</span>');
  });

  it('inicjały: dwa człony, jeden człon i adres bez liter', () => {
    expect(initialsFromEmail('jan.kowalski@example.test')).toBe('JK');
    expect(initialsFromEmail('anna@example.test')).toBe('AN');
    expect(initialsFromEmail('łukasz_żak@example.test')).toBe('ŁŻ');
    expect(initialsFromEmail('@example.test')).toBe('?');
  });
});

describe('AppHeader — nagłówek panelu', () => {
  it('wstawia sloty przełącznika firmy i tytułu strony oraz menu konta', () => {
    nav.pathname = '/invoices';
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <SidebarProvider>
          <AppHeader
            orgSwitcher={<div data-testid="slot-firma">Firma testowa</div>}
            pageHeading={<h1 data-testid="slot-tytul">Tytuł strony</h1>}
            user={{ email: 'anna@example.test' }}
          />
        </SidebarProvider>
      </TooltipProvider>,
    );

    expect(html).toMatch(/^<div[^>]*data-slot="sidebar-wrapper"[^>]*><header[^>]*class="ff-shell-header/);
    expect(html).toContain('data-testid="slot-firma"');
    expect(html).toContain('data-testid="slot-tytul"');
    expect(html).toContain('Szukaj lub przejdź…');
    expect(html).toContain('aria-label="Przełącz pasek boczny"');
    expect(html).toContain('>AN</span>');
    // Dzwonka i ikony ustawień w nagłówku nie ma (plan Finora P0).
    expect(html).not.toContain('href="/settings"');
    expect(html).not.toMatch(/powiadomie/i);
  });

  it('bez użytkownika nie rysuje menu konta', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <SidebarProvider>
          <AppHeader orgSwitcher={null} pageHeading={null} user={null} />
        </SidebarProvider>
      </TooltipProvider>,
    );

    expect(html).not.toContain('Menu konta');
  });
});
