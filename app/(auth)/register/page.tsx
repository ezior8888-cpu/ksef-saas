// Plan Finora P15 (E10b): `src/views/pages/auth/register/index.tsx` +
// `register-form.tsx` szablonu. Układ i klasy 1:1; logika nasza i bez zmian:
// `signupWithEmail`, Google przez `loginWithGoogle` (tylko przy włączonym
// Google w GoTrue), Turnstile, wyłącznik `/wylacz rejestracja` (AUD-63).
// W miejscu pola zgody Finory („I agree to all Terms…”) stoją dwa pola
// z pakietu prawnego (#264): akceptacja Regulaminu i Umowy powierzenia
// (wymagana, akcja zapisuje ją razem z wersją brzmienia) i dobrowolna zgoda
// na e-maile z poradami i ofertami.

// Next Imports
import Link from 'next/link'

// Component Imports
import { AuthMessage } from '@/components/auth/finora/auth-message'
import { AuthSplitLayout } from '@/components/auth/finora/auth-split-layout'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { GoogleIcon } from '@/components/auth/finora/google-icon'
import { PasswordInput } from '@/components/auth/finora/password-input'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { LegalInline } from '@/components/legal/legal-document'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

// Lib Imports
import { isGoogleLoginEnabled } from '@/lib/auth/oauth-providers'
import { isSignupClosed, SIGNUPS_CLOSED_MESSAGE } from '@/lib/feature-flags/signups'
import { MARKETING_STATEMENT, TERMS_STATEMENT } from '@/lib/legal/versions'

import { loginWithGoogle } from '../login/actions'
import { signupWithEmail } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Wypełnij wszystkie pola.',
  weak_password:
    'Hasło musi mieć min. 12 znaków, zawierać małą i dużą literę, cyfrę oraz znak specjalny.',
  password_breached:
    'To hasło pojawiło się w znanych wyciekach danych. Wybierz inne — najlepiej passphrase z 4-5 losowych słów.',
  rate_limited:
    'Zbyt wiele prób rejestracji z tego urządzenia. Poczekaj kilka minut i spróbuj ponownie.',
  bot_check_failed:
    'Nie udało się potwierdzić, że nie jesteś botem. Odśwież stronę i spróbuj ponownie.',
  'email rate limit exceeded':
    'Przekroczono limit wysyłki maili. Poczekaj kilka minut i spróbuj ponownie.',
  signups_disabled: SIGNUPS_CLOSED_MESSAGE,
  terms_required:
    'Aby założyć konto, zaakceptuj Regulamin i Umowę powierzenia (pierwsze pole wyboru).',
}

const PANEL_TITLE = 'Załóż konto i wystaw pierwszą fakturę'
const PANEL_TEXT =
  'Po rejestracji podasz NIP, a dane firmy pobierzemy z GUS. Certyfikat KSeF dodasz w ustawieniach, kiedy będziesz gotowy.'

/** Odnośniki w treści oświadczeń — kolor tekstu jak odsyłacze Finory, z podkreśleniem, bo stoją w zdaniu. */
const LEGAL_LINK_CLASS = 'text-foreground underline underline-offset-2 hover:text-primary'

function LoginLink() {
  return (
    <p className='text-muted-foreground'>
      Masz już konto?{' '}
      <Link href='/login' className='text-foreground hover:underline'>
        Zaloguj się
      </Link>
    </p>
  )
}

/**
 * Odnośniki do dokumentów pod formularzem (do E10b stopka dawnego układu
 * stron logowania, pakiet prawny #264). Akceptację zbiera pole wyboru
 * w formularzu i bramka /onboarding/zgody — tu tylko odnośniki. Polityki
 * prywatności się nie „akceptuje”: to informacja (art. 13 RODO).
 */
