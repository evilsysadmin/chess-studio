import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./WarRoomReferencePolish.css', import.meta.url), 'utf8');
const settings = readFileSync(new URL('./UserSettingsPanel.jsx', import.meta.url), 'utf8');

describe('War Room appearance and viewport contract', () => {
  it('Apariencia es el punto único para vista y skin', () => {
    expect(css).toMatch(/\.game-screen \.board-renderer-toggle,[\s\S]*?\.game-3d-warroom-controls\s*\{[\s\S]*?display:\s*none\s*!important/);
    expect(css).toContain("content: 'Apariencia'");
    expect(settings).toContain('Representación del tablero');
    expect(settings).toContain('Estilo de piezas');
    expect(settings).toContain('BOARD_RENDERERS.map');
    expect(settings).toContain('PIECE_SKINS.map');
  });

  it('el comentario de Matthias nace del panel del personaje y no flota sobre el tablero 3D', () => {
    expect(css).toMatch(/\.game-board-stack-3d > \.matthias-board-bubble\s*\{[\s\S]*?display:\s*none\s*!important/);
    expect(css).toContain('.game-3d-warroom-message::before');
  });

  it('el footer 3D comparte una sola fila entre jugador y controles', () => {
    expect(css).toContain("'player controls'");
    expect(css).toContain('grid-area: player');
    expect(css).toContain('grid-area: controls');
  });

  it('el estado de turno no reserva una fila completa en desktop', () => {
    expect(css).toMatch(/\.game-layout-3d \.status-line\s*\{[\s\S]*?position:\s*absolute/);
    expect(css).toMatch(/calc\(100dvh - 12\.8rem\)/);
  });
});
