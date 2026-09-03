import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { WAR_ROOM_APPROVED_MOCK_VERSION } from './WarRoomApprovedMockContract.js';

const theme = { felt: 0x173943, glow: 0xc5963f };

function snapshotFurniture(root) {
  const names = [
    'war-room-side-console-left',
    'war-room-side-console-right',
    'war-room-teutonic-armor-left',
    'war-room-teutonic-armor-right',
    'war-room-sofa-left',
    'war-room-sofa-right',
  ];
  return Object.fromEntries(names.map((name) => {
    const object = root.getObjectByName(name);
    return [name, {
      position: object?.position?.toArray?.() || null,
      rotationY: object?.rotation?.y ?? null,
      offset: object?.userData?.warRoomOffsetFromWall ?? null,
      placement: object?.userData?.warRoomFurniturePlacement || object?.userData?.warRoomArmorPlacement || null,
    }];
  }));
}

function runRenderHooks(root) {
  const hooks = [];
  root.traverse((object) => {
    if (typeof object.onBeforeRender === 'function') hooks.push(object);
  });
  for (const object of hooks) object.onBeforeRender();
  return hooks.map((object) => object.name || object.type);
}

function dispose(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !textures.has(value)) {
          textures.add(value);
          value.dispose?.();
        }
      }
      material.dispose?.();
    }
  });
}

describe('War Room render-driver ownership', () => {
  it('mantiene el layout aprobado y jubila el driver estático del visor tras el primer paint', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    scene.add(room);

    const sofa = room.getObjectByName('war-room-sofa-left');
    const armor = room.getObjectByName('war-room-teutonic-armor-left');
    const table = room.getObjectByName('war-room-side-console-left');
    const visor = room.getObjectByName('war-room-armor-visor');

    expect(sofa).toBeTruthy();
    expect(armor).toBeTruthy();
    expect(table).toBeTruthy();
    expect(visor?.userData?.warRoomApprovedMockPostArchitectureScope).toBe('scene-root-v27');
    expect(visor?.userData?.warRoomApprovedMockPostArchitectureRetirement).toBe('one-shot-v27');

    const hookNames = runRenderHooks(scene);
    expect(hookNames).toContain('war-room-premium-painting-canvas');
    expect(hookNames).toContain('war-room-armor-visor');

    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.35, 5);
    expect(armor.userData.warRoomOffsetFromWall).toBeCloseTo(8.35, 5);
    expect(table.userData.warRoomOffsetFromWall).toBeCloseTo(3.3, 5);
    expect(sofa.position.z).toBeGreaterThan(armor.position.z + 3.5);
    expect(scene.userData.warRoomFurnitureLayoutOwner).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    expect(visor.userData.warRoomApprovedMockPostArchitectureCompleted).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);

    const retiredHook = visor.onBeforeRender;
    const afterFirstPaint = snapshotFurniture(scene);
    runRenderHooks(scene);
    expect(visor.onBeforeRender).toBe(retiredHook);
    expect(snapshotFurniture(scene)).toEqual(afterFirstPaint);

    dispose(scene);
  });

  it('no cambia el contrato coarse/mobile, donde el mock desktop no participa', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, true);
    scene.add(room);
    const sofa = room.getObjectByName('war-room-sofa-left');

    runRenderHooks(scene);

    expect(sofa.userData.warRoomFurniturePlacement).toBe('side-wall');
    expect(scene.userData.warRoomFurnitureLayoutOwner).toBeUndefined();
    dispose(scene);
  });
});