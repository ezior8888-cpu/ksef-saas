'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  RiArrowRightLine,
  RiFileCodeLine,
  RiFileExcel2Line,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  type RemixiconComponentType,
} from '@remixicon/react';

import type { FileImportSource } from '@/app/onboarding/magic-import/actions';
import { FileImportDialog } from '@/components/onboarding/file-import-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { FILE_SOURCES, magicImportHref } from './import-model';

/**
 * Źródła importu jako siatka kart z Accounts Finory (`account-card`: przycisk
 * `outline` jako karta, awatar z ikoną i plakietki u góry, nazwa i opis,
 * na dole akcja) — poprawka Bartosza 22.10.2026: import danych w stylu Finory.
 *
 * Wszystko prowadzi do istniejących ścieżek, bez nowego backendu:
 * - KSeF z certyfikatem → `/onboarding/magic-import?tenantId=…` (formularz
 *   zakresu i `startMagicImportAction`);
 * - KSeF bez certyfikatu → cała karta prowadzi do `/settings/ksef`
 *   (wyjście z blokady, BUG-009 — bez kuszenia niedziałającym startem);
 * - pliki → to samo okno `FileImportDialog` co w onboardingu
 *   (`startFileImportAction`, 10 MB, przejście na stronę postępu).
 *
 * Siatka: od `xl` trzy kolumny (2 rzędy po 3). Węższe ekrany mają dwie
 * kolumny — KSeF i „Inny program” na całą szerokość, cztery programy CSV
 * parami — żeby na telefonie sześć kart nie stało jedna pod drugą.
 */

const CARD = 'h-auto w-full flex-col items-stretch gap-4 p-4 text-left whitespace-normal';

const BADGE_OK = 'bg-green-600/10 text-green-700 dark:bg-green-400/10 dark:text-green-400';
const BADGE_WAIT = 'bg-amber-600/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400';

function SourceIcon({ icon: Icon }: { icon: RemixiconComponentType }) {
  return (
    <Avatar className="size-9 items-center justify-center">
      <AvatarFallback className="bg-transparent">
        <Icon className="text-foreground size-5" aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}

function CardBody({
  icon,
  badges,
  title,
  description,
  action,
}: {
  icon: RemixiconComponentType;
  badges: ReactNode;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <SourceIcon icon={icon} />
        <div className="flex flex-wrap items-center justify-end gap-1.5">{badges}</div>
      </div>
      <div className="flex-1">
        <p className="text-foreground text-sm font-medium wrap-break-word">{title}</p>
        <p className="text-muted-foreground text-sm font-normal wrap-break-word">{description}</p>
      </div>
      <span className="text-primary inline-flex items-center gap-1.5 text-sm font-medium">
        {action}
        <RiArrowRightLine className="size-4" aria-hidden />
      </span>
    </>
  );
}

function KsefCard({ tenantId, hasCertificate }: { tenantId: string; hasCertificate: boolean }) {
  const badges = (
    <>
      <Badge variant="secondary" className="font-normal">
        Zalecane
      </Badge>
      <Badge variant="secondary" className={cn('font-normal', hasCertificate ? BADGE_OK : BADGE_WAIT)}>
        {hasCertificate ? 'Gotowy' : 'Wymaga certyfikatu'}
      </Badge>
    </>
  );

  return (
    <Link
      href={hasCertificate ? magicImportHref(tenantId) : '/settings/ksef'}
      // Nazwa od tytułu karty, nie od plakietek, które stoją w niej pierwsze.
      aria-label={
        hasCertificate
          ? 'Magiczny import z KSeF — rozpocznij import'
          : 'Magiczny import z KSeF — wymaga certyfikatu. Wgraj certyfikat KSeF'
      }
      className={cn(buttonVariants({ variant: 'outline' }), CARD, 'col-span-2 xl:col-span-1')}
    >
      <CardBody
        icon={hasCertificate ? RiSparkling2Line : RiShieldKeyholeLine}
        badges={badges}
        title="Magiczny import z KSeF"
        description={
          hasCertificate
            ? 'Faktury z KSeF z ostatnich 3–24 miesięcy. Kontrahenci i produkty dodadzą się sami.'
            : 'Najpierw wgraj certyfikat KSeF — bez niego nie pobierzemy Twoich faktur.'
        }
        action={hasCertificate ? 'Rozpocznij import' : 'Wgraj certyfikat KSeF'}
      />
    </Link>
  );
}

export function ImportSourceGrid({ tenantId, hasCertificate }: { tenantId: string; hasCertificate: boolean }) {
  const [fileSource, setFileSource] = useState<FileImportSource | null>(null);

  return (
    <section aria-labelledby="zrodla-importu">
      <h2 id="zrodla-importu" className="sr-only">
        Źródła importu
      </h2>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <KsefCard tenantId={tenantId} hasCertificate={hasCertificate} />
        {FILE_SOURCES.map((source) => (
          <Button
            key={source.id}
            type="button"
            variant="outline"
            onClick={() => setFileSource(source.id)}
            aria-label={`${source.label} — wgraj plik ${source.id === 'jpk_fa' ? 'JPK_FA' : 'CSV'}`}
            className={cn(CARD, source.id === 'jpk_fa' && 'col-span-2 xl:col-span-1')}
          >
            <CardBody
              icon={source.format === 'XML' ? RiFileCodeLine : RiFileExcel2Line}
              badges={
                <Badge variant="secondary" className="font-normal">
                  {source.format}
                </Badge>
              }
              title={source.label}
              description={source.description}
              action="Wgraj plik"
            />
          </Button>
        ))}
      </div>

      {fileSource ? (
        <FileImportDialog source={fileSource} tenantId={tenantId} onClose={() => setFileSource(null)} />
      ) : null}
    </section>
  );
}
