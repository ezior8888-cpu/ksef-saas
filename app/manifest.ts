// app/manifest.ts
// Next.js generuje /manifest.webmanifest z tego pliku
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KSeF SaaS — Faktury',
    short_name: 'KSeF',
    description:
      'Wystawiaj faktury i wysyłaj do KSeF jednym kliknięciem',
    /**
     * `/dashboard`, nie `/invoices`. `APP_HOME` w `lib/supabase/middleware.ts`
     * wskazuje dashboard, a od 30.08.2026 to właśnie on JEST ekranem agenta.
     * Skrót w manifeście prowadził gdzie indziej niż logowanie, więc aplikacja
     * dodana do ekranu głównego otwierała się w innym miejscu niż ta sama
     * aplikacja otwarta z przeglądarki.
     */
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    /**
     * Kolory z ery ciemnego motywu (`#0a0a0b` / `#000000`) — motyw domyślny
     * jest jasny od 30.08.2026. Na telefonie widać to wprost: przy dodaniu do
     * ekranu głównego ekran startowy błyskał czernią, a pasek stanu w trybie
     * `standalone` zostawał czarny nad białym interfejsem.
     * Wartości zgodne z `--ff-bg` i `--ff-surface` z `app/globals.css`.
     */
    background_color: '#f7f8fa',
    theme_color: '#ffffff',
    lang: 'pl-PL',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
      { src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
      { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Nowa faktura',
        short_name: 'Nowa',
        description: 'Wystaw fakturę i wyślij do KSeF',
        url: '/invoices/new',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }],
      },
      {
        name: 'Skrzynka odbiorcza',
        short_name: 'Inbox',
        description: 'Faktury otrzymane przez KSeF',
        url: '/inbox',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }],
      },
    ],
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'photo',
            accept: [
              'image/jpeg',
              'image/png',
              'image/webp',
              'application/pdf',
            ],
          },
        ],
      },
    },
  };
}
