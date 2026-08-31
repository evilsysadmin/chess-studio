import { beforeEach, describe, expect, it } from 'vitest';
import { loadBoardRenderer, normalizeBoardRenderer, saveBoardRenderer } from './boardRendererPreference.js';

beforeEach(() => localStorage.clear());

describe('preferencia de tablero', () => {
  it('mantiene 2D como valor seguro por defecto', () => {
    expect(loadBoardRenderer()).toBe('2d');
    expect(normalizeBoardRenderer('basura')).toBe('2d');
  });

  it('persiste la elección 3D y permite volver a 2D', () => {
    expect(saveBoardRenderer('3d')).toBe('3d');
    expect(localStorage.getItem('chess-board-renderer')).toBe('3d');
    expect(loadBoardRenderer()).toBe('3d');
    expect(saveBoardRenderer('2d')).toBe('2d');
    expect(loadBoardRenderer()).toBe('2d');
  });
});
