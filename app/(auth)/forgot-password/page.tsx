import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Reset hasła</CardTitle>
        <CardDescription>
          Funkcja będzie dostępna w kolejnej fazie.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className="text-sm text-primary hover:underline">
          ← Powrót do logowania
        </Link>
      </CardContent>
    </Card>
  );
}
