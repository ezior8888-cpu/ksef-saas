/**
 * Skóra tras `/invoices/*` (jak `/settings/*`): wrapper + reguły w `globals.css`.
 * Bez drugiego mesh / pełnoekranowego `ff-dashboard`.
 */
export default function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ff-invoices-route w-full min-w-0">{children}</div>
  );
}
