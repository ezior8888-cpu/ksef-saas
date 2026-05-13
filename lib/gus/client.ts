import { request as httpsRequest, type RequestOptions } from 'node:https';
import { XMLParser } from 'fast-xml-parser';

/**
 * Klient GUS REGON - autouzupełnianie danych firmy po NIP.
 *
 * DLACZEGO WŁASNY KLIENT (nie `bir1`):
 * `bir1` korzysta z globalnego `fetch()`. Zostawienie tej zależności sprawia,
 * że pojedyncze środowiska (kontenery / serverless) czasem zwracają
 * "Empty response" - nie chcemy się z tym męczyć. Robimy więc surowy
 * `node:https.request` + ręczne parsowanie SOAP (templates skopiowane z bir1).
 *
 * Tryby:
 * - sandbox (bez klucza w env / placeholder): stare, zanonimizowane dane -
 *   ok do dev/onboardingu.
 * - production: wymaga prawdziwego klucza GUS (regon_bir@stat.gov.pl).
 *   Placeholder typu `xxxxxxxx...` w GUS_API_KEY jest wykrywany i ignorowany,
 *   żeby przypadkiem nie wysłać do produkcji GUS bezwartościowego klucza.
 */

const PUBLIC_KEY = 'abcde12345abcde12345'; // wbudowany klucz bir1 do sandboxa
const URL_TEST = 'wyszukiwarkaregontest.stat.gov.pl';
const URL_PROD = 'wyszukiwarkaregon.stat.gov.pl';
const PATH_BIR = '/wsBIR/UslugaBIRzewnPubl.svc';

// ═══════════════════════════════════════════════════════════════
// Typy publiczne
// ═══════════════════════════════════════════════════════════════

export interface GusCompanyData {
  nip: string;
  regon: string;
  name: string;
  postalCode: string;
  city: string;
  street: string;
  buildingNumber: string;
  localNumber?: string;
  voivodeship: string;
}

export type GusLookupResult =
  | { kind: 'found'; data: GusCompanyData }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

// ═══════════════════════════════════════════════════════════════
// SOAP templates (kopia z bir1, trywialne)
// ═══════════════════════════════════════════════════════════════

function tplZaloguj(key: string, endpoint: string): string {
  return `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${endpoint}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:Zaloguj><ns:pKluczUzytkownika>${key}</ns:pKluczUzytkownika></ns:Zaloguj>
  </soap:Body>
</soap:Envelope>`;
}

function tplDaneSzukajNip(nip: string, endpoint: string): string {
  return `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${endpoint}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <dat:Nip>${nip}</dat:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>
  </soap:Body>
</soap:Envelope>`;
}

// ═══════════════════════════════════════════════════════════════
// HTTP: node:https.request (żeby ominąć instrumentowany fetch Next.js)
// ═══════════════════════════════════════════════════════════════

interface RawSoapCallOptions {
  host: string;
  body: string;
  sid?: string;
}

