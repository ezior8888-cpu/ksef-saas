import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RODO i bezpieczeństwo — KSeF SaaS',
};

export default function GdprPage() {
  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-6 prose prose-lg dark:prose-invert">
        <h1>RODO i bezpieczeństwo</h1>

        <h2>Compliance Checklist</h2>
        <ul>
          <li>
            ✅ <strong>Dane w UE</strong> — Frankfurt am Main (Hetzner, Vercel)
          </li>
          <li>
            ✅ <strong>Szyfrowanie at-rest</strong> — AES-256 (Supabase + R2)
          </li>
          <li>
            ✅ <strong>Szyfrowanie in-transit</strong> — TLS 1.3 dla wszystkich
            połączeń
          </li>
          <li>
            ✅ <strong>Eksport danych</strong> — pełny dostęp w formacie
            standardowym (30 dni)
          </li>
          <li>
            ✅ <strong>Prawo do bycia zapomnianym</strong> — usuwanie wszystkich
            danych w 30 dni od żądania
          </li>
          <li>
            ✅ <strong>Audit logs</strong> — kto i kiedy uzyskał dostęp do
            Twoich danych
          </li>
          <li>
            ✅ <strong>Standard Contractual Clauses</strong> z każdym US-based
            subprocesorem
          </li>
          <li>
            ✅ <strong>Brak cookies analitycznych</strong> — szanujemy prywatność
          </li>
          <li>
            ✅ <strong>2FA</strong> dla kont (opcjonalnie, polecane)
          </li>
        </ul>

        <h2>Data Processing Agreement (DPA)</h2>
        <p>
          Jako podmiot przetwarzający Twoje dane, oferujemy DPA dla każdej
          umowy. Pobierz pdf z{' '}
          <a href="mailto:legal@ksef-saas.pl">legal@ksef-saas.pl</a>.
        </p>

        <h2>Incydenty bezpieczeństwa</h2>
        <p>
          W przypadku naruszenia Twoich danych powiadomimy Cię w ciągu{' '}
          <strong>72 godzin</strong> (zgodnie z art. 33 RODO).
        </p>

        <h2>Kontakt RODO</h2>
        <p>
          Email: <a href="mailto:privacy@ksef-saas.pl">privacy@ksef-saas.pl</a>
        </p>
      </div>
    </article>
  );
}
