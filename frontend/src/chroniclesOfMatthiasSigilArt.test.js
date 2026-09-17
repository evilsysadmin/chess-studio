import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildChroniclesTacticsSigilGeometry,
  chroniclesTacticsSigilSegments,
  installChroniclesTacticsSigilArt,
} from './chroniclesOfMatthiasSigilArt.js';

function fixture({ visible = true } = {}) {
  const scene = new THREE.Scene();
  const dungeon = new THREE.Group();
  scene.add(dungeon);
  const legacy = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.085, 8, 24));
  legacy.name = 'chronicles-iso-sigil';
  legacy.position.set(1.2, 0.035, -2.4);
  legacy.visible = visible;
  dungeon.add(legacy);
  return { scene, dungeon, legacy };
}

describe('Chronicles Tactics inlaid sigil art', () => {
  it('builds a broken authored motif as one flat triangle geometry', () => {
    const triangles = chroniclesTacticsSigilSegments();
    const geometry = buildChroniclesTacticsSigilGeometry();
    expect(triangles).toHaveLength(132);
    expect(geometry.attributes.position.count).toBe(132);
    expect(geometry.index).toBeNull();
  });

  it('retires the legacy torus and reuses its authored world position', () => {
    const { scene, legacy } = fixture();
    const root = installChroniclesTacticsSigilArt(scene);
    expect(legacy.visible).toBe(false);
    expect(legacy.userData.chroniclesSigilReplacement).toBe('inlaid-v1');
    expect(root.name).toBe('chronicles-tactics-inlaid-sigil');
    expect(root.position.x).toBeCloseTo(legacy.position.x, 8);
    expect(root.position.z).toBeCloseTo(legacy.position.z, 8);
    expect(root.userData.chroniclesSigilDrawCalls).toBe(1);
    expect(root.getObjectByName('chronicles-tactics-inlaid-sigil-mesh')).toBeTruthy();
  });

  it('does not resurrect a hidden placeholder from a map without an authored sigil', () => {
    const { scene, legacy } = fixture({ visible: false });
    expect(installChroniclesTacticsSigilArt(scene)).toBeNull();
    expect(legacy.visible).toBe(false);
    expect(legacy.userData.chroniclesSigilReplacement).toBeUndefined();
    expect(scene.getObjectByName('chronicles-tactics-inlaid-sigil')).toBeNull();
  });

  it('is idempotent and fails closed without the authored sigil', () => {
    const { scene } = fixture();
    const first = installChroniclesTacticsSigilArt(scene);
    const second = installChroniclesTacticsSigilArt(scene);
    expect(second).toBe(first);
    expect(installChroniclesTacticsSigilArt(new THREE.Scene())).toBeNull();
  });
});
