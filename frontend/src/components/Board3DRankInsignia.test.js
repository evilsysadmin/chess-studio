import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyMatthiasCheckPose } from './Board3DPieces.js';
import { parseBoard3DCombatMedals, serializeBoard3DCombatMedals } from './Board3DCombatMedals.js';
import {
  parseBoard3DRankLevels,
  rankBandCount,
  serializeBoard3DRankLevels,
} from './Board3DRankInsignia.js';

function rankGroup(piece) {
  return piece.children.find((child) => child.userData?.combatRankInsignia) || null;
}
function medalGroup(piece) {
  return piece.children.find((child) => child.userData?.combatServiceMedals) || null;
}

function makeState(initialPayload = '', initialMedals = '') {
  let payload = initialPayload;
  let medals = initialMedals;
  const canvas = {
    dataset: {},
    closest: () => ({ dataset: { board3dRankLevels: payload, board3dCombatMedals: medals } }),
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
    setMedals(next) { medals = next; },
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


  it('renders up to three earned metallic seals independent of rank, reuses and disposes meshes', () => {
    expect(serializeBoard3DCombatMedals({ b2: 2, a2: 0, c2: 7, q9: 2 })).toBe('b2:2,c2:6');
    expect(parseBoard3DCombatMedals('b2:2,c2:6,q9:8,a2:0')).toEqual({ b2: 2, c2: 6 });

    const { state, setMedals } = makeState('a2:7', 'b2:2,c2:6');
    applyMatthiasCheckPose(state, null, 'white');
    expect(rankGroup(state.pieceMeshes.get('a2'))?.children).toHaveLength(4);
    expect(medalGroup(state.pieceMeshes.get('a2'))).toBeNull();
    expect(rankGroup(state.pieceMeshes.get('b2'))).toBeNull();
    expect(medalGroup(state.pieceMeshes.get('b2'))?.children).toHaveLength(2);
    expect(medalGroup(state.pieceMeshes.get('c2'))?.children).toHaveLength(3);
    expect(medalGroup(state.pieceMeshes.get('c2'))?.userData.earnedDecorationCount).toBe(6);
    expect(state.renderer.domElement.dataset.board3dDecoratedPieces).toBe('2');
    expect(state.renderer.domElement.dataset.board3dMedalSeals).toBe('5');
    const retained = medalGroup(state.pieceMeshes.get('b2'));
    const replaced = medalGroup(state.pieceMeshes.get('c2'));
    applyMatthiasCheckPose(state, null, 'white');
    expect(medalGroup(state.pieceMeshes.get('b2'))).toBe(retained);
    setMedals('b2:2,c2:1');
    applyMatthiasCheckPose(state, null, 'white');
    expect(medalGroup(state.pieceMeshes.get('b2'))).toBe(retained);
    expect(medalGroup(state.pieceMeshes.get('c2'))).not.toBe(replaced);
    expect(medalGroup(state.pieceMeshes.get('c2'))?.children).toHaveLength(1);
    expect(replaced.children[0].geometry.dispose).toBeDefined();
    setMedals('');
    applyMatthiasCheckPose(state, null, 'white');
    expect(medalGroup(state.pieceMeshes.get('b2'))).toBeNull();
    expect(medalGroup(state.pieceMeshes.get('c2'))).toBeNull();
    expect(state.renderer.domElement.dataset.board3dDecoratedPieces).toBe('0');
    expect(state.renderer.domElement.dataset.board3dMedalSeals).toBe('0');
  });

  it('keeps ordinary chess entirely free of service medals', () => {
    const { state } = makeState();
    applyMatthiasCheckPose(state, null, 'white');
    for (const piece of state.pieceMeshes.values()) expect(medalGroup(piece)).toBeNull();
    expect(state.renderer.domElement.dataset.board3dDecoratedPieces).toBe('0');
  });

  it('es un no-op visual para ajedrez normal sin pieceRankLevels', () => {
    const { state } = makeState('');
    applyMatthiasCheckPose(state, null, 'white');

    for (const piece of state.pieceMeshes.values()) expect(rankGroup(piece)).toBeNull();
    expect(state.renderer.domElement.dataset.board3dRankedPieces).toBe('0');
    expect(state.renderer.domElement.dataset.board3dRankBands).toBe('0');
  });
});
