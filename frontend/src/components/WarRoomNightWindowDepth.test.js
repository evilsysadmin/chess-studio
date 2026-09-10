import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_NIGHT_WINDOW_VERSION,
  WAR_ROOM_WEATHER_STATES,
  installWarRoomNightWindowDepth,
  normalizeWarRoomWeather,
} from './WarRoomNightWindowDepth.js';

function roomWithFireplace(x = -4.95, z = -6.67) {
  const group = new THREE.Group();
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(x, 0.34, z);
  group.add(fireplace);
  return { group, fireplace };
}

function addLegacyBaseWindow(group, { wallZ = -7.6, towardBoard = 1 } = {}) {
  const legacyX = towardBoard * 4.2;
  const addBox = (size, color, position) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshPhysicalMaterial({ color }),
    );
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };

  const legacy = [
    addBox([4.3, 3.1, 0.16], 0x0a2334, [legacyX, 3.3, wallZ + towardBoard * 0.27]),
    addBox([4.55, 0.15, 0.35], 0x2a160d, [legacyX, 1.72, wallZ + towardBoard * 0.34]),
    addBox([4.55, 0.15, 0.35], 0x2a160d, [legacyX, 4.88, wallZ + towardBoard * 0.34]),
    addBox([0.15, 3.3, 0.35], 0x2a160d, [legacyX - 2.23, 3.3, wallZ + towardBoard * 0.34]),
    addBox([0.15, 3.3, 0.35], 0x2a160d, [legacyX + 2.23, 3.3, wallZ + towardBoard * 0.34]),
    addBox([0.11, 3.05, 0.28], 0x1f2f3a, [legacyX, 3.3, wallZ + towardBoard * 0.38]),
    addBox([4.3, 0.1, 0.28], 0x1f2f3a, [legacyX, 3.3, wallZ + towardBoard * 0.38]),
  ];

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xb9d9f0 }),
  );
  moon.position.set(legacyX + 1.15, 4.05, wallZ + towardBoard * 0.43);
  group.add(moon);
  legacy.push(moon);

  for (const [offset, height] of [[-1.1, 1.2], [-0.6, 1.65], [0, 1.4], [0.55, 2.0], [1.05, 1.45]]) {
    legacy.push(addBox(
      [0.4, height, 0.24],
      0x09131b,
      [legacyX + offset, 1.72 + height / 2, wallZ + towardBoard * 0.46],
    ));
  }
  return legacy;
}

