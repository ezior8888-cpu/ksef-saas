'use client';

import { motion } from 'framer-motion';

import { DrawnVideo } from '@/components/ui/drawn-video';

import { asset } from '../_assets';
import { MaskReveal, MaskRevealWords } from './mask-reveal';
import { Pop } from './anim';
import { Container, Icon } from './ui';
import { SUPPORT_EMAIL } from '@/lib/site';

// Do 15.10.2026 były tu telefon „+48 22 123 45 67” i adres „ul. Piękna 15/3,
// Warszawa” z szablonu — zmyślone dane kontaktowe firmy (art. 5 u.ś.u.d.e.,
// a numer i adres mogą należeć do kogoś innego). Adres i telefon wracają
// tylko z prawdziwymi danymi usługodawcy (lib/legal/entity.ts — PR #264).
const DETAILS = [{ icon: '4022663340', value: SUPPORT_EMAIL }];

/**
 * Formularz NIE ma backendu — do 15.10.2026 „Wyślij” tylko blokował
 * przeładowanie strony i wiadomość przepadała bez śladu (także żądania RODO,
 * na które mamy miesiąc). Teraz otwiera program pocztowy z gotową wiadomością
 * i mówi o tym wprost.
 */
function composeMail(form: HTMLFormElement): string {
  const data = new FormData(form);
  const topic = String(data.get('topic') || 'Wiadomość ze strony FaktWay');
  const lines = [String(data.get('message') ?? ''), '', `— ${String(data.get('name') ?? '')}`.trim()];
  const params = new URLSearchParams({ subject: topic, body: lines.join('\n') });
  // URLSearchParams koduje spacje jako „+”, a klienty poczty pokazałyby plusy.
  return `mailto:${SUPPORT_EMAIL}?${params.toString().replace(/\+/g, '%20')}`;
}

export function Contact() {
  return (
    <section id="contact" className="py-20 lg:py-[100px]">
      <Container className="flex flex-col items-center gap-16">
        {/* Nagłówek: 550 wyśrodkowany. Pas poniżej: 946, w nim wąska
            kolumna 274 z danymi kontaktowymi i formularz na resztę. */}
        <div className="flex w-full max-w-[550px] flex-col items-center gap-5 text-center">
          <h2 className="z-h2 w-full">
            <MaskRevealWords text="Napisz do nas" />
          </h2>
          <MaskReveal delay={0.18}>
            <p className="z-lead text-[var(--z-muted)]">
              Na e-maile odpowiada człowiek, zwykle w ciągu dwóch dni
              roboczych. Szybkie pytania możesz zadać asystentowi AI w panelu.
            </p>
          </MaskReveal>
        </div>

        <div className="flex w-full max-w-[946px] flex-col gap-10 lg:flex-row lg:items-start">
          <div className="flex flex-col gap-8 lg:w-[274px] lg:shrink-0">

            <ul className="flex flex-col gap-4">
              {DETAILS.map((d, i) => (
                <li key={d.value} className="flex items-start gap-3">
                  <Pop delay={i * 0.08}>
                    <Icon id={d.icon} size={22} />
                  </Pop>
                  <span className="z-body whitespace-pre-line text-[var(--z-muted)]">
                    {d.value}
                  </span>
                </li>
              ))}
            </ul>

            <DrawnVideo
            src={asset.contact.video}
            width={274}
            height={274}
            className="size-[274px] object-contain"
          />
          </div>

          {/* formularz — 946×628 w oryginale, tu jako reszta szerokości */}
          <motion.form
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full flex-col gap-5 rounded-[20px] border border-[var(--z-300)] bg-white p-6 lg:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = composeMail(e.currentTarget);
            }}
          >
            <h3 className="z-h4">W czym możemy pomóc?</h3>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Imię">
                <input type="text" name="name" className={INPUT} />
              </Field>
              <Field label="E-mail">
                <input type="email" name="email" className={INPUT} />
              </Field>
            </div>

            <Field label="Temat">
              <select name="topic" className={INPUT} defaultValue="">
                <option value="" disabled>
                  Wybierz…
                </option>
                <option>Pytanie o produkt</option>
                <option>Pomoc techniczna</option>
              </select>
            </Field>

            <Field label="Wiadomość">
              <textarea name="message" rows={5} className={INPUT} />
            </Field>

            <button
              type="submit"
              className="z-body inline-flex w-fit items-center rounded-[12px] bg-[var(--z-black)] px-6 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
            >
              Otwórz w programie pocztowym
            </button>
            <p className="z-small text-[var(--z-muted)]">
              Wiadomość otworzy się w Twoim programie pocztowym, zaadresowana
              na {SUPPORT_EMAIL} — wyślesz ją stamtąd. Administratorem danych
              z korespondencji jest usługodawca FaktWay, szczegóły w{' '}
              <a href="/legal/polityka-prywatnosci" className="underline underline-offset-2">
                polityce prywatności
              </a>
              .
            </p>
          </motion.form>
        </div>
      </Container>
    </section>
  );
}

const INPUT =
  'z-body w-full rounded-[12px] border border-[var(--z-300)] bg-white px-4 py-3 outline-none transition-colors focus:border-[var(--z-black)]';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="z-small font-medium text-[var(--z-muted)]">{label}</span>
      {children}
    </label>
  );
}
