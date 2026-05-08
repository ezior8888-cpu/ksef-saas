import { redirect } from 'next/navigation';

/** Zgodność wsteczna: stary URL „Dashboard” pod `/reports` → kanoniczny `/dashboard`. */
export default function LegacyReportsRedirect() {
  redirect('/dashboard');
}
