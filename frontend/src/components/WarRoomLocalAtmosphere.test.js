import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_LOCAL_ATMOSPHERE_VERSION,
  WAR_ROOM_LOCAL_DAY_PHASES,
  WAR_ROOM_LOCAL_WEATHER_STATES,
  applyWarRoomLocalAtmosphere,
  resolveWarRoomDailyWeather,
  resolveWarRoomLocalAtmosphere,
  resolveWarRoomLocalDayPhase,
} from './WarRoomLocalAtmosphere.js';

function localDate(year, month, day, hour, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function maxPixel(data) {
  let max = 0;
  for (const value of data) max = Math.max(max, value);
  return max;
}

function fixture() {
  const root = new THREE.Group();
  const window = new THREE.Group();
  window.name = 'war-room-weather-window';
  window.userData.compact = false;

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
  );
  sky.name = 'war-room-weather-window-sky';
  sky.material.depthTest = true;

  const precipitation = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  precipitation.name = 'war-room-weather-window-precipitation';

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1 }),
  );
  glass.name = 'war-room-weather-window-glass';

  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), new THREE.MeshBasicMaterial());
  mullion.name = 'war-room-weather-window-mullion';

  window.add(sky, precipitation, glass, mullion);
  root.add(window);
  return { root, window, sky, precipitation, glass, mullion };
}

describe('War Room browser-local atmosphere', () => {
  it('uses browser-local clock buckets for night, dawn, day and dusk', () => {
    expect(WAR_ROOM_LOCAL_DAY_PHASES).toEqual(['night', 'dawn', 'day', 'dusk']);
    expect(resolveWarRoomLocalDayPhase(localDate(2026, 9, 10, 5, 45))).toBe('night');
    expect(resolveWarRoomLocalDayPhase(localDate(2026, 9, 10, 7, 15))).toBe('dawn');
    expect(resolveWarRoomLocalDayPhase(localDate(2026, 9, 10, 14, 15))).toBe('day');
    expect(resolveWarRoomLocalDayPhase(localDate(2026, 9, 10, 20, 0))).toBe('dusk');
    expect(resolveWarRoomLocalDayPhase(localDate(2026, 9, 10, 23, 0))).toBe('night');
  });

  it('keeps weather deterministic for the local calendar day and seasonally bounded', () => {
    const date = localDate(2026, 9, 10, 9);
    const first = resolveWarRoomDailyWeather(date);
    const second = resolveWarRoomDailyWeather(localDate(2026, 9, 10, 22));
    expect(WAR_ROOM_LOCAL_WEATHER_STATES).toContain(first);
    expect(second).toBe(first);

    for (let day = 1; day <= 31; day += 1) {
      expect(resolveWarRoomDailyWeather(localDate(2026, 7, day, 12))).not.toBe('snow');
    }
  });

  it('describes local atmosphere from local date and time without geolocation', () => {
    const atmosphere = resolveWarRoomLocalAtmosphere(localDate(2026, 9, 10, 14, 17));
    expect(atmosphere.phase).toBe('day');
    expect(WAR_ROOM_LOCAL_WEATHER_STATES).toContain(atmosphere.weather);
    expect(atmosphere.dateKey).toBe('2026-09-10');
    expect(atmosphere.hour).toBe(14);
    expect(atmosphere.minute).toBe(17);
    expect(atmosphere.key).toContain('2026-09-10:day:');
  });

  it('replaces the black side-window layers with a visible local sky and protects them from wall depth occlusion', () => {
    const { root, window, sky, precipitation, glass, mullion } = fixture();
    const date = localDate(2026, 9, 10, 14, 15);

    expect(applyWarRoomLocalAtmosphere(root, { date, force: true })).toBe(1);
    expect(window.userData.warRoomLocalAtmosphere).toBe(WAR_ROOM_LOCAL_ATMOSPHERE_VERSION);
    expect(window.userData.warRoomDayPhase).toBe('day');
    expect(WAR_ROOM_LOCAL_WEATHER_STATES).toContain(window.userData.weather);
    expect(root.userData.warRoomWeather).toBe(window.userData.weather);
    expect(root.userData.warRoomDayPhase).toBe('day');

    expect(sky.material.map).toBeTruthy();
    expect(sky.material.map.userData.warRoomDayPhase).toBe('day');
    expect(sky.material.map.userData.warRoomWeatherWindow).toBe(window.userData.weather);
    expect(maxPixel(sky.material.map.image.data)).toBeGreaterThan(80);
    expect(sky.material.depthTest).toBe(false);
    expect(sky.material.depthWrite).toBe(false);
    expect(sky.frustumCulled).toBe(false);
    expect(sky.renderOrder).toBeGreaterThanOrEqual(50);

    expect(precipitation.material.map.userData.warRoomDayPhase).toBe('day');
    expect(precipitation.material.depthTest).toBe(false);
    expect(glass.material.depthTest).toBe(false);
    expect(mullion.material.depthTest).toBe(false);
    expect(mullion.renderOrder).toBeGreaterThan(sky.renderOrder);
  });

  it('renders a readable night sky instead of turning the window into a black void', () => {
    const { root, sky } = fixture();
    applyWarRoomLocalAtmosphere(root, { date: localDate(2026, 12, 15, 23, 30), force: true });

    const pixels = sky.material.map.image.data;
    expect(sky.material.map.userData.warRoomDayPhase).toBe('night');
    expect(maxPixel(pixels)).toBeGreaterThan(40);
    expect(pixels.some((value) => value > 100)).toBe(true);
  });
});
