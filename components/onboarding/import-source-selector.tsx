'use client';

// Plan Finora P15 (E10b): wybór źródła importu na prymitywach Finory (karta
// z ramką, `Button`, `Badge`, ikony Remix) zamiast szkła i zieleni. Logika bez
// zmian: Magiczny import tylko z certyfikatem (BUG-009), import z pliku przez
// `FileImportDialog`, „Pomiń” przez `skipMagicImportAction`. Ten sam
// komponent pokazuje okno `PostRegisterImportModal` na Pulpicie.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  RiArrowRightLine,
  RiArrowRightSLine,
  RiFileExcel2Line,
  RiFileTextLine,
  RiLoader4Line,
  RiShieldCheckLine,
  RiSparkling2Line,
} from '@remixicon/react';

import { Badge } from '@/components/ui/badge';
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

function SparkleBadge() {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center bg-primary/10 text-primary">
      <RiSparkling2Line className="size-5" />
    </div>
  );
}

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
        <h1 className="mb-2 text-2xl font-semibold">
          {firstName ? `Witaj, ${firstName}!` : 'Witaj!'}
        </h1>
        <p className="text-muted-foreground">
          {hasCertificate
            ? 'Skąd przenosisz dane? Zaimportujemy historię w 60 sekund.'
            : 'Konto firmy gotowe. Zostało jeszcze jedno połączenie z KSeF.'}
        </p>
      </div>

      {/* BUG-009: Magiczny Import POJAWIA SIĘ DOPIERO po wgraniu certyfikatu.
          Bez certyfikatu pokazujemy jasny komunikat „najpierw wgraj certyfikat",
          żeby nie kusić niedziałającym przyciskiem zaraz po rejestracji. */}
      {!hasCertificate ? (
        <div className="border border-primary/30 bg-card p-4">
          <div className="flex items-start gap-4">
            <SparkleBadge />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">
                Przeniesiemy Twoje dane z KSeF
              </h3>
              <p className="mb-4 mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Pobierzemy ostatnie 6 miesięcy faktur prosto z KSeF i automatycznie
                zbudujemy katalog kontrahentów oraz produktów. Aby zacząć, najpierw
                wgraj certyfikat KSeF swojej firmy — bez niego nie mamy dostępu do
                Twojej historii.
              </p>
              <Button render={<Link href="/settings/ksef" />} nativeButton={false}>
                <RiShieldCheckLine />
                Wgraj certyfikat KSeF
                <RiArrowRightLine />
              </Button>
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
          className="group w-full border border-primary/30 bg-card p-4 text-left transition-colors hover:bg-muted"
        >
          <div className="flex items-start gap-4">
            <SparkleBadge />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">
                  Magiczny Import z KSeF
                </h3>
                <Badge>ZALECANE</Badge>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                Pobieramy 6 miesięcy Twojej historii faktur prosto z KSeF.
                Auto-buduje katalog kontrahentów i produktów.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-all group-hover:gap-2">
                Rozpocznij <RiArrowRightLine className="size-4" />
              </span>
            </div>
          </div>
        </button>
      )}

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Lub przenieś z innego programu
        </p>

        <div className="border bg-card">
          {FILE_IMPORT_OPTIONS.map((opt, idx, arr) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setImportType(opt.id)}
              className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted ${
                idx !== arr.length - 1 ? 'border-b' : ''
              }`}
            >
              <div className="flex size-9 shrink-0 items-center justify-center bg-muted">
                {opt.id === 'jpk_fa' ? (
                  <RiFileTextLine className="size-4 text-muted-foreground" />
                ) : (
                  <RiFileExcel2Line className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.sub}</p>
              </div>
              <RiArrowRightSLine className="size-4 shrink-0 text-muted-foreground" />
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
              <RiLoader4Line className="animate-spin" />
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
