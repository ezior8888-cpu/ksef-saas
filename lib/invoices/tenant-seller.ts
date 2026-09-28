import type { SellerData } from '@/types/invoice-types';
import { validateNipChecksum } from '@/lib/xml/invoice-calculator';

/** One canonical seller snapshot for forms and Server Actions. */
export function sellerFromTenantProfile(raw: {
  nip: unknown;
  name: unknown;
  address_json: unknown;
}): SellerData | null {
  const addr = raw.address_json && typeof raw.address_json === 'object' &&
    !Array.isArray(raw.address_json)
    ? raw.address_json as Record<string, unknown>
    : null;
  const nip = typeof raw.nip === 'string' ? raw.nip.replace(/\D/g, '') : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const country = addr?.countryCode == null ? 'PL' :
    typeof addr.countryCode === 'string' ? addr.countryCode.trim().toUpperCase() : '';
  const line1 = typeof addr?.addressLine1 === 'string' ? addr.addressLine1.trim() : '';
  const line2 = typeof addr?.addressLine2 === 'string' ? addr.addressLine2.trim() : '';
  if (!/^\d{10}$/.test(nip) || !validateNipChecksum(nip) || !name ||
      !/^[A-Z]{2}$/.test(country) || !line1 || !line2) return null;

  return {
    nip,
    name,
    address: {
      countryCode: country,
      addressLine1: line1,
      addressLine2: line2,
    },
  };
}

/** The browser may echo this identity, but cannot decide its legal content. */
export function matchesTenantSeller(supplied: SellerData, tenantSeller: SellerData): boolean {
  return supplied.nip.replace(/\D/g, '') === tenantSeller.nip &&
    supplied.name.trim() === tenantSeller.name &&
    supplied.address.countryCode.toUpperCase() === tenantSeller.address.countryCode &&
    supplied.address.addressLine1.trim() === tenantSeller.address.addressLine1 &&
    supplied.address.addressLine2.trim() === tenantSeller.address.addressLine2;
}
