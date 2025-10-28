import {
  encrypt,
  decrypt,
  generateSecureToken,
  hashPassword,
  comparePassword,
} from '../../../src/utils/encryption';

const SAMPLE_TEXT = 'Protected health information';

describe('encryption utilities', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('encrypts and decrypts text symmetrically', () => {
    const encrypted = encrypt(SAMPLE_TEXT);
    expect(encrypted).not.toEqual(SAMPLE_TEXT);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(SAMPLE_TEXT);
  });

  it('throws when decrypting malformed payloads', () => {
    expect(() => decrypt('malformed-payload')).toThrow('Failed to decrypt data');
  });

  it('generates secure random tokens', () => {
    const tokenA = generateSecureToken();
    const tokenB = generateSecureToken();

    expect(tokenA).toHaveLength(64); // default 32 bytes => 64 hex chars
    expect(tokenB).toHaveLength(64);
    expect(tokenA).not.toEqual(tokenB);
  });

  it('hashes and verifies passwords using bcrypt', async () => {
    const password = 'StrongPass!123';
    const hash = await hashPassword(password);

    expect(hash).not.toEqual(password);
    expect(await comparePassword(password, hash)).toBe(true);
    expect(await comparePassword('wrong', hash)).toBe(false);
  });
});
