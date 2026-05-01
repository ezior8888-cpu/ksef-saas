export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mesh-light dark:bg-mesh-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/55 dark:border-white/14 bg-white/62 dark:bg-[rgba(15,10,30,0.62)] backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-10">
          <div className="mb-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background font-bold text-lg mb-4 shadow-glass">
              K
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              KSeF SaaS
            </h1>
          </div>
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Akceptując kontynuujesz Regulamin i Politykę Prywatności
        </p>
      </div>
    </div>
  );
}
