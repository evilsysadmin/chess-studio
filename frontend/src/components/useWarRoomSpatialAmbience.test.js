import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_WEATHER_IDLE_GAIN,
  WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN,
  WAR_ROOM_WEATHER_WINDOW_INSET_X,
  WAR_ROOM_WEATHER_WINDOW_INSET_Y,
  warRoomAmbienceShouldPlay,
  warRoomInteriorToneSpecs,
  warRoomSpatialMixForAtmosphere,
  warRoomWeatherGainForWindowHover,
  warRoomWeatherLoopSpecs,
  warRoomWeatherPointInHitbox,
  warRoomWeatherPointerOutShouldMute,
} from './useWarRoomSpatialAmbience.js';

describe('War Room spatial ambience', () => {
  it('keeps weather silent until the player listens at the window', () => {
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
    expect(WAR_ROOM_WEATHER_IDLE_GAIN).toBe(0);
    expect(WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN).toBe(1);
    expect(rainyNight.rareEventMinMs).toBeGreaterThanOrEqual(30_000);
    expect(rainyNight.rareEventMaxMs).toBeGreaterThan(rainyNight.rareEventMinMs);
  });

  it('keeps the permanent interior bed tonal instead of broadband-noise based', () => {
    const rainyNight = warRoomSpatialMixForAtmosphere({ weather: 'rain', phase: 'night' });
    const specs = warRoomInteriorToneSpecs(rainyNight);

    expect(specs).toHaveLength(2);
    expect(specs.map((spec) => spec.type)).toEqual(['triangle', 'sine']);
    expect(specs.every((spec) => spec.frequency < 120)).toBe(true);
    expect(specs.every((spec) => spec.gainValue > 0 && spec.gainValue < 0.001)).toBe(true);
    expect(specs.every((spec) => !('filterType' in spec))).toBe(true);
  });

  it('does not even materialize rain or wind sources outside window hover', () => {
    const rainyNight = warRoomSpatialMixForAtmosphere({ weather: 'rain', phase: 'night' });
    const idleSpecs = warRoomWeatherLoopSpecs(rainyNight, false);
    const hoverSpecs = warRoomWeatherLoopSpecs(rainyNight, true);

    expect(idleSpecs).toEqual([]);
    expect(hoverSpecs).toHaveLength(2);
    expect(hoverSpecs.map((spec) => spec.filterType)).toEqual(['highpass', 'bandpass']);
    expect(hoverSpecs.every((spec) => spec.gainValue > 0)).toBe(true);
  });

  it('requires a deliberate pointer hover in the inner pane, not merely over the 3D window assembly', () => {
    const rect = { left: 100, top: 50, width: 1000, height: 800 };
    const hitbox = '0.7200,0.1200,0.8800,0.6200';

    expect(WAR_ROOM_WEATHER_WINDOW_INSET_X).toBeGreaterThanOrEqual(0.25);
    expect(WAR_ROOM_WEATHER_WINDOW_INSET_Y).toBeGreaterThanOrEqual(0.1);
    expect(warRoomWeatherPointInHitbox({ clientX: 900, clientY: 300, rect, hitbox })).toBe(true);
    expect(warRoomWeatherPointInHitbox({ clientX: 860, clientY: 300, rect, hitbox })).toBe(false);
    expect(warRoomWeatherPointInHitbox({ clientX: 825, clientY: 300, rect, hitbox })).toBe(false);
    expect(warRoomWeatherPointInHitbox({ clientX: 620, clientY: 300, rect, hitbox })).toBe(false);
    expect(warRoomWeatherPointInHitbox({ clientX: 900, clientY: 700, rect, hitbox })).toBe(false);
    expect(warRoomWeatherPointInHitbox({ clientX: 900, clientY: 300, rect, hitbox: '' })).toBe(false);
    expect(warRoomWeatherPointInHitbox({
      clientX: 900,
      clientY: 300,
      rect,
      hitbox: '0.0500,0.0500,0.9500,0.9500',
    })).toBe(false);
  });

  it('kills weather as soon as the pointer leaves the WebGL canvas', () => {
    const canvas = {
      classList: {
        contains: (name) => name === 'board3d-main-canvas',
      },
    };
    const overlay = {
      classList: {
        contains: () => false,
      },
    };

    expect(warRoomWeatherPointerOutShouldMute({ target: canvas, relatedTarget: overlay })).toBe(true);
    expect(warRoomWeatherPointerOutShouldMute({ target: overlay, relatedTarget: canvas })).toBe(false);
    expect(warRoomWeatherPointerOutShouldMute({ target: overlay, relatedTarget: null })).toBe(true);
  });

  it('lets either global FX mute or the dedicated room mute silence only this ambience hook', () => {
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: false, ambienceMuted: false })).toBe(true);
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: true, ambienceMuted: false })).toBe(false);
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: false, ambienceMuted: true })).toBe(false);
    expect(warRoomAmbienceShouldPlay({ enabled: false, fxMuted: false, ambienceMuted: false })).toBe(false);
  });
});
