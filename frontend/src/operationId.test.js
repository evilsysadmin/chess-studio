import { describe, expect, it } from 'vitest';
import { createOperationId, createRetryOperationIdCache, operationFingerprint } from './operationId.js';

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

  it('mantiene fingerprints estables aunque cambie el orden de claves del objeto', () => {
    expect(operationFingerprint(['game', { to: 'e4', from: 'e2' }]))
      .toBe(operationFingerprint(['game', { from: 'e2', to: 'e4' }]));
  });
});

describe('retry operation id cache', () => {
  it('reutiliza el mismo id para el mismo retry dentro del ttl', () => {
    let now = 1_000;
    let created = 0;
    const cache = createRetryOperationIdCache({
      scope: 'create',
      ttlMs: 300_000,
      now: () => now,
      createId: () => `create:test-${++created}`,
    });

    const first = cache.resolve(['white', 4]);
    now += 30_000;
    const retry = cache.resolve(['white', 4]);

    expect(first.operationId).toBe('create:test-1');
    expect(retry.operationId).toBe(first.operationId);
    expect(created).toBe(1);
  });

  it('no reemplaza el id mientras el mismo launch vuelve a pedirlo', () => {
    let created = 0;
    const cache = createRetryOperationIdCache({
      createId: () => `op:test-${++created}`,
    });
    const first = cache.resolve(['same']);
    const current = {
      operationId: first.operationId,
      operationFingerprint: first.operationFingerprint,
    };

    expect(cache.resolve(['same'], current).operationId).toBe(first.operationId);
    expect(created).toBe(1);
  });

  it('crea un id nuevo después de confirmación o expiración', () => {
    let now = 10_000;
    let created = 0;
    const cache = createRetryOperationIdCache({
      ttlMs: 100,
      now: () => now,
      createId: () => `op:test-${++created}`,
    });

    const first = cache.resolve(['a']);
    cache.confirm(first.operationId);
    const afterConfirm = cache.resolve(['a']);
    now += 101;
    const afterExpiry = cache.resolve(['a']);

    expect(afterConfirm.operationId).not.toBe(first.operationId);
    expect(afterExpiry.operationId).not.toBe(afterConfirm.operationId);
    expect(created).toBe(3);
  });

  it('nunca reutiliza un id para otro fingerprint', () => {
    let created = 0;
    const cache = createRetryOperationIdCache({
      createId: () => `op:test-${++created}`,
    });

    expect(cache.resolve(['a']).operationId).not.toBe(cache.resolve(['b']).operationId);
    expect(created).toBe(2);
  });
});
