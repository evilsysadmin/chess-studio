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

    const wallCap = new THREE.Mesh();
    wallCap.name = 'chronicles-iso-wall-cap-2-3';
    expect(chroniclesTacticsMaterialRole(wallCap)).toBe('wall');

    const column = new THREE.Group();
    column.name = 'chronicles-iso-column-1';
    const shaft = new THREE.Mesh();
    column.add(shaft);
    expect(chroniclesTacticsMaterialRole(shaft)).toBe('wall');

    const party = new THREE.Mesh();
    party.name = 'chronicles-party-matthias';
    expect(chroniclesTacticsMaterialRole(party)).toBeNull();
  });

  it('installs deterministic semantic PBR maps and restores the source material on teardown', () => {
    const scene = new THREE.Scene();
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x554f47, roughness: 0.91 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), sourceMaterial);
    floor.name = 'chronicles-iso-floor-3-3';
    scene.add(floor);

    const scenePlan = {
      mapId: 'echo-cistern',
      width: 7,
      height: 7,
      walls: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      floors: [{ x: 2, y: 2 }, { x: 3, y: 2 }],
    };
    const root = installChroniclesTacticsPremiumMaterials(scene, {
      coarsePointer: true,
      scenePlan,
    });

    expect(root?.name).toBe('chronicles-tactics-premium-materials');
    expect(root?.userData.chroniclesMaterialFinish).toBe('semantic-atlas-procedural-pbr-v1');
    expect(root?.userData.chroniclesMaterialCount).toBe(1);
    expect(root?.userData.chroniclesMasonryProfile).toBe('approved-material-atlas-v1');
    expect(root?.userData.chroniclesMaterialEnvironment).toBe('cave-water');
    expect(root?.userData.chroniclesMaterialProfiles.floor).toHaveLength(2);
    expect(sourceMaterial.map?.isTexture).toBe(true);
    expect(sourceMaterial.roughnessMap?.isTexture).toBe(true);
    expect(sourceMaterial.normalMap?.isTexture).toBe(true);
    expect(sourceMaterial.emissiveMap).toBeNull();
    expect(sourceMaterial.normalScale.x).toBeGreaterThan(0);
    expect(sourceMaterial.normalScale.x).toBeLessThanOrEqual(CHRONICLES_TACTICS_MATERIAL_STYLE.floorNormalStrength * 2);
    expect(sourceMaterial.map.name).toMatch(/chronicles-material-N0[1-6]-color-/);
    expect(sourceMaterial.map.repeat.x).toBeGreaterThan(0);

    root.userData.chroniclesArtCancel();
    expect(sourceMaterial.map).toBeNull();
    expect(sourceMaterial.roughnessMap).toBeNull();
    expect(sourceMaterial.normalMap).toBeNull();
    expect(sourceMaterial.emissiveMap).toBeNull();
    expect(sourceMaterial.emissiveIntensity).toBe(1);

    floor.geometry.dispose();
    sourceMaterial.dispose();
  });

  it('uses different structural families for castle and dungeon scenes without touching gameplay objects', () => {
    const buildScene = (name) => {
      const scene = new THREE.Scene();
      const material = new THREE.MeshStandardMaterial({ color: 0x665f57 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      wall.name = 'chronicles-iso-wall-1-1';
      scene.add(wall);
      return { scene, material, wall, name };
    };

    const dungeon = buildScene('dungeon');
    const castle = buildScene('castle');
    const dungeonRoot = installChroniclesTacticsPremiumMaterials(dungeon.scene, {
      coarsePointer: true,
      scenePlan: { mapId: 'crypt-eight-squares', width: 7, height: 7, walls: [{ x: 1, y: 1 }], floors: [] },
    });
    const castleRoot = installChroniclesTacticsPremiumMaterials(castle.scene, {
      coarsePointer: true,
      scenePlan: { mapId: 'gallery-of-forks', width: 9, height: 7, walls: [{ x: 1, y: 1 }], floors: [] },
    });

    expect(dungeonRoot.userData.chroniclesMaterialEnvironment).toBe('dungeon');
    expect(castleRoot.userData.chroniclesMaterialEnvironment).toBe('castle-interior');
    expect(dungeon.material.map.name).toMatch(/chronicles-material-D0[1-6]-color-/);
    expect(castle.material.map.name).toMatch(/chronicles-material-C0[1-6]-color-/);

    const cave = buildScene('cave');
    const caveRoot = installChroniclesTacticsPremiumMaterials(cave.scene, {
      coarsePointer: true,
      scenePlan: { mapId: 'echo-cistern', width: 9, height: 7, walls: [{ x: 1, y: 1 }], floors: [] },
    });
    expect(caveRoot.userData.chroniclesMaterialEnvironment).toBe('cave-water');
    expect(cave.material.map.name).toMatch(/chronicles-material-N0[1-6]-color-/);
    expect(cave.material.emissiveMap?.isTexture).toBe(true);
    expect(cave.material.emissiveIntensity).toBeGreaterThan(0);

    dungeonRoot.userData.chroniclesArtCancel();
    castleRoot.userData.chroniclesArtCancel();
    caveRoot.userData.chroniclesArtCancel();
    dungeon.wall.geometry.dispose();
    castle.wall.geometry.dispose();
    cave.wall.geometry.dispose();
    dungeon.material.dispose();
    castle.material.dispose();
    cave.material.dispose();
  });
});
