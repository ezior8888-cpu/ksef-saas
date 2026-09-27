'use client';

import { useState, useTransition } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { downloadInvoiceXmlAction } from '@/components/invoices/actions-detail';

import { StatusBadge } from './status-badge';

import type { InvoiceRow } from './invoice-row-types';
import { saveBlob } from '@/lib/download';
import { formatPlMoney } from '@/lib/format/pl';

export type SwipeableInvoiceRowInvoice = InvoiceRow;

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface Props {
  invoice: SwipeableInvoiceRowInvoice;
}

/**
 * Wiersz faktury z gestem poziomym (framer-motion `drag="x"` + `animate` ze
 * springiem). Na touch: swipe w lewo → pobierz XML.
 */
export function SwipeableInvoiceRow({ invoice }: Props) {
  const x = useMotionValue(0);
  const [isResetting, setIsResetting] = useState(false);
  const [isDownloading, startDownload] = useTransition();

  const canDownload = Boolean(invoice.xml_storage_path);

  const leftActionOpacity = useTransform(x, [-120, -40, 0], [1, 0.5, 0]);

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    const offset = info.offset.x;
    setIsResetting(true);

    if (offset < -100 && canDownload) {
      void animate(x, 0, SPRING);
      handleDownload();
    } else {
      void animate(x, 0, SPRING);
    }

    setTimeout(() => setIsResetting(false), 300);
  };

  const handleDownload = () => {
    startDownload(async () => {
      const result = await downloadInvoiceXmlAction(invoice.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([result.xml], { type: 'application/xml' });
      saveBlob(blob, result.filename);
      toast.success('Pobrano XML');
    });
  };

  const dragEnabled = canDownload;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-6">
        <motion.div
          style={{ opacity: leftActionOpacity }}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400"
        >
          <span className="text-sm font-medium">Pobierz XML</span>
          {isDownloading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Download className="h-5 w-5" />
          )}
        </motion.div>
      </div>

      <motion.div
        drag={dragEnabled ? 'x' : false}
        dragConstraints={{
          left: canDownload ? -120 : 0,
          right: 0,
        }}
        dragElastic={0.2}
        style={{ x }}
        onDragEnd={handleDragEnd}
        className="relative touch-pan-y rounded-2xl border border-glass-border bg-glass-white backdrop-blur-glass"
      >
        <Link
          href={`/invoices/${invoice.id}`}
          className={`block p-4 ${isResetting ? 'pointer-events-none' : ''}`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-medium">
                {invoice.internal_number ?? '(bez numeru)'}
              </p>
              <p className="text-xs text-muted-foreground">
                {invoice.issue_date ?? '—'}
              </p>
            </div>
            <StatusBadge status={invoice.ksef_status} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {invoice.buyer_data?.name ?? '—'}
              </p>
              {invoice.buyer_data?.nip ? (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {invoice.buyer_data.nip}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums">
              {invoice.gross_total != null
                ? `${formatPlMoney(Number(invoice.gross_total))} PLN`
                : '—'}
            </p>
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
