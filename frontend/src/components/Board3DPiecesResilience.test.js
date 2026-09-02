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

function knightHead(root) {
  let head = null;
  root.traverse((child) => {
    if (!head && child?.geometry?.type === 'ExtrudeGeometry') head = child;
  });
  return head;
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

  it('mantiene construidos ambos caballos blancos y reutiliza su geometría pesada', () => {
    const b1 = buildPiece('n', 'w', 'studio', false);
    const g1 = buildPiece('n', 'w', 'studio', false);
    const black = buildPiece('n', 'b', 'studio', false);
    const b1Head = knightHead(b1);
    const g1Head = knightHead(g1);
    const blackHead = knightHead(black);

    expect(meshCount(b1)).toBeGreaterThan(0);
    expect(meshCount(g1)).toBeGreaterThan(0);
    expect(b1.userData.board3DUsesSharedKnightGeometry).toBe(true);
    expect(g1.userData.board3DUsesSharedKnightGeometry).toBe(true);
    expect(b1Head?.geometry?.userData?.board3DSharedGeometry).toBe(true);
    expect(g1Head?.geometry).toBe(b1Head?.geometry);
    expect(blackHead?.geometry).toBe(b1Head?.geometry);

    disposeObject(b1);
    expect(g1Head?.geometry?.attributes?.position?.count).toBeGreaterThan(0);
    [g1, black].forEach(disposeObject);
  });

  it('recorta de verdad la geometría en el perfil lite/software WebGL', () => {
    const fullPawn = buildPiece('p', 'w', 'studio', false);
    const litePawn = buildPiece('p', 'w', 'studio', true);
    const fullKnight = buildPiece('n', 'b', 'studio', false);
    const liteKnight = buildPiece('n', 'b', 'studio', true);

    expect(vertexCount(litePawn)).toBeLessThan(vertexCount(fullPawn) * 0.72);
    expect(vertexCount(liteKnight)).toBeLessThan(vertexCount(fullKnight) * 0.78);

    [fullPawn, litePawn, fullKnight, liteKnight].forEach(disposeObject);
  });
});
