import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function vertexCount(root) {
  let count = 0;
  root.traverse((child) => {
    const position = child?.geometry?.attributes?.position;
    count += Number(position?.count || 0);
  });
  return count;
}

function meshCount(root) {
  let count = 0;
  root.traverse((child) => { if (child?.isMesh) count += 1; });
  return count;
}

const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const startingArmy = [...backRank, ...Array(8).fill('p')];

describe('Board3D piece resilience', () => {
  it('construye las 32 piezas de una posición inicial sin dejar huecos', () => {
    const roots = [];
    for (const color of ['w', 'b']) {
      for (const type of startingArmy) roots.push(buildPiece(type, color, 'studio', false));
    }

    expect(roots).toHaveLength(32);
    expect(roots.every(Boolean)).toBe(true);
    expect(roots.every((root) => meshCount(root) > 0)).toBe(true);
    expect(roots.filter((root) => root.userData.warRoomFallbackPiece)).toHaveLength(0);

    roots.forEach(disposeObject);
  });

  it('recorta de verdad la geometría en el perfil lite/software WebGL', () => {
    const fullPawn = buildPiece('p', 'w', 'studio', false);
    const litePawn = buildPiece('p', 'w', 'studio', true);
    const fullKnight = buildPiece('n', 'b', 'studio', false);
    const liteKnight = buildPiece('n', 'b', 'studio', true);

    expect(vertexCount(litePawn)).toBeLessThan(vertexCount(fullPawn) * 0.7);
    expect(vertexCount(liteKnight)).toBeLessThan(vertexCount(fullKnight) * 0.72);

    [fullPawn, litePawn, fullKnight, liteKnight].forEach(disposeObject);
  });
});
