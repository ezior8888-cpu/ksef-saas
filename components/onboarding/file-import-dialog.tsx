'use client';

// Plan Finora P15 (E10b): okno importu z pliku na `Dialog` Finory (było
// własne okno na rozmytym szkle). Logika bez zmian:
// `startFileImportAction`, limit 10 MB, przejście na stronę postępu.
// Okno jest montowane przez rodzica tylko na czas wyboru, więc stoi otwarte;
// zamknięcie (X, Esc, klik w tło, „Anuluj”) woła `onClose`, a w trakcie
// wysyłki jest zablokowane jak wcześniej przyciski.

import { useState, useTransition } from 'react';
import { RiFileExcel2Line, RiLoader4Line, RiUploadCloud2Line } from '@remixicon/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  startFileImportAction,
  type FileImportSource,
} from '@/app/onboarding/magic-import/actions';

interface Props {
  source: FileImportSource;
  tenantId: string;
  onClose: () => void;
}

const SOURCE_LABELS: Record<FileImportSource, string> = {
  jpk_fa: 'JPK_FA (uniwersalny)',
  fakturownia_csv: 'Fakturownia CSV',
  infakt_csv: 'inFakt CSV',
  wfirma_csv: 'wFirma CSV',
  ifirma_csv: 'iFirma CSV',
};

const FILE_ACCEPT: Record<FileImportSource, string> = {
  jpk_fa: '.xml',
  fakturownia_csv: '.csv',
  infakt_csv: '.csv',
  wfirma_csv: '.csv',
  ifirma_csv: '.csv',
};

const MAX_BYTES = 10 * 1024 * 1024;

export function FileImportDialog({ source, tenantId, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, startUpload] = useTransition();

  const handleUpload = () => {
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast.error('Plik przekracza limit 10 MB.');
      return;
    }

    startUpload(async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('source', source);
        formData.append('tenantId', tenantId);

        const result = await startFileImportAction(formData);

        if (result.success) {
          toast.success('Import rozpoczęty');
          window.location.assign(`/onboarding/progress/${result.importJobId}`);
        } else {
          toast.error(result.error);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd uploadu');
      }
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isUploading) onClose();
      }}
    >
      <DialogContent showCloseButton={!isUploading} className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Import z {SOURCE_LABELS[source]}</DialogTitle>
          <DialogDescription className="text-sm">
            Wgraj plik wyeksportowany ze starego programu
          </DialogDescription>
        </DialogHeader>

        <label className="block cursor-pointer">
          <input
            type="file"
            accept={FILE_ACCEPT[source]}
            disabled={isUploading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="peer sr-only"
          />
          <div className="border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 peer-focus-visible:border-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
            <RiFileExcel2Line className="mx-auto mb-3 size-8 text-muted-foreground" />
            {file ? (
              <>
                <p className="truncate px-2 text-sm font-medium">{file.name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Kliknij aby wybrać plik</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {FILE_ACCEPT[source]} • max 10 MB
                </p>
              </>
            )}
          </div>
        </label>

        {source === 'fakturownia_csv' && (
          <p className="bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            <strong>Jak wyeksportować z Fakturowni:</strong> Faktury → Eksport → Format CSV →
            Wybierz okres → Pobierz.
          </p>
        )}
        {source === 'jpk_fa' && (
          <p className="bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            JPK_FA generuje każdy program księgowy w Polsce — wymóg Ministerstwa Finansów.
            Sprawdź sekcję „Eksport“ lub „Pliki kontrolne”.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onClose} disabled={isUploading}>
            Anuluj
          </Button>
          <Button size="lg" onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? <RiLoader4Line className="animate-spin" /> : <RiUploadCloud2Line />}
            Rozpocznij import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
