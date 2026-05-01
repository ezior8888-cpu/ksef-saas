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

/** Domyślnie ciemny; zapisany wybór w `localStorage` ma pierwszeństwo (jak ThemeToggle). */
const THEME_BOOT =
  `(function(){try{var r=localStorage.getItem('theme');var stored=r==='light'||r==='dark'?r:null;var t=stored!=null?stored:'dark';var el=document.documentElement;el.classList.toggle('dark',t==='dark');el.style.colorScheme=t==='dark'?'dark':'light';}catch(e){}})();`;

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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-screen font-sans antialiased text-foreground">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <SentryClientInit />
        {children}
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
