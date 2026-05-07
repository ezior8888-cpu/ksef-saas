import { createHash } from 'crypto';
import { redirect } from 'next/navigation';

import { InviteAcceptForm } from '@/components/invite/invite-accept-form';
import { createAdminClient, createClient } from '@/lib/supabase/server';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InviteLandingPage({ params }: PageProps) {
  const { token } = await params;

  if (!token || token.length < 16) {
    return (
      <FailureBox
        title="Nieprawidłowe zaproszenie"
        body="Link wygląda na uszkodzony. Skontaktuj się z osobą, która Cię zaprosiła."
      />
    );
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Pobranie metadanych zaproszenia bypassem RLS — w tym widoku nie jesteśmy
  // członkiem org, więc RLS zakryłby wiersz. Pokazujemy tylko nazwę org +
  // adres docelowy maila — bez ujawniania wewnętrznych danych firmy.
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from('organization_invitations')
    .select(
      'id, email, role, accepted_at, revoked_at, expires_at, organization_id, tenants:organization_id(name)',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!invitation) {
    return (
      <FailureBox
        title="Zaproszenie nie istnieje"
        body="Token jest nieprawidłowy. Może został zmieniony albo cały link nie został przeklejony."
      />
    );
  }

  if (invitation.revoked_at) {
    return (
      <FailureBox
        title="Zaproszenie zostało anulowane"
        body="Skontaktuj się z osobą, która Cię zaprosiła, aby wysłała nowe zaproszenie."
      />
    );
  }

  if (invitation.accepted_at) {
    return (
      <FailureBox
        title="Zaproszenie już użyte"
        body="To zaproszenie zostało już wcześniej zaakceptowane. Zaloguj się normalnie, aby zobaczyć organizację."
      />
    );
  }

  if (new Date(invitation.expires_at) <= new Date()) {
    return (
      <FailureBox
        title="Zaproszenie wygasło"
        body="Linki do zaproszeń są ważne 7 dni. Poproś osobę, która Cię zaprosiła, o nowe zaproszenie."
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Niezalogowany — zachowujemy token w `next` i wracamy tu po loginie /
  // rejestracji.
  if (!user) {
    const next = `/invite/${encodeURIComponent(token)}`;
    redirect(`/login?redirect=${encodeURIComponent(next)}`);
  }

  const tenant = Array.isArray(invitation.tenants)
    ? invitation.tenants[0]
    : invitation.tenants;
  const orgName = tenant?.name ?? 'organizacja';
  const inviteEmail = invitation.email as unknown as string;
  const userEmail = (user.email ?? '').toLowerCase();
  const emailMatches = inviteEmail.toLowerCase() === userEmail;

  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-glass-border bg-glass-white-strong backdrop-blur-glass-lg shadow-glass-lg p-8 lg:p-10 space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Zaproszenie do <span className="font-bold">{orgName}</span>
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Zostałeś/aś zaproszony/a do organizacji <strong>{orgName}</strong>{' '}
              w roli <strong>{invitation.role}</strong>.
            </p>
          </div>

          {emailMatches ? (
            <InviteAcceptForm token={token} orgName={orgName} />
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-xl p-4 text-sm leading-relaxed">
              <p className="font-medium mb-1">Niewłaściwe konto</p>
              <p className="text-muted-foreground">
                Zaproszenie wysłano na <strong>{inviteEmail}</strong>, ale jesteś
                zalogowany jako <strong>{user.email}</strong>. Wyloguj się i
                zaloguj na właściwe konto.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FailureBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-mesh-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl shadow-glass p-8 lg:p-10 space-y-3">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
