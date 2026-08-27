import { describe, expect, it } from 'vitest';
import { userFacingError } from './userFacingError.js';

describe('userFacingError', () => {
  it('oculta fallos técnicos de red', () => {
    expect(userFacingError(new TypeError('Failed to fetch'))).toContain('No hemos podido conectar con Chess Studio');
  });

  it('convierte 5xx en copy recuperable y conserva una referencia rastreable', () => {
    const error = Object.assign(new Error('Internal Server Error'), { status: 503, requestId: 'req-12345' });
    expect(userFacingError(error)).toBe('Chess Studio ha tenido un problema al procesar esto. Tu progreso guardado no se borra; reintenta en unos segundos. Referencia: req-12345.');
  });

  it('preserva mensajes funcionales de 4xx que sí ayudan al usuario', () => {
    const error = Object.assign(new Error('No es tu turno.'), { status: 400 });
    expect(userFacingError(error, 'fallback')).toBe('No es tu turno.');
  });
});
