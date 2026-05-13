import type { Metadata } from 'next';

// Faza 22: polityka prywatności — dokument prawny, cache na dobę.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Polityka prywatności KSeF SaaS',
};

export default function PrivacyPage() {
  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-6 prose prose-lg dark:prose-invert">
        <h1>Polityka prywatności</h1>
        <p>Ostatnia aktualizacja: 1 maja 2026</p>

        <h2>1. Administrator danych</h2>
        <p>
          Administratorem Twoich danych osobowych jest [nazwa firmy], NIP
          [TWÓJ_NIP], z siedzibą w Poznaniu.
        </p>
        <p>Email kontaktowy w sprawach RODO: privacy@ksef-saas.pl</p>

        <h2>2. Jakie dane zbieramy</h2>
        <p>
          <strong>Przy rejestracji:</strong>
        </p>
        <ul>
          <li>Email (login)</li>
          <li>Hasło (hashowane bcrypt)</li>
          <li>Imię (opcjonalnie)</li>
        </ul>
        <p>
          <strong>Przy korzystaniu z usługi:</strong>
        </p>
        <ul>
          <li>Dane firmy (NIP, nazwa, adres)</li>
          <li>Faktury (sprzedażowe + zakupowe)</li>
          <li>Kontrahenci (NIP, nazwa, adres)</li>
          <li>Logi audit (kiedy i co zrobiłeś — do diagnostyki)</li>
        </ul>
        <p>
          <strong>Automatycznie zbierane:</strong>
        </p>
        <ul>
          <li>IP address (do bezpieczeństwa)</li>
          <li>User agent (do diagnostyki)</li>
          <li>Cookies (sesja, preferencje)</li>
        </ul>

        <h2>3. Cele przetwarzania (art. 6 RODO)</h2>
        <ul>
          <li>
            <strong>Wykonanie umowy</strong> (art. 6 ust. 1 lit. b) — świadczenie
            usługi
          </li>
          <li>
            <strong>Obowiązek prawny</strong> (art. 6 ust. 1 lit. c) —
            archiwizacja faktur 10 lat
          </li>
          <li>
            <strong>Uzasadniony interes</strong> (art. 6 ust. 1 lit. f) —
            bezpieczeństwo, zapobieganie nadużyciom
          </li>
        </ul>

        <h2>4. Gdzie są Twoje dane</h2>
        <p>
          Centrum danych: <strong>Hetzner, Frankfurt am Main, Niemcy</strong>.
          Wszystkie dane pozostają w UE.
        </p>
        <p>Backup: AWS Glacier, Frankfurt (eu-central-1).</p>

        <h2>5. Procesory danych (subprocesorzy)</h2>
        <p>Korzystamy z następujących dostawców:</p>
        <ul>
          <li>
            <strong>Supabase</strong> (Frankfurt) — baza danych
          </li>
          <li>
            <strong>Cloudflare R2</strong> (EU) — storage plików
          </li>
          <li>
            <strong>Vercel</strong> (Frankfurt) — hosting aplikacji
          </li>
          <li>
            <strong>Resend</strong> (US, Standard Contractual Clauses) — wysyłka
            emaili
          </li>
          <li>
            <strong>Anthropic</strong> (US, Standard Contractual Clauses) — OCR
            (zdjęcia paragonów są przesyłane do API tylko podczas rozpoznawania,
            nie są przechowywane przez Anthropic)
          </li>
          <li>
            <strong>Stripe</strong> (US, Standard Contractual Clauses) — płatności
          </li>
          <li>
            <strong>Inngest</strong> (US, Standard Contractual Clauses) — kolejki
            zadań
          </li>
          <li>
            <strong>Sentry</strong> (Frankfurt) — error tracking
          </li>
        </ul>

        <h2>6. Twoje prawa</h2>
        <p>Masz prawo do:</p>
        <ul>
          <li>Dostępu do swoich danych (export pełnych danych w 30 dni)</li>
          <li>Sprostowania błędnych danych</li>
          <li>Usunięcia danych (&quot;prawo do bycia zapomnianym&quot;)</li>
          <li>Ograniczenia przetwarzania</li>
          <li>Przenoszenia danych (export w formacie JSON / CSV / JPK_FA)</li>
          <li>Sprzeciwu (możesz w każdej chwili zrezygnować)</li>
          <li>Skargi do Prezesa UODO (uodo.gov.pl)</li>
        </ul>
        <p>Wniosek do realizacji prawa: privacy@ksef-saas.pl</p>

        <h2>7. Okres przechowywania</h2>
        <ul>
          <li>Dane konta: do 30 dni po anulowaniu subskrypcji</li>
          <li>Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)</li>
          <li>Logi audit: 12 miesięcy</li>
          <li>Cookies sesji: do końca sesji (browser close)</li>
          <li>Cookies preferencji: 1 rok</li>
        </ul>

        <h2>8. Cookies</h2>
        <p>
          Używamy <strong>tylko niezbędnych</strong> cookies (sesja, preferencje
          motywu). Brak cookies analitycznych ani marketingowych — mamy
          GDPR-friendly approach.
        </p>
      </div>
    </article>
  );
}
