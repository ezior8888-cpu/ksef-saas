import type { BuyerParty, SellerParty } from '@/types/invoice';
import type { BuyerB2C, BuyerData } from '@/types/invoice-types';

/**
 * Dane nabywcy z formularza domenowego ({@link BuyerData}) → struktura dla FA(3).
 */
export function buyerPartyFromBuyerData(buyer: BuyerData): BuyerParty {
  if (buyer.type === 'b2b') {
    return {
      nip: buyer.nip.replace(/\s+/g, ''),
      name: buyer.name,
      address: {
        countryCode: buyer.address.countryCode || 'PL',
        addressLine1: buyer.address.addressLine1,
        addressLine2: buyer.address.addressLine2,
      },
      email: buyer.email,
      jst: 2,
      gv: 2,
    };
  }

  const b = buyer as BuyerB2C;

  const base: BuyerParty = {
    name: b.name,
    address: {
      countryCode: b.address.countryCode || 'PL',
      addressLine1: b.address.addressLine1,
      addressLine2: b.address.addressLine2,
    },
    email: b.email,
    jst: 2,
    gv: 2,
  };

  switch (b.idType) {
    case 'pesel':
      return { ...base, pesel: (b.pesel ?? '').replace(/\D/g, '') };
    case 'no_id':
      return { ...base, noIdMarker: true };
    case 'id_card':
    case 'passport':
      return {
        ...base,
        nrInny: (b.idNumber ?? '').trim() || undefined,
      };
    default:
      return base;
  }
}

/** {@link import('@/types/invoice-types').SellerData} → Podmiot1. */
export function sellerPartyFromSellerData(s: {
  nip: string;
  name: string;
  address: {
    addressLine1: string;
    addressLine2: string;
    countryCode: string;
  };
  email?: string;
}): SellerParty {
  return {
    nip: s.nip.replace(/\s+/g, ''),
    name: s.name,
    address: {
      countryCode: s.address.countryCode || 'PL',
      addressLine1: s.address.addressLine1 || ' ',
      addressLine2: s.address.addressLine2 || ' ',
    },
    email: s.email,
  };
}
