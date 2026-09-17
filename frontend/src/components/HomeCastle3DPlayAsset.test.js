import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  HOME_CASTLE_PLAY_ASSET_ID,
  applyHomeCastlePlayAsset,
  decodeHomeCastlePlayGlbPayload,
  disposeHomeCastlePlayAssetScene,
  hydrateHomeCastlePlayRook,
} from './HomeCastle3DPlayAsset.js';
import { createHomeCastleDestinationProps } from './HomeCastle3DProps.js';

const SOURCE_NAMES = [
  'play_base',
  'play_foot',
  'play_body',
  'play_collar',
  'play_crown',
  'play_merlon_0',
  'play_merlon_1',
  'play_merlon_2',
  'play_merlon_3',
];

function createTargetGroup() {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-play';
  group.userData.destination = 'play';
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xeeddcc,
    emissive: 0x332211,
    emissiveIntensity: 0.09,
  });
  const aged = new THREE.MeshStandardMaterial({
    color: 0x997755,
    emissive: 0x221100,
    emissiveIntensity: 0.04,
  });

  SOURCE_NAMES.forEach((_name, index) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      index === 0 || index === 3 ? aged : ivory,
    );
    mesh.position.set(index * 0.002, index * 0.003, -index * 0.001);
    if (index === 0) mesh.onBeforeRender = vi.fn();
    group.add(mesh);
  });

  return { group, ivory, aged };
}

function createSourceScene() {
  const root = new THREE.Group();
  SOURCE_NAMES.forEach((name, index) => {
    const geometry = new THREE.BoxGeometry(
      0.02 + (index * 0.001),
      0.03 + (index * 0.001),
      0.04,
    );
    geometry.deleteAttribute('normal');
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = name;
    mesh.position.set(99, 99, 99);
    root.add(mesh);
  });
  return root;
}

function disposeTarget(group, materials) {
  for (const mesh of group.children) mesh.geometry.dispose();
  for (const material of materials) material.dispose();
}

describe('HomeCastle3D Play GLB asset', () => {
  it('decodes the bundled GLB without a network request', () => {
    const decode = vi.fn(() => 'glTF');
    const buffer = decodeHomeCastlePlayGlbPayload(' payload ', decode);
    expect(decode).toHaveBeenCalledWith('payload');
    expect(new TextDecoder().decode(buffer)).toBe('glTF');
  });

  it('hydrates geometry in place while preserving transforms, materials and responsive driver', () => {
    const { group, ivory, aged } = createTargetGroup();
    const source = createSourceScene();
    const originalMeshes = [...group.children];
    const originalPositions = originalMeshes.map((mesh) => mesh.position.clone());
    const responsiveDriver = originalMeshes[0].onBeforeRender;
    const ivoryColor = ivory.color.getHex();

    expect(applyHomeCastlePlayAsset(group, source)).toBe(true);

    expect(group.children).toEqual(originalMeshes);
    expect(group.children[0].onBeforeRender).toBe(responsiveDriver);
    expect(ivory.color.getHex()).toBe(ivoryColor);
    expect(ivory.emissiveIntensity).toBe(0.09);
    originalPositions.forEach((position, index) => {
      expect(group.children[index].position.equals(position)).toBe(true);
      expect(group.children[index].geometry.getAttribute('normal')).toBeTruthy();
    });
    expect(group.userData.homeCastleAsset).toBe(HOME_CASTLE_PLAY_ASSET_ID);

    disposeHomeCastlePlayAssetScene(source);
    disposeTarget(group, [ivory, aged]);
  });

  it('matches the production Jugar rook contract', () => {
    const props = createHomeCastleDestinationProps();
    const source = createSourceScene();

    expect(props.play.children.filter((child) => child.isMesh)).toHaveLength(SOURCE_NAMES.length);
    expect(applyHomeCastlePlayAsset(props.play, source)).toBe(true);
    expect(props.play.userData.homeCastleAsset).toBe(HOME_CASTLE_PLAY_ASSET_ID);

    disposeHomeCastlePlayAssetScene(source);
    props.dispose();
  });

  it('rejects an incomplete authored asset before mutating target geometry', () => {
    const { group, ivory, aged } = createTargetGroup();
    const source = createSourceScene();
    const firstPositionAttribute = group.children[0].geometry.getAttribute('position');
    source.remove(source.getObjectByName('play_crown'));

    expect(applyHomeCastlePlayAsset(group, source)).toBe(false);
    expect(group.children[0].geometry.getAttribute('position')).toBe(firstPositionAttribute);
    expect(group.userData.homeCastleAsset).toBeUndefined();

    disposeHomeCastlePlayAssetScene(source);
    disposeTarget(group, [ivory, aged]);
  });

  it('disposes the parsed GLB scene after hydration', async () => {
    const { group, ivory, aged } = createTargetGroup();
    const source = createSourceScene();
    const first = source.getObjectByName('play_base');
    const geometryDispose = vi.spyOn(first.geometry, 'dispose');
    const materialDispose = vi.spyOn(first.material, 'dispose');
    const loader = {
      parse: vi.fn((_buffer, _path, resolve) => resolve({ scene: source })),
    };
    const decode = vi.fn(() => 'gzip');
    const decompressed = new TextEncoder().encode('glTF').buffer;
    const decompress = vi.fn(async () => decompressed);

    await expect(hydrateHomeCastlePlayRook(
      group,
      { loader, payload: 'payload', decode, decompress },
    )).resolves.toBe(true);
    expect(decompress).toHaveBeenCalledTimes(1);
    expect(loader.parse).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);

    disposeTarget(group, [ivory, aged]);
  });
});
