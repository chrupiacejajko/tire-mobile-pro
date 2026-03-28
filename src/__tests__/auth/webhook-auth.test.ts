import { describe, expect, it } from 'vitest';
import {
  createHmacSha256Hex,
  matchesSharedSecret,
  verifyHmacSha256HexSignature,
} from '@/lib/security/webhook-auth';

describe('matchesSharedSecret', () => {
  it('matches identical shared secret values', () => {
    expect(matchesSharedSecret('secret-123', 'secret-123')).toBe(true);
  });

  it('rejects missing shared secret header', () => {
    expect(matchesSharedSecret(null, 'secret-123')).toBe(false);
  });

  it('rejects different shared secret values', () => {
    expect(matchesSharedSecret('wrong-secret', 'secret-123')).toBe(false);
  });
});

describe('verifyHmacSha256HexSignature', () => {
  const secret = 'test-satisgps-secret';
  const payload = JSON.stringify({
    plate: 'ZS821SK',
    lat: 53.4285,
    lng: 14.5528,
  });

  it('accepts exact hex HMAC signature', async () => {
    const signature = await createHmacSha256Hex(payload, secret);
    await expect(
      verifyHmacSha256HexSignature(payload, signature, secret),
    ).resolves.toBe(true);
  });

  it('accepts sha256-prefixed HMAC signature', async () => {
    const signature = await createHmacSha256Hex(payload, secret);
    await expect(
      verifyHmacSha256HexSignature(payload, `sha256=${signature}`, secret),
    ).resolves.toBe(true);
  });

  it('rejects signature for modified payload', async () => {
    const signature = await createHmacSha256Hex(payload, secret);
    await expect(
      verifyHmacSha256HexSignature(`${payload} `, signature, secret),
    ).resolves.toBe(false);
  });

  it('rejects missing signature header', async () => {
    await expect(
      verifyHmacSha256HexSignature(payload, null, secret),
    ).resolves.toBe(false);
  });

  it('rejects wrong secret', async () => {
    const signature = await createHmacSha256Hex(payload, secret);
    await expect(
      verifyHmacSha256HexSignature(payload, signature, 'wrong-secret'),
    ).resolves.toBe(false);
  });
});
