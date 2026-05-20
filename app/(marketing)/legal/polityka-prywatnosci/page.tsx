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
        <p>Ostatnia aktualizacja: 9 maja 2026</p>

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
        <p>
          <strong>Bezpieczeństwo konta (gdy funkcje są włączone w danej wersji
          serwisu):</strong> możemy zbierać token weryfikacji Cloudflare Turnstile
          oraz — wyłącznie po stronie serwera — przetwarzać skrót hasła w celu
          porównania z bazą wycieków (Have I Been Pwned); szczegóły w sekcjach 6–8.
        </p>

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
            <strong>Cloudflare Turnstile</strong> (USA, Standard Contractual Clauses
            tam gdzie ma zastosowanie) — opcjonalna weryfikacja „człowiek vs bot” na
            wybranych formularzach (np. logowanie, rejestracja, reset hasła). Do
            Cloudflare trafia token weryfikacyjny z przeglądarki; serwis
            aplikacji weryfikuje go po stronie backendu. Pełne hasło i inne pola
            formularza nie są przekazywane do Cloudflare w ramach Turnstile.
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

        <h2>6. Weryfikacja dwuetapowa (2FA) i kody ratunkowe</h2>
        <p>
          Tam gdzie udostępniamy w ustawieniach konta moduł <strong>2FA</strong>,
          możesz włączyć opcjonalny drugi składnik logowania w standardzie{' '}
          <strong>TOTP</strong> (RFC 6238, np. Google Authenticator, 1Password,
          Authy). Przy włączeniu generowane są <strong>kody ratunkowe</strong>{' '}
          (jednorazowe) na wypadek utraty dostępu do aplikacji TOTP. Kody są
          przechowywane wyłącznie w postaci zahashowanej; sam kod pokazywany jest
          tylko raz w interfejsie. Wyłączenie 2FA wymaga potwierdzenia tożsamości
          (np. hasłem) zgodnie z ekranem ustawień.
        </p>

        <h2>7. Hasła a znane wycieki (Have I Been Pwned, k-anonymity)</h2>
        <p>
          Przy <strong>rejestracji lub zmianie hasła</strong> możemy sprawdzić,
          czy hasło nie występuje w publicznej bazie znanych wycieków, korzystając
          z API{' '}
          <a href="https://haveibeenpwned.com/Passwords" rel="noopener noreferrer">
            Pwned Passwords
          </a>{' '}
          (projekt Have I Been Pwned). Stosujemy model{' '}
          <strong>k-anonymity</strong>: do serwisu HIBP wysyłany jest wyłącznie
          prefix skrótu kryptograficznego hasła (SHA-1), a <strong>pełne hasło
          nie opuszcza naszych serwerów</strong> i nie jest przesyłane do HIBP w
          postaci jawnej. Jeśli sprawdzenie nie powiedzie się (np. timeout),
          możemy dopuścić rejestrację przy zachowaniu innych reguł siły hasła —
          szczegóły techniczne nie wpływają na zakres danych osobowych
          przetwarzanych poza samym hasłem zapisanym u dostawcy tożsamości
          (Supabase Auth) w formie hash.
        </p>

        <h2>8. Ochrona przed botami (Cloudflare Turnstile)</h2>
        <p>
          Na wybranych publicznych formularzach możemy wyświetlać widget{' '}
          <strong>Cloudflare Turnstile</strong>. Przetwarzane są dane techniczne
          niezbędne do oceny ryzyka botowego (w rozumieniu polityki Cloudflare).
          Turnstile traktujemy jako <strong>subprocessora</strong> Cloudflare —
          patrz lista w sekcji 5.
        </p>

        <h2>9. Prawo do bycia zapomnianym — przebieg żądania usunięcia</h2>
        <p>
          W sprawach <strong>art. 17 RODO</strong> (usunięcie danych nieobjętych
          dalszym obowiązkiem prawnym) możesz złożyć wniosek na adres{' '}
          <strong>privacy@ksef-saas.pl</strong>. Dla <strong>usunięcia konta /
          organizacji z poziomu aplikacji</strong> (właściciel, po weryfikacji
          m.in. NIP) zapisujemy moment żądania oraz termin <strong>twardego
          usunięcia</strong> danych podlegających skasowaniu —{' '}
          <strong>obecnie jest to 30 dni</strong> od zapisania żądania (okres
          odstąpienia / możliwość kontaktu z pomocą techniczną w celu anulowania
          przed upływem terminu). Po upływie tego okresu dane użytkownika i
          powiązane rekordy w zakresie objętym usuwaniem są usuwane zgodnie z
          logiką aplikacji i bazą danych.
        </p>
        <p>
          <strong>Faktury i inne dane z 10-letnią retencją</strong> (np. wynikającą
          z przepisów o archiwizacji JPK / e-faktur) mogą zostać zachowane w
          formie wymaganej przepisami nawet po usunięciu konta — wtedy ograniczamy
          się do minimum niezbędnego do spełnienia obowiązku prawnego.
        </p>
        <p>
          <strong>Dziennik audytu:</strong> po usunięciu konta, tam gdzie jest to
          technicznie możliwe i zgodne z wymogiem nienaruszalności śladu
          zdarzeń, wpisy powiązane z Twoim identyfikatorem użytkownika mogą zostać{' '}
          <strong>zanonimizowane</strong> (usunięcie lub zastąpienie danych
          identyfikujących przy zachowaniu faktu wystąpienia zdarzenia). Szczegóły
          w sekcji 11.
        </p>
        <p>
          <em>Uwaga planistyczna:</em> dokumentujemy też model{' '}
          <strong>14-dniowego cooling-off</strong> jako docelowy standard dla
          części ścieżek samoobsługowych — gdy pełna implementacja 14 dni zostanie
          wdrożona w interfejsie, niniejsza sekcja zostanie zaktualizowana tak,
          aby liczba dni w UI i w polityce była spójna.
        </p>

        <h2>10. Twoje prawa</h2>
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

        <h2>11. Dzienniki audytu (retencja, tryb dopisywania, anonimizacja)</h2>
        <p>
          Prowadzimy <strong>dziennik audytu</strong> (kto i kiedy wykonał istotne
          operacje w systemie). Z poziomu zwykłego konta użytkownika dostępny jest{' '}
          <strong>odczyt</strong> wpisów dla Twojej organizacji; <strong>nie
          możesz samodzielnie modyfikować ani usuwać</strong> wpisów audytu z UI
          (zapobiega to fałszowaniu historii). Wpisy dodawane są przez backend
          (np. Server Actions, zadania w tle) z uprawnieniami serwisowymi —
          model <strong>append-only</strong> z perspektywy użytkownika aplikacji.
        </p>
        <p>
          <strong>Retencja:</strong> wpisy starsze niż <strong>12 miesięcy</strong>{' '}
          mogą być usuwane przez automatyczne zadanie czyszczące, zgodnie z
          konfiguracją bazy (minimalny okres retencji technicznej jest egzekwowany
          po stronie serwera bazy danych).
        </p>
        <p>
          Po skutecznym żądaniu usunięcia danych osobowych (patrz sekcja 9)
          powiązane wpisy audytu mogą zostać <strong>zanonimizowane</strong>, aby
          nie zawierały identyfikatorów umożliwiających identyfikację osoby, o ile
          pozwala na to architektura systemu i obowiązujące przepisy.
        </p>

        <h2>12. Okres przechowywania</h2>
        <ul>
          <li>Dane konta: do 30 dni po anulowaniu subskrypcji</li>
          <li>Faktury: 10 lat (obowiązek prawny — art. 70 § 1 OP)</li>
          <li>Logi audit: 12 miesięcy</li>
          <li>Cookies sesji: do końca sesji (browser close)</li>
          <li>Cookies preferencji: 1 rok</li>
        </ul>

        <h2>13. Cookies i analityka</h2>
        <p>
          Używamy <strong>niezbędnych</strong> cookies (sesja, preferencje
          motywu) oraz — po wyrażeniu zgody — narzędzia analityki produktowej
          (PostHog, przetwarzanie w regionie UE). Domyślnie analityka
          kliencka jest wyłączona; zapis decyzji o zgodzie trzymamy w{' '}
          <strong>localStorage</strong> przeglądarki (bez profilowania
          reklamowego). Zdarzenia o znaczeniu biznesowym mogą być rejestrowane
          po stronie serwera w modelu uzasadnionego interesu administratora,
          z pseudonimizacją — zgodnie z opisem w dokumentacji technicznej
          produktu.
        </p>
      </div>
    </article>
  );
}
