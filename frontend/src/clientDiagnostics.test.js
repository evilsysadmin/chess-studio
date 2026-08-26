import { describe, expect, it } from 'vitest';
import { buildClientDiagnostic } from './clientDiagnostics.js';

describe('diagnóstico cliente seguro', () => {
  it('incluye release, pantalla y request id sin datos privados', () => {
    const text = buildClientDiagnostic({
      error: Object.assign(new Error('falló una petición'), { requestId: 'req-123' }),
      view: 'combat',
      canRecover: true,
      now: new Date('2026-08-25T08:00:00Z'),
    });
    expect(text).toContain('release: v16.6');
    expect(text).toContain('pantalla: combat');
    expect(text).toContain('requestId: req-123');
    expect(text).toContain('partida recuperable: sí');
    expect(text).toContain('sin token, usuario, FEN, jugadas ni contenido de partida');
    expect(text).not.toContain('Bearer ');
  });
});
