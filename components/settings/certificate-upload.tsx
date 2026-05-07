'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { uploadCertificateAction } from './actions';

const fileInputClasses =
  'cursor-pointer file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-foreground file:text-background file:text-xs file:font-medium hover:file:bg-foreground/90 file:cursor-pointer file:transition-colors';

export function CertificateUpload() {
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!certFile || !keyFile) return;

    setIsUploading(true);
    try {
      const certPem = await certFile.text();
      const keyPem = await keyFile.text();

      const result = await uploadCertificateAction({ certPem, keyPem });
      if (result.success) {
        toast.success(result.message);
        window.location.reload();
        return;
      }
      toast.error(result.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nieznany błąd');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Plik certyfikatu (cert.pem lub .crt)
        </span>
        <Input
          type="file"
          accept=".pem,.crt,.cer"
          onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
          className={fileInputClasses}
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          Plik klucza prywatnego (key.pem)
        </span>
        <Input
          type="file"
          accept=".pem,.key"
          onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
          className={fileInputClasses}
        />
      </label>

      <Button
        onClick={handleUpload}
        disabled={!certFile || !keyFile || isUploading}
        variant="glass-primary"
        size="lg"
        className="w-full"
      >
        {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Wgraj i zweryfikuj certyfikat
      </Button>
    </div>
  );
}
