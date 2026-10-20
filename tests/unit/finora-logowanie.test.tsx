import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Plan Finora P15 (E10b): ekrany logowania, onboarding i zaproszenie na
 * układzie Finory (`src/views/pages/auth/*`). Pilnuje:
 *  - kontraktu e2e (`e2e/pages/auth-page.ts`): `id='email'`, `id='password'`,
 *    przycisk „Zaloguj się”, przycisk rejestracji „Utwórz konto”;
 *  - tłumaczeń z §5 P15 (bez Facebooka i „Remember me”);
 *  - tła: kolory `--chart-1..3` presetu D2 i znaki od „zł”, tło z motywu;
 *  - braku starego wyglądu (szkło, `.zova`) na przeniesionych ekranach.
 */

const mocks = vi.hoisted(() => ({
  google: vi.fn(),
  closed: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/auth/oauth-providers', () => ({ isGoogleLoginEnabled: mocks.google }));
vi.mock('@/lib/feature-flags/signups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/signups')>()),
  isSignupClosed: mocks.closed,
}));
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: () => null }));
vi.mock('@/app/(auth)/login/actions', () => ({ loginWithEmail: vi.fn(), loginWithGoogle: vi.fn() }));
vi.mock('@/app/(auth)/register/actions', () => ({ signupWithEmail: vi.fn() }));
vi.mock('@/app/(auth)/forgot-password/actions', () => ({ requestPasswordReset: vi.fn() }));
vi.mock('@/app/onboarding/magic-import/actions', () => ({
  skipMagicImportAction: vi.fn(),
  startMagicImportAction: vi.fn(),
  startFileImportAction: vi.fn(),
}));
vi.mock('@/app/actions/organizations', () => ({
  acceptInvitationAction: vi.fn(),
  requestJoinAction: vi.fn(),
  skipOnboardingWithoutNipAction: vi.fn(),
}));
vi.mock('@/components/onboarding/actions', () => ({
  completeOnboardingAction: vi.fn(),
  lookupNipAction: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn(), replace: vi.fn() }),
  redirect: (path: string) => { throw new Error('redirect:' + path); },
}));

import LoginPage from '@/app/(auth)/login/page';
import RegisterPage from '@/app/(auth)/register/page';
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';
import FinishPage from '@/app/auth/finish/page';
import {
  AUTH_GLITCH_CHARACTERS,
  AUTH_GLITCH_COLOR_VARS,
  AUTH_GLITCH_FALLBACK,
  AuthGlitchBackground,
  pixelToHex,
  resolveCssColor,
} from '@/components/auth/finora/auth-glitch-background';
import { AuthMessage } from '@/components/auth/finora/auth-message';
import {
  AUTH_SLOGAN_TEXT,
  AUTH_SLOGAN_TITLE,
  AuthSplitLayout,
} from '@/components/auth/finora/auth-split-layout';
import LetterGlitch, { hexToRgb, outerVignetteBackground } from '@/components/ui/letter-glitch';
import { PasswordInput } from '@/components/auth/finora/password-input';
import { InviteAcceptForm } from '@/components/invite/invite-accept-form';
import { OnboardingForm } from '@/components/onboarding/form';
import { ImportProgressView, type ImportJobRow } from '@/components/onboarding/import-progress-view';
import { ImportSourceSelector } from '@/components/onboarding/import-source-selector';
import { MagicImportForm } from '@/components/onboarding/magic-import-form';

const ROOT = join(__dirname, '..', '..');
const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');

/** Stary wygląd, który na przeniesionych ekranach nie może zostać (§9 pkt 5). */
const OLD_LOOK = /rgba\(15,10,30|white\/55|backdrop-blur|ff-glass-pane|\bzova\b|var\(--z-|glass-primary|bg-glass/;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.google.mockResolvedValue(true);
  mocks.closed.mockResolvedValue(false);
});

async function login(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }));
}

async function register(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await RegisterPage({ searchParams: Promise.resolve(params) }));
}

async function forgot(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await ForgotPasswordPage({ searchParams: Promise.resolve(params) }));
}

