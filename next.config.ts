import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default withSentryConfig(nextConfig, {
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
  tunnelRoute: "/monitoring",

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