function LegalDocumentsLinks() {
  return (
    <p className='text-sm text-muted-foreground'>
      Dokumenty:{' '}
      <Link href='/legal/regulamin' className='underline underline-offset-2 hover:text-foreground'>
        Regulamin
      </Link>
      {' · '}
      <Link href='/legal/umowa-powierzenia' className='underline underline-offset-2 hover:text-foreground'>
        Umowa powierzenia
      </Link>
      {' · '}
      <Link href='/legal/polityka-prywatnosci' className='underline underline-offset-2 hover:text-foreground'>
        Polityka prywatności
      </Link>
    </p>
  )
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; retry?: string }>
}) {
  const { error, retry } = await searchParams
  const retryMinutes = retry ? Math.ceil(Number(retry) / 60) : null
  const errorMsg = error
    ? error === 'rate_limited' && retryMinutes
      ? `Zbyt wiele prób rejestracji. Spróbuj ponownie za ~${retryMinutes} min.`
      : (ERROR_MESSAGES[error] ?? error)
    : null

  // Wyłącznik `/wylacz rejestracja`: bez formularza i bez Google, bo pierwsze
  // logowanie Google zakłada konto.
  if (await isSignupClosed()) {
    return (
      <AuthSplitLayout panelTitle={PANEL_TITLE} panelText={PANEL_TEXT}>
        <div>
          <h2 className='mb-2 text-2xl font-semibold'>Utwórz konto</h2>
        </div>
        <AuthMessage tone='error'>{SIGNUPS_CLOSED_MESSAGE}</AuthMessage>
        <LoginLink />
        <LegalDocumentsLinks />
      </AuthSplitLayout>
    )
  }

  const googleEnabled = await isGoogleLoginEnabled()

  return (
    <AuthSplitLayout panelTitle={PANEL_TITLE} panelText={PANEL_TEXT}>
      <div>
        <h2 className='mb-2 text-2xl font-semibold'>Utwórz konto</h2>
        <p className='text-muted-foreground'>Pierwsza faktura w 5 minut</p>
      </div>

      {errorMsg && <AuthMessage tone='error'>{errorMsg}</AuthMessage>}

      {googleEnabled && (
        <>
          <form action={loginWithGoogle}>
            <Button type='submit' variant='outline' className='w-full'>
              <GoogleIcon />
              Zarejestruj przez Google
            </Button>
            {/* Konto z Google powstaje bez naszego formularza — wyraźną
                akceptację zbiera bramka /onboarding/zgody
                (lib/legal/acceptance.ts), gdy dokumenty przestaną być wersją
                roboczą. */}
            <p className='mt-2 text-center text-xs/relaxed text-muted-foreground'>
              Rejestrując się przez Google, akceptujesz{' '}
              <LegalInline
                text='[Regulamin](/legal/regulamin) i [Umowę powierzenia](/legal/umowa-powierzenia) oraz potwierdzasz zapoznanie się z [Polityką prywatności](/legal/polityka-prywatnosci).'
                linkClassName={LEGAL_LINK_CLASS}
              />
            </p>
          </form>

          <div className='flex items-center gap-4'>
            <Separator className='flex-1' />
            <p>lub</p>
            <Separator className='flex-1' />
          </div>
        </>
      )}

      <div className='space-y-4'>
        <form action={signupWithEmail}>
          <FieldGroup className='gap-4'>
            {/* Name */}
            <Field className='gap-2'>
              <FieldLabel className='leading-5' htmlFor='name'>
                Imię i nazwisko*
              </FieldLabel>
              <Input
                type='text'
                id='name'
                name='name'
                required
                autoComplete='name'
                placeholder='Wpisz imię i nazwisko'
              />
            </Field>
            {/* Email */}
            <Field className='gap-2'>
              <FieldLabel className='leading-5' htmlFor='email'>
                Adres e‑mail*
              </FieldLabel>
              <Input
                type='email'
                id='email'
                name='email'
                required
                autoComplete='email'
                placeholder='Wpisz adres e‑mail'
              />
            </Field>
            {/* Password */}
            <Field className='w-full gap-2'>
              <FieldLabel className='leading-5' htmlFor='password'>
                Hasło*
              </FieldLabel>
              <PasswordInput
                id='password'
                name='password'
                required
                minLength={12}
                autoComplete='new-password'
                aria-describedby='password-hint'
              />
              <FieldDescription id='password-hint'>
                Min. 12 znaków, mała + duża litera, cyfra, znak specjalny. Sprawdzamy w bazie wycieków.
              </FieldDescription>
            </Field>
            {/* Zgody — w miejscu pola zgody Finory. Pierwsze pole obowiązkowe
                (sprawdza je też serwer), drugie dobrowolne i domyślnie
                odznaczone (art. 7 RODO, art. 398 PKE). Brzmienie
                z lib/legal/versions.ts — to samo trafia do zapisu.
                Natywne pole wyboru zamiast `Checkbox` z components/ui:
                `required` i wartość `on` działają w przeglądarce bez
                skryptów, a akcja czyta `terms`/`marketing` z FormData. */}
            <Field className='gap-2'>
              <div className='flex items-start gap-2'>
                <input
                  type='checkbox'
                  id='terms'
                  name='terms'
                  value='on'
                  required
                  className='mt-0.5 size-4 shrink-0 accent-primary'
                />
                <FieldLabel htmlFor='terms' className='block w-auto leading-relaxed text-muted-foreground'>
                  <LegalInline text={TERMS_STATEMENT.text} linkClassName={LEGAL_LINK_CLASS} /> (wymagane)
                </FieldLabel>
              </div>
            </Field>
            <Field className='gap-2'>
              <div className='flex items-start gap-2'>
                <input
                  type='checkbox'
                  id='marketing'
                  name='marketing'
                  value='on'
                  className='mt-0.5 size-4 shrink-0 accent-primary'
                />
                <FieldLabel htmlFor='marketing' className='block w-auto leading-relaxed text-muted-foreground'>
                  {MARKETING_STATEMENT.text} (dobrowolne)
                </FieldLabel>
              </div>
            </Field>
            <TurnstileWidget action='register' theme='light' />
            <Field>
              <Button className='w-full' type='submit'>
                Utwórz konto
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <LoginLink />
        <LegalDocumentsLinks />
      </div>
    </AuthSplitLayout>
  )
}
