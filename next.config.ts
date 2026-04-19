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

export default nextConfig;
