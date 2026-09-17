import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  HOME_CASTLE_COMBAT_ASSET_ID,
  applyHomeCastleCombatAsset,
  decodeHomeCastleCombatGlbPayload,
  disposeHomeCastleCombatAssetScene,
  hydrateHomeCastleCombatHeraldry,
} from './HomeCastle3DCombatAsset.js';
import { createHomeCastleSecondaryDestinationProps } from './HomeCastle3DSecondaryProps.js';

const ROLE_PAIRS = [
  ['combat_mount', 'home-castle-combat-mount'],
  ['combat_left_blade', 'home-castle-combat-left-blade'],
  ['combat_left_guard', 'home-castle-combat-left-guard'],
  ['combat_left_grip', 'home-castle-combat-left-grip'],
  ['combat_right_blade', 'home-castle-combat-right-blade'],
  ['combat_right_guard', 'home-castle-combat-right-guard'],
  ['combat_right_grip', 'home-castle-combat-right-grip'],
  ['combat_shield', 'home-castle-combat-shield'],
  ['combat_boss', 'home-castle-combat-boss'],
];

function createTargetGroup() {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-combat';
  group.userData.destination = 'combat';
  const material = new THREE.MeshStandardMaterial({
    color: 0x887766,
    emissive: 0x221100,
    emissiveIntensity: 0.12,
  });

  ROLE_PAIRS.forEach(([, targetName], index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), material);
    mesh.name = targetName;
    mesh.position.set(index * 0.01, index * -0.005, 0.003);
    group.add(mesh);
  });
  group.getObjectByName('home-castle-combat-mount').onBeforeRender = vi.fn();
  return { group, material };
}

function createSourceScene() {
  const root = new THREE.Group();
  ROLE_PAIRS.forEach(([sourceName], index) => {
    const geometry = new THREE.BoxGeometry(0.02 + (index * 0.002), 0.03, 0.04);
    geometry.deleteAttribute('normal');
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = sourceName;
    mesh.position.set(99, 99, 99);
    root.add(mesh);
  });
  return root;
}

function disposeTarget(group, material) {
  group.traverse((node) => node.geometry?.dispose?.());
  material.dispose();
}

describe('HomeCastle3D Combat GLB asset', () => {
  it('decodes the bundled payload without a network request', () => {
    const decode = vi.fn(() => 'glTF');
    const bytes = decodeHomeCastleCombatGlbPayload(' payload ', decode);
    expect(decode).toHaveBeenCalledWith('payload');
    expect(new TextDecoder().decode(bytes)).toBe('glTF');
  });

  it('hydrates named meshes while preserving Combat hierarchy transforms and materials', () => {
    const { group, material } = createTargetGroup();
    const source = createSourceScene();
    const mount = group.getObjectByName('home-castle-combat-mount');
    const mountPosition = mount.position.clone();
    const responsiveDriver = mount.onBeforeRender;
    const materialColor = material.color.getHex();

    expect(applyHomeCastleCombatAsset(group, source)).toBe(true);

    expect(mount.position.equals(mountPosition)).toBe(true);
    expect(mount.onBeforeRender).toBe(responsiveDriver);
    expect(mount.material).toBe(material);
    expect(material.color.getHex()).toBe(materialColor);
    expect(mount.geometry.getAttribute('normal')).toBeTruthy();
    expect(group.userData.homeCastleAsset).toBe(HOME_CASTLE_COMBAT_ASSET_ID);

    disposeHomeCastleCombatAssetScene(source);
    disposeTarget(group, material);
  });

  it('matches every role exposed by the production Combat heraldry group', () => {
    const props = createHomeCastleSecondaryDestinationProps();
    const source = createSourceScene();

    expect(applyHomeCastleCombatAsset(props.combat, source)).toBe(true);
    expect(props.combat.userData.homeCastleAsset).toBe(HOME_CASTLE_COMBAT_ASSET_ID);
    for (const [, targetName] of ROLE_PAIRS) {
      expect(props.combat.getObjectByName(targetName)?.geometry).toBeTruthy();
    }

    disposeHomeCastleCombatAssetScene(source);
    props.dispose();
  });

  it('rejects a partial authored asset before mutating any target geometry', () => {
    const { group, material } = createTargetGroup();
    const source = createSourceScene();
    const mount = group.getObjectByName('home-castle-combat-mount');
    const originalPositionAttribute = mount.geometry.getAttribute('position');
    source.remove(source.getObjectByName('combat_right_grip'));

    expect(applyHomeCastleCombatAsset(group, source)).toBe(false);
    expect(mount.geometry.getAttribute('position')).toBe(originalPositionAttribute);
    expect(group.userData.homeCastleAsset).toBeUndefined();

    disposeHomeCastleCombatAssetScene(source);
    disposeTarget(group, material);
  });

  it('disposes the parsed GLB scene after hydration', async () => {
    const { group, material } = createTargetGroup();
    const source = createSourceScene();
    const first = source.getObjectByName('combat_mount');
    const geometryDispose = vi.spyOn(first.geometry, 'dispose');
    const materialDispose = vi.spyOn(first.material, 'dispose');
    const loader = {
      parse: vi.fn((_buffer, _path, resolve) => resolve({ scene: source })),
    };
    const decode = vi.fn(() => 'gzip');
    const decompress = vi.fn(async () => new TextEncoder().encode('glTF').buffer);

    await expect(hydrateHomeCastleCombatHeraldry(
      group,
      { loader, payload: 'payload', decode, decompress },
    )).resolves.toBe(true);
    expect(decompress).toHaveBeenCalledTimes(1);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);

    disposeTarget(group, material);
  });
});