function buttonsNamed(html: string, name: string): number {
  // Tekst przycisku bez znaczników (ikona, spany) — tak liczy nazwę Playwright.
  return [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter((text) => text === name).length;
}

describe('układ logowania (AuthSplitLayout)', () => {
  it('lewa połowa: logo do strony głównej, hasło nad formularzem na telefonie, treść', () => {
    const html = renderToStaticMarkup(
      <AuthSplitLayout panelTitle='Tytuł panelu' panelText='Tekst panelu'>
        <p>Treść strony</p>
      </AuthSplitLayout>,
    );
    expect(html).toContain('href="/"');
    expect(html).toContain('Fakt<span class="text-primary">Way</span>');
    expect(html).toMatch(new RegExp(`<p class="[^"]*lg:hidden[^"]*">${AUTH_SLOGAN_TITLE} ${AUTH_SLOGAN_TEXT}</p>`));
    expect(html).toContain('<p>Treść strony</p>');
  });

  it('prawa połowa: ukryta poniżej lg, tytuł i tekst panelu, hasło FaktWay w karcie', () => {
    const html = renderToStaticMarkup(
      <AuthSplitLayout panelTitle='Tytuł panelu' panelText='Tekst panelu'>
        <p>x</p>
      </AuthSplitLayout>,
    );
    expect(html).toContain('max-lg:hidden');
    expect(html).toContain('Tytuł panelu');
    expect(html).toContain('Tekst panelu');
    expect(AUTH_SLOGAN_TITLE).toBe('Faktury w KSeF bez stresu.');
    expect(AUTH_SLOGAN_TEXT).toBe('FLO pilnuje terminów, płatności i VAT‑u za Ciebie.');
    expect(html.split(AUTH_SLOGAN_TITLE).length - 1).toBe(2); // telefon + karta
    // Panel idzie za motywem: tło i tekst z tokenów, bez czerni i bieli na sztywno.
    expect(html).toContain('background-color:var(--background)');
    expect(html).not.toContain('text-white');
    expect(html).not.toContain('#F5F5F5');
    expect(html).not.toMatch(OLD_LOOK);
  });

  it('korzeń niesie ff-dashboard (skala SM i font presetu) i kontener portali', () => {
    const html = renderToStaticMarkup(
      <AuthSplitLayout panelTitle='a' panelText='b'>
        <p>x</p>
      </AuthSplitLayout>,
    );
    // Przed korzeniem React stawia tylko `<link rel="preload">` znaku (`priority`).
    expect(html.replace(/^<link[^>]*>/, '')).toMatch(/^<div class="ff-dashboard min-h-dvh/);
    expect(html).toContain('data-slot="portal-root"');
  });
});

describe('tło ze znaków (LetterGlitch z Finory)', () => {
  it('znaki zaczynają się od „zł”, dalej zestaw Finory bez rupii', () => {
    expect(AUTH_GLITCH_CHARACTERS.startsWith('zł')).toBe(true);
    expect(AUTH_GLITCH_CHARACTERS).toBe('zł€£¥₽₩₺₴₦₱₲₵₡₢₭');
    expect(AUTH_GLITCH_CHARACTERS).not.toContain('र');
  });

  it('kolory to --chart-1..3 presetu D2, a zapasowe hex to te same wartości', () => {
    expect([...AUTH_GLITCH_COLOR_VARS]).toEqual(['--chart-1', '--chart-2', '--chart-3']);
    const lightBlock = css.slice(css.indexOf('\n:root {\n  /* Plan Finora (D2'), css.indexOf('\n}', css.indexOf('\n:root {\n  /* Plan Finora (D2')));
    const darkBlock = css.slice(css.indexOf('\n.dark {\n'), css.indexOf('\n}', css.indexOf('\n.dark {\n')));
    const read = (block: string, name: string) => new RegExp(`${name}: (oklch\\([^)]+\\));`).exec(block)?.[1];
    const toHex = (value: string | undefined) => {
      const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value ?? '');
      if (!m) throw new Error(`nie oklch: ${value}`);
      const [l, c, h] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
      const a = c * Math.cos(h);
      const b = c * Math.sin(h);
      const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return '#' + [
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
      ]
        .map((x) => Math.min(1, Math.max(0, x)))
        .map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))
        .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
        .join('');
    };
    expect(AUTH_GLITCH_COLOR_VARS.map((v) => toHex(read(lightBlock, v)))).toEqual([...AUTH_GLITCH_FALLBACK.light]);
    expect(AUTH_GLITCH_COLOR_VARS.map((v) => toHex(read(darkBlock, v)))).toEqual([...AUTH_GLITCH_FALLBACK.dark]);
    // Zieleń Finory nie zostaje.
    expect(JSON.stringify(AUTH_GLITCH_FALLBACK)).not.toMatch(/5ee9b5|00bc7d|009966/);
  });

  it('kolor CSS → hex przez kanwę; nieznany zapis i pusty piksel dają null', () => {
    let style = '#000000';
    let pixel = [57, 129, 246, 255];
    const ctx = {
      get fillStyle() { return style; },
      set fillStyle(value: string) { if (/^(#|oklch\()/.test(value)) style = value.startsWith('#') ? value.toLowerCase() : value; },
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData: () => ({ data: pixel }),
    } as unknown as CanvasRenderingContext2D;
    expect(resolveCssColor(ctx, ' oklch(0.62 0.19 259.76) ')).toBe('#3981f6');
    expect(resolveCssColor(ctx, 'color(display-p3 1 0 0)')).toBeNull();
    expect(resolveCssColor(ctx, '')).toBeNull();
    pixel = [0, 0, 0, 0];
    expect(resolveCssColor(ctx, 'oklch(0.5 0 0)')).toBeNull();
    expect(pixelToHex([1, 2, 255, 255])).toBe('#0102ff');
    expect(hexToRgb('#3981f6')).toEqual({ r: 57, g: 129, b: 246 });
  });

  it('tło kontenera i winieta z koloru motywu; domyślnie zachowanie Finory', () => {
    const themed = renderToStaticMarkup(<AuthGlitchBackground />);
    expect(themed).toContain('background-color:var(--background)');
    expect(themed).toContain('color-mix(in oklab, var(--background) 90%, transparent)');
    expect(themed).toContain('aria-hidden="true"');
    expect(themed).not.toContain('#000000');

    const finora = renderToStaticMarkup(<LetterGlitch />);
    expect(finora).toContain('background-color:#000000');
    expect(outerVignetteBackground('#000000')).toContain('rgba(9, 11, 12, 0.5)');
  });
});

describe('logowanie (login/index.tsx Finory)', () => {
  it('kontrakt e2e: pola #email i #password, jeden przycisk „Zaloguj się”', async () => {
    const html = await login();
    expect(html).toContain('id="email"');
    expect(html).toContain('name="email"');
    expect(html).toContain('id="password"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(buttonsNamed(html, 'Zaloguj się')).toBe(1);
    expect(html).toMatch(/<h2[^>]*>Zaloguj się<\/h2>/);
  });

  it('teksty z P15: Google, „lub e‑mailem”, „Nie pamiętasz hasła?”, „Nie masz konta? Utwórz konto”', async () => {
    const html = await login();
    expect(html).toContain('Zaloguj przez Google');
    expect(html).toContain('lub e‑mailem');
    expect(html).toMatch(/href="\/forgot-password"[^>]*>Nie pamiętasz hasła\?<\/a>/);
    expect(html).toContain('Nie masz konta?');
    expect(html).toMatch(/href="\/register"[^>]*>Utwórz konto<\/a>/);
    expect(html).toContain('Witaj ponownie!');
  });

  it('wylatują Facebook i „Remember me”; brak angielskich tekstów Finory', async () => {
    const html = await login();
    expect(html).not.toMatch(/facebook/i);
    expect(html).not.toMatch(/remember|zapamiętaj/i);
    expect(html).not.toMatch(/Welcome|Login with|Sign in|Forgot Password|Create an account|Finora|Shadcn/);
    expect(html).not.toMatch(OLD_LOOK);
  });

  it('bez Google w GoTrue: bez przycisku i bez separatora', async () => {
    mocks.google.mockResolvedValue(false);
    const html = await login();
    expect(html).not.toContain('Zaloguj przez Google');
    expect(html).not.toContain('lub e‑mailem');
    expect(html).toContain('id="password"');
  });

  it('błąd ma role=alert, potwierdzenie role=status', async () => {
    const html = await login({ error: 'invalid_credentials', success: 'session_expired' });
    expect(html).toMatch(/role="alert"[^>]*data-tone="error"/);
    expect(html).toContain('Nieprawidłowy email lub hasło');
    expect(html).toMatch(/role="status"[^>]*data-tone="success"/);
    expect(html).toContain('Wylogowaliśmy Cię po godzinie bezczynności');
  });
});

describe('rejestracja (register/index.tsx Finory)', () => {
  it('kontrakt e2e: #email, #password, przycisk „Utwórz konto”', async () => {
    const html = await register();
    expect(html).toContain('id="email"');
    expect(html).toContain('id="password"');
    expect(html).toContain('minLength="12"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('id="name"');
    expect(buttonsNamed(html, 'Utwórz konto')).toBe(1);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Utwórz konto<\/button>/);
  });

  it('regulamin w miejscu pola zgody, odsyłacz do logowania, bez angielskich tekstów', async () => {
    const html = await register();
    expect(html).toContain('href="/legal/regulamin"');
    expect(html).toContain('href="/legal/polityka-prywatnosci"');
    expect(html).toMatch(/Masz już konto\?[\s\S]*href="\/login"[^>]*>Zaloguj się<\/a>/);
    expect(html).toContain('Zarejestruj przez Google');
    expect(html).not.toMatch(/Terms|Privacy Policy|Sign up|Already have|free trial/);
    expect(html).not.toMatch(OLD_LOOK);
  });

  it('wyłączona rejestracja: komunikat w układzie Finory, bez formularza', async () => {
    mocks.closed.mockResolvedValue(true);
    const html = await register();
    expect(html).toContain('Rejestracja nowych kont jest chwilowo wstrzymana');
    expect(html).toContain('max-lg:hidden');
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain('Google');
  });
});

describe('reset hasła (forgot-password/index.tsx Finory)', () => {
  it('pole #email, przycisk wysyłki, powrót do logowania', async () => {
    const html = await forgot();
    expect(html).toContain('id="email"');
    expect(html).toContain('maxLength="254"');
    expect(buttonsNamed(html, 'Wyślij link resetujący')).toBe(1);
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>[\s\S]*Wróć do logowania<\/a>/);
    expect(html).toMatch(/<h2[^>]*>Nie pamiętasz hasła\?<\/h2>/);
    expect(html).not.toMatch(/Back to login|Send Reset Link|No worries/);
  });

  it('potwierdzenie wysyłki jako role=status', async () => {
    const html = await forgot({ success: 'email_sent' });
    expect(html).toMatch(/role="status"[^>]*data-tone="success"/);
    expect(html).toContain('otrzymasz link do resetu hasła');
  });
});

describe('prymitywy ekranów logowania', () => {
  it('pole hasła z okiem przepuszcza atrybuty i ma polską etykietę przycisku', () => {
    const html = renderToStaticMarkup(
      <PasswordInput id='password' name='password' required minLength={12} autoComplete='new-password' />,
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('id="password"');
    expect(html).toContain('name="password"');
    expect(html).toContain('minLength="12"');
    expect(html).toContain('type="button"');
    expect(html).toContain('Pokaż hasło');
  });

  it('AuthMessage: błąd alert, potwierdzenie status', () => {
    expect(renderToStaticMarkup(<AuthMessage tone='error'>Błąd</AuthMessage>)).toMatch(/role="alert"/);
    expect(renderToStaticMarkup(<AuthMessage tone='success'>OK</AuthMessage>)).toMatch(/role="status"/);
  });

  it('ekran /auth/finish: karta Finory, bez dawnych klas landingu', () => {
    const html = renderToStaticMarkup(<FinishPage />);
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('Sprawdzam link…');
    expect(html).not.toMatch(OLD_LOOK);
  });
});

describe('onboarding i zaproszenie (styl kart P15)', () => {
  it('kreator: trzy zakładki z nazwami, NIP z przyciskiem w tym samym rodzicu', () => {
    const html = renderToStaticMarkup(<OnboardingForm />);
    for (const name of ['Załóż firmę', 'Mam zaproszenie', 'Poproś o dostęp']) {
      expect(html).toMatch(new RegExp(`role="tab"[^>]*aria-label="${name}"|aria-label="${name}"[^>]*role="tab"`));
    }
    // e2e: `#nip` → `..` → `getByRole('button')`.
    expect(html).toMatch(/data-slot="input-group"[^>]*>(?:(?!data-slot="input-group").)*id="nip"[\s\S]*?aria-label="Szukaj firmy w GUS"/);
    expect(html).toContain('Pomiń — uzupełnię NIP później');
    expect(html).not.toMatch(OLD_LOOK);
  });

  it('kreator z tokenem zaczyna od zakładki zaproszenia (pole #invite-token)', () => {
    const html = renderToStaticMarkup(<OnboardingForm initialInviteToken='synthetic-token' />);
    expect(html).toContain('id="invite-token"');
    expect(html).toContain('value="synthetic-token"');
  });

  it('źródło importu: bez certyfikatu odsyła do /settings/ksef, z certyfikatem Magiczny import', () => {
    const bez = renderToStaticMarkup(<ImportSourceSelector tenantId='t1' tenantName='Fixture Sp. z o.o.' hasCertificate={false} />);
    expect(bez).toContain('href="/settings/ksef"');
    expect(bez).toContain('Witaj, Fixture!');
    expect(bez).not.toContain('Magiczny Import z KSeF');
    const z = renderToStaticMarkup(<ImportSourceSelector tenantId='t1' tenantName='' hasCertificate />);
    expect(z).toContain('Magiczny Import z KSeF');
    expect(z).toContain('Witaj!');
    for (const html of [bez, z]) {
      expect(html).toContain('Fakturownia');
      expect(html).toContain('Pomiń — wejdę do aplikacji');
      expect(html).not.toMatch(OLD_LOOK);
      expect(html).not.toMatch(/emerald|purple/);
    }
  });

  it('Magiczny import: cztery zakresy, 6 miesięcy wybrane', () => {
    const html = renderToStaticMarkup(<MagicImportForm tenantId='t1' />);
    expect(html.match(/aria-pressed="(true|false)"/g)).toHaveLength(4);
    expect(html).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?6 miesięcy/);
    expect(html).toContain('href="/onboarding/import-source"');
    expect(html).not.toMatch(OLD_LOOK);
  });

  const job = (patch: Partial<ImportJobRow>): ImportJobRow => ({
    id: 'job-1', status: 'extracting', progress_percent: 40, progress_message: 'Pobieram faktury',
    source: 'ksef', invoices_found: 12, invoices_imported: 0, contractors_created: 0,
    contractors_updated: 0, products_created: 0, warnings: [],
    ...patch,
  } as ImportJobRow);

  it('postęp importu: w toku (belka), gotowe (liczby), błąd (komunikat)', () => {
    const running = renderToStaticMarkup(<ImportProgressView initialJob={job({})} />);
    expect(running).toContain('role="progressbar"');
    expect(running).toContain('aria-valuenow="40"');
    expect(running).toContain('width:40%');
    expect(running).toContain('Pobieram faktury');

    const done = renderToStaticMarkup(<ImportProgressView initialJob={job({
      status: 'completed', invoices_imported: 7, contractors_created: 2, contractors_updated: 1, products_created: 4,
    })} />);
    expect(done).toContain('Import zakończony!');
    expect(done).toMatch(/>7<\/p>/);
    expect(done).toMatch(/>3<\/p>/);
    expect(done).toMatch(/>4<\/p>/);

    const failed = renderToStaticMarkup(<ImportProgressView initialJob={job({ status: 'failed', progress_message: 'Brak certyfikatu' })} />);
    expect(failed).toContain('Import się nie udał');
    expect(failed).toMatch(/role="alert"[^>]*>Brak certyfikatu/);
    for (const html of [running, done, failed]) expect(html).not.toMatch(OLD_LOOK);
  });

  it('zaproszenie: przycisk „Dołącz do …”', () => {
    const html = renderToStaticMarkup(<InviteAcceptForm token='t' orgName='Fixture' />);
    expect(html).toContain('Dołącz do Fixture');
    expect(html).not.toMatch(OLD_LOOK);
  });
});

describe('przeniesione ekrany nie wracają do starego wyglądu', () => {
  it.each([
    'app/(auth)/login/page.tsx',
    'app/(auth)/register/page.tsx',
    'app/(auth)/forgot-password/page.tsx',
    'app/(auth)/reset-password/page.tsx',
    'app/(auth)/reset-password/reset-password-form.tsx',
    'app/(auth)/login/two-factor/page.tsx',
    'app/(auth)/login/two-factor/setup/page.tsx',
    'app/(auth)/gdpr/cancel/page.tsx',
    'app/(auth)/gdpr/cancel/cancel-form.tsx',
    'app/auth/finish/page.tsx',
    'app/onboarding/page.tsx',
    'app/onboarding/import-source/page.tsx',
    'app/onboarding/magic-import/page.tsx',
    'app/onboarding/progress/[jobId]/page.tsx',
    'app/invite/[token]/page.tsx',
    'components/onboarding/form.tsx',
    'components/onboarding/import-source-selector.tsx',
    'components/onboarding/magic-import-form.tsx',
    'components/onboarding/import-progress-view.tsx',
    'components/onboarding/file-import-dialog.tsx',
    'components/invite/invite-accept-form.tsx',
  ])('%s', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).not.toMatch(OLD_LOOK);
    expect(src).not.toContain('styles/zova.css');
    expect(src).not.toContain('auth-form-styles');
    expect(src).not.toContain('lucide-react');
  });
});