describe('War Room weather window', () => {
  it('builds the approved tall right-hand arched rainy window and moves the hearth beside it', () => {
    const { group, fireplace } = roomWithFireplace();
    const wallZ = -7.6;
    const towardBoard = 1;

    expect(installWarRoomNightWindowDepth(group, { wallZ, towardBoard, weather: 'rain' })).toBeGreaterThan(10);
    expect(group.userData.warRoomNightWindowDepth).toBe(WAR_ROOM_NIGHT_WINDOW_VERSION);
    expect(group.userData.warRoomWeather).toBe('rain');
    expect(group.userData.warRoomWeatherWindowSide).toBe('right');
    expect(group.userData.warRoomNightWindowTextureCount).toBe(2);
    expect(group.userData.warRoomWeatherWindowCompact).toBe(false);

    const window = group.getObjectByName('war-room-weather-window');
    const sky = group.getObjectByName('war-room-weather-window-sky');
    const precipitation = group.getObjectByName('war-room-weather-window-precipitation');
    const glass = group.getObjectByName('war-room-weather-window-glass');
    const arch = group.getObjectByName('war-room-weather-window-arch-trim');
    const stoneArch = group.getObjectByName('war-room-weather-window-stone-arch');
    const recess = group.getObjectByName('war-room-weather-window-recess');
    const transoms = window.children.filter((child) => child.name === 'war-room-weather-window-transom');

    expect(window).toBeTruthy();
    expect(window.position.x).toBeCloseTo(5.18, 5);
    expect(window.userData).toMatchObject({ weather: 'rain', side: 'right', compact: false });
    expect(sky.geometry.type).toBe('ShapeGeometry');
    expect(recess.geometry.type).toBe('ShapeGeometry');
    sky.geometry.computeBoundingBox();
    expect(sky.geometry.boundingBox.max.y - sky.geometry.boundingBox.min.y).toBeGreaterThan(3.9);
    expect(sky.geometry.boundingBox.max.x - sky.geometry.boundingBox.min.x).toBeLessThan(2.3);
    expect(sky.material.map.userData.warRoomWeatherWindow).toBe('rain');
    expect(precipitation.material.transparent).toBe(true);
    expect(precipitation.material.depthWrite).toBe(false);
    expect(precipitation.material.opacity).toBeGreaterThan(0.85);
    expect(precipitation.userData.warRoomWeatherAnimated).toBe('rain');
    expect(typeof precipitation.onBeforeRender).toBe('function');
    expect(glass.material.transparent).toBe(true);
    expect(arch.geometry.type).toBe('TorusGeometry');
    expect(stoneArch.geometry.type).toBe('TorusGeometry');
    expect(transoms).toHaveLength(2);
    expect(window.children.some((child) => child.isLight)).toBe(false);

    expect(fireplace.position.x).toBeCloseTo(2.48, 5);
    expect(fireplace.userData.warRoomWeatherWindowLayout).toBe(WAR_ROOM_NIGHT_WINDOW_VERSION);
  });

  it('retires the old rectangular base window instead of drawing the arch on top of it', () => {
    const { group } = roomWithFireplace();
    const legacy = addLegacyBaseWindow(group);

    installWarRoomNightWindowDepth(group, { wallZ: -7.6, towardBoard: 1, weather: 'rain' });

    expect(group.userData.warRoomLegacyWindowRetiredCount).toBe(legacy.length);
    for (const mesh of legacy) {
      expect(mesh.visible).toBe(false);
      expect(mesh.userData.warRoomLegacyWindowRetired).toBe(WAR_ROOM_NIGHT_WINDOW_VERSION);
    }
    expect(group.getObjectByName('war-room-weather-window').visible).toBe(true);
  });

  it('mirrors both the window and hearth when the board orientation flips', () => {
    const { group, fireplace } = roomWithFireplace(4.95, 6.67);
    installWarRoomNightWindowDepth(group, { wallZ: 7.6, towardBoard: -1, weather: 'snow' });

    const window = group.getObjectByName('war-room-weather-window');
    const sky = group.getObjectByName('war-room-weather-window-sky');
    expect(window.position.x).toBeCloseTo(-5.18, 5);
    expect(window.userData.side).toBe('left');
    expect(fireplace.position.x).toBeCloseTo(-2.48, 5);
    expect(sky.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(sky.position.z).toBeGreaterThan(6);
    expect(sky.position.z).toBeLessThan(7.6);
  });

  it('supports the four restrained weather looks without inventing an unsupported state', () => {
    expect(WAR_ROOM_WEATHER_STATES).toEqual(['rain', 'cloudy', 'snow', 'sunny']);
    expect(normalizeWarRoomWeather(' SNOW ')).toBe('snow');
    expect(normalizeWarRoomWeather('meteoritos')).toBe('rain');

    for (const weather of WAR_ROOM_WEATHER_STATES) {
      const { group } = roomWithFireplace();
      installWarRoomNightWindowDepth(group, { wallZ: -7.6, towardBoard: 1, weather });
      const sky = group.getObjectByName('war-room-weather-window-sky');
      const overlay = group.getObjectByName('war-room-weather-window-precipitation');
      expect(group.userData.warRoomWeather).toBe(weather);
      expect(sky.material.map.userData.warRoomWeatherWindow).toBe(weather);
      expect(overlay.material.map.userData.warRoomWeatherWindow).toBe(weather);
    }
  });

  it('renders the same canonical arched window on coarse/mobile with a lighter mesh profile', () => {
    const { group, fireplace } = roomWithFireplace();
    const legacy = addLegacyBaseWindow(group);

    expect(installWarRoomNightWindowDepth(group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: true,
      weather: 'rain',
    })).toBeGreaterThan(8);

    const window = group.getObjectByName('war-room-weather-window');
    const sky = group.getObjectByName('war-room-weather-window-sky');
    const precipitation = group.getObjectByName('war-room-weather-window-precipitation');

    expect(window.userData.compact).toBe(true);
    expect(group.userData.warRoomWeatherWindowCompact).toBe(true);
    expect(group.getObjectByName('war-room-weather-window-glass')).toBeFalsy();
    expect(group.getObjectByName('war-room-weather-window-stone-arch')).toBeTruthy();
    expect(sky.geometry.type).toBe('ShapeGeometry');
    expect(sky.material.map.userData.resolution).toEqual([112, 128]);
    expect(precipitation.material.map.userData.resolution).toEqual([112, 128]);
    expect(fireplace.position.x).toBeCloseTo(2.48, 5);
    expect(legacy.every((mesh) => mesh.visible === false)).toBe(true);
  });

  it('remains idempotent on desktop and mobile', () => {
    for (const coarsePointer of [false, true]) {
      const { group } = roomWithFireplace();
      expect(installWarRoomNightWindowDepth(group, {
        wallZ: -7.6,
        towardBoard: 1,
        coarsePointer,
      })).toBeGreaterThan(0);
      const childCount = group.children.length;
      expect(installWarRoomNightWindowDepth(group, {
        wallZ: -7.6,
        towardBoard: 1,
        coarsePointer,
      })).toBe(0);
      expect(group.children).toHaveLength(childCount);
    }
  });
});
