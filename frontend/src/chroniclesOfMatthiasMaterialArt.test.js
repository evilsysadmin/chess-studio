import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_MATERIAL_STYLE,
  chroniclesTacticsMaterialRole,
  installChroniclesTacticsPremiumMaterials,
} from './chroniclesOfMatthiasMaterialArt.js';

describe('Chronicles Tactics premium materials', () => {
  it('targets only authored dungeon stone surfaces', () => {
    const floor = new THREE.Mesh();
    floor.name = 'chronicles-iso-floor-2-4';
    expect(chroniclesTacticsMaterialRole(floor)).toBe('floor');

    const wall = new THREE.Mesh();
    wall.name = 'chronicles-iso-wall-2-3';
    expect(chroniclesTacticsMaterialRole(wall)).toBe('wall');

    const column = new THREE.Group();
    column.name = 'chronicles-iso-column-1';
    const shaft = new THREE.Mesh();
    column.add(shaft);
    expect(chroniclesTacticsMaterialRole(shaft)).toBe('wall');

    const party = new THREE.Mesh();
    party.name = 'chronicles-party-matthias';
    expect(chroniclesTacticsMaterialRole(party)).toBeNull();
  });

  it('installs deterministic PBR maps and restores the source material on teardown', () => {
    const scene = new THREE.Scene();
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x554f47, roughness: 0.91 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), sourceMaterial);
    floor.name = 'chronicles-iso-floor-3-3';
    scene.add(floor);

    const root = installChroniclesTacticsPremiumMaterials(scene, { coarsePointer: true });

    expect(root?.name).toBe('chronicles-tactics-premium-materials');
    expect(root?.userData.chroniclesMaterialFinish).toBe('procedural-pbr-stone-v2');
    expect(root?.userData.chroniclesMaterialCount).toBe(1);
    expect(sourceMaterial.map?.isTexture).toBe(true);
    expect(sourceMaterial.roughnessMap?.isTexture).toBe(true);
    expect(sourceMaterial.normalMap?.isTexture).toBe(true);
    expect(sourceMaterial.normalScale.x).toBe(CHRONICLES_TACTICS_MATERIAL_STYLE.floorNormalStrength);
    expect(sourceMaterial.map.name).toContain('chronicles-stone-color-');
    expect(sourceMaterial.map.repeat.x).toBe(CHRONICLES_TACTICS_MATERIAL_STYLE.floorRepeat);

    root.userData.chroniclesArtCancel();
    expect(sourceMaterial.map).toBeNull();
    expect(sourceMaterial.roughnessMap).toBeNull();
    expect(sourceMaterial.normalMap).toBeNull();

    floor.geometry.dispose();
    sourceMaterial.dispose();
  });
});
