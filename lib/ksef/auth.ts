import { readFileSync } from 'node:fs';
import { Crypto } from '@peculiar/webcrypto';
import * as xadesjs from 'xadesjs';
import * as XmlCore from 'xml-core';
import { DOMParser, XMLSerializer, DOMImplementation } from '@xmldom/xmldom';
import { ksefFetch } from './client';
import type {
  AuthChallengeResponse,
  AuthTokenResponse,
  AuthStatusResponse,
  AccessTokenResponse,
  KsefEnvironment,
} from '@/types/ksef';

// Jednorazowa konfiguracja xadesjs dla Node.js:
// 1. WebCrypto polyfill (do kryptografii)
// 2. DOMParser/XMLSerializer (xml-core nie potrafi sam ich zaimportować)
xadesjs.Application.setEngine('NodeJS', new Crypto());
(XmlCore as unknown as {
  setNodeDependencies: (deps: Record<string, unknown>) => void;
}).setNodeDependencies({
  DOMParser,
  XMLSerializer,
  DOMImplementation: new DOMImplementation(),
});

export interface KsefCredentials {
  /** NIP kontekstu (firmy, dla której robimy operacje) */
  nip: string;
  /** PEM-encoded certyfikat (np. odczytany z test-cert.pem) */
  certificatePem: string;
  /** PEM-encoded klucz prywatny (np. odczytany z test-key.pem) */
  privateKeyPem: string;
}

export interface KsefAuthSession {
  /** Access token do wywołań API (bearer) */
  accessToken: string;
  /** Refresh token do odnowienia dostępu */
  refreshToken: string;
  /** Kiedy accessToken wygasa (timestamp) */
  accessTokenExpiresAt: number;
  /** Kiedy refreshToken wygasa (timestamp) */
  refreshTokenExpiresAt: number;
  /** NIP kontekstu */
  nip: string;
}

/**
 * Konwertuje PEM (BEGIN/END headers + base64) na ArrayBuffer (dla WebCrypto).
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s/g, '');
  const buffer = Buffer.from(base64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/**
 * Wyciąga ciało certyfikatu jako czysty base64 (bez headers, bez whitespace).
 * Używane dla <X509Certificate> i xades:SigningCertificate.
 */
function certPemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s/g, '');
}

/**
 * Krok 1: pobierz challenge od KSeF.
 */
async function fetchChallenge(env?: KsefEnvironment): Promise<AuthChallengeResponse> {
  return ksefFetch<AuthChallengeResponse>('/auth/challenge', {
    method: 'POST',
    env,
  });
}

/**
 * Krok 2-3: zbuduj XML AuthTokenRequest i podpisz go profilem XAdES-BES.
 *
 * Różnica vs zwykły XML-DSig:
 * - dorzuca <xades:QualifyingProperties> z SigningTime i SigningCertificate
 * - dodaje drugą <ds:Reference> wskazującą na SignedProperties
 * - wymagane przez KSeF 2.0 (profil zgodny z ETSI TS 101 903)
 */
async function buildSignedAuthXml(
  challenge: AuthChallengeResponse,
  credentials: KsefCredentials
): Promise<string> {
  const { nip, certificatePem, privateKeyPem } = credentials;

  const ksefNamespace = 'http://ksef.mf.gov.pl/auth/token/2.0';

  // KSeF 2.0 struktura (różna od 1.0):
  // - brak atrybutu Id na root
  // - ContextIdentifier ma bezpośrednio <Nip>/<InternalId>/<NipVatUe>/<PeppolId>
  const unsignedXml = `<?xml version="1.0" encoding="UTF-8"?>
<ns3:AuthTokenRequest xmlns:ns3="${ksefNamespace}">
  <ns3:Challenge>${challenge.challenge}</ns3:Challenge>
  <ns3:ContextIdentifier>
    <ns3:Nip>${nip}</ns3:Nip>
  </ns3:ContextIdentifier>
  <ns3:SubjectIdentifierType>certificateSubject</ns3:SubjectIdentifierType>
  <ns3:AuthorizationPolicy>
    <ns3:AllowedIps>
      <ns3:Ip4Address>${challenge.clientIp}</ns3:Ip4Address>
    </ns3:AllowedIps>
  </ns3:AuthorizationPolicy>
</ns3:AuthTokenRequest>`;

  const doc = new DOMParser().parseFromString(unsignedXml, 'application/xml');

  // Import prywatnego klucza do WebCrypto
  const engine = xadesjs.Application.crypto;
  const privateKey = await engine.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const certBase64 = certPemToBase64(certificatePem);

  // Podpisanie XAdES-BES
  const signedXml = new xadesjs.SignedXml();
  const signature = await signedXml.Sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    doc as unknown as Document,
    {
      references: [
        {
          hash: 'SHA-256',
          transforms: ['enveloped', 'exc-c14n'],
          // Pusty URI = "cały dokument bez <ds:Signature>" (enveloped transform).
          // KSeF 2.0 tak to interpretuje; unikamy atrybutu Id niezadeklarowanego w XSD.
          uri: '',
        },
      ],
      x509: [certBase64],
      signingCertificate: certBase64,
    }
  );

  // Dokleić <ds:Signature> do korzenia AuthTokenRequest
  const sigElement = signature.GetXml();
  if (!sigElement) {
    throw new Error('xadesjs: nie udało się wygenerować elementu podpisu');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.documentElement!.appendChild(sigElement as any);

  const serialized = new XMLSerializer().serializeToString(doc);

  // DEBUG: loguj podpisany XML jeśli DEBUG_KSEF=1
  if (process.env.DEBUG_KSEF === '1') {
    console.log('\n--- PODPISANY XML ---\n' + serialized + '\n--- KONIEC ---\n');
  }

  return serialized;
}

