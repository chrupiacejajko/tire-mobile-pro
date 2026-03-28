const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;

  for (let i = 0; i < maxLen; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return diff === 0;
}

function normalizeSignature(signature: string): string {
  return signature.trim().replace(/^sha256=/i, '').toLowerCase();
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export function matchesSharedSecret(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  return constantTimeEqual(provided.trim(), expected);
}

export async function createHmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

export async function verifyHmacSha256HexSignature(
  payload: string,
  providedSignature: string | null,
  secret: string,
): Promise<boolean> {
  if (!providedSignature) return false;

  const expectedSignature = await createHmacSha256Hex(payload, secret);
  return constantTimeEqual(
    normalizeSignature(providedSignature),
    expectedSignature,
  );
}
