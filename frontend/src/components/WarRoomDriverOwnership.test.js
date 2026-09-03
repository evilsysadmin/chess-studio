import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { WAR_ROOM_APPROVED_MOCK_VERSION } from './WarRoomApprovedMockContract.js';

const theme = { felt: 0x173943, glow: 0xc5963f };

function snapshotFurniture(root) {
  const names = [
    'war-room-side-console-left',
    'war-room-side-console-right',
    'command-cabinet',
    'war-room-teutonic-command-chair',
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
      visible: object?.visible ?? null,
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

function legacyLayoutDrivers(root) {
  const drivers = [];
  root.traverse((object) => {
    if (object?.userData?.warRoomFinalRefinementDriver === true) drivers.push(object);
  });
  return drivers;
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
  it('mantiene el layout v28 y jubila por marker el refinador legacy antes de que pueda mover muebles', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, false);
    scene.add(room);

    const sofa = room.getObjectByName('war-room-sofa-left');
    const armor = room.getObjectByName('war-room-teutonic-armor-left');
    const table = room.getObjectByName('war-room-side-console-left');
    const desk = room.getObjectByName('command-cabinet');
    const chair = room.getObjectByName('war-room-teutonic-command-chair');
    const drivers = legacyLayoutDrivers(room);

    expect(sofa).toBeTruthy();
    expect(armor).toBeTruthy();
    expect(table).toBeTruthy();
    expect(desk).toBeTruthy();
    expect(chair).toBeTruthy();
    expect(drivers).toHaveLength(1);
    expect(drivers[0].userData.warRoomApprovedMockLayoutDriverRetired).toBeUndefined();

    const hookNames = runRenderHooks(scene);
    expect(hookNames).toContain('war-room-premium-painting-canvas');
    expect(hookNames).toContain(drivers[0].name || drivers[0].type);

    expect(drivers[0].userData.warRoomApprovedMockLayoutDriverRetired).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    expect(drivers[0].userData.warRoomApprovedMockLayoutDriverRetirement).toBe('marker-owned-one-shot-v28');
    expect(scene.userData.warRoomLegacyLayoutDriverRetirementVersion).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);
    expect(scene.userData.warRoomLegacyLayoutDriversRetired).toHaveLength(1);

    expect(table.visible).toBe(false);
    expect(desk.position.x).toBe(0);
    expect(desk.userData.warRoomOffsetFromWall).toBeCloseTo(1.45, 5);
    expect(chair.userData.warRoomOffsetFromWall).toBeCloseTo(0.55, 5);
    expect(sofa.userData.warRoomOffsetFromWall).toBeCloseTo(12.55, 5);
    expect(armor.userData.warRoomOffsetFromWall).toBeCloseTo(6.95, 5);
    expect(sofa.position.z).toBeGreaterThan(armor.position.z + 5.5);
    expect(scene.userData.warRoomApprovedMockArmorSofaGap).toBeCloseTo(5.6, 5);
    expect(scene.userData.warRoomFurnitureLayoutOwner).toBe(WAR_ROOM_APPROVED_MOCK_VERSION);

    const retiredHook = drivers[0].onBeforeRender;
    const afterFirstPaint = snapshotFurniture(scene);
    runRenderHooks(scene);
    expect(drivers[0].onBeforeRender).toBe(retiredHook);
    expect(snapshotFurniture(scene)).toEqual(afterFirstPaint);

    dispose(scene);
  });

  it('no activa el contrato desktop en coarse/mobile y conserva su driver legacy existente', () => {
    const scene = new THREE.Scene();
    const room = buildPremiumWarRoomLayer(theme, true, true);
    scene.add(room);
    const sofa = room.getObjectByName('war-room-sofa-left');
    const drivers = legacyLayoutDrivers(room);

    expect(drivers).toHaveLength(1);
    runRenderHooks(scene);

    expect(sofa.userData.warRoomFurniturePlacement).toBe('side-wall-centered-v3');
    expect(scene.userData.warRoomFurnitureLayoutOwner).toBeUndefined();
    expect(drivers[0].userData.warRoomApprovedMockLayoutDriverRetired).toBeUndefined();
    dispose(scene);
  });
});
