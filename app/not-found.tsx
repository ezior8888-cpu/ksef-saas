import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/62 dark:bg-[rgba(15,10,30,0.62)] backdrop-blur-[40px] shadow-[0_16px_48px_0_rgba(31,38,135,0.12)] p-10 max-w-md text-center space-y-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/5">
          <Compass className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">404</h1>
          <h2 className="text-xl font-medium">Nie znaleziono strony</h2>
          <p className="text-muted-foreground text-sm">
            Strona, której szukasz, nie istnieje lub została przeniesiona.
          </p>
        </div>
        <Link href="/">
          <Button variant="glass-primary" size="lg">
            Strona główna
          </Button>
        </Link>
      </div>
    </div>
  );
}
