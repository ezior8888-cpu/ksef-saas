import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Regulamin KSeF SaaS',
};

export default function TermsPage() {
  return (
    <article className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-6 prose prose-lg dark:prose-invert">
        <h1>Regulamin świadczenia usług</h1>
        <p>Ostatnia aktualizacja: 1 maja 2026</p>

        <h2>§1. Postanowienia ogólne</h2>
        <p>
          1. Niniejszy Regulamin określa zasady korzystania z usługi KSeF SaaS
          świadczonej przez [nazwa firmy], NIP [TWÓJ_NIP], z siedzibą w Poznaniu
          (zwaną dalej &quot;Usługodawcą&quot;).
        </p>
        <p>
          2. Usługa polega na udostępnieniu narzędzia online do wystawiania,
          odbierania i archiwizowania faktur VAT zgodnych z polskim Krajowym
          Systemem e-Faktur (KSeF).
        </p>

        <h2>§2. Definicje</h2>
        <ul>
          <li>
            <strong>KSeF</strong> — Krajowy System e-Faktur prowadzony przez
            Ministerstwo Finansów
          </li>
          <li>
            <strong>Usługa</strong> — KSeF SaaS dostępny pod adresem ksef-saas.pl
          </li>
          <li>
            <strong>Użytkownik</strong> — osoba fizyczna lub prawna korzystająca z
            Usługi
          </li>
          <li>
            <strong>Konto</strong> — indywidualny profil Użytkownika
          </li>
          <li>
            <strong>Trial</strong> — 30-dniowy okres bezpłatnego testowania
          </li>
        </ul>

        <h2>§3. Rejestracja i Konto</h2>
        <p>1. Rejestracja jest bezpłatna i wymaga podania adresu email.</p>
        <p>
          2. Konto może założyć osoba fizyczna pełnoletnia lub osoba prawna.
        </p>
        <p>
          3. Trial trwa 30 dni od daty rejestracji. Nie wymaga podania danych
          płatniczych.
        </p>

        <h2>§4. Płatności</h2>
        <p>
          1. Płatności przyjmujemy przez Stripe (rozliczenie w EUR przeliczane na
          PLN po kursie dziennym NBP).
        </p>
        <p>
          2. Subskrypcja roczna: 588 PLN brutto (49 zł/mc · 12). Subskrypcja
          miesięczna: 59 zł brutto/mc.
        </p>
        <p>
          3. <strong>60-day money-back guarantee:</strong> w ciągu 60 dni od
          pierwszej płatności Użytkownik może żądać pełnego zwrotu.
        </p>

        <h2>§5. Odpowiedzialność</h2>
        <p>
          1. Usługodawca dokłada starań, aby Usługa była dostępna 99.9% czasu.
          SLA dostępność liczona miesięcznie.
        </p>
        <p>
          2. Usługodawca nie ponosi odpowiedzialności za przerwy w działaniu KSeF
          (system Ministerstwa Finansów).
        </p>
        <p>
          3. <strong>Limit odpowiedzialności:</strong> wartość 12 ostatnich
          miesięcznych opłat za subskrypcję.
        </p>

        <h2>§6. Dane Użytkownika</h2>
        <p>
          1. Dane (faktury, kontrahenci) hostowane są w centrum danych Hetzner,
          Frankfurt (Niemcy), w ramach EU.
        </p>
        <p>
          2. Po anulowaniu subskrypcji dane są dostępne do eksportu przez 30
          dni, po czym są permanentnie usuwane.
        </p>
        <p>
          3. Zgodnie z polskim prawem, faktury są archiwizowane przez 10 lat (na
          koszt Usługodawcy w okresie trwania subskrypcji).
        </p>

        <h2>§7. Postanowienia końcowe</h2>
        <p>
          1. W sprawach nieuregulowanych Regulaminem stosuje się polskie prawo.
        </p>
        <p>
          2. Spory rozstrzyga sąd właściwy dla siedziby Usługodawcy (Poznań).
        </p>
        <p>3. Kontakt: support@ksef-saas.pl</p>
      </div>
    </article>
  );
}
