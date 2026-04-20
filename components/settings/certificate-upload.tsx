'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

import { uploadCertificateAction } from './actions';

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
        toast.success('Certyfikat wgrany i zweryfikowany');
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
    <div className="space-y-4">
      <div>
        <Label>Plik certyfikatu (cert.pem lub .crt)</Label>
        <Input
          type="file"
          accept=".pem,.crt,.cer"
          onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div>
        <Label>Plik klucza prywatnego (key.pem)</Label>
        <Input
          type="file"
          accept=".pem,.key"
          onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button
        onClick={handleUpload}
        disabled={!certFile || !keyFile || isUploading}
      >
        {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Wgraj i zweryfikuj
      </Button>
    </div>
  );
}
