import { describe, expect, it } from 'vitest';
import {
  warRoomAmbienceShouldPlay,
  warRoomSpatialMixForAtmosphere,
} from './useWarRoomSpatialAmbience.js';

describe('War Room spatial ambience', () => {
  it('keeps the base room restrained and places weather outside the window', () => {
    const rainyNight = warRoomSpatialMixForAtmosphere({ weather: 'rain', phase: 'night' });
    const sunnyDay = warRoomSpatialMixForAtmosphere({ weather: 'sunny', phase: 'day' });

    expect(rainyNight.fire).toBeGreaterThan(rainyNight.room);
    expect(rainyNight.rain).toBeGreaterThan(0);
    expect(rainyNight.wind).toBeGreaterThan(sunnyDay.wind);
    expect(sunnyDay.rain).toBe(0);
    expect(sunnyDay.fire).toBeLessThan(0.02);
    expect(rainyNight.rareEventMinMs).toBeGreaterThanOrEqual(30_000);
    expect(rainyNight.rareEventMaxMs).toBeGreaterThan(rainyNight.rareEventMinMs);
  });

  it('lets either global FX mute or the dedicated room mute silence only this ambience hook', () => {
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: false, ambienceMuted: false })).toBe(true);
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: true, ambienceMuted: false })).toBe(false);
    expect(warRoomAmbienceShouldPlay({ enabled: true, fxMuted: false, ambienceMuted: true })).toBe(false);
    expect(warRoomAmbienceShouldPlay({ enabled: false, fxMuted: false, ambienceMuted: false })).toBe(false);
  });
});
