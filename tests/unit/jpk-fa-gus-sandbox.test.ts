import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gus = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('@/lib/gus/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/gus/client')>()),
  lookupCompanyByNip: gus.lookup,
}));

import { readIssuerRegisteredAddress } from '@/lib/exports/issuer-address';
import { gusUsesSandbox } from '@/lib/gus/client';

/**
 * JPK_FA (#91) bierze adres siedziby z GUS. Bez prawdziwego `GUS_API_KEY`
 * klient po cichu pyta TESTOWĄ bazę GUS („stare, zanonimizowane dane”) —
 * do 01.10.2026 taki adres trafiłby do pliku dla urzędu. Przy produkcyjnym
 * KSeF ma być odmowa, a nie dane testowe.
 */

const ADRES = {
  kind: 'found' as const,
  data: {
    nip: '5260001246', regon: '012345678', name: 'Firma', postalCode: '00-001', city: 'Warszawa',
    street: 'ul. Testowa', buildingNumber: '1', voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Śródmieście',
  },
};
const KLUCZ = 'a1b2c3d4e5f6a7b8c9d0';

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gus.lookup.mockReset().mockResolvedValue(ADRES);
  log = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  log.mockRestore();
});

describe('tryb GUS', () => {
  it.each([
    [{}, true],
    [{ GUS_API_KEY: 'xxxxxxxxxxxxxxxxxxxxx' }, true], // placeholder z .env.example
    [{ GUS_API_KEY: 'krotki' }, true],
    [{ GUS_API_KEY: KLUCZ }, false],
    [{ E2E_MOCK_GUS: '1' }, false],
  ])('%j → sandbox: %s', (env, sandbox) => {
    expect(gusUsesSandbox(env)).toBe(sandbox);
  });
});

describe('adres siedziby do JPK_FA', () => {
  it('produkcyjny KSeF bez klucza GUS — null, bez pytania GUS, z wpisem w logu', async () => {
    expect(await readIssuerRegisteredAddress('5260001246', { KSEF_ENV: 'production' })).toBeNull();
    expect(gus.lookup).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0]?.[0])).toContain('GUS_API_KEY');
  });

  it('produkcyjny KSeF z kluczem — adres z GUS', async () => {
    const a = await readIssuerRegisteredAddress('5260001246', { KSEF_ENV: 'production', GUS_API_KEY: KLUCZ });
    expect(a).toMatchObject({ voivodeship: 'MAZOWIECKIE', county: 'Warszawa', commune: 'Śródmieście' });
    expect(gus.lookup).toHaveBeenCalledWith('5260001246');
  });

  it.each([{ KSEF_ENV: 'test' }, { KSEF_ENV: 'demo' }, {}])('środowisko testowe %j — sandbox wolno (dane i tak testowe)', async (env) => {
    expect(await readIssuerRegisteredAddress('5260001246', env)).not.toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
});
