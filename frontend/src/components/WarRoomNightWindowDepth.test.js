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

describe('War Room weather window', () => {
  it('builds the approved right-hand arched rainy window and moves the hearth beside it', () => {
    const { group, fireplace } = roomWithFireplace();
    const wallZ = -7.6;
    const towardBoard = 1;

    expect(installWarRoomNightWindowDepth(group, { wallZ, towardBoard, weather: 'rain' })).toBeGreaterThan(8);
    expect(group.userData.warRoomNightWindowDepth).toBe(WAR_ROOM_NIGHT_WINDOW_VERSION);
    expect(group.userData.warRoomWeather).toBe('rain');
    expect(group.userData.warRoomWeatherWindowSide).toBe('right');
    expect(group.userData.warRoomNightWindowTextureCount).toBe(2);

    const window = group.getObjectByName('war-room-weather-window');
    const sky = group.getObjectByName('war-room-weather-window-sky');
    const precipitation = group.getObjectByName('war-room-weather-window-precipitation');
    const glass = group.getObjectByName('war-room-weather-window-glass');
    const arch = group.getObjectByName('war-room-weather-window-arch-trim');

    expect(window).toBeTruthy();
    expect(window.position.x).toBeCloseTo(5.12, 5);
    expect(window.userData).toMatchObject({ weather: 'rain', side: 'right' });
    expect(sky.geometry.type).toBe('ShapeGeometry');
    expect(sky.material.map.userData).toMatchObject({
      warRoomWeatherWindow: 'rain',
      resolution: [160, 128],
    });
    expect(precipitation.material.transparent).toBe(true);
    expect(precipitation.material.depthWrite).toBe(false);
    expect(precipitation.userData.warRoomWeatherAnimated).toBe('rain');
    expect(typeof precipitation.onBeforeRender).toBe('function');
    expect(glass.material.transparent).toBe(true);
    expect(arch.geometry.type).toBe('TorusGeometry');
    expect(window.children.some((child) => child.isLight)).toBe(false);

    expect(fireplace.position.x).toBeCloseTo(2.55, 5);
    expect(fireplace.userData.warRoomWeatherWindowLayout).toBe(WAR_ROOM_NIGHT_WINDOW_VERSION);
  });

  it('mirrors both the window and hearth when the board orientation flips', () => {
    const { group, fireplace } = roomWithFireplace(4.95, 6.67);
    installWarRoomNightWindowDepth(group, { wallZ: 7.6, towardBoard: -1, weather: 'snow' });

    const window = group.getObjectByName('war-room-weather-window');
    const sky = group.getObjectByName('war-room-weather-window-sky');
    expect(window.position.x).toBeCloseTo(-5.12, 5);
    expect(window.userData.side).toBe('left');
    expect(fireplace.position.x).toBeCloseTo(-2.55, 5);
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

  it('is idempotent and preserves the mobile/coarse scene budget', () => {
    const { group, fireplace } = roomWithFireplace();
    expect(installWarRoomNightWindowDepth(group, { wallZ: -7.6, towardBoard: 1 })).toBeGreaterThan(0);
    const childCount = group.children.length;
    expect(installWarRoomNightWindowDepth(group, { wallZ: -7.6, towardBoard: 1 })).toBe(0);
    expect(group.children).toHaveLength(childCount);

    const mobile = roomWithFireplace();
    const originalX = mobile.fireplace.position.x;
    expect(installWarRoomNightWindowDepth(mobile.group, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: true,
    })).toBe(0);
    expect(mobile.group.getObjectByName('war-room-weather-window')).toBeFalsy();
    expect(mobile.fireplace.position.x).toBe(originalX);
    expect(mobile.group.userData.warRoomNightWindowDepth).toBeUndefined();
  });
});
