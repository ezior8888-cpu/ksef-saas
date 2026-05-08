import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
import { Mail, MapPin, MessageCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Kontakt — KSeF SaaS',
};

const cardClass =
  'block rounded-3xl border border-glass-border bg-glass-white p-7 shadow-glass backdrop-blur-glass transition-shadow duration-300 hover:shadow-glass-lg text-foreground no-underline';

export default function ContactPage() {
  return (
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-16 text-center">
          <h1 className="font-display text-5xl font-semibold tracking-tighter-display md:text-6xl">
            Pomożemy
          </h1>
          <p className="mt-6 text-xl text-muted-foreground">
            Czytamy każdą wiadomość. Odpowiadamy w ciągu 24h.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ContactCard
            icon={Mail}
            title="Email"
            value="hello@ksef-saas.pl"
            href="mailto:hello@ksef-saas.pl"
            note="Odpowiedź w 24h"
          />
          <ContactCard
            icon={MessageCircle}
            title="Live Chat"
            value="W aplikacji"
            href="https://app.ksef-saas.pl"
            note="Pon–Pt 9:00–17:00"
            external
          />
          <ContactCard
            icon={Mail}
            title="Wsparcie techniczne"
            value="support@ksef-saas.pl"
            href="mailto:support@ksef-saas.pl"
            note="Odpowiedź w 24h"
          />
          <ContactCard
            icon={MapPin}
            title="Adres"
            value="Poznań"
            note="Polska 🇵🇱"
          />
        </div>
      </div>
    </div>
  );
}

type ContactCardProps = {
  icon: LucideIcon;
  title: string;
  value: string;
  href?: string;
  note?: string;
  /** Zewnętrzny URL (np. aplikacja produkcyjna). */
  external?: boolean;
};

function ContactCard({
  icon: Icon,
  title,
  value,
  href,
  note,
  external,
}: ContactCardProps) {
  const inner = (
    <>
      <Icon className="mb-3 h-5 w-5 text-muted-foreground" />
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 font-display text-lg font-semibold tracking-tighter-text">
        {value}
      </p>
      {note ? (
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(cardClass)}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {inner}
      </a>
    );
  }

  return <div className={cn(cardClass, 'cursor-default')}>{inner}</div>;
}
