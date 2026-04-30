import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';
import { SentryClientInit } from '@/components/sentry-client-init';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** Ta sama logika co w `ThemeToggle`: tylko `light`|`dark`; reszta → system UI. */
const THEME_BOOT =
  `(function(){try{var r=localStorage.getItem('theme');var mq=window.matchMedia('(prefers-color-scheme: dark)').matches;var stored=r==='light'||r==='dark'?r:null;var t=stored!=null?stored:(mq?'dark':'light');var el=document.documentElement;el.classList.toggle('dark',t==='dark');el.style.colorScheme=t==='dark'?'dark':'light';}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'KSeF SaaS',
  description: 'Fakturowanie zgodne z KSeF 2.0',
};

export const viewport: Viewport = {
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
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-screen font-sans antialiased text-foreground">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <SentryClientInit />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
