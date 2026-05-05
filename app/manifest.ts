// app/manifest.ts
// Next.js generuje /manifest.webmanifest z tego pliku
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KSeF SaaS — Faktury',
    short_name: 'KSeF',
    description:
      'Wystawiaj faktury i wysyłaj do KSeF jednym kliknięciem',
    start_url: '/invoices',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0b',
    theme_color: '#000000',
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
  };
}
