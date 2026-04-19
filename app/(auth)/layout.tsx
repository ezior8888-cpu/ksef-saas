export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">KSeF SaaS</h1>
          <p className="text-sm text-muted-foreground">
            Fakturowanie zgodne z KSeF 2.0
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
