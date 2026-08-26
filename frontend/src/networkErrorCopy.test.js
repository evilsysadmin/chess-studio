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
});
