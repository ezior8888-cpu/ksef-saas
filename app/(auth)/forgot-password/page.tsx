import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const labelClass = 'text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Reset hasła</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Wyślemy Ci link do ustawienia nowego hasła
        </p>
      </div>

      <form className="space-y-4">
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <Input id="email" name="email" type="email" required autoComplete="email"
                 placeholder="twoj@email.pl" />
        </div>
        <Button type="submit" variant="glass-primary" size="lg" className="w-full">
          Wyślij link resetujący
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:text-foreground/70 transition-colors">
          ← Powrót do logowania
        </Link>
      </p>
    </div>
  );
}
