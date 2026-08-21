import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadZenMode, saveZenMode, zenModeSummary } from './zenMode.js';

const gameSource = readFileSync(new URL('./components/GameScreen.jsx', import.meta.url), 'utf8');
const boardSource = readFileSync(new URL('./components/Board.jsx', import.meta.url), 'utf8');

beforeEach(() => localStorage.clear());

describe('modo zen', () => {
  it('persiste por perfil usando un booleano compacto', () => {
    expect(loadZenMode()).toBe(false);
    expect(saveZenMode(true)).toBe(true);
    expect(localStorage.getItem('chess-study-zen-mode')).toBe('1');
    expect(loadZenMode()).toBe(true);
    expect(saveZenMode(false)).toBe(false);
    expect(localStorage.getItem('chess-study-zen-mode')).toBe('0');
    expect(loadZenMode()).toBe(false);
  });

  it('describe claramente qué se oculta', () => {
    expect(zenModeSummary(true)).toContain('sin coordenadas');
    expect(zenModeSummary(true)).toContain('chat');
  });

  it('el tablero admite ocultar coordenadas sin cambiar la posición', () => {
    expect(boardSource).toContain("showCoordinates = true");
    expect(boardSource).toContain("showCoordinates ? 'coordinates-visible' : 'coordinates-hidden'");
    expect(boardSource).toContain('{showCoordinates && (');
  });

  it('GameScreen oculta ayudas y paneles, pero conserva la lógica de jugadas', () => {
    expect(gameSource).toContain('legalTargets={zenMode ? [] : legalTargets}');
    expect(gameSource).toContain('lastMove={zenMode ? null : lastMoveSquares}');
    expect(gameSource).toContain('showCoordinates={!zenMode}');
    expect(gameSource).toContain('{!zenMode && <CpuPresence');
    expect(gameSource).toContain('{!zenMode && <aside className="game-side-column"');
    expect(gameSource).toContain('aria-pressed={zenMode}');
  });
});
