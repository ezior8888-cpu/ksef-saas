/**
 * KOD II dla faktury offline, według specyfikacji MF:
 * https://github.com/CIRFMF/ksef-api/blob/main/kody-qr.md
 *
 * Ten moduł buduje i podpisuje link. Nie dowodzi, że klucz należy do aktywnego
 * certyfikatu KSeF typu Offline ani że wystawca ma uprawnienia. Do czasu
 * wdrożenia bezpiecznego provisioningu takiego certyfikatu nie wywołujemy go
 * w produkcyjnej ścieżce kolejki/PDF.
 */

import { constants, createPrivateKey, sign } from 'node:crypto';

import { hexToBase64Url, qrVerificationBaseUrl } from './qr-verification';
import type { KsefEnvironment } from '@/types/ksef';

export interface OfflineCertificateQrInput {
  env: KsefEnvironment;
  /** Wąski, obsługiwany przez aplikację kontekst KSeF: Nip. */
  contextNip: string;
  /** NIP sprzedawcy z Podmiot1; może się różnić od kontekstu. */
  sellerNip: string;
  /** Numer seryjny certyfikatu KSeF typu Offline, wielkimi cyframi hex. */
  certificateSerialNumber: string;
  /** SHA-256 dokładnych bajtów XML faktury, zapis szesnastkowy. */
  sha256Hex: string;
  /** Klucz prywatny należący do powyższego certyfikatu typu Offline. */
  privateKeyPem: string;
}

function nipSegment(raw: string): string {
  const nip = raw.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(nip)) throw new Error('Niepoprawny NIP w linku QR KSeF');
  return nip;
}

/**
 * Podpisuje fragment URL bez `https://` i bez końcowego ukośnika. Klucz RSA
 * używa PSS/SHA-256/MGF1-SHA-256 z 32-bajtową solą, EC używa P-256/SHA-256
 * i zalecanego formatu IEEE P1363 (R || S).
 */
export function certificateVerificationUrlForOfflineInvoice(input: OfflineCertificateQrInput): string {
  const contextNip = nipSegment(input.contextNip);
  const sellerNip = nipSegment(input.sellerNip);
  if (!/^[0-9A-F]+$/.test(input.certificateSerialNumber)) {
    throw new Error('Niepoprawny numer seryjny certyfikatu KSeF');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(input.sha256Hex)) {
    throw new Error('Niepoprawny SHA-256 XML faktury');
  }

  const hash = hexToBase64Url(input.sha256Hex);
  const host = new URL(qrVerificationBaseUrl(input.env)).host;
  const unsigned = `${host}/certificate/Nip/${contextNip}/${sellerNip}/${input.certificateSerialNumber}/${hash}`;
  const key = createPrivateKey(input.privateKeyPem);
  const message = Buffer.from(unsigned, 'utf8');

  let signature: Buffer;
  if (key.asymmetricKeyType === 'rsa') {
    if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      throw new Error('Klucz RSA certyfikatu Offline musi mieć co najmniej 2048 bitów');
    }
    signature = sign('sha256', message, {
      key,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    });
  } else if (key.asymmetricKeyType === 'ec') {
    const curve = key.asymmetricKeyDetails?.namedCurve;
    if (curve !== 'prime256v1' && curve !== 'secp256r1') {
      throw new Error('Klucz EC certyfikatu Offline musi używać krzywej P-256');
    }
    signature = sign('sha256', message, { key, dsaEncoding: 'ieee-p1363' });
  } else {
    throw new Error('Nieobsługiwany algorytm klucza certyfikatu Offline');
  }

  return `https://${unsigned}/${signature.toString('base64url')}`;
}
