// Client-side reconciliation of historical save slots that incorrectly used
// the POST Idempotency-Key instead of the server-generated UUIDv5 run ID.
// This is only used to match a run already returned by the authenticated API;
// it never creates, guesses existence of, or changes server-owned expeditions.
const CHRONICLES_RUN_NAMESPACE = 'e73c9496-fffd-4dc4-a0d0-8c7b6060a116';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function chroniclesCanonicalRunIdForKey(owner, provisionalKey, { subtle = globalThis.crypto?.subtle } = {}) {
  const username = String(owner || '').trim();
  if (!username || !UUID_V4.test(String(provisionalKey || '')) || !subtle?.digest) return null;
  const namespace = CHRONICLES_RUN_NAMESPACE.replaceAll('-', '').match(/../g)
    .map((hex) => parseInt(hex, 16));
  const nameBytes = new TextEncoder().encode(`${username}:${provisionalKey}`);
  const bytes = new Uint8Array(namespace.length + nameBytes.length);
  bytes.set(namespace);
  bytes.set(nameBytes, namespace.length);
  let hash;
  try {
    hash = new Uint8Array(await subtle.digest('SHA-1', bytes));
  } catch {
    // WebCrypto may be missing or blocked. The authenticated remote catalog
    // remains usable; do not weaken identity matching or invent a fallback.
    return null;
  }
  const uuid = hash.slice(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x50;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = Array.from(uuid, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
