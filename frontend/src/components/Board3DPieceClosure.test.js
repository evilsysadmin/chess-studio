import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

// Regresión: la dama negra "tenía la cabeza transparente". No era un problema de
// material: el torno del cuerpo terminaba en el borde abierto (r=0.245) y, con
// FrontSide, el hueco entre crown-core y crown-ring dejaba ver el interior hueco
// de la pieza y el tablero a través de ella. Cualquier rayo de cámara que cruce
// el borde superior del cuerpo por dentro debe chocar antes con geometría.
const RIMS = {
  q: { y: 0.84, r: 0.2 },
  b: { y: 0.77, r: 0.17 },
  p: { y: 0.57, r: 0.14 },
};

function renderableMeshes(group) {
  const meshes = [];
  group.traverse((object) => {
    if (object.isMesh && !object.userData?.contactShadow && !object.userData?.touchHitTarget) meshes.push(object);
  });
  return meshes;
}

function raysEnteringHollowBody(type, color, coarsePointer) {
  const piece = buildPiece(type, color, 'studio', coarsePointer);
  piece.updateMatrixWorld(true);
  const meshes = renderableMeshes(piece);
  const scale = piece.scale.x;
  const rim = RIMS[type];
  const raycaster = new THREE.Raycaster();
  let checked = 0;
  let leaks = 0;
  for (const elevationDeg of [30, 50, 70]) {
    for (let azimuthDeg = 0; azimuthDeg < 360; azimuthDeg += 30) {
      const e = (elevationDeg * Math.PI) / 180;
      const a = (azimuthDeg * Math.PI) / 180;
      const dir = new THREE.Vector3(-Math.cos(e) * Math.cos(a), -Math.sin(e), -Math.cos(e) * Math.sin(a));
      const lateral = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      for (let y = 0.5; y <= 1.3; y += 0.04) {
        for (let s = -0.15; s <= 0.15; s += 0.03) {
          const target = new THREE.Vector3(0, y, 0).addScaledVector(lateral, s);
          const origin = target.clone().addScaledVector(dir, -6);
          const tRim = (rim.y * scale - origin.y) / dir.y;
          const atRim = origin.clone().addScaledVector(dir, tRim);
          if (Math.hypot(atRim.x, atRim.z) > rim.r * scale) continue;
          checked += 1;
          raycaster.set(origin, dir);
          const first = raycaster.intersectObjects(meshes, false)[0];
          if (!first || first.distance > tRim) leaks += 1;
        }
      }
    }
  }
  disposeObject(piece);
  return { checked, leaks };
}

describe('Board3D piece closure', () => {
  for (const [type, color, coarsePointer] of [
    ['q', 'b', false], ['q', 'b', true], ['q', 'w', false],
    ['b', 'b', false], ['b', 'b', true], ['p', 'b', false], ['p', 'b', true],
  ]) {
    it(`${color}${type} ${coarsePointer ? 'lite' : 'full'}: camera rays cannot enter the hollow body through its top`, () => {
      const { checked, leaks } = raysEnteringHollowBody(type, color, coarsePointer);
      expect(checked).toBeGreaterThan(50);
      expect(leaks).toBe(0);
    });
  }

  it('queen body lathe is capped under the crown', () => {
    const queen = buildPiece('q', 'b', 'studio', false);
    const bodies = [];
    queen.traverse((object) => { if (object.userData?.queenPart === 'body') bodies.push(object); });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].userData.queenBodyClosure).toBe('capped-dome-v1');
    disposeObject(queen);
  });
});
