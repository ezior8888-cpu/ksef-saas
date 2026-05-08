'use client';

import { useState, useTransition } from 'react';
import {
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="rounded-3xl border border-glass-border bg-glass-white-strong backdrop-blur-glass-lg shadow-glass-lg p-7 max-w-md w-full space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-import-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="file-import-title" className="font-display font-semibold tracking-tighter-text text-lg">
              Import z {SOURCE_LABELS[source]}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Wgraj plik wyeksportowany ze starego programu
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full shrink-0">
            <X className="h-4 w-4" />
            <span className="sr-only">Zamknij</span>
          </Button>
        </div>

        <label className="block cursor-pointer">
          <input
            type="file"
            accept={FILE_ACCEPT[source]}
            disabled={isUploading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <div className="rounded-2xl border-2 border-dashed border-glass-border hover:border-foreground/30 transition-colors p-8 text-center">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            {file ? (
              <>
                <p className="font-medium text-sm truncate px-2">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-sm">Kliknij aby wybrać plik</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {FILE_ACCEPT[source]} • max 10 MB
                </p>
              </>
            )}
          </div>
        </label>

        {source === 'fakturownia_csv' && (
          <p className="text-xs text-muted-foreground bg-foreground/5 rounded-2xl p-3 leading-relaxed">
            <strong>Jak wyeksportować z Fakturowni:</strong> Faktury → Eksport → Format CSV →
            Wybierz okres → Pobierz.
          </p>
        )}
        {source === 'jpk_fa' && (
          <p className="text-xs text-muted-foreground bg-foreground/5 rounded-2xl p-3 leading-relaxed">
            JPK_FA generuje każdy program księgowy w Polsce — wymóg Ministerstwa Finansów.
            Sprawdź sekcję „Eksport“ lub „Pliki kontrolne”.
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="glass" size="lg" onClick={onClose} disabled={isUploading}>
            Anuluj
          </Button>
          <Button
            variant="glass-primary"
            size="lg"
            onClick={handleUpload}
            disabled={!file || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Rozpocznij import
          </Button>
        </div>
      </div>
    </div>
  );
}
