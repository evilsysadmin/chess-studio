import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyMatthiasCheckPose } from './Board3DPieces.js';
import {
  parseBoard3DRankLevels,
  rankBandCount,
  serializeBoard3DRankLevels,
} from './Board3DRankInsignia.js';

function rankGroup(piece) {
  return piece.children.find((child) => child.userData?.combatRankInsignia) || null;
}

function makeState(initialPayload = '') {
  let payload = initialPayload;
  const canvas = {
    dataset: {},
    closest: () => ({ dataset: { board3dRankLevels: payload } }),
  };
  const pieces = new Map([
    ['a2', new THREE.Group()],
    ['b2', new THREE.Group()],
    ['c2', new THREE.Group()],
  ]);
  for (const [square, piece] of pieces) {
    piece.userData.square = square;
    piece.userData.baseY = 0.1;
    piece.userData.baseScale = new THREE.Vector3(1, 1, 1);
  }
  return {
    state: {
      pieceMeshes: pieces,
      coarsePointer: false,
      renderer: { domElement: canvas },
    },
    setPayload(next) { payload = next; },
  };
}

describe('Board3D Combat rank insignia', () => {
  it('serializa sólo rangos reales y limita los galones físicos a cuatro bandas', () => {
    expect(serializeBoard3DRankLevels({ c2: 7, a2: 1, b2: 3, z9: 8 })).toBe('b2:3,c2:7');
    expect(parseBoard3DRankLevels('b2:3,c2:7,xx:9,a1:1')).toEqual({ b2: 3, c2: 7 });
    expect([1, 2, 3, 4, 5, 12].map(rankBandCount)).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it('sincroniza bandas sobre meshes reutilizados sin crear decoración en piezas sin rango', () => {
    const { state, setPayload } = makeState('a2:2,b2:4,c2:9');

    applyMatthiasCheckPose(state, null, 'white');

    expect(rankGroup(state.pieceMeshes.get('a2'))?.children).toHaveLength(1);
    expect(rankGroup(state.pieceMeshes.get('b2'))?.children).toHaveLength(3);
    expect(rankGroup(state.pieceMeshes.get('c2'))?.children).toHaveLength(4);
    expect(state.renderer.domElement.dataset.board3dRankedPieces).toBe('3');
    expect(state.renderer.domElement.dataset.board3dRankBands).toBe('8');

    const reused = rankGroup(state.pieceMeshes.get('b2'));
    applyMatthiasCheckPose(state, null, 'white');
    expect(rankGroup(state.pieceMeshes.get('b2'))).toBe(reused);

    setPayload('a2:2');
    applyMatthiasCheckPose(state, null, 'white');
    expect(rankGroup(state.pieceMeshes.get('a2'))?.children).toHaveLength(1);
    expect(rankGroup(state.pieceMeshes.get('b2'))).toBeNull();
    expect(rankGroup(state.pieceMeshes.get('c2'))).toBeNull();
    expect(state.renderer.domElement.dataset.board3dRankedPieces).toBe('1');
    expect(state.renderer.domElement.dataset.board3dRankBands).toBe('1');
  });

  it('es un no-op visual para ajedrez normal sin pieceRankLevels', () => {
    const { state } = makeState('');
    applyMatthiasCheckPose(state, null, 'white');

    for (const piece of state.pieceMeshes.values()) expect(rankGroup(piece)).toBeNull();
    expect(state.renderer.domElement.dataset.board3dRankedPieces).toBe('0');
    expect(state.renderer.domElement.dataset.board3dRankBands).toBe('0');
  });
});
