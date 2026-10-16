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