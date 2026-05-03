'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Lock,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { FileImportSource } from '@/app/onboarding/magic-import/actions';
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
  const router = useRouter();
  const [importType, setImportType] = useState<FileImportSource | null>(null);

  const handleSkip = () => {
    router.push('/invoices');
  };

  const firstName = tenantName.trim().split(/\s+/)[0] ?? '';

  return (
    <div className="space-y-6" data-tenant-id={tenantId}>
      <div>
        <h1 className="text-3xl font-display font-semibold tracking-tighter-display">
          {firstName ? `Witaj, ${firstName}!` : 'Witaj!'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Skąd przenosisz dane? Zaimportujemy historię w 60 sekund.
        </p>
      </div>

      <button
        type="button"
        onClick={() =>
          hasCertificate
            ? router.push(`/onboarding/magic-import?tenantId=${encodeURIComponent(tenantId)}`)
            : undefined
        }
        disabled={!hasCertificate}
        className="w-full text-left rounded-3xl border border-glass-border bg-linear-to-br from-purple-500/10 to-blue-500/10 backdrop-blur-glass shadow-glass p-6 hover:shadow-glass-lg transition-all duration-200 ease-apple active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed group"
      >
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <h3 className="font-display font-semibold text-lg tracking-tighter-text">
                Magiczny Import z KSeF
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-foreground/10 text-foreground font-medium">
                ZALECANE
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Pobieramy 6 miesięcy Twojej historii faktur prosto z KSeF. Auto-buduje katalog
              kontrahentów i produktów.
            </p>
            {!hasCertificate && (
              <div className="rounded-2xl bg-orange-500/10 border border-orange-500/20 p-3 flex items-start gap-2 mb-3">
                <Lock className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-foreground">
                  Wymaga skonfigurowanego certyfikatu KSeF.{' '}
                  <Link href="/settings/ksef" className="font-medium underline">
                    Skonfiguruj certyfikat
                  </Link>
                </p>
              </div>
            )}
            {hasCertificate && (
              <div className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:gap-2 transition-all">
                Rozpocznij <ArrowRight className="h-4 w-4" />
              </div>
            )}
          </div>
        </div>
      </button>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2">
          Lub przenieś z innego programu
        </p>

        <div className="rounded-3xl border border-glass-border bg-glass-white backdrop-blur-glass shadow-glass overflow-hidden">
          {FILE_IMPORT_OPTIONS.map((opt, idx, arr) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setImportType(opt.id)}
              className={`w-full text-left flex items-center gap-3 p-4 hover:bg-foreground/2 transition-colors ${
                idx !== arr.length - 1 ? 'border-b border-glass-border/50' : ''
              }`}
            >
              <div className="h-9 w-9 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
                {opt.id === 'jpk_fa' ? (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <div className="text-center pt-2">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={handleSkip}
        >
          Pomiń — zacznę od zera
        </Button>
      </div>

      {importType && (
        <FileImportDialog source={importType} tenantId={tenantId} onClose={() => setImportType(null)} />
      )}
    </div>
  );
}
