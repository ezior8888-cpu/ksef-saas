/**
 * Skórę wizualną nakładamy tylko tutaj (wrapper + reguły w `globals.css`),
 * bez zmiany logiki stron ani drugiego pełnoekranowego mesh / `ff-dashboard`
 * (unik „czarnego ekranu” i podwójnego compositingu).
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ff-settings-route w-full min-w-0 max-w-4xl">{children}</div>
  );
}
