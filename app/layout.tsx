import type { Metadata, Viewport } from 'next';
import {
  Geist,
  Geist_Mono,
  Fraunces,
  Inter,
  IBM_Plex_Mono,
} from 'next/font/google';

// Ikony panelu z własnego serwera (pakiet `material-symbols`, Apache-2.0).
// Do 15.10.2026 arkusz i czcionka szły z fonts.googleapis.com / fonts.gstatic.com
// na KAŻDEJ stronie — adres IP odwiedzającego trafiał do Google bez zgody
// (LG München I, 3 O 17493/20: 100 € zadośćuczynienia, potem fala wezwań).
// `next/font/google` pobiera czcionki przy budowaniu, ale ikon Material Symbols
// nie obsługuje — stąd pakiet. Pilnuje: tests/unit/bez-czcionek-google.test.ts.
import 'material-symbols/outlined.css';
import './globals.css';
import { AnalyticsProvider } from '@/components/analytics/analytics-provider';
import { SentryClientInit } from '@/components/sentry-client-init';
import { Toaster } from '@/components/ui/sonner';
import { THEME_BOOT_SCRIPT } from '@/lib/theme/theme';
import { siteUrl } from '@/lib/site';

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

// Typografia panelu (prototyp „FaktFlow Dashboard"): Inter na interfejs,
// IBM Plex Mono na liczby, NIP-y, numery faktur i daty — dzięki stałej
// szerokości znaku kwoty w kolumnach tabel wyrównują się do przecinka.
// `latin-ext` jest KRYTYCZNE dla polskich znaków (ą, ć, ę, ł, ń, ó, ś, ź, ż).
// Fonty są ładowane globalnie, ale stosowane TYLKO w `.ff-dashboard` —
// marketing zostaje na Geist.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  // Marka to FaktFlow. „KSeF SaaS” (nazwa robocza) łączyła się z nazwą
  // państwowego systemu i mogła sugerować produkt Ministerstwa Finansów.
  title: 'FaktFlow',
  description: 'Faktury KSeF dla mikrofirm',
  // PWA / iOS (Safari) — manifest z `app/manifest.ts` nie wystarczy na iOS
  applicationName: 'FaktFlow',
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
  /**
   * Te same kolory co `--ff-bg` w `app/globals.css` i co `theme_color`
   * w `app/manifest.ts`. Do września 2026 były trzy różne zestawy w trzech
   * plikach (`#f4f4f5` tutaj, `#000000` w manifeście, `#f7f8fa` w arkuszu),
   * więc pasek stanu telefonu miał inny odcień niż tło strony pod nim.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${inter.variable} ${ibmPlexMono.variable} h-full scroll-smooth antialiased`}
    >
      <head>
        {/* Klasa `dark` NIE jest już zaszyta na <html> (było tak do 29.08.2026).
            Motyw domyślny to jasny; ten skrypt dokłada `dark` przed pierwszym
            malowaniem, gdy klient wybrał ciemny. Kolejność ma znaczenie:
            skrypt musi być pierwszym elementem <head>. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
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
