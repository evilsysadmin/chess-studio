import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  HOME_CASTLE_TOURNAMENT_ASSET_ID,
  applyHomeCastleTournamentAsset,
  decodeHomeCastleGlbPayload,
  disposeHomeCastleAssetScene,
  hydrateHomeCastleTournamentCup,
} from './HomeCastle3DTournamentAsset.js';

const SOURCE_NAMES = [
  'cup_base',
  'cup_plinth',
  'cup_stem',
  'cup_bowl',
  'cup_rim',
  'cup_handle_left',
  'cup_handle_right',
];

function createTargetGroup() {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-tournament';
  group.userData.destination = 'tournament';
  const dark = new THREE.MeshStandardMaterial({ color: 0x332211, emissiveIntensity: 0.08 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x665544, emissiveIntensity: 0.11 });

  SOURCE_NAMES.forEach((_name, index) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      index === 0 ? dark : brass,
    );
    if (index === 0) mesh.onBeforeRender = vi.fn();
    group.add(mesh);
  });

  return { group, dark, brass };
}

function createSourceScene() {
  const root = new THREE.Group();
  root.position.set(0.42, -0.31, 0.18);
  SOURCE_NAMES.forEach((name, index) => {
    const geometry = new THREE.BoxGeometry(0.02 + (index * 0.001), 0.03, 0.04);
    geometry.deleteAttribute('normal');
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = name;
    mesh.position.set(index * 0.001, index * 0.002, 0);
    root.add(mesh);
  });
  return root;
}

function disposeTarget(group, materials) {
  for (const mesh of group.children) mesh.geometry.dispose();
  for (const material of materials) material.dispose();
}

describe('HomeCastle3D tournament GLB asset', () => {
  it('decodes the bundled GLB payload without a network request', () => {
    const decode = vi.fn(() => 'glTF');
    const buffer = decodeHomeCastleGlbPayload(' payload ', decode);
    expect(decode).toHaveBeenCalledWith('payload');
    expect(new TextDecoder().decode(buffer)).toBe('glTF');
  });

  it('hydrates existing meshes in place and preserves runtime lighting/scale ownership', () => {
    const { group, dark, brass } = createTargetGroup();
    const source = createSourceScene();
    const originalMeshes = [...group.children];
    const responsiveDriver = originalMeshes[0].onBeforeRender;
    const brassColor = brass.color.getHex();

    expect(applyHomeCastleTournamentAsset(group, source)).toBe(true);

    expect(group.children).toEqual(originalMeshes);
    expect(group.children[0].onBeforeRender).toBe(responsiveDriver);
    expect(group.children[0].geometry.getAttribute('normal')).toBeTruthy();

    group.updateMatrixWorld(true);
    const hydratedBounds = new THREE.Box3().setFromObject(group);
    const hydratedCenter = hydratedBounds.getCenter(new THREE.Vector3());
    expect(hydratedBounds.min.y).toBeCloseTo(0, 6);
    expect(hydratedCenter.x).toBeCloseTo(0, 6);
    expect(hydratedCenter.z).toBeCloseTo(0, 6);

    expect(group.userData.homeCastleAsset).toBe(HOME_CASTLE_TOURNAMENT_ASSET_ID);
    expect(brass.color.getHex()).toBe(brassColor);
    expect(brass.emissiveIntensity).toBe(0.11);

    disposeHomeCastleAssetScene(source);
    disposeTarget(group, [dark, brass]);
  });

  it('refuses an incomplete asset before touching target meshes', () => {
    const { group, dark, brass } = createTargetGroup();
    const source = createSourceScene();
    const firstPosition = group.children[0].geometry.getAttribute('position');
    source.remove(source.getObjectByName('cup_rim'));

    expect(applyHomeCastleTournamentAsset(group, source)).toBe(false);
    expect(group.children[0].geometry.getAttribute('position')).toBe(firstPosition);
    expect(group.userData.homeCastleAsset).toBeUndefined();

    disposeHomeCastleAssetScene(source);
    disposeTarget(group, [dark, brass]);
  });

  it('disposes the temporary parsed scene after a successful hydrate', async () => {
    const { group, dark, brass } = createTargetGroup();
    const source = createSourceScene();
    const geometryDispose = vi.spyOn(source.children[0].geometry, 'dispose');
    const materialDispose = vi.spyOn(source.children[0].material, 'dispose');
    const loader = {
      parse: vi.fn((_buffer, _path, resolve) => resolve({ scene: source })),
    };
    const decode = vi.fn(() => 'glTF');

    await expect(hydrateHomeCastleTournamentCup(
      group,
      { loader, payload: 'payload', decode },
    )).resolves.toBe(true);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);

    disposeTarget(group, [dark, brass]);
  });
});
