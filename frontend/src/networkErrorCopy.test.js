import { describe, expect, it } from 'vitest';
import { connectionErrorCopy, isConnectionFailure } from './networkErrorCopy.js';

describe('copy de incidencias de conexión', () => {
  it('convierte los fallos del navegador en una instrucción recuperable', () => {
    const error = new TypeError('Failed to fetch');
    expect(isConnectionFailure(error)).toBe(true);
    expect(connectionErrorCopy(error)).toMatch(/Comprueba tu conexión/);
    expect(connectionErrorCopy(error)).not.toMatch(/Failed to fetch/);
  });

  it('conserva los errores HTTP explicativos del servidor', () => {
    expect(connectionErrorCopy(new Error('Usuario o contraseña incorrectos.'))).toBe('Usuario o contraseña incorrectos.');
  });

  it('no confunde un TypeError de aplicación con fallo de red', () => {
    const error = new TypeError('Cannot read properties of undefined (reading board)');
    expect(isConnectionFailure(error)).toBe(false);
    expect(connectionErrorCopy(error)).toMatch(/Cannot read properties/);
  });

  it('reconoce mensajes de fallos fetch en distintos navegadores', () => {
    for (const message of ['Failed to fetch', 'fetch failed', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      expect(isConnectionFailure(new TypeError(message))).toBe(true);
    }
  });

  it('no promete persistencia ni entrega que no han sido confirmadas', () => {
    const error = new TypeError('Failed to fetch');
    expect(connectionErrorCopy(error)).toMatch(/No podemos confirmar/);
    expect(connectionErrorCopy(error)).not.toMatch(/progreso están a salvo/i);
    expect(connectionErrorCopy(error, 'en')).toMatch(/cannot confirm/i);
    expect(connectionErrorCopy(error, 'en')).not.toMatch(/are safe/i);
  });
});
