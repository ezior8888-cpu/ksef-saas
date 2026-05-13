import { AuthPageShell } from '@/components/auth/auth-page-shell';

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthPageShell variant="dashboard">{children}</AuthPageShell>;
}
