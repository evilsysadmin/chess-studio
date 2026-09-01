import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const board3d = readFileSync(new URL('./Board3D.jsx', import.meta.url), 'utf8');

describe('Board3D architecture', () => {
  it('mantiene geometría, matemáticas, escena y skins fuera del orquestador', () => {
    expect(board3d).toContain("from './Board3DConfig.js'");
    expect(board3d).toContain("from './Board3DBoardMath.js'");
    expect(board3d).toContain("from './Board3DPieces.js'");
    expect(board3d).toContain("from './Board3DScene.js'");
    expect(board3d).not.toMatch(/function\s+buildPiece\s*\(/);
    expect(board3d).not.toMatch(/function\s+parseFen\s*\(/);
    expect(board3d).not.toMatch(/function\s+buildWarRoom\s*\(/);
    expect(board3d).not.toMatch(/const\s+SKIN_3D\s*=/);
  });

  it('no incrusta otra vez la identidad de skins dentro del orquestador', () => {
    expect(board3d).toContain('loadSelectedSkin');
    expect(board3d).not.toContain('SKIN_DETAIL_PROFILES');
    expect(board3d).not.toContain('reinforcePieceSkinMaterial');
    expect(board3d).not.toContain('addPieceSkinDetails');
  });
});
