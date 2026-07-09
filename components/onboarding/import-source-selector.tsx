'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  skipMagicImportAction,
  type FileImportSource,
} from '@/app/onboarding/magic-import/actions';
import { FileImportDialog } from './file-import-dialog';

interface Props {
  tenantId: string;
  tenantName: string;
  hasCertificate: boolean;
}

const FILE_IMPORT_OPTIONS: readonly {
  id: FileImportSource;
  label: string;
  sub: string;
}[] = [
  { id: 'fakturownia_csv', label: 'Fakturownia', sub: 'Plik CSV z eksportu' },
  { id: 'infakt_csv', label: 'inFakt', sub: 'Plik CSV z eksportu' },
  { id: 'wfirma_csv', label: 'wFirma', sub: 'Plik CSV z eksportu' },
  { id: 'ifirma_csv', label: 'iFirma', sub: 'Plik CSV z eksportu' },
  { id: 'jpk_fa', label: 'Inny program', sub: 'Plik JPK_FA (uniwersalny)' },
] as const;

export function ImportSourceSelector({ tenantId, tenantName, hasCertificate }: Props) {
  const [importType, setImportType] = useState<FileImportSource | null>(null);
  const [isSkipping, startSkip] = useTransition();

  const handleSkip = () => {
    // skipMagicImportAction wykonuje server-side redirect → /dashboard (Dashboard)
    // (atomowo, kolejny request leci z aktualnymi cookies).
    startSkip(() => skipMagicImportAction());
  };

  const firstName = tenantName.trim().split(/\s+/)[0] ?? '';

  return (
    <div className="space-y-6" data-tenant-id={tenantId}>
      <div>
        <h1 className="text-3xl font-display font-semibold tracking-tighter-display">
          {firstName ? `Witaj, ${firstName}!` : 'Witaj!'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {hasCertificate
            ? 'Skąd przenosisz dane? Zaimportujemy historię w 60 sekund.'
            : 'Konto firmy gotowe. Zostało jeszcze jedno połączenie z KSeF.'}
        </p>
      </div>

      {/* BUG-009: Magiczny Import POJAWIA SIĘ DOPIERO po wgraniu certyfikatu.
          Bez certyfikatu pokazujemy jasny komunikat „najpierw wgraj certyfikat",
          żeby nie kusić niedziałającym przyciskiem zaraz po rejestracji. */}
      {!hasCertificate ? (
        <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
              <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold tracking-tighter-text">
                Przeniesiemy Twoje dane z KSeF
              </h3>
              <p className="mb-4 mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Pobierzemy ostatnie 6 miesięcy faktur prosto z KSeF i automatycznie
                zbudujemy katalog kontrahentów oraz produktów. Aby zacząć, najpierw
                wgraj certyfikat KSeF swojej firmy — bez niego nie mamy dostępu do
                Twojej historii.
              </p>
              <Link
                href="/settings/ksef"
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <ShieldCheck className="h-4 w-4" />
                Wgraj certyfikat KSeF
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() =>
            window.location.assign(
              `/onboarding/magic-import?tenantId=${encodeURIComponent(tenantId)}`,
            )
          }
          className="group w-full rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6 text-left transition-all duration-200 ease-apple hover:border-emerald-500/40 hover:bg-emerald-500/[0.1] active:scale-[0.99]"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
              <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-semibold tracking-tighter-text">
                  Magiczny Import z KSeF
                </h3>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  ZALECANE
                </span>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                Pobieramy 6 miesięcy Twojej historii faktur prosto z KSeF.
                Auto-buduje katalog kontrahentów i produktów.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-all group-hover:gap-2">
                Rozpocznij <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </button>
      )}

      <div className="space-y-3">
        <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Lub przenieś z innego programu
        </p>

        <div className="overflow-hidden rounded-3xl border border-glass-border bg-foreground/[0.02]">
          {FILE_IMPORT_OPTIONS.map((opt, idx, arr) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setImportType(opt.id)}
              className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-foreground/5 ${
                idx !== arr.length - 1 ? 'border-b border-glass-border/50' : ''
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
                {opt.id === 'jpk_fa' ? (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      <div className="pt-2 text-center">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={handleSkip}
          disabled={isSkipping}
        >
          {isSkipping ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Otwieram aplikację...
            </>
          ) : (
            'Pomiń — wejdę do aplikacji'
          )}
        </Button>
      </div>

      {importType && (
        <FileImportDialog source={importType} tenantId={tenantId} onClose={() => setImportType(null)} />
      )}
    </div>
  );
}
