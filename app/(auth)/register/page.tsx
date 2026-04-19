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
import { signupWithEmail, loginWithGoogle } from '../login/actions';

const ERROR_MESSAGES: Record<string, string> = {
  weak_password: 'Hasło musi mieć co najmniej 8 znaków.',
  'email rate limit exceeded':
    'Przekroczono limit wysyłki maili. Poczekaj kilka minut i spróbuj ponownie.',
};

function getErrorMessage(error: string): string {
  return ERROR_MESSAGES[error] ?? error;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMsg = error ? getErrorMessage(error) : null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Zarejestruj się</CardTitle>
        <CardDescription>
          Utwórz darmowe konto KSeF SaaS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMsg && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        <form action={loginWithGoogle}>
          <Button type="submit" variant="outline" className="w-full">
            Zarejestruj przez Google
          </Button>
        </form>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            LUB EMAIL
          </span>
        </div>

        <form action={signupWithEmail} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Imię i nazwisko</Label>
            <Input id="name" name="name" type="text" required autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Hasło (min. 8 znaków)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full">
            Utwórz konto
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Masz już konto?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Zaloguj się
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          Rejestrując się akceptujesz{' '}
          <Link href="/terms" className="underline">regulamin</Link>
          {' '}i{' '}
          <Link href="/privacy" className="underline">politykę prywatności</Link>
        </p>
      </CardContent>
    </Card>
  );
}
