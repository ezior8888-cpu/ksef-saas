/**
 * Zarejestrowany adres podatnika do JPK_FA(4) — `Podmiot1/AdresPodmiotu`
 * (`etd:TAdresPolski1`, typy wspólne MF 2018/08/24). Schemat WYMAGA
 * województwa, powiatu, gminy, numeru domu, miejscowości i kodu pocztowego.
 *
 * Adres firmy w bazie to dwie linie tekstu („ul. X 12/3”, „00-001 Miasto”)
 * bez jednostek administracyjnych — nie da się z nich zbudować poprawnego
 * pliku. Źródłem jest rejestr GUS (BIR): to adres, który zna urząd, i jedyny,
 * który ma wszystkie wymagane pola.
 */

import { lookupCompanyByNip, type GusLookupResult } from '@/lib/gus/client';

export interface RegisteredAddress {
  voivodeship: string;
  county: string;
  commune: string;
  street?: string;
  buildingNumber: string;
  apartmentNumber?: string;
  city: string;
  postCode: string;
}

export class MissingIssuerAddressError extends Error {
  constructor() {
    super(
      'Nie udało się ustalić adresu firmy w rejestrze GUS (województwo, powiat, gmina) — JPK_FA go wymaga. Sprawdź NIP firmy w ustawieniach albo spróbuj później.',
    );
    this.name = 'MissingIssuerAddressError';
  }
}

const text = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * Adres z wyniku GUS albo `null`, gdy GUS nie zna firmy lub brakuje któregoś
 * wymaganego pola. Błąd sieci/GUS RZUCA — to sytuacja chwilowa i job ma ją
 * ponowić, a nie oznaczyć eksport jako nieudany na stałe.
 */
export function registeredAddressFrom(result: GusLookupResult): RegisteredAddress | null {
  if (result.kind === 'error') throw new Error(`GUS: ${result.message}`);
  if (result.kind === 'not-found') return null;
  const d = result.data;
  const address: RegisteredAddress = {
    voivodeship: text(d.voivodeship),
    county: text(d.county),
    commune: text(d.commune),
    street: text(d.street) || undefined,
    buildingNumber: text(d.buildingNumber),
    apartmentNumber: text(d.localNumber) || undefined,
    city: text(d.city),
    postCode: text(d.postalCode),
  };
  const required = [
    address.voivodeship,
    address.county,
    address.commune,
    address.buildingNumber,
    address.city,
    address.postCode,
  ];
  return required.every(Boolean) ? address : null;
}

export async function readIssuerRegisteredAddress(nip: string): Promise<RegisteredAddress | null> {
  return registeredAddressFrom(await lookupCompanyByNip(nip));
}
