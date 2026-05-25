import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Fraunces } from 'next/font/google';

import './globals.css';
import { AnalyticsProvider } from '@/components/analytics/analytics-provider';
import { SentryClientInit } from '@/components/sentry-client-init';
import { Toaster } from '@/components/ui/sonner';
import { THEME_BOOT_SCRIPT } from '@/lib/theme/theme';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Fraunces — display serif do Polish Editorial direction marketingu.
// `latin-ext` jest KRYTYCZNE — polskie znaki (ą, ć, ę, ł, ń, ó, ś, ź, ż)
// nie są w podstawowym `latin`. `opsz` = optical sizing dla naturalnych
// rozmiarów display, `SOFT` = wariacja miękkości krawędzi serifów.
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  axes: ['opsz', 'SOFT'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://ksef-saas.pl',
  ),
  title: 'KSeF SaaS',
  description: 'Faktury KSeF dla mikrofirm',
  // PWA / iOS (Safari) — manifest z `app/manifest.ts` nie wystarczy na iOS
  applicationName: 'KSeF SaaS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KSeF',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/icons/icon-192x192.png',
    shortcut: '/icons/icon-96x96.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#12131a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  colorScheme: 'dark light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full scroll-smooth antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Nie @import w globals.css — Tailwind rozwija CSS i @import musi być na początku pliku. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router; Material Symbols dla dashboardu */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans antialiased text-foreground">
        <SentryClientInit />
        <AnalyticsProvider>{children}</AnalyticsProvider>
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            classNames: {
              toast:
                'backdrop-blur-[24px] border border-white/55 dark:border-white/14 bg-white/75 dark:bg-[rgba(15,10,30,0.75)] shadow-[0_8px_32px_rgba(31,38,135,0.12)] rounded-2xl',
              title: 'font-semibold tracking-tight text-sm',
              description: 'text-muted-foreground text-xs',
            },
          }}
        />
      </body>
    </html>
  );
}
