import Link from 'next/link';

/** An incomplete active-company profile must not create a second organization. */
export function SellerProfileBlock() {
  return (
    <div role="alert" className="max-w-2xl space-y-4 rounded-xl border border-border p-6">
      <h1 className="text-xl font-semibold">Wystawianie faktury jest wstrzymane</h1>
      <p className="text-sm text-muted-foreground">
        Nie możemy potwierdzić pełnych danych sprzedawcy aktywnej firmy.
        Sprawdź nazwę, NIP i adres w ustawieniach. Jeśli dane są niepełne lub błędne,
        skontaktuj się z administratorem, aby poprawić profil istniejącej firmy.
      </p>
      <Link href="/settings" className="inline-block text-sm font-medium underline">
        Sprawdź dane firmy
      </Link>
    </div>
  );
}
