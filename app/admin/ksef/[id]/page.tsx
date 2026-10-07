import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { requireAdmin } from '@/lib/auth/admin-guard';
import { getInvoiceLifecycle } from '@/lib/admin/ksef-lifecycle';

import { OperatorActions } from '../_components/operator-actions';

export const dynamic = 'force-dynamic';

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function Field({ label, value, mono = false }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-sm break-all' : 'text-sm'}>{value === null || value === undefined || value === '' ? '—' : String(value)}</dd>
    </div>
  );
}

/** Karta faktury dla operatora: stan, historia wysyłek, ślad audytu, akcje (PR 3c). */
export default async function AdminKsefInvoicePage(props: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await props.params;
  const data = await getInvoiceLifecycle(id);
  if (!data) notFound();
  const { invoice, submissions, audit, openSent, evidence, resendFacts, environment } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/ksef" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Cykl życia
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tighter-display">
          {invoice.internalNumber ?? invoice.id}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {invoice.tenantName ?? invoice.tenantId}
          {invoice.tenantNip ? ` · NIP ${invoice.tenantNip}` : ''}
          {' · '}
          <Link href={`/invoices/${invoice.id}`} className="hover:underline">widok klienta</Link>
        </p>
      </div>

      <section className="rounded-2xl border border-glass-border bg-foreground/3 p-5 backdrop-blur-glass">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status" value={invoice.ksefStatus} mono />
          <Field label="Kod błędu" value={invoice.errorCode ? `${invoice.errorCode}${invoice.errorClass ? ` (${invoice.errorClass})` : ''}` : null} mono />
          <Field label="Rodzaj" value={`${invoice.invoiceType ?? '—'} / ${invoice.invoiceKind ?? 'regular'} / ${invoice.direction ?? '—'}`} mono />
          <Field label="Data wystawienia" value={invoice.issueDate} />
          <Field label="Numer KSeF" value={invoice.ksefNumber} mono />
          <Field label="Środowisko" value={invoice.ksefEnvironment} mono />
          <Field label="Przejęcie (owner)" value={invoice.sendOwner} mono />
          <Field label="Prób wysyłki" value={invoice.submissionAttempts} />
          <Field label="Wysłana do KSeF" value={when(invoice.submittedToKsefAt)} />
          <Field label="Ostatnia próba" value={when(invoice.lastAttemptAt)} />
          <Field label="Zmiana wiersza" value={when(invoice.updatedAt)} />
          <Field label="Plik XML" value={invoice.xmlStoragePath} mono />
        </dl>
        {invoice.lastError ? (
          <p className="mt-4 rounded-xl bg-red-500/5 border border-red-500/20 p-3 text-sm">{invoice.lastError}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>dowód kontaktu z KSeF: <strong>{evidence ? 'TAK' : 'nie'}</strong></span>
          <span>otwarty wpis sent / zamiar intent: <strong>{openSent ? 'TAK' : 'nie'}</strong></span>
          <span>dane do ponownej wysyłki: <strong>{resendFacts.sendData === 'stored' ? 'zapisane' : 'brak'}</strong></span>
          <span>rodzaj wstrzymany w tym środowisku: <strong>{resendFacts.kindHeld ? 'TAK' : 'nie'}</strong></span>
          <span>data wystawienia minęła (dokument specjalny): <strong>{resendFacts.issueDatePassed ? 'TAK' : 'nie'}</strong></span>
          <span>KSEF_ENV aplikacji: <strong>{environment ?? 'nieustawione'}</strong></span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Akcje operatora</h2>
        <OperatorActions
          invoiceId={invoice.id}
          internalNumber={invoice.internalNumber}
          direction={invoice.direction}
          status={invoice.ksefStatus}
          errorCode={invoice.errorCode}
          invoiceKind={invoice.invoiceKind}
          openSent={openSent}
          evidence={evidence}
          facts={resendFacts}
          environmentKnown={environment !== null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Historia wysyłek (ksef_submissions)</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak wpisów — żadna wysyłka nie dotarła do KSeF.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-glass-border bg-foreground/3 backdrop-blur-glass">
            <table className="w-full text-sm">
              <thead className="border-b border-glass-border">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Próba</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Sesja</th>
                  <th className="px-4 py-2.5 font-medium">Referencja</th>
                  <th className="px-4 py-2.5 font-medium">Błąd</th>
                  <th className="px-4 py-2.5 font-medium">Zamknięta</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-glass-border last:border-0">
                    <td className="px-4 py-2.5 text-xs tabular-nums">{when(s.attemptedAt)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.status ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs break-all">{s.sessionReferenceNumber ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs break-all">{s.invoiceReferenceNumber ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {s.errorCode ? <span className="font-mono">{s.errorCode} </span> : null}
                      {s.errorMessage ?? ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{when(s.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {submissions.some((s) => s.originalCheck) && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Oryginał z KSeF przy duplikacie 440 (original_check)</h2>
          {submissions.filter((s) => s.originalCheck).map((s) => {
            const c = s.originalCheck!;
            const fields: Array<[string, string | null]> = [
              ['Numer KSeF oryginału', s.originalKsefNumber],
              ['Wpis próby', `${s.status ?? '—'}${s.status === 'sent' || s.status === 'intent' ? ' (otwarty — bieżący)' : ' (zamknięty — historyczny)'}`],
              ['Powód', c.reason],
              ['Ostatnie nieudane sprawdzenie', c.recheck ? `${c.recheck.reason}${c.recheck.httpStatus ? ` (HTTP ${c.recheck.httpStatus})` : ''}, ${when(c.recheck.checkedAt)}` : null],
              ['Środowisko', c.env],
              ['Sprawdzono', when(c.checkedAt)],
              ['Numer faktury (P_2)', c.summary?.number ?? null],
              ['Data wystawienia (P_1)', c.summary?.issueDate ?? null],
              ['Nabywca', [c.summary?.buyerName, c.summary?.buyerNip].filter(Boolean).join(', ') || null],
              ['Brutto', c.summary?.gross ? `${c.summary.gross} ${c.summary.currency ?? ''}` : null],
              ['Program', c.summary?.systemInfo ?? null],
              ['Data nadania numeru', c.acquiredAt],
              ['Treść jak nasza (poza nagłówkiem)', c.sameContentExceptHeader === null ? null : c.sameContentExceptHeader ? 'tak' : 'nie'],
              ['W historii tej faktury', c.ownHistory === null ? null : c.ownHistory ? 'tak' : 'nie'],
              ['HTTP odmowy pobrania', c.httpStatus === null ? null : String(c.httpStatus)],
              ['Faktura w FaktFlow z tym numerem KSeF', c.knownInvoice ? `${c.knownInvoice.internalNumber ?? 'bez numeru'} (${c.knownInvoice.id})` : null],
              ['SHA-256 oryginału', c.sha256],
              ['Archiwum', c.archivePath],
            ];
            return (
              <dl key={s.id} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 rounded-2xl border border-glass-border bg-foreground/3 p-4 text-sm">
                {fields.filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="text-muted-foreground">{label}:</dt>
                    <dd className="font-mono text-xs break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Ślad audytu (ostatnie 50)</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak wpisów.</p>
        ) : (
          <ul className="space-y-2">
            {audit.map((a) => (
              <li key={a.id} className="rounded-xl border border-glass-border bg-foreground/3 px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-xs">{a.action}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{when(a.createdAt)}</span>
                  <span className="text-xs text-muted-foreground font-mono">{a.userId ? `user ${a.userId.slice(0, 8)}…` : 'system'}</span>
                </div>
                {a.details ? (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                    {JSON.stringify(a.details)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
