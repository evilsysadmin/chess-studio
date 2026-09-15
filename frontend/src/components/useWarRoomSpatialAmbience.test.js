import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_WEATHER_IDLE_GAIN,
  WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN,
  warRoomAmbienceShouldPlay,
  warRoomSpatialMixForAtmosphere,
  warRoomWeatherGainForWindowHover,
  warRoomWeatherPointInHitbox,
} from './useWarRoomSpatialAmbience.js';

describe('War Room spatial ambience', () => {
  it('keeps weather almost silent until the player listens at the window', () => {
    const rainyNight = warRoomSpatialMixForAtmosphere({ weather: 'rain', phase: 'night' });
    const cloudyDay = warRoomSpatialMixForAtmosphere({ weather: 'cloudy', phase: 'day' });
    const sunnyDay = warRoomSpatialMixForAtmosphere({ weather: 'sunny', phase: 'day' });

    expect(rainyNight.fire).toBeGreaterThan(rainyNight.room);
    expect(rainyNight.rain).toBeGreaterThan(0);
    expect(rainyNight.rain).toBeLessThan(0.002);
    expect(cloudyDay.wind).toBeLessThan(0.001);
    expect(rainyNight.wind).toBeGreaterThan(sunnyDay.wind);
    expect(sunnyDay.rain).toBe(0);
    expect(sunnyDay.fire).toBeLessThan(0.02);
    expect(warRoomWeatherGainForWindowHover(false)).toBe(WAR_ROOM_WEATHER_IDLE_GAIN);
    expect(warRoomWeatherGainForWindowHover(true)).toBe(WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN);
    expect(WAR_ROOM_WEATHER_IDLE_GAIN).toBeLessThanOrEqual(0.05);
    expect(WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN).toBe(1);
    expect(WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN / WAR_ROOM_WEATHER_IDLE_GAIN).toBeGreaterThanOrEqual(20);
    expect(rainyNight.rareEventMinMs).toBeGreaterThanOrEqual(30_000);
    expect(rainyNight.rareEventMaxMs).toBeGreaterThan(rainyNight.rareEventMinMs);
  });

  it('uses the projected window hitbox instead of a fixed screen hot zone', () => {
    const rect = { left: 100, top: 50, width: 1000, height: 800 };
    const hitbox = '0.7200,0.1200,0.8800,0.6200';

    expect(warRoomWeatherPointInHitbox({ clientX: 900, clientY: 300, rect, hitbox })).toBe(true);
    expect(warRoomWeatherPointInHitbox({ clientX: 620, clientY: 300, rect, hitbox })).toBe(false);
    expect(warRoomWeatherPointInHitbox({ clientX: 900, clientY: 700, rect, hitbox })).toBe(false);
    expect(warRoomWeatherPointInHitbox({ clientX: 900, clientY: 300, rect, hitbox: '' })).toBe(false);
  });

  it('lets either global FX mute or the dedicated room mute silence only this ambience hook', () => {
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: false, ambienceMuted: false })).toBe(true);
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: true, ambienceMuted: false })).toBe(false);
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: false, ambienceMuted: true })).toBe(false);
    expect(warRoomAmbienceShouldPlay({ enabled: false, fxMuted: false, ambienceMuted: false })).toBe(false);
  });
});
