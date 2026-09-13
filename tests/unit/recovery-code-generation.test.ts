import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ randomInt: vi.fn<(max: number) => number>() }));
vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomInt: mocks.randomInt,
}));

import {
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
  verifyRecoveryCode,
} from '@/lib/auth/backup-codes';

beforeEach(() => {
  mocks.randomInt.mockReset();
  mocks.randomInt.mockImplementation(() => { throw new Error('Unexpected randomInt call'); });
});

describe('recovery code generation', () => {
  it('draws each character directly with an exclusive alphabet bound', () => {
    for (const index of [0, 31, 1, 30, 2, 29, 3, 28, 4, 27]) mocks.randomInt.mockReturnValueOnce(index);
    expect(generateRecoveryCode()).toBe('A9B8C-7D6E5');
    expect(mocks.randomInt).toHaveBeenCalledTimes(10);
    expect(mocks.randomInt.mock.calls).toEqual(Array.from({ length: 10 }, () => [32]));
  });

  it('preserves every existing alphabet character and the five-plus-five format', () => {
    for (const [index, character] of [...'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'].entries()) {
      mocks.randomInt.mockReturnValue(index);
      expect(generateRecoveryCode()).toBe(character.repeat(5) + '-' + character.repeat(5));
    }
  });

  it('keeps eight recovery codes per enrollment', () => {
    mocks.randomInt.mockReturnValue(0);
    const codes = generateRecoveryCodes();
    expect(RECOVERY_CODE_COUNT).toBe(8);
    expect(codes).toEqual(Array.from({ length: 8 }, () => 'AAAAA-AAAAA'));
    expect(mocks.randomInt).toHaveBeenCalledTimes(80);
  });

  it('continues to accept a stored code from the existing scrypt format', () => {
    // Public synthetic fixture created with the pre-change hash format.
    const salt = '00112233445566778899aabbccddeeff';
    const hash = 'dd208501d447ce53559d98108d8117cf2577efd0ec6ae327df352de3c3501b7d';
    expect(verifyRecoveryCode('ABCDE-FGHJK', hash, salt)).toBe(true);
    expect(verifyRecoveryCode('abcde fghjk', hash, salt)).toBe(true);
    expect(verifyRecoveryCode('ABCDE-FGHJM', hash, salt)).toBe(false);
    expect(mocks.randomInt).not.toHaveBeenCalled();
  });

  it('hashes and verifies newly generated codes without changing storage sizes', () => {
    mocks.randomInt.mockReturnValue(31);
    const code = generateRecoveryCode();
    const stored = hashRecoveryCode(code);
    expect(stored.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(stored.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyRecoveryCode(code, stored.hash, stored.salt)).toBe(true);
    expect(verifyRecoveryCode('99999-99998', stored.hash, stored.salt)).toBe(false);
  });
});
