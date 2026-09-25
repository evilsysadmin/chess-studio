import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyWarRoomApprovedMockContract } from './WarRoomApprovedMockContract.js';

function meshesNamed(root, name) {
  const result = [];
  root?.traverse?.((child) => {
    if (child?.isMesh && child.name === name) result.push(child);
  });
  return result;
}

function uniqueGeometryCount(meshes) {
  return new Set(meshes.map((mesh) => mesh.geometry)).size;
}

describe('WarRoom approved mock construction geometry', () => {
  it('reuses identical BoxGeometry inside generated furniture groups', () => {
    const root = new THREE.Group();

    const desk = new THREE.Group();
    desk.name = 'command-cabinet';
    root.add(desk);

    for (const side of ['left', 'right']) {
      const sofa = new THREE.Group();
      sofa.name = `war-room-sofa-${side}`;
      root.add(sofa);
    }

    expect(applyWarRoomApprovedMockContract(root, {
      wallZ: -6.5,
      towardBoard: 1,
      coarsePointer: false,
    })).toBeGreaterThan(0);

    const deskArt = desk.getObjectByName('war-room-teutonic-command-desk-v28');
    const drawers = meshesNamed(deskArt, 'war-room-command-desk-drawer');
    expect(drawers).toHaveLength(6);
    expect(uniqueGeometryCount(drawers)).toBe(1);
    expect(drawers[0].geometry.userData.warRoomGroupSharedGeometry).toBe('approved-mock-box-pool-v1');

    const chair = root.getObjectByName('war-room-teutonic-command-chair');
    const chairLegs = meshesNamed(chair, 'war-room-command-chair-leg');
    expect(chairLegs).toHaveLength(4);
    expect(uniqueGeometryCount(chairLegs)).toBe(1);

    const leftSofa = root.getObjectByName('war-room-sofa-left');
    const leftArt = leftSofa.getObjectByName('war-room-teutonic-sofa-art-v28');
    const stiles = [
      ...meshesNamed(leftArt, 'war-room-sofa-back-stile-left'),
      ...meshesNamed(leftArt, 'war-room-sofa-back-stile-right'),
    ];
    expect(stiles).toHaveLength(2);
    expect(uniqueGeometryCount(stiles)).toBe(1);

    const rightSofa = root.getObjectByName('war-room-sofa-right');
    const rightArt = rightSofa.getObjectByName('war-room-teutonic-sofa-art-v28');
    const rightStiles = [
      ...meshesNamed(rightArt, 'war-room-sofa-back-stile-left'),
      ...meshesNamed(rightArt, 'war-room-sofa-back-stile-right'),
    ];
    expect(rightStiles).toHaveLength(2);
    expect(uniqueGeometryCount(rightStiles)).toBe(1);

    // Pooling is intentionally local to the procedural group, so independent
    // furniture groups retain separate disposal lifecycles.
    expect(stiles[0].geometry).not.toBe(rightStiles[0].geometry);
  });
});
