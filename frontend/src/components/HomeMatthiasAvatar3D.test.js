import { describe, expect, it } from 'vitest';
import { buildHomeMatthiasAvatar3D } from './HomeMatthiasAvatar3D.js';

function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

describe('HomeMatthiasAvatar3D', () => {
  it('uses Matthias canonical officer silhouette instead of the rival king piece', () => {
    const avatar = buildHomeMatthiasAvatar3D();
    try {
      expect(avatar.name).toBe('home-matthias-avatar');
      expect(avatar.userData.homeMatthiasAvatar).toBe(true);
      expect(avatar.getObjectByName('home-matthias-face')).toBeTruthy();
      expect(avatar.getObjectByName('home-matthias-officer-cap')).toBeTruthy();
      expect(avatar.getObjectByName('home-matthias-command-jacket')).toBeTruthy();
      expect(avatar.getObjectByName('home-matthias-arm-left')).toBeTruthy();
      expect(avatar.getObjectByName('home-matthias-arm-right')).toBeTruthy();

      const names = [];
      avatar.traverse((node) => names.push(node.name || ''));
      expect(names.join(' ')).not.toMatch(/matthias-rival-king|king-body|king-cross|crown-cross/i);
    } finally {
      disposeGroup(avatar);
    }
  });

  it('keeps the face rig addressable for Home idle motion and blinking', () => {
    const avatar = buildHomeMatthiasAvatar3D({ coarsePointer: true });
    try {
      expect(avatar.getObjectByName('home-matthias-head-rig')).toBeTruthy();
      expect(avatar.getObjectByName('home-matthias-eye-left')).toBeTruthy();
      expect(avatar.getObjectByName('home-matthias-eye-right')).toBeTruthy();
      expect(avatar.getObjectByName('home-matthias-body-rig')).toBeTruthy();
    } finally {
      disposeGroup(avatar);
    }
  });
});
