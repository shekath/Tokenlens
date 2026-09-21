/**
 * Webhook signature checking. WebCrypto only, so it runs in Deno and in node
 * and can therefore be tested.
 */

export function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Compares over raw bytes, with a length check first. `parseInt` on a
 * malformed hex header yields NaN bytes, which silently become 0 and could be
 * compared against a short digest.
 */
export async function verifySignature(
  rawBody: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  const signature = hexToBytes(signatureHex);
  if (!signature) return false;
  // SHA-256 digests are 32 bytes; anything else cannot match and importKey /
  // verify should not be asked to reason about it.
  if (signature.length !== 32) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(rawBody));
}

/**
 * A stable id for one delivery.
 *
 * Lemon Squeezy sends no dedicated event id, so it is derived from the body: a
 * retry of one delivery repeats it byte for byte, and two genuinely different
 * events never do. Keying on updated_at alone would collapse to `name:id:`
 * whenever that field is absent, and the second real event of that kind would
 * then be discarded as a duplicate - leaving an account on the wrong tier with
 * no error anywhere.
 */
export async function eventIdFor(
  eventName: string,
  subscriptionId: string,
  rawBody: string,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody));
  const bodyHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return `${eventName}:${subscriptionId}:${bodyHash}`;
}
