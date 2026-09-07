import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWarRoom } from './Board3DScene.js';

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

describe('War Room base scene performance', () => {
  const theme = { felt: 0x173943, glow: 0xc5963f };

  it('keeps decorative candles visible without two extra forward point lights', () => {
    const room = buildWarRoom(theme, true, false);
    let pointLights = 0;
    let basicFlames = 0;
    room.traverse((object) => {
      if (object.isPointLight) pointLights += 1;
      if (object.isMesh && object.material?.isMeshBasicMaterial && object.material?.color?.getHex?.() === 0xffbd57) basicFlames += 1;
    });

    expect(pointLights).toBe(0);
    expect(basicFlames).toBe(2);
    expect(room.userData.warRoomCandleLighting).toBe('emissive-only-v1');
    dispose(room);
  });

  it('removes the static base-room geometry from the directional shadow caster pass', () => {
    const room = buildWarRoom(theme, true, false);
    const casters = [];
    room.traverse((object) => {
      if (object.isMesh && object.castShadow) casters.push(object);
    });

    expect(casters).toHaveLength(0);
    expect(room.userData.warRoomBaseStaticShadowCastersRetired).toBeGreaterThan(20);
    expect(room.userData.warRoomBaseShadowMode).toBe('receive-only-v1');
    dispose(room);
  });
});
