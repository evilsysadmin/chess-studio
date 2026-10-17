import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyHomeBlenderPieceLift,
  prepareHomeBlenderRuntimeMaterials,
} from './HomeBlenderScene3D.jsx';

describe('Home Blender shared GLTF resource preparation', () => {
  it('updates a shared material and texture only once across many meshes', () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const meshes = Array.from({ length: 24 }, () => new THREE.Mesh(geometry, material));
    root.add(...meshes);
    const materialVersion = material.version;
    const textureVersion = texture.version;

    const stats = prepareHomeBlenderRuntimeMaterials(root, true, {
      capabilities: { getMaxAnisotropy: () => 16 },
    });

    expect(stats).toEqual({ meshCount: 24, materialCount: 1, textureCount: 1 });
    expect(material.version).toBe(materialVersion + 1);
    expect(texture.version).toBe(textureVersion + 1);
    expect(texture.anisotropy).toBe(8);
    expect(material.dithering).toBe(true);
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    geometry.dispose();
    material.dispose();
    texture.dispose();
  });

  it('keeps colour map quality on desktop while bounding auxiliary PBR sampling', () => {
    const color = new THREE.Texture();
    const normal = new THREE.Texture();
    const roughness = new THREE.Texture();
    const metalness = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      map: color, normalMap: normal, roughnessMap: roughness, metalnessMap: metalness,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const root = new THREE.Group();
    root.add(mesh);
    const gpu = { capabilities: { getMaxAnisotropy: () => 16 } };

    expect(prepareHomeBlenderRuntimeMaterials(root, true, gpu)).toEqual({
      meshCount: 1, materialCount: 1, textureCount: 4,
    });
    expect([color.anisotropy, normal.anisotropy, roughness.anisotropy, metalness.anisotropy])
      .toEqual([8, 2, 2, 2]);
    expect(prepareHomeBlenderRuntimeMaterials(root, false, gpu).textureCount).toBe(4);
    expect([color.anisotropy, normal.anisotropy, roughness.anisotropy, metalness.anisotropy])
      .toEqual([2, 2, 2, 2]);
    expect(mesh.castShadow).toBe(false);
    mesh.geometry.dispose();
    material.dispose();
    color.dispose(); normal.dispose(); roughness.dispose(); metalness.dispose();
  });

  it('does not invalidate already prepared shared GPU resources on a second pass', () => {
    const map = new THREE.Texture();
    const normal = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map, normalMap: normal });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const root = new THREE.Group();
    root.add(mesh);
    const gpu = { capabilities: { getMaxAnisotropy: () => 16 } };
    prepareHomeBlenderRuntimeMaterials(root, true, gpu);
    const versions = [map.version, normal.version, material.version];

    prepareHomeBlenderRuntimeMaterials(root, true, gpu);
    expect([map.version, normal.version, material.version]).toEqual(versions);

    prepareHomeBlenderRuntimeMaterials(root, false, gpu);
    expect(map.version).toBe(versions[0] + 1);
    expect(normal.version).toBe(versions[1]);
    expect(material.version).toBe(versions[2]);

    mesh.geometry.dispose();
    material.dispose();
    map.dispose();
    normal.dispose();
  });

  it('lifts shared light and dark chess-piece materials only once each', () => {
    const light = new THREE.MeshStandardMaterial({ name: 'piece_light' });
    const dark = new THREE.MeshStandardMaterial({ name: 'piece_dark' });
    const geometry = new THREE.BoxGeometry();
    const root = new THREE.Group();
    for (let index = 0; index < 16; index += 1) {
      root.add(new THREE.Mesh(geometry, index % 2 === 0 ? light : dark));
    }
    const lightVersion = light.version;
    const darkVersion = dark.version;

    expect(applyHomeBlenderPieceLift(root)).toBe(2);
    expect(light.version).toBe(lightVersion + 1);
    expect(dark.version).toBe(darkVersion + 1);
    expect(light.emissive.getHex()).not.toBe(dark.emissive.getHex());
    geometry.dispose();
    light.dispose();
    dark.dispose();
  });

  it('handles multi-material meshes and shared maps with shadows disabled', () => {
    const texture = new THREE.Texture();
    const matA = new THREE.MeshStandardMaterial({ map: texture });
    const matB = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry();
    const mesh = new THREE.Mesh(geometry, [matA, matB]);
    const root = new THREE.Group();
    root.add(mesh);
    const version = texture.version;

    const stats = prepareHomeBlenderRuntimeMaterials(root, false);
    expect(stats).toEqual({ meshCount: 1, materialCount: 2, textureCount: 1 });
    expect(texture.version).toBe(version + 1);
    expect(matA.dithering).toBe(true);
    expect(matB.dithering).toBe(true);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    geometry.dispose();
    matA.dispose();
    matB.dispose();
    texture.dispose();
  });
});