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

  it('omits the retired rectangular base window now owned by the premium layer', () => {
    const room = buildWarRoom(theme, true, false);
    const retiredBackdrop = room.children.find((object) => (
      object.isMesh
      && object.material?.color?.getHex?.() === 0x0a2334
      && object.geometry?.type === 'BoxGeometry'
      && object.geometry.parameters?.width === 4.3
    ));
    const retiredMoon = room.children.find((object) => (
      object.isMesh
      && object.material?.color?.getHex?.() === 0xb9d9f0
      && object.geometry?.type === 'SphereGeometry'
      && object.geometry.parameters?.radius === 0.28
    ));

    expect(room.userData.warRoomLegacyBaseWindowMeshesOmitted).toBe(13);
    expect(retiredBackdrop).toBeUndefined();
    expect(retiredMoon).toBeUndefined();
    dispose(room);
  });

  it('builds the static base-room geometry receive-only without a retirement pass', () => {
    const room = buildWarRoom(theme, true, false);
    const casters = [];
    room.traverse((object) => {
      if (object.isMesh && object.castShadow) casters.push(object);
    });

    expect(casters).toHaveLength(0);
    expect(room.userData.warRoomBaseStaticShadowCastersRetired).toBeUndefined();
    expect(room.userData.warRoomBaseStaticShadowCastersOmitted).toBe(true);
    expect(room.userData.warRoomBaseShadowMode).toBe('receive-only-at-source-v2');
    dispose(room);
  });
});
