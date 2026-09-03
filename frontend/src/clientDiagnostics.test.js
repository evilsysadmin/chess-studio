import { describe, expect, it } from 'vitest';
import { buildClientDiagnostic } from './clientDiagnostics.js';

describe('diagnóstico cliente seguro', () => {
  it('incluye release, pantalla y request id sin datos privados', () => {
    const error = Object.assign(new Error('falló una petición'), { requestId: 'req-123' });
    error.stack = [
      'Error: falló una petición',
      '    at loadBoard (https://staging.chess-studio.shadowops.dpdns.org/assets/Board3D-abc.js?token=super-secret#frag:12:4)',
      '    at renderGame (https://staging.chess-studio.shadowops.dpdns.org/assets/GameScreen-def.js:30:2)',
    ].join('\n');
    const text = buildClientDiagnostic({
      error,
      view: 'combat',
      canRecover: true,
      now: new Date('2026-08-25T08:00:00Z'),
    });
    expect(text).toContain('release: v16.6');
    expect(text).toContain('pantalla: combat');
    expect(text).toContain('requestId: req-123');
    expect(text).toContain('partida recuperable: sí');
    expect(text).toContain('stack:');
    expect(text).toContain('/assets/Board3D-abc.js');
    expect(text).toContain('/assets/GameScreen-def.js:30:2');
    expect(text).toContain('sin token, usuario, FEN, jugadas ni contenido de partida');
    expect(text).not.toContain('Bearer ');
    expect(text).not.toContain('super-secret');
    expect(text).not.toContain('?token=');
  });
});
