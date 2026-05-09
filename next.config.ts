import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

const withSerwist = withSerwistInit({
  // Ścieżka do service worker (pełna implementacja: zadanie 17.3)
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // W dev SW jest wyłączony (nie blokuje hot reload)
  disable: process.env.NODE_ENV === 'development',
  // Dynamiczny re-rejestr SW po powrocie online
  reloadOnOnline: true,
});

/**
 * CSP w trybie Report-Only jako pierwszy krok roll-outu.
 *
 * Audyt #29: dopóki nie zbierzemy raportów z prod (przez `report-uri`) i nie
 * potwierdzimy, że żaden legitny flow nie jest blokowany, NIE przełączamy na
 * `Content-Security-Policy` (enforced). Po ~tygodniu na prod bez naruszeń —
 * wymień nazwę nagłówka i ten komentarz.
 *
 * Allowlist:
 *   - 'self' wszędzie poza fetchami zewnętrznymi.
 *   - script/style 'unsafe-inline' jest niezbędne dla Next.js inline bootstrap
 *     (theme boot, Sentry init, RSC hydration). Można później zacieśnić przez
 *     nonce'y, ale to wymaga osobnej iteracji w `app/layout.tsx`.
 *   - connect-src obejmuje Supabase REST + Realtime (WebSocket).
 *     Sentry leci przez tunnelRoute "/monitoring", więc 'self' wystarcza.
 *     R2 i Resend są używane wyłącznie po stronie serwera — nie dodajemy ich
 *     do client-side connect-src.
 *   - frame-ancestors 'none' = niemożliwe wbudowanie naszego dashboardu w iframe
 *     (chroni przed clickjackingiem; X-Frame-Options to legacy odpowiednik).
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS: { key: string; value: string }[] = [
  // Audyt #7 / #29: Referrer-Policy globalny — potwierdzamy intencję z layoutu
  // /accountant (no-referrer) na poziomie całej domeny. Mniej powierzchni do
  // wycieku tokenów / paths przez Referer.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  // Wymusza, że MIME nie jest "wnioskowany" przez przeglądarkę (np. text/html
  // w odpowiedzi na uploaded image → XSS).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy odpowiednik frame-ancestors 'none'. Trzymamy oba, bo niektóre
  // przeglądarki w przedsiębiorstwach wciąż preferują X-Frame-Options.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Wyłączamy wszystkie powerful features, których nie używamy. Włączymy
  // selektywnie, gdy pojawi się skaner QR / kamera do KSeF QR.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
  },
  // Report-Only — zbieramy violation reports zanim wymusimy CSP.
  { key: 'Content-Security-Policy-Report-Only', value: CSP_DIRECTIVES },
];

const PROD_ONLY_HEADERS: { key: string; value: string }[] = [
  // HSTS tylko na prod — w lokalnym dev na `http://localhost:3000` ustawienie
  // tego nagłówka prowadzi do trwałego cache'a HSTS w przeglądarce i
  // niemożliwości wejścia na cokolwiek po http przez 1 rok.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },

  // `xmllint-wasm` ładuje plik `xmllint.wasm` z fizycznego node_modules przez
  // `fs.readFileSync` + `import.meta.url`. Gdy Turbopack bundluje kod serwerowy,
  // tłumaczy ścieżki modułów na wirtualne `/ROOT/...`, przez co WASM nie da się
  // znaleźć w runtime i walidacja FA(3) XSD pada na `ENOENT xmllint.wasm`.
  //
  // `serverExternalPackages` wyłącza pakiet z bundle'a po stronie serwera -
  // Next robi zwykły `require('xmllint-wasm')` z node_modules z poprawnymi
  // ścieżkami na dysku. To samo podejście co dla `sharp`, `canvas` i innych
  // pakietów z natywnymi/WASM assetami.
  serverExternalPackages: ['xmllint-wasm'],

  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/:path*',
        headers: [
          ...SECURITY_HEADERS,
          ...(isProd ? PROD_ONLY_HEADERS : []),
        ],
      },
    ];
  },
};

export default withSentryConfig(withSerwist(withMDX(nextConfig)), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG ?? 'faktflow',

  project: process.env.SENTRY_PROJECT ?? 'javascript-nextjs',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: '/monitoring',

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