function httpsPost({ host, body, sid }: RawSoapCallOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(body).toString(),
    };
    if (sid) headers['sid'] = sid;

    const opts: RequestOptions = {
      host,
      path: PATH_BIR,
      method: 'POST',
      headers,
      // 15s - GUS bywa wolny, ale nie chcemy wieszać Server Action na minutę
      timeout: 15000,
    };

    const req = httpsRequest(opts, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`GUS HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error('GUS request timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// Parsowanie SOAP response (kopia logiki z bir1/extract)
// ═══════════════════════════════════════════════════════════════

/** Wyciąga zawartość tagu `<...Result>...</...Result>` z SOAP-owej koperty.
 *  Używamy `[\s\S]` zamiast flagi `s` (dotAll), żeby regex chodził na
 *  każdym TS target (flaga `s` wymaga ES2018+). */
function unsoap(raw: string): string | null {
  const m = /<\S+Result>([\s\S]+?)<\/\S+Result>/.exec(raw);
  return m?.[1] ?? null;
}

const xmlParser = new XMLParser({ parseTagValue: false });

interface BirErrorPayload {
  ErrorCode?: string;
  ErrorMessageEn?: string;
  ErrorMessagePl?: string;
}

/** Sprawdza czy payload GUS niesie błąd aplikacyjny. */
function extractBirError(
  payload: Record<string, unknown> | undefined
): string | null {
  if (!payload) return null;
  const { ErrorCode, ErrorMessageEn, ErrorMessagePl } =
    payload as BirErrorPayload;
  if (ErrorCode || ErrorMessageEn || ErrorMessagePl) {
    return ErrorMessageEn || ErrorMessagePl || `BIR ErrorCode ${ErrorCode}`;
  }
  return null;
}

/** Dekoduje encje XML (&gt; → >, itp.) — GUS zwraca wewnętrzny XML zescape'owany. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wyszukuje firmę po NIP w GUS. Obsługuje retry dla transient errorów
 * (sandbox GUS potrafi czasami zwrócić pustkę/5xx).
 */
/** Rozpoznaje placeholder-ową wartość w env (np. `xxxxxxxxxxxx`) - wtedy
 *  udajemy że klucza nie ma i jedziemy na sandbox z kluczem publicznym.
 *  Bez tego produkcja GUS dostaje bezwartościowy klucz i zwraca pustkę. */
function isRealApiKey(v: string | undefined): v is string {
  if (!v) return false;
  const trimmed = v.trim();
  if (trimmed.length < 10) return false;
  if (/^x+$/i.test(trimmed)) return false;
  return true;
}

export async function lookupCompanyByNip(
  nip: string
): Promise<GusLookupResult> {
  // E2E mock — sandbox GUS bywa wolny/flaky, w testach blokuje cały flow
  // onboardingu. Aktywowane przez `E2E_MOCK_GUS=1` w `playwright.config.ts`.
  // Sprawdzamy dynamicznie (bez `import { isGusMocked }`) żeby nie wciągać
  // `lib/test-mode.ts` do bundla produkcyjnego.
  if (process.env.E2E_MOCK_GUS === '1') {
    return {
      kind: 'found',
      data: {
        nip,
        regon: '012345678',
        name: 'E2E Mock Sp. z o.o.',
        postalCode: '00-001',
        city: 'Warszawa',
        street: 'ul. Testowa',
        buildingNumber: '1',
        localNumber: undefined,
        voivodeship: 'MAZOWIECKIE',
      },
    };
  }

  const apiKeyRaw = process.env.GUS_API_KEY;
  const apiKey = isRealApiKey(apiKeyRaw) ? apiKeyRaw : undefined;
  const host = apiKey ? URL_PROD : URL_TEST;
  const endpoint = `https://${host}${PATH_BIR}`;
  const key = apiKey ?? PUBLIC_KEY;

  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 1) Login - świeży sid per próba. GUS ma krótkie sesje, a my
      //    wołamy tę funkcję raz na kilka minut, więc taniej logować się
      //    za każdym razem niż trzymać cache i debugować expired sessions.
      const loginRaw = await httpsPost({
        host,
        body: tplZaloguj(key, endpoint),
      });
      const sid = unsoap(loginRaw);
      if (!sid) {
        throw new Error('Login failed: no sid in response');
      }

      // 2) Search
      const searchRaw = await httpsPost({
        host,
        body: tplDaneSzukajNip(nip, endpoint),
        sid,
      });
      const innerXml = unsoap(searchRaw);
      if (!innerXml) {
        // Pusta koperta - traktujemy jako transient (nie ma pewności
        // czy GUS "powiedział" że nie ma firmy, czy po prostu padł).
        throw new Error('Empty SOAP response');
      }

      // 3) Parse - wewnętrzny XML jest escape'owany w SOAP-ie
      const decoded = decodeEntities(innerXml);
      const parsed = xmlParser.parse(decoded) as {
        root?: { dane?: Record<string, unknown> };
      };
      const dane = parsed.root?.dane;

      // Brak wyników = GUS nie ma tej firmy (autorytatywne "not found").
      if (!dane) {
        return { kind: 'not-found' };
      }

      // GUS potrafi zwrócić błąd aplikacyjny (np. "No data found") w polach
      // ErrorCode/ErrorMessage zamiast zwykłego rekordu.
      const birErr = extractBirError(dane);
      if (birErr) {
        if (/no data found/i.test(birErr)) {
          return { kind: 'not-found' };
        }
        throw new Error(`GUS: ${birErr}`);
      }

      const r = dane as Record<string, string | undefined>;

      return {
        kind: 'found',
        data: {
          nip: r.Nip ?? nip,
          regon: r.Regon ?? '',
          name: r.Nazwa ?? '',
          postalCode: r.KodPocztowy ?? '',
          city: r.Miejscowosc ?? '',
          street: r.Ulica ?? '',
          buildingNumber: r.NrNieruchomosci ?? '',
          localNumber: r.NrLokalu || undefined,
          voivodeship: r.Wojewodztwo ?? '',
        },
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        console.warn(
          `[gus] attempt ${attempt}/${maxAttempts} failed, retrying:`,
          (err as Error).message
        );
        await sleep(attempt * 500);
      }
    }
  }

  console.error('[gus] lookup failed after retries', lastError);
  return {
    kind: 'error',
    message:
      lastError instanceof Error ? lastError.message : 'Nieznany błąd GUS',
  };
}
