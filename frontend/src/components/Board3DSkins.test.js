import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';
import { PIECE_SKINS } from '../tournamentRewards.js';

function firstMainMaterial(group) {
  let found = null;
  group.traverse((node) => {
    if (!found && node.isMesh && node.material?.userData?.skin3DIdentity === 'distinct-v2') found = node.material;
  });
  return found;
}

describe('Board3D skins', () => {
  it('todas las skins desbloqueables tienen interpretación 3D real', () => {
    for (const skin of PIECE_SKINS) {
      const piece = buildPiece('p', 'w', skin.id, false);
      expect(piece.userData.skin3DId).toBe(skin.id);
      expect(piece.userData.skin3DIdentity).toBe('distinct-v2');
      expect(firstMainMaterial(piece)?.userData?.skin3DId).toBe(skin.id);
      disposeObject(piece);
    }
  });

  it('las paletas 3D no colapsan visualmente en el mismo marfil', () => {
    const studio = buildPiece('p', 'w', 'studio', false);
    const azul = buildPiece('p', 'w', 'azul', false);
    const esmeralda = buildPiece('p', 'w', 'esmeralda', false);
    const cyber = buildPiece('p', 'w', 'cyber', false);

    const colors = [studio, azul, esmeralda, cyber].map((piece) => firstMainMaterial(piece).color.getHex());
    expect(new Set(colors).size).toBe(4);

    [studio, azul, esmeralda, cyber].forEach(disposeObject);
  });

  it('skins especiales añaden firma geométrica además del color', () => {
    const plain = buildPiece('p', 'b', 'default', false);
    const regiment = buildPiece('p', 'b', 'regimiento', false);
    const cyber = buildPiece('p', 'b', 'cyber', false);

    let plainDetails = 0;
    let regimentDetails = 0;
    let cyberDetails = 0;
    plain.traverse((node) => { if (node.userData?.skinDetail) plainDetails += 1; });
    regiment.traverse((node) => { if (node.userData?.skinDetail) regimentDetails += 1; });
    cyber.traverse((node) => { if (node.userData?.skinDetail) cyberDetails += 1; });

    expect(plainDetails).toBe(0);
    expect(regimentDetails).toBeGreaterThan(plainDetails);
    expect(cyberDetails).toBeGreaterThan(plainDetails);

    [plain, regiment, cyber].forEach(disposeObject);
  });
});
