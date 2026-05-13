import { AuthPageShell } from '@/components/auth/auth-page-shell';

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthPageShell variant="legacy">{children}</AuthPageShell>;
}
