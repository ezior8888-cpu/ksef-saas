import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { loginWithEmail, loginWithGoogle } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Wypełnij email i hasło.',
  invalid_credentials:
    'Nieprawidłowy email lub hasło. Upewnij się, że email jest potwierdzony.',
  oauth_failed: 'Nie udało się zalogować przez Google. Spróbuj ponownie.',
  auth_callback_failed:
    'Link z maila wygasł lub był już użyty. Zarejestruj się ponownie albo poproś o nowy link.',
};

const SUCCESS_MESSAGES: Record<string, string> = {
  check_email:
    'Konto utworzone! Sprawdź swoją skrzynkę pocztową — wysłaliśmy link aktywacyjny.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; redirect?: string }>;
}) {
  const { error, success } = await searchParams;
  const errorMsg = error ? ERROR_MESSAGES[error] ?? error : null;
  const successMsg = success ? SUCCESS_MESSAGES[success] ?? null : null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Zaloguj się</CardTitle>
        <CardDescription>
          Zaloguj się do swojego konta KSeF SaaS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {successMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-100">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        {/* Google OAuth */}
        <form action={loginWithGoogle}>
          <Button type="submit" variant="outline" className="w-full">
            Zaloguj przez Google
          </Button>
        </form>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            LUB EMAIL
          </span>
        </div>

        {/* Email + hasło */}
        <form action={loginWithEmail} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Hasło</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:underline"
              >
                Zapomniałeś hasła?
              </Link>
            </div>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full">
            Zaloguj się
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Nie masz konta?{' '}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            Zarejestruj się
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
