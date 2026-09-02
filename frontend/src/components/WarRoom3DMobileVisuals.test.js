import { describe, expect, it } from 'vitest';
import { warRoomDecorProfile } from './WarRoom3DMobileVisuals.js';

function rgb(hex) {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

describe('War Room mobile decor profile', () => {
  it('lets local practical lights dominate broad desktop fills', () => {
    const desktop = warRoomDecorProfile(false);

    expect(desktop.wallSconce).toBeGreaterThan(desktop.moon * 3);
    expect(desktop.wallSconce).toBeGreaterThan(desktop.palette * 3);
    expect(desktop.bankerLamp).toBeGreaterThan(desktop.moon * 2);
    expect(desktop.crest).toBeGreaterThan(desktop.wallSconce);
  });

  it('recupera luz de pared en coarse pointer sin tocar exposición global', () => {
    const desktop = warRoomDecorProfile(false);
    const mobile = warRoomDecorProfile(true);

    expect(mobile.crest).toBeGreaterThan(7);
    expect(mobile.moon).toBeGreaterThan(desktop.moon);
    expect(mobile.palette).toBeGreaterThan(desktop.palette);
    expect(mobile.wallSconce).toBeGreaterThan(3.5);
  });

  it('levanta los tonos oscuros del decorado móvil', () => {
    const desktop = warRoomDecorProfile(false);
    const mobile = warRoomDecorProfile(true);

    expect(mobile.curtainLight).not.toBe(desktop.curtainLight);
    expect(mobile.curtainDark).not.toBe(desktop.curtainDark);
    expect(mobile.banner).not.toBe(desktop.banner);
  });

  it('evita que la paleta Android vuelva a burdeos casi negro', () => {
    const mobile = warRoomDecorProfile(true);

    for (const color of [mobile.curtainLight, mobile.curtainDark, mobile.banner]) {
      const { r, g, b } = rgb(color);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThanOrEqual(b);
      expect(Math.min(r, g, b)).toBeGreaterThan(45);
    }
  });
});
