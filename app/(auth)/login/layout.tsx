import { AuthPageShell } from '@/components/auth/auth-page-shell';

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthPageShell>{children}</AuthPageShell>;
}
