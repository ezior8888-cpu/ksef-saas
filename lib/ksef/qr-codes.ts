/**
 * Generator kodów QR dla Trybu Offline24 — 2 payloady na fakturę: OFFLINE + CERTYFIKAT.
 *
 * Dokładny format komunikatów wg aktualnej dokumentacji MF może wymagać dopracowania.
 */

import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';

export interface QrPayloadData {
  invoiceNumber: string;
  issueDate: string;
  grossAmount: number;
  sellerNip: string;
  buyerNip: string;
  /** PEM klucza prywatnego lub para certyfikat+klucz (demo — zob. uwaga w signWithCertificate). */
  certificate: string;
  idempotencyKey: string;
}

export interface OfflineQrCodes {
  /** URL / treść zakodowana w kodzie OFFLINE. */
  offlinePayload: string;
  /** Dane dla kodu CERTYFIKAT. */
  certyfikatPayload: string;
}

/**
 * Generuje payloady dla obu kodów QR wymaganych w Trybie Offline24.
 */
export async function generateOfflineQrCodes(
  data: QrPayloadData,
): Promise<OfflineQrCodes> {
  const offlineData = {
    n: data.invoiceNumber,
    d: data.issueDate,
    g: data.grossAmount.toFixed(2),
    s: data.sellerNip,
    b: data.buyerNip,
    k: data.idempotencyKey.slice(0, 16),
  };

  const encoded = Buffer.from(JSON.stringify(offlineData)).toString('base64url');
  const offlinePayload = `https://ksef.mf.gov.pl/web/verify?d=${encoded}`;

  const dataToSign = `${data.invoiceNumber}|${data.issueDate}|${data.grossAmount.toFixed(2)}|${data.sellerNip}|${data.buyerNip}`;

  let signature: string;
  try {
    signature = await signWithCertificate(dataToSign, data.certificate);
  } catch {
    signature = `HASH:${Buffer.from(dataToSign, 'utf8').toString('base64url').slice(0, 64)}`;
  }

  const certyfikatPayload = `${dataToSign}|${signature.slice(0, 128)}`;

  return {
    offlinePayload,
    certyfikatPayload,
  };
}

// ============================================================================
// Sign with certificate private key (PEM)
// ============================================================================

/**
 * Zakłada PEM **klucza prywatnego** (RFC 7468 BEGIN PRIVATE KEY...).
 * Sam certyfikat (BEGIN CERTIFICATE...) nie nadaje się do `sign()` — wtedy przejdziesz w fallback HASH.
 *
 * Produkcja: przekazywać osobno `certificatePem` + `privateKeyPem`.
 */
async function signWithCertificate(
  data: string,
  pemMaterial: string,
): Promise<string> {
  try {
    const sign = createSign('RSA-SHA256');
    sign.update(data);
    sign.end();
    const buf = sign.sign(pemMaterial) as Buffer;
    return buf.toString('base64url');
  } catch (error) {
    throw new Error(
      `Sign failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
}
