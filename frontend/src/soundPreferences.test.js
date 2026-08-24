import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAmbientVolume,
  isFxMuted,
  isMusicMuted,
  writeAmbientVolume,
  writeFxMuted,
  writeMusicMuted,
} from './soundPreferences.js';

describe('soundPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('mantiene compatibilidad con el mute global legacy y deja que el canal explícito mande', () => {
    expect(isMusicMuted()).toBe(false);
    expect(isFxMuted()).toBe(false);

    localStorage.setItem('chess-study-muted', '1');
    expect(isMusicMuted()).toBe(true);
    expect(isFxMuted()).toBe(true);

    localStorage.setItem('chess-study-music-muted', '0');
    expect(isMusicMuted()).toBe(false);
    expect(isFxMuted()).toBe(true);
  });

  it('escribe mutes separados y volumen normalizado', () => {
    writeMusicMuted(true);
    writeFxMuted(false);
    expect(isMusicMuted()).toBe(true);
    expect(isFxMuted()).toBe(false);

    expect(writeAmbientVolume(0.42)).toBeCloseTo(0.42, 8);
    expect(getAmbientVolume()).toBeCloseTo(0.42, 8);
    expect(writeAmbientVolume(9)).toBe(1);
    expect(getAmbientVolume()).toBe(1);
    expect(writeAmbientVolume(-3)).toBe(0);
    expect(getAmbientVolume()).toBe(0);
  });
});