/**
 * Krok 4: wyślij podpisany XML do KSeF.
 */
async function submitSignedAuth(
  signedXml: string,
  env?: KsefEnvironment
): Promise<AuthTokenResponse> {
  return ksefFetch<AuthTokenResponse>('/auth/xades-signature', {
    method: 'POST',
    headers: {
      // KSeF 2.0 wymaga tego konkretnego mediatype dla podpisanego XAdES
      'Content-Type': 'application/xades+xml',
    },
    body: signedXml, // raw XML body, ksefFetch nie robi JSON.stringify na stringach
    env,
  });
}

/**
 * Krok 5: polling statusu żądania uwierzytelniania.
 */
async function pollAuthStatus(
  referenceNumber: string,
  env?: KsefEnvironment,
  maxAttempts = 20,
  intervalMs = 1000
): Promise<AuthStatusResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await ksefFetch<AuthStatusResponse>(`/auth/${referenceNumber}`, {
      env,
    });

    // Kody statusu KSeF:
    // 100 - w trakcie
    // 200 - zaakceptowane
    // 400 - odrzucone
    if (status.status.code === 200) return status;
    if (status.status.code >= 400) {
      throw new Error(`KSeF auth failed: ${status.status.description}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`KSeF auth polling timed out after ${maxAttempts} attempts`);
}

/**
 * Krok 6: wymień authenticationToken na accessToken.
 */
async function redeemAuthToken(
  authenticationToken: string,
  env?: KsefEnvironment
): Promise<AccessTokenResponse> {
  return ksefFetch<AccessTokenResponse>('/auth/token/redeem', {
    method: 'POST',
    accessToken: authenticationToken,
    env,
  });
}

/**
 * GŁÓWNA FUNKCJA: pełny flow autentykacji XAdES.
 * Zwraca gotową sesję do robienia kolejnych wywołań.
 */
export async function authenticateWithXades(
  credentials: KsefCredentials,
  env?: KsefEnvironment
): Promise<KsefAuthSession> {
  // 1. Challenge
  const challenge = await fetchChallenge(env);

  // 2. Podpisany XML (XAdES-BES)
  const signedXml = await buildSignedAuthXml(challenge, credentials);

  // 3. Submit
  const { referenceNumber } = await submitSignedAuth(signedXml, env);

  // 4. Polling statusu
  await pollAuthStatus(referenceNumber, env);

  // 5. Redeem -> accessToken
  // UWAGA: status.authenticationToken.token z pollAuthStatus można użyć też bezpośrednio
  const statusWithToken = await ksefFetch<AuthStatusResponse>(
    `/auth/${referenceNumber}`,
    { env }
  );
  const tokens = await redeemAuthToken(statusWithToken.authenticationToken.token, env);

  return {
    accessToken: tokens.accessToken.token,
    refreshToken: tokens.refreshToken.token,
    accessTokenExpiresAt: new Date(tokens.accessToken.validUntil).getTime(),
    refreshTokenExpiresAt: new Date(tokens.refreshToken.validUntil).getTime(),
    nip: credentials.nip,
  };
}

/**
 * Helper: ładowanie credentials z plików PEM (dev / test).
 * W produkcji credentials pochodzą z tabeli tenants (zaszyfrowane w bazie).
 */
export function loadCredentialsFromFiles(
  nip: string,
  certPath: string,
  keyPath: string
): KsefCredentials {
  return {
    nip,
    certificatePem: readFileSync(certPath, 'utf8'),
    privateKeyPem: readFileSync(keyPath, 'utf8'),
  };
}
