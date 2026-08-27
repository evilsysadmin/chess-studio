import { afterEach, describe, expect, it, vi } from 'vitest';
import { newRequestId, requestErrorMessage, withRequestId } from './requestId.js';

afterEach(() => vi.unstubAllGlobals());

describe('request IDs', () => {
  it('prefiere crypto.randomUUID cuando el navegador lo ofrece', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'req-fixed-123' });
    expect(newRequestId()).toBe('req-fixed-123');
  });

  it('inyecta X-Request-ID sin borrar cabeceras existentes', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'req-fixed-456' });
    expect(withRequestId({ Authorization: 'Bearer x' })).toEqual({
      Authorization: 'Bearer x',
      'X-Request-ID': 'req-fixed-456',
    });
  });

  it('muestra la referencia devuelta por el servidor en errores', () => {
    const response = { status: 503, headers: { get: (name) => name === 'x-request-id' ? 'srv-abc' : null } };
    expect(requestErrorMessage(response, { detail: 'Servicio no disponible' })).toEqual({
      message: 'Servicio no disponible · Ref: srv-abc',
      requestId: 'srv-abc',
    });
  });

  it('usa requestId del body como fallback y no inventa uno si no existe', () => {
    const response = { status: 400, headers: { get: () => null } };
    expect(requestErrorMessage(response, { error: 'Petición inválida', requestId: 'body-1' }).requestId).toBe('body-1');
    expect(requestErrorMessage(response, {})).toEqual({ message: 'Error 400', requestId: null });
  });
});
