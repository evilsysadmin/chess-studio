import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHRONICLES_TACTICS_ARCHES,
  CHRONICLES_TACTICS_MASONRY_BLOCKS_PER_WALL,
  CHRONICLES_TACTICS_MASONRY_STYLE,
  chroniclesTacticsArchitectureWallCells,
  chroniclesTacticsExposedWallSide,
  chroniclesTacticsExposedWallSides,
  installChroniclesTacticsArchitectureArt,
} from './chroniclesOfMatthiasArchitectureArt.js';

function wall(name, position, { cutaway = false } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.65, 2.45));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.userData.chroniclesTacticsCutaway = cutaway;
  return mesh;
}

function fixture() {
  const scene = new THREE.Scene();
  scene.add(wall('chronicles-iso-wall-0-3', [-7.35, 1.23, 0]));
  scene.add(wall('chronicles-iso-wall-3-0', [0, 1.23, -7.35]));
  scene.add(wall('chronicles-iso-wall-2-2', [-2.45, 1.23, -2.45], { cutaway: true }));
  return scene;
}

describe('Chronicles Tactics architecture depth', () => {
  it('finds the walkable-facing side of authored wall cells', () => {
    expect(chroniclesTacticsExposedWallSide(0, 3)?.key).toBe('east');
    expect(chroniclesTacticsExposedWallSide(3, 0)?.key).toBe('south');
    expect(chroniclesTacticsExposedWallSide(0, 0)).toBeNull();
  });

  it('uses supplied scene topology instead of consulting the canonical crypt', () => {
    const scenePlan = {
      mapId: 'menagerie-of-ash',
      center: { x: 8, y: 9 },
      sceneStyle: { palette: { wall: [0x3c342f] } },
      wallFaces: [
        { x: 8, y: 9, side: 'west' },
        { x: 9, y: 9, side: 'north' },
      ],
    };
    const scene = new THREE.Scene();
    scene.add(wall('chronicles-iso-wall-8-9', [0, 1.23, 0]));
    scene.add(wall('chronicles-iso-wall-9-9', [2.45, 1.23, 0]));

    expect(chroniclesTacticsExposedWallSide(8, 9, scenePlan)?.key).toBe('west');
    expect(chroniclesTacticsExposedWallSide(9, 9, scenePlan)?.key).toBe('north');
    expect(chroniclesTacticsArchitectureWallCells(scene, scenePlan)).toHaveLength(2);

    const root = installChroniclesTacticsArchitectureArt(scene, { scenePlan });
    expect(root.userData.chroniclesSceneCenter).toEqual({ x: 8, y: 9 });
    expect(root.userData.chroniclesArchitectureWallCount).toBe(2);
    expect(root.userData.chroniclesArchitectureMasonryProfile).toBe('coursed-block-face-v3');
  });

  it('decorates every walkable-facing side of a corner wall cell', () => {
    const scenePlan = {
      center: { x: 2, y: 2 },
      wallFaces: [
        { x: 2, y: 2, side: 'east' },
        { x: 2, y: 2, side: 'south' },
      ],
    };
    const scene = new THREE.Scene();
    scene.add(wall('chronicles-iso-wall-2-2', [0, 1.23, 0]));

    expect(chroniclesTacticsExposedWallSides(2, 2, scenePlan).map((side) => side.key)).toEqual([
      'east',
      'south',
    ]);
    const faces = chroniclesTacticsArchitectureWallCells(scene, scenePlan);
    expect(faces).toHaveLength(2);

    const root = installChroniclesTacticsArchitectureArt(scene, { scenePlan });
    expect(root.userData.chroniclesArchitectureWallCount).toBe(2);
    expect(root.getObjectByName('chronicles-tactics-masonry-instances').count).toBe(
      2 * CHRONICLES_TACTICS_MASONRY_BLOCKS_PER_WALL + CHRONICLES_TACTICS_ARCHES.length * 2,
    );
  });

  it('replaces monolithic wall faces with batched coursed masonry', () => {
    const scene = fixture();
    expect(chroniclesTacticsArchitectureWallCells(scene)).toHaveLength(2);

    const root = installChroniclesTacticsArchitectureArt(scene, { coarsePointer: false });
    const masonry = root.getObjectByName('chronicles-tactics-masonry-instances');

    expect(root.name).toBe('chronicles-tactics-architecture-depth');
    expect(root.userData.chroniclesArchitectureWallCount).toBe(2);
    expect(root.userData.chroniclesArchitectureDrawGroups).toBe(2);
    expect(root.userData.chroniclesArchitectureMasonryProfile).toBe(CHRONICLES_TACTICS_MASONRY_STYLE.profile);
    expect(masonry.count).toBe(
      2 * CHRONICLES_TACTICS_MASONRY_BLOCKS_PER_WALL + CHRONICLES_TACTICS_ARCHES.length * 2,
    );
    expect(masonry.material.map?.isTexture).toBe(true);
    expect(masonry.instanceColor).toBeTruthy();
    expect(root.getObjectByName('chronicles-tactics-arch-instances').count).toBe(CHRONICLES_TACTICS_ARCHES.length);
  });

  it('is idempotent', () => {
    const scene = fixture();
    const first = installChroniclesTacticsArchitectureArt(scene, { coarsePointer: true });
    const second = installChroniclesTacticsArchitectureArt(scene, { coarsePointer: true });
    expect(second).toBe(first);
  });
});
