import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeObject } from './Board3DPieces.js';

function disposableTexture() {
  const texture = new THREE.Texture();
  vi.spyOn(texture, 'dispose');
  return texture;
}

function disposableGeometry() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  vi.spyOn(geometry, 'dispose');
  return geometry;
}

function disposableMaterial(options = {}) {
  const material = new THREE.MeshStandardMaterial(options);
  vi.spyOn(material, 'dispose');
  return material;
}

describe('Board3D lifecycle cleanup', () => {
  it('libera una sola vez recursos compartidos al desmontar una escena', () => {
    const root = new THREE.Group();
    const geometry = disposableGeometry();
    const map = disposableTexture();
    const normalMap = disposableTexture();
    const material = disposableMaterial({ map, normalMap });

    root.add(new THREE.Mesh(geometry, material));
    root.add(new THREE.Mesh(geometry, material));

    disposeObject(root);

    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
    expect(map.dispose).toHaveBeenCalledTimes(1);
    expect(normalMap.dispose).toHaveBeenCalledTimes(1);
  });

  it('libera arrays de materiales y deduplica texturas reutilizadas entre materiales', () => {
    const root = new THREE.Group();
    const geometry = disposableGeometry();
    const sharedMap = disposableTexture();
    const first = disposableMaterial({ map: sharedMap });
    const second = disposableMaterial({ map: sharedMap });
    const mesh = new THREE.Mesh(geometry, [first, second]);
    root.add(mesh);

    disposeObject(root);

    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(sharedMap.dispose).toHaveBeenCalledTimes(1);
  });

  it('tolera nodos sin geometría o material durante desmontajes parciales', () => {
    const root = new THREE.Group();
    root.add(new THREE.Group());
    expect(() => disposeObject(root)).not.toThrow();
  });
});
