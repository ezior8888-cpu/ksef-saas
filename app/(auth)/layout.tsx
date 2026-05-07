import Image from 'next/image';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Panel logowania zawsze w trybie ciemnym (Zmienne z .dark cascade do dzieci).
  return (
    <div className="dark min-h-screen bg-mesh-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/14 bg-[rgba(15,10,30,0.62)] backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-10">
          <div className="mb-8 text-center">
            <Image
              src="/brand/faktflow-logo.png"
              alt="FaktFlow"
              width={48}
              height={48}
              className="mx-auto mb-4 h-12 w-12 rounded-2xl object-contain bg-white/10 shadow-glass"
              priority
            />
            <h1 className="text-3xl font-semibold tracking-tight text-white">
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
