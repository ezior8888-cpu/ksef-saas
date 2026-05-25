/** Trasy `(auth)/*` mają własny shell w pod-layoutach (`login`, `register`, …). */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
