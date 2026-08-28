import { describe, expect, it } from 'vitest';
import { createOperationId, operationFingerprint } from './operationId.js';

describe('operation ids', () => {
  it('genera claves válidas para Idempotency-Key', () => {
    const id = createOperationId('move');
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id.length).toBeLessThanOrEqual(96);
    expect(id).toMatch(/^[A-Za-z0-9._:-]+$/);
  });

  it('produce fingerprint estable para reintentos con los mismos datos', () => {
    const first = operationFingerprint(['g1', 'e2', 'e4', null]);
    const retry = operationFingerprint(['g1', 'e2', 'e4', null]);
    const other = operationFingerprint(['g1', 'd2', 'd4', null]);
    expect(retry).toBe(first);
    expect(other).not.toBe(first);
  });
});
