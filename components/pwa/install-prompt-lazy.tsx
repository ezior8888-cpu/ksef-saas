'use client';

import dynamic from 'next/dynamic';

/**
 * InstallPrompt jest pokazywany dopiero po 30 s i tylko na PWA-installable
 * przeglądarkach — nie ma sensu wciągać `framer-motion` + `lucide-react` w
 * initial client bundle layoutu. `next/dynamic({ ssr: false })` rozdziela ten
 * kod do osobnego chunka ładowanego dopiero gdy hooki PWA dadzą `canInstall`.
 */
export const InstallPrompt = dynamic(
  () =>
    import('./install-prompt').then((m) => ({
      default: m.InstallPrompt,
    })),
  { ssr: false, loading: () => null },
);
