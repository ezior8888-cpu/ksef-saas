'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { markPostRegisterMagicImportConsumedAction } from '@/app/actions/organizations';
import { ImportSourceSelector } from '@/components/onboarding/import-source-selector';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export function PostRegisterImportModal({
  tenantId,
  tenantName,
  hasCertificate,
}: {
  tenantId: string;
  tenantName: string;
  hasCertificate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const strippedQueryRef = useRef(false);
  const markedConsumedRef = useRef(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('post_register_import') !== '1') return;
    setOpen(true);
    if (strippedQueryRef.current) return;
    strippedQueryRef.current = true;
    router.replace('/dashboard', { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!open || markedConsumedRef.current) return;
    markedConsumedRef.current = true;
    void markPostRegisterMagicImportConsumedAction();
  }, [open]);

  if (!tenantId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton
        className="dark ff-dashboard max-w-lg border-white/10 bg-[#12131a] p-6 text-[var(--ff-on-surface)] sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Magiczny import z KSeF</DialogTitle>
        <ImportSourceSelector
          tenantId={tenantId}
          tenantName={tenantName}
          hasCertificate={hasCertificate}
        />
      </DialogContent>
    </Dialog>
  );
}
