import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { chroniclesCanonicalRunIdForKey } from './chroniclesCanonicalRunId.js';

describe('Chronicles UUIDv5 legacy save recovery', () => {
  it('matches Python uuid.uuid5 namespace + owner + provisional idempotency key exactly', async () => {
    expect(await chroniclesCanonicalRunIdForKey(
      'alice', '550e8400-e29b-41d4-a716-446655440000',
      { subtle: webcrypto.subtle },
    )).toBe('ca1e8e12-21c6-598a-96b9-6e11c722428e');
    expect(await chroniclesCanonicalRunIdForKey(
      'alice', '11111111-1111-4111-8111-111111111111',
      { subtle: webcrypto.subtle },
    )).toBe('55a7760a-cdd8-5717-bd0f-5c34c4aa7100');
  });

  it('fails closed on unsupported crypto, non-v4 ids and missing owner', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440000';
    expect(await chroniclesCanonicalRunIdForKey('', key, { subtle: webcrypto.subtle })).toBeNull();
    expect(await chroniclesCanonicalRunIdForKey('alice', 'not-uuid-v4', { subtle: webcrypto.subtle })).toBeNull();
    expect(await chroniclesCanonicalRunIdForKey('alice', key, { subtle: null })).toBeNull();
    expect(await chroniclesCanonicalRunIdForKey('alice', key, {
      subtle: { digest: async () => { throw new Error('blocked'); } },
    })).toBeNull();
  });
});
